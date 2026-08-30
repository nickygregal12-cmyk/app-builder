/**
 * The provider-neutral model-execution lane.
 *
 * Everything before this module is deliberately provider-free: an attempt can
 * be created, bounded, cancelled, collected and disposed of with no model
 * anywhere in the system. This module is the smallest contract that stops that
 * being true, and it is written to be the *only* place the decision "may a
 * real provider call happen right now" is made.
 *
 * It owns no transport, no credential and no provider. It cannot make a
 * request; it can only decide whether one is permitted and account for what
 * came back. The trusted gateway in tooling does the calling, and the sandbox
 * does neither — which is the whole point:
 *
 * ```text
 * operator decision (durable, one-shot, signed)
 *    +  kill switch (trusted side, default off)
 *    +  attempt grant (already signed, already attempt-scoped)
 *    |
 * evaluateModelLane()          <- this file: the deny-by-default decision
 *    |
 * trusted model gateway        <- tooling: holds the key, speaks the protocol
 *    |
 * one provider request
 * ```
 *
 * Four rules shape it.
 *
 * **The credential is never a value here.** A provider secret appears in this
 * module only as `{ providerId, secretRef, configured }`. There is no field a
 * key could be stored in, so no durable record, event or status response can
 * carry one by accident.
 *
 * **Enabling is a decision, not a configuration.** A model attempt needs an
 * operator decision that names the role, the task, the model, the ceilings and
 * an expiry, and that decision is single-use. Turning a flag on is not enough
 * and neither is the flag being on yesterday.
 *
 * **Budgets are enforced before the call, not after the model stops.** Every
 * request carries a pre-declared output ceiling, and the lane refuses the next
 * call when what remains could not pay for it. A model that decides to keep
 * going does not get to.
 *
 * **Provider identity does not reach a stable contract.** A provider's own
 * session/request/conversation id is transient runtime state. The record keeps
 * the model name and the usage, because those are what a reviewer needs, and
 * refuses the rest.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const MODEL_ENABLE_DECISION_VERSION = 1;

/** The longest an enable decision may authorise. One canary, not a standing grant. */
export const MAX_ENABLE_DECISION_TTL_SECONDS = 24 * 3600;

export const MODEL_LANE_ENVIRONMENTS = Object.freeze(['development', 'preview', 'production']);

/**
 * Every way the lane can refuse. Like `DENY_REASONS` in `capabilities.js`,
 * this is closed: a refusal is always one of these, and there is no branch
 * that permits a call without having passed all of them.
 */
export const MODEL_LANE_DENY_REASONS = Object.freeze([
  'kill-switch-disabled',
  'decision-malformed',
  'decision-signature-invalid',
  'decision-expired',
  'decision-not-yet-valid',
  'decision-already-spent',
  'decision-role-mismatch',
  'decision-task-mismatch',
  'decision-attempt-mismatch',
  'decision-project-mismatch',
  'decision-environment-mismatch',
  'decision-adapter-mismatch',
  'decision-model-mismatch',
  'mutation-not-permitted',
  'call-budget-exhausted',
  'token-budget-exhausted',
  'cost-budget-exhausted',
  'request-exceeds-remaining-budget',
  'provider-secret-missing',
  'usage-unreconcilable',
]);

/**
 * Why a model call stopped. `refused` and `error` are separate from `length`
 * and `stop` because a reviewer reading the record must be able to tell a
 * model that finished from one that was cut off from one that never spoke.
 */
export const MODEL_STOP_REASONS = Object.freeze(['stop', 'length', 'refused', 'error', 'cancelled', 'timed-out']);

/**
 * Keys that must never appear in a durable model record.
 *
 * The first group is provider session identity (rule four above). The second
 * is anything credential-shaped, checked by name so a record cannot acquire a
 * key through a field nobody reviewed.
 */
const FORBIDDEN_RECORD_KEYS = Object.freeze([
  /^(session|conversation|thread|request|trace|response)[_-]?id$/i,
  /secret|credential|api[-_]?key|password|authorization|bearer/i,
]);

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

function whole(value, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function money(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number.`);
  return parsed;
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

export function canonicalDecisionPayload(decision) {
  return canonical(decision);
}

function requireSecret(secret) {
  if (typeof secret === 'string' && secret.length >= 32) return Buffer.from(secret, 'utf8');
  if (Buffer.isBuffer(secret) && secret.length >= 32) return secret;
  throw new Error('A model enable-decision secret must be at least 32 bytes. A short or absent secret is not a signing key.');
}

function sign(payload, key) {
  return createHmac('sha256', key).update(payload).digest();
}

function constantTimeEquals(left, right) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class ModelLaneError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'ModelLaneError';
    this.reason = reason;
  }
}

// --- The provider credential, as a contract that cannot hold one -------------

/**
 * The durable description of a provider credential.
 *
 * `secretRef` names where the trusted side will look — an environment variable
 * name, a file path, a secret-manager key. It is a *reference*, and this
 * function refuses anything that looks like it might be the thing itself: a
 * reference is short and boring, and a 90-character opaque string in this
 * field is a leaked key, not a name.
 *
 * `configured` is a boolean the trusted side computes by looking, exactly as
 * `FactoryService.integrationStatus()` already does for Netlify, Supabase,
 * OpenAI and Anthropic. Nothing here reads the value, and there is nowhere to
 * put it if something did.
 */
export function describeProviderSecret({ providerId, secretRef, configured = false }) {
  const reference = text(secretRef, 'Provider secretRef');
  if (reference.length > 96) {
    throw new Error('Provider secretRef is too long to be a reference. Record where the credential lives, never the credential.');
  }
  if (/^(sk-|sk_|ghp_|xox|Bearer\s)/i.test(reference)) {
    throw new Error('Provider secretRef looks like a credential value rather than a reference to one.');
  }
  return Object.freeze({
    providerId: text(providerId, 'Provider id'),
    secretRef: reference,
    configured: Boolean(configured),
  });
}

// --- The one-time enable decision --------------------------------------------

/**
 * Mint the operator's decision to allow one bounded model attempt.
 *
 * Signed for the same reason a capability grant is: the thing that presents it
 * must not be able to produce it. The signing key lives with the trusted
 * gateway and never enters a sandbox, so a task can carry a decision and
 * cannot write one.
 *
 * Every ceiling is required rather than defaulted. A default budget is a
 * budget nobody chose, and this decision exists precisely so that somebody
 * chose.
 */
export function createModelEnableDecision(input, secret, now = new Date()) {
  const key = requireSecret(secret);
  const issuedAt = now instanceof Date ? now : new Date(now);
  const ttlSeconds = whole(input?.ttlSeconds, 'Enable decision ttlSeconds', { minimum: 60, maximum: MAX_ENABLE_DECISION_TTL_SECONDS });

  const environment = text(input?.environment, 'Enable decision environment');
  if (!MODEL_LANE_ENVIRONMENTS.includes(environment)) throw new Error(`Unknown model lane environment: ${environment}`);
  if (environment === 'production') {
    throw new Error('The first model canary is not a production decision. Refusing to authorise a model attempt in production.');
  }

  const budget = input?.budget ?? {};
  const decision = {
    version: MODEL_ENABLE_DECISION_VERSION,
    decisionId: text(input?.decisionId ?? `model-enable-${randomUUID()}`, 'Enable decision id'),

    // Who asked for this, and how. `grantedBy` is a person or an operator
    // identity, never a role: a role authorising its own model access would be
    // the self-approval rule broken by a different route.
    grantedBy: text(input?.grantedBy, 'Enable decision grantedBy'),
    reason: text(input?.reason, 'Enable decision reason'),

    // What exactly is authorised. All four bind the decision to one attempt.
    canaryId: text(input?.canaryId, 'Enable decision canaryId'),
    roleId: text(input?.roleId, 'Enable decision roleId'),
    projectId: text(input?.projectId, 'Enable decision projectId'),
    taskId: text(input?.taskId, 'Enable decision taskId'),
    environment,

    // Which runtime and which model. `adapterId` is the neutral seam id, not a
    // provider's own name for its transport.
    adapterId: text(input?.adapterId, 'Enable decision adapterId'),
    providerId: text(input?.providerId, 'Enable decision providerId'),
    model: text(input?.model, 'Enable decision model'),

    // Mutation is opt-in and, for a review role, off. Recorded explicitly so
    // "this canary could not have changed anything" is evidence rather than an
    // inference from the role registry.
    mutationPermitted: input?.mutationPermitted === true,

    budget: {
      maxCalls: whole(budget.maxCalls, 'Enable decision budget maxCalls', { minimum: 1, maximum: 8 }),
      maxOutputTokensPerCall: whole(budget.maxOutputTokensPerCall, 'Enable decision budget maxOutputTokensPerCall', { minimum: 1, maximum: 16_000 }),
      maxTotalTokens: whole(budget.maxTotalTokens, 'Enable decision budget maxTotalTokens', { minimum: 1 }),
      maxCostGbp: money(budget.maxCostGbp, 'Enable decision budget maxCostGbp'),
      maxWallClockMs: whole(budget.maxWallClockMs, 'Enable decision budget maxWallClockMs', { minimum: 1000 }),
    },

    // Cost must be reconcilable from the response alone, so the price the
    // decision was made at travels with the decision. A gateway that cannot
    // price a response fails closed rather than recording an unknown spend.
    pricingGbpPerMillionTokens: {
      input: money(input?.pricingGbpPerMillionTokens?.input, 'Enable decision pricing input'),
      output: money(input?.pricingGbpPerMillionTokens?.output, 'Enable decision pricing output'),
    },

    // One-shot. `maxAttempts` is 1 and not configurable: a decision that could
    // authorise a second attempt is a standing permission wearing a decision's
    // clothes.
    maxAttempts: 1,

    nonce: text(input?.nonce ?? randomUUID(), 'Enable decision nonce'),
    issuedAt: issuedAt.toISOString(),
    notBefore: (input?.notBefore ? new Date(input.notBefore) : issuedAt).toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
  };

  if (decision.budget.maxOutputTokensPerCall > decision.budget.maxTotalTokens) {
    throw new Error('An enable decision whose per-call output ceiling exceeds its total token budget cannot be enforced before the first call.');
  }

  const payload = canonicalDecisionPayload(decision);
  const token = `${Buffer.from(payload).toString('base64url')}.${Buffer.from(sign(payload, key)).toString('base64url')}`;
  return { decision, token };
}

/** Verify and decode an enable decision. Throws `ModelLaneError`; no partial success. */
export function verifyModelEnableDecision(token, { secret, now = new Date(), clockSkewMs = 1000 } = {}) {
  const key = requireSecret(secret);
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new ModelLaneError('decision-malformed', 'An enable decision token must be "<payload>.<signature>".');
  }
  const separator = token.lastIndexOf('.');
  const payloadPart = token.slice(0, separator);
  const signaturePart = token.slice(separator + 1);
  if (!payloadPart || !signaturePart) throw new ModelLaneError('decision-malformed', 'Enable decision token is missing a payload or a signature.');

  let decision;
  try {
    decision = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new ModelLaneError('decision-malformed', 'Enable decision payload is not decodable JSON.');
  }
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new ModelLaneError('decision-malformed', 'Enable decision payload must be an object.');
  }
  if (decision.version !== MODEL_ENABLE_DECISION_VERSION) {
    throw new ModelLaneError('decision-malformed', `Unsupported enable decision version: ${decision.version}`);
  }

  let signature;
  try {
    signature = Buffer.from(signaturePart, 'base64url');
  } catch {
    throw new ModelLaneError('decision-signature-invalid', 'Enable decision signature is not decodable.');
  }
  // Re-canonicalised, like the capability grant: a payload whose keys were
  // reordered must not verify, and one whose budget was edited must not verify
  // at all.
  if (!constantTimeEquals(sign(canonicalDecisionPayload(decision), key), signature)) {
    throw new ModelLaneError('decision-signature-invalid', 'Enable decision signature does not match the payload.');
  }

  const moment = (now instanceof Date ? now : new Date(now)).getTime();
  if (Number.isNaN(Date.parse(decision.expiresAt ?? '')) || Number.isNaN(Date.parse(decision.notBefore ?? ''))) {
    throw new ModelLaneError('decision-malformed', 'Enable decision validity window is not a pair of timestamps.');
  }
  if (moment + clockSkewMs < Date.parse(decision.notBefore)) throw new ModelLaneError('decision-not-yet-valid', 'Enable decision is not valid yet.');
  if (moment - clockSkewMs >= Date.parse(decision.expiresAt)) throw new ModelLaneError('decision-expired', 'Enable decision has expired.');
  return decision;
}

// --- The neutral request contract --------------------------------------------

/**
 * One provider-neutral model request.
 *
 * It names an adapter and a model, a role, a context packet by *reference and
 * hash* rather than by value, the artifact contract the answer must satisfy,
 * and the ceilings the call runs under. What it deliberately does not carry is
 * a provider's request shape: translating this into one vendor's wire format
 * is the adapter's job, and keeping that out of here is what makes a second
 * adapter a drop-in rather than a migration.
 */
export function createModelRequest(input) {
  const request = {
    schemaVersion: 1,
    requestId: text(input?.requestId ?? `model-request-${randomUUID()}`, 'Model request id'),
    adapterId: text(input?.adapterId, 'Model request adapterId'),
    providerId: text(input?.providerId, 'Model request providerId'),

    // Either an exact model or a class the adapter resolves. Exactly one, so a
    // record can never be ambiguous about what ran.
    model: input?.model ? text(input.model, 'Model request model') : null,
    modelClass: input?.modelClass ? text(input.modelClass, 'Model request modelClass') : null,

    roleId: text(input?.roleId, 'Model request roleId'),
    attemptId: text(input?.attemptId, 'Model request attemptId'),
    taskId: text(input?.taskId, 'Model request taskId'),
    projectId: text(input?.projectId, 'Model request projectId'),

    // The packet by reference. A request that embedded the packet would make
    // the durable record grow with the context, and the reviewer needs to know
    // *which* packet ran, not to re-read it here.
    contextPacketRef: text(input?.contextPacketRef, 'Model request contextPacketRef'),
    contextPacketHash: text(input?.contextPacketHash, 'Model request contextPacketHash'),

    // What the answer must be. A canary whose acceptance is "the model said
    // something" proves nothing, so the contract is named and the artifact is
    // validated against it outside the sandbox.
    artifactContract: text(input?.artifactContract, 'Model request artifactContract'),

    instruction: text(input?.instruction, 'Model request instruction'),
    input: text(input?.input, 'Model request input'),

    maxOutputTokens: whole(input?.maxOutputTokens, 'Model request maxOutputTokens', { minimum: 1, maximum: 16_000 }),
    timeoutMs: whole(input?.timeoutMs, 'Model request timeoutMs', { minimum: 1000 }),
  };
  if (Boolean(request.model) === Boolean(request.modelClass)) {
    throw new Error('A model request names exactly one of model or modelClass, so the record cannot be ambiguous about what ran.');
  }
  return Object.freeze(request);
}

// --- Budget accounting --------------------------------------------------------

/** The empty spend an attempt starts from. */
export function emptyModelSpend() {
  return Object.freeze({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costGbp: 0 });
}

/**
 * Price one call, including the parts of the prompt a provider cache served.
 *
 * `inputTokens` is the whole prompt. That matters because a cache changes what
 * a provider reports rather than what was sent: Anthropic's `input_tokens`
 * becomes the uncached remainder once caching is on, so an adapter that mapped
 * it straight through would report a shrinking prompt for an unchanged request
 * and the ceiling would stop binding. The parts are carried separately so the
 * cost can be right as well as the count — a cached read is far cheaper than
 * fresh input, and a cache write is dearer.
 *
 * When a rate for a part is not declared, that part is priced as fresh input.
 * Overstating is the safe direction, as the note beside these rates says: an
 * undeclared discount that we invent is a ceiling that binds later than the
 * operator agreed to.
 */
export function priceModelUsage(usage, pricingGbpPerMillionTokens) {
  const input = whole(usage?.inputTokens, 'Usage inputTokens', { minimum: 0 });
  const output = whole(usage?.outputTokens, 'Usage outputTokens', { minimum: 0 });
  const cacheRead = whole(usage?.cacheReadInputTokens ?? 0, 'Usage cacheReadInputTokens', { minimum: 0 });
  const cacheWrite = whole(usage?.cacheCreationInputTokens ?? 0, 'Usage cacheCreationInputTokens', { minimum: 0 });
  const rate = pricingGbpPerMillionTokens ?? {};
  const inputRate = money(rate.input, 'Pricing input');

  if (cacheRead + cacheWrite > input) {
    // The parts cannot exceed the whole. This is the adapter's arithmetic being
    // checked rather than the provider's honesty: it is the shape a mapping bug
    // takes, and it would otherwise land as a plausible-looking cheap call.
    throw new Error('Usage cache tokens exceed the reported input tokens, so the call cannot be priced.');
  }

  const uncached = input - cacheRead - cacheWrite;
  const cost = (
    uncached * inputRate
    + cacheRead * (rate.cacheRead === undefined ? inputRate : money(rate.cacheRead, 'Pricing cacheRead'))
    + cacheWrite * (rate.cacheWrite === undefined ? inputRate : money(rate.cacheWrite, 'Pricing cacheWrite'))
    + output * money(rate.output, 'Pricing output')
  ) / 1_000_000;

  return { inputTokens: input, outputTokens: output, totalTokens: input + output, costGbp: cost };
}

/**
 * Fold one completed call into the attempt's spend.
 *
 * Usage that the provider did not report is not zero. A response with no token
 * counts cannot be reconciled against the declared budget, so this refuses it
 * rather than recording a call that cost nothing — which is the accounting
 * version of a skipped proof reported as green.
 */
export function accountModelCall({ spend, usage, pricingGbpPerMillionTokens }) {
  if (!usage || usage.inputTokens === undefined || usage.outputTokens === undefined) {
    throw new ModelLaneError('usage-unreconcilable', 'The provider returned no token usage, so this call cannot be reconciled against the declared budget.');
  }
  const priced = priceModelUsage(usage, pricingGbpPerMillionTokens);
  const previous = spend ?? emptyModelSpend();
  return Object.freeze({
    calls: previous.calls + 1,
    inputTokens: previous.inputTokens + priced.inputTokens,
    outputTokens: previous.outputTokens + priced.outputTokens,
    totalTokens: previous.totalTokens + priced.totalTokens,
    costGbp: previous.costGbp + priced.costGbp,
  });
}

export function remainingModelBudget({ decision, spend }) {
  const current = spend ?? emptyModelSpend();
  return Object.freeze({
    calls: Math.max(0, decision.budget.maxCalls - current.calls),
    tokens: Math.max(0, decision.budget.maxTotalTokens - current.totalTokens),
    costGbp: Math.max(0, decision.budget.maxCostGbp - current.costGbp),
  });
}

// --- The decision ------------------------------------------------------------

/**
 * May this request run, right now?
 *
 * Deny-by-default and ordered so the cheapest, most operationally important
 * refusal comes first: the kill switch is checked before the decision is even
 * parsed, so "the operator turned it off" is never reported as "the decision
 * was malformed".
 *
 * `spent` is the set of decision ids already consumed. Single use is enforced
 * here rather than by the caller remembering, because a caller that forgot
 * would turn a one-shot decision into a standing one silently.
 */
export function evaluateModelLane({
  killSwitch,
  decision,
  grant = null,
  request,
  spend = null,
  spentDecisionIds = null,
  now = new Date(),
}) {
  const moment = (now instanceof Date ? now : new Date(now)).getTime();
  const deny = (reason, detail) => ({ allowed: false, reason, detail, decisionId: decision?.decisionId ?? null });

  // 1. The switch. Nothing below matters if it is off, and it is off unless
  //    every source says otherwise.
  if (!killSwitch || killSwitch.enabled !== true) {
    return deny('kill-switch-disabled', killSwitch?.detail ?? 'Model execution is disabled. No real provider call may be made.');
  }

  if (!decision || typeof decision !== 'object') return deny('decision-malformed', 'No enable decision was supplied.');

  // 2. The decision's own validity window, re-checked here because the token
  //    may have been verified some time before dispatch.
  if (moment >= Date.parse(decision.expiresAt)) return deny('decision-expired', 'Enable decision expired before dispatch.');
  if (moment + 1000 < Date.parse(decision.notBefore)) return deny('decision-not-yet-valid', 'Enable decision is not valid yet.');
  if (spentDecisionIds && spentDecisionIds.has?.(decision.decisionId)) {
    return deny('decision-already-spent', `Enable decision ${decision.decisionId} authorised one attempt and has been used.`);
  }

  // 3. The decision authorises *this* work and no other. Each of these is a
  //    separate reason because "mismatch" alone would not tell an operator
  //    which of five bindings they got wrong.
  if (decision.roleId !== request.roleId) return deny('decision-role-mismatch', `Decision authorises ${decision.roleId}, not ${request.roleId}.`);
  if (decision.taskId !== request.taskId) return deny('decision-task-mismatch', `Decision authorises task ${decision.taskId}, not ${request.taskId}.`);
  if (decision.projectId !== request.projectId) return deny('decision-project-mismatch', `Decision authorises project ${decision.projectId}, not ${request.projectId}.`);
  if (decision.adapterId !== request.adapterId) return deny('decision-adapter-mismatch', `Decision authorises adapter ${decision.adapterId}, not ${request.adapterId}.`);
  if (request.model !== null && decision.model !== request.model) {
    return deny('decision-model-mismatch', `Decision authorises ${decision.model}, not ${request.model}.`);
  }

  // 4. The attempt presenting the request must be the attempt the grant names.
  //    The grant is already signed and already attempt-scoped, so this is what
  //    binds the model lane to the sandbox boundary rather than running beside
  //    it.
  if (grant) {
    if (grant.attemptId !== request.attemptId) return deny('decision-attempt-mismatch', `Grant is for attempt ${grant.attemptId}, not ${request.attemptId}.`);
    if (grant.roleId !== decision.roleId) return deny('decision-role-mismatch', `Grant carries role ${grant.roleId}; the decision authorises ${decision.roleId}.`);
    if (grant.taskId !== decision.taskId) return deny('decision-task-mismatch', `Grant carries task ${grant.taskId}; the decision authorises ${decision.taskId}.`);
    if (grant.projectId !== decision.projectId) return deny('decision-project-mismatch', `Grant carries project ${grant.projectId}; the decision authorises ${decision.projectId}.`);
    if (grant.environment !== decision.environment) return deny('decision-environment-mismatch', `Grant environment ${grant.environment} is not the authorised ${decision.environment}.`);
    if (!decision.mutationPermitted && (grant.mutationScopes ?? []).length > 0) {
      return deny('mutation-not-permitted', `The decision permits no mutation, but the attempt grant owns ${grant.mutationScopes.join(', ')}.`);
    }
  }

  // 5. The budget, checked *before* the call and against what this specific
  //    request could cost at its declared ceiling. A remaining budget that
  //    could not pay for the request being asked for is exhausted for that
  //    request, whatever it might have covered.
  const remaining = remainingModelBudget({ decision, spend });
  if (remaining.calls <= 0) return deny('call-budget-exhausted', `All ${decision.budget.maxCalls} authorised call(s) are spent.`);
  if (request.maxOutputTokens > decision.budget.maxOutputTokensPerCall) {
    return deny('request-exceeds-remaining-budget', `Request asks for ${request.maxOutputTokens} output tokens; the decision permits ${decision.budget.maxOutputTokensPerCall} per call.`);
  }
  if (remaining.tokens <= 0) return deny('token-budget-exhausted', `The ${decision.budget.maxTotalTokens}-token budget is spent.`);
  if (remaining.tokens < request.maxOutputTokens) {
    return deny('request-exceeds-remaining-budget', `${remaining.tokens} token(s) remain; this request could use ${request.maxOutputTokens}.`);
  }
  const worstCaseCost = (request.maxOutputTokens * decision.pricingGbpPerMillionTokens.output) / 1_000_000;
  if (remaining.costGbp <= 0) return deny('cost-budget-exhausted', `The £${decision.budget.maxCostGbp} budget is spent.`);
  if (remaining.costGbp < worstCaseCost) {
    return deny('request-exceeds-remaining-budget', `£${remaining.costGbp.toFixed(4)} remains; this request could cost £${worstCaseCost.toFixed(4)}.`);
  }

  // 6. The credential. Its absence is a refusal with a name, not a stack trace
  //    from a transport layer half a second later.
  if (!killSwitch.providerSecret?.configured) {
    return deny('provider-secret-missing', `No credential is configured at ${killSwitch.providerSecret?.secretRef ?? 'the declared reference'}.`);
  }

  return { allowed: true, reason: null, detail: null, decisionId: decision.decisionId, remaining };
}

// --- The durable record -------------------------------------------------------

/**
 * Refuse a record that carries provider session identity or anything
 * credential-shaped.
 *
 * Checked recursively and by key name rather than by value, because the way
 * this fails in practice is a well-meaning adapter spreading a provider's whole
 * response object into the record and nobody noticing which keys came with it.
 */
export function assertNoProviderSessionIdentity(value, path = 'record') {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProviderSessionIdentity(entry, `${path}[${index}]`));
    return value;
  }
  for (const [key, entry] of Object.entries(value)) {
    for (const pattern of FORBIDDEN_RECORD_KEYS) {
      if (pattern.test(key)) {
        throw new Error(`${path}.${key} is provider-specific or credential-shaped and must not reach a durable model record.`);
      }
    }
    assertNoProviderSessionIdentity(entry, `${path}.${key}`);
  }
  return value;
}

/**
 * The structured outcome of one model-powered attempt.
 *
 * This is what the reviewer reads and what `model-attempt-evidence` in
 * `config/runtime-readiness.json` finally points at. It carries the artifact,
 * everything needed to say what produced it, and the deterministic checks that
 * ran on it — but no verdict: `reviewerVerdict` starts null and only a
 * reviewer who is not the creator may fill it in.
 *
 * There is deliberately no field for the model's private reasoning. What the
 * artifact contract asks for is recorded because it is the answer; anything
 * else the model thought is not evidence and is not stored.
 */
export function createModelAttemptRecord(input, now = new Date()) {
  const moment = now instanceof Date ? now : new Date(now);
  const record = {
    schemaVersion: 1,
    recordId: text(input?.recordId ?? `model-attempt-${randomUUID()}`, 'Model attempt recordId'),
    canaryId: text(input?.canaryId, 'Model attempt canaryId'),
    decisionId: text(input?.decisionId, 'Model attempt decisionId'),

    attemptId: text(input?.attemptId, 'Model attempt attemptId'),
    taskId: text(input?.taskId, 'Model attempt taskId'),
    projectId: text(input?.projectId, 'Model attempt projectId'),
    roleId: text(input?.roleId, 'Model attempt roleId'),
    policyId: text(input?.policyId, 'Model attempt policyId'),
    environment: text(input?.environment, 'Model attempt environment'),

    runtime: {
      adapterId: text(input?.runtime?.adapterId, 'Model attempt adapterId'),
      providerId: text(input?.runtime?.providerId, 'Model attempt providerId'),
      model: text(input?.runtime?.model, 'Model attempt model'),
      driverId: text(input?.runtime?.driverId, 'Model attempt driverId'),
      image: text(input?.runtime?.image, 'Model attempt image'),
      networkProfile: text(input?.runtime?.networkProfile, 'Model attempt networkProfile'),
    },

    context: {
      packetRef: text(input?.context?.packetRef, 'Model attempt context packetRef'),
      packetHash: text(input?.context?.packetHash, 'Model attempt context packetHash'),
      artifactKinds: [...(input?.context?.artifactKinds ?? [])],
      withheldKinds: [...(input?.context?.withheldKinds ?? [])],
      contextTokensEstimate: input?.context?.contextTokensEstimate ?? null,
    },

    artifact: {
      contract: text(input?.artifact?.contract, 'Model attempt artifact contract'),
      kind: text(input?.artifact?.kind, 'Model attempt artifact kind'),
      value: input?.artifact?.value ?? null,
      hash: text(input?.artifact?.hash, 'Model attempt artifact hash'),
    },

    usage: {
      calls: whole(input?.usage?.calls, 'Model attempt usage calls', { minimum: 0 }),
      inputTokens: whole(input?.usage?.inputTokens, 'Model attempt usage inputTokens', { minimum: 0 }),
      outputTokens: whole(input?.usage?.outputTokens, 'Model attempt usage outputTokens', { minimum: 0 }),
      totalTokens: whole(input?.usage?.totalTokens, 'Model attempt usage totalTokens', { minimum: 0 }),
      costGbp: money(input?.usage?.costGbp, 'Model attempt usage costGbp'),
      durationMs: whole(input?.usage?.durationMs, 'Model attempt usage durationMs', { minimum: 0 }),
    },

    budget: {
      maxCalls: whole(input?.budget?.maxCalls, 'Model attempt budget maxCalls', { minimum: 1 }),
      maxTotalTokens: whole(input?.budget?.maxTotalTokens, 'Model attempt budget maxTotalTokens', { minimum: 1 }),
      maxCostGbp: money(input?.budget?.maxCostGbp, 'Model attempt budget maxCostGbp'),
      maxWallClockMs: whole(input?.budget?.maxWallClockMs, 'Model attempt budget maxWallClockMs', { minimum: 1000 }),
    },

    brokerOperations: [...(input?.brokerOperations ?? [])],
    stopReason: text(input?.stopReason, 'Model attempt stopReason'),
    attemptExitReason: text(input?.attemptExitReason, 'Model attempt exit reason'),
    deterministicChecks: [...(input?.deterministicChecks ?? [])],

    // Never filled in by whatever produced the artifact. `code-reviewer`
    // reviewing its own canary output would be exactly the self-approval this
    // repository's principle 17 forbids.
    reviewerVerdict: null,
    createdAt: moment.toISOString(),
  };

  if (!MODEL_STOP_REASONS.includes(record.stopReason)) {
    throw new Error(`Unknown model stop reason: ${record.stopReason}. A call that ended must name how.`);
  }
  return Object.freeze(assertNoProviderSessionIdentity(record));
}

/**
 * Attach an independent reviewer's verdict.
 *
 * The one rule this enforces is the one that matters: the reviewer may not be
 * the role that produced the artifact. Everything else about a verdict is the
 * `ReviewVerdict` schema's business.
 */
export function recordReviewerVerdict(record, verdict) {
  const reviewer = text(verdict?.reviewer, 'Reviewer identity');
  if (reviewer === record.roleId) {
    throw new Error(`${reviewer} produced this artifact and may not issue its promotion verdict.`);
  }
  const outcome = text(verdict?.verdict, 'Reviewer verdict');
  if (!['pass', 'pass-with-observations', 'rework-required', 'blocked'].includes(outcome)) {
    throw new Error(`Unknown reviewer verdict: ${outcome}`);
  }
  return Object.freeze({
    ...record,
    reviewerVerdict: Object.freeze({
      reviewer,
      reviewerKind: text(verdict?.reviewerKind ?? 'human', 'Reviewer kind'),
      verdict: outcome,
      rationale: text(verdict?.rationale, 'Reviewer rationale'),
      decidedAt: text(verdict?.decidedAt ?? new Date().toISOString(), 'Reviewer decidedAt'),
    }),
  });
}

/**
 * Whether a completed record may be cited as `model-attempt-evidence`.
 *
 * Exit code zero is not evidence, and neither is a produced artifact. The
 * requirement is that a real call happened, the deterministic checks passed,
 * and somebody other than the creator judged the result.
 */
export function modelAttemptEvidenceStatus(record) {
  const missing = [];
  if (!record) return { satisfied: false, missing: ['no model attempt record'] };
  if (record.usage.calls < 1) missing.push('no provider call was made');
  if (record.stopReason !== 'stop') missing.push(`the call stopped with "${record.stopReason}" rather than completing`);
  if (record.artifact.value === null) missing.push('no structured artifact was produced');
  const failed = record.deterministicChecks.filter((check) => check.status !== 'pass');
  if (record.deterministicChecks.length === 0) missing.push('no deterministic check ran on the artifact');
  if (failed.length > 0) missing.push(`deterministic checks failed: ${failed.map((check) => check.id).join(', ')}`);
  if (!record.reviewerVerdict) missing.push('no independent reviewer verdict');
  else if (!['pass', 'pass-with-observations'].includes(record.reviewerVerdict.verdict)) {
    missing.push(`the reviewer returned "${record.reviewerVerdict.verdict}"`);
  }
  return { satisfied: missing.length === 0, missing };
}
