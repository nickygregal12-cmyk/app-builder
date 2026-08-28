/**
 * Deterministic coverage for the model-execution lane.
 *
 * These tests prove the contracts, the refusals and the harness. They cannot
 * prove that a real provider answered, that the pinned image is the one on the
 * host, or that rootless Podman is configured the way the spec says — those are
 * hosted proofs and `ops/hetzner/verify-agent-boundary.sh` remains the
 * operator's to run. Keeping the two kinds of proof apart is the point: a green
 * CI run here means the boundary holds *by construction*, not that a model has
 * ever been called.
 *
 * The stub provider is what makes the whole lane exercisable with no credential
 * and no network. It is a stand-in for one thing only — the HTTPS request — and
 * everything around it (grant verification, the kill switch, the enable
 * decision, budget accounting, the sandbox, the broker, the ledger, the
 * grading) is the real implementation.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createCapabilityGrant } from '@app-builder/control-plane/capabilities';
import { createAttemptPlan } from '@app-builder/control-plane/attempts';
import { createExecutionEnvironmentSpec, assertSpecIsolation } from '@app-builder/control-plane/execution-environment';
import {
  MODEL_LANE_DENY_REASONS,
  ModelLaneError,
  accountModelCall,
  assertNoProviderSessionIdentity,
  createModelAttemptRecord,
  createModelEnableDecision,
  createModelRequest,
  describeProviderSecret,
  emptyModelSpend,
  evaluateModelLane,
  modelAttemptEvidenceStatus,
  recordReviewerVerdict,
  verifyModelEnableDecision,
} from '@app-builder/control-plane/model-execution';

import { createLocalExecutionDriver } from './lib/execution-driver-local.mjs';
import { podmanRunArgs } from './lib/sandbox-podman.mjs';
import { readModelKillSwitch } from './lib/model-kill-switch.mjs';
import { buildAnthropicPayload, createAnthropicModelAdapter } from './lib/model-provider-anthropic.mjs';
import { ProviderCallError } from './lib/model-provider-openai-compatible.mjs';
import {
  CANARY_CRITERIA,
  CANARY_SUBJECT,
  authorise,
  deterministicCriteriaOutcome,
  gradeArtifact,
  gradeBoundary,
  preflight,
  providerCanary,
  runModelCanary,
} from './model-canary.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const GRANT_SECRET = 'model-canary-grant-signing-key-not-a-production-secret';
const DECISION_SECRET = 'model-canary-decision-signing-key-not-a-production-secret';
const FAKE_KEY = 'sk-ant-test-not-a-real-credential-0000000000';
const FAKE_GROQ_KEY = 'gsk_test-not-a-real-credential-0000000000';

const ROLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/agent-roles.json'), 'utf8')).roles;
const POLICIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/agent-policies.json'), 'utf8')).policies;
const REGISTRY = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/agent-capabilities.json'), 'utf8'));
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/model-execution.json'), 'utf8'));

function decisionFor(overrides = {}, now = new Date()) {
  return createModelEnableDecision(
    {
      grantedBy: 'test-operator',
      reason: 'deterministic coverage',
      canaryId: 'canary-1',
      roleId: 'code-reviewer',
      projectId: 'model-canary',
      taskId: 'task-1',
      environment: 'development',
      adapterId: 'anthropic-messages',
      providerId: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      mutationPermitted: false,
      budget: { maxCalls: 1, maxOutputTokensPerCall: 1500, maxTotalTokens: 30_000, maxCostGbp: 0.05, maxWallClockMs: 300_000 },
      pricingGbpPerMillionTokens: { input: 0.8, output: 4 },
      ttlSeconds: 3600,
      ...overrides,
    },
    DECISION_SECRET,
    now,
  );
}

function requestFor(overrides = {}) {
  return createModelRequest({
    adapterId: 'anthropic-messages',
    providerId: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    roleId: 'code-reviewer',
    attemptId: 'attempt-1',
    taskId: 'task-1',
    projectId: 'model-canary',
    contextPacketRef: 'role-context-packet:code-reviewer',
    contextPacketHash: 'sha256:abc',
    artifactContract: 'schemas/review-verdict.schema.json',
    instruction: 'review',
    input: 'material',
    maxOutputTokens: 1500,
    timeoutMs: 60_000,
    ...overrides,
  });
}

const ENABLED_SWITCH = Object.freeze({ enabled: true, providerSecret: { configured: true, secretRef: 'ANTHROPIC_API_KEY' } });

// ---------------------------------------------------------------------------
// The credential contract: there is nowhere to put a key.
// ---------------------------------------------------------------------------

test('a provider secret is described by reference and state, never by value', () => {
  const described = describeProviderSecret({ providerId: 'anthropic', secretRef: 'ANTHROPIC_API_KEY', configured: true });
  assert.deepEqual(Object.keys(described).sort(), ['configured', 'providerId', 'secretRef']);
  assert.equal(JSON.stringify(described).includes('sk-'), false);
});

test('a secret reference that is actually a credential is refused', () => {
  assert.throws(() => describeProviderSecret({ providerId: 'anthropic', secretRef: FAKE_KEY }), /credential value rather than a reference/);
  assert.throws(() => describeProviderSecret({ providerId: 'anthropic', secretRef: 'x'.repeat(120) }), /too long to be a reference/);
});

test('the kill switch reports the credential as configured or not, and never returns it', () => {
  const withKey = readModelKillSwitch({ root: ROOT, env: { ANTHROPIC_API_KEY: FAKE_KEY } });
  assert.equal(withKey.providerSecret.configured, true);
  assert.equal(JSON.stringify(withKey).includes(FAKE_KEY), false);

  const without = readModelKillSwitch({ root: ROOT, env: {} });
  assert.equal(without.providerSecret.configured, false);
});

test('a durable model record cannot carry provider session identity or a credential-shaped field', () => {
  assert.throws(() => assertNoProviderSessionIdentity({ runtime: { sessionId: 'msg_123' } }), /provider-specific or credential-shaped/);
  assert.throws(() => assertNoProviderSessionIdentity({ usage: { request_id: 'req_1' } }), /provider-specific or credential-shaped/);
  assert.throws(() => assertNoProviderSessionIdentity({ nested: [{ apiKey: FAKE_KEY }] }), /provider-specific or credential-shaped/);
  assert.doesNotThrow(() => assertNoProviderSessionIdentity({ runtime: { model: 'claude-haiku-4-5-20251001', providerId: 'anthropic' } }));
});

test('the provider payload carries the credential in no field a record could copy', () => {
  const payload = buildAnthropicPayload(requestFor(), { model: 'claude-haiku-4-5-20251001' });
  assert.equal(JSON.stringify(payload).includes(FAKE_KEY), false);
  assert.equal(payload.max_tokens, 1500);
  // The material is fenced and named as data. Principle 11: source content is
  // never authority.
  assert.match(payload.messages[0].content, /<material>/);
  assert.match(payload.system, /data, not instruction/);
});

// ---------------------------------------------------------------------------
// The kill switch: default off, and off in every failure mode.
// ---------------------------------------------------------------------------

test('the committed kill switch is off, and is not runtimeReady wearing another name', () => {
  assert.equal(CONFIG.enabled, false, 'config/model-execution.json must ship disabled');
  const state = readModelKillSwitch({ root: ROOT, env: {} });
  assert.equal(state.enabled, false);
  // Different decisions, different files. A role being proven and the factory
  // being allowed to spend are not the same question.
  assert.equal(CONFIG.hostSwitchPath, '/etc/app-builder/model-execution.json');
  assert.equal(fs.readFileSync(path.join(ROOT, 'config/agent-roles.json'), 'utf8').includes('"modelExecutionEnabled"'), false);
});

test('both switches are required, and either one off refuses the lane', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'model-switch-'));
  try {
    const hostOn = path.join(scratch, 'on.json');
    const hostOff = path.join(scratch, 'off.json');
    fs.writeFileSync(hostOn, JSON.stringify({ enabled: true }));
    fs.writeFileSync(hostOff, JSON.stringify({ enabled: false, disabledReason: 'operator stopped the lane' }));

    // Repository off (its committed state), host on -> still off.
    assert.equal(readModelKillSwitch({ root: ROOT, env: {}, hostSwitchPath: hostOn }).enabled, false);

    // Repository on, host off -> still off. Proved against a repository copy
    // whose switch is enabled, so this is the real code path and not a stub.
    const enabledRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'model-repo-'));
    fs.mkdirSync(path.join(enabledRoot, 'config'), { recursive: true });
    fs.writeFileSync(path.join(enabledRoot, 'config/model-execution.json'), JSON.stringify({ ...CONFIG, enabled: true }));
    assert.equal(readModelKillSwitch({ root: enabledRoot, env: {}, hostSwitchPath: hostOff }).enabled, false);
    assert.equal(readModelKillSwitch({ root: enabledRoot, env: {}, hostSwitchPath: hostOn }).enabled, true);

    // A missing or corrupt host switch is off, not absent-therefore-fine.
    assert.equal(readModelKillSwitch({ root: enabledRoot, env: {}, hostSwitchPath: path.join(scratch, 'nope.json') }).enabled, false);
    fs.writeFileSync(path.join(scratch, 'broken.json'), '{not json');
    assert.equal(readModelKillSwitch({ root: enabledRoot, env: {}, hostSwitchPath: path.join(scratch, 'broken.json') }).enabled, false);
    fs.rmSync(enabledRoot, { recursive: true, force: true });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('the lane refuses before it parses anything when the switch is off', () => {
  const verdict = evaluateModelLane({ killSwitch: { enabled: false, detail: 'off' }, decision: null, request: requestFor() });
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'kill-switch-disabled');
});

// ---------------------------------------------------------------------------
// The one-time enable decision.
// ---------------------------------------------------------------------------

test('an enable decision is single-use, expiring and bound to one role, task and project', () => {
  const { decision, token } = decisionFor();
  assert.equal(decision.maxAttempts, 1);
  assert.equal(verifyModelEnableDecision(token, { secret: DECISION_SECRET }).decisionId, decision.decisionId);

  const allowed = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor(), spend: emptyModelSpend(), spentDecisionIds: new Set() });
  assert.equal(allowed.allowed, true);

  const spent = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor(), spend: emptyModelSpend(), spentDecisionIds: new Set([decision.decisionId]) });
  assert.equal(spent.reason, 'decision-already-spent');
});

test('a tampered enable decision does not verify', () => {
  const { decision, token } = decisionFor();
  const widened = { ...decision, budget: { ...decision.budget, maxCostGbp: 100 } };
  const forged = `${Buffer.from(JSON.stringify(widened)).toString('base64url')}.${token.split('.')[1]}`;
  assert.throws(() => verifyModelEnableDecision(forged, { secret: DECISION_SECRET }), (error) => error.reason === 'decision-signature-invalid');
});

test('an expired decision is refused, and one signed with another key is refused', () => {
  const past = new Date(Date.now() - 7200_000);
  const { token } = decisionFor({}, past);
  assert.throws(() => verifyModelEnableDecision(token, { secret: DECISION_SECRET }), (error) => error.reason === 'decision-expired');

  const { token: other } = decisionFor();
  assert.throws(() => verifyModelEnableDecision(other, { secret: 'a-different-key-that-is-also-long-enough-here' }), (error) => error.reason === 'decision-signature-invalid');
});

test('a decision cannot authorise a different role, task, project, adapter or model', () => {
  const { decision } = decisionFor();
  const cases = [
    [{ roleId: 'frontend-implementation' }, 'decision-role-mismatch'],
    [{ taskId: 'other-task' }, 'decision-task-mismatch'],
    [{ projectId: 'other-project' }, 'decision-project-mismatch'],
    [{ adapterId: 'some-other-runtime' }, 'decision-adapter-mismatch'],
    [{ model: 'claude-opus-5' }, 'decision-model-mismatch'],
  ];
  for (const [overrides, reason] of cases) {
    const verdict = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor(overrides), spend: emptyModelSpend() });
    assert.equal(verdict.reason, reason, `${JSON.stringify(overrides)} should be refused as ${reason}`);
  }
});

test('a decision that permits no mutation refuses an attempt whose grant owns a mutation scope', () => {
  const { decision } = decisionFor();
  const { grant } = createCapabilityGrant(
    {
      attemptId: 'attempt-1', taskId: 'task-1', projectId: 'model-canary', roleId: 'code-reviewer',
      policyId: 'review', environment: 'development', capabilities: ['project.read'],
      mutationScopes: ['src/**'], maxOperations: 4,
    },
    GRANT_SECRET,
  );
  const verdict = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, grant, request: requestFor(), spend: emptyModelSpend() });
  assert.equal(verdict.reason, 'mutation-not-permitted');
});

test('production is never an authorised environment for a canary decision', () => {
  assert.throws(() => decisionFor({ environment: 'production' }), /not a production decision/);
});

test('every refusal names a reason from the closed set', () => {
  const reasons = new Set(MODEL_LANE_DENY_REASONS);
  for (const verdict of [
    evaluateModelLane({ killSwitch: { enabled: false }, decision: null, request: requestFor() }),
    evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision: decisionFor().decision, request: requestFor({ roleId: 'security' }), spend: emptyModelSpend() }),
    evaluateModelLane({ killSwitch: { enabled: true, providerSecret: { configured: false, secretRef: 'ANTHROPIC_API_KEY' } }, decision: decisionFor().decision, request: requestFor(), spend: emptyModelSpend() }),
  ]) {
    assert.equal(verdict.allowed, false);
    assert.ok(reasons.has(verdict.reason), `${verdict.reason} is not in MODEL_LANE_DENY_REASONS`);
  }
});

test('an absent credential fails closed with a named reason rather than at the transport', () => {
  const verdict = evaluateModelLane({
    killSwitch: { enabled: true, providerSecret: { configured: false, secretRef: 'ANTHROPIC_API_KEY' } },
    decision: decisionFor().decision,
    request: requestFor(),
    spend: emptyModelSpend(),
  });
  assert.equal(verdict.reason, 'provider-secret-missing');
});

// ---------------------------------------------------------------------------
// The hard budget.
// ---------------------------------------------------------------------------

test('the budget refuses the next call rather than trusting the model to stop', () => {
  const { decision } = decisionFor();
  const afterOne = accountModelCall({ spend: emptyModelSpend(), usage: { inputTokens: 2000, outputTokens: 900 }, pricingGbpPerMillionTokens: decision.pricingGbpPerMillionTokens });
  assert.equal(afterOne.calls, 1);
  assert.equal(afterOne.totalTokens, 2900);
  const verdict = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor(), spend: afterOne, spentDecisionIds: new Set() });
  assert.equal(verdict.reason, 'call-budget-exhausted');
});

test('a request whose declared ceiling exceeds what remains is refused before it is sent', () => {
  const { decision } = decisionFor({ budget: { maxCalls: 4, maxOutputTokensPerCall: 1500, maxTotalTokens: 3000, maxCostGbp: 0.05, maxWallClockMs: 300_000 } });
  const spend = accountModelCall({ spend: emptyModelSpend(), usage: { inputTokens: 1000, outputTokens: 900 }, pricingGbpPerMillionTokens: decision.pricingGbpPerMillionTokens });
  const verdict = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor({ maxOutputTokens: 1500 }), spend, spentDecisionIds: new Set() });
  assert.equal(verdict.reason, 'request-exceeds-remaining-budget');
});

test('a per-call ceiling above what the decision authorised is refused', () => {
  const { decision } = decisionFor();
  const verdict = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor({ maxOutputTokens: 8000 }), spend: emptyModelSpend() });
  assert.equal(verdict.reason, 'request-exceeds-remaining-budget');
});

test('a cost ceiling binds independently of the token ceiling', () => {
  const { decision } = decisionFor({ budget: { maxCalls: 4, maxOutputTokensPerCall: 1500, maxTotalTokens: 1_000_000, maxCostGbp: 0.000001, maxWallClockMs: 300_000 } });
  const verdict = evaluateModelLane({ killSwitch: ENABLED_SWITCH, decision, request: requestFor(), spend: emptyModelSpend() });
  assert.equal(verdict.reason, 'request-exceeds-remaining-budget');
});

test('a response with no usage is unreconcilable, not free', () => {
  assert.throws(
    () => accountModelCall({ spend: emptyModelSpend(), usage: {}, pricingGbpPerMillionTokens: { input: 1, output: 1 } }),
    (error) => error instanceof ModelLaneError && error.reason === 'usage-unreconcilable',
  );
});

// ---------------------------------------------------------------------------
// The sandbox: the lane is absent unless it is asked for.
// ---------------------------------------------------------------------------

function specInput(extra = {}) {
  return {
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'code-reviewer', policyId: 'review',
    networkProfile: 'none',
    workspacePath: '/srv/app-builder-attempts/attempt-1/workspace',
    scratchPath: '/srv/app-builder-attempts/attempt-1/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock',
    grantPath: '/srv/app-builder-attempts/attempt-1/grant',
    ...extra,
  };
}

test('an attempt with no model lane is byte-identical to one from before the lane existed', () => {
  const spec = createExecutionEnvironmentSpec(specInput());
  assert.equal(spec.modelAccess, null);
  assert.equal(spec.mounts.some((mount) => mount.target.includes('model')), false);
  assert.equal(spec.environment.allowed.includes('APP_BUILDER_MODEL_SOCKET'), false);
  // The deterministic canary's own spec shape, unchanged.
  assert.deepEqual(spec.mounts.map((mount) => mount.target), ['/workspace', '/scratch', '/run/app-builder/broker.sock', '/run/app-builder/grant']);
});

test('the model lane adds one socket and no credential, endpoint or provider name', () => {
  const spec = createExecutionEnvironmentSpec(specInput({ modelSocketPath: '/run/app-builder/model.sock' }));
  assert.equal(spec.modelAccess.containerSocketPath, '/run/app-builder/model.sock');
  assert.equal(spec.network.profile, 'none');
  const added = spec.environment.allowed.filter((name) => /MODEL|PROVIDER|ANTHROPIC|KEY|SECRET|TOKEN/i.test(name));
  assert.deepEqual(added, ['APP_BUILDER_MODEL_SOCKET']);
  for (const pattern of spec.environment.forbiddenPatterns) {
    for (const name of spec.environment.allowed) {
      assert.equal(name.includes(pattern), false, `${name} matches forbidden pattern ${pattern}`);
    }
  }
});

test('a spec with no model lane cannot have a model mount smuggled into it', () => {
  const spec = createExecutionEnvironmentSpec(specInput());
  const smuggled = { ...spec, mounts: [...spec.mounts, { source: '/etc/app-builder', target: '/run/app-builder/model.sock', mode: 'rw' }] };
  assert.throws(() => assertSpecIsolation(smuggled), /Execution environment refused/);
});

test('a model mount whose source is not the socket the spec named is refused', () => {
  const spec = createExecutionEnvironmentSpec(specInput({ modelSocketPath: '/run/app-builder/model.sock' }));
  const smuggled = { ...spec, mounts: spec.mounts.map((mount) => mount.target === '/run/app-builder/model.sock' ? { ...mount, source: '/etc/app-builder' } : mount) };
  assert.throws(() => assertSpecIsolation(smuggled), /would hand the task/);
});

test('an attempt records whether it had a model lane at all', () => {
  const role = ROLES['code-reviewer'];
  const base = {
    attemptId: 'attempt-1', taskId: 'task-1', projectId: 'model-canary', environment: 'development',
    role, policy: POLICIES[role.policyId], registry: REGISTRY,
    image: { reference: 'localhost/app-builder-task', digest: `sha256:${'a'.repeat(64)}` },
    workspacePath: '/srv/app-builder-attempts/a1/workspace', scratchPath: '/srv/app-builder-attempts/a1/scratch',
    grantPath: '/srv/app-builder-attempts/a1/grant', brokerSocketPath: '/run/app-builder/broker.sock',
  };
  assert.equal(createAttemptPlan(base, GRANT_SECRET).attempt.modelLane, null);
  const withLane = createAttemptPlan({ ...base, modelSocketPath: '/run/m.sock' }, GRANT_SECRET);
  assert.equal(withLane.attempt.modelLane.gatewaySocket, '/run/m.sock');
  assert.equal(withLane.attempt.networkProfile, 'none');
});

// ---------------------------------------------------------------------------
// The canary role and its acceptance.
// ---------------------------------------------------------------------------

test('the configured canary role is a reader with no mutation, network or secret authority', () => {
  const role = ROLES[CONFIG.canary.roleId];
  const policy = POLICIES[role.policyId];
  assert.ok(role, 'the configured canary role exists in the registry');
  assert.deepEqual(role.mutationScopes, []);
  assert.equal(policy.allow.includes('network.public'), false);
  assert.equal(policy.allow.includes('secret.read_scoped'), false);
  assert.equal(policy.deny.includes('deploy.production'), true);
  assert.equal(policy.deny.includes('database.production_write'), true);
  assert.equal(role.runtimeReady, undefined, 'the canary role must not already claim readiness');
});

test('the deterministic criteria are settled by code, and two of them genuinely fail', () => {
  const outcome = deterministicCriteriaOutcome(CANARY_SUBJECT);
  const failing = Object.entries(outcome).filter(([, status]) => status === 'fail').map(([id]) => id).sort();
  assert.deepEqual(failing, ['rollback-declared', 'scope-declared']);
  // The declared expectation in the criteria list and the code agree, so a
  // change to the subject that stopped it being a real test would fail here.
  for (const criterion of CANARY_CRITERIA) {
    assert.equal(outcome[criterion.id], criterion.expected, `${criterion.id} does not match its declared expectation`);
  }
});

test('"the model returned some text" is not acceptance', () => {
  const fluent = { schemaVersion: 1, id: 'v1', projectId: 'p', stageId: 's', artifactKind: 'ChangeSet', reviewerRole: 'code-reviewer', authorRoles: ['frontend-implementation'], verdict: 'pass', failingCriteria: [], createdAt: 'now' };
  const checks = gradeArtifact(fluent, { roleId: 'code-reviewer' });
  const failed = checks.filter((check) => check.status !== 'pass').map((check) => check.id);
  assert.ok(failed.includes('artifact-identifies-exactly-the-criteria-that-fail'), 'a confident but wrong verdict must fail');
});

test('a correct verdict passes every deterministic check', () => {
  const correct = {
    schemaVersion: 1, id: 'verdict-1', projectId: 'model-canary', taskId: 't', stageId: 'verification',
    artifactId: CANARY_SUBJECT.artifactId, artifactKind: 'ChangeSet', reviewerRole: 'code-reviewer',
    authorRoles: ['frontend-implementation'], verdict: 'rework-required', severity: 'major',
    failingCriteria: ['scope-declared', 'rollback-declared'], requiredChanges: ['declare a rollback'],
    observations: [], returnToRole: 'frontend-implementation', createdAt: '2026-08-26T00:00:00.000Z',
  };
  assert.deepEqual(gradeArtifact(correct, { roleId: 'code-reviewer' }).filter((check) => check.status !== 'pass'), []);
});

test('a reviewer that lists itself as an author fails the self-approval check', () => {
  const selfApproved = {
    schemaVersion: 1, id: 'v', projectId: 'p', stageId: 's', artifactId: CANARY_SUBJECT.artifactId,
    artifactKind: 'ChangeSet', reviewerRole: 'code-reviewer', authorRoles: ['code-reviewer'],
    verdict: 'rework-required', failingCriteria: ['scope-declared', 'rollback-declared'], createdAt: 'now',
  };
  const checks = gradeArtifact(selfApproved, { roleId: 'code-reviewer' });
  assert.equal(checks.find((check) => check.id === 'reviewer-is-not-listed-as-an-author').status, 'fail');
});

test('an unparseable answer fails rather than throwing', () => {
  const checks = gradeArtifact(null, { roleId: 'code-reviewer' });
  assert.equal(checks[0].status, 'fail');
});

test('a credential reaching the sandbox fails the boundary grade', () => {
  const leaked = gradeBoundary(
    { grantPresent: true, secretShapedVariables: ['ANTHROPIC_API_KEY'], modelEnvironmentKeys: ['APP_BUILDER_MODEL_SOCKET'], modelSocketIsSocket: true, brokerSocketIsSocket: true, operations: [], model: { status: 200, usage: { outputTokens: 10 }, stopReason: 'stop' } },
    { grantedOperations: new Set() },
  );
  assert.equal(leaked.find((check) => check.id === 'no-provider-credential-in-sandbox').status, 'fail');

  const endpointLeak = gradeBoundary(
    { grantPresent: true, secretShapedVariables: [], modelEnvironmentKeys: ['APP_BUILDER_MODEL_SOCKET', 'ANTHROPIC_BASE_URL'], modelSocketIsSocket: true, brokerSocketIsSocket: true, operations: [], model: { status: 200, usage: { outputTokens: 10 }, stopReason: 'stop' } },
    { grantedOperations: new Set() },
  );
  assert.equal(endpointLeak.find((check) => check.id === 'model-lane-is-a-socket-and-nothing-else').status, 'fail');
});

// ---------------------------------------------------------------------------
// The record, and the fact that it promotes nothing.
// ---------------------------------------------------------------------------

function recordFor(overrides = {}) {
  return createModelAttemptRecord({
    canaryId: 'c1', decisionId: 'd1', attemptId: 'a1', taskId: 't1', projectId: 'p1',
    roleId: 'code-reviewer', policyId: 'review', environment: 'development',
    runtime: { adapterId: 'anthropic-messages', providerId: 'anthropic', model: 'claude-haiku-4-5-20251001', driverId: 'podman', image: 'localhost/x@sha256:1', networkProfile: 'none' },
    context: { packetRef: 'r', packetHash: 'sha256:1', artifactKinds: ['ChangeSet'], withheldKinds: ['SecurityFindings'] },
    artifact: { contract: 'schemas/review-verdict.schema.json', kind: 'ReviewVerdict', value: { verdict: 'rework-required' }, hash: 'sha256:2' },
    usage: { calls: 1, inputTokens: 1000, outputTokens: 400, totalTokens: 1400, costGbp: 0.0024, durationMs: 3000 },
    budget: { maxCalls: 1, maxTotalTokens: 30_000, maxCostGbp: 0.05, maxWallClockMs: 300_000 },
    stopReason: 'stop', attemptExitReason: 'completed',
    deterministicChecks: [{ id: 'artifact-is-a-json-object', status: 'pass' }],
    ...overrides,
  });
}

test('a record starts with no verdict and does not satisfy the evidence requirement', () => {
  const record = recordFor();
  assert.equal(record.reviewerVerdict, null);
  const status = modelAttemptEvidenceStatus(record);
  assert.equal(status.satisfied, false);
  assert.ok(status.missing.includes('no independent reviewer verdict'));
});

test('the role that produced the artifact may not review it', () => {
  assert.throws(() => recordReviewerVerdict(recordFor(), { reviewer: 'code-reviewer', verdict: 'pass', rationale: 'looks fine' }), /may not issue its promotion verdict/);
});

test('an independent verdict satisfies the evidence requirement; a rework verdict does not', () => {
  const passed = recordReviewerVerdict(recordFor(), { reviewer: 'nicky', verdict: 'pass', rationale: 'the verdict named the two real defects' });
  assert.equal(modelAttemptEvidenceStatus(passed).satisfied, true);

  const rejected = recordReviewerVerdict(recordFor(), { reviewer: 'nicky', verdict: 'rework-required', rationale: 'missed one' });
  assert.equal(modelAttemptEvidenceStatus(rejected).satisfied, false);
});

test('exit code zero is not evidence', () => {
  const noCall = recordFor({ usage: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costGbp: 0, durationMs: 10 }, stopReason: 'stop' });
  const status = modelAttemptEvidenceStatus(recordReviewerVerdict(noCall, { reviewer: 'nicky', verdict: 'pass', rationale: 'ok' }));
  assert.equal(status.satisfied, false);
  assert.ok(status.missing.includes('no provider call was made'));

  const truncated = recordFor({ stopReason: 'length' });
  assert.equal(modelAttemptEvidenceStatus(recordReviewerVerdict(truncated, { reviewer: 'nicky', verdict: 'pass', rationale: 'ok' })).satisfied, false);

  const failedCheck = recordFor({ deterministicChecks: [{ id: 'artifact-is-a-json-object', status: 'fail' }] });
  assert.equal(modelAttemptEvidenceStatus(recordReviewerVerdict(failedCheck, { reviewer: 'nicky', verdict: 'pass', rationale: 'ok' })).satisfied, false);
});

// ---------------------------------------------------------------------------
// The preflight, and the fact that it refuses today.
// ---------------------------------------------------------------------------

/**
 * A repository tree carrying the real configs with one file overridden.
 *
 * `preflight` reads five configs from its root, so the whole production path
 * runs against the override rather than against a stub of it. This is how a
 * state the repository has now moved past — an unbuilt image with no digest —
 * stays covered after the digest is pinned.
 */
function withConfigOverride(overrides, run) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'model-preflight-'));
  fs.mkdirSync(path.join(scratch, 'config'), { recursive: true });
  for (const name of ['model-execution.json', 'agent-roles.json', 'agent-policies.json', 'agent-capabilities.json', 'task-images.json']) {
    const relative = `config/${name}`;
    const value = Object.hasOwn(overrides, relative)
      ? JSON.stringify(overrides[relative])
      : fs.readFileSync(path.join(ROOT, relative), 'utf8');
    fs.writeFileSync(path.join(scratch, relative), value);
  }
  try {
    return run(scratch);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

test('the preflight refuses today, and names every outstanding prerequisite at once', () => {
  const result = preflight({ root: ROOT, env: {} });
  assert.equal(result.ok, false, 'nothing is authorised yet, so the preflight must refuse');
  const ids = new Set(result.blocking.map((check) => check.id));
  for (const expected of ['task-image-present-on-host', 'kill-switch-enabled', 'provider-credential-configured', 'one-time-enable-decision']) {
    assert.ok(ids.has(expected), `the preflight must report ${expected} rather than failing on the first blocker`);
  }
  // Every blocker carries a remedy or is explicitly a host question. An
  // operator should never have to discover the next prerequisite by running
  // into it.
  for (const check of result.blocking) {
    assert.ok(check.remedy || check.status === 'unknown', `${check.id} blocks with no remedy`);
  }
  // A host question is never reported as a pass.
  assert.equal(result.checks.find((check) => check.id === 'task-image-present-on-host').status, 'unknown');
});

test('the recorded digest is what the preflight reports, and its absence is still a blocker', () => {
  // The baseline image has been built and adversarially verified on the host,
  // so this one prerequisite is now genuinely met. It is the only one.
  const images = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/task-images.json'), 'utf8'));
  const baseline = images.images['task-baseline'];
  assert.match(baseline.digest ?? '', /^sha256:[0-9a-f]{64}$/, 'the pinned baseline must be a content digest, never a tag');

  const pinned = preflight({ root: ROOT, env: {} }).checks.find((check) => check.id === 'task-image-digest-recorded');
  assert.equal(pinned.status, 'pass', pinned.detail);
  assert.ok(pinned.detail.includes(baseline.digest), 'the preflight must report the digest it resolved, not merely that one exists');

  // An image that has not been built on a host yet still fails closed, with the
  // command that fixes it. Pinning one image must never soften that for the next.
  const unbuilt = { ...images, images: { ...images.images, 'task-baseline': { ...baseline, digest: null } } };
  withConfigOverride({ 'config/task-images.json': unbuilt }, (root) => {
    const result = preflight({ root, env: {} });
    const check = result.checks.find((entry) => entry.id === 'task-image-digest-recorded');
    assert.equal(check.status, 'fail');
    assert.match(check.detail, /no recorded digest/);
    assert.match(check.remedy, /build-task-image\.sh/);
    assert.ok(result.blocking.some((entry) => entry.id === 'task-image-digest-recorded'));
    assert.equal(result.ok, false);
  });
});

test('the preflight confirms the chosen role is eligible even while the run is blocked', () => {
  const result = preflight({ root: ROOT, env: {} });
  for (const id of ['role-registered', 'role-has-no-mutation-scope', 'role-has-no-public-network', 'role-has-no-secret-access', 'role-capability-set-is-read-only', 'role-is-not-runtime-ready-yet']) {
    assert.equal(result.checks.find((check) => check.id === id)?.status, 'pass', `${id} should already hold`);
  }
});

test('the explicit Groq canary is pinned to its profile and fixed synthetic evidence', () => {
  const definition = providerCanary('groq');
  assert.equal(definition.profile.providerId, 'groq');
  assert.equal(definition.profile.adapterId, 'openai-compatible');
  assert.equal(definition.profile.modelId, 'openai/gpt-oss-120b');
  assert.equal(definition.profile.secretRef, 'GROQ_API_KEY');
  assert.equal(definition.profile.costMode, 'free-only');
  assert.equal(definition.dataClass, 'synthetic');
  assert.deepEqual(definition.criteria.map((entry) => entry.id), [
    'missing-input-validation', 'missing-await', 'swallowed-error', 'unbounded-allocation',
  ]);
  assert.match(definition.subject.source, /function expandBundle/);
  assert.throws(() => providerCanary('anthropic'), /no live canary definition/);
  assert.throws(() => providerCanary('does-not-exist'), /Unknown provider/);
});

test('Groq preflight resolves only GROQ_API_KEY and remains distinct from readiness', () => {
  const result = preflight({ providerId: 'groq', env: { GROQ_API_KEY: FAKE_GROQ_KEY, ANTHROPIC_API_KEY: FAKE_KEY } });
  const provider = result.checks.find((check) => check.id === 'provider-explicit-and-supported');
  const credential = result.checks.find((check) => check.id === 'provider-credential-configured');
  assert.match(provider.detail, /groq, openai-compatible, openai\/gpt-oss-120b, synthetic/);
  assert.equal(credential.status, 'pass');
  const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/provider-profiles.json'), 'utf8'));
  assert.deepEqual(profiles.profiles.find((entry) => entry.providerId === 'groq').eligibleRoles, []);
  assert.equal(profiles.profiles.find((entry) => entry.providerId === 'groq').ready, false);
});

// ---------------------------------------------------------------------------
// The whole lane, end to end, with a stub provider and no credential.
// ---------------------------------------------------------------------------

/** A provider that answers correctly. Everything else in the run is real. */
function stubAdapter({ answer, usage = { inputTokens: 900, outputTokens: 220 }, stopReason = 'stop', onCall = null } = {}) {
  let calls = 0;
  return {
    id: 'anthropic-messages',
    providerId: 'anthropic',
    async complete({ request, apiKey }) {
      calls += 1;
      // The adapter contract requires a credential, so a run that reached here
      // with none would be a run that skipped the check.
      assert.ok(apiKey, 'the gateway must supply a credential');
      assert.equal(request.maxOutputTokens <= 1500, true);
      if (onCall) onCall({ calls, request });
      return { text: answer, usage, stopReason, providerStopReason: 'end_turn', model: 'claude-haiku-4-5-20251001', durationMs: 12 };
    },
  };
}

function groqStubAdapter({ answer, onCall = null } = {}) {
  let calls = 0;
  return {
    id: 'openai-compatible',
    providerId: 'groq',
    async complete({ request, apiKey }) {
      calls += 1;
      assert.equal(apiKey, FAKE_GROQ_KEY);
      assert.equal(request.model, 'openai/gpt-oss-120b');
      if (onCall) onCall({ calls, request, apiKey });
      return { text: answer, usage: { inputTokens: 700, outputTokens: 260 }, stopReason: 'stop', providerStopReason: 'stop', model: 'openai/gpt-oss-120b', durationMs: 10 };
    },
  };
}

const CORRECT_GROQ_ANSWER = JSON.stringify({
  schemaVersion: 1, id: 'groq-verdict-1', projectId: 'model-canary', taskId: 'groq-task', stageId: 'verification',
  artifactId: 'examples/provider-canary/flawed-cart.js', artifactKind: 'SourceFile', reviewerRole: 'code-reviewer',
  authorRoles: ['fixture-author'], verdict: 'rework-required', severity: 'major',
  failingCriteria: ['missing-input-validation', 'missing-await', 'swallowed-error', 'unbounded-allocation'],
  requiredChanges: ['fix the four declared defects'], observations: [], returnToRole: 'fixture-author',
  createdAt: '2026-08-28T00:00:00.000Z',
});

const CORRECT_ANSWER = JSON.stringify({
  schemaVersion: 1, id: 'verdict-canary-1', projectId: 'model-canary', taskId: 'task-1', stageId: 'verification',
  artifactId: CANARY_SUBJECT.artifactId, artifactKind: 'ChangeSet', reviewerRole: 'code-reviewer',
  authorRoles: ['frontend-implementation'], verdict: 'rework-required', severity: 'major',
  failingCriteria: ['scope-declared', 'rollback-declared'],
  requiredChanges: ['bring src/lib/analytics.ts into scope or drop it', 'declare a rollback'],
  observations: [], returnToRole: 'frontend-implementation', createdAt: '2026-08-26T00:00:00.000Z',
});

const LANE_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  APP_BUILDER_AGENT_GRANT_SECRET: GRANT_SECRET,
  APP_BUILDER_MODEL_DECISION_SECRET: DECISION_SECRET,
  ANTHROPIC_API_KEY: FAKE_KEY,
};
const GROQ_LANE_ENV = { ...LANE_ENV, GROQ_API_KEY: FAKE_GROQ_KEY };

/**
 * The switch, enabled for the duration of one test, in a temporary tree.
 *
 * Never by editing the committed config: a test that turned the repository's
 * kill switch on would leave it on for whatever ran next.
 */
function withEnabledSwitch(run) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'model-lane-'));
  const hostSwitch = path.join(scratch, 'host-switch.json');
  fs.writeFileSync(hostSwitch, JSON.stringify({ enabled: true }));
  // A repository tree whose only content is an enabled copy of the real
  // config. `readModelKillSwitch` runs unmodified against it, so the enabled
  // path is the production code path and not a stub of it.
  const killSwitchRoot = path.join(scratch, 'repo');
  fs.mkdirSync(path.join(killSwitchRoot, 'config'), { recursive: true });
  fs.writeFileSync(path.join(killSwitchRoot, 'config/model-execution.json'), JSON.stringify({ ...CONFIG, enabled: true }));
  return run({ killSwitchRoot, hostSwitchPath: hostSwitch }).finally(() => fs.rmSync(scratch, { recursive: true, force: true }));
}

test('the whole lane runs one bounded attempt, and every boundary holds', { timeout: 180_000 }, async () => {
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    {
      const report = await runModelCanary({
        env: LANE_ENV,
        adapter: stubAdapter({ answer: CORRECT_ANSWER }),
        probeSecondCall: true,
        isolation: null,
        killSwitchRoot,
        hostSwitchPath,
      });

      // A real call happened, through the gateway, with usage that reconciles.
      const called = report.checks.find((check) => check.id === 'a-real-model-call-occurred');
      assert.equal(called.status, 'pass', called.detail);
      assert.equal(report.record.usage.calls, 1);
      assert.ok(report.record.usage.totalTokens > 0);
      assert.ok(report.record.usage.costGbp > 0, 'a call that cost nothing was not reconciled');

      // The sandbox saw a socket and no credential.
      assert.equal(report.checks.find((check) => check.id === 'no-provider-credential-in-sandbox').status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'model-lane-is-a-socket-and-nothing-else').status, 'pass');

      // The second call is refused by the budget, not by the model agreeing to stop.
      const second = report.checks.find((check) => check.id === 'a-second-call-is-refused-by-the-budget');
      assert.equal(second.status, 'pass', second.detail);

      // The ledger holds the attempt and no credential.
      assert.equal(report.checks.find((check) => check.id === 'no-credential-in-the-event-ledger').status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'event-ledger-reconciles-with-the-attempt').status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'sandbox-disposed-with-no-orphan').status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'context-packet-withheld-unowned-artifact-kinds').status, 'pass');
      assert.equal(report.checks.find((check) => check.id === 'model-spend-stayed-inside-the-authorised-budget').status, 'pass');

      // And the record still promotes nothing.
      assert.equal(report.record.reviewerVerdict, null);
      assert.equal(report.evidence.satisfied, false);
      assert.ok(report.evidence.missing.includes('no independent reviewer verdict'));

      assert.equal(report.ok, true, `failed: ${(report.failed ?? []).join(', ')}`);
    }
  });
});

test('the explicit Groq canary reuses the bounded lane and grades all predeclared findings', { timeout: 180_000 }, async () => {
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    let calls = 0;
    const report = await runModelCanary({
      providerId: 'groq',
      env: GROQ_LANE_ENV,
      adapter: groqStubAdapter({ answer: CORRECT_GROQ_ANSWER, onCall: ({ calls: count }) => { calls = count; } }),
      probeSecondCall: true,
      isolation: null,
      killSwitchRoot,
      hostSwitchPath,
    });
    assert.equal(calls, 1, 'the second probe must be refused before the adapter');
    assert.equal(report.ok, true, `failed: ${(report.failed ?? []).join(', ')}`);
    assert.equal(report.record.runtime.providerId, 'groq');
    assert.equal(report.record.runtime.adapterId, 'openai-compatible');
    assert.equal(report.record.runtime.model, 'openai/gpt-oss-120b');
    assert.equal(report.record.usage.calls, 1);
    assert.equal(report.record.usage.costGbp, 0, 'a free-only canary records no invented price');
    assert.equal(report.record.artifact.kind, 'SourceFile');
    assert.equal(report.record.reviewerVerdict, null, 'deterministic success is evidence, not promotion');
    assert.equal(report.evidence.satisfied, false, 'human review remains mandatory');
    assert.equal(JSON.stringify(report).includes(FAKE_GROQ_KEY), false);
  });
});

test('a separately minted Groq decision binds the run to Groq and its authorised task', { timeout: 180_000 }, async () => {
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    const { decision, token } = authorise({
      providerId: 'groq', env: GROQ_LANE_ENV, grantedBy: 'operator', reason: 'first Groq canary',
      canaryId: 'groq-authorised-canary', taskId: 'groq-authorised-task', projectId: 'model-canary',
    });
    assert.equal(decision.providerId, 'groq');
    assert.equal(decision.adapterId, 'openai-compatible');
    assert.equal(decision.model, 'openai/gpt-oss-120b');
    const report = await runModelCanary({
      providerId: 'groq', env: GROQ_LANE_ENV, decisionToken: token,
      adapter: groqStubAdapter({ answer: CORRECT_GROQ_ANSWER }), probeSecondCall: false,
      isolation: null, killSwitchRoot, hostSwitchPath,
    });
    assert.equal(report.record.canaryId, 'groq-authorised-canary');
    assert.equal(report.record.taskId, 'groq-authorised-task');
    assert.equal(report.record.decisionId, decision.decisionId);
    assert.equal(report.ok, true, `failed: ${(report.failed ?? []).join(', ')}`);
  });
});

test('an Anthropic adapter cannot service an explicitly requested Groq canary', async () => {
  await assert.rejects(
    () => runModelCanary({ providerId: 'groq', env: GROQ_LANE_ENV, adapter: stubAdapter({ answer: CORRECT_GROQ_ANSWER }), probeSecondCall: false, isolation: null }),
    /requested groq\/openai-compatible, but adapter is anthropic\/anthropic-messages/,
  );
});

test('a Groq rate limit keeps its taxonomy and is never retried', { timeout: 180_000 }, async () => {
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    let calls = 0;
    const rateLimited = {
      id: 'openai-compatible', providerId: 'groq',
      async complete() { calls += 1; throw new ProviderCallError('rate-limited', 'groq returned 429'); },
    };
    const report = await runModelCanary({
      providerId: 'groq', env: GROQ_LANE_ENV, adapter: rateLimited, probeSecondCall: true,
      isolation: null, killSwitchRoot, hostSwitchPath,
    });
    assert.equal(calls, 1);
    assert.equal(report.ok, false);
    assert.equal(report.record.usage.calls, 0);
    assert.equal(report.record.reviewerVerdict, null);
  });
});

test('missing Groq findings fail deterministic acceptance', () => {
  const definition = providerCanary('groq');
  const incomplete = JSON.parse(CORRECT_GROQ_ANSWER);
  incomplete.failingCriteria = incomplete.failingCriteria.slice(0, 3);
  const checks = gradeArtifact(incomplete, { roleId: 'code-reviewer', subject: definition.subject, criteria: definition.criteria });
  assert.equal(checks.find((check) => check.id === 'artifact-identifies-exactly-the-criteria-that-fail').status, 'fail');
});

test('malformed Groq output is not a typed artifact', () => {
  const checks = gradeArtifact(null, { roleId: 'code-reviewer' });
  assert.equal(checks.find((check) => check.id === 'artifact-is-a-json-object').status, 'fail');
});

test('no credential appears anywhere in the run report or the durable record', { timeout: 180_000 }, async () => {
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    const report = await runModelCanary({ env: LANE_ENV, adapter: stubAdapter({ answer: CORRECT_ANSWER }), probeSecondCall: false, isolation: null, killSwitchRoot, hostSwitchPath });
    const serialised = JSON.stringify(report);
    assert.equal(serialised.includes(FAKE_KEY), false, 'the report carries the credential');
    assert.equal(serialised.includes(GRANT_SECRET), false, 'the report carries the grant signing key');
    assert.equal(serialised.includes(DECISION_SECRET), false, 'the report carries the decision signing key');
    assert.equal(JSON.stringify(report.record).includes(FAKE_KEY), false, 'the durable record carries the credential');
  });
});

test('a wrong-but-fluent model answer fails the run rather than passing it', { timeout: 180_000 }, async () => {
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    const fluent = JSON.stringify({
      schemaVersion: 1, id: 'v', projectId: 'model-canary', stageId: 'verification', artifactId: CANARY_SUBJECT.artifactId,
      artifactKind: 'ChangeSet', reviewerRole: 'code-reviewer', authorRoles: ['frontend-implementation'],
      verdict: 'pass', failingCriteria: [], createdAt: 'now',
    });
    const report = await runModelCanary({ env: LANE_ENV, adapter: stubAdapter({ answer: fluent }), probeSecondCall: false, isolation: null, killSwitchRoot, hostSwitchPath });
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('artifact-identifies-exactly-the-criteria-that-fail'));
    assert.equal(report.evidence.satisfied, false);
  });
});

test('with the kill switch off, the gateway refuses the call from inside the sandbox', { timeout: 180_000 }, async () => {
  // No setup at all, which is the property worth having: the repository's
  // committed state is the state in which no provider call can happen.
  let called = false;
  const report = await runModelCanary({
    env: LANE_ENV,
    adapter: stubAdapter({ answer: CORRECT_ANSWER, onCall: () => { called = true; } }),
    probeSecondCall: false,
  });
  assert.equal(called, false, 'the provider was called with the kill switch off');
  assert.equal(report.record.usage.calls, 0);
  assert.equal(report.record.usage.costGbp, 0);
  assert.equal(report.ok, false);
  assert.equal(report.evidence.satisfied, false);

  // Two refusals reach the same place by different routes, and which one wins
  // is a matter of timing rather than of design. Either the worker asked the
  // gateway and was refused — in which case the boundary grade exists and says
  // so — or the switch watcher cancelled the attempt before it got that far,
  // in which case there is no result to grade at all. Asserting the first was
  // asserting one machine's scheduling: under load the second happens, the
  // graded checks are absent, and the test failed reading a property of
  // `undefined` while the boundary it exists to prove was intact.
  const graded = report.checks.find((check) => check.id === 'a-real-model-call-occurred');
  if (graded) assert.equal(graded.status, 'fail', 'a call cannot have occurred with the switch off');
  else assert.equal(report.attempt.cancelledByKillSwitch, true, 'no boundary grade is only acceptable when the attempt was cancelled first');

  // Disposal is on both routes, so it is asserted unconditionally: whichever
  // refusal fired, the sandbox goes away and leaves nothing behind.
  assert.equal(report.checks.find((check) => check.id === 'sandbox-disposed-with-no-orphan').status, 'pass');
});

test('the kill switch also stops an attempt that is still running', { timeout: 180_000 }, async () => {
  // The refusal and the cancel are two separate guards, and which one fires
  // first is a matter of timing rather than of design. So this proves the
  // second directly: an attempt held open past the switch being read is
  // cancelled, not left to finish.
  const report = await runModelCanary({
    env: LANE_ENV,
    adapter: stubAdapter({ answer: CORRECT_ANSWER }),
    probeSecondCall: false,
    workerHoldMs: 4000,
  });
  assert.equal(report.attempt.cancelledByKillSwitch, true, 'a live attempt must be cancelled when the switch is off');
  assert.equal(report.attempt.exitReason, 'cancelled');
  assert.equal(report.record.usage.calls, 0);
  assert.equal(report.checks.find((check) => check.id === 'sandbox-disposed-with-no-orphan').status, 'pass');
});

test('the gateway itself refuses the call when the switch goes off, independently of the supervisor', { timeout: 180_000 }, async () => {
  // The supervisor's cancel and the gateway's refusal are two separate guards.
  // Proving only the cancel would leave the gateway's own check untested, so
  // this run disables the supervisor's watcher by giving it an enabled switch
  // while the gateway reads a disabled one.
  await withEnabledSwitch(async ({ killSwitchRoot, hostSwitchPath }) => {
    const enabled = readModelKillSwitch({ root: killSwitchRoot, env: LANE_ENV, hostSwitchPath });
    assert.equal(enabled.enabled, true, 'the enabled tree must really be enabled, or this proves nothing');
    const disabled = readModelKillSwitch({ root: ROOT, env: LANE_ENV });
    assert.equal(disabled.enabled, false);
    const verdict = evaluateModelLane({ killSwitch: disabled, decision: decisionFor().decision, request: requestFor(), spend: emptyModelSpend() });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.reason, 'kill-switch-disabled');
  });
});

test('the provider adapter refuses to build a client without an https endpoint', () => {
  assert.throws(() => createAnthropicModelAdapter({ endpoint: 'http://api.anthropic.com/v1/messages', apiVersion: '2023-06-01', model: 'x' }), /https origin/);
  assert.throws(() => createAnthropicModelAdapter({ endpoint: CONFIG.provider.endpoint, apiVersion: '2023-06-01', model: 'x', fetchImpl: null }), /fetch implementation/);
});

test('the adapter refuses to send an unauthenticated request', async () => {
  const adapter = createAnthropicModelAdapter({
    endpoint: CONFIG.provider.endpoint,
    apiVersion: CONFIG.provider.apiVersion,
    model: CONFIG.provider.model,
    fetchImpl: async () => { throw new Error('the adapter must not reach the network without a credential'); },
  });
  await assert.rejects(() => adapter.complete({ request: requestFor(), apiKey: '' }), /called with no credential/);
});

test('the adapter refuses a provider response that reports no usage', async () => {
  const adapter = createAnthropicModelAdapter({
    endpoint: CONFIG.provider.endpoint,
    apiVersion: CONFIG.provider.apiVersion,
    model: CONFIG.provider.model,
    fetchImpl: async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: {} }) }),
  });
  await assert.rejects(() => adapter.complete({ request: requestFor(), apiKey: FAKE_KEY }), /no token usage/);
});

// ---------------------------------------------------------------------------
// The runtime translations, for both drivers.
// ---------------------------------------------------------------------------

test('the unisolated local driver can actually run an attempt', { timeout: 60_000 }, async () => {
  // Regression. `spawn(file, args)` does not take argv[0] in `args`, and the
  // driver repeated the binary there — so with no namespace runner available
  // the attempt ran the Node executable as its own script and died with
  // "Invalid or unexpected token \x7fELF". That reads as a failed task rather
  // than as a broken runner, and it meant the `isolationMode: 'none'` the
  // deterministic canary documents could never run anything at all.
  const driver = createLocalExecutionDriver({ isolation: null });
  assert.equal(driver.isolationMode, 'none');

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'driver-argv-'));
  try {
    const spec = createExecutionEnvironmentSpec(specInput({
      workspacePath: path.join(scratch, 'workspace'),
      scratchPath: path.join(scratch, 'scratch'),
      grantPath: path.join(scratch, 'grant'),
    }));
    const attempt = { attemptId: 'argv-regression', projectId: 'p', taskId: 't' };
    const handle = await driver.create({
      attempt,
      spec,
      command: [process.execPath, '-e', 'require("node:fs").writeFileSync(process.env.APP_BUILDER_RESULT_FILE, JSON.stringify({ ran: true }))'],
      grantToken: 'not-a-real-grant',
    });
    await driver.start(handle);
    const collected = await driver.collect(handle);
    assert.equal(collected.exitCode, 0, `the attempt did not run: ${collected.stderr}`);
    assert.deepEqual(collected.result, { ran: true });
    await driver.remove(handle);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('the podman translation passes the model socket path and nothing else about the provider', () => {
  const without = podmanRunArgs(createExecutionEnvironmentSpec(specInput()), { image: 'localhost/x@sha256:1', command: ['true'] });
  assert.equal(without.join(' ').includes('APP_BUILDER_MODEL_SOCKET'), false);

  const withLane = podmanRunArgs(
    createExecutionEnvironmentSpec(specInput({ modelSocketPath: '/run/app-builder/model.sock' })),
    { image: 'localhost/x@sha256:1', command: ['true'] },
  );
  const rendered = withLane.join(' ');
  assert.ok(rendered.includes('APP_BUILDER_MODEL_SOCKET=/run/app-builder/model.sock'));
  assert.ok(rendered.includes('--volume /run/app-builder/model.sock:/run/app-builder/model.sock'));
  // The provider is invisible from the container's own command line, which is
  // readable by every other user of a shared host.
  for (const forbidden of ['ANTHROPIC', 'api.anthropic.com', 'claude-', 'x-api-key']) {
    assert.equal(rendered.includes(forbidden), false, `podman argv leaks ${forbidden}`);
  }
  assert.ok(rendered.includes('--network=none'), 'the canary lane must still run with no network');
});
