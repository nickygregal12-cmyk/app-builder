/**
 * The deterministic specialist pipeline rehearsal.
 *
 * The control plane already owns every primitive a specialist organisation
 * needs — pipeline selection, bounded context packets, capability projection,
 * signed attempt grants, independent review, typed rework, convergence and
 * budget stops — and each one is covered by its own unit test. What did not
 * exist until now is anything that *composes* them, so no registered pipeline
 * had ever been walked end to end and the ordering between the primitives was
 * an architectural claim rather than an executed one.
 *
 * This is that composition, and it is deliberately not an agent manager. It
 * owns no decision: every promotion, refusal, route and stop below is computed
 * by a control-plane function, and this module's job is to read durable state,
 * call those functions in order, and write what happened back down. Where it
 * would have to invent a judgement it stops instead.
 *
 * Three properties make it useful before a provider exists:
 *
 * - **No model, and no lane to one.** The specialist is a pure function in
 *   `rehearsal-specialist.mjs`; no attempt is given a model socket, so an
 *   attempt here could not reach a provider even if one were configured. The
 *   run refuses to start while the model-execution switch is on, because a
 *   rehearsal is the wrong thing to be running when real spending is armed.
 * - **Durable state is the only memory.** Every step re-reads the ledger and
 *   re-derives where the project is. Nothing is carried in a closure between
 *   steps, which is why "resume after process loss" is not a feature here: it
 *   is the only mode there is.
 * - **It stops honestly.** It reaches an unproduced prerequisite, a human gate,
 *   a rework role no stage owns, a budget, or a pipeline whose stages are done
 *   but whose gates have never run — and it says which, rather than reporting a
 *   completed build.
 */

import path from 'node:path';

import {
  appendEvent,
  createChangeSet,
  createCheckpoint,
  createEvent,
  createTask,
  evaluateLoopGuard,
  readEvents,
  stableHash,
  transitionTask,
} from '@app-builder/control-plane';
import { createAttemptPlan, reduceAttemptEvents, transitionAttempt, attemptEventPayload, ATTEMPT_EVENT_TYPES } from '@app-builder/control-plane/attempts';
import {
  assertMutationAllowed,
  buildRoleContextPacket,
  createReviewVerdict,
  evaluateConvergence,
  evaluateHandoff,
  selectPipeline,
} from '@app-builder/control-plane/roles';
import { assertStageAssignment, projectPipelineProgress, reworkStageForRole } from '@app-builder/control-plane/pipeline-state';

import { deterministicSpecialistResult, scriptedReviewOutcome } from './rehearsal-specialist.mjs';

/**
 * The rehearsal's own event types.
 *
 * They sit beside the attempt lifecycle types in the same ledger rather than in
 * a second one, for the same reason `attempts.js` gives: a separate ledger is a
 * second truth to reconcile.
 */
export const REHEARSAL_EVENT_TYPES = Object.freeze({
  task: 'pipeline.rehearsal.task',
  stageAttempted: 'pipeline.rehearsal.stage.attempted',
  artifactProduced: 'pipeline.rehearsal.artifact.produced',
  stagePromoted: 'pipeline.rehearsal.stage.promoted',
  review: 'pipeline.rehearsal.review',
  stageRework: 'pipeline.rehearsal.stage.rework',
  checkpoint: 'pipeline.rehearsal.checkpoint',
  humanApproval: 'pipeline.rehearsal.human-approval.simulated',
  attemptReconciled: 'pipeline.rehearsal.attempt.reconciled',
});

/** Every reason the rehearsal itself stops. A stop is always one of these. */
export const REHEARSAL_STOP_REASONS = Object.freeze([
  'pipeline-stages-complete',
  'stage-not-runnable',
  'human-approval-required',
  'stage-blocked',
  'rework-role-owns-no-stage',
  'stage-limit-reached',
  'iteration-budget-exhausted',
  'runtime-budget-exhausted',
  'cost-budget-exhausted',
  'token-budget-exhausted',
  'no-progress-limit-reached',
]);

/**
 * The rehearsal never signs a grant with anything that could authorise real
 * work. This value is committed on purpose: it is not a secret, and a reader
 * finding it in the repository should conclude exactly that.
 */
export const REHEARSAL_GRANT_SECRET = 'pipeline-rehearsal-grant-signing-key-not-a-production-secret';

function fixedClock(iso) {
  let tick = 0;
  const base = Date.parse(iso);
  return () => new Date(base + tick++ * 1000);
}

function reference(entry) {
  return { kind: entry.kind, ref: entry.id, hash: entry.hash ?? null };
}

/**
 * Rebuild everything the rehearsal knows from the ledger alone.
 *
 * A rework event invalidates the stage it routes back to *and every stage after
 * it*, because a specification that changed cannot leave the work downstream of
 * it promoted. That invalidation is the reason this is a fold rather than a
 * running counter: the durable answer to "which stages are done" changes
 * retroactively, and a counter would have to be told.
 */
export function foldRehearsalLedger(events, pipeline) {
  const order = new Map((pipeline.stages ?? []).map((stage, index) => [stage.id, index]));
  let task = null;
  const artifacts = [];
  const seenArtifactIds = new Set();
  let completed = [];
  const humanApprovals = new Set();
  const stageAttempts = [];
  const rework = [];
  const checkpoints = [];
  const verdicts = [];
  const handoffs = [];

  // How far the pipeline has ever reached. Reported rather than enforced: two
  // stages that rework each other forever keep promoting, so this stalls while
  // the no-progress counter below keeps resetting. That combination is a real
  // loop, and the guard that catches it is the iteration budget — which is the
  // honest one for it, because the attempts are individually productive and it
  // is their number that is the problem.
  let highWaterMark = 0;

  for (const event of events ?? []) {
    const payload = event.payload ?? {};
    switch (event.type) {
      case REHEARSAL_EVENT_TYPES.task:
        task = payload.task ?? task;
        break;
      case REHEARSAL_EVENT_TYPES.artifactProduced:
        for (const artifact of payload.artifacts ?? []) {
          if (seenArtifactIds.has(artifact.id)) continue;
          seenArtifactIds.add(artifact.id);
          artifacts.push(artifact);
        }
        break;
      case REHEARSAL_EVENT_TYPES.review:
        verdicts.push(payload.verdict);
        break;
      case REHEARSAL_EVENT_TYPES.stageAttempted:
        handoffs.push(payload.handoff);
        stageAttempts.push({
          stageId: payload.stageId,
          roleId: payload.roleId,
          promoted: payload.promoted === true,
          blockers: payload.blockers ?? [],
          attemptId: payload.attemptId ?? null,
          at: event.timestamp,
        });
        break;
      case REHEARSAL_EVENT_TYPES.stagePromoted:
        if (!completed.includes(payload.stageId)) completed.push(payload.stageId);
        highWaterMark = Math.max(highWaterMark, completed.length);
        break;
      case REHEARSAL_EVENT_TYPES.stageRework: {
        rework.push({ fromStageId: payload.fromStageId, toStageId: payload.toStageId, role: payload.role, reasons: payload.reasons ?? [] });
        const boundary = order.get(payload.toStageId);
        if (boundary !== undefined) completed = completed.filter((stageId) => (order.get(stageId) ?? -1) < boundary);
        break;
      }
      case REHEARSAL_EVENT_TYPES.humanApproval:
        humanApprovals.add(payload.stageId);
        break;
      case REHEARSAL_EVENT_TYPES.checkpoint:
        checkpoints.push(payload.checkpoint);
        break;
      default:
        break;
    }
  }


  // No progress means exactly what the name says: consecutive attempts that
  // promoted nothing. A stage whose reviewer keeps returning it to its own
  // author is the shape this stops.
  let consecutiveNoProgress = 0;
  for (let index = stageAttempts.length - 1; index >= 0; index -= 1) {
    if (stageAttempts[index].promoted) break;
    consecutiveNoProgress += 1;
  }

  const attempts = reduceAttemptEvents(events);
  return {
    task,
    artifacts,
    availableArtifactKinds: [...new Set(artifacts.map((entry) => entry.kind))],
    completedStageIds: completed.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)),
    humanApprovals,
    stageAttempts,
    attemptCount: stageAttempts.length,
    consecutiveNoProgress,
    highWaterMark,
    rework,
    verdicts,
    handoffs,
    checkpoints,
    latestCheckpoint: checkpoints.at(-1) ?? null,
    attempts,
    incompleteAttempts: attempts.filter((attempt) => attempt.incomplete),
    stageIterations: stageAttempts.reduce((counts, entry) => {
      counts[entry.stageId] = (counts[entry.stageId] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

function applies(entry, iteration) {
  if (!entry) return false;
  if (!Array.isArray(entry.iterations)) return true;
  return entry.iterations.includes(iteration);
}

/**
 * Build a rehearsal over a state root.
 *
 * Calling this twice against the same state root is exactly what a restart is:
 * the second engine holds nothing the first one knew and reads the same ledger.
 * That is why there is no `resume` here — resuming is constructing one again.
 */
export function createPipelineRehearsal(config) {
  const {
    projectId,
    projectType,
    stateRoot,
    registries,
    seedArtifacts = [],
    humanApprovals = [],
    reviewScript = {},
    faults = {},
    reviewerOverrides = {},
    roleOverrides = {},
    environment = 'development',
    image,
    budget = {},
    maxStages = null,
    clock = fixedClock('2026-08-27T09:00:00.000Z'),
    secret = REHEARSAL_GRANT_SECRET,
  } = config;

  const pipeline = selectPipeline(projectType, registries.pipelines.pipelines);
  const gates = registries.pipelines.gates;
  const roles = registries.roles.roles;
  const ledgerPath = path.join(stateRoot, projectId, 'events.jsonl');
  // The harness backstop sits deliberately above the iteration budget, so a
  // runaway loop is stopped by the control plane's budget with a named reason
  // rather than by this loop counter with none.
  const stageLimit = maxStages ?? pipeline.stages.length * 4;

  const now = () => clock().toISOString();

  async function record(type, payload, { taskId = null, actor = 'pipeline-rehearsal', usage = {} } = {}) {
    const event = createEvent({ type, projectId, taskId, actor, payload, usage }, now());
    await appendEvent(ledgerPath, event);
    return event;
  }

  async function state() {
    return foldRehearsalLedger(await readEvents(ledgerPath), pipeline);
  }

  /** Seed the ledger once: the durable task, and the artifacts the deterministic factory already holds. */
  async function ensureStarted() {
    const existing = await state();
    if (existing.task) return existing;
    let task = createTask({
      id: `rehearsal-${projectId}`,
      projectId,
      objective: `Deterministic rehearsal of the ${pipeline.id} specialist pipeline.`,
      acceptanceCriteria: [
        'every stage advances only on a promoted handoff computed by the control plane',
        'no provider call is made and no attempt is given a model lane',
      ],
      policyId: 'implementation',
      budget: {
        maxIterations: budget.maxIterations ?? pipeline.stages.length * 3,
        maxRuntimeMs: budget.maxRuntimeMs ?? 30 * 60 * 1000,
        maxCostGbp: budget.maxCostGbp ?? 0.01,
        maxTokens: budget.maxTokens ?? 1000,
        maxNoProgressAttempts: budget.maxNoProgressAttempts ?? 2,
      },
    }, now());
    task = transitionTask(task, 'running', { incrementAttempt: true }, now());
    await record(REHEARSAL_EVENT_TYPES.task, { task }, { taskId: task.id });
    if (seedArtifacts.length > 0) {
      await record(REHEARSAL_EVENT_TYPES.artifactProduced, {
        stageId: null,
        origin: 'deterministic-factory-seed',
        artifacts: seedArtifacts,
      }, { taskId: task.id, actor: 'factory' });
    }
    return state();
  }

  /**
   * Reconcile attempts the ledger says were alive and never says stopped.
   *
   * This is what a supervisor owes a restart. An attempt last seen `running`
   * is not a success to be counted and not a failure to be assumed silently: it
   * is recorded `lost`, which is a durable statement that the process died
   * holding it.
   */
  async function reconcile(current) {
    const orphans = current.incompleteAttempts.filter((attempt) => attempt.orphanCandidate);
    for (const orphan of orphans) {
      await record(ATTEMPT_EVENT_TYPES.exited, {
        ...orphan,
        state: 'exited',
        exitReason: 'lost',
        stopReason: 'session-lost-before-exit',
      }, { taskId: orphan.taskId });
      await record(REHEARSAL_EVENT_TYPES.attemptReconciled, {
        attemptId: orphan.attemptId,
        stageId: orphan.stageId ?? null,
        lastEventType: orphan.lastEventType,
        outcome: 'lost',
      }, { taskId: orphan.taskId });
    }
    return { reconciled: orphans.map((orphan) => orphan.attemptId) };
  }

  /** One stage. Reads durable state, runs at most one attempt, writes what happened back down. */
  async function step() {
    const current = await ensureStarted();
    const task = current.task;

    const guard = evaluateLoopGuard({
      task,
      attempt: current.attemptCount,
      elapsedMs: Math.max(0, Date.parse(now()) - Date.parse(task.createdAt)),
      spentGbp: 0,
      spentTokens: 0,
      consecutiveNoProgress: current.consecutiveNoProgress,
    });
    if (guard.stop) return { done: true, stop: { reason: guard.reason, kind: 'budget' }, state: current };

    const progress = projectPipelineProgress({
      pipeline,
      availableArtifactKinds: current.availableArtifactKinds,
      completedStageIds: current.completedStageIds,
    });
    if (progress.complete) return { done: true, stop: { reason: 'pipeline-stages-complete', kind: 'stages' }, progress, state: current };
    if (!progress.nextStage) {
      return {
        done: true,
        stop: { reason: 'stage-not-runnable', kind: 'prerequisite', blockers: progress.blockers },
        progress,
        state: current,
      };
    }

    const stage = progress.nextStage;
    const iteration = (current.stageIterations[stage.id] ?? 0) + 1;
    const dispatchedRoleId = roleOverrides[stage.id] ?? stage.role;
    // The creator half of the assignment rule. It throws, because dispatching
    // the wrong specialist is a supervisor bug rather than a stage outcome.
    assertStageAssignment({ stage, roleId: dispatchedRoleId });
    const role = roles[stage.role];
    const policy = registries.policies.policies[role.policyId];
    if (!policy) throw new Error(`Role ${role.id} names policy ${role.policyId}, which is not registered.`);

    // Bounded context: everything durably available is offered, and the role's
    // own `reads` decides what it actually gets.
    const contextPacket = buildRoleContextPacket({
      role,
      artifacts: current.artifacts,
      contextTokensEstimate: Math.min(role.contextCeilingTokens ?? 4000, 400 * Math.max(1, current.artifacts.length)),
    });

    const attemptId = `rehearsal-${stage.id}-i${iteration}`;
    const attemptRoot = path.resolve(stateRoot, projectId, 'attempts', attemptId);
    const plan = createAttemptPlan({
      attemptId,
      taskId: task.id,
      projectId,
      environment,
      role,
      policy,
      registry: registries.capabilities,
      image,
      workspacePath: path.join(attemptRoot, 'workspace'),
      scratchPath: path.join(attemptRoot, 'scratch'),
      grantPath: path.join(attemptRoot, 'grant'),
      brokerSocketPath: path.join(attemptRoot, 'broker.sock'),
      // Never supplied. An attempt with no model socket has nothing to reach.
      modelSocketPath: null,
      contextPacket,
      budget: { maxIterations: 1, maxCostGbp: 0, maxTokens: 0 },
      maxOperations: 16,
      ttlSeconds: 300,
    }, secret, clock());

    let attempt = plan.attempt;
    await record(ATTEMPT_EVENT_TYPES.created, attemptEventPayload(attempt, { stageId: stage.id }), { taskId: task.id, actor: role.id });
    attempt = transitionAttempt(attempt, 'starting', {}, now());
    await record(ATTEMPT_EVENT_TYPES.starting, attemptEventPayload(attempt, { stageId: stage.id }), { taskId: task.id, actor: role.id });
    attempt = transitionAttempt(attempt, 'running', { containerId: `stub:${attemptId}` }, now());
    await record(ATTEMPT_EVENT_TYPES.started, attemptEventPayload(attempt, { stageId: stage.id }), { taskId: task.id, actor: role.id });

    const faultEntry = faults[stage.id];
    const fault = applies(faultEntry, iteration) ? faultEntry.fault : null;

    // A lost session: the attempt is alive in the ledger and this process
    // stops writing. Nothing marks it finished, which is precisely the state a
    // restart has to be able to find and resolve.
    if (fault === 'session-lost') {
      return {
        done: true,
        stop: { reason: 'session-lost', kind: 'simulated-process-loss' },
        // Deliberately not a stage record: nothing about this attempt was
        // decided, so there is no promotion, review or checkpoint to report.
        lostStage: { stageId: stage.id, creatorRole: role.id, attemptId, iteration },
        progress,
        state: current,
      };
    }

    const result = deterministicSpecialistResult({ projectId, stage, role, contextPacket, iteration, fault });

    // Mutation scope is projected from the role, never asserted by the stub. A
    // stage that produces a ChangeSet declares it here against the same rule
    // that would refuse a reviewer trying to.
    let changeSet = null;
    if (stage.produces.includes('ChangeSet')) {
      const scopes = assertMutationAllowed(role, role.mutationScopes);
      changeSet = createChangeSet({
        taskId: task.id,
        objective: `Rehearsal ChangeSet for ${stage.id}.`,
        allowedFiles: scopes,
        acceptanceChecks: result.checks.map((check) => check.id),
        rollback: 'Discard the rehearsal state root; no repository file is touched.',
      }, now());
    }

    attempt = transitionAttempt(attempt, 'stopping', {}, now());
    await record(ATTEMPT_EVENT_TYPES.stopping, attemptEventPayload(attempt, { stageId: stage.id }), { taskId: task.id, actor: role.id });
    attempt = transitionAttempt(attempt, 'exited', { exitReason: 'completed', exitCode: 0 }, now());
    await record(ATTEMPT_EVENT_TYPES.exited, attemptEventPayload(attempt, { stageId: stage.id, resultHash: stableHash(result) }), { taskId: task.id, actor: role.id });
    attempt = transitionAttempt(attempt, 'disposed', {}, now());
    await record(ATTEMPT_EVENT_TYPES.disposed, attemptEventPayload(attempt, { stageId: stage.id }), { taskId: task.id, actor: role.id });

    // Review. The pipeline decides who reviews; nothing here chooses.
    let verdict = null;
    let review = null;
    let humanApproved = false;
    if (stage.reviewer === 'human') {
      humanApproved = humanApprovals.includes(stage.id);
      if (humanApproved && !current.humanApprovals.has(stage.id)) {
        await record(REHEARSAL_EVENT_TYPES.humanApproval, {
          stageId: stage.id,
          simulated: true,
          source: 'rehearsal-configuration',
          warning: 'A rehearsal-supplied stand-in for an owner decision. It is not an owner decision and closes no product gate.',
        }, { taskId: task.id, actor: 'rehearsal-configuration' });
      }
      review = { reviewerRole: 'human', simulated: true, approved: humanApproved };
    } else if (stage.reviewer) {
      const reviewerRole = reviewerOverrides[stage.id] ?? stage.reviewer;
      const scriptEntry = reviewScript[stage.id];
      const outcome = applies(scriptEntry, iteration)
        ? scriptedReviewOutcome({ stage, script: { [stage.id]: scriptEntry } })
        : scriptedReviewOutcome({ stage, script: {} });
      verdict = createReviewVerdict({
        projectId,
        taskId: task.id,
        stageId: stage.id,
        artifactKind: stage.produces[0],
        artifactId: result.artifacts[0]?.id ?? null,
        reviewerRole,
        authorRoles: [role.id],
        verdict: outcome.verdict,
        severity: outcome.severity ?? undefined,
        failingCriteria: outcome.failingCriteria,
        observations: outcome.observations,
        returnToRole: outcome.returnToRole,
        blockedReason: outcome.blockedReason ?? undefined,
        evidence: result.artifacts.map(reference),
      }, now());
      review = {
        reviewerRole,
        registeredReviewer: stage.reviewer,
        verdict: verdict.verdict,
        severity: verdict.severity,
        failingCriteria: verdict.failingCriteria,
        returnToRole: verdict.returnToRole,
        simulated: false,
      };
    }

    const handoff = evaluateHandoff({
      projectId,
      pipelineId: pipeline.id,
      stage,
      nextStageId: pipeline.stages[stageIndex(pipeline, stage.id) + 1]?.id ?? null,
      producedArtifacts: result.artifacts.map(reference),
      availableArtifactKinds: current.availableArtifactKinds,
      evidence: [{ kind: 'StubSpecialistResult', ref: attemptId, hash: stableHash(result) }],
      requiredEvidence: ['StubSpecialistResult'],
      deterministicChecks: result.checks,
      requiredChecks: stage.produces.map((kind) => `artifact-declared:${kind}`),
      verdict,
      humanApproval: humanApproved,
    }, now());

    // The verdict and the handoff go into the ledger whole rather than
    // summarised. They are the two records a later reader has to be able to
    // check against `schemas/review-verdict.schema.json` and
    // `schemas/stage-handoff.schema.json`, and a summary cannot be checked.
    if (verdict) {
      await record(REHEARSAL_EVENT_TYPES.review, { stageId: stage.id, verdict }, { taskId: task.id, actor: verdict.reviewerRole });
    }
    await record(REHEARSAL_EVENT_TYPES.stageAttempted, {
      handoff,
      stageId: stage.id,
      roleId: role.id,
      reviewerRole: review?.reviewerRole ?? null,
      attemptId,
      iteration,
      promoted: handoff.promoted,
      blockers: handoff.blockers,
      declaredFinished: result.declaresFinished,
      contextArtifactKinds: contextPacket.artifacts.map((entry) => entry.kind),
      withheldKinds: contextPacket.withheldKinds,
      capabilitiesGranted: attempt.capabilities.length,
      fault,
    }, { taskId: task.id, actor: role.id });

    const stageRecord = {
      index: stageIndex(pipeline, stage.id),
      stageId: stage.id,
      iteration,
      creatorRole: role.id,
      reviewerRole: review?.reviewerRole ?? null,
      registeredReviewer: stage.reviewer,
      context: {
        supplied: contextPacket.artifacts.map((entry) => entry.kind),
        withheld: contextPacket.withheldKinds,
        skills: contextPacket.skills,
        contextCeilingTokens: contextPacket.contextCeilingTokens,
        contextTokensEstimate: contextPacket.contextTokensEstimate,
        overCeiling: contextPacket.overCeiling,
      },
      capability: {
        policyId: role.policyId,
        granted: attempt.capabilities,
        withheldCount: plan.projection.withheld.length,
        mutationScopes: attempt.mutationScopes,
        networkProfile: attempt.networkProfile,
        modelLane: attempt.modelLane,
      },
      attempt: {
        attemptId,
        exitReason: attempt.exitReason,
        grantFingerprint: attempt.grant.fingerprint,
        contextHash: attempt.context?.hash ?? null,
        image: attempt.image.pinned,
      },
      result: {
        declaresFinished: result.declaresFinished,
        artifacts: result.artifacts.map((entry) => ({ kind: entry.kind, id: entry.id })),
        checks: result.checks,
        fault,
      },
      changeSet: changeSet ? { id: changeSet.id, allowedFiles: changeSet.allowedFiles } : null,
      review,
      handoff: {
        id: handoff.id,
        promoted: handoff.promoted,
        approvedBy: handoff.approvedBy,
        nextStageId: handoff.nextStageId,
        blockers: handoff.blockers,
      },
      rework: null,
      checkpoint: null,
    };

    if (handoff.promoted) {
      await record(REHEARSAL_EVENT_TYPES.artifactProduced, { stageId: stage.id, origin: 'deterministic-stub', artifacts: result.artifacts }, { taskId: task.id, actor: role.id });
      await record(REHEARSAL_EVENT_TYPES.stagePromoted, {
        stageId: stage.id,
        approvedBy: handoff.approvedBy,
        handoffId: handoff.id,
        producedKinds: result.artifacts.map((entry) => entry.kind),
      }, { taskId: task.id, actor: role.id });
      const checkpoint = createCheckpoint({
        projectId,
        taskId: task.id,
        repoRef: `rehearsal/${pipeline.id}`,
        changeSetId: changeSet?.id ?? null,
        summary: `Stage ${stage.id} promoted by ${handoff.approvedBy ?? 'no reviewer required'}.`,
        artifacts: result.artifacts.map((entry) => entry.id),
        nextAction: handoff.nextStageId ? `run stage ${handoff.nextStageId}` : 'evaluate convergence',
      }, now());
      await record(REHEARSAL_EVENT_TYPES.checkpoint, { checkpoint }, { taskId: task.id, actor: role.id });
      stageRecord.checkpoint = { id: checkpoint.id, nextAction: checkpoint.nextAction };
      return { done: false, stage: stageRecord, progress };
    }

    // Not promoted. Route it, or stop honestly.
    if (verdict?.verdict === 'rework-required') {
      const routed = reworkStageForRole({ pipeline, roleId: verdict.returnToRole, beforeStageId: stage.id });
      if (!routed.stage) {
        return { done: true, stop: { reason: 'rework-role-owns-no-stage', kind: 'unroutable', detail: routed.reason }, stage: stageRecord, progress };
      }
      await record(REHEARSAL_EVENT_TYPES.stageRework, {
        fromStageId: stage.id,
        toStageId: routed.stage.id,
        role: verdict.returnToRole,
        severity: verdict.severity,
        reasons: verdict.failingCriteria,
        verdictId: verdict.id,
      }, { taskId: task.id, actor: verdict.reviewerRole });
      stageRecord.rework = { toStageId: routed.stage.id, role: verdict.returnToRole, severity: verdict.severity, reasons: verdict.failingCriteria };
      return { done: false, stage: stageRecord, progress };
    }

    if (handoff.blockers.includes('human-approval-required')) {
      return { done: true, stop: { reason: 'human-approval-required', kind: 'human', detail: stage.id }, stage: stageRecord, progress };
    }
    return { done: true, stop: { reason: 'stage-blocked', kind: 'blocked', detail: handoff.blockers }, stage: stageRecord, progress };
  }

  /** Walk until something stops it. `maxStages` is a harness guard, not a budget. */
  async function run() {
    const stages = [];
    let stop = null;
    for (let index = 0; index < stageLimit; index += 1) {
      const outcome = await step();
      if (outcome.stage) stages.push(outcome.stage);
      if (outcome.done) { stop = outcome.stop; break; }
    }
    if (!stop) stop = { reason: 'stage-limit-reached', kind: 'harness' };
    const current = await state();
    return { stages, stop, state: current };
  }

  /**
   * The convergence question, answered honestly.
   *
   * The rehearsal produced artifact identities, not a built site, so no gate
   * has run. `evaluateConvergence` refuses to call that converged, and that
   * refusal is the point: "every stage promoted" is not "the project is
   * finished", and the two are easy to conflate in anything that reports only
   * the first.
   */
  async function convergence(gateResults = {}) {
    const current = await state();
    return evaluateConvergence({
      projectId,
      pipeline,
      gates,
      results: gateResults,
      iteration: current.attemptCount,
    }, now());
  }

  /**
   * Close the durable task.
   *
   * Always `blocked`, never `succeeded`. Every way this rehearsal can stop
   * leaves something a person, a provider or an unrun gate still owes, and a
   * task record that said `succeeded` would be the first place a later reader
   * mistook a rehearsal for a build.
   */
  async function finish(stopReason) {
    const current = await state();
    const task = transitionTask(current.task, 'blocked', { stopReason, latestCheckpointId: current.latestCheckpoint?.id ?? null }, now());
    await record(REHEARSAL_EVENT_TYPES.task, { task }, { taskId: task.id });
    return task;
  }

  return { pipeline, gates, ledgerPath, projectId, state, step, run, convergence, reconcile, finish, record };
}

function stageIndex(pipeline, stageId) {
  return pipeline.stages.findIndex((stage) => stage.id === stageId);
}
