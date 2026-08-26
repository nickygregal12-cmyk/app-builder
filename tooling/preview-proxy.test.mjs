import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { previewProxyRoute, resolvePreviewTarget } from '../apps/service/src/preview-proxy.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Stands in for a generated preview: it reports exactly what it was asked for. */
async function upstream(body = 'preview-body') {
  const received = [];
  const server = http.createServer((request, response) => {
    received.push({ method: request.method, path: request.url, host: request.headers.host });
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(body);
  });
  return { server, received, port: await listen(server) };
}

test('a preview path is parsed into a project and a base-relative remainder', () => {
  assert.deepEqual(previewProxyRoute('/preview/project-a/'), { projectId: 'project-a', rest: '' });
  assert.deepEqual(previewProxyRoute('/preview/project-a/src/main.tsx'), { projectId: 'project-a', rest: 'src/main.tsx' });
  assert.deepEqual(previewProxyRoute('/preview/project-a'), { projectId: 'project-a', rest: '' });
  assert.equal(previewProxyRoute('/preview/'), null);
  assert.equal(previewProxyRoute('/projects/project-a/preview'), null);
  assert.equal(previewProxyRoute('/health'), null);
  // Nothing that could address a host or climb out of the base is a project id.
  for (const hostile of ['/preview/../health', '/preview/..%2f..%2fhealth', '/preview/127.0.0.1:4310/', '/preview/a b/', '/preview/project-a/../../health']) {
    assert.equal(previewProxyRoute(hostile), null, hostile);
  }
});

test('a destination comes only from factory-owned preview state', () => {
  const service = {
    previewTarget(projectId) {
      if (projectId === 'unknown') throw new Error('Unknown project.');
      if (projectId === 'stopped') return null;
      if (projectId === 'factory-port') return { port: 4310, basePath: '/preview/factory-port/', url: 'http://127.0.0.1:4310/preview/factory-port/' };
      return { port: 45123, basePath: '/preview/live/', url: 'http://127.0.0.1:45123/preview/live/' };
    },
  };
  assert.equal(resolvePreviewTarget(service, 'unknown', { reservedPorts: [4310] }), null);
  assert.equal(resolvePreviewTarget(service, 'stopped', { reservedPorts: [4310] }), null);
  // Defence in depth: the factory's own control surface is never a preview.
  assert.equal(resolvePreviewTarget(service, 'factory-port', { reservedPorts: [4310] }), null);
  assert.equal(resolvePreviewTarget(service, 'live', { reservedPorts: [4310] }).port, 45123);
});

test('the proxy serves a live preview and its assets through the factory boundary', async () => {
  const preview = await upstream('<!doctype html><p>generated</p>');
  const service = {
    previewTarget: (projectId) => (projectId === 'live' ? { port: preview.port, basePath: '/preview/live/', url: `http://127.0.0.1:${preview.port}/preview/live/` } : null),
  };
  const facade = createFactoryHttpServer({ service, servicePort: 4310 });
  const port = await listen(facade);
  try {
    const page = await fetch(`http://127.0.0.1:${port}/preview/live/?__builder=1`);
    assert.equal(page.status, 200);
    assert.equal(await page.text(), '<!doctype html><p>generated</p>');

    const asset = await fetch(`http://127.0.0.1:${port}/preview/live/assets/app.css?v=2`);
    assert.equal(asset.status, 200);

    // The upstream sees its own base path, so a generated app's absolute asset
    // URLs resolve without the operator's browser knowing the loopback port.
    assert.deepEqual(preview.received.map((entry) => entry.path), ['/preview/live/?__builder=1', '/preview/live/assets/app.css?v=2']);
    assert.deepEqual([...new Set(preview.received.map((entry) => entry.host))], [`127.0.0.1:${preview.port}`]);

    const stopped = await fetch(`http://127.0.0.1:${port}/preview/other/`);
    assert.equal(stopped.status, 404);
    assert.equal((await stopped.json()).error, 'preview-not-running');
  } finally {
    await close(facade);
    await close(preview.server);
  }
});

test('an adversarial caller cannot proxy an arbitrary localhost service', async () => {
  const secret = await upstream('SECRET-SERVICE-BODY');
  const preview = await upstream('preview');
  const service = {
    previewTarget: (projectId) => (projectId === 'live' ? { port: preview.port, basePath: '/preview/live/', url: `http://127.0.0.1:${preview.port}/preview/live/` } : null),
  };
  const facade = createFactoryHttpServer({ service, servicePort: 4310 });
  const port = await listen(facade);
  const origin = `http://127.0.0.1:${port}`;
  try {
    const attempts = [
      `${origin}/preview/${secret.port}/`,
      `${origin}/preview/127.0.0.1:${secret.port}/`,
      `${origin}/preview/live/../../`,
      `${origin}/preview/live/..%2f..%2f`,
      `${origin}/preview/live%2f..%2f..%2f`,
      `${origin}/preview/http://127.0.0.1:${secret.port}/`,
    ];
    for (const attempt of attempts) {
      const response = await fetch(attempt, { redirect: 'manual' });
      const body = await response.text();
      assert.equal(body.includes('SECRET-SERVICE-BODY'), false, attempt);
    }
    // A caller-supplied Host header cannot redirect the destination either.
    const spoofed = await fetch(`${origin}/preview/live/`, { headers: { host: `127.0.0.1:${secret.port}` } });
    assert.equal(await spoofed.text(), 'preview');
    assert.equal(secret.received.length, 0);

    // Methods a generated preview never needs fail closed rather than reaching it.
    const deleted = await fetch(`${origin}/preview/live/`, { method: 'DELETE' });
    assert.equal(deleted.status, 405);

    // The control surfaces a preview must never reach are refused by name, not
    // by trusting the ephemeral-port allocator to avoid them.
    for (const reserved of [4310, 4096, 4097]) {
      const target = { previewTarget: () => ({ port: reserved, basePath: '/preview/live/', url: `http://127.0.0.1:${reserved}/preview/live/` }) };
      assert.equal(resolvePreviewTarget(target, 'live', { reservedPorts: [4310, 4096, 4097] }), null, String(reserved));
    }
    const controlSurface = createFactoryHttpServer({
      service: { previewTarget: () => ({ port: 4310, basePath: '/preview/live/', url: 'http://127.0.0.1:4310/preview/live/' }) },
      servicePort: 4310,
    });
    await listen(controlSurface);
    try {
      const refused = await fetch(`http://127.0.0.1:${controlSurface.address().port}/preview/live/`);
      assert.equal(refused.status, 404);
    } finally {
      await close(controlSurface);
    }
  } finally {
    await close(facade);
    await close(preview.server);
    await close(secret.server);
  }
});
