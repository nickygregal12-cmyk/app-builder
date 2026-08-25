/**
 * Specialist-role control primitives.
 *
 * These functions encode the invariants that make a specialist organisation safe:
 * an agent never approves its own work, a stage never advances because a model said
 * it was finished, rework is typed and routed to the role that owns it, and a role
 * only ever receives the artifacts its role spec declares it may read.
 *
 * The module stays provider-neutral and dependency-free like the rest of the package.
 */

import { randomUUID } from 'node:crypto';

export const REVIEW_VERDICTS = Object.freeze(['pass', 'pass-with-observations', 'rework-required', 'blocked']);
export const REVIEW_SEVERITIES = Object.freeze(['none', 'observation', 'minor', 'major', 'blocker']);
export const GATE_STATUSES = Object.freeze(['pass', 'pass-with-observations', 'fail', 'blocked', 'not-run', 'not-applicable']);
export const HUMAN_REVIEWER = 'human';

const PASSING_VERDICTS = new Set(['pass', 'pass-with-observations']);
const PASSING_GATE_STATUSES = new Set(['pass', 'pass-with-observations', 'not-applicable']);
const BUDGET_STOP_REASONS = Object.freeze([
  'iteration-budget-exhausted',
  'runtime-budget-exhausted',
  'cost-budget-exhausted',
  'token-budget-exhausted',
  'no-progress-limit-reached',
]);

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

function uniqueTextArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${nonEmpty ? 'a non-empty ' : 'an '}array of non-empty strings.`);
  }
  const entries = value.map((item) => text(item, `${label} entry`));
  return [...new Set(entries)];
}

function referenceList(value, label) {
  if (!Array.isArray(value ?? [])) throw new Error(`${label} must be an array.`);
  return (value ?? []).map((entry) => ({
    kind: text(entry?.kind, `${label} kind`),
    ref: text(entry?.ref, `${label} ref`),
    hash: entry?.hash ?? null,
  }));
}

/**
 * Reviewer independence: the role issuing a verdict must not be one of the roles that
 * created or materially changed the artifact. Creators may run local sanity checks;
 * they may not promote their own work.
 */
export function assertReviewIndependence({ reviewerRole, authorRoles }) {
  const reviewer = text(reviewerRole, 'Reviewer role');
  const authors = uniqueTextArray(authorRoles, 'Author roles', { nonEmpty: true });
  if (authors.includes(reviewer)) {
    throw new Error(`Self-approval rejected: ${reviewer} created or changed this artifact and cannot issue its verdict.`);
  }
  return { reviewerRole: reviewer, authorRoles: authors };
}

export function createReviewVerdict(input, now = new Date().toISOString()) {
  const verdict = text(input?.verdict, 'Review verdict');
  if (!REVIEW_VERDICTS.includes(verdict)) throw new Error(`Unknown review verdict: ${verdict}`);
  const { reviewerRole, authorRoles } = assertReviewIndependence({
    reviewerRole: input?.reviewerRole,
    authorRoles: input?.authorRoles,
  });

  const severity = input?.severity ?? (PASSING_VERDICTS.has(verdict) ? 'none' : 'major');
  if (!REVIEW_SEVERITIES.includes(severity)) throw new Error(`Unknown review severity: ${severity}`);

  const failingCriteria = uniqueTextArray(input?.failingCriteria ?? [], 'Review failingCriteria');
  if (!PASSING_VERDICTS.has(verdict) && failingCriteria.length === 0) {
    throw new Error(`A ${verdict} verdict must name at least one failing criterion.`);
  }
  if (PASSING_VERDICTS.has(verdict) && failingCriteria.length > 0) {
    throw new Error('A passing verdict must not carry failing criteria.');
  }

  let returnToRole = input?.returnToRole ?? null;
  if (verdict === 'rework-required') {
    returnToRole = text(returnToRole, 'Review returnToRole');
    if (returnToRole === reviewerRole) throw new Error('A reviewer cannot route rework to itself.');
    if (severity === 'none') throw new Error('Rework must carry a severity above none.');
  } else if (returnToRole !== null) {
    throw new Error('returnToRole is only meaningful for a rework-required verdict.');
  }

  const blockedReason = verdict === 'blocked' ? text(input?.blockedReason, 'Review blockedReason') : null;

  const score = input?.score ?? null;
  if (score !== null && (!Number.isFinite(score) || score < 0 || score > 10)) {
    throw new Error('Review score must be between 0 and 10.');
  }

  return {
    schemaVersion: 1,
    id: input?.id ?? `verdict-${randomUUID()}`,
    projectId: text(input?.projectId, 'Review projectId'),
    taskId: input?.taskId ?? null,
    stageId: text(input?.stageId, 'Review stageId'),
    artifactId: input?.artifactId ?? null,
    artifactKind: text(input?.artifactKind, 'Review artifactKind'),
    reviewerRole,
    authorRoles,
    verdict,
    severity,
    failingCriteria,
    requiredChanges: uniqueTextArray(input?.requiredChanges ?? [], 'Review requiredChanges'),
    observations: uniqueTextArray(input?.observations ?? [], 'Review observations'),
    returnToRole,
    returnToStageId: input?.returnToStageId ?? null,
    blockedReason,
    evidence: referenceList(input?.evidence, 'Review evidence'),
    score,
    createdAt: now,
  };
}

/**
 * A stage advances on evidence, not on an agent declaring itself finished.
 */
export function evaluateHandoff(input, now = new Date().toISOString()) {
  const stage = input?.stage ?? {};
  const stageId = text(stage.id, 'Handoff stageId');
  const ownerRole = text(stage.role, 'Handoff stage role');
  const reviewer = stage.reviewer ?? null;
  const blockers = [];

  const produced = referenceList(input?.producedArtifacts, 'Handoff producedArtifacts');
  const producedKinds = new Set(produced.map((entry) => entry.kind));
  for (const kind of uniqueTextArray(stage.produces ?? [], 'Handoff stage produces')) {
    if (!producedKinds.has(kind)) blockers.push(`missing-artifact:${kind}`);
  }

  const availableKinds = new Set([
    ...uniqueTextArray(input?.availableArtifactKinds ?? [], 'Handoff availableArtifactKinds'),
    ...producedKinds,
  ]);
  for (const kind of uniqueTextArray(stage.requires ?? [], 'Handoff stage requires')) {
    if (!availableKinds.has(kind)) blockers.push(`missing-prerequisite:${kind}`);
  }

  const evidence = referenceList(input?.evidence, 'Handoff evidence');
  const evidenceKinds = new Set(evidence.map((entry) => entry.kind));
  for (const kind of uniqueTextArray(input?.requiredEvidence ?? [], 'Handoff requiredEvidence')) {
    if (!evidenceKinds.has(kind)) blockers.push(`missing-evidence:${kind}`);
  }

  const checks = (input?.deterministicChecks ?? []).map((check) => ({
    id: text(check?.id, 'Handoff check id'),
    status: text(check?.status, 'Handoff check status'),
    ref: check?.ref ?? null,
  }));
  const checkStatuses = new Map(checks.map((check) => [check.id, check.status]));
  for (const id of uniqueTextArray(input?.requiredChecks ?? [], 'Handoff requiredChecks')) {
    const status = checkStatuses.get(id);
    if (status === undefined || status === 'not-run') blockers.push(`check-not-run:${id}`);
    else if (status === 'fail') blockers.push(`check-failed:${id}`);
  }

  const verdict = input?.verdict ?? null;
  let approvedBy = null;
  if (reviewer === HUMAN_REVIEWER) {
    if (input?.humanApproval === true) approvedBy = HUMAN_REVIEWER;
    else blockers.push('human-approval-required');
  } else if (reviewer) {
    if (!verdict) {
      blockers.push('review-verdict-missing');
    } else {
      if (verdict.reviewerRole !== reviewer) blockers.push(`wrong-reviewer:${verdict.reviewerRole}`);
      if ((verdict.authorRoles ?? []).includes(verdict.reviewerRole)) blockers.push('self-approval-rejected');
      if (verdict.stageId !== stageId) blockers.push(`verdict-stage-mismatch:${verdict.stageId}`);
      if (!PASSING_VERDICTS.has(verdict.verdict)) blockers.push(`verdict-${verdict.verdict}`);
      if (blockers.length === 0) approvedBy = verdict.reviewerRole;
    }
  } else if (verdict && verdict.reviewerRole === ownerRole) {
    blockers.push('self-approval-rejected');
  }

  const promoted = blockers.length === 0;
  return {
    schemaVersion: 1,
    id: input?.id ?? `handoff-${randomUUID()}`,
    projectId: text(input?.projectId, 'Handoff projectId'),
    pipelineId: text(input?.pipelineId, 'Handoff pipelineId'),
    stageId,
    ownerRole,
    nextStageId: promoted ? input?.nextStageId ?? null : null,
    producedArtifacts: produced,
    evidence,
    deterministicChecks: checks,
    reviewVerdictId: verdict?.id ?? null,
    approvedBy,
    promoted,
    blockers: [...new Set(blockers)],
    createdAt: now,
  };
}

function effectiveReworkRole(gate, pipeline, result) {
  return result?.returnToRole ?? pipeline?.reworkOverrides?.[gate.id] ?? gate.defaultReworkRole ?? null;
}

/**
 * Deterministic convergence: assess every required gate, route each failure to the
 * creator role that owns it, and stop only on a deterministic reason.
 */
export function evaluateConvergence(input, now = new Date().toISOString()) {
  const pipeline = input?.pipeline ?? {};
  const pipelineId = text(pipeline.id, 'Convergence pipelineId');
  const gateDefinitions = input?.gates ?? {};
  const results = input?.results ?? {};
  const requiredGates = uniqueTextArray(pipeline.requiredGates ?? [], 'Convergence requiredGates', { nonEmpty: true });

  const gates = [];
  const rework = [];
  let sawNotRun = false;
  let sawBlocked = false;

  for (const gateId of requiredGates) {
    const definition = gateDefinitions[gateId];
    if (!definition) throw new Error(`Convergence references an unregistered gate: ${gateId}`);
    const result = results[gateId] ?? {};
    const declared = result.status ?? 'not-run';
    if (!GATE_STATUSES.includes(declared)) throw new Error(`Unknown gate status for ${gateId}: ${declared}`);

    const minimumScore = definition.minimumScore ?? null;
    const score = result.score ?? null;
    let status = declared;
    const failingCriteria = uniqueTextArray(result.failingCriteria ?? [], `Gate ${gateId} failingCriteria`);
    if (PASSING_GATE_STATUSES.has(status) && minimumScore !== null && status !== 'not-applicable') {
      if (score === null) {
        status = 'not-run';
      } else if (score < minimumScore) {
        status = 'fail';
        failingCriteria.push(`score-below-minimum:${score}<${minimumScore}`);
      }
    }

    const severity = result.severity ?? (status === 'fail' ? 'major' : status === 'blocked' ? 'blocker' : 'none');
    if (!REVIEW_SEVERITIES.includes(severity)) throw new Error(`Unknown severity for gate ${gateId}: ${severity}`);

    const returnToRole = status === 'fail' || status === 'blocked'
      ? effectiveReworkRole(definition, pipeline, result)
      : null;
    if ((status === 'fail' || status === 'blocked') && !returnToRole) {
      throw new Error(`Gate ${gateId} failed with no owning role to route rework to.`);
    }

    if (status === 'not-run') sawNotRun = true;
    if (status === 'blocked') sawBlocked = true;
    if (status === 'fail' || status === 'blocked') {
      rework.push({
        gateId,
        role: returnToRole,
        severity: severity === 'none' ? 'major' : severity,
        reasons: [...new Set(failingCriteria)],
      });
    }

    gates.push({
      id: gateId,
      status,
      evaluatedBy: definition.evaluatedBy ?? null,
      score,
      minimumScore,
      returnToRole,
      severity,
      verdictId: result.verdictId ?? null,
      failingCriteria: [...new Set(failingCriteria)],
    });
  }

  const budgetStop = input?.budgetStopReason ?? null;
  if (budgetStop !== null && !BUDGET_STOP_REASONS.includes(budgetStop)) {
    throw new Error(`Unknown budget stop reason: ${budgetStop}`);
  }

  const converged = rework.length === 0 && !sawNotRun;
  let stopReason;
  if (converged) stopReason = 'converged';
  else if (budgetStop) stopReason = budgetStop;
  else if (sawBlocked) stopReason = 'blocked';
  else if (rework.length > 0) stopReason = 'rework-required';
  else stopReason = 'gate-not-run';

  return {
    schemaVersion: 1,
    id: input?.id ?? `convergence-${randomUUID()}`,
    projectId: text(input?.projectId, 'Convergence projectId'),
    pipelineId,
    iteration: Math.trunc(Number(input?.iteration ?? 0)),
    gates,
    rework,
    converged,
    stopReason,
    createdAt: now,
  };
}

/**
 * Ordered rework queue: blockers first, then major, minor and observations.
 * Observations never force another iteration on their own.
 */
export function planRework(report) {
  const order = { blocker: 0, major: 1, minor: 2, observation: 3 };
  return [...(report?.rework ?? [])]
    .filter((entry) => entry.severity !== 'observation')
    .sort((left, right) => (order[left.severity] ?? 9) - (order[right.severity] ?? 9));
}

/**
 * Bounded context: a role receives only the artifact kinds its role spec declares.
 * Anything else is dropped and reported rather than silently included.
 */
export function buildRoleContextPacket({ role, artifacts = [], contextTokensEstimate = null }) {
  const roleId = text(role?.id, 'Role id');
  const reads = new Set(uniqueTextArray(role?.reads ?? [], 'Role reads'));
  const included = [];
  const withheld = [];
  for (const artifact of artifacts) {
    const kind = text(artifact?.kind, 'Artifact kind');
    if (reads.has(kind)) included.push(artifact);
    else withheld.push(kind);
  }
  const ceiling = role?.contextCeilingTokens ?? null;
  const overCeiling = ceiling !== null && contextTokensEstimate !== null && contextTokensEstimate > ceiling;
  return {
    schemaVersion: 1,
    roleId,
    policyId: role?.policyId ?? null,
    routeId: role?.routeId ?? null,
    skills: uniqueTextArray(role?.skills ?? [], 'Role skills'),
    contextCeilingTokens: ceiling,
    contextTokensEstimate,
    overCeiling,
    artifacts: included,
    withheldKinds: [...new Set(withheld)],
  };
}

/**
 * A role may only declare ChangeSet scope rules it owns. Reviewers own none.
 */
export function assertMutationAllowed(role, declaredScopes) {
  const roleId = text(role?.id, 'Role id');
  const allowed = new Set(role?.mutationScopes ?? []);
  const declared = uniqueTextArray(declaredScopes, 'Declared scopes', { nonEmpty: true });
  const rejected = declared.filter((rule) => !allowed.has(rule));
  if (rejected.length > 0) {
    throw new Error(`Role ${roleId} may not mutate: ${rejected.join(', ')}`);
  }
  return declared;
}

export function selectPipeline(projectType, pipelines) {
  const id = text(projectType, 'Project type');
  const pipeline = pipelines?.[id];
  if (!pipeline) throw new Error(`No specialist pipeline registered for project type: ${id}`);
  return pipeline;
}

export function nextStage(pipeline, currentStageId = null) {
  const stages = pipeline?.stages ?? [];
  if (currentStageId === null) return stages[0] ?? null;
  const index = stages.findIndex((stage) => stage.id === currentStageId);
  if (index === -1) throw new Error(`Unknown stage ${currentStageId} in pipeline ${pipeline?.id}`);
  return stages[index + 1] ?? null;
}
