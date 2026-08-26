#!/usr/bin/env node
/**
 * The deterministic runtime canary.
 *
 * This proves the complete attempt lifecycle before any model provider exists.
 * That ordering is deliberate: calling an LLM inside a sandbox nobody can
 * start, bound, cancel, collect and dispose of would produce output with no
 * evidence, and the first real agent attempt is only worth running once the
 * machinery around it is known to hold.
 *
 * It runs the real Factory HTTP service, the real capability broker, the real
 * capability registry, the real role policy projection and the real signed
 * grant. The only stand-in is the runtime: an attempt runs as a bounded local
 * process rather than a container, so this is runnable on any developer machine
 * and in CI.
 *
 * That stand-in is stated everywhere it matters. `isolationMode` in the report
 * says what was actually proved:
 *
 * - `network-namespace` — the attempt ran inside a fresh empty network
 *   namespace, so "the sandbox could not reach the Factory listener" is proved
 *   by connecting, not asserted from configuration;
 * - `none` — no namespace was available, and every network-isolation claim is
 *   reported `unproven`. A gate that reads this report must fail rather than
 *   treat an unproven claim as a passed one.
 *
 * Neither mode is a hosted proof. `ops/hetzner/verify-agent-boundary.sh` is
 * the proof that the host's rootless Podman is configured this way, and it
 * remains the operator's to run.
 *
 *   node tooling/runtime-canary.mjs [--json]
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ExecutionEnvironmentAdapter } from '@app-builder/control-plane/execution-adapter';
import { createAttemptPlan, reduceAttemptEvents } from '@app-builder/control-plane/attempts';
import { capabilitiesForRole } from '@app-builder/control-plane/capabilities';
import { buildRoleContextPacket } from '@app-builder/control-plane/roles';
import { createChangeSet, createTask, transitionTask, validateChangeSetResult } from '@app-builder/control-plane';

import { createAgentBroker } from '../apps/service/src/agent-broker.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { createLocalExecutionDriver } from './lib/execution-driver-local.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const WORKER = path.join(REPOSITORY_ROOT, 'tooling/lib/canary-worker.mjs');
const FACTORY_PORT = 4310;
const CANARY_SECRET = 'runtime-canary-grant-signing-key-not-a-production-secret';

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));
}

/**
 * The canary's runtime identity is content-addressed like a real task image,
 * because it is content: the digest is of the worker source that will run.
 * A pinned identity is a requirement of `createAttemptPlan`, and satisfying it
 * with a real hash rather than a placeholder keeps the durable evidence
 * truthful about what executed.
 */
function canaryImage() {
  const digest = createHash('sha256').update(fs.readFileSync(WORKER)).digest('hex');
  return { id: 'canary-local-process', reference: 'local-process/app-builder-canary-worker', digest: `sha256:${digest}` };
}

/**
 * Remove the canary's scratch tree, including anything the attempt created
 * with more privilege than this process has.
 *
 * Where the runner is `sudo`, the attempt runs as root and the directories it
 * creates inside its workspace are root-owned. Removing a file needs write
 * permission on its *parent*, so an unprivileged harness gets EACCES on those
 * subdirectories — and `force: true` only forgives ENOENT. Left unhandled,
 * the canary would fail in its cleanup after every check had passed, which
 * reports as a broken canary rather than as a tidy-up problem.
 */
function removeCanaryRoot(root, { privileged }) {
  try {
    fs.rmSync(root, { recursive: true, force: true });
    return { removed: true, detail: null };
  } catch (error) {
    if (!privileged) return { removed: false, detail: error instanceof Error ? error.message : String(error) };
    // Same privilege that created them, and only ever the temporary directory
    // this run made: never a path from anywhere else.
    const resolved = path.resolve(root);
    if (!resolved.startsWith(path.join(os.tmpdir(), 'app-builder-canary-'))) {
      return { removed: false, detail: `refusing to remove ${resolved} with elevated privilege` };
    }
    const result = spawnSync('sudo', ['-n', 'rm', '-rf', '--', resolved], { stdio: 'ignore' });
    return { removed: result.status === 0, detail: result.status === 0 ? null : 'privileged cleanup failed' };
  }
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      resolve(server.address());
    });
  });
}

function hostAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && !entry.internal && entry.family === 'IPv4')
    .map((entry) => entry.address);
}

function get(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: route, method: 'GET' }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end();
  });
}

const CANARY_MANIFEST = {
  schemaVersion: 1,
  project: { name: 'Runtime Canary', slug: 'runtime-canary', type: 'b2b-saas', primaryGoal: 'Prove the bounded attempt lifecycle end to end.' },
  modules: { auth: false, profiles: false, organisations: false, admin: false, uploads: false, email: false, 'audit-log': true, analytics: false, observability: true, billing: false, ai: false },
  infrastructure: { backend: 'supabase', deployment: 'netlify' },
  aiBudget: { mode: 'economy', maxBuildCostGbp: 1 },
  brand: { direction: 'professional', decisionMode: 'factory-decides' },
  inputs: { companyDetails: false, assets: [] },
  outOfScope: ['billing'],
};

/**
 * One scenario's expectations, declared here rather than inside the sandbox.
 *
 * The observations come from an untrusted task; the verdicts come from trusted
 * code. Keeping the two apart is what makes the canary a test of the boundary
 * rather than a report from behind it.
 */
function gradeBoundary(observations, { isolationProves, roleId, expectations }) {
  const checks = [];
  const check = (id, status, detail) => checks.push({ id, status, detail: `${roleId}: ${detail}` });

  check('grant-delivered-by-file', observations.grantPresent ? 'pass' : 'fail', observations.grantPresent ? 'the attempt read its grant from the mounted file' : 'no grant reached the attempt');
  check('grant-not-on-command-line', observations.grantFromEnvironment ? 'fail' : 'pass', 'the grant is never spelled into a shared host process table');
  check(
    'no-raw-secret-in-sandbox',
    (observations.secretShapedVariables ?? []).length === 0 ? 'pass' : 'fail',
    (observations.secretShapedVariables ?? []).join(', ') || 'no credential-shaped variable reached the attempt',
  );

  const reached = (observations.factoryTargets ?? []).filter((entry) => entry.reachable);
  check(
    'factory-http-unreachable',
    isolationProves ? (reached.length === 0 ? 'pass' : 'fail') : 'unproven',
    isolationProves
      ? (reached.map((entry) => `${entry.host}:${entry.port}`).join(', ') || `${(observations.factoryTargets ?? []).length} destination(s) refused from inside isolation`)
      : 'no network namespace was available on this runner; run ops/hetzner/verify-agent-boundary.sh for the hosted proof',
  );

  check('broker-socket-reachable', observations.brokerSocketIsSocket ? 'pass' : 'fail', observations.brokerSocket ?? 'no broker socket');

  // Every operation the scenario asked for is graded against what the role's
  // own policy projection says should happen to it. The expectation is derived
  // outside the sandbox from `capabilitiesForRole`, so a projection that
  // silently widened would fail here rather than pass quietly.
  const byOperation = new Map((observations.operations ?? []).map((entry) => [entry.operation, entry]));
  for (const expectation of expectations) {
    const observed = byOperation.get(expectation.operation);
    const matched = expectation.status === 200
      ? observed?.status === 200 && observed.hasResult
      : observed?.status === expectation.status && observed?.reason === expectation.reason;
    check(
      expectation.id,
      matched ? 'pass' : 'fail',
      `${expectation.operation} -> ${observed?.status ?? 'no response'} ${observed?.reason ?? ''} (expected ${expectation.status}${expectation.reason ? ` ${expectation.reason}` : ''})`.trim(),
    );
  }

  check(
    'forged-grant-refused',
    observations.forgedGrant?.status === 403 && observations.forgedGrant.reason === 'grant-signature-invalid' ? 'pass' : 'fail',
    `widened grant -> ${observations.forgedGrant?.status ?? 'no response'} ${observations.forgedGrant?.reason ?? ''}`.trim(),
  );

  if ((observations.workspaceWrites ?? []).length > 0) {
    check(
      'workspace-writable',
      observations.workspaceWrites.every((entry) => entry.written) ? 'pass' : 'fail',
      `${observations.workspaceWrites.length} file(s) written inside the workspace`,
    );
  }

  return checks;
}

/**
 * What each role's grant should actually permit, derived from the projection
 * rather than restated. The reader scenario exists because the writer role is
 * granted every registered capability: without a second role, "an ungranted
 * operation is refused" would be untested at the transport.
 */
function operationExpectations({ role, policy, registry }) {
  const granted = new Set(capabilitiesForRole({ role, policy, registry }).granted);
  const expectations = [
    { id: 'allowed-operation-succeeds', operation: 'project.read', status: 200 },
    { id: 'internal-only-operation-refused', operation: 'project.source.governance.update', status: 403, reason: 'operation-not-agent-accessible' },
  ];
  expectations.push(
    granted.has('project.sources.ingest')
      // Granted, but the registry marks it approvalRequired and the attempt
      // carries no approval, so the broker must still refuse it.
      ? { id: 'approval-gated-operation-refused', operation: 'project.sources.ingest', status: 403, reason: 'approval-required' }
      : { id: 'ungranted-gated-operation-refused', operation: 'project.sources.ingest', status: 403, reason: 'capability-not-granted' },
  );
  expectations.push(
    granted.has('project.overrides.write')
      ? { id: 'owned-mutation-succeeds', operation: 'project.overrides.write', status: 200 }
      : { id: 'ungranted-mutation-refused', operation: 'project.overrides.write', status: 403, reason: 'capability-not-granted' },
  );
  return expectations;
}

export async function runRuntimeCanary({ root = null, isolation = undefined } = {}) {
  const registry = readJson('config/agent-capabilities.json');
  const roles = readJson('config/agent-roles.json').roles;
  const policies = readJson('config/agent-policies.json').policies;
  // A writer and a reader. One role can only ever prove what that role is
  // allowed; the pair is what proves the projection is a boundary.
  const writerRole = roles['frontend-implementation'];
  const readerRole = roles['code-reviewer'];

  const workRoot = root ?? fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-canary-'));
  const store = new FactoryStore({ stateRoot: path.join(workRoot, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(workRoot, 'workspaces') });
  const factory = createFactoryHttpServer({ service, servicePort: FACTORY_PORT });
  const broker = createAgentBroker({ service, registry, secret: CANARY_SECRET });
  // `isolation` is an override so the exact runner a CI machine will pick —
  // including the privileged `sudo` fallback, where the attempt runs as root
  // and must be stopped and cleaned up with that same privilege — can be
  // exercised deliberately rather than only encountered on a runner.
  const driver = createLocalExecutionDriver({ isolation });
  const isolationProves = driver.isolationMode === 'network-namespace';

  const report = {
    schemaVersion: 1,
    ranAt: new Date().toISOString(),
    proof: 'process-runtime',
    proofScope: isolationProves
      ? 'lifecycle proved end to end; network isolation proved by a real network namespace on this runner'
      : 'lifecycle proved end to end; network isolation NOT proved on this runner',
    hostedProof: 'ops/hetzner/verify-agent-boundary.sh — neither mode above is a hosted Podman proof',
    driver: driver.id,
    isolationMode: driver.isolationMode,
    scenarios: [],
    checks: [],
    orphans: null,
    durable: null,
    ok: false,
  };

  let factoryPort = FACTORY_PORT;
  try {
    await listen(factory, FACTORY_PORT, '127.0.0.1');
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    factoryPort = (await listen(factory, 0, '127.0.0.1')).port;
  }
  const brokerSocket = await broker.listen(path.join(workRoot, 'runtime', 'agent-broker.sock'));

  try {
    // Without a live listener, every "unreachable from the sandbox" result
    // below would be a statement about a dead port rather than about isolation.
    const health = await get(factoryPort, '/health');
    assert.equal(health.status, 200, 'the Factory must be live for the isolation result to mean anything');
    report.factory = { port: factoryPort, live: true };

    const project = service.createProject({ manifest: CANARY_MANIFEST, id: 'runtime-canary' });
    const attemptEvents = [];
    const journal = {
      async record({ type, projectId, taskId, actor, payload, usage }) {
        const event = await service.recordOperationalEvent(projectId, type, payload, usage ?? {}, { taskId, actor });
        attemptEvents.push(event);
        return event;
      },
    };
    const adapter = new ExecutionEnvironmentAdapter({ driver, journal, stopGraceMs: 500 });

    const contextPacketFor = (role) => buildRoleContextPacket({
      role,
      artifacts: [
        { kind: 'PageSpec', id: 'page-home', summary: 'Home page structure.' },
        { kind: 'ChangeSet', id: 'changeset-canary', summary: 'Bounded canary change.' },
        // A kind the role does not read. It must be withheld, and the durable
        // record must say it was, or "bounded context" is only a claim.
        { kind: 'SecurityFindings', id: 'security-1', summary: 'Not this role\'s to read.' },
      ],
      contextTokensEstimate: 4200,
    });

    const changeSet = createChangeSet({
      taskId: 'canary-task',
      objective: 'Write the canary artefact inside the declared scope.',
      allowedFiles: writerRole.mutationScopes,
      forbiddenFiles: ['.env', 'config/**'],
      acceptanceChecks: ['the attempt writes only inside its declared ChangeSet scope'],
      rollback: 'Discard the attempt workspace; durable task state is unaffected.',
    });

    let sequence = 0;
    const runScenario = async ({ name, role = writerRole, mode, expect, limits, cancelAfterMs = null, workspaceWrites = [], grade = false }) => {
      const policy = policies[role.policyId];
      sequence += 1;
      const attemptId = `canary-attempt-${sequence}`;
      const attemptRoot = path.join(workRoot, 'attempts', attemptId);
      const outsideSentinel = path.join(workRoot, 'host-only', `${attemptId}.txt`);
      fs.mkdirSync(path.dirname(outsideSentinel), { recursive: true });

      let task = createTask({
        id: `${attemptId}-task`,
        projectId: project.id,
        objective: `Runtime canary scenario: ${name}`,
        acceptanceCriteria: ['the attempt lifecycle completes and disposes cleanly'],
        policyId: role.policyId,
        budget: { maxIterations: 1, maxRuntimeMs: limits?.wallClockMs ?? 60_000, maxCostGbp: 0, maxTokens: 0, maxNoProgressAttempts: 1 },
      });
      store.upsertTask(task);
      task = transitionTask(task, 'running', { incrementAttempt: true });
      store.upsertTask(task);

      const plan = createAttemptPlan(
        {
          attemptId,
          taskId: task.id,
          projectId: project.id,
          environment: 'development',
          role,
          policy,
          registry,
          image: canaryImage(),
          workspacePath: path.join(attemptRoot, 'workspace'),
          scratchPath: path.join(attemptRoot, 'scratch'),
          grantPath: path.join(attemptRoot, 'grant'),
          brokerSocketPath: brokerSocket,
          contextPacket: contextPacketFor(role),
          limits: { ...limits, tmpfsMb: 64 },
          maxOperations: 16,
          ttlSeconds: 300,
        },
        CANARY_SECRET,
      );

      const workerPlan = {
        mode,
        factoryTargets: [
          { host: '127.0.0.1', port: FACTORY_PORT },
          { host: '127.0.0.1', port: factoryPort },
          { host: 'localhost', port: factoryPort },
          { host: '::1', port: factoryPort },
          ...hostAddresses().map((address) => ({ host: address, port: factoryPort })),
        ],
        operations: [
          { operation: 'project.read' },
          { operation: 'project.source.governance.update' },
          { operation: 'project.sources.ingest', arguments: { sources: [] } },
          { operation: 'project.overrides.write', arguments: { overrides: [] } },
        ],
        // The role's declared network profile, carried into the report so a
        // scenario cannot claim isolation it was not configured for.

        workspaceWrites,
        outsideWrites: [outsideSentinel],
      };

      const scenario = { name, roleId: role.id, networkProfile: plan.attempt.networkProfile, attemptId, taskId: task.id, mode, expect, states: [] };
      await adapter.createAttempt(plan, { command: [process.execPath, WORKER, JSON.stringify(workerPlan)] });
      scenario.states.push(adapter.status(attemptId).state);
      await adapter.start(attemptId);
      scenario.states.push(adapter.status(attemptId).state);

      if (cancelAfterMs !== null) {
        await new Promise((resolve) => { const timer = setTimeout(resolve, cancelAfterMs); if (timer.unref) timer.unref(); });
        const live = await adapter.inspect(attemptId);
        scenario.runningWhenCancelled = live.runtime.running;
        await adapter.cancel(attemptId, 'Cancelled by the runtime canary.');
      }

      const collected = await adapter.collect(attemptId);
      scenario.exitReason = collected.exitReason;
      scenario.exitCode = collected.exitCode;
      scenario.timedOut = collected.timedOut;
      scenario.cancelled = collected.cancelled;
      scenario.expectedExitReason = expect;
      scenario.exitReasonMatches = collected.exitReason === expect;

      if (grade) {
        // An attempt that produced no structured result ran no boundary check,
        // and a scenario with no boundary checks would otherwise report as a
        // clean pass. That is the exact shape this canary exists to refuse, so
        // it is a named failure rather than an absence.
        report.checks.push({
          id: 'attempt-produced-a-structured-result',
          status: collected.result ? 'pass' : 'fail',
          detail: collected.result
            ? `${role.id}: ${Object.keys(collected.result).length} observation(s)`
            : `${role.id}: the attempt wrote no result, so none of its boundary checks ran (exit ${collected.exitCode}, ${collected.stderr.slice(0, 300) || 'no stderr'})`,
        });
      }
      if (grade && collected.result) {
        report.checks.push(...gradeBoundary(collected.result, {
          isolationProves,
          roleId: role.id,
          expectations: operationExpectations({ role, policy, registry }),
        }));
        // Only the workspace was written. Checked against the ChangeSet the
        // role declared, and against the host sentinel the task tried to write.
        const written = fs.existsSync(plan.spec.workspace.containerPath) ? [] : [];
        const workspaceFiles = fs.existsSync(path.join(attemptRoot, 'workspace'))
          ? fs.readdirSync(path.join(attemptRoot, 'workspace'), { recursive: true, withFileTypes: true })
              .filter((entry) => entry.isFile())
              .map((entry) => path.relative(path.join(attemptRoot, 'workspace'), path.join(entry.parentPath ?? entry.path, entry.name)))
          : written;
        const scope = validateChangeSetResult(changeSet, workspaceFiles);
        if (workspaceWrites.length > 0) report.checks.push({
          id: 'writes-stay-inside-declared-changeset-scope',
          status: scope.ok ? 'pass' : 'fail',
          detail: scope.ok ? `${workspaceFiles.length} file(s), all within ${changeSet.allowedFiles.join(', ')}` : `out of scope: ${[...scope.outOfScope, ...scope.forbiddenHits].join(', ')}`,
        });
        scenario.workspaceFiles = workspaceFiles;
      }

      await adapter.dispose(attemptId);
      scenario.states.push('disposed');
      scenario.disposed = adapter.status(attemptId) === null;
      scenario.runtimeHandlesAfterDispose = (await driver.list()).length;

      task = transitionTask(task, collected.exitReason === 'completed' ? 'succeeded' : 'failed', {
        stopReason: collected.exitReason === 'completed' ? null : `attempt ${collected.exitReason}`,
      });
      store.upsertTask(task);
      report.scenarios.push(scenario);
      return scenario;
    };

    await runScenario({
      name: 'bounded attempt completes',
      mode: 'boundary',
      expect: 'completed',
      limits: { wallClockMs: 120_000 },
      workspaceWrites: ['src/canary.txt', 'public/canary-note.txt'],
      grade: true,
    });

    await runScenario({
      name: 'a reader role is refused every operation it does not own',
      role: readerRole,
      mode: 'boundary',
      expect: 'completed',
      limits: { wallClockMs: 120_000 },
      grade: true,
    });

    await runScenario({ name: 'deliberate failure is recorded as a failure', mode: 'fail', expect: 'failed', limits: { wallClockMs: 60_000 } });

    await runScenario({ name: 'wall clock stops an attempt that will not stop', mode: 'hold', expect: 'timed-out', limits: { wallClockMs: 2000 } });

    await runScenario({ name: 'cancel stops an attempt that ignores SIGTERM', mode: 'hold', expect: 'cancelled', limits: { wallClockMs: 120_000 }, cancelAfterMs: 700 });

    // --- After every attempt: nothing left behind, and the ledger agrees. ---
    report.orphans = { runtimeHandles: (await driver.list()).length, liveAttempts: adapter.attempts().length };

    const ledger = service.listEvents(project.id, { afterSequence: 0 });
    const durable = reduceAttemptEvents(ledger);
    report.durable = {
      ledgerEvents: ledger.length,
      attempts: durable.map((attempt) => ({
        attemptId: attempt.attemptId,
        state: attempt.state,
        exitReason: attempt.exitReason,
        incomplete: attempt.incomplete,
        roleId: attempt.roleId,
        policyId: attempt.policyId,
        image: attempt.image?.pinned ?? null,
        networkProfile: attempt.networkProfile,
        capabilities: (attempt.capabilities ?? []).length,
        contextKinds: attempt.context?.artifactKinds ?? [],
        withheldKinds: attempt.context?.withheldKinds ?? [],
        grantFingerprint: attempt.grant?.fingerprint ?? null,
        events: attempt.events,
      })),
      operationDecisions: ledger.filter((event) => event.type === 'agent.operation.allowed' || event.type === 'agent.operation.denied').length,
    };

    // --- Restart recovery, with a supervisor that never saw these attempts. ---
    const restarted = new ExecutionEnvironmentAdapter({ driver: createLocalExecutionDriver({ isolation: null }), journal });
    report.recovery = await restarted.recover({ events: ledger });

    report.checks.push(
      { id: 'every-scenario-reached-its-expected-outcome', status: report.scenarios.every((scenario) => scenario.exitReasonMatches) ? 'pass' : 'fail', detail: report.scenarios.map((scenario) => `${scenario.name}: ${scenario.exitReason}`).join('; ') },
      { id: 'cancel-interrupted-a-genuinely-running-attempt', status: report.scenarios.some((scenario) => scenario.runningWhenCancelled === true) ? 'pass' : 'fail', detail: `cancelled while running: ${report.scenarios.filter((scenario) => scenario.runningWhenCancelled !== undefined).map((scenario) => `${scenario.name}=${scenario.runningWhenCancelled}`).join(', ') || 'no cancel scenario ran'}` },
      { id: 'no-orphaned-runtime-resource', status: report.orphans.runtimeHandles === 0 && report.orphans.liveAttempts === 0 ? 'pass' : 'fail', detail: `${report.orphans.runtimeHandles} runtime handle(s), ${report.orphans.liveAttempts} live attempt(s)` },
      { id: 'durable-state-records-every-attempt', status: report.durable.attempts.length === report.scenarios.length ? 'pass' : 'fail', detail: `${report.durable.attempts.length} of ${report.scenarios.length} attempts in the ledger` },
      { id: 'durable-state-shows-no-incomplete-attempt', status: report.durable.attempts.every((attempt) => attempt.state === 'disposed' && !attempt.incomplete) ? 'pass' : 'fail', detail: report.durable.attempts.map((attempt) => `${attempt.attemptId}=${attempt.state}/${attempt.exitReason}`).join(' ') },
      { id: 'durable-state-records-capability-decisions', status: report.durable.operationDecisions > 0 ? 'pass' : 'fail', detail: `${report.durable.operationDecisions} allow/deny decision(s) persisted` },
      { id: 'restart-recovery-finds-nothing-unresolved', status: report.recovery.attempts.every((attempt) => attempt.outcome === 'settled') && report.recovery.orphans.length === 0 ? 'pass' : 'fail', detail: report.recovery.attempts.map((attempt) => `${attempt.attemptId}=${attempt.outcome}`).join(' ') },
      { id: 'context-packet-withheld-unowned-artifact-kinds', status: report.durable.attempts.every((attempt) => (attempt.withheldKinds ?? []).includes('SecurityFindings')) ? 'pass' : 'fail', detail: report.durable.attempts[0]?.withheldKinds?.join(', ') ?? 'none' },
    );

    report.ok = report.checks.every((check) => check.status === 'pass');
    report.unproven = report.checks.filter((check) => check.status === 'unproven').map((check) => check.id);
    report.failed = report.checks.filter((check) => check.status === 'fail').map((check) => check.id);
    return report;
  } finally {
    await broker.close();
    await new Promise((resolve) => factory.close(resolve));
    await service.close();
    store.close();
    if (root === null) {
      const cleanup = removeCanaryRoot(workRoot, { privileged: Boolean(driver.isolationRunner?.privileged) });
      // Reported, never thrown: a cleanup problem after every check has passed
      // is not a failed canary, and hiding it entirely would leave a root-owned
      // directory on the runner with nothing saying so.
      if (!cleanup.removed) console.warn(`[runtime-canary] could not remove ${workRoot}: ${cleanup.detail}`);
    }
  }
}

function render(report) {
  const lines = [];
  lines.push('== App Builder deterministic runtime canary ==');
  lines.push(`driver:        ${report.driver} (${report.isolationMode})`);
  lines.push(`proof scope:   ${report.proofScope}`);
  lines.push(`hosted proof:  ${report.hostedProof}`);
  lines.push('');
  for (const scenario of report.scenarios) {
    lines.push(`${scenario.exitReasonMatches ? 'PASS' : 'FAIL'}  ${scenario.name} -> ${scenario.exitReason} (expected ${scenario.expectedExitReason})`);
  }
  lines.push('');
  for (const check of report.checks) {
    lines.push(`${check.status === 'pass' ? 'PASS' : check.status === 'unproven' ? 'UNPR' : 'FAIL'}  ${check.id}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  lines.push('');
  lines.push(`ledger events: ${report.durable.ledgerEvents}; attempts recorded: ${report.durable.attempts.length}; capability decisions: ${report.durable.operationDecisions}`);
  lines.push(`orphans:       ${report.orphans.runtimeHandles} runtime handle(s), ${report.orphans.liveAttempts} live attempt(s)`);
  if (report.unproven.length > 0) {
    lines.push('');
    lines.push(`UNPROVEN on this runner: ${report.unproven.join(', ')}`);
    lines.push('An unproven claim is not a passed one. Run the hosted verifier for the isolation proof.');
  }
  lines.push('');
  lines.push(report.ok ? 'Runtime canary passed.' : `Runtime canary FAILED: ${report.failed.join(', ') || 'see above'}`);
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('runtime-canary.mjs')) {
  const report = await runRuntimeCanary();
  process.stdout.write(process.argv.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : `${render(report)}\n`);
  if (!report.ok) process.exit(1);
}

export { render as renderRuntimeCanaryReport };
