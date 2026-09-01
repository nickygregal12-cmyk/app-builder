/**
 * Acceptance for the `ExecutionEnvironmentAdapter` lifecycle.
 *
 * Two halves, and the second is the point of the file.
 *
 * The unit half exercises the parts a full canary run cannot reach on demand:
 * a driver that refuses to create, a driver that will not remove a container,
 * a supervisor restarting onto a ledger it did not write. Those are the paths
 * that turn into orphans and false success in production, and they are cheap
 * to force with a fake driver and expensive to force with a real one.
 *
 * The canary half runs the whole thing — real Factory service, real broker,
 * real registry, real projection, real signed grant, real network namespace —
 * and asserts on the report rather than re-deriving it.
 *
 * On skipping: this file does not. Where a proof needs a kernel feature the
 * runner may not have, the absence fails the test unless
 * `APP_BUILDER_ALLOW_UNPROVEN_ISOLATION=1` is set deliberately in the
 * workflow. A skipped proof under a green tick is indistinguishable from a
 * proof, and that pattern has already cost this repository one false pass.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ATTEMPT_EVENT_TYPES,
  ATTEMPT_EXIT_REASONS,
  ATTEMPT_STATES,
  assertPinnedImage,
  createAttemptPlan,
  reduceAttemptEvents,
  transitionAttempt,
} from '@app-builder/control-plane/attempts';
import {
  EXECUTION_DRIVER_METHODS,
  ExecutionEnvironmentAdapter,
  assertExecutionDriver,
} from '@app-builder/control-plane/execution-adapter';

import { evaluateRuntimeReadiness, parseEvidenceReference, unearnedRuntimeReadyRoles } from '@app-builder/control-plane/runtime-readiness';
import { createRuntimeReadinessEvidenceResolver } from './lib/runtime-readiness-evidence.mjs';
import { createLocalExecutionDriver, detectNetworkIsolation } from './lib/execution-driver-local.mjs';

import { runRuntimeCanary } from './runtime-canary.mjs';

const GATE = JSON.parse(fs.readFileSync(new URL('../config/runtime-readiness.json', import.meta.url), 'utf8'));
const ROLES = JSON.parse(fs.readFileSync(new URL('../config/agent-roles.json', import.meta.url), 'utf8')).roles;

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SECRET = 'lifecycle-test-signing-key-that-is-long-enough';
const IMAGE = { id: 'test', reference: 'localhost/app-builder-task', digest: `sha256:${'b'.repeat(64)}` };

const ROLE = {
  id: 'frontend-implementation',
  policyId: 'implementation',
  mutationScopes: ['src/**'],
  budget: { maxIterations: 2, maxRuntimeMs: 60_000, maxCostGbp: 1, maxTokens: 1000 },
};
const POLICY = { allow: ['repo.read', 'repo.write', 'process.build'], approvalRequired: [], deny: [] };
const REGISTRY = {
  capabilities: [
    { id: 'project.read', operation: 'project.read', mutating: false, approvalRequired: false, requiredPolicyActions: ['repo.read'], requiredMutationScopes: [] },
    { id: 'project.generate', operation: 'project.generate', mutating: true, approvalRequired: false, requiredPolicyActions: ['repo.write'], requiredMutationScopes: ['src/**'] },
  ],
  internalOnlyOperations: [],
};

function plan(overrides = {}) {
  return createAttemptPlan(
    {
      attemptId: overrides.attemptId ?? 'attempt-unit-1',
      taskId: 'task-unit-1',
      projectId: 'project-unit',
      environment: 'development',
      role: ROLE,
      policy: POLICY,
      registry: REGISTRY,
      image: IMAGE,
      workspacePath: '/srv/app-builder-attempts/unit/workspace',
      scratchPath: '/srv/app-builder-attempts/unit/scratch',
      grantPath: '/srv/app-builder-attempts/unit/grant',
      brokerSocketPath: '/run/app-builder/broker.sock',
      ...overrides,
    },
    SECRET,
  );
}

function fakeDriver(overrides = {}) {
  const state = { created: 0, started: 0, removed: 0, signals: [], running: false, exists: false };
  const driver = {
    id: 'fake',
    state,
    async create() { state.created += 1; state.exists = true; return 'handle-1'; },
    async start() { state.started += 1; state.running = true; return 'handle-1'; },
    async inspect() { return { exists: state.exists, running: state.running, exitCode: state.running ? null : 0 }; },
    async collect() { state.running = false; return { exitCode: 0, stdout: '', stderr: '', result: { ok: true }, durationMs: 5 }; },
    async signal(handle, signal) { state.signals.push(signal); state.running = false; },
    async remove() { state.removed += 1; state.exists = false; },
    async list() { return state.exists ? [{ handle: 'handle-1', attemptId: 'attempt-unit-1', running: state.running }] : []; },
    ...overrides,
  };
  return driver;
}

function recorder() {
  const events = [];
  return {
    events,
    journal: {
      async record({ type, projectId, taskId, actor, payload, usage }) {
        const event = { type, projectId, taskId: taskId ?? null, actor, payload, usage: usage ?? {}, timestamp: new Date().toISOString() };
        events.push(event);
        return event;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// The attempt record.
// ---------------------------------------------------------------------------

test('an attempt binds every input explicitly and infers none of them', () => {
  const { attempt, spec, grant } = plan();
  for (const field of ['attemptId', 'taskId', 'projectId', 'environment', 'roleId', 'policyId', 'networkProfile', 'brokerSocket']) {
    assert.ok(attempt[field], `${field} must be bound explicitly`);
  }
  assert.equal(attempt.image.pinned, `${IMAGE.reference}@${IMAGE.digest}`);
  assert.equal(attempt.state, 'created');
  assert.deepEqual(attempt.capabilities, ['project.generate', 'project.read']);
  assert.equal(spec.attemptId, attempt.attemptId);
  assert.equal(grant.attemptId, attempt.attemptId);

  // Each of these is required, and a missing one is an error rather than a
  // default derived from whatever the host happened to be doing.
  for (const missing of ['taskId', 'projectId', 'environment', 'workspacePath', 'scratchPath', 'brokerSocketPath']) {
    assert.throws(() => plan({ [missing]: undefined }), new RegExp(missing.replace('Path', ''), 'i'), missing);
  }
});

test('the attempt record carries the grant fingerprint and never the grant itself', () => {
  const { attempt, grantToken } = plan();
  const serialised = JSON.stringify(attempt);
  assert.ok(attempt.grant.fingerprint.startsWith('sha256:'));
  assert.ok(!serialised.includes(grantToken), 'the durable record must not embed a bearer credential');
  assert.ok(!serialised.includes(SECRET), 'the signing key must have no representation in durable state');
});

test('an unpinned task image is refused before an attempt is recorded', () => {
  assert.throws(() => assertPinnedImage({ reference: 'localhost/app-builder-task', digest: 'latest' }), /sha256 content digest/);
  assert.throws(() => assertPinnedImage({ reference: 'localhost/app-builder-task' }), /digest is required/);
  assert.throws(() => plan({ image: { reference: 'node', digest: 'sha256:short' } }), /sha256 content digest/);
  assert.throws(() => assertPinnedImage({ reference: `localhost/x@${IMAGE.digest}`, digest: IMAGE.digest }), /supply the repository and the digest separately/);
});

test('an attempt that stopped must name why it stopped', () => {
  const { attempt } = plan();
  const running = transitionAttempt(transitionAttempt(attempt, 'starting'), 'running');
  assert.throws(() => transitionAttempt(running, 'exited', {}), /must name why/);
  assert.throws(() => transitionAttempt(running, 'exited', { exitReason: 'probably-fine' }), /must name why/);
  for (const reason of ATTEMPT_EXIT_REASONS) {
    assert.equal(transitionAttempt(running, 'exited', { exitReason: reason }).exitReason, reason);
  }
  assert.throws(() => transitionAttempt(attempt, 'running'), /Invalid attempt transition/);
  assert.throws(() => transitionAttempt(attempt, 'imagining'), /Unknown attempt state/);
  assert.ok(ATTEMPT_STATES.includes('disposed'));
});

// ---------------------------------------------------------------------------
// The driver contract.
// ---------------------------------------------------------------------------

test('a partial driver is refused rather than half-supported', () => {
  for (const method of EXECUTION_DRIVER_METHODS) {
    const partial = fakeDriver();
    delete partial[method];
    assert.throws(() => assertExecutionDriver(partial), new RegExp(method), method);
  }
  assert.throws(() => assertExecutionDriver({ ...fakeDriver(), id: '' }), /must name itself/);
  assert.throws(() => assertExecutionDriver(null), /execution driver is required/);
});

test('an adapter with no durable journal is refused', () => {
  assert.throws(() => new ExecutionEnvironmentAdapter({ driver: fakeDriver(), journal: {} }), /requires a durable journal/);
});

// ---------------------------------------------------------------------------
// Lifecycle paths a happy run never reaches.
// ---------------------------------------------------------------------------

test('a sandbox that cannot be created is a failed start, not a failed task', async () => {
  const driver = fakeDriver({ async create() { throw new Error('no image on this host'); } });
  const { journal, events } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal });
  await assert.rejects(adapter.createAttempt(plan(), { command: ['true'] }), /no image on this host/);
  const exited = events.find((event) => event.type === ATTEMPT_EVENT_TYPES.exited);
  assert.equal(exited.payload.exitReason, 'start-failed');
  assert.equal(adapter.attempts().length, 0, 'a failed start must leave nothing live');
});

test('a container the runtime will not remove is reported as an orphan, not swallowed', async () => {
  const driver = fakeDriver({ async remove() { throw new Error('device or resource busy'); } });
  const { journal } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal });
  await adapter.createAttempt(plan(), { command: ['true'] });
  await adapter.start('attempt-unit-1');
  await adapter.collect('attempt-unit-1');
  await assert.rejects(adapter.dispose('attempt-unit-1'), /Treat it as an orphan/);
});

test('cancel escalates from a request to a guarantee', async () => {
  const driver = fakeDriver();
  const { journal, events } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal, stopGraceMs: 20 });
  await adapter.createAttempt(plan(), { command: ['true'] });
  await adapter.start('attempt-unit-1');
  await adapter.cancel('attempt-unit-1', 'operator cancelled');
  const result = await adapter.collect('attempt-unit-1');
  assert.equal(result.exitReason, 'cancelled');
  assert.equal(result.cancelled, true);
  assert.ok(driver.state.signals.includes('SIGTERM'));
  assert.ok(events.some((event) => event.type === ATTEMPT_EVENT_TYPES.stopping));
  await adapter.dispose('attempt-unit-1');
  assert.equal(driver.state.removed, 1);
});

test('a wall clock stops an attempt nobody is waiting on', async () => {
  let resolveExit;
  const gate = new Promise((resolve) => { resolveExit = resolve; });
  const driver = fakeDriver({
    async collect() { await gate; return { exitCode: 137, stdout: '', stderr: 'killed', result: null, durationMs: 30 }; },
    async signal(handle, signal) { this.state.signals.push(signal); this.state.running = false; resolveExit(); },
  });
  const { journal } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal, stopGraceMs: 5 });
  // Nothing awaits `collect` here on purpose: the timeout must fire from the
  // adapter's own timer, not from a caller happening to be blocked on the exit.
  await adapter.createAttempt(plan({ limits: { wallClockMs: 40 } }), { command: ['sleep'] });
  await adapter.start('attempt-unit-1');
  const settled = await adapter.collect('attempt-unit-1');
  assert.equal(settled.exitReason, 'timed-out');
  assert.equal(settled.timedOut, true);
  await adapter.dispose('attempt-unit-1');
});

test('disposeAll reclaims everything still live', async () => {
  const driver = fakeDriver({ async list() { return []; } });
  const { journal } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal, stopGraceMs: 5 });
  await adapter.createAttempt(plan(), { command: ['true'] });
  await adapter.start('attempt-unit-1');
  const results = await adapter.disposeAll();
  assert.equal(results.length, 1);
  assert.equal(results[0].error, null);
  assert.equal(adapter.attempts().length, 0);
});

// ---------------------------------------------------------------------------
// Restart recovery.
// ---------------------------------------------------------------------------

test('an attempt the ledger left running and the runtime no longer holds is lost, never assumed successful', async () => {
  const { attempt } = plan();
  const ledger = [
    { type: ATTEMPT_EVENT_TYPES.created, payload: { ...attempt }, usage: {} },
    { type: ATTEMPT_EVENT_TYPES.starting, payload: { ...attempt, state: 'starting' }, usage: {} },
    { type: ATTEMPT_EVENT_TYPES.started, payload: { ...attempt, state: 'running' }, usage: {} },
  ];
  const reduced = reduceAttemptEvents(ledger);
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].state, 'running');
  assert.equal(reduced[0].incomplete, true);
  assert.equal(reduced[0].orphanCandidate, true);

  const { journal, events } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver: fakeDriver({ async list() { return []; } }), journal });
  const recovery = await adapter.recover({ events: ledger });
  assert.equal(recovery.attempts[0].outcome, 'lost');
  const recorded = events.find((event) => event.type === ATTEMPT_EVENT_TYPES.recovered);
  assert.equal(recorded.payload.exitReason, 'lost');
  assert.notEqual(recorded.payload.exitReason, 'completed');
});

test('a sandbox still running after a restart is adopted, and one the ledger never mentioned is reported', async () => {
  const { attempt } = plan();
  const ledger = [{ type: ATTEMPT_EVENT_TYPES.started, payload: { ...attempt, state: 'running' }, usage: {} }];
  const driver = fakeDriver({
    async list() {
      return [
        { handle: 'handle-1', attemptId: attempt.attemptId, running: true },
        { handle: 'handle-stray', attemptId: 'attempt-from-a-previous-life', running: true },
      ];
    },
  });
  const { journal } = recorder();
  const recovery = await new ExecutionEnvironmentAdapter({ driver, journal }).recover({ events: ledger });
  assert.equal(recovery.attempts[0].outcome, 'running');
  assert.equal(recovery.orphans.length, 1);
  assert.equal(recovery.orphans[0].attemptId, 'attempt-from-a-previous-life');
});

test('a runtime that cannot be queried reports unknown rather than clean', async () => {
  const driver = fakeDriver({ async list() { throw new Error('podman is not installed'); } });
  const { journal } = recorder();
  const recovery = await new ExecutionEnvironmentAdapter({ driver, journal }).recover({ events: [] });
  assert.equal(recovery.runtimeReadable, false);
  assert.match(recovery.detail, /podman is not installed/);
});

test('attempt events reduce back into durable state and ignore unrelated ledger entries', () => {
  const { attempt } = plan();
  const reduced = reduceAttemptEvents([
    { type: 'project.generated', payload: { attemptId: 'not-an-attempt-event' }, usage: {} },
    { type: ATTEMPT_EVENT_TYPES.created, payload: { ...attempt }, usage: { durationMs: 0 } },
    { type: ATTEMPT_EVENT_TYPES.exited, payload: { ...attempt, state: 'exited', exitReason: 'completed' }, usage: { durationMs: 120, costGbp: 0 } },
    { type: ATTEMPT_EVENT_TYPES.disposed, payload: { ...attempt, state: 'disposed', exitReason: 'completed' }, usage: {} },
  ]);
  assert.equal(reduced.length, 1);
  assert.equal(reduced[0].state, 'disposed');
  assert.equal(reduced[0].exitReason, 'completed');
  assert.equal(reduced[0].incomplete, false);
  assert.equal(reduced[0].usage.durationMs, 120);
  assert.equal(reduced[0].events, 3);
});

// ---------------------------------------------------------------------------
// The whole lifecycle, against the real service and the real broker.
// ---------------------------------------------------------------------------

test('the deterministic runtime canary proves the whole attempt lifecycle', async () => {
  const report = await runRuntimeCanary();

  const unproven = report.checks.filter((check) => check.status === 'unproven');
  if (unproven.length > 0 && process.env.APP_BUILDER_ALLOW_UNPROVEN_ISOLATION !== '1') {
    assert.fail(
      `The canary could not prove ${unproven.map((check) => check.id).join(', ')} on this runner `
      + `(isolation mode: ${report.isolationMode}). A skipped proof under a green tick is not a proof. `
      + 'Set APP_BUILDER_ALLOW_UNPROVEN_ISOLATION=1 deliberately in the workflow to accept an unproven run.',
    );
  }

  const failed = report.checks.filter((check) => check.status === 'fail');
  assert.deepEqual(failed.map((check) => `${check.id} (${check.detail})`), [], 'every canary check must pass');

  // Named individually, because these are the claims the lane is making.
  const byId = new Map(report.checks.map((check) => [check.id, check.status]));
  for (const id of [
    'grant-delivered-by-file',
    'grant-not-on-command-line',
    'no-raw-secret-in-sandbox',
    'broker-socket-reachable',
    'allowed-operation-succeeds',
    'internal-only-operation-refused',
    'approval-gated-operation-refused',
    'ungranted-mutation-refused',
    'forged-grant-refused',
    'writes-stay-inside-declared-changeset-scope',
    'cancel-interrupted-a-genuinely-running-attempt',
    'no-orphaned-runtime-resource',
    'durable-state-records-every-attempt',
    'durable-state-shows-no-incomplete-attempt',
    'durable-state-records-capability-decisions',
    'restart-recovery-finds-nothing-unresolved',
  ]) {
    assert.equal(byId.get(id), 'pass', `${id} -> ${byId.get(id) ?? 'not run'}`);
  }

  // Every exit reason the lifecycle claims to support, actually reached.
  const reasons = new Set(report.scenarios.map((scenario) => scenario.exitReason));
  for (const reason of ['completed', 'failed', 'timed-out', 'cancelled']) {
    assert.ok(reasons.has(reason), `no scenario reached ${reason}`);
  }
  assert.ok(report.ok, 'the canary report must be ok');

  // And it must not overclaim: a process runtime is not a hosted Podman proof.
  assert.equal(report.proof, 'process-runtime');
  assert.match(report.hostedProof, /verify-agent-boundary\.sh/);
});


// ---------------------------------------------------------------------------
// The promotion gate. Landing this lane must not promote anything.
// ---------------------------------------------------------------------------

test('no specialist role is runtime-ready, and none becomes one by the sandbox working', () => {
  const promoted = Object.values(ROLES).filter((role) => role.runtimeReady === true);
  assert.deepEqual(promoted.map((role) => role.id), [], 'a working sandbox is not a runtime-ready role');
  assert.deepEqual(unearnedRuntimeReadyRoles({ roles: ROLES, gate: GATE }), []);
});

test('the readiness gate is deny-by-default and names every requirement a role has not met', () => {
  const role = ROLES['frontend-implementation'];
  // A resolver that says yes to everything, so this test measures the gate's
  // own arithmetic rather than the filesystem's.
  const permissive = () => ({ resolved: true, detail: 'stub' });

  const empty = evaluateRuntimeReadiness({ role, gate: GATE, evidence: {}, resolve: permissive });
  assert.equal(empty.ready, false);
  assert.equal(empty.missing.length, GATE.requirements.length);
  assert.ok(empty.missing.every((entry) => entry.reason === 'absent'));

  // Infrastructure evidence alone must not promote: the model-attempt
  // requirement is the one that cannot be satisfied without a real attempt,
  // and it is deliberately the last to fall.
  const infrastructureOnly = Object.fromEntries(
    GATE.requirements
      .filter((entry) => entry.id !== 'model-attempt-evidence')
      .map((entry) => [entry.id, 'test:tooling/runtime-lifecycle.test.mjs#the deterministic runtime canary proves the whole attempt lifecycle']),
  );
  const partial = evaluateRuntimeReadiness({ role, gate: GATE, evidence: infrastructureOnly, resolve: permissive });
  assert.equal(partial.ready, false);
  assert.deepEqual(partial.missing.map((entry) => entry.id), ['model-attempt-evidence']);

  // An empty reference is not evidence.
  const blank = evaluateRuntimeReadiness({
    role, gate: GATE, resolve: permissive,
    evidence: { ...infrastructureOnly, 'model-attempt-evidence': '   ' },
  });
  assert.equal(blank.ready, false);

  const complete = evaluateRuntimeReadiness({
    role, gate: GATE, resolve: permissive,
    evidence: { ...infrastructureOnly, 'model-attempt-evidence': 'record:tooling/runtime-lifecycle.test.mjs' },
  });
  assert.equal(complete.ready, true);
});

test('prose is not evidence, and neither is a reference nobody resolved', () => {
  const role = ROLES['frontend-implementation'];
  const permissive = () => ({ resolved: true, detail: 'stub' });
  const everything = (value) => Object.fromEntries(GATE.requirements.map((entry) => [entry.id, value]));

  // The failure this gate exists to prevent: eight confident strings promoting
  // a role that has never run.
  for (const claim of ['yes', 'verified during review', 'done', 'acceptance/first-model-canary']) {
    const decision = evaluateRuntimeReadiness({ role, gate: GATE, evidence: everything(claim), resolve: permissive });
    assert.equal(decision.ready, false, `"${claim}" must not promote a role`);
    assert.ok(decision.missing.every((entry) => entry.reason === 'malformed'), `"${claim}" is malformed, not merely unresolved`);
  }

  // A well-formed reference that does not resolve is refused with its reason.
  const refusing = () => ({ resolved: false, detail: 'the named test no longer exists' });
  const stale = evaluateRuntimeReadiness({
    role, gate: GATE, resolve: refusing,
    evidence: everything('test:tooling/runtime-lifecycle.test.mjs#a test that was renamed away'),
  });
  assert.equal(stale.ready, false);
  assert.ok(stale.missing.every((entry) => entry.reason === 'unresolved'));

  // No resolver means nothing was checked, which is not the same as satisfied.
  const unchecked = evaluateRuntimeReadiness({
    role, gate: GATE,
    evidence: everything('test:tooling/runtime-lifecycle.test.mjs#the deterministic runtime canary proves the whole attempt lifecycle'),
  });
  assert.equal(unchecked.ready, false);
  assert.ok(unchecked.missing.every((entry) => entry.reason === 'unverified'));
});

test('every recorded evidence reference resolves against the repository it names', () => {
  const resolve = createRuntimeReadinessEvidenceResolver({ repositoryRoot: ROOT });
  for (const [roleId, recorded] of Object.entries(GATE.evidence ?? {})) {
    assert.ok(ROLES[roleId], `evidence recorded for unknown role ${roleId}`);
    for (const [requirementId, reference] of Object.entries(recorded)) {
      // The host attestation is genuinely absent in CI, and that is the correct
      // answer there rather than a broken reference. Its *shape* is still checked.
      const parsed = parseEvidenceReference(reference);
      if (parsed.scheme === 'attestation') continue;
      const outcome = resolve(parsed);
      assert.equal(outcome.resolved, true, `${roleId}/${requirementId} cites "${reference}": ${outcome.detail}`);
    }
  }
});

test('no role carries the model-attempt evidence that only a real attempt can produce', () => {
  for (const [roleId, recorded] of Object.entries(GATE.evidence ?? {})) {
    assert.equal(
      recorded['model-attempt-evidence'] ?? null, null,
      `${roleId} claims model-attempt evidence, but no real model attempt has been authorised`,
    );
  }
  const resolve = createRuntimeReadinessEvidenceResolver({ repositoryRoot: ROOT });
  for (const role of Object.values(ROLES)) {
    assert.equal(evaluateRuntimeReadiness({ role, gate: GATE, resolve }).ready, false, role.id);
  }
});


// ---------------------------------------------------------------------------
// Stopping the attempt, not the wrapper.
// ---------------------------------------------------------------------------

/**
 * The regression this exists for cost a CI run.
 *
 * The isolation runner is not always the attempt. `unshare` execs, so the
 * child *is* the task; `sudo` forks, so the child is `sudo` and the task runs
 * underneath it — as root, which an unprivileged supervisor cannot even
 * signal. On a GitHub runner the driver falls back to `sudo -n unshare`, so a
 * cancel killed the wrapper, left the task running, and the leaked task held
 * the inherited stdout pipe. An open pipe from a live process keeps the
 * supervisor's event loop alive, so `npm run check` did not fail — it hung,
 * which is worse, because a hang is not a named failure anyone can read.
 *
 * The wrapper below forks rather than execs and ignores SIGTERM, which is the
 * shape that broke, without needing the privileged path to reproduce it.
 */
test('cancelling an attempt behind a forking wrapper stops the attempt, not just the wrapper', async () => {
  const worker = fileURLToPath(new URL('./lib/canary-worker.mjs', import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-wrapper-'));
  // `sh -c` with a trailing `wait`: the shell stays alive as a parent, and
  // ignores the polite signal, exactly as the real fallback runner does.
  const driver = createLocalExecutionDriver({
    isolation: { binary: '/bin/sh', prefix: ['-c', 'trap "" TERM; "$@" & wait $!', 'sandbox-wrapper'], privileged: false },
  });
  const { journal } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal, stopGraceMs: 300 });
  const attemptPlan = plan({
    attemptId: 'attempt-wrapper-1',
    workspacePath: path.join(root, 'workspace'),
    scratchPath: path.join(root, 'scratch'),
    grantPath: path.join(root, 'grant'),
    brokerSocketPath: path.join(root, 'broker.sock'),
    limits: { wallClockMs: 60_000 },
  });

  try {
    await adapter.createAttempt(attemptPlan, { command: [process.execPath, worker, JSON.stringify({ mode: 'hold' })] });
    await adapter.start('attempt-wrapper-1');

    // Wait for the task itself to exist, so the cancel below interrupts
    // something real rather than racing its start.
    const resultFile = path.join(root, 'scratch', 'attempt-result.json');
    let taskPid = null;
    for (let attempt = 0; attempt < 100 && taskPid === null; attempt += 1) {
      try {
        taskPid = JSON.parse(fs.readFileSync(resultFile, 'utf8')).pid ?? null;
      } catch {
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      }
    }
    assert.ok(Number.isInteger(taskPid), 'the attempt must have started for this proof to mean anything');
    assert.doesNotThrow(() => process.kill(taskPid, 0), 'the attempt must be alive before it is cancelled');
    assert.notEqual(taskPid, adapter.status('attempt-wrapper-1').containerId, 'the wrapper and the attempt must be different processes');

    await adapter.cancel('attempt-wrapper-1', 'proving the group is stopped');
    const collected = await adapter.collect('attempt-wrapper-1');
    assert.equal(collected.exitReason, 'cancelled');
    await adapter.dispose('attempt-wrapper-1');

    // The whole point: the task underneath the wrapper is gone too.
    let alive = true;
    for (let attempt = 0; attempt < 50 && alive; attempt += 1) {
      try {
        process.kill(taskPid, 0);
        await new Promise((resolve) => { setTimeout(resolve, 100); });
      } catch {
        alive = false;
      }
    }
    assert.equal(alive, false, `the attempt process ${taskPid} outlived its cancelled attempt`);
    assert.deepEqual(await driver.list(), [], 'dispose must leave no runtime handle');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the isolation runner reports whether stopping it needs the privilege that started it', () => {
  const detected = detectNetworkIsolation();
  if (detected === null) return; // Reported by the canary as `unproven`; not silently passed here.
  assert.ok(typeof detected.binary === 'string' && detected.binary.length > 0);
  assert.ok(Array.isArray(detected.prefix));
  // `sudo` forks and runs the attempt as root; the flag is what makes the
  // driver deliver its stop signal with the same privilege.
  assert.equal(detected.privileged, detected.binary === 'sudo');
});


/**
 * The other half of the privileged-runner problem, and the more dangerous one.
 *
 * `sudo` resets the environment. Everything an attempt is told about itself —
 * its broker socket, its grant path, where to write its result — arrives as
 * environment, so under the privileged runner the attempt started knowing
 * nothing, did nothing, and exited 0. That reads as a completed attempt. Every
 * boundary check silently did not run, under a passing scenario: the exact
 * shape this canary exists to refuse, in the canary's own harness.
 *
 * `env -i` clears the environment the same way `sudo` does, so the fix is
 * provable without needing a privileged runner or a real `sudo` on the machine.
 */
test('an attempt behind an environment-sanitising runner still receives its own co-ordinates', async () => {
  const worker = fileURLToPath(new URL('./lib/canary-worker.mjs', import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-sanitised-'));
  const driver = createLocalExecutionDriver({
    isolation: { binary: 'env', prefix: ['-i'], privileged: true },
  });
  const { journal } = recorder();
  const adapter = new ExecutionEnvironmentAdapter({ driver, journal, stopGraceMs: 200 });
  const attemptPlan = plan({
    attemptId: 'attempt-sanitised-1',
    workspacePath: path.join(root, 'workspace'),
    scratchPath: path.join(root, 'scratch'),
    grantPath: path.join(root, 'grant'),
    brokerSocketPath: path.join(root, 'broker.sock'),
    limits: { wallClockMs: 60_000 },
  });

  try {
    await adapter.createAttempt(attemptPlan, {
      command: [process.execPath, worker, JSON.stringify({ mode: 'boundary', workspaceWrites: ['src/proof.txt'] })],
    });
    await adapter.start('attempt-sanitised-1');
    const collected = await adapter.collect('attempt-sanitised-1');

    assert.equal(collected.exitReason, 'completed', collected.stderr.slice(0, 400));
    // Without the fix this is null, the attempt looks like a clean pass, and
    // nothing about the boundary was actually checked.
    assert.ok(collected.result, 'the attempt must have produced a structured result, not merely exited 0');
    assert.equal(collected.result.grantPresent, true, 'the attempt must have found its mounted grant');
    assert.equal(collected.result.grantFromEnvironment, false, 'the grant is never an environment value');
    assert.deepEqual(collected.result.secretShapedVariables, [], 'no credential-shaped variable may reach the attempt');
    assert.deepEqual(collected.result.workspaceWrites.map((entry) => entry.written), [true]);

    await adapter.dispose('attempt-sanitised-1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
