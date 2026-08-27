/**
 * The deterministic stand-in specialist.
 *
 * The pipeline rehearsal exists to exercise the organisation around a
 * specialist — routing, bounded context, capability projection, the attempt
 * boundary, independent review, typed rework, checkpoints and stopping — before
 * a model provider is enabled. Something has to sit where the specialist will
 * sit, and this is deliberately the least capable thing that can: a pure
 * function of the stage, the role and the bounded context packet.
 *
 * It is not a model, a mock of a model, or a placeholder for one. It produces
 * artifact *identities* rather than artifact content, because content is what a
 * model would contribute and inventing plausible content here would make the
 * rehearsal's evidence read like a build that happened.
 *
 * Two properties matter and both are enforced by the caller rather than by
 * politeness here:
 *
 * - it always claims to be finished, and that claim never advances a stage;
 * - it can be told to misbehave, because a rehearsal that only ever produces
 *   correct output proves the happy path and nothing else.
 */

import { stableHash } from '@app-builder/control-plane';

/** Every way the stub can be told to misbehave. There is no unnamed fault. */
export const REHEARSAL_FAULTS = Object.freeze([
  'missing-artifact',
  'undeclared-artifact',
  'check-failed',
  'check-not-run',
  'session-lost',
]);

function artifactId({ projectId, stageId, kind, iteration }) {
  return `${kind}-${projectId}-${stageId}-i${iteration}`;
}

/**
 * The one genuinely deterministic check a stub result can carry.
 *
 * It is a real check rather than a token: an artifact kind is declared when the
 * stage lists it in `produces` and the role lists it in `writes`. Both come from
 * the registries, so a stub that emits something the organisation never gave the
 * role authority to write fails this check on the registry's own terms.
 */
export function artifactDeclarationCheck({ kind, stage, role }) {
  const declaredByStage = (stage.produces ?? []).includes(kind);
  const declaredByRole = (role.writes ?? []).includes(kind);
  return {
    id: `artifact-declared:${kind}`,
    status: declaredByStage && declaredByRole ? 'pass' : 'fail',
    ref: declaredByStage && declaredByRole
      ? `${stage.id}.produces + ${role.id}.writes`
      : `undeclared:${declaredByStage ? '' : 'stage'}${declaredByStage || declaredByRole ? '' : '+'}${declaredByRole ? '' : 'role'}`,
  };
}

/**
 * Produce one stub specialist result for one stage attempt.
 *
 * @param {object} input
 * @param {object} input.stage the registered pipeline stage
 * @param {object} input.role the registered role that owns it
 * @param {object} input.contextPacket the bounded packet the role was given
 * @param {number} input.iteration this stage's attempt number
 * @param {string|null} input.fault one of REHEARSAL_FAULTS, or null
 */
export function deterministicSpecialistResult({ projectId, stage, role, contextPacket, iteration = 1, fault = null }) {
  if (fault !== null && !REHEARSAL_FAULTS.includes(fault)) {
    throw new Error(`Unknown rehearsal fault: ${fault}. Known: ${REHEARSAL_FAULTS.join(', ')}.`);
  }

  const declared = [...(stage.produces ?? [])];
  const emitted = fault === 'missing-artifact' ? declared.slice(0, -1) : [...declared];
  if (fault === 'undeclared-artifact') emitted.push('SecurityReport');

  // The hash is over what actually decided the result: the stage, the role and
  // the artifact kinds the packet supplied. Two runs of the same rehearsal
  // therefore produce byte-identical artifact identities, and a run whose
  // context changed produces different ones — which is what makes the evidence
  // comparable across runs at all.
  const contextKinds = (contextPacket?.artifacts ?? []).map((entry) => entry.kind).sort();
  const artifacts = emitted.map((kind) => ({
    kind,
    id: artifactId({ projectId, stageId: stage.id, kind, iteration }),
    hash: stableHash({ stage: stage.id, role: role.id, kind, iteration, contextKinds }),
    producedBy: role.id,
    stageId: stage.id,
    origin: 'deterministic-stub',
  }));

  let checks = declared.map((kind) => artifactDeclarationCheck({ kind, stage, role }));
  if (fault === 'undeclared-artifact') {
    checks = [...checks, artifactDeclarationCheck({ kind: 'SecurityReport', stage, role })];
  }
  if (fault === 'check-failed') {
    checks = checks.map((check, index) => (index === 0 ? { ...check, status: 'fail', ref: 'injected-failure' } : check));
  }
  if (fault === 'check-not-run') checks = checks.slice(1);

  return {
    schemaVersion: 1,
    roleId: role.id,
    stageId: stage.id,
    iteration,
    // Always true, always ignored. The rehearsal's whole point is that this
    // field decides nothing.
    declaresFinished: true,
    artifacts,
    checks,
    contextArtifactKinds: contextKinds,
    fault,
    usage: { inputTokens: 0, outputTokens: 0, costGbp: 0, durationMs: 0 },
  };
}

/**
 * The deterministic stand-in reviewer.
 *
 * A scripted verdict, not a judgement: the rehearsal decides in advance what
 * this stage's reviewer says, so the routing that follows can be asserted. It
 * never chooses its own reviewer — the pipeline does — and it cannot review its
 * own stage, because `createReviewVerdict` refuses that at construction.
 */
export function scriptedReviewOutcome({ stage, script = {} }) {
  const outcome = script[stage.id] ?? null;
  if (!outcome) return { verdict: 'pass', failingCriteria: [], severity: 'none', returnToRole: null, observations: [] };
  return {
    verdict: outcome.verdict ?? 'pass',
    failingCriteria: outcome.failingCriteria ?? [],
    severity: outcome.severity ?? null,
    returnToRole: outcome.returnToRole ?? null,
    observations: outcome.observations ?? [],
    blockedReason: outcome.blockedReason ?? null,
  };
}
