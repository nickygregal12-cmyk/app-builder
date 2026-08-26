/**
 * Durable attempt state for one bounded task execution.
 *
 * An attempt is the unit the runtime actually supervises: one role, one task,
 * one isolated sandbox, one signed grant, one budget, one outcome. This module
 * owns what an attempt *is* and what is durably true about it. It owns no
 * runtime, no transport and no provider — starting and stopping a sandbox is
 * `execution-adapter.js`, and the runtime that finally does it is a driver in
 * tooling.
 *
 * Two rules shape everything below.
 *
 * **Nothing is inferred from ambient host state.** Every field an attempt is
 * bound to — task, project, environment, role, policy, capabilities, grant,
 * workspace, context, budget, network profile, broker socket, image — is an
 * explicit input, and a missing one is an error rather than a default. A
 * runtime that guesses its own identity cannot be audited afterwards.
 *
 * **The record is reconstructable from the event ledger.** Sessions and
 * processes are disposable, so the attempt's durable truth is the sequence of
 * events the control plane already persists, and `reduceAttemptEvents` is the
 * function that turns them back into state after a restart. There is no second
 * ledger here: these are ordinary control-plane events.
 */

import { createHash, randomUUID } from 'node:crypto';

import {
  GRANT_ENVIRONMENTS,
  canonicalGrantPayload,
  capabilitiesForRole,
  createCapabilityGrant,
} from './capabilities.js';
import { createExecutionEnvironmentSpec, networkProfileForPolicy } from './execution-environment.js';

/**
 * Lifecycle states.
 *
 * `exited` is deliberately separate from *why* it exited: a timed-out attempt
 * and a failed one differ in reason, not in whether the sandbox stopped. And
 * `disposed` is separate from `exited`, because a sandbox that stopped but was
 * never cleaned up is exactly the orphan this lifecycle exists to prevent.
 */
export const ATTEMPT_STATES = Object.freeze(['created', 'starting', 'running', 'stopping', 'exited', 'disposed']);

/** Every way an attempt can stop. A stopped attempt always names one. */
export const ATTEMPT_EXIT_REASONS = Object.freeze([
  'completed',
  'failed',
  'start-failed',
  'cancelled',
  'timed-out',
  'terminated',
  'lost',
]);

const ATTEMPT_TRANSITIONS = Object.freeze({
  created: new Set(['starting', 'exited', 'disposed']),
  starting: new Set(['running', 'exited']),
  running: new Set(['stopping', 'exited']),
  stopping: new Set(['exited']),
  exited: new Set(['disposed']),
  disposed: new Set(),
});

/**
 * The event types an attempt writes into the project's existing ledger.
 *
 * They are a closed set so `reduceAttemptEvents` can be exhaustive: an event
 * type it does not know about is a gap in recovery, not something to skip.
 */
export const ATTEMPT_EVENT_TYPES = Object.freeze({
  created: 'agent.attempt.created',
  starting: 'agent.attempt.starting',
  started: 'agent.attempt.started',
  progress: 'agent.attempt.progress',
  stopping: 'agent.attempt.stopping',
  exited: 'agent.attempt.exited',
  disposed: 'agent.attempt.disposed',
  recovered: 'agent.attempt.recovered',
});

const EVENT_TYPE_VALUES = Object.freeze(Object.values(ATTEMPT_EVENT_TYPES));

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

function stringArray(value, label) {
  if (!Array.isArray(value ?? [])) throw new Error(`${label} must be an array.`);
  return [...new Set((value ?? []).map((entry) => text(entry, `${label} entry`)))].sort();
}

function whole(value, label, { minimum = 1 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`${label} must be a number >= ${minimum}.`);
  return Math.trunc(parsed);
}

function fingerprint(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/**
 * A pinned image identity.
 *
 * A floating tag is refused here as well as in the runtime translation. The
 * translation refusing it protects one runtime's argv; refusing it here means
 * an unpinned attempt cannot be *recorded* as having run a known image, which
 * is the property the durable evidence depends on.
 */
export function assertPinnedImage(image, label = 'Attempt image') {
  const reference = text(image?.reference, `${label} reference`);
  const digest = text(image?.digest, `${label} digest`);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`${label} digest must be a sha256 content digest, not ${digest}.`);
  }
  if (reference.includes('@')) throw new Error(`${label} reference carries its own digest; supply the repository and the digest separately.`);
  return { reference, digest, pinned: `${reference}@${digest}`, id: image?.id ? text(image.id, `${label} id`) : null };
}

/**
 * Resolve a declared task image to a pinned identity.
 *
 * The registry is the only place an image identity is declared, so an attempt
 * cannot end up running whatever a tag happened to point at. An image that has
 * not been built and its digest recorded resolves to a refusal carrying the
 * build command, rather than to something plausible.
 */
export function resolveTaskImage(registry, imageId) {
  const id = text(imageId, 'Task image id');
  const entry = registry?.images?.[id];
  if (!entry) {
    const known = Object.keys(registry?.images ?? {}).join(', ') || 'none';
    throw new Error(`No task image ${id} is declared. Declared images: ${known}.`);
  }
  if (!entry.digest) {
    throw new Error(
      `Task image ${id} has no recorded digest, so nothing is pinned to run. `
      + `Build it with \`${entry.buildCommand ?? 'ops/hetzner/build-task-image.sh'}\` and record the digest in config/task-images.json. `
      + 'Refusing rather than resolving a floating tag.',
    );
  }
  return assertPinnedImage({ id, reference: entry.reference, digest: entry.digest }, `Task image ${id}`);
}

/**
 * Bind everything an attempt runs with, once, explicitly.
 *
 * The grant is minted here — inside trusted control-plane code, with the
 * signing secret that never enters a sandbox — and the token is returned
 * *beside* the record rather than inside it. The record keeps a fingerprint,
 * so durable evidence can prove which grant ran without storing a bearer
 * credential in the ledger.
 */
export function createAttemptPlan(input, secret, now = new Date()) {
  const moment = now instanceof Date ? now : new Date(now);
  const role = input?.role;
  const policy = input?.policy;
  if (!role || typeof role !== 'object') throw new Error('An attempt plan requires the specialist role record.');
  if (!policy || typeof policy !== 'object') throw new Error('An attempt plan requires the role capability policy.');

  const roleId = text(role.id, 'Attempt roleId');
  const policyId = text(input?.policyId ?? role.policyId, 'Attempt policyId');
  const environment = text(input?.environment, 'Attempt environment');
  if (!GRANT_ENVIRONMENTS.includes(environment)) throw new Error(`Unknown attempt environment: ${environment}`);

  const attemptId = text(input?.attemptId ?? `attempt-${randomUUID()}`, 'Attempt attemptId');
  const taskId = text(input?.taskId, 'Attempt taskId');
  const projectId = text(input?.projectId, 'Attempt projectId');
  const image = assertPinnedImage(input?.image);

  // The role's reach is projected, never asserted by the caller. Passing a
  // capability list in would make the grant a request rather than a boundary.
  const projection = capabilitiesForRole({ role, policy, registry: input?.registry });
  const networkProfile = input?.networkProfile
    ? text(input.networkProfile, 'Attempt networkProfile')
    : networkProfileForPolicy(policy);

  const spec = createExecutionEnvironmentSpec({
    attemptId,
    taskId,
    projectId,
    roleId,
    policyId,
    networkProfile,
    workspacePath: input?.workspacePath,
    scratchPath: input?.scratchPath,
    brokerSocketPath: input?.brokerSocketPath,
    grantPath: input?.grantPath,
    // Absent unless a caller explicitly asks for it. An attempt gets the model
    // lane the same way it gets everything else here: named, or not present.
    modelSocketPath: input?.modelSocketPath ?? null,
    limits: input?.limits ?? null,
  });

  const { grant, token } = createCapabilityGrant(
    {
      attemptId,
      taskId,
      projectId,
      roleId,
      policyId,
      environment,
      capabilities: projection.granted,
      mutationScopes: role.mutationScopes ?? [],
      approvals: input?.approvals ?? [],
      maxOperations: input?.maxOperations ?? 64,
      ttlSeconds: input?.ttlSeconds,
    },
    secret,
    moment,
  );

  const contextPacket = input?.contextPacket ?? null;
  const budget = { ...role.budget, ...input?.budget };

  const attempt = {
    schemaVersion: 1,
    attemptId,
    taskId,
    projectId,
    environment,
    roleId,
    policyId,
    state: 'created',
    exitReason: null,
    stopReason: null,

    capabilities: stringArray(projection.granted, 'Attempt capabilities'),
    mutationScopes: stringArray(role.mutationScopes ?? [], 'Attempt mutationScopes'),
    approvals: (grant.approvals ?? []).map((entry) => entry.approvalId),

    // Identity of the grant, not the grant. A ledger that stored the token
    // would be a place to steal authority from months later.
    grant: {
      fingerprint: fingerprint(canonicalGrantPayload(grant)),
      nonce: grant.nonce,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
      maxOperations: grant.maxOperations,
    },

    image,
    networkProfile: spec.network.profile,
    brokerSocket: spec.factoryAccess.brokerSocket,
    // Durable, because "was this attempt able to reach a model at all?" is a
    // question a reviewer must be able to answer from the ledger months later
    // rather than from the command that started it.
    modelLane: spec.modelAccess === null ? null : { transport: spec.modelAccess.transport, gatewaySocket: spec.modelAccess.gatewaySocket },
    workspace: { host: input?.workspacePath, scratch: input?.scratchPath, container: spec.workspace.containerPath },
    limits: { ...spec.limits },
    budget: {
      maxIterations: whole(budget.maxIterations ?? 1, 'Attempt budget maxIterations'),
      maxRuntimeMs: whole(budget.maxRuntimeMs ?? spec.limits.wallClockMs, 'Attempt budget maxRuntimeMs', { minimum: 1000 }),
      maxCostGbp: Number(budget.maxCostGbp ?? 0),
      maxTokens: whole(budget.maxTokens ?? 0, 'Attempt budget maxTokens', { minimum: 0 }),
    },
    context: contextPacket
      ? {
          roleId: contextPacket.roleId ?? roleId,
          artifactKinds: stringArray((contextPacket.artifacts ?? []).map((entry) => entry?.kind), 'Context artifact kinds'),
          withheldKinds: stringArray(contextPacket.withheldKinds ?? [], 'Context withheld kinds'),
          skills: stringArray(contextPacket.skills ?? [], 'Context skills'),
          contextCeilingTokens: contextPacket.contextCeilingTokens ?? null,
          contextTokensEstimate: contextPacket.contextTokensEstimate ?? null,
          hash: fingerprint(JSON.stringify(contextPacket)),
        }
      : null,

    containerId: null,
    createdAt: moment.toISOString(),
    startedAt: null,
    finishedAt: null,
    disposedAt: null,
    exitCode: null,
    operations: 0,
    usage: { inputTokens: 0, outputTokens: 0, costGbp: 0, durationMs: 0 },
    failures: [],
    checkpointId: null,
    updatedAt: moment.toISOString(),
  };

  return Object.freeze({ attempt, spec, grant, grantToken: token, projection });
}

export function transitionAttempt(attempt, nextState, details = {}, now = new Date().toISOString()) {
  if (!ATTEMPT_STATES.includes(nextState)) throw new Error(`Unknown attempt state: ${nextState}`);
  const allowed = ATTEMPT_TRANSITIONS[attempt.state];
  if (!allowed?.has(nextState)) throw new Error(`Invalid attempt transition: ${attempt.state} -> ${nextState}`);
  if (nextState === 'exited') {
    const reason = details.exitReason;
    if (!ATTEMPT_EXIT_REASONS.includes(reason)) {
      throw new Error(`An attempt that stopped must name why: ${ATTEMPT_EXIT_REASONS.join(', ')}.`);
    }
  }
  return {
    ...attempt,
    state: nextState,
    exitReason: nextState === 'exited' ? details.exitReason : attempt.exitReason,
    stopReason: details.stopReason ?? attempt.stopReason ?? null,
    containerId: details.containerId ?? attempt.containerId ?? null,
    exitCode: details.exitCode === undefined ? attempt.exitCode : details.exitCode,
    startedAt: nextState === 'running' ? (details.startedAt ?? now) : attempt.startedAt,
    finishedAt: nextState === 'exited' ? (details.finishedAt ?? now) : attempt.finishedAt,
    disposedAt: nextState === 'disposed' ? (details.disposedAt ?? now) : attempt.disposedAt,
    operations: details.operations ?? attempt.operations,
    usage: { ...attempt.usage, ...details.usage },
    failures: details.failures ? [...attempt.failures, ...details.failures] : attempt.failures,
    checkpointId: details.checkpointId ?? attempt.checkpointId ?? null,
    updatedAt: now,
  };
}

/**
 * The durable shape of one lifecycle transition.
 *
 * Deliberately an ordinary control-plane event payload rather than a new
 * record type: the project ledger already answers "what happened, when, at
 * what cost", and a second ledger for attempts would be a second truth to
 * reconcile.
 */
export function attemptEventPayload(attempt, extra = {}) {
  return {
    attemptId: attempt.attemptId,
    taskId: attempt.taskId,
    projectId: attempt.projectId,
    roleId: attempt.roleId,
    policyId: attempt.policyId,
    environment: attempt.environment,
    state: attempt.state,
    exitReason: attempt.exitReason,
    stopReason: attempt.stopReason,
    exitCode: attempt.exitCode,
    image: attempt.image,
    networkProfile: attempt.networkProfile,
    modelLane: attempt.modelLane ?? null,
    capabilities: attempt.capabilities,
    mutationScopes: attempt.mutationScopes,
    grant: attempt.grant,
    context: attempt.context,
    limits: attempt.limits,
    budget: attempt.budget,
    workspace: attempt.workspace,
    containerId: attempt.containerId,
    operations: attempt.operations,
    checkpointId: attempt.checkpointId,
    failures: attempt.failures,
    ...extra,
  };
}

export function isAttemptEvent(event) {
  return EVENT_TYPE_VALUES.includes(event?.type);
}

/**
 * Rebuild attempt state from the durable ledger.
 *
 * This is the "recover enough state after process restart" half of the
 * lifecycle. A supervisor that restarts has no in-memory attempt map, and the
 * only honest source of what happened is the events that were written as it
 * happened. Anything the ledger cannot answer is reported as unknown rather
 * than assumed benign: an attempt last seen `running`, with no exit event, is
 * `incomplete` — a candidate orphan the adapter must reconcile against the
 * runtime, not a success.
 */
export function reduceAttemptEvents(events) {
  const attempts = new Map();
  for (const event of events ?? []) {
    if (!isAttemptEvent(event)) continue;
    const payload = event.payload ?? {};
    const attemptId = payload.attemptId;
    if (!attemptId) continue;
    const existing = attempts.get(attemptId) ?? { attemptId, events: 0, usage: { inputTokens: 0, outputTokens: 0, costGbp: 0, durationMs: 0 } };
    const usage = {
      inputTokens: existing.usage.inputTokens + Number(event.usage?.inputTokens ?? 0),
      outputTokens: existing.usage.outputTokens + Number(event.usage?.outputTokens ?? 0),
      costGbp: existing.usage.costGbp + Number(event.usage?.costGbp ?? 0),
      durationMs: existing.usage.durationMs + Number(event.usage?.durationMs ?? 0),
    };
    attempts.set(attemptId, {
      ...existing,
      ...payload,
      taskId: payload.taskId ?? existing.taskId ?? event.taskId ?? null,
      lastEventType: event.type,
      lastEventAt: event.timestamp ?? existing.lastEventAt ?? null,
      events: existing.events + 1,
      usage,
    });
  }
  return [...attempts.values()].map((attempt) => ({
    ...attempt,
    // `incomplete` is the state that matters operationally: the ledger says the
    // attempt was alive and never says it stopped, so something either leaked
    // or the process died mid-attempt.
    incomplete: attempt.state !== 'disposed' && attempt.state !== 'exited',
    orphanCandidate: ['starting', 'running', 'stopping'].includes(attempt.state),
  }));
}
