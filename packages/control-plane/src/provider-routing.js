/**
 * Which provider may do this work — asked before anything is allowed to.
 *
 * `model-execution.js` answers a different question. `evaluateModelLane` takes a
 * provider that has *already* been chosen and decides whether this specific call
 * may happen: is the switch on, is the decision valid, does the budget cover it.
 * It is the authorisation of one call.
 *
 * This module is the step in front of it: given a role and the sensitivity of
 * the material, *which* providers are permitted to be considered at all. The two
 * are deliberately separate and both still run. Selection narrows the field;
 * the lane still authorises the call. Nothing here can approve a call, and
 * nothing here is a second control plane — a provider this module selects is a
 * provider `evaluateModelLane` has yet to agree to.
 *
 * ## The rule this exists to enforce
 *
 * A fallback system must never solve a quota problem by leaking private source
 * to a provider that was not approved to receive it.
 *
 * That is the whole reason the module is shaped the way it is. Falling back is
 * easy to write as "try the next one", and "try the next one" is exactly the bug:
 * it inherits the first provider's authority instead of re-earning it. So
 * `selectProvider` evaluates every candidate **from scratch**, against the role
 * and the data class of the actual task, and a provider that has not earned both
 * is not a fallback — it is a refusal with a name.
 *
 * ## Fail closed, in both directions
 *
 * Two defaults do the work:
 *
 * - an **unclassified** task is treated as the most sensitive class there is,
 *   not the least. Material whose sensitivity nobody recorded is material nobody
 *   checked, and the cost of being wrong is asymmetric: over-restricting delays
 *   a task, under-restricting is irreversible;
 * - a provider's `allowedDataClasses` is a **ceiling that must be declared**.
 *   A profile that says nothing allows nothing.
 *
 * ## What is deliberately not here
 *
 * No model chooses its own replacement, and no sandbox labels its own
 * sensitivity. Classification comes from trusted task metadata via
 * `resolveDataClass`; asking the untrusted side "how private is this?" would be
 * the same mistake as letting routed source content carry instructions, which
 * Principle 11 already forbids.
 */

// --- Data sensitivity ---------------------------------------------------------

/**
 * The classes, ordered least to most sensitive. The order *is* the policy: an
 * index comparison is what `allowedDataClasses` means, so adding a class in the
 * wrong position silently changes what every provider may receive.
 *
 * Five, not twenty. A taxonomy nobody can hold in their head is a taxonomy
 * people guess at, and a guess here is the failure this module exists to stop.
 */
export const DATA_CLASSES = Object.freeze([
  'public',
  'synthetic',
  'sanitised',
  'private-source',
  'private-business',
]);

/**
 * `secret` is not on that list, and its absence is the point.
 *
 * Secret material is not a more-restricted routing tier that the right provider
 * could receive — it is never provider-prompt content, at any sensitivity, for
 * any provider, free or paid. Modelling it as `DATA_CLASSES[5]` would invite
 * exactly the reasoning this refuses: "which provider is cleared for secrets?"
 * The answer is none, so it is not a class.
 */
export const SECRET_CLASS = 'secret';

/** The most restrictive class. What an unclassified task is treated as. */
export const MOST_RESTRICTIVE_CLASS = DATA_CLASSES[DATA_CLASSES.length - 1];

export function dataClassRank(dataClass) {
  const index = DATA_CLASSES.indexOf(dataClass);
  if (index < 0) throw new Error(`Unknown data class: ${dataClass}`);
  return index;
}

/**
 * Read a data class from trusted task metadata.
 *
 * Absent, unrecognised, malformed and explicitly-unknown all resolve to the most
 * restrictive class rather than to a default that would route. This is the
 * single most important line in the module: a task whose classification was
 * dropped by a refactor becomes un-routable to free providers, which is a bug
 * that shows up as a blocked task rather than as a leak nobody noticed.
 *
 * `secret` is refused outright rather than clamped, because clamping it to
 * `private-business` would answer "which provider may receive this?" with a
 * provider.
 */
export function resolveDataClass(metadata) {
  const declared = typeof metadata === 'string' ? metadata : metadata?.dataClass;
  const candidate = String(declared ?? '').trim();

  if (candidate === SECRET_CLASS) {
    throw new Error('Secret material is never provider-prompt content. It has no routable data class.');
  }
  if (!DATA_CLASSES.includes(candidate)) {
    return Object.freeze({ dataClass: MOST_RESTRICTIVE_CLASS, declared: candidate || null, inferred: true });
  }
  return Object.freeze({ dataClass: candidate, declared: candidate, inferred: false });
}

// --- Roles that a free provider cannot back into ------------------------------

/**
 * Roles where falling back to whatever answers is not an option.
 *
 * These are the decisions whose cost is not bounded by the task: approving a
 * production change, signing off an architecture, promoting a visual candidate,
 * clearing a migration. A wrong answer from a cheap model is not a cheap wrong
 * answer, so an unavailable reviewer here means *wait*, and never means
 * "substitute a free model that responds".
 *
 * A provider may still earn one of these, but only the way anything is earned
 * here: named explicitly in its own `eligibleRoles` after evidence, never by
 * being the next entry in a ladder.
 */
export const HIGH_RISK_ROLES = Object.freeze([
  'security',
  'red-team',
  'solution-architect',
  'visual-critic',
  'design-critic',
  'product-critic',
]);

// --- Refusals ------------------------------------------------------------------

/**
 * Every way a provider can be refused or fail. Closed, like
 * `MODEL_LANE_DENY_REASONS`, so a refusal is always nameable and an attempt
 * record can be read without guessing.
 *
 * Split by where they happen: the first group is decided here before any
 * network call, the second can only be known after one.
 */
export const PROVIDER_REFUSAL_REASONS = Object.freeze([
  // Selection time.
  'not-configured',
  'not-ready',
  'missing-secret',
  'policy-ineligible',
  'role-ineligible',
  'capability-ineligible',
  'budget-refused',
  'rate-limited',
  'quota-exhausted',
  // Execution time.
  'provider-error',
  'invalid-response',
  'schema-invalid',
]);

/** Cost modes. `free-only` is a refusal to ever become billable, not a preference. */
export const COST_MODES = Object.freeze(['free-only', 'metered']);

/** Runtime availability, as the provider itself reports it. */
export const PROVIDER_AVAILABILITY = Object.freeze([
  'available',
  'rate-limited',
  'quota-exhausted',
  'temporarily-unavailable',
  'provider-error',
]);

// --- Profiles -------------------------------------------------------------------

function list(value, label) {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return Object.freeze(value.map((entry) => String(entry).trim()).filter(Boolean));
}

/**
 * Validate a provider profile.
 *
 * Separating `providerId` from `modelId` is deliberate: `groq` and
 * `openai/gpt-oss-120b` are different facts with different lifetimes, and a
 * profile keyed `groq-gpt-oss` would make the next model change a plumbing
 * change. The adapter is a third: several providers speak one protocol, and the
 * point of naming it separately is that Groq and OpenRouter can share an
 * implementation without sharing a policy.
 *
 * Every data class named must be a real one. A profile permitting
 * `"internal-ish"` would otherwise sit in config looking like policy while
 * matching nothing.
 */
export function createProviderProfile(input) {
  const providerId = String(input?.providerId ?? '').trim();
  if (!providerId) throw new Error('A provider profile needs a providerId.');

  const costMode = String(input?.costMode ?? '').trim();
  if (!COST_MODES.includes(costMode)) {
    throw new Error(`Provider ${providerId} must declare a costMode of ${COST_MODES.join(' or ')}.`);
  }

  const allowedDataClasses = list(input?.allowedDataClasses, 'allowedDataClasses');
  for (const dataClass of allowedDataClasses) {
    if (dataClass === SECRET_CLASS) {
      throw new Error(`Provider ${providerId} may not allow "${SECRET_CLASS}": secret material is never provider-prompt content.`);
    }
    if (!DATA_CLASSES.includes(dataClass)) {
      throw new Error(`Provider ${providerId} allows unknown data class "${dataClass}".`);
    }
  }

  const secretRef = String(input?.secretRef ?? '').trim();
  if (secretRef && /^(sk-|sk_|gsk_|ghp_|xox|Bearer\s)/i.test(secretRef)) {
    // Same guard, same reasoning as `describeProviderSecret`: a profile records
    // where the credential lives, never the credential.
    throw new Error(`Provider ${providerId} secretRef looks like a credential value rather than a reference to one.`);
  }

  return Object.freeze({
    providerId,
    adapterId: String(input?.adapterId ?? '').trim() || null,
    modelId: String(input?.modelId ?? '').trim() || null,
    endpoint: String(input?.endpoint ?? '').trim() || null,
    secretRef: secretRef || null,
    costMode,
    allowedDataClasses,
    eligibleRoles: list(input?.eligibleRoles, 'eligibleRoles'),
    // Separate from `eligibleRoles` on purpose — see the high-risk check in
    // `evaluateProviderCandidate`. A role here that is not also in
    // `eligibleRoles` grants nothing; both are required.
    highRiskRolesApproved: list(input?.highRiskRolesApproved, 'highRiskRolesApproved'),
    structuredOutput: Boolean(input?.structuredOutput),
    maxOutputTokens: Number(input?.maxOutputTokens ?? 0) || null,
    ready: Boolean(input?.ready),
    policyReviewedAt: input?.policyReviewedAt ?? null,
    policySource: input?.policySource ?? null,
  });
}

// --- Candidate evaluation --------------------------------------------------------

const refuse = (providerId, reason, detail) => Object.freeze({ providerId, eligible: false, reason, detail });

/**
 * May this one provider take this one task?
 *
 * Every check is independent of every other provider. That is the property the
 * whole design rests on: a candidate reached by falling back is evaluated by
 * exactly this function, with exactly these arguments, as if it had been the
 * first choice. There is no "already authorised upstream" path, because that
 * path is how a private task ends up at a free provider.
 *
 * The order is chosen for the message rather than for safety — all of them must
 * pass — and policy comes early so that a privacy refusal is reported as a
 * privacy refusal rather than as whatever else also happened to be wrong.
 */
export function evaluateProviderCandidate({
  profile,
  roleId,
  dataClass,
  requiresStructuredOutput = false,
  maxOutputTokens = 0,
  secretConfigured = false,
  availability = 'available',
  wouldBeBillable = false,
}) {
  const { providerId } = profile;

  if (!profile.adapterId || !profile.modelId || !profile.endpoint) {
    return refuse(providerId, 'not-configured', 'The profile has no adapter, model or endpoint.');
  }

  // Policy first. A provider that may not receive this material is refused on
  // that ground even if it is also unready or unfunded, because that is the
  // refusal an operator needs to see in the attempt record.
  if (!profile.allowedDataClasses.includes(dataClass)) {
    return refuse(
      providerId,
      'policy-ineligible',
      `${providerId} is approved for ${profile.allowedDataClasses.join(', ') || 'no data class'}; this task is ${dataClass}.`,
    );
  }

  if (!profile.eligibleRoles.includes(roleId)) {
    return refuse(providerId, 'role-ineligible', `${providerId} has not earned the ${roleId} role.`);
  }

  // A high-risk role needs a second, separate approval — not the same
  // `eligibleRoles` list that grants everything else.
  //
  // One list would make this guard cosmetic: whatever edit put `security` into
  // `eligibleRoles` would already have granted it, and a check that only
  // reworded the outcome would read like a barrier while being none. Two lists
  // mean approving a provider for a cheap review cannot approve it for a
  // release sign-off by accident, because the second grant is a separate line
  // that a reviewer has to write on purpose.
  if (HIGH_RISK_ROLES.includes(roleId) && !profile.highRiskRolesApproved.includes(roleId)) {
    return refuse(
      providerId,
      'role-ineligible',
      `${roleId} is a high-risk role and ${providerId} has no separate approval for it. An unavailable reviewer here means wait, not substitute.`,
    );
  }

  if (!profile.ready) return refuse(providerId, 'not-ready', `${providerId} has no recorded canary result for this role.`);

  if (requiresStructuredOutput && !profile.structuredOutput) {
    return refuse(providerId, 'capability-ineligible', `${providerId} cannot produce the structured output this task requires.`);
  }
  if (maxOutputTokens && profile.maxOutputTokens && maxOutputTokens > profile.maxOutputTokens) {
    return refuse(providerId, 'capability-ineligible', `Task asks for ${maxOutputTokens} output tokens; ${providerId} permits ${profile.maxOutputTokens}.`);
  }

  if (!profile.secretRef) return refuse(providerId, 'missing-secret', `${providerId} declares no credential reference.`);
  if (!secretConfigured) return refuse(providerId, 'missing-secret', `No credential is configured at ${profile.secretRef}.`);

  // Zero-cost is a refusal, not a preference. A free-only profile whose free
  // allowance is gone must fail rather than quietly become a paid call — the
  // operator asked for continuity, not for a bill.
  if (profile.costMode === 'free-only' && wouldBeBillable) {
    return refuse(providerId, 'budget-refused', `${providerId} is free-only and this request would be billable.`);
  }

  // Runtime state last, because it is the only thing here that is true of a
  // moment rather than of a policy — and because the provider's own answer is
  // authoritative over anything configuration claims about its quotas.
  if (availability === 'rate-limited') return refuse(providerId, 'rate-limited', `${providerId} reported a rate limit.`);
  if (availability === 'quota-exhausted') return refuse(providerId, 'quota-exhausted', `${providerId} reported its quota exhausted.`);
  if (availability === 'temporarily-unavailable') return refuse(providerId, 'provider-error', `${providerId} is temporarily unavailable.`);
  if (availability === 'provider-error') return refuse(providerId, 'provider-error', `${providerId} reported an error.`);

  return Object.freeze({ providerId, eligible: true, reason: null, detail: null });
}

// --- Selection ---------------------------------------------------------------------

/** The durable state a task enters when nothing may do it. */
export const WAITING_FOR_PROVIDER = 'waiting-for-provider';

/**
 * Choose a provider, or produce a durable wait.
 *
 * Order comes from the caller's configured preference and is not a global
 * ranking: "best available" depends on the role and the material, so a fixed
 * ladder would encode a decision that belongs to the task.
 *
 * Exhaustion is not failure. A task nobody may do right now is a task that
 * waits, with the providers considered and the reason each was refused recorded
 * so the wait can be explained and re-evaluated later. Dropping it instead —
 * or downgrading it to something that answers — is the outcome this returns a
 * state for.
 */
export function selectProvider({
  profiles,
  roleId,
  dataClass,
  requiresStructuredOutput = false,
  maxOutputTokens = 0,
  secretConfigured = () => false,
  availability = () => 'available',
  wouldBeBillable = () => false,
}) {
  const attempts = [];

  for (const profile of profiles) {
    const verdict = evaluateProviderCandidate({
      profile,
      roleId,
      dataClass,
      requiresStructuredOutput,
      maxOutputTokens,
      secretConfigured: Boolean(secretConfigured(profile)),
      availability: availability(profile),
      wouldBeBillable: Boolean(wouldBeBillable(profile)),
    });
    attempts.push(verdict);
    if (verdict.eligible) {
      return Object.freeze({
        selected: profile,
        state: 'selected',
        attempts: Object.freeze(attempts),
        blockedReason: null,
      });
    }
  }

  return Object.freeze({
    selected: null,
    state: WAITING_FOR_PROVIDER,
    attempts: Object.freeze(attempts),
    // Named so a reader can tell "nothing is approved for this material" from
    // "everything approved for it is busy", because only one of those is
    // fixed by waiting.
    blockedReason: attempts.some((attempt) => attempt.reason === 'rate-limited' || attempt.reason === 'quota-exhausted')
      ? 'all-eligible-providers-exhausted'
      : 'no-eligible-provider',
  });
}

/**
 * Accept a provider's answer, or refuse it.
 *
 * A provider is an untrusted source that was asked politely for a shape. What
 * comes back is text, and text is not an artifact until trusted code has said
 * so — the same position `model-provider-anthropic.mjs` takes when it refuses a
 * response with no token usage rather than defaulting it to zero.
 *
 * The two failures are separated because they mean different things about the
 * provider. `invalid-response` is "this is not JSON at all", which is a provider
 * or prompt problem. `schema-invalid` is "this is JSON that does not satisfy the
 * contract", which is a model that answered the wrong question — and a canary
 * needs to tell those apart to say what a provider has actually earned.
 *
 * Nothing partial is returned on either path. A half-parsed verdict is the kind
 * of value that gets used because it exists.
 */
export function acceptProviderArtifact({ text, validate = () => true }) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? ''));
  } catch {
    return Object.freeze({ accepted: false, reason: 'invalid-response', artifact: null });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return Object.freeze({ accepted: false, reason: 'invalid-response', artifact: null });
  }

  let valid = false;
  try {
    valid = validate(parsed) === true;
  } catch {
    // A validator that threw has not approved anything. Treating an exception as
    // anything but a refusal would make a broken schema an open door.
    valid = false;
  }
  if (!valid) return Object.freeze({ accepted: false, reason: 'schema-invalid', artifact: null });

  return Object.freeze({ accepted: true, reason: null, artifact: parsed });
}

/**
 * The attempt record, safe to persist.
 *
 * Reasons and provider ids only. No prompt, because the durable task context
 * already owns it and storing it twice would put the material in a second place
 * with its own lifetime — and no credential, because `secretRef` is a name and
 * the value never reaches this module at all.
 */
export function describeProviderAttempts(result, { roleId, dataClass }) {
  return Object.freeze({
    roleId,
    dataClass,
    state: result.state,
    selectedProviderId: result.selected?.providerId ?? null,
    blockedReason: result.blockedReason,
    attempts: Object.freeze(result.attempts.map((attempt) => Object.freeze({
      providerId: attempt.providerId,
      eligible: attempt.eligible,
      reason: attempt.reason,
      detail: attempt.detail,
    }))),
  });
}
