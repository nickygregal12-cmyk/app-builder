#!/usr/bin/env node
import os from 'node:os';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'app-builder';
const SOURCE_ID = 'app-builder-hetzner';
const COLLECTOR_VERSION = '1.0.0';

function serviceOrigin(env = process.env) {
  const port = Number(env.APP_BUILDER_SERVICE_PORT ?? 4310);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('APP_BUILDER_SERVICE_PORT must be a valid TCP port.');
  return `http://127.0.0.1:${port}`;
}

function writerEndpoint(env = process.env) {
  const value = env.PCC_HEARTBEAT_WRITE_URL;
  if (!value) throw new Error('PCC_HEARTBEAT_WRITE_URL is required.');
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('PCC_HEARTBEAT_WRITE_URL must use HTTPS.');
  return url;
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(3000)
  });
  if (!response.ok) throw new Error(`Local service returned HTTP ${response.status}.`);
  return response.json();
}

export async function collectHeartbeat({ fetchImpl = fetch, env = process.env, now = () => new Date(), osImpl = os } = {}) {
  const origin = serviceOrigin(env);
  let health = 'unhealthy';
  let projectCount = null;

  try {
    const serviceHealth = await getJson(`${origin}/health`, fetchImpl);
    if (serviceHealth?.ok === true && serviceHealth?.service === 'app-builder') health = 'healthy';
  } catch {
    health = 'unhealthy';
  }

  if (health === 'healthy') {
    try {
      const projects = await getJson(`${origin}/projects`, fetchImpl);
      projectCount = Array.isArray(projects?.projects) ? projects.projects.length : null;
      if (projectCount === null) health = 'degraded';
    } catch {
      health = 'degraded';
    }
  }

  const totalMemory = Number(osImpl.totalmem());
  const freeMemory = Number(osImpl.freemem());
  const memoryPercent = totalMemory > 0 && Number.isFinite(totalMemory) && Number.isFinite(freeMemory)
    ? Number(Math.min(100, Math.max(0, ((totalMemory - freeMemory) / totalMemory) * 100)).toFixed(2))
    : null;
  const load = osImpl.loadavg?.() ?? [];
  const load1 = Number.isFinite(Number(load[0])) ? Number(Number(load[0]).toFixed(2)) : null;
  const cpuCount = Array.isArray(osImpl.cpus?.()) && osImpl.cpus().length > 0 ? osImpl.cpus().length : null;

  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    source: SOURCE_ID,
    health,
    // The current factory HTTP contract does not expose a trustworthy active-run
    // or active-agent count. Null is deliberate; do not infer these from process
    // names or project states merely to fill the dashboard.
    activeRuns: null,
    agentCount: null,
    projectCount,
    memoryPercent,
    load1,
    cpuCount,
    collectorVersion: COLLECTOR_VERSION,
    observedAt: now().toISOString()
  };
}

export async function publishHeartbeat(heartbeat, { fetchImpl = fetch, env = process.env } = {}) {
  const endpoint = writerEndpoint(env);
  const secret = env.PCC_HEARTBEAT_WRITER_SECRET;
  if (!secret) throw new Error('PCC_HEARTBEAT_WRITER_SECRET is required.');

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-pcc-telemetry-key': secret
    },
    body: JSON.stringify(heartbeat),
    redirect: 'error',
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Heartbeat publisher returned HTTP ${response.status}.`);
  return response.json();
}

export async function collectAndPublish(options = {}) {
  const heartbeat = await collectHeartbeat(options);
  const result = await publishHeartbeat(heartbeat, options);
  return {
    published: result?.ok === true,
    health: heartbeat.health,
    projectCount: heartbeat.projectCount,
    observedAt: heartbeat.observedAt
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  collectAndPublish()
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`Command Centre heartbeat failed: ${error instanceof Error ? error.message : error}\n`);
      process.exitCode = 1;
    });
}
