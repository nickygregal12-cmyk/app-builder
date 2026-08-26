/**
 * The deterministic task that runs *inside* an attempt sandbox.
 *
 * It is not an agent and it contains no model. It is the smallest program that
 * exercises every boundary a real agent attempt would cross, so the lifecycle
 * can be proved before a provider credential exists anywhere in the system:
 *
 * - it reads its grant from the file the spec mounted, never from a command
 *   line or a broad host environment;
 * - it checks that no raw secret reached it;
 * - it tries to reach the Factory's internal HTTP listener directly, and
 *   expects to fail;
 * - it invokes one operation its role's policy genuinely grants, and expects
 *   to succeed;
 * - it invokes an internal-only operation and an approval-gated one, and
 *   expects both to be refused with named reasons;
 * - it writes inside its workspace and nowhere else;
 * - it writes a structured result the adapter collects.
 *
 * Everything it learns is reported as data. It does not decide whether the
 * boundary held — the canary harness does, against expectations declared
 * outside the sandbox, because a task that graded its own confinement would be
 * grading the thing it is not trusted about.
 *
 * Runtime-neutral by construction: it knows the environment-variable names the
 * execution-environment spec declares and nothing about how they were set.
 */

import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';

const SECRET_PATTERNS = ['SECRET', 'TOKEN', 'PASSWORD', 'API_KEY', 'CREDENTIAL', 'ANTHROPIC', 'OPENAI', 'SUPABASE', 'NETLIFY'];

function tcp({ host, port }, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (reachable, detail) => { socket.destroy(); resolve({ host, port, reachable, detail }); };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true, 'connected'));
    socket.on('timeout', () => done(false, 'timeout'));
    socket.on('error', (error) => done(false, error.code ?? String(error)));
  });
}

function brokerCall(socketPath, grant, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        socketPath,
        path: '/operation',
        method: 'POST',
        timeout: 15_000,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-app-builder-grant': grant,
        },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = JSON.parse(text); } catch { parsed = null; }
          resolve({ status: response.statusCode, body: parsed, raw: text.slice(0, 2000) });
        });
      },
    );
    request.on('timeout', () => { request.destroy(); resolve({ status: null, body: null, raw: 'timeout' }); });
    request.on('error', (error) => resolve({ status: null, body: null, raw: error.code ?? String(error) }));
    request.end(body);
  });
}

export async function runCanaryWorker({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const plan = JSON.parse(argv[0] ?? '{}');
  const observations = { mode: plan.mode ?? 'boundary' };

  // 1. The grant arrives as a mounted file, and only as a mounted file.
  const grantFile = env.APP_BUILDER_AGENT_GRANT_FILE ?? null;
  let grant = null;
  try {
    grant = grantFile ? fs.readFileSync(grantFile, 'utf8').trim() : null;
  } catch (error) {
    grant = null;
    observations.grantReadError = error instanceof Error ? error.message : String(error);
  }
  observations.grantPresent = Boolean(grant);
  observations.grantFromEnvironment = Boolean(env.APP_BUILDER_AGENT_GRANT);

  // 2. Nothing that looks like a raw credential came in with it.
  observations.secretShapedVariables = Object.keys(env).filter((name) => SECRET_PATTERNS.some((pattern) => name.includes(pattern)));

  // 3. The Factory's internal listener, attempted directly.
  observations.factoryTargets = [];
  for (const target of plan.factoryTargets ?? []) observations.factoryTargets.push(await tcp(target));

  // 4-6. The broker: one allowed operation, one internal-only, one gated.
  const socketPath = env.APP_BUILDER_AGENT_BROKER_SOCKET ?? null;
  observations.brokerSocket = socketPath;
  observations.brokerSocketIsSocket = Boolean(socketPath && (() => { try { return fs.statSync(socketPath).isSocket(); } catch { return false; } })());
  observations.operations = [];
  if (socketPath && grant) {
    for (const call of plan.operations ?? []) {
      const response = await brokerCall(socketPath, grant, { operation: call.operation, projectId: call.projectId ?? undefined, arguments: call.arguments ?? {} });
      observations.operations.push({
        operation: call.operation,
        status: response.status,
        reason: response.body?.reason ?? null,
        error: response.body?.error ?? null,
        hasResult: Boolean(response.body?.result),
        decisionId: response.body?.decisionId ?? null,
        raw: response.status === null ? response.raw : null,
      });
    }
  }

  // 7. A forged grant must not work. The signing key is not in here, so this
  //    is the strongest thing a task can attempt: edit the payload it holds.
  if (socketPath && grant) {
    const forged = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(grant.split('.')[0], 'base64url').toString('utf8')), capabilities: ['project.generate', 'project.overrides.write'] })).toString('base64url')}.${grant.split('.').pop()}`;
    const response = await brokerCall(socketPath, forged, { operation: 'project.generate' });
    observations.forgedGrant = { status: response.status, reason: response.body?.reason ?? null };
  }

  // 8. Writes, inside the workspace and attempted outside it.
  const workspace = env.APP_BUILDER_WORKSPACE ?? null;
  observations.workspaceWrites = [];
  for (const relative of plan.workspaceWrites ?? []) {
    try {
      const target = path.join(workspace, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `written by ${env.APP_BUILDER_ATTEMPT_ID}\n`);
      observations.workspaceWrites.push({ path: relative, written: true, error: null });
    } catch (error) {
      observations.workspaceWrites.push({ path: relative, written: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  observations.outsideWrites = [];
  for (const absolute of plan.outsideWrites ?? []) {
    try {
      fs.writeFileSync(absolute, 'escape\n');
      observations.outsideWrites.push({ path: absolute, written: true, error: null });
    } catch (error) {
      observations.outsideWrites.push({ path: absolute, written: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return observations;
}

/**
 * The entry point the sandbox actually runs.
 *
 * `hold` never returns: it is how the timeout and cancel scenarios get a task
 * that genuinely will not stop on its own, which is the only kind worth
 * proving a wall clock against.
 */
export async function main({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const plan = JSON.parse(argv[0] ?? '{}');
  const resultFile = env.APP_BUILDER_RESULT_FILE ?? null;
  if (plan.mode === 'hold') {
    // The pid is recorded so a test can prove the *attempt* was stopped, not
    // merely the wrapper the supervisor happened to hold a handle to.
    if (resultFile) fs.writeFileSync(resultFile, JSON.stringify({ mode: 'hold', holding: true, pid: process.pid }));
    process.stdout.write('holding\n');
    // Ignore the polite signal on purpose. A cancel or a wall clock that only
    // works on a co-operative task is not a bound.
    process.on('SIGTERM', () => {});
    // A referenced timer, not a never-settling promise: Node exits code 13 on
    // an unsettled top-level await, which would end the "hold" in milliseconds
    // and turn both the timeout and the cancel proof into a coincidence.
    setInterval(() => {}, 3_600_000);
    return;
  }
  if (plan.mode === 'fail') {
    if (resultFile) fs.writeFileSync(resultFile, JSON.stringify({ mode: 'fail', message: plan.message ?? 'deliberate failure' }));
    process.stderr.write(`${plan.message ?? 'deliberate failure'}\n`);
    process.exitCode = 3;
    return;
  }

  const observations = await runCanaryWorker({ env, argv });
  if (resultFile) fs.writeFileSync(resultFile, JSON.stringify(observations, null, 2));
  process.stdout.write(`${JSON.stringify({ attemptId: env.APP_BUILDER_ATTEMPT_ID ?? null, observations: Object.keys(observations) })}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('canary-worker.mjs')) {
  await main();
}
