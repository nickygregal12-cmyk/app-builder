import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAndPublish, collectHeartbeat, publishHeartbeat } from './command-centre-heartbeat.mjs';

const env = {
  APP_BUILDER_SERVICE_PORT: '4310',
  PCC_HEARTBEAT_WRITE_URL: 'https://telemetry.example.test/functions/v1/runtime-heartbeat-ingest',
  PCC_HEARTBEAT_WRITER_SECRET: 'writer-secret-value'
};
const now = () => new Date('2026-08-29T18:00:00Z');
const osImpl = {
  totalmem: () => 1000,
  freemem: () => 400,
  loadavg: () => [0.5, 0.4, 0.3],
  cpus: () => [{}, {}]
};

test('collector reads only the loopback factory boundary and returns bounded metadata', async () => {
  const calls = [];
  const heartbeat = await collectHeartbeat({ env, now, osImpl, fetchImpl: async url => {
    calls.push(String(url));
    if (String(url) === 'http://127.0.0.1:4310/health') return Response.json({ ok: true, service: 'app-builder', version: 2 });
    if (String(url) === 'http://127.0.0.1:4310/projects') return Response.json({ projects: [{ id: 'one' }, { id: 'two' }] });
    throw new Error(`unexpected ${url}`);
  } });

  assert.deepEqual(calls, ['http://127.0.0.1:4310/health', 'http://127.0.0.1:4310/projects']);
  assert.equal(heartbeat.health, 'healthy');
  assert.equal(heartbeat.projectCount, 2);
  assert.equal(heartbeat.memoryPercent, 60);
  assert.equal(heartbeat.load1, 0.5);
  assert.equal(heartbeat.cpuCount, 2);
  assert.equal(heartbeat.activeRuns, null);
  assert.equal(heartbeat.agentCount, null);
});

test('unreachable factory is still publishable as an unhealthy heartbeat', async () => {
  const calls = [];
  const result = await collectAndPublish({ env, now, osImpl, fetchImpl: async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('http://127.0.0.1:4310/')) throw new Error('service down');
    assert.equal(String(url), env.PCC_HEARTBEAT_WRITE_URL);
    const sent = JSON.parse(options.body);
    assert.equal(sent.health, 'unhealthy');
    return Response.json({ ok: true, receivedAt: '2026-08-29T18:00:01Z' }, { status: 202 });
  } });

  assert.equal(result.published, true);
  assert.equal(result.health, 'unhealthy');
  assert.equal(calls.at(-1).options.headers['x-pcc-telemetry-key'], 'writer-secret-value');
  assert.equal(JSON.stringify(result).includes('writer-secret-value'), false);
});

test('project-list failure degrades a healthy factory rather than fabricating counts', async () => {
  const heartbeat = await collectHeartbeat({ env, now, osImpl, fetchImpl: async url => {
    if (String(url).endsWith('/health')) return Response.json({ ok: true, service: 'app-builder' });
    throw new Error('projects unavailable');
  } });
  assert.equal(heartbeat.health, 'degraded');
  assert.equal(heartbeat.projectCount, null);
});

test('publisher refuses non-HTTPS transport before making a request', async () => {
  let calls = 0;
  await assert.rejects(() => publishHeartbeat({ health: 'healthy' }, {
    env: { PCC_HEARTBEAT_WRITE_URL: 'http://example.test/write', PCC_HEARTBEAT_WRITER_SECRET: 'secret' },
    fetchImpl: async () => { calls += 1; return Response.json({ ok: true }); }
  }), /must use HTTPS/);
  assert.equal(calls, 0);
});

test('publisher requires a dedicated writer secret', async () => {
  await assert.rejects(() => publishHeartbeat({ health: 'healthy' }, {
    env: { PCC_HEARTBEAT_WRITE_URL: env.PCC_HEARTBEAT_WRITE_URL },
    fetchImpl: async () => Response.json({ ok: true })
  }), /PCC_HEARTBEAT_WRITER_SECRET is required/);
});
