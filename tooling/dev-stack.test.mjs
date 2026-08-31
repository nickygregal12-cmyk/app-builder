import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createFactoryHttpServer } from '../apps/service/src/http.js';

/**
 * One machine can hold more than one factory.
 *
 * A host that runs the service under systemd owns the default port, and a
 * stack started from a checkout is a different factory with a different state
 * root and a different set of projects. The launcher used to fix the port and
 * treat any `{ok:true}` on it as its own service being ready, so it printed a
 * success banner and started a Console proxying into a factory it had not
 * started — while its own service died of EADDRINUSE behind that banner.
 *
 * These tests hold the two things that closed it: the launcher refuses a port
 * it does not own, and the service states which instance is answering so the
 * launcher can tell its own service from a stranger.
 */

function occupy(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function runDevStack(args) {
  return new Promise((resolve) => {
    execFile('node', ['tooling/dev-stack.mjs', ...args], { timeout: 30_000 }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

function healthOf(server) {
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json());
}

async function listening(instance) {
  const server = createFactoryHttpServer({ service: {}, servicePort: null, instance });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('health states which instance is answering, so a caller can tell one factory from another', async () => {
  const server = await listening('instance-under-test');
  try {
    const payload = await healthOf(server);
    assert.equal(payload.ok, true);
    assert.equal(payload.service, 'app-builder');
    assert.equal(payload.instance, 'instance-under-test');
  } finally {
    server.close();
  }
});

test('a service nobody launched carries no instance, so no caller can mistake it for one it started', async () => {
  const server = await listening(null);
  try {
    const payload = await healthOf(server);
    assert.equal(payload.ok, true);
    assert.equal('instance' in payload, false);
  } finally {
    server.close();
  }
});

test('the launcher refuses a service port it does not own instead of starting a Console against a stranger', async () => {
  const port = await freePort();
  const squatter = await occupy(port);
  try {
    const result = await runDevStack(['--service-port', String(port)]);
    assert.notEqual(result.code, 0, 'a stack that cannot own its service port must not exit successfully');
    const output = result.stderr + result.stdout;
    assert.match(output, /already in use/);
    // The operator has to be able to act on this without reading the launcher.
    assert.match(output, /--service-port/);
    assert.match(output, /npm run console/);
    // The banner is the thing that used to lie.
    assert.doesNotMatch(output, /App Builder stack: Console/);
  } finally {
    squatter.close();
  }
});

test('the launcher refuses a Console port it does not own before spawning a factory', async () => {
  const servicePort = await freePort();
  const consolePort = await freePort();
  const squatter = await occupy(consolePort);
  try {
    const result = await runDevStack(['--service-port', String(servicePort), '--console-port', String(consolePort)]);
    assert.notEqual(result.code, 0);
    const output = result.stderr + result.stdout;
    assert.match(output, /already in use/);
    assert.match(output, /--console-port/);
  } finally {
    squatter.close();
  }
});

test('an unusable port is refused as a mistake rather than coerced to a default', async () => {
  const result = await runDevStack(['--service-port', 'not-a-port']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr + result.stdout, /must be a valid TCP port/);
});

test('the Console proxies to the factory it was pointed at rather than a fixed port', () => {
  const source = readFileSync('apps/console/vite.config.ts', 'utf8');
  assert.match(source, /APP_BUILDER_SERVICE_PORT/);
  assert.match(source, /APP_BUILDER_SERVICE_HOST/);
  // A surviving literal would silently win over the configured target.
  assert.doesNotMatch(source, /target:\s*['"]http:\/\/127\.0\.0\.1:4310['"]/);
});

test('the launcher tells the Console which factory it started', () => {
  const source = readFileSync('tooling/dev-stack.mjs', 'utf8');
  assert.match(source, /APP_BUILDER_SERVICE_INSTANCE/);
  // Readiness must be a statement about our own service, not about the port.
  assert.match(source, /payload\?\.instance === serviceInstance/);
  // The Console needs it too: pointing the proxy somewhere is not arriving there.
  const consoleChild = source.slice(source.indexOf('@app-builder/console'));
  assert.match(consoleChild, /APP_BUILDER_SERVICE_INSTANCE/);
});

/**
 * Getting the proxy target right once is not the same as staying there.
 *
 * A dev server restart re-reads its config, and in that window this Console was
 * observed listing another factory's businesses on the same host. A project
 * list looks identical whoever it came from, so the Console has to check rather
 * than assume — otherwise the failure has no symptom at all.
 */
test('the Console is told which factory it was started against', () => {
  const source = readFileSync('apps/console/vite.config.ts', 'utf8');
  assert.match(source, /__APP_BUILDER_EXPECTED_INSTANCE__/);
  assert.match(source, /APP_BUILDER_SERVICE_INSTANCE/);
});

test('the Console refuses a factory it was not started against rather than rendering its projects', () => {
  const source = readFileSync('apps/console/src/ConsoleRoot.tsx', 'utf8');
  assert.match(source, /__APP_BUILDER_EXPECTED_INSTANCE__/);
  assert.match(source, /'mismatch'/);
  // The refusal has to replace the surfaces, not sit above them: a warning over
  // a working project list is still somebody else's project list.
  const mismatchGuard = source.match(/if \(identity === 'mismatch'\) return[\s\S]{0,400}/);
  assert.ok(mismatchGuard, 'a mismatch must short-circuit the whole Console');
  assert.match(mismatchGuard[0], /not started against/i);
  // No declared expectation is the ordinary `npm run console` case and must not
  // invent a complaint.
  assert.match(source, /'unknown'/);
});
