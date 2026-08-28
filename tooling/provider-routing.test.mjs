/**
 * Provider-routing coverage.
 *
 * The router exists for one sentence — *a fallback system must never solve a
 * quota problem by leaking private source to a provider that was not approved
 * to receive it* — and a test suite for it is worth very little if it only
 * proves the happy path. So the refusals are the subject here, and the two that
 * matter most are given planted failures:
 *
 * - the **privacy** refusal, because the tempting bug is "try the next one",
 *   and "try the next one" is exactly how a private task reaches a free
 *   provider;
 * - the **kill switch**, because adding a provider router is precisely the kind
 *   of change that could quietly introduce a second path to a provider call.
 *   That one is tested through the real `evaluateModelLane`, not a stand-in.
 *
 * The committed profiles are asserted separately from the routing logic. Both
 * can be wrong independently: correct code reading a profile that grants too
 * much is still a leak.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { evaluateModelLane } from '@app-builder/control-plane/model-execution';
import {
  COST_MODES,
  DATA_CLASSES,
  HIGH_RISK_ROLES,
  MOST_RESTRICTIVE_CLASS,
  PROVIDER_REFUSAL_REASONS,
  SECRET_CLASS,
  WAITING_FOR_PROVIDER,
  acceptProviderArtifact,
  createProviderProfile,
  describeProviderAttempts,
  evaluateProviderCandidate,
  resolveDataClass,
  selectProvider,
} from '@app-builder/control-plane/provider-routing';

/** A provider that has earned a cheap read-only role on non-private material. */
const proven = (overrides = {}) => createProviderProfile({
  providerId: 'groq',
  adapterId: 'openai-compatible',
  modelId: 'openai/gpt-oss-120b',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  secretRef: 'GROQ_API_KEY',
  costMode: 'free-only',
  allowedDataClasses: ['public', 'synthetic', 'sanitised'],
  eligibleRoles: ['code-reviewer'],
  structuredOutput: true,
  maxOutputTokens: 8192,
  ready: true,
  ...overrides,
});

const ALL_CONFIGURED = () => true;

// --- Selection ------------------------------------------------------------------

test('an eligible ready provider is selected', () => {
  const result = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
  });

  assert.equal(result.state, 'selected');
  assert.equal(result.selected.providerId, 'groq');
});

test('a rate-limited provider falls through to an independently eligible one', () => {
  const result = selectProvider({
    profiles: [proven(), proven({ providerId: 'gemini', adapterId: 'google-generative-language', modelId: 'gemini-2.0-flash', endpoint: 'https://example.invalid/v1', secretRef: 'GEMINI_API_KEY' })],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
    availability: (profile) => (profile.providerId === 'groq' ? 'rate-limited' : 'available'),
  });

  assert.equal(result.state, 'selected');
  assert.equal(result.selected.providerId, 'gemini');
  assert.equal(result.attempts[0].reason, 'rate-limited');
});

test('quota exhaustion is a named refusal, not an error', () => {
  const result = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
    availability: () => 'quota-exhausted',
  });

  assert.equal(result.state, WAITING_FOR_PROVIDER);
  assert.equal(result.attempts[0].reason, 'quota-exhausted');
  assert.equal(result.blockedReason, 'all-eligible-providers-exhausted', 'a busy provider is a different problem from no approved provider');
});

// --- The refusal this module exists for -------------------------------------------

test('private source is refused by a free provider even when nothing else is available', () => {
  // The planted failure: provider A is gone, provider B answers, and B is the
  // free provider. "Try the next one" would send private source to Groq here.
  const result = selectProvider({
    profiles: [
      proven({ providerId: 'preferred', costMode: 'metered', allowedDataClasses: [...DATA_CLASSES] }),
      proven(),
    ],
    roleId: 'code-reviewer',
    dataClass: 'private-source',
    secretConfigured: ALL_CONFIGURED,
    availability: (profile) => (profile.providerId === 'preferred' ? 'quota-exhausted' : 'available'),
  });

  assert.equal(result.selected, null, 'private source must not reach a provider approved only for public material');
  assert.equal(result.state, WAITING_FOR_PROVIDER);

  const groq = result.attempts.find((attempt) => attempt.providerId === 'groq');
  assert.equal(groq.reason, 'policy-ineligible');
  assert.match(groq.detail, /private-source/);
});

test('a fallback provider re-earns the role rather than inheriting it', () => {
  const result = selectProvider({
    profiles: [proven({ providerId: 'preferred' }), proven({ eligibleRoles: ['summary'] })],
    roleId: 'code-reviewer',
    dataClass: 'public',
    secretConfigured: ALL_CONFIGURED,
    availability: (profile) => (profile.providerId === 'preferred' ? 'rate-limited' : 'available'),
  });

  assert.equal(result.selected, null);
  assert.equal(result.attempts.find((attempt) => attempt.providerId === 'groq').reason, 'role-ineligible');
});

test('high-risk roles do not fall back to whatever answers', () => {
  for (const roleId of HIGH_RISK_ROLES) {
    // The provider is ready and the role is in `eligibleRoles` — everything a
    // cheap role would need. A high-risk role needs more.
    const result = selectProvider({
      profiles: [proven({ eligibleRoles: [roleId], ready: true })],
      roleId,
      dataClass: 'public',
      secretConfigured: ALL_CONFIGURED,
    });

    assert.equal(result.selected, null, `${roleId} must wait rather than accept a provider that only earned the cheap list`);
    assert.equal(result.attempts[0].reason, 'role-ineligible');
    assert.match(result.attempts[0].detail, /separate approval/);
  }
});

test('the high-risk barrier is a second grant, not a reworded first one', () => {
  // Proves the guard is load bearing rather than cosmetic: the *only*
  // difference between these two calls is the separate approval list.
  const roleId = 'security';
  const withoutApproval = selectProvider({
    profiles: [proven({ eligibleRoles: [roleId], ready: true })],
    roleId,
    dataClass: 'public',
    secretConfigured: ALL_CONFIGURED,
  });
  const withApproval = selectProvider({
    profiles: [proven({ eligibleRoles: [roleId], ready: true, highRiskRolesApproved: [roleId] })],
    roleId,
    dataClass: 'public',
    secretConfigured: ALL_CONFIGURED,
  });

  assert.equal(withoutApproval.selected, null);
  assert.equal(withApproval.state, 'selected', 'a deliberate second grant is what makes it available');
});

test('a high-risk approval alone grants nothing', () => {
  // Both lists are required. An approval that bypassed `eligibleRoles` would
  // make the second list a way around the first rather than an addition to it.
  const result = selectProvider({
    profiles: [proven({ eligibleRoles: ['code-reviewer'], ready: true, highRiskRolesApproved: ['security'] })],
    roleId: 'security',
    dataClass: 'public',
    secretConfigured: ALL_CONFIGURED,
  });

  assert.equal(result.selected, null);
  assert.equal(result.attempts[0].reason, 'role-ineligible');
});

// --- Money -------------------------------------------------------------------------

test('a free-only provider refuses to become a billable call', () => {
  const result = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
    wouldBeBillable: () => true,
  });

  assert.equal(result.selected, null, 'exhausting a free allowance does not authorise spending money');
  assert.equal(result.attempts[0].reason, 'budget-refused');
});

test('a metered provider is unaffected by the free-only refusal', () => {
  const result = selectProvider({
    profiles: [proven({ costMode: 'metered' })],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
    wouldBeBillable: () => true,
  });

  assert.equal(result.state, 'selected');
});

// --- Exhaustion ---------------------------------------------------------------------

test('exhausting every provider produces a durable wait, not a dropped task', () => {
  const result = selectProvider({
    profiles: [proven(), proven({ providerId: 'gemini' })],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
    availability: () => 'rate-limited',
  });

  assert.equal(result.state, WAITING_FOR_PROVIDER);
  assert.equal(result.attempts.length, 2, 'every provider considered is recorded, so the wait can be explained');

  const record = describeProviderAttempts(result, { roleId: 'code-reviewer', dataClass: 'synthetic' });
  assert.equal(record.state, WAITING_FOR_PROVIDER);
  assert.equal(record.selectedProviderId, null);
  assert.ok(record.attempts.every((attempt) => attempt.reason));
});

test('a missing credential is a refusal with a name', () => {
  const result = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: () => false,
  });

  assert.equal(result.attempts[0].reason, 'missing-secret');
  assert.equal(result.state, WAITING_FOR_PROVIDER);
});

test('an unconfigured profile is refused before anything else is asked of it', () => {
  const result = selectProvider({
    profiles: [createProviderProfile({ providerId: 'mistral', secretRef: 'MISTRAL_API_KEY', costMode: 'free-only' })],
    roleId: 'code-reviewer',
    dataClass: 'public',
    secretConfigured: ALL_CONFIGURED,
  });

  assert.equal(result.attempts[0].reason, 'not-configured');
});

// --- Classification -------------------------------------------------------------------

test('unclassified material is treated as the most sensitive, never the least', () => {
  for (const metadata of [undefined, null, {}, { dataClass: '' }, { dataClass: 'internal-ish' }, 'unknown']) {
    const resolved = resolveDataClass(metadata);
    assert.equal(resolved.dataClass, MOST_RESTRICTIVE_CLASS, `${JSON.stringify(metadata)} must fail closed`);
    assert.equal(resolved.inferred, true);
  }
});

test('unclassified material therefore cannot reach a free provider', () => {
  const { dataClass } = resolveDataClass({ taskId: 'task-with-no-classification' });
  const result = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass,
    secretConfigured: ALL_CONFIGURED,
  });

  assert.equal(result.selected, null);
  assert.equal(result.attempts[0].reason, 'policy-ineligible');
});

test('a declared class is honoured and marked as declared', () => {
  const resolved = resolveDataClass({ dataClass: 'synthetic' });
  assert.equal(resolved.dataClass, 'synthetic');
  assert.equal(resolved.inferred, false);
});

test('secret material has no routable class at all', () => {
  assert.throws(() => resolveDataClass({ dataClass: SECRET_CLASS }), /never provider-prompt content/);
  assert.ok(!DATA_CLASSES.includes(SECRET_CLASS), 'secret must not be a routing tier that some provider could be cleared for');
  assert.throws(
    () => createProviderProfile({ providerId: 'x', costMode: 'free-only', allowedDataClasses: [SECRET_CLASS] }),
    /never provider-prompt content/,
  );
});

// --- Provider answers ----------------------------------------------------------------

test('a malformed provider response is not an artifact', () => {
  for (const text of ['not json at all', '', '[1,2,3]', 'null', '{"unterminated": ']) {
    const result = acceptProviderArtifact({ text });
    assert.equal(result.accepted, false, `${JSON.stringify(text)} must not be accepted`);
    assert.equal(result.reason, 'invalid-response');
    assert.equal(result.artifact, null);
  }
});

test('valid JSON that violates the contract is refused separately', () => {
  const result = acceptProviderArtifact({
    text: JSON.stringify({ verdict: 'looks-fine' }),
    validate: (value) => ['pass', 'rework-required'].includes(value.verdict),
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'schema-invalid', 'a model that answered the wrong question is a different fact from a broken provider');
});

test('a validator that throws refuses rather than admits', () => {
  const result = acceptProviderArtifact({
    text: '{"verdict":"pass"}',
    validate: () => { throw new Error('schema failed to compile'); },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'schema-invalid');
});

test('a conforming answer is accepted', () => {
  const result = acceptProviderArtifact({
    text: JSON.stringify({ verdict: 'pass' }),
    validate: (value) => value.verdict === 'pass',
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(result.artifact, { verdict: 'pass' });
});

// --- No bypass -------------------------------------------------------------------------

test('an eligible provider and a configured secret still make no call while the switch is off', () => {
  // The planted failure this suite most needs. Selection succeeds, the
  // credential is present, and the master switch is off — the lane must still
  // refuse, or the router has become a second way to reach a provider.
  const selection = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass: 'synthetic',
    secretConfigured: ALL_CONFIGURED,
  });
  assert.equal(selection.state, 'selected', 'precondition: routing would allow this');

  const verdict = evaluateModelLane({
    killSwitch: { enabled: false, detail: 'committed default', providerSecret: { configured: true, secretRef: 'GROQ_API_KEY' } },
    decision: { decisionId: 'd1', roleId: 'code-reviewer', taskId: 't1', projectId: 'p1', adapterId: 'openai-compatible', model: 'openai/gpt-oss-120b', environment: 'development', expiresAt: new Date(Date.now() + 60000).toISOString(), notBefore: new Date(Date.now() - 1000).toISOString(), mutationPermitted: false, budget: { maxCalls: 1, maxOutputTokensPerCall: 1000, maxTotalTokens: 1000, maxCostGbp: 1 }, pricingGbpPerMillionTokens: { input: 0, output: 0 } },
    request: { roleId: 'code-reviewer', taskId: 't1', projectId: 'p1', adapterId: 'openai-compatible', model: 'openai/gpt-oss-120b', attemptId: 'a1', maxOutputTokens: 100 },
  });

  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'kill-switch-disabled', 'adding providers must not create a bypass');
});

// --- Secrets ---------------------------------------------------------------------------

test('no credential value survives into an attempt record', () => {
  const planted = 'gsk_PLANTEDGROQSECRET0123456789';
  const result = selectProvider({
    profiles: [proven()],
    roleId: 'code-reviewer',
    dataClass: 'private-source',
    secretConfigured: ALL_CONFIGURED,
  });

  const rendered = JSON.stringify(describeProviderAttempts(result, { roleId: 'code-reviewer', dataClass: 'private-source' }));
  assert.ok(!rendered.includes(planted));
  // The reference may appear — it is a name. The value never can, and there is
  // no field on the record that could carry one.
  assert.ok(!/gsk_|sk-[a-z]/i.test(rendered), 'an attempt record must carry references, never credentials');
});

test('a profile refuses to hold a credential in place of a reference', () => {
  assert.throws(
    () => createProviderProfile({ providerId: 'groq', costMode: 'free-only', secretRef: 'gsk_PLANTEDGROQSECRET0123456789' }),
    /reference/,
  );
});

// --- The committed profiles -------------------------------------------------------------

test('every shipped profile is valid and grants nothing yet', () => {
  const config = JSON.parse(fs.readFileSync('config/provider-profiles.json', 'utf8'));
  assert.ok(config.profiles.length > 0);

  for (const raw of config.profiles) {
    const profile = createProviderProfile(raw);
    assert.deepEqual(
      profile.eligibleRoles,
      [],
      `${profile.providerId} ships with an earned role. A role is earned by a recorded canary, not by editing config.`,
    );
    assert.equal(profile.ready, false, `${profile.providerId} ships ready. Readiness is evidence, not a default.`);
    assert.deepEqual(
      profile.highRiskRolesApproved,
      [],
      `${profile.providerId} ships approved for a high-risk role. Security, release and architecture sign-off are earned separately or not at all.`,
    );
    assert.ok(COST_MODES.includes(profile.costMode));
    for (const dataClass of profile.allowedDataClasses) {
      assert.ok(
        ['public', 'synthetic', 'sanitised'].includes(dataClass),
        `${profile.providerId} is approved for ${dataClass} with no recorded policy review`,
      );
    }
  }
});

test('no shipped profile can be selected for anything today', () => {
  const config = JSON.parse(fs.readFileSync('config/provider-profiles.json', 'utf8'));
  const profiles = config.profiles.map(createProviderProfile);

  for (const dataClass of DATA_CLASSES) {
    const result = selectProvider({
      profiles,
      roleId: 'code-reviewer',
      dataClass,
      secretConfigured: ALL_CONFIGURED,
    });
    assert.equal(result.selected, null, `a shipped profile was selectable for ${dataClass} before any canary ran`);
  }
});

test('the refusal taxonomy is closed', () => {
  const seen = new Set();
  const profile = proven();
  for (const availability of ['rate-limited', 'quota-exhausted', 'temporarily-unavailable', 'provider-error']) {
    seen.add(evaluateProviderCandidate({ profile, roleId: 'code-reviewer', dataClass: 'public', secretConfigured: true, availability }).reason);
  }
  for (const reason of seen) {
    assert.ok(PROVIDER_REFUSAL_REASONS.includes(reason), `${reason} is not a declared refusal reason`);
  }
});
