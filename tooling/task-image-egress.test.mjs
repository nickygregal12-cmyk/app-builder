/**
 * Acceptance for the pinned task image and the public-egress network profile.
 *
 * Two boundaries that fail in the same way: quietly. An image that drifts to a
 * floating tag still runs; an egress profile whose filter is absent still
 * reaches the internet. Both would look like success. So both are tested for
 * what they *refuse*, and both fail closed when the thing that proves them is
 * missing.
 *
 * What this file can and cannot prove is worth stating. It proves the image
 * *declaration*, the resolver, the argv translation and the whole destination
 * policy — every spelling of every forbidden address — in CI, with no container
 * runtime. It does not prove the hosted filter. `ops/hetzner/verify-egress-profile.sh`
 * does that from inside a real container, and until it has, the Podman driver
 * refuses the profile.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertPinnedImage, resolveTaskImage } from '@app-builder/control-plane/attempts';
import {
  assertPublicEgressDestination,
  classifyEgressDestination,
  forbiddenEgressProbeTargets,
} from '@app-builder/control-plane/egress-policy';
import { createExecutionEnvironmentSpec, networkProfileForPolicy } from '@app-builder/control-plane/execution-environment';
import { podmanContainerArgs, podmanCreateArgs, podmanRunArgs } from './lib/sandbox-podman.mjs';
import { assertEgressAttestation, createPodmanExecutionDriver } from './lib/execution-driver-podman.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMAGES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/task-images.json'), 'utf8'));
const POLICIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/agent-policies.json'), 'utf8')).policies;
const CONTAINERFILE = fs.readFileSync(path.join(ROOT, 'ops/images/app-builder-task/Containerfile'), 'utf8');

// ---------------------------------------------------------------------------
// The pinned image.
// ---------------------------------------------------------------------------

test('the task image is declared once, minimally, and never as a floating tag', () => {
  const baseline = IMAGES.images['task-baseline'];
  assert.ok(baseline, 'a baseline task image must be declared');
  assert.equal(baseline.reference.includes(':'), false, 'the reference carries no tag; the digest is the identity');
  assert.equal(baseline.user, 'nonroot (uid 1000)');
  assert.equal(baseline.readOnlyRoot, true);
  assert.deepEqual(baseline.writablePaths, ['/workspace', '/scratch', '/tmp']);

  // Minimal by intent. A convenience tool in a task sandbox is a tool an
  // untrusted attempt can be steered into using.
  for (const excluded of ['any container or Podman client', 'sudo or any privilege-escalation helper', 'ssh clients and keys', 'cloud provider CLIs']) {
    assert.ok(baseline.excludes.includes(excluded), `${excluded} must be explicitly excluded`);
  }
  assert.ok(baseline.includes.length <= 6, 'the baseline image stays small; add a tool when a role needs it');
});

test('the Containerfile pins its base by the digest the manifest records', () => {
  const base = IMAGES.images['task-baseline'].base;
  assert.match(base.digest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(CONTAINERFILE.includes(base.digest), 'the Containerfile and the manifest must agree about the base image');
  for (const line of CONTAINERFILE.split('\n').filter((entry) => entry.startsWith('FROM'))) {
    assert.ok(line.includes('@sha256:'), `a FROM without a digest makes the built digest meaningless: ${line}`);
  }
  assert.ok(CONTAINERFILE.includes('USER 1000:1000'), 'the image must run as the unprivileged uid the spec assigns');
  assert.ok(/perm \/6000/.test(CONTAINERFILE), 'the image must drop setuid and setgid bits');
  assert.ok(!/^ENTRYPOINT/m.test(CONTAINERFILE), 'the command an attempt runs is the adapter\'s, not the image\'s');
});

test('an image with no recorded digest fails closed with the command that fixes it', () => {
  // This is the repository\'s current state, and the failure has to be
  // actionable rather than mysterious: nothing has been built on a host yet.
  assert.equal(IMAGES.images['task-baseline'].digest, null);
  assert.throws(() => resolveTaskImage(IMAGES, 'task-baseline'), /no recorded digest/);
  assert.throws(() => resolveTaskImage(IMAGES, 'task-baseline'), /build-task-image\.sh/);
  assert.throws(() => resolveTaskImage(IMAGES, 'task-baseline'), /Refusing rather than resolving a floating tag/);
  assert.throws(() => resolveTaskImage(IMAGES, 'no-such-image'), /No task image no-such-image is declared/);
});

test('a recorded digest resolves to a pinned identity the runtime accepts', () => {
  const digest = `sha256:${'c'.repeat(64)}`;
  const registry = { images: { 'task-baseline': { ...IMAGES.images['task-baseline'], digest } } };
  const image = resolveTaskImage(registry, 'task-baseline');
  assert.equal(image.pinned, `${IMAGES.images['task-baseline'].reference}@${digest}`);

  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'r', policyId: 'implementation',
    workspacePath: '/srv/attempts/a/workspace', scratchPath: '/srv/attempts/a/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock', grantPath: '/srv/attempts/a/grant',
  });
  const args = podmanRunArgs(spec, { image: image.pinned });
  assert.ok(args.includes(image.pinned), 'the pinned reference is what the runtime is asked to run');

  // The invariant the Podman translator already held, still held.
  assert.throws(() => podmanRunArgs(spec, { image: `${IMAGES.images['task-baseline'].reference}:baseline-1` }), /pinned by digest/);
  assert.throws(() => assertPinnedImage({ reference: 'x', digest: 'sha256:nope' }), /sha256 content digest/);
});

// ---------------------------------------------------------------------------
// The destination policy. Every spelling, because one spelling is a bypass.
// ---------------------------------------------------------------------------

test('every spelling of a forbidden destination is refused', () => {
  const forbidden = [
    // The Factory control plane, by address, name and runtime alias.
    ['127.0.0.1', 'loopback'], ['localhost', 'loopback'], ['[::1]', 'loopback'], ['::1', 'loopback'],
    ['host.containers.internal', 'factory-control-plane'], ['host.docker.internal', 'factory-control-plane'],
    // The same loopback address in every form a socket library accepts.
    ['127.1', 'loopback'], ['127.0.1', 'loopback'], ['0x7f.1', 'loopback'], ['0x7f000001', 'loopback'],
    ['2130706433', 'loopback'], ['0177.0.0.1', 'loopback'], ['::ffff:127.0.0.1', 'loopback'],
    // The hex spelling of an IPv4-mapped address, which is the one that
    // actually arrives: every URL parser normalises `::ffff:127.0.0.1` to
    // `::ffff:7f00:1`, so the dotted form the filter knew was a form nothing
    // ever presented. `[::ffff:a9fe:a9fe]` is the cloud metadata address.
    ['::ffff:7f00:1', 'loopback'], ['[::ffff:7f00:1]', 'loopback'], ['::ffff:0:7f00:1', 'loopback'],
    ['::ffff:a00:5', 'private'], ['::ffff:0a00:5', 'private'], ['::ffff:c0a8:101', 'private'],
    ['::ffff:ac10:1', 'private'], ['::ffff:a9fe:a9fe', 'metadata'], ['::ffff:a9fe:1', 'link-local'],
    ['::ffff:6440:1', 'carrier-grade-nat'], ['::ffff:0:0', 'unspecified'],
    // Private, link-local, metadata, ULA and carrier-grade NAT.
    ['10.0.0.1', 'private'], ['10.255.255.255', 'private'], ['172.16.0.1', 'private'], ['172.31.255.254', 'private'],
    ['192.168.1.1', 'private'], ['169.254.1.1', 'link-local'], ['169.254.169.254', 'metadata'],
    ['metadata.google.internal', 'metadata'], ['fd00::1', 'unique-local'], ['fe80::1', 'link-local'],
    ['100.64.0.1', 'carrier-grade-nat'], ['100.127.255.254', 'carrier-grade-nat'],
    ['0.0.0.0', 'unspecified'], ['::', 'unspecified'], ['224.0.0.1', 'multicast'], ['255.255.255.255', 'reserved'],
    ['', 'unparseable'],
  ];
  for (const [destination, classification] of forbidden) {
    const verdict = classifyEgressDestination(destination);
    assert.equal(verdict.classification, classification, `${destination} classified ${verdict.classification}`);
    assert.equal(verdict.allowed, false, `${destination} must not be allowed`);
    assert.throws(() => assertPublicEgressDestination(destination), /Refusing egress/, destination);
  }
});

test('the host\'s own global addresses are refused even though they are public addresses', () => {
  const hostAddresses = ['203.0.113.10', '198.51.100.7'];
  for (const address of hostAddresses) {
    const verdict = classifyEgressDestination(address, { hostAddresses });
    assert.equal(verdict.classification, 'host-address');
    assert.equal(verdict.allowed, false);
  }
  // The same address is ordinary public internet when it is not this host's.
  assert.equal(classifyEgressDestination('203.0.113.10', { hostAddresses: [] }).allowed, true);

  // And the host's own address wearing an IPv4-mapped IPv6 spelling is still
  // the host. A mapped address is resolved to its IPv4 value before this rule
  // runs, so there is no spelling of the factory host that walks past it.
  const mapped = classifyEgressDestination('::ffff:cb00:710a', { hostAddresses });
  assert.equal(mapped.classification, 'host-address');
  assert.equal(mapped.allowed, false);
  assert.equal(classifyEgressDestination('::ffff:cb00:710a', { hostAddresses: [] }).allowed, true);
});

test('a genuine IPv6 destination is not coerced into an IPv4 reading', () => {
  // The mapped-address fix must not swallow ordinary IPv6. These are real
  // addresses with real classifications and none of them is IPv4 in disguise.
  for (const [destination, classification] of [
    ['2001:4860:4860::8888', 'public'],
    ['2606:4700:4700::1111', 'public'],
    ['fe80::1', 'link-local'],
    ['fd00::1', 'unique-local'],
    ['ff02::1', 'multicast'],
    ['::1', 'loopback'],
  ]) {
    assert.equal(classifyEgressDestination(destination).classification, classification, destination);
  }
});

test('a name is never allowed on its own, and is refused when it resolves somewhere private', () => {
  const verdict = classifyEgressDestination('registry.npmjs.org');
  assert.equal(verdict.classification, 'dns-name');
  assert.equal(verdict.allowed, false, 'a name that has not been resolved is not a public destination');
  assert.equal(verdict.resolutionRequired, true);

  assert.throws(() => assertPublicEgressDestination('registry.npmjs.org'), /must be resolved before it can be allowed/);
  assert.throws(() => assertPublicEgressDestination('rebind.example', { resolvedAddresses: ['104.16.0.1', '127.0.0.1'] }), /resolves to 127\.0\.0\.1, which is loopback/);
  assert.throws(() => assertPublicEgressDestination('empty.example', { resolvedAddresses: [] }), /resolved to nothing/);
  assert.deepEqual(assertPublicEgressDestination('ok.example', { resolvedAddresses: ['104.16.0.1'] }).allowed, true);
});

test('public destinations still work, or the profile has silently become `none`', () => {
  for (const destination of ['104.16.0.1', '93.184.216.34', '8.8.8.8', '2606:4700::1111']) {
    assert.equal(classifyEgressDestination(destination).allowed, true, destination);
  }
});

test('the verifier probes the destinations the control plane forbids, not a hand-written list', () => {
  const targets = forbiddenEgressProbeTargets({ hostAddresses: ['203.0.113.10'], factoryPort: 4310 });
  const spelled = targets.map((entry) => `${entry.host}:${entry.port}`);
  for (const expected of ['127.0.0.1:4310', 'localhost:4310', '::1:4310', 'host.containers.internal:4310', '169.254.169.254:80', '10.0.0.1:22', '172.16.0.1:22', '192.168.0.1:22', '100.100.100.100:22', '203.0.113.10:4310', '203.0.113.10:4097']) {
    assert.ok(spelled.includes(expected), `the verifier must probe ${expected}`);
  }
  for (const target of targets) {
    assert.ok(target.why, 'every probe names why the destination is forbidden');
    assert.equal(classifyEgressDestination(target.host, { hostAddresses: ['203.0.113.10'] }).allowed, false, `${target.host} must be forbidden by the policy the verifier is generated from`);
  }
});

// ---------------------------------------------------------------------------
// Fail closed.
// ---------------------------------------------------------------------------

test('a public-egress attempt keeps its own namespace and the bounded named network', () => {
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'research-agent', policyId: 'research',
    networkProfile: 'public-egress-only',
    workspacePath: '/srv/attempts/a/workspace', scratchPath: '/srv/attempts/a/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock',
  });
  assert.equal(spec.isolation.network, 'private');
  assert.equal(spec.isolation.hostNetwork, false);
  const args = podmanRunArgs(spec, { image: `localhost/x@sha256:${'d'.repeat(64)}` });
  assert.ok(args.includes('--network=app-builder-egress'));
  assert.ok(!args.includes('--network=host'));
  assert.deepEqual(spec.network.publishedPorts, []);
});

test('only a policy that allows public network outright gets the egress profile', () => {
  assert.equal(networkProfileForPolicy(POLICIES.research), 'public-egress-only');
  assert.equal(networkProfileForPolicy(POLICIES.review), 'none');
  assert.equal(networkProfileForPolicy(POLICIES['security-review']), 'none');
  assert.equal(networkProfileForPolicy({ allow: ['network.public'], approvalRequired: ['network.public'] }), 'none');
});

test('an unproven, lapsed or wrong egress attestation refuses the profile rather than assuming a filter', (t) => {
  const directory = fs.mkdtempSync(path.join(ROOT, '.tmp-egress-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const attestationPath = path.join(directory, 'egress-profile.json');
  const write = (value) => fs.writeFileSync(attestationPath, JSON.stringify(value));

  assert.throws(() => assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }), /No egress-profile attestation/);
  assert.throws(() => assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }), /Refusing rather than assuming the filter is in place/);

  write({ result: 'passed', network: 'some-other-network', verifiedAt: new Date().toISOString() });
  assert.throws(() => assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }), /covers some-other-network/);

  write({ result: 'failed', network: 'app-builder-egress', verifiedAt: new Date().toISOString() });
  assert.throws(() => assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }), /does not record a pass/);

  write({ result: 'passed', network: 'app-builder-egress' });
  assert.throws(() => assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }), /no verifiedAt timestamp/);

  write({ result: 'passed', network: 'app-builder-egress', verifiedAt: '2020-01-01T00:00:00Z', maxAgeDays: 30 });
  assert.throws(() => assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }), /older than 30 days/);

  const fresh = { result: 'passed', network: 'app-builder-egress', verifiedAt: new Date().toISOString(), maxAgeDays: 30 };
  write(fresh);
  assert.equal(assertEgressAttestation({ attestationPath, network: 'app-builder-egress' }).result, 'passed');
});

test('the Podman driver refuses a public-egress attempt when the network is absent', async () => {
  // `podman` is not installed here, so `network exists` cannot succeed — which
  // is exactly the unavailable-runtime case the profile must fail closed on.
  const driver = createPodmanExecutionDriver({ binary: 'definitely-not-a-real-podman-binary' });
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'research-agent', policyId: 'research',
    networkProfile: 'public-egress-only',
    workspacePath: path.join(ROOT, '.tmp-egress-attempt/workspace'),
    scratchPath: path.join(ROOT, '.tmp-egress-attempt/scratch'),
    brokerSocketPath: '/run/app-builder/broker.sock',
  });
  await assert.rejects(
    driver.create({ attempt: { attemptId: 'a', image: { pinned: `localhost/x@sha256:${'e'.repeat(64)}` } }, spec, command: [] }),
    /egress network is not present.*Refusing rather than falling back to an unfiltered network/s,
  );
  fs.rmSync(path.join(ROOT, '.tmp-egress-attempt'), { recursive: true, force: true });
});

test('the ops scripts that make the profile real exist and are the ones the driver names', () => {
  for (const script of ['ops/hetzner/build-task-image.sh', 'ops/hetzner/install-egress-network.sh', 'ops/hetzner/verify-egress-profile.sh']) {
    assert.ok(fs.existsSync(path.join(ROOT, script)), `${script} must exist`);
  }
  const verifier = fs.readFileSync(path.join(ROOT, 'ops/hetzner/verify-egress-profile.sh'), 'utf8');
  // The verifier must derive its targets from the policy rather than restate
  // them, or the two drift and the hosted proof stops proving what CI checks.
  assert.ok(verifier.includes('forbiddenEgressProbeTargets'), 'the verifier generates its probe list from the control-plane policy');
  assert.ok(verifier.includes('/etc/app-builder/egress-profile.json'), 'the verifier writes the attestation the driver requires');
  assert.ok(verifier.includes('public DNS resolves'), 'the verifier proves the profile still reaches the public internet');

  const driver = fs.readFileSync(path.join(ROOT, 'tooling/lib/execution-driver-podman.mjs'), 'utf8');
  assert.ok(driver.includes('/etc/app-builder/egress-profile.json'), 'the driver and the verifier must name the same attestation');
});

// ---------------------------------------------------------------------------
// The supervised form of the argv.
// ---------------------------------------------------------------------------

test('the supervised create argv keeps every isolation flag and drops --rm', () => {
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'r', policyId: 'implementation',
    workspacePath: '/srv/attempts/a/workspace', scratchPath: '/srv/attempts/a/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock', grantPath: '/srv/attempts/a/grant',
  });
  const image = `localhost/app-builder-task@sha256:${'f'.repeat(64)}`;
  const created = podmanCreateArgs(spec, { image, command: ['node', 'worker.mjs'] });

  assert.equal(created[0], 'create');
  // A --rm container that has already been reaped cannot be inspected, and an
  // attempt whose outcome cannot be inspected has no durable evidence.
  assert.ok(!created.includes('--rm'), 'the supervised form must not auto-remove before its exit code is read');
  assert.ok(podmanRunArgs(spec, { image }).includes('--rm'), 'the one-shot form is unchanged');
  for (const expected of ['--network=none', '--pid=private', '--ipc=private', '--cgroupns=private', '--security-opt=no-new-privileges', '--cap-drop=ALL', '--read-only']) {
    assert.ok(created.includes(expected), `the supervised argv must still carry ${expected}`);
  }
  assert.throws(() => podmanContainerArgs(spec, { image, verb: 'exec' }), /Unsupported podman verb/);
});

test('the grant is mounted read-only and never spelled onto the command line', () => {
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'r', policyId: 'implementation',
    workspacePath: '/srv/attempts/a/workspace', scratchPath: '/srv/attempts/a/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock', grantPath: '/srv/attempts/a/grant',
  });
  const grantMount = spec.mounts.find((mount) => mount.target === '/run/app-builder/grant');
  assert.equal(grantMount.mode, 'ro', 'an attempt must not be able to rewrite its own grant');
  assert.equal(grantMount.source, '/srv/attempts/a/grant');

  const args = podmanCreateArgs(spec, { image: `localhost/x@sha256:${'a'.repeat(64)}` });
  assert.ok(args.some((value) => value === '/srv/attempts/a/grant:/run/app-builder/grant:ro,Z'));
  // The path, never the token: a shared host's process table is readable.
  assert.ok(args.includes('APP_BUILDER_AGENT_GRANT_FILE=/run/app-builder/grant'));
  assert.ok(!args.some((value) => String(value).startsWith('APP_BUILDER_AGENT_GRANT=')));
});

test('a mount that borrows the grant target\'s name cannot smuggle a different path in', () => {
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'r', policyId: 'implementation',
    workspacePath: '/srv/attempts/a/workspace', scratchPath: '/srv/attempts/a/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock', grantPath: '/srv/attempts/a/grant',
  });
  const widened = { ...spec, mounts: [...spec.mounts.filter((mount) => mount.target !== '/run/app-builder/grant'), { source: '/etc/shadow', target: '/run/app-builder/grant', mode: 'ro' }] };
  assert.throws(() => podmanCreateArgs(widened, { image: `localhost/x@sha256:${'a'.repeat(64)}` }), /would hand the task/);

  const writable = { ...spec, mounts: spec.mounts.map((mount) => (mount.target === '/run/app-builder/grant' ? { ...mount, mode: 'rw' } : mount)) };
  assert.throws(() => podmanCreateArgs(writable, { image: `localhost/x@sha256:${'a'.repeat(64)}` }), /grant must be mounted read-only/);

  const socketSwap = { ...spec, mounts: spec.mounts.map((mount) => (mount.target === '/run/app-builder/broker.sock' ? { ...mount, source: '/run/podman/podman.sock' } : mount)) };
  assert.throws(() => podmanCreateArgs(socketSwap, { image: `localhost/x@sha256:${'a'.repeat(64)}` }), /would hand the task/);
});

test('only allow-listed, non-secret variables reach the sandbox command line', () => {
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'r', policyId: 'implementation',
    workspacePath: '/srv/attempts/a/workspace', scratchPath: '/srv/attempts/a/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock', grantPath: '/srv/attempts/a/grant',
  });
  const image = `localhost/x@sha256:${'a'.repeat(64)}`;
  const args = podmanCreateArgs(spec, { image, environment: { APP_BUILDER_WORKSPACE: '/workspace' } });
  assert.ok(args.includes('APP_BUILDER_WORKSPACE=/workspace'));

  for (const forbidden of ['ANTHROPIC_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NETLIFY_AUTH_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'APP_BUILDER_AGENT_GRANT_SECRET']) {
    assert.throws(() => podmanCreateArgs(spec, { image, environment: { [forbidden]: 'x' } }), /not an allowed sandbox environment variable|forbidden pattern/, forbidden);
  }
});
