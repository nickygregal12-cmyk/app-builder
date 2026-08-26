/**
 * Adversarial coverage for the task sandbox boundary (#55, part 2).
 *
 * The capability broker removes a task's *authority* to invoke an internal
 * Factory operation. These tests are about the other half: removing the
 * *route*. A task that shares the host network namespace can open a socket to
 * `127.0.0.1:4310` whatever the broker thinks, so the acceptance here is a real
 * connection attempt from inside real isolation, not an assertion about
 * configuration.
 *
 * The isolation used below is a fresh, empty network namespace — the same
 * kernel primitive rootless Podman's `--network=none` creates. That is a
 * faithful local proof of the property, and it is not a proof that the hosted
 * Podman installation is configured this way. The host proof is
 * `ops/hetzner/verify-agent-boundary.sh` and is the operator's to run.
 */

import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_LIMITS,
  FORBIDDEN_EGRESS,
  FORBIDDEN_MOUNT_SOURCES,
  NETWORK_PROFILES,
  assertSpecIsolation,
  createExecutionEnvironmentSpec,
  networkProfileForPolicy,
} from '@app-builder/control-plane/execution-environment';
import { createCapabilityGrant } from '@app-builder/control-plane/capabilities';
import { FORBIDDEN_PODMAN_ARGUMENTS, assertArgumentsPreserveIsolation, podmanRunArgs } from './lib/sandbox-podman.mjs';
import { createAgentBroker } from '../apps/service/src/agent-broker.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const REGISTRY = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'config/agent-capabilities.json'), 'utf8'));
const POLICIES = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'config/agent-policies.json'), 'utf8'));
const SECRET = 'a'.repeat(48);
const PINNED_IMAGE = `localhost/app-builder-task@sha256:${'a'.repeat(64)}`;

function spec(overrides = {}) {
  return createExecutionEnvironmentSpec({
    attemptId: 'attempt-1',
    taskId: 'task-1',
    projectId: 'project-1',
    roleId: 'frontend-implementation',
    policyId: 'implementation',
    workspacePath: '/srv/app-builder-attempts/attempt-1/workspace',
    scratchPath: '/srv/app-builder-attempts/attempt-1/scratch',
    brokerSocketPath: '/run/app-builder/broker-attempt-1.sock',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// The spec contract.
// ---------------------------------------------------------------------------

test('a task sandbox shares no host namespace and publishes no port', () => {
  const environment = spec();
  assert.equal(environment.isolation.rootless, true);
  for (const key of ['hostNetwork', 'hostPid', 'hostIpc', 'hostUsers']) assert.equal(environment.isolation[key], false, key);
  assert.equal(environment.isolation.pid, 'private');
  assert.equal(environment.isolation.ipc, 'private');
  assert.equal(environment.network.profile, 'none');
  assert.deepEqual(environment.network.publishedPorts, []);
  assert.equal(environment.security.privileged, false);
  assert.equal(environment.security.noNewPrivileges, true);
  assert.deepEqual(environment.security.capabilitiesDropped, ['ALL']);
  assert.deepEqual(environment.security.capabilitiesAdded, []);
  for (const [key, value] of Object.entries(environment.limits)) assert.ok(value > 0, `${key} must be bounded`);
});

test('the only Factory reach is one socket, never a network origin', () => {
  const environment = spec();
  assert.equal(environment.factoryAccess.transport, 'unix-socket');
  const factoryMounts = environment.mounts.filter((mount) => mount.target === environment.factoryAccess.containerSocketPath);
  assert.equal(factoryMounts.length, 1);
  for (const destination of ['127.0.0.1:4310', 'localhost:4310', '[::1]:4310', 'host.containers.internal:4310', 'host.docker.internal:4310']) {
    assert.ok(environment.network.forbiddenDestinations.includes(destination), destination);
  }
  for (const range of ['127.0.0.0/8', '::1/128', '169.254.0.0/16', '10.0.0.0/8']) {
    assert.ok(FORBIDDEN_EGRESS.includes(range), range);
  }
});

test('no raw secret can be named into the sandbox environment', () => {
  const environment = spec();
  assert.ok(!environment.environment.allowed.includes('APP_BUILDER_AGENT_GRANT_SECRET'));
  for (const name of environment.environment.allowed) {
    for (const pattern of environment.environment.forbiddenPatterns) {
      assert.ok(!name.includes(pattern), `${name} matches forbidden ${pattern}`);
    }
  }
  assert.throws(
    () => assertSpecIsolation({ ...environment, environment: { ...environment.environment, allowed: [...environment.environment.allowed, 'ANTHROPIC_API_KEY'] } }),
    /forbidden pattern/,
  );
});

test('every widening of the spec is refused, not warned about', () => {
  const base = spec();
  const widenings = [
    [{ isolation: { ...base.isolation, hostNetwork: true } }, /host namespace/],
    [{ isolation: { ...base.isolation, hostPid: true } }, /host namespace/],
    [{ isolation: { ...base.isolation, hostUsers: true } }, /host namespace/],
    [{ isolation: { ...base.isolation, rootless: false } }, /rootless/],
    [{ isolation: { ...base.isolation, network: 'host' } }, /host network namespace/],
    [{ isolation: { ...base.isolation, pid: 'host' } }, /pid namespace must be private/],
    [{ security: { ...base.security, privileged: true } }, /privileged/],
    [{ security: { ...base.security, noNewPrivileges: false } }, /no-new-privileges/],
    [{ security: { ...base.security, capabilitiesDropped: [] } }, /capabilities must be dropped/],
    [{ security: { ...base.security, capabilitiesAdded: ['NET_ADMIN'] } }, /added capabilities/],
    [{ network: { ...base.network, publishedPorts: [{ host: 4310, container: 4310 }] } }, /publishes no port/],
    [{ limits: { ...base.limits, pidsMax: 0 } }, /must be a positive bound/],
    [{ factoryAccess: { ...base.factoryAccess, transport: 'http' } }, /never a network origin/],
  ];
  for (const [patch, pattern] of widenings) {
    assert.throws(() => assertSpecIsolation({ ...base, ...patch }), pattern, JSON.stringify(patch).slice(0, 80));
  }
});

test('a mount that would hand the task the host is refused', () => {
  const base = spec();
  for (const source of ['/var/run/docker.sock', '/run/podman/podman.sock', '/srv/app-builder/state', '/etc/app-builder', '/']) {
    assert.throws(
      () => assertSpecIsolation({ ...base, mounts: [...base.mounts, { source, target: '/mnt/host', mode: 'rw' }] }),
      /would hand the task|host root/,
      source,
    );
  }
  assert.throws(() => assertSpecIsolation({ ...base, mounts: [...base.mounts, { source: '/srv/app-builder/../../etc', target: '/mnt/x', mode: 'rw' }] }), /parent-directory/);
  assert.ok(FORBIDDEN_MOUNT_SOURCES.includes('/var/run/docker.sock'));
});

test('a role gets the public internet only when its policy allows it outright', () => {
  assert.equal(networkProfileForPolicy(POLICIES.policies.research), 'public-egress-only');
  assert.equal(networkProfileForPolicy(POLICIES.policies.review), 'none');
  assert.equal(networkProfileForPolicy(POLICIES.policies.specification), 'none');
  assert.equal(networkProfileForPolicy(POLICIES.policies['security-review']), 'none');
  // Approval-gated network access is not an allowed network profile.
  assert.equal(networkProfileForPolicy({ allow: ['network.public'], approvalRequired: ['network.public'], deny: [] }), 'none');
  assert.equal(networkProfileForPolicy({ allow: ['network.public'], approvalRequired: [], deny: ['network.public'] }), 'none');
  for (const policy of Object.values(POLICIES.policies)) {
    assert.ok(NETWORK_PROFILES.includes(networkProfileForPolicy(policy)));
  }
});

test('a public-egress role still gets its own namespace and the same forbidden destinations', () => {
  const environment = spec({ networkProfile: 'public-egress-only' });
  assert.equal(environment.isolation.network, 'private');
  assert.equal(environment.isolation.hostNetwork, false);
  assert.ok(environment.network.forbiddenDestinations.includes('127.0.0.1:4310'));
  assert.ok(environment.network.forbiddenEgress.includes('169.254.0.0/16'));
  assert.deepEqual(environment.network.publishedPorts, []);
});

// ---------------------------------------------------------------------------
// The rootless Podman translation.
// ---------------------------------------------------------------------------

test('the podman argv carries every isolation flag and none of the escapes', () => {
  const args = podmanRunArgs(spec(), { image: PINNED_IMAGE, command: ['node', 'worker.mjs'] });
  for (const expected of [
    '--network=none',
    '--pid=private',
    '--ipc=private',
    '--uts=private',
    '--cgroupns=private',
    '--security-opt=no-new-privileges',
    '--cap-drop=ALL',
    '--read-only',
    '--userns=keep-id',
    `--memory=${DEFAULT_LIMITS.memoryMb}m`,
    `--pids-limit=${DEFAULT_LIMITS.pidsMax}`,
  ]) {
    assert.ok(args.includes(expected), `argv must contain ${expected}`);
  }
  assert.ok(args.some((value) => value.startsWith('--tmpfs=/tmp:') && value.includes('noexec')));
  assert.ok(args.some((value) => value.endsWith('/run/app-builder/broker.sock:rw,Z')));
  assert.ok(args.includes(`APP_BUILDER_AGENT_BROKER_SOCKET=/run/app-builder/broker.sock`));
  assert.ok(!args.join(' ').includes('APP_BUILDER_AGENT_GRANT_SECRET'), 'the signing key has no representation in the argv');
  for (const forbidden of FORBIDDEN_PODMAN_ARGUMENTS) {
    assert.ok(!args.includes(forbidden), `argv must not contain ${forbidden}`);
  }
});

test('an argv edited to break isolation is refused', () => {
  const args = podmanRunArgs(spec(), { image: PINNED_IMAGE });
  for (const forbidden of ['--privileged', '--network=host', '--pid=host', '--userns=host', '--cap-add', '-p', '--publish', '--security-opt=label=disable']) {
    assert.throws(() => assertArgumentsPreserveIsolation([...args.slice(0, 3), forbidden, ...args.slice(3)]), /would undo the task boundary/, forbidden);
  }
  assert.throws(() => assertArgumentsPreserveIsolation([...args, '--volume', '/var/run/docker.sock:/var/run/docker.sock:rw']), /hand the task the host/);
});

test('an unpinned sandbox image is refused', () => {
  assert.throws(() => podmanRunArgs(spec(), { image: 'localhost/app-builder-task:latest' }), /pinned by digest/);
  assert.throws(() => podmanRunArgs(spec(), { image: 'node:22' }), /pinned by digest/);
});

test('a public-egress attempt runs on the bounded named network, never the host one', () => {
  const args = podmanRunArgs(spec({ networkProfile: 'public-egress-only' }), { image: PINNED_IMAGE });
  assert.ok(args.includes('--network=app-builder-egress'));
  assert.ok(!args.includes('--network=host'));
});

// ---------------------------------------------------------------------------
// The real thing: connection attempts from inside real network isolation.
// ---------------------------------------------------------------------------

/** Find a way to run a command in a fresh, empty network namespace. */
function isolationRunner() {
  const candidates = [
    ['unshare', ['--net', '--']],
    ['unshare', ['--user', '--map-root-user', '--net', '--']],
  ];
  for (const [binary, prefix] of candidates) {
    const probe = spawnSync(binary, [...prefix, 'true'], { stdio: 'ignore' });
    if (probe.status === 0) return { binary, prefix };
  }
  return null;
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

const PROBE_SOURCE = `
import net from 'node:net';
import http from 'node:http';

const targets = JSON.parse(process.argv[2]);
const socketPath = process.argv[3];
const grant = process.argv[4];

function tcp({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (reachable, detail) => { socket.destroy(); resolve({ host, port, reachable, detail }); };
    socket.setTimeout(2500);
    socket.on('connect', () => done(true, 'connected'));
    socket.on('timeout', () => done(false, 'timeout'));
    socket.on('error', (error) => done(false, error.code ?? String(error)));
  });
}

function broker() {
  return new Promise((resolve) => {
    const body = JSON.stringify({ operation: 'project.list' });
    const request = http.request(
      { socketPath, path: '/operation', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-app-builder-grant': grant }, timeout: 5000 },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    request.on('timeout', () => { request.destroy(); resolve({ status: null, body: 'timeout' }); });
    request.on('error', (error) => resolve({ status: null, body: error.code ?? String(error) }));
    request.end(body);
  });
}

const tcpResults = [];
for (const target of targets) tcpResults.push(await tcp(target));
process.stdout.write(JSON.stringify({ tcp: tcpResults, broker: await broker() }));
`;

test('a task in real network isolation cannot reach the Factory listener, but can still reach the broker', async (t) => {
  const runner = isolationRunner();
  if (!runner) {
    t.skip('no usable network-namespace isolation on this runner; run ops/hetzner/verify-agent-boundary.sh on the host for the Podman proof');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-sandbox-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  const factory = createFactoryHttpServer({ service, servicePort: 4310 });
  const broker = createAgentBroker({ service, registry: REGISTRY, secret: SECRET });
  const probe = path.join(root, 'probe.mjs');
  fs.writeFileSync(probe, PROBE_SOURCE);

  let factoryPort = 4310;
  try {
    await listen(factory, 4310, '127.0.0.1');
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    // Something already owns 4310 on this runner. Bind an ephemeral port and
    // probe both: 4310 as the documented Factory listener, and the port this
    // Factory actually answers on, so the proof is about a live listener.
    factoryPort = (await listen(factory, 0, '127.0.0.1')).port;
  }
  const socketPath = await broker.listen(path.join(root, 'broker.sock'));

  const { token } = createCapabilityGrant(
    { attemptId: 'attempt-sandbox', taskId: 'task-1', projectId: 'project-sandbox', roleId: 'frontend-implementation', policyId: 'implementation', capabilities: ['project.list'] },
    SECRET,
  );

  const targets = [
    { host: '127.0.0.1', port: 4310 },
    { host: '127.0.0.1', port: factoryPort },
    { host: 'localhost', port: 4310 },
    { host: 'localhost', port: factoryPort },
    { host: '::1', port: 4310 },
    { host: '::1', port: factoryPort },
    ...hostAddresses().flatMap((address) => [{ host: address, port: 4310 }, { host: address, port: factoryPort }]),
  ];

  try {
    // Outside the namespace, the Factory is reachable. Without this the
    // isolated failures below would prove nothing but a dead listener.
    const outside = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: factoryPort, path: '/health', method: 'GET' }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(outside.status, 200, 'the Factory must be live for the isolation proof to mean anything');
    assert.match(outside.body, /"ok":true/);

    // Asynchronous on purpose. The broker this probe must reach runs on *this*
    // process's event loop, so a synchronous spawn would block the very server
    // the test is proving is reachable and report a timeout as isolation.
    const { stdout } = await promisify(execFile)(
      runner.binary,
      [...runner.prefix, process.execPath, probe, JSON.stringify(targets), socketPath, token],
      { encoding: 'utf8', timeout: 120_000 },
    );
    const result = JSON.parse(stdout);

    for (const attempt of result.tcp) {
      assert.equal(attempt.reachable, false, `an isolated task reached ${attempt.host}:${attempt.port} (${attempt.detail})`);
    }
    // Named, because these are the exact bypasses issue #55 lists.
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
      assert.ok(result.tcp.some((attempt) => attempt.host === host && attempt.port === 4310 && !attempt.reachable), `${host}:4310 must be unreachable`);
    }
    for (const address of hostAddresses()) {
      assert.ok(result.tcp.some((attempt) => attempt.host === address && !attempt.reachable), `host address ${address} must be unreachable`);
    }

    // And the boundary is usable, not merely closed.
    assert.equal(result.broker.status, 200, `the broker must still answer over the socket: ${result.broker.body}`);
    assert.ok(JSON.parse(result.broker.body).result.projects, 'the broker must return Factory-owned state');
  } finally {
    await broker.close();
    await new Promise((resolve) => factory.close(resolve));
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an isolated task sees no usable network interface at all', async (t) => {
  const runner = isolationRunner();
  if (!runner) {
    t.skip('no usable network-namespace isolation on this runner');
    return;
  }
  const output = execFileSync(
    runner.binary,
    [...runner.prefix, process.execPath, '-e', 'const os=require("node:os");process.stdout.write(JSON.stringify(Object.values(os.networkInterfaces()).flat().filter(Boolean).map((entry)=>({address:entry.address,internal:entry.internal}))))'],
    { encoding: 'utf8', timeout: 60_000 },
  );
  for (const entry of JSON.parse(output)) {
    assert.equal(entry.internal, true, `an isolated task must see no external interface, saw ${entry.address}`);
  }
});
