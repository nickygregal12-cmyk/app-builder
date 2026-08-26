/**
 * Agent capability grants and operation-level authorisation.
 *
 * This module is the enforcement half of `config/agent-capabilities.json`. It
 * answers one question deterministically, before any Factory mutation runs:
 * may *this* attempt invoke *this* operation on *this* project right now.
 *
 * The design assumption is hostile. A task is presumed to know the Factory's
 * implementation, its ports and its route shapes, and to be actively trying to
 * gain an operation it was not granted. So:
 *
 * - authorisation is deny-by-default and every refusal has a named reason;
 * - a grant is signed, attempt-scoped and short-lived, so a task cannot mint,
 *   widen, retarget or outlive its own authority;
 * - `approvalRequired` is evaluated here rather than described in metadata;
 * - the decision record is durable, so a refusal survives the session.
 *
 * It stays provider-neutral and dependency-free like the rest of the package:
 * no HTTP, no transport, no knowledge of how the operation is finally carried
 * out. The trusted broker owns that and calls in here first.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const AGENT_GRANT_VERSION = 1;
export const DEFAULT_GRANT_TTL_SECONDS = 900;
export const MAX_GRANT_TTL_SECONDS = 3600;
export const GRANT_ENVIRONMENTS = Object.freeze(['development', 'preview', 'production']);

/**
 * Every reason authorisation can fail. A deny is always one of these; there is
 * no default-allow branch and no unnamed refusal.
 */
export const DENY_REASONS = Object.freeze([
  'grant-malformed',
  'grant-signature-invalid',
  'grant-expired',
  'grant-not-yet-valid',
  'grant-replayed',
  'grant-project-mismatch',
  'grant-environment-mismatch',
  'unknown-operation',
  'operation-not-agent-accessible',
  'capability-not-granted',
  'approval-required',
  'approval-expired',
  'approval-mismatch',
  'environment-not-permitted',
  'budget-exhausted',
]);

class GrantError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'GrantError';
    this.reason = reason;
  }
}

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

function stringArray(value, label) {
  if (!Array.isArray(value ?? [])) throw new Error(`${label} must be an array.`);
  return [...new Set((value ?? []).map((entry) => text(entry, `${label} entry`)))].sort();
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

/**
 * Canonical JSON with sorted keys. The signature covers the canonical form, so
 * re-ordering keys in transit is not a way to change what was signed.
 */
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function canonicalGrantPayload(grant) {
  return canonical(grant);
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest();
}

function constantTimeEquals(left, right) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function requireSecret(secret) {
  if (typeof secret === 'string' && secret.length >= 32) return Buffer.from(secret, 'utf8');
  if (Buffer.isBuffer(secret) && secret.length >= 32) return secret;
  throw new Error('A capability grant secret must be at least 32 bytes. A short or absent secret is not a signing key.');
}

function approvalRecord(entry, label) {
  return {
    approvalId: text(entry?.approvalId, `${label} approvalId`),
    operation: text(entry?.operation, `${label} operation`),
    projectId: text(entry?.projectId, `${label} projectId`),
    grantedBy: text(entry?.grantedBy, `${label} grantedBy`),
    expiresAt: text(entry?.expiresAt, `${label} expiresAt`),
  };
}

/**
 * Mint an attempt-scoped grant.
 *
 * Only trusted control-plane code calls this. The worker never holds the
 * secret, so it can present a grant and cannot produce one — which is what
 * makes "capabilities" a boundary rather than a request.
 */
export function createCapabilityGrant(input, secret, now = new Date()) {
  const key = requireSecret(secret);
  const issuedAt = now instanceof Date ? now : new Date(now);
  const ttlSeconds = Number(input?.ttlSeconds ?? DEFAULT_GRANT_TTL_SECONDS);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_GRANT_TTL_SECONDS) {
    throw new Error(`Grant ttlSeconds must be between 1 and ${MAX_GRANT_TTL_SECONDS}.`);
  }
  const environment = text(input?.environment ?? 'development', 'Grant environment');
  if (!GRANT_ENVIRONMENTS.includes(environment)) throw new Error(`Unknown grant environment: ${environment}`);

  const maxOperations = Math.trunc(Number(input?.maxOperations ?? 64));
  if (!Number.isInteger(maxOperations) || maxOperations < 1) throw new Error('Grant maxOperations must be a positive integer.');

  const grant = {
    version: AGENT_GRANT_VERSION,
    attemptId: text(input?.attemptId, 'Grant attemptId'),
    taskId: text(input?.taskId, 'Grant taskId'),
    projectId: text(input?.projectId, 'Grant projectId'),
    roleId: text(input?.roleId, 'Grant roleId'),
    policyId: text(input?.policyId, 'Grant policyId'),
    environment,
    capabilities: stringArray(input?.capabilities, 'Grant capabilities'),
    mutationScopes: stringArray(input?.mutationScopes ?? [], 'Grant mutationScopes'),
    approvals: (input?.approvals ?? []).map((entry, index) => approvalRecord(entry, `Grant approval ${index}`)),
    maxOperations,
    nonce: text(input?.nonce ?? randomUUID(), 'Grant nonce'),
    issuedAt: issuedAt.toISOString(),
    notBefore: (input?.notBefore ? new Date(input.notBefore) : issuedAt).toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
  };

  const payload = canonicalGrantPayload(grant);
  const token = `${base64url(payload)}.${base64url(sign(payload, key))}`;
  return { grant, token };
}

/**
 * Verify and decode a grant token. Throws a `GrantError` carrying one of
 * `DENY_REASONS`; there is no partial success and no "probably fine" path.
 */
export function verifyCapabilityGrant(token, { secret, now = new Date(), clockSkewMs = 1000 } = {}) {
  const key = requireSecret(secret);
  if (typeof token !== 'string' || !token.includes('.')) throw new GrantError('grant-malformed', 'Grant token must be "<payload>.<signature>".');
  const separator = token.lastIndexOf('.');
  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  if (!payloadPart || !signaturePart) throw new GrantError('grant-malformed', 'Grant token is missing a payload or a signature.');

  let payload;
  let grant;
  try {
    payload = Buffer.from(payloadPart, 'base64url').toString('utf8');
    grant = JSON.parse(payload);
  } catch {
    throw new GrantError('grant-malformed', 'Grant payload is not decodable JSON.');
  }
  if (!grant || typeof grant !== 'object' || Array.isArray(grant)) throw new GrantError('grant-malformed', 'Grant payload must be an object.');
  if (grant.version !== AGENT_GRANT_VERSION) throw new GrantError('grant-malformed', `Unsupported grant version: ${grant.version}`);

  let signature;
  try {
    signature = Buffer.from(signaturePart, 'base64url');
  } catch {
    throw new GrantError('grant-signature-invalid', 'Grant signature is not decodable.');
  }
  // Re-canonicalise rather than trusting the transmitted byte order: a payload
  // whose keys were shuffled must not verify against a signature over the
  // canonical form, and one that was edited must not verify at all.
  if (!constantTimeEquals(sign(canonicalGrantPayload(grant), key), signature)) {
    throw new GrantError('grant-signature-invalid', 'Grant signature does not match the payload.');
  }

  const moment = (now instanceof Date ? now : new Date(now)).getTime();
  if (Number.isNaN(Date.parse(grant.expiresAt ?? '')) || Number.isNaN(Date.parse(grant.notBefore ?? ''))) {
    throw new GrantError('grant-malformed', 'Grant validity window is not a pair of timestamps.');
  }
  if (moment + clockSkewMs < Date.parse(grant.notBefore)) throw new GrantError('grant-not-yet-valid', 'Grant is not valid yet.');
  if (moment - clockSkewMs >= Date.parse(grant.expiresAt)) throw new GrantError('grant-expired', 'Grant has expired.');
  return grant;
}

/**
 * Index a registry file into the lookup the authoriser needs.
 */
export function indexCapabilityRegistry(registry) {
  const capabilities = new Map();
  for (const entry of registry?.capabilities ?? []) {
    const id = text(entry?.id, 'Capability id');
    if (capabilities.has(id)) throw new Error(`Duplicate capability id in registry: ${id}`);
    capabilities.set(id, {
      id,
      operation: text(entry?.operation, `Capability ${id} operation`),
      mutating: Boolean(entry?.mutating),
      approvalRequired: Boolean(entry?.approvalRequired),
      requiredPolicyActions: stringArray(entry?.requiredPolicyActions ?? [], `Capability ${id} requiredPolicyActions`),
      requiredMutationScopes: stringArray(entry?.requiredMutationScopes ?? [], `Capability ${id} requiredMutationScopes`),
      environments: stringArray(entry?.environments ?? GRANT_ENVIRONMENTS, `Capability ${id} environments`),
    });
  }
  const byOperation = new Map();
  for (const capability of capabilities.values()) {
    if (byOperation.has(capability.operation)) throw new Error(`Two capabilities claim operation ${capability.operation}.`);
    byOperation.set(capability.operation, capability);
  }
  const internalOnly = new Set((registry?.internalOnlyOperations ?? []).map((entry) => text(entry?.operation, 'internalOnlyOperations operation')));
  for (const operation of internalOnly) {
    if (byOperation.has(operation)) throw new Error(`Operation ${operation} is declared both agent-accessible and internal-only.`);
  }
  return { capabilities, byOperation, internalOnly };
}

/**
 * Operation-level projection of a role's reach.
 *
 * This replaces the coarse rule that any mutation scope granted every mutating
 * operation. A capability is granted only when the role's policy allows every
 * action the operation needs *outright* — an approval-gated action is not an
 * allowed one — and the role owns every mutation scope the operation writes.
 *
 * Returns the capability ids plus, for each rejected capability, why. The
 * "why" is not decoration: a projection that silently drops a capability is
 * indistinguishable from one that never considered it.
 */
export function capabilitiesForRole({ role, policy, registry }) {
  const index = registry?.capabilities instanceof Map ? registry : indexCapabilityRegistry(registry);
  const allowed = new Set(policy?.allow ?? []);
  const approvalGated = new Set(policy?.approvalRequired ?? []);
  const denied = new Set(policy?.deny ?? []);
  const scopes = new Set(role?.mutationScopes ?? []);

  const granted = [];
  const withheld = [];
  for (const capability of index.capabilities.values()) {
    const missingActions = capability.requiredPolicyActions.filter((action) => denied.has(action) || approvalGated.has(action) || !allowed.has(action));
    const missingScopes = capability.requiredMutationScopes.filter((scope) => !scopes.has(scope));
    // A role that owns no file mutation scope at all is a reader, and a reader
    // does not mutate durable Factory state — not even through an operation
    // that writes no project file, such as verification or preview control.
    // This keeps the rule strictly narrower than the one it replaced: making
    // the projection granular must not hand a reviewer an operation the coarse
    // rule withheld.
    const readerAskingToMutate = capability.mutating && scopes.size === 0;
    if (missingActions.length === 0 && missingScopes.length === 0 && !readerAskingToMutate) {
      granted.push(capability.id);
      continue;
    }
    withheld.push({
      capability: capability.id,
      missingPolicyActions: missingActions,
      missingMutationScopes: missingScopes,
      readerAskingToMutate,
    });
  }
  return { roleId: role?.id ?? null, policyId: role?.policyId ?? null, granted: granted.sort(), withheld };
}

function findApproval(grant, capability, now) {
  const candidates = (grant.approvals ?? []).filter((entry) => entry.operation === capability.operation);
  if (candidates.length === 0) return { approval: null, reason: 'approval-required' };
  const scoped = candidates.filter((entry) => entry.projectId === grant.projectId);
  if (scoped.length === 0) return { approval: null, reason: 'approval-mismatch' };
  const live = scoped.filter((entry) => {
    const expiry = Date.parse(entry.expiresAt);
    return Number.isFinite(expiry) && expiry > now;
  });
  if (live.length === 0) return { approval: null, reason: 'approval-expired' };
  return { approval: live[0], reason: null };
}

/**
 * The single authorisation decision.
 *
 * Every check is a deny; there is no branch that returns allowed without
 * having passed all of them.
 */
export function authoriseAgentOperation({
  grant,
  operation,
  projectId = null,
  registry,
  environment = null,
  now = new Date(),
  operationsSpent = 0,
}) {
  const index = registry?.capabilities instanceof Map ? registry : indexCapabilityRegistry(registry);
  const moment = (now instanceof Date ? now : new Date(now)).getTime();
  const deny = (reason, detail) => ({ allowed: false, reason, detail, operation, capability: null });

  // Deliberately not trimmed, lower-cased or otherwise normalised. An
  // operation name is a registry key, and every lenient normalisation is one
  // more spelling a hostile caller can try. `project.read ` is not
  // `project.read`; it is an unknown operation.
  if (typeof operation !== 'string' || operation === '') return deny('unknown-operation', 'No operation name was supplied.');
  const requested = operation;

  if (index.internalOnly.has(requested)) {
    return deny('operation-not-agent-accessible', `${requested} exists for the Builder Console and is never an agent operation.`);
  }
  const capability = index.byOperation.get(requested);
  if (!capability) return deny('unknown-operation', `${requested} is not a registered agent capability.`);

  if (moment >= Date.parse(grant.expiresAt)) return deny('grant-expired', 'Grant expired before dispatch.');

  const target = projectId === null ? grant.projectId : String(projectId);
  if (target !== grant.projectId) return deny('grant-project-mismatch', `Grant is scoped to ${grant.projectId}, not ${target}.`);

  const runtimeEnvironment = environment === null ? grant.environment : String(environment);
  if (runtimeEnvironment !== grant.environment) return deny('grant-environment-mismatch', `Grant is scoped to ${grant.environment}, not ${runtimeEnvironment}.`);
  if (!capability.environments.includes(runtimeEnvironment)) {
    return deny('environment-not-permitted', `${capability.id} is not permitted in ${runtimeEnvironment}.`);
  }

  if (!(grant.capabilities ?? []).includes(capability.id)) {
    return deny('capability-not-granted', `${capability.id} is not in this attempt's grant.`);
  }

  for (const scope of capability.requiredMutationScopes) {
    if (!(grant.mutationScopes ?? []).includes(scope)) {
      return deny('capability-not-granted', `${capability.id} writes ${scope}, which this attempt does not own.`);
    }
  }

  if (capability.approvalRequired) {
    const { approval, reason } = findApproval(grant, capability, moment);
    if (!approval) return deny(reason, `${capability.id} requires an approval this attempt does not carry.`);
    if (operationsSpent >= grant.maxOperations) return deny('budget-exhausted', 'Attempt operation budget is spent.');
    return { allowed: true, reason: null, detail: null, operation: requested, capability, approvalId: approval.approvalId };
  }

  if (operationsSpent >= grant.maxOperations) return deny('budget-exhausted', 'Attempt operation budget is spent.');
  return { allowed: true, reason: null, detail: null, operation: requested, capability, approvalId: null };
}

/**
 * The durable form of a decision. Recorded for allows as well as denies: a
 * ledger that only holds refusals cannot answer what the attempt actually did.
 */
export function createAuthorisationDecision({ decision, grant = null, actor = 'agent-capability-broker', requestId = null }, now = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    id: requestId ?? `decision-${randomUUID()}`,
    decidedAt: now,
    actor,
    allowed: Boolean(decision?.allowed),
    reason: decision?.reason ?? null,
    detail: decision?.detail ?? null,
    operation: decision?.operation ?? null,
    capability: decision?.capability?.id ?? null,
    mutating: decision?.capability?.mutating ?? null,
    approvalRequired: decision?.capability?.approvalRequired ?? null,
    approvalId: decision?.approvalId ?? null,
    attemptId: grant?.attemptId ?? null,
    taskId: grant?.taskId ?? null,
    projectId: grant?.projectId ?? null,
    roleId: grant?.roleId ?? null,
    policyId: grant?.policyId ?? null,
    environment: grant?.environment ?? null,
  };
}

/**
 * Replay guard.
 *
 * A nonce is bound to the exact grant payload that first presented it. Re-using
 * a nonce with any other payload is the signature of an attempt to resurrect or
 * splice a grant, and is refused rather than merely logged.
 */
export class GrantNonceRegistry {
  constructor() {
    this.seen = new Map();
  }

  register(grant) {
    const fingerprint = canonicalGrantPayload(grant);
    const existing = this.seen.get(grant.nonce);
    if (existing !== undefined && existing !== fingerprint) {
      throw new GrantError('grant-replayed', 'Grant nonce was already used by a different grant.');
    }
    this.seen.set(grant.nonce, fingerprint);
    return grant;
  }
}

export { GrantError };
