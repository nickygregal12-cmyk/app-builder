#!/usr/bin/env node
/**
 * The deterministic specialist pipeline rehearsal.
 *
 *   node tooling/pipeline-rehearsal.mjs [--project-type marketing-site] [--json]
 *
 * Every specialist primitive in the control plane has a unit test. None of them
 * had ever been run in sequence against a registered pipeline, so "intake ->
 * research -> ... -> release, with independent review at every stage" was an
 * architecture rather than something that had happened. This runs it.
 *
 * It runs the real registries, the real role/policy/capability projection, the
 * real signed grant, the real handoff and convergence logic and the real
 * budget guards. The only stand-in is the specialist itself, which is a pure
 * function producing artifact identities.
 *
 * What this is **not**:
 *
 * - not a build. No project is generated, nothing is rendered, no deterministic
 *   quality gate runs, and the convergence report at the end says so.
 * - not a runtime proof. Nothing is sandboxed here; the attempt lifecycle
 *   against a real isolated process is `npm run runtime:canary`, and the hosted
 *   boundary is `ops/hetzner/verify-agent-boundary.sh`.
 * - not product evidence. It closes no product gate and promotes nothing. In
 *   particular it has nothing to say about the outstanding Phase 4D visual
 *   verdict, which needs a reviewer who did not produce the work.
 *
 * The scenarios below are chosen so that a green run is not a straight-through
 * happy path: most of them are refusals, and the walk that does complete every
 * stage still ends by refusing to call the pipeline converged.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createPipelineRehearsal } from './lib/pipeline-rehearsal.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SPECIALIST_MODULE = path.join(REPOSITORY_ROOT, 'tooling/lib/rehearsal-specialist.mjs');

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));
}

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 || index === process.argv.length - 1 ? fallback : process.argv[index + 1];
}

/**
 * The rehearsal's execution identity, content-addressed.
 *
 * `createAttemptPlan` refuses an unpinned image, and satisfying it with a
 * placeholder would make the durable record lie about what ran. What actually
 * ran is this module, so the digest is of this module — the same trick the
 * runtime canary uses for its worker, and for the same reason.
 *
 * It is emphatically not `task-baseline`. That image has no digest until an
 * operator builds it on the host, and nothing here invents one.
 */
export function rehearsalImage() {
  const digest = createHash('sha256').update(fs.readFileSync(SPECIALIST_MODULE)).digest('hex');
  return {
    id: 'rehearsal-deterministic-stub',
    reference: 'local-module/app-builder-rehearsal-specialist',
    digest: `sha256:${digest}`,
  };
}

/**
 * What the deterministic factory already holds when a pipeline starts.
 *
 * Taken from the registry's own `deterministic` flag rather than chosen here,
 * so the rehearsal's starting position is the one the prerequisite-ordering
 * rule in `tooling/agent-architecture.test.mjs` already assumes.
 */
export function deterministicSeedArtifacts(roleRegistry) {
  return Object.entries(roleRegistry.artifacts)
    .filter(([, artifact]) => artifact.deterministic)
    .map(([kind]) => ({ kind, id: `seed-${kind}`, producedBy: 'factory', origin: 'deterministic-factory' }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
}

export function loadRegistries(read = readJson) {
  return {
    roles: read('config/agent-roles.json'),
    pipelines: read('config/agent-pipelines.json'),
    policies: read('config/agent-policies.json'),
    capabilities: read('config/agent-capabilities.json'),
  };
}

/**
 * The scenario set.
 *
 * Six of the eight end in a refusal, and the two that walk furthest end in a
 * human gate and an unrun-gate convergence respectively. That balance is the
 * design: a rehearsal whose only scenario completes is a demonstration, not
 * evidence.
 */
export function rehearsalScenarios({ seedArtifacts }) {
  const supervised = { humanApprovals: ['intake'] };
  return [
    {
      id: 'human-gate',
      title: 'A stage whose reviewer is a person does not advance without one',
      expect: 'human-approval-required',
      config: {},
    },
    {
      id: 'missing-prerequisite',
      title: 'A stage refuses to run when an input it declares does not exist',
      expect: 'stage-not-runnable',
      config: { ...supervised, seedArtifacts: seedArtifacts.filter((entry) => entry.kind !== 'KnowledgePack') },
    },
    {
      id: 'full-walk',
      title: 'Every registered stage, each in its own attempt, each promoted on evidence',
      expect: 'pipeline-stages-complete',
      convergence: true,
      config: supervised,
    },
    {
      id: 'independent-review-rework',
      title: 'A failing independent verdict routes backwards to the role that owns the fix',
      expect: 'pipeline-stages-complete',
      config: {
        ...supervised,
        reviewScript: {
          'art-direction': {
            verdict: 'rework-required',
            severity: 'major',
            failingCriteria: ['correct, but generic and low-distinctiveness'],
            returnToRole: 'brand-research',
            iterations: [1],
          },
        },
      },
    },
    {
      id: 'wrong-reviewer',
      title: 'A verdict from a reviewer the pipeline did not register promotes nothing',
      expect: 'stage-blocked',
      config: { ...supervised, reviewerOverrides: { research: 'ux-critic' } },
    },
    {
      id: 'undeclared-artifact',
      title: 'A specialist writing an artifact outside its stage scope is refused',
      expect: 'stage-blocked',
      config: { ...supervised, faults: { research: { fault: 'undeclared-artifact' } } },
    },
    {
      id: 'session-loss-and-resume',
      title: 'A session lost mid-attempt is reconciled and the pipeline resumes from durable state',
      expect: 'pipeline-stages-complete',
      resumeAfterLoss: true,
      config: { ...supervised, faults: { 'product-spec': { fault: 'session-lost', iterations: [1] } } },
    },
    {
      id: 'no-progress',
      title: 'A reviewer that keeps returning work to its author stops on the no-progress budget',
      expect: 'no-progress-limit-reached',
      config: {
        ...supervised,
        reviewScript: {
          research: {
            verdict: 'rework-required',
            severity: 'major',
            failingCriteria: ['claims are unsourced'],
            returnToRole: 'research-agent',
          },
        },
      },
    },
  ];
}

async function runScenario(scenario, base) {
  const stateRoot = path.join(base.stateRoot, scenario.id);
  fs.rmSync(stateRoot, { recursive: true, force: true });
  const config = { ...base, ...scenario.config, stateRoot };
  const rehearsal = createPipelineRehearsal(config);

  const first = await rehearsal.run();
  const record = {
    id: scenario.id,
    title: scenario.title,
    expectedStop: scenario.expect,
    stages: first.stages,
    resume: null,
    convergence: null,
  };
  let final = first;

  if (scenario.resumeAfterLoss) {
    // A second engine over the same state root, holding nothing the first knew.
    const restarted = createPipelineRehearsal({ ...config, faults: {} });
    const beforeReconcile = await restarted.state();
    const reconciled = await restarted.reconcile(beforeReconcile);
    const afterReconcile = await restarted.state();
    final = await restarted.run();
    record.resume = {
      lostAt: first.stop,
      lostAttempt: first.lostStage ?? null,
      reconstructedFrom: restarted.ledgerPath.replace(REPOSITORY_ROOT, ''),
      orphanAttemptsFound: beforeReconcile.incompleteAttempts.map((attempt) => attempt.attemptId),
      reconciledAs: 'lost',
      reconciledAttempts: reconciled.reconciled,
      incompleteAfterReconcile: afterReconcile.incompleteAttempts.length,
      stagesRecovered: afterReconcile.completedStageIds,
      resumedFromCheckpoint: afterReconcile.latestCheckpoint?.nextAction ?? null,
      stagesAfterResume: final.stages.map((entry) => entry.stageId),
    };
    record.stages = [...first.stages, ...final.stages];
  }

  const state = final.state;
  record.stop = final.stop;
  record.stopMatchesExpectation = final.stop.reason === scenario.expect;
  record.completedStageIds = state.completedStageIds;
  record.attemptCount = state.attemptCount;
  record.highWaterMark = state.highWaterMark;
  record.checkpoints = state.checkpoints.length;
  record.incompleteAttempts = state.incompleteAttempts.map((attempt) => attempt.attemptId);
  record.durableLedger = rehearsal.ledgerPath.replace(REPOSITORY_ROOT, '');

  const task = await rehearsal.finish(final.stop.reason);
  record.task = { id: task.id, state: task.state, stopReason: task.stopReason, latestCheckpointId: task.latestCheckpointId };

  if (scenario.convergence) {
    const report = await rehearsal.convergence();
    record.convergence = {
      converged: report.converged,
      stopReason: report.stopReason,
      totalGates: report.gates.length,
      gatesRun: report.gates.filter((gate) => gate.status !== 'not-run').length,
      gatesNotRun: report.gates.filter((gate) => gate.status === 'not-run').map((gate) => gate.id),
    };
  }

  return record;
}

/**
 * @param {object} options
 * @param {Function} [options.read] registry reader, injectable so the refusals
 *   below can be tested against a registry state the repository does not commit.
 */
export async function runRehearsal({ projectType = 'marketing-site', stateRoot, read = readJson } = {}) {
  const registries = loadRegistries(read);
  const modelExecution = read('config/model-execution.json');
  if (modelExecution.enabled === true) {
    throw new Error(
      'config/model-execution.json is enabled. The rehearsal is the no-model lane and refuses to run while real spending is armed; '
      + 'use npm run runtime:model-canary for the model lane instead.',
    );
  }
  const taskImages = read('config/task-images.json');
  const seedArtifacts = deterministicSeedArtifacts(registries.roles);
  const image = rehearsalImage();

  const base = {
    projectId: `rehearsal-${projectType}`,
    projectType,
    stateRoot: stateRoot ?? path.join(REPOSITORY_ROOT, '.app-builder/pipeline-rehearsal'),
    registries,
    seedArtifacts,
    image,
  };

  const scenarios = [];
  for (const scenario of rehearsalScenarios({ seedArtifacts })) {
    scenarios.push(await runScenario(scenario, base));
  }

  const pipeline = registries.pipelines.pipelines[projectType];
  const allStages = scenarios.flatMap((scenario) => scenario.stages);
  const rolesExercised = [...new Set(allStages.map((entry) => entry.creatorRole))].sort();
  const reviewersExercised = [...new Set(allStages.map((entry) => entry.reviewerRole).filter(Boolean))].sort();

  // The invariants that make this run safe to have executed at all. They are
  // asserted against what the attempts actually recorded, not against the
  // configuration that was supposed to produce them.
  const modelLanes = allStages.filter((entry) => entry.capability.modelLane !== null);
  const invariants = [
    {
      id: 'no-model-lane-on-any-attempt',
      ok: modelLanes.length === 0,
      detail: modelLanes.length === 0
        ? `${allStages.length} attempt(s), none given a model socket`
        : `${modelLanes.length} attempt(s) carried a model lane`,
    },
    {
      id: 'model-execution-switch-off',
      ok: modelExecution.enabled === false,
      detail: `config/model-execution.json enabled=${modelExecution.enabled}`,
    },
    {
      id: 'every-scenario-stopped-as-expected',
      ok: scenarios.every((scenario) => scenario.stopMatchesExpectation),
      detail: scenarios.filter((scenario) => !scenario.stopMatchesExpectation).map((scenario) => `${scenario.id}: ${scenario.stop.reason}`).join('; ') || 'all',
    },
    {
      id: 'no-scenario-reports-convergence',
      ok: scenarios.every((scenario) => scenario.convergence === null || scenario.convergence.converged === false),
      detail: 'a rehearsal runs no gate, so no rehearsal may report a converged project',
    },
    {
      id: 'no-durable-task-succeeded',
      ok: scenarios.every((scenario) => scenario.task.state !== 'succeeded'),
      detail: 'every rehearsal task closes blocked with a named stop reason',
    },
    {
      id: 'context-was-bounded-at-every-stage',
      ok: allStages.every((entry) => entry.context.withheld.length > 0 && !entry.context.overCeiling),
      detail: `${allStages.length} packet(s); withheld ${Math.min(...allStages.map((entry) => entry.context.withheld.length))}-${Math.max(...allStages.map((entry) => entry.context.withheld.length))} artifact kinds each`,
    },
  ];

  return {
    schemaVersion: 1,
    kind: 'DeterministicPipelineRehearsal',
    generatedAt: new Date().toISOString(),
    executionMode: 'deterministic-stub',
    productEvidence: false,
    notEvidenceFor: [
      'phase-4d-visual-review-verdict',
      'phase-4-2a-static-visual-review',
      'professional-output-independent-verdict',
      'runtime-readiness: no role is promoted by this run',
      'hosted agent-boundary attestation',
    ],
    provider: {
      modelExecutionEnabled: modelExecution.enabled,
      providerCalls: 0,
      attemptsWithModelLane: modelLanes.length,
      note: 'No attempt is given a model socket, so no attempt in this run could reach a provider.',
    },
    taskImage: {
      attemptImage: image,
      attemptImageNote: 'The rehearsal specialist module, content-addressed. It is the thing that actually ran.',
      pinnedTaskImage: 'task-baseline',
      pinnedTaskImageDigest: taskImages.images['task-baseline']?.digest ?? null,
      pinnedTaskImageAvailable: Boolean(taskImages.images['task-baseline']?.digest),
      operatorAction: taskImages.images['task-baseline']?.digest
        ? null
        : `task-baseline has no recorded digest. Build it on the host with \`${taskImages.images['task-baseline']?.buildCommand}\` and record the digest in config/task-images.json. Nothing in this repository can produce it.`,
    },
    project: { projectId: base.projectId, projectType },
    pipeline: { id: pipeline.id, label: pipeline.label, stages: pipeline.stages.length, requiredGates: pipeline.requiredGates.length },
    seededArtifactKinds: seedArtifacts.map((entry) => entry.kind),
    seedSource: 'config/agent-roles.json artifacts marked deterministic',
    simulatedHumanApprovals: {
      stageIds: [...new Set(scenarios.flatMap((scenario) => scenario.stages.filter((entry) => entry.review?.simulated).map((entry) => entry.stageId)))],
      warning: 'A rehearsal-supplied stand-in so the stages behind a human gate can be exercised. It is not an owner decision and closes no gate.',
    },
    rolesExercised,
    reviewersExercised,
    invariants,
    scenarios,
    ok: invariants.every((invariant) => invariant.ok),
  };
}

async function main() {
  const projectType = argValue('--project-type', 'marketing-site');
  const report = await runRehearsal({ projectType });
  const outputDir = path.join(REPOSITORY_ROOT, '.app-builder/pipeline-rehearsal');
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, 'report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Deterministic pipeline rehearsal — ${report.pipeline.id} (${report.pipeline.stages} stages, ${report.pipeline.requiredGates} required gates)`);
    console.log(`Execution: ${report.executionMode}; provider calls ${report.provider.providerCalls}; attempts with a model lane ${report.provider.attemptsWithModelLane}\n`);
    for (const scenario of report.scenarios) {
      const mark = scenario.stopMatchesExpectation ? 'ok  ' : 'FAIL';
      console.log(`${mark} ${scenario.id.padEnd(26)} ${scenario.stop.reason.padEnd(28)} ${scenario.completedStageIds.length}/${report.pipeline.stages} stages, ${scenario.attemptCount} attempt(s)`);
      console.log(`     ${scenario.title}`);
      if (scenario.convergence) {
        console.log(`     convergence: converged=${scenario.convergence.converged} stopReason=${scenario.convergence.stopReason} gatesRun=${scenario.convergence.gatesRun}/${scenario.convergence.totalGates}`);
      }
      if (scenario.resume) {
        console.log(`     resume: lost ${scenario.resume.orphanAttemptsFound.join(', ')} -> reconciled as ${scenario.resume.reconciledAs}; recovered ${scenario.resume.stagesRecovered.length} stage(s) from the ledger`);
      }
    }
    console.log('\nInvariants:');
    for (const invariant of report.invariants) console.log(`  ${invariant.ok ? 'ok  ' : 'FAIL'} ${invariant.id.padEnd(34)} ${invariant.detail}`);
    console.log(`\nRoles exercised (${report.rolesExercised.length}): ${report.rolesExercised.join(', ')}`);
    console.log(`Reviewers exercised (${report.reviewersExercised.length}): ${report.reviewersExercised.join(', ')}`);
    if (report.taskImage.operatorAction) console.log(`\nOperator action: ${report.taskImage.operatorAction}`);
    console.log(`\nReport: ${reportPath.replace(REPOSITORY_ROOT, '')}`);
    console.log('This is not product evidence, not a build, and not a runtime proof. It promotes nothing.');
  }

  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
