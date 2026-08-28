/**
 * The model-powered task that runs *inside* an attempt sandbox.
 *
 * `canary-worker.mjs` proves the lifecycle with no model anywhere. This is the
 * same shape with one thing changed: between reading its bounded context and
 * writing its structured result, it asks a model.
 *
 * What it does, in order:
 *
 * 1. reads its grant from the mounted file — never a command line, never a
 *    broad host environment;
 * 2. checks that nothing credential-shaped reached it, and reports what it
 *    found rather than deciding whether that is acceptable;
 * 3. gathers its review material through the capability broker, using only
 *    operations its role's policy genuinely grants;
 * 4. sends one bounded request to the model gateway;
 * 5. writes the model's answer to its workspace as a structured artifact,
 *    unvalidated.
 *
 * That last word matters. This worker does not decide whether the verdict is
 * well-formed, whether the boundary held, or whether the canary passed. It is
 * the untrusted half. Everything it produces is an observation, and the
 * trusted harness in `tooling/model-canary.mjs` grades it against expectations
 * declared outside the sandbox — because a task that graded its own confinement
 * would be grading the thing it is not trusted about.
 *
 * It holds no credential and has nowhere to get one. It has no network. Its
 * only two reachable things are two Unix sockets it was handed, and it can
 * authorise itself to neither.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const SECRET_PATTERNS = ['SECRET', 'TOKEN', 'PASSWORD', 'API_KEY', 'CREDENTIAL', 'ANTHROPIC', 'GROQ', 'OPENAI', 'SUPABASE', 'NETLIFY'];

function socketCall(socketPath, endpoint, grant, payload, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const request = http.request(
      {
        socketPath,
        path: endpoint,
        method: 'POST',
        timeout: timeoutMs,
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
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
          resolve({ status: response.statusCode, body: parsed, raw: raw.slice(0, 2000) });
        });
      },
    );
    request.on('timeout', () => { request.destroy(); resolve({ status: 0, body: null, raw: 'timeout' }); });
    request.on('error', (error) => resolve({ status: 0, body: null, raw: error.code ?? String(error) }));
    request.end(body);
  });
}

/**
 * The review material, assembled from operations the role is actually granted.
 *
 * Each operation is recorded with its outcome whether it succeeded or not, so a
 * refusal shows up in the evidence as a refusal instead of as missing material.
 */
async function gatherMaterial(socketPath, grant, projectId, operations) {
  const collected = [];
  for (const operation of operations) {
    const response = await socketCall(socketPath, '/operation', grant, { operation, projectId, arguments: {} }, 20_000);
    collected.push({
      operation,
      status: response.status,
      reason: response.body?.reason ?? null,
      ok: response.status === 200,
      result: response.status === 200 ? response.body?.result ?? null : null,
    });
  }
  return collected;
}

export async function runModelCanaryWorker({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const plan = JSON.parse(argv[0] ?? '{}');
  const observations = { schemaVersion: 1 };

  // --- 1. The grant, from the file the spec mounted. -------------------------
  const grantFile = env.APP_BUILDER_AGENT_GRANT_FILE ?? null;
  let grant = null;
  try {
    grant = grantFile ? fs.readFileSync(grantFile, 'utf8').trim() : null;
  } catch (error) {
    observations.grantReadError = error instanceof Error ? error.message : String(error);
  }
  observations.grantPresent = Boolean(grant);
  observations.grantFromEnvironment = Boolean(env.APP_BUILDER_AGENT_GRANT);

  // --- 2. What credential-shaped material reached this sandbox. --------------
  //
  // Reported as *names*, never values. A worker that echoed the value of a
  // variable it found suspicious would be the leak it was checking for.
  observations.secretShapedVariables = Object.keys(env)
    .filter((name) => SECRET_PATTERNS.some((pattern) => name.toUpperCase().includes(pattern)))
    .filter((name) => !name.startsWith('APP_BUILDER_AGENT_GRANT'))
    .sort();

  // The model lane is a socket and nothing more. If the sandbox could see an
  // endpoint, a model name or a key path, that would be the lane leaking its
  // trusted half, so the worker records exactly what it can see about it.
  const modelSocket = env.APP_BUILDER_MODEL_SOCKET ?? null;
  observations.modelSocket = modelSocket;
  observations.modelSocketIsSocket = Boolean(modelSocket && (() => {
    try { return fs.statSync(modelSocket).isSocket(); } catch { return false; }
  })());
  observations.modelEnvironmentKeys = Object.keys(env).filter((name) => /MODEL|PROVIDER|ANTHROPIC|GROQ|OPENAI/i.test(name)).sort();

  const brokerSocket = env.APP_BUILDER_AGENT_BROKER_SOCKET ?? null;
  observations.brokerSocket = brokerSocket;
  observations.brokerSocketIsSocket = Boolean(brokerSocket && (() => {
    try { return fs.statSync(brokerSocket).isSocket(); } catch { return false; }
  })());

  // --- 3. The material, through the broker and nowhere else. -----------------
  observations.operations = grant && brokerSocket
    ? await gatherMaterial(brokerSocket, grant, plan.projectId, plan.operations ?? [])
    : [];

  // --- 4. One model call. ----------------------------------------------------
  const material = {
    criteria: plan.criteria ?? [],
    subject: plan.subject ?? null,
    evidence: observations.operations.filter((entry) => entry.ok).map((entry) => ({ operation: entry.operation, result: entry.result })),
  };
  const materialText = JSON.stringify(material, null, 2);

  if (grant && modelSocket) {
    const response = await socketCall(modelSocket, '/complete', grant, {
      request: {
        requestId: plan.requestId,
        model: plan.model ?? null,
        modelClass: plan.model ? null : (plan.modelClass ?? 'small'),
        contextPacketRef: plan.contextPacketRef,
        contextPacketHash: plan.contextPacketHash,
        artifactContract: plan.artifactContract,
        instruction: plan.instruction,
        input: materialText,
        maxOutputTokens: plan.maxOutputTokens,
        timeoutMs: plan.modelTimeoutMs ?? 90_000,
      },
    }, (plan.modelTimeoutMs ?? 90_000) + 15_000);

    observations.model = {
      status: response.status,
      reason: response.body?.reason ?? null,
      detail: response.body?.detail ?? null,
      stopReason: response.body?.stopReason ?? null,
      modelReported: response.body?.model ?? null,
      usage: response.body?.usage ?? null,
      textLength: typeof response.body?.text === 'string' ? response.body.text.length : 0,
    };

    if (typeof response.body?.text === 'string') {
      // Written raw as well as parsed. When the answer is not valid JSON the
      // raw form is the only thing that can tell a reviewer why, and the
      // parsed form being null is itself a deterministic check result rather
      // than a crash in here.
      const workspace = env.APP_BUILDER_WORKSPACE ?? '/workspace';
      fs.mkdirSync(workspace, { recursive: true });
      fs.writeFileSync(path.join(workspace, 'model-answer.txt'), response.body.text, 'utf8');
      try {
        observations.artifact = JSON.parse(response.body.text);
        observations.artifactParsed = true;
        fs.writeFileSync(path.join(workspace, 'verdict.json'), JSON.stringify(observations.artifact, null, 2), 'utf8');
      } catch (error) {
        observations.artifact = null;
        observations.artifactParsed = false;
        observations.artifactParseError = error instanceof Error ? error.message : String(error);
      }
    }
  } else {
    observations.model = { status: 0, reason: 'no-model-lane', detail: 'this attempt was given no model socket' };
  }

  // A second call, made unconditionally, so "the budget stopped the next call"
  // is proved by a refusal rather than by nobody trying. Its expected outcome
  // is declared outside this sandbox.
  if (grant && modelSocket && plan.probeSecondCall) {
    const probe = await socketCall(modelSocket, '/complete', grant, {
      request: {
        model: plan.model ?? null,
        modelClass: plan.model ? null : (plan.modelClass ?? 'small'),
        contextPacketRef: plan.contextPacketRef,
        contextPacketHash: plan.contextPacketHash,
        artifactContract: plan.artifactContract,
        instruction: plan.instruction,
        input: 'probe',
        maxOutputTokens: plan.maxOutputTokens,
        timeoutMs: 30_000,
      },
    }, 45_000);
    observations.secondCall = { status: probe.status, reason: probe.body?.reason ?? null };
  }

  // A deliberate hold, used only to prove that the kill switch stops an attempt
  // that is still alive rather than merely refusing its next call. Without a
  // window, a worker that finishes in milliseconds would make the supervisor's
  // cancel path untestable — and an untested stop path is the one that does not
  // work when it is needed.
  // A referenced timer, deliberately: an unreferenced one lets Node exit
  // immediately with code 13 on the unsettled top-level await, which would end
  // the hold in milliseconds and turn the cancel proof into a coincidence.
  const holdMs = Number(plan.holdMs ?? 0);
  if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));

  return observations;
}

export async function main({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const observations = await runModelCanaryWorker({ env, argv });
  const resultFile = env.APP_BUILDER_RESULT_FILE ?? null;
  if (resultFile) {
    fs.mkdirSync(path.dirname(resultFile), { recursive: true });
    fs.writeFileSync(resultFile, JSON.stringify(observations, null, 2), 'utf8');
  }
  // Keys only. The observations carry the model's answer, and stdout is
  // captured into the attempt's collected output where an operator reads it;
  // the structured result file is the place the answer belongs.
  process.stdout.write(`${JSON.stringify({ attemptId: env.APP_BUILDER_ATTEMPT_ID ?? null, observations: Object.keys(observations) })}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('model-canary-worker.mjs')) {
  await main();
}
