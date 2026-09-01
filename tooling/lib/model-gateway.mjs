/**
 * The trusted model gateway.
 *
 * This is the only process in the system that ever holds a provider
 * credential, and it runs outside the sandbox. An attempt asks it for a
 * completion by presenting the capability grant it already has; the gateway
 * decides, calls, accounts and records; the attempt gets an answer and never
 * gets a key.
 *
 * It is shaped after `apps/service/src/agent-broker.js` on purpose, because
 * the two lanes have the same threat model and the same answer to it:
 *
 * - **one endpoint on a Unix socket**, so there is no port for anything to
 *   address and no route for a hostile spelling to find;
 * - **the same signed grant**, verified with the same secret, so a task can
 *   present authority and cannot mint it;
 * - **every decision durable**, allow and deny alike, in the project's
 *   existing event ledger rather than a second one.
 *
 * What it adds beyond the broker is the part that costs money, so it adds the
 * guards that money needs:
 *
 * - the kill switch is **re-read immediately before every provider call**, not
 *   once at startup. An operator who turns it off gets the next call refused
 *   even if this process has been up for an hour;
 * - the enable decision is **single-use**, tracked here;
 * - the budget is checked **before** the request against what that request
 *   could cost at its declared ceiling, and reconciled **after** from the
 *   provider's own token counts. A response with no usage is refused rather
 *   than recorded as free.
 *
 * The credential itself is resolved once, into a local variable, from the
 * reference the config names. It is never returned, never journalled, never
 * put in an error message, and never placed anywhere the sandbox can read.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import {
  GrantError,
  GrantNonceRegistry,
  verifyCapabilityGrant,
} from '@app-builder/control-plane/capabilities';
import {
  ModelLaneError,
  accountModelCall,
  createModelRequest,
  emptyModelSpend,
  evaluateModelLane,
  remainingModelBudget,
  verifyModelEnableDecision,
} from '@app-builder/control-plane/model-execution';
import { PROVIDER_REFUSAL_REASONS } from '@app-builder/control-plane/provider-routing';

import { readModelKillSwitch } from './model-kill-switch.mjs';
import { resolveProviderCredential } from './provider-credential.mjs';

export const MODEL_ENDPOINT = '/complete';
export const GRANT_HEADER = 'x-app-builder-grant';
const MAX_REQUEST_BYTES = 1024 * 1024;

export const MODEL_EVENT_TYPES = Object.freeze({
  requested: 'agent.model.requested',
  denied: 'agent.model.denied',
  completed: 'agent.model.completed',
  failed: 'agent.model.failed',
});

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('Request body exceeds the model gateway limit.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * @param {object} options
 * @param {object} options.adapter        provider implementation: `{ id, providerId, complete }`
 * @param {string} options.grantSecret    the same secret the attempt grant was minted with
 * @param {string} options.decisionToken  the operator's signed, single-use enable decision
 * @param {string} options.decisionSecret the secret that decision was signed with
 * @param {object} options.journal        durable sink: `record({ type, projectId, taskId, payload })`
 * @param {object} options.env            where the credential reference is resolved from
 */
export function createModelGateway({
  adapter,
  grantSecret,
  decisionToken,
  decisionSecret,
  journal,
  env = process.env,
  root = undefined,
  hostSwitchPath = null,
  providerProfile = null,
  clock = () => new Date(),
}) {
  if (typeof adapter?.complete !== 'function') throw new Error('A model gateway requires a provider adapter.');
  if (typeof journal?.record !== 'function') {
    throw new Error('A model gateway requires a durable journal. A provider call with no evidence is a spend nobody can review.');
  }

  const nonces = new GrantNonceRegistry();
  const spentDecisionIds = new Set();
  let spend = emptyModelSpend();
  let calls = [];

  // Resolved per call, held here, and returned by nothing. The closure is the
  // point: there is no accessor, so no caller — including a test — can ask this
  // gateway for the key it is using.
  //
  // Resolution is `resolveProviderCredential`'s alone, so the hosted path (a
  // systemd credential in the unit's private tmpfs) and the development path
  // (an environment variable) cannot diverge from what the preflight reports.
  // On the hosted path there is no environment variable to read, which is the
  // point of the change: a credential that is not in the environment is not
  // inherited by anything this process later starts.
  const readCredential = () => {
    const state = readModelKillSwitch({ root, env, hostSwitchPath, providerProfile });
    const reference = state.providerSecret?.secretRef;
    return reference ? resolveProviderCredential({ secretRef: reference, env }) : '';
  };

  async function journalEvent(type, projectId, taskId, payload) {
    try {
      await journal.record({ type, projectId, taskId, actor: `model-gateway:${adapter.id}`, payload });
    } catch {
      // A ledger that refused an event must not turn an allow into a throw the
      // caller could read as a different outcome. The broker takes the same
      // position for the same reason.
    }
  }

  async function handle(request, response) {
    if (request.method !== 'POST' || request.url !== MODEL_ENDPOINT) {
      return send(response, 404, { error: 'model-gateway-single-endpoint', endpoint: MODEL_ENDPOINT, method: 'POST' });
    }

    const header = request.headers[GRANT_HEADER];
    let grant;
    try {
      grant = nonces.register(verifyCapabilityGrant(Array.isArray(header) ? header[0] : header, { secret: grantSecret, now: clock() }));
    } catch (error) {
      const reason = error instanceof GrantError ? error.reason : 'grant-malformed';
      console.error(`[model-gateway] rejected caller: ${reason} (${clock().toISOString()})`);
      return send(response, 403, { error: 'denied', reason });
    }

    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return send(response, 400, { error: 'invalid-request', message: error.message });
    }

    // The switch, re-read now. Not at construction, not cached: the whole
    // value of a kill switch is that it applies to the call that has not
    // happened yet.
    const killSwitch = readModelKillSwitch({ root, env, hostSwitchPath, providerProfile });

    let decision = null;
    let decisionError = null;
    try {
      decision = verifyModelEnableDecision(decisionToken, { secret: decisionSecret, now: clock() });
    } catch (error) {
      decisionError = error instanceof ModelLaneError ? error.reason : 'decision-malformed';
    }

    let modelRequest;
    try {
      modelRequest = createModelRequest({
        ...body?.request,
        adapterId: adapter.id,
        providerId: adapter.providerId,
        attemptId: grant.attemptId,
        taskId: grant.taskId,
        projectId: grant.projectId,
        roleId: grant.roleId,
      });
    } catch (error) {
      return send(response, 400, { error: 'invalid-request', message: error instanceof Error ? error.message : String(error) });
    }

    const deny = async (reason, detail) => {
      await journalEvent(MODEL_EVENT_TYPES.denied, grant.projectId, grant.taskId, {
        attemptId: grant.attemptId,
        roleId: grant.roleId,
        requestId: modelRequest.requestId,
        adapterId: adapter.id,
        providerId: adapter.providerId,
        allowed: false,
        reason,
        detail,
      });
      return send(response, 403, { error: 'denied', reason, detail });
    };

    if (decisionError) return deny(decisionError, 'The enable decision did not verify.');

    const verdict = evaluateModelLane({
      killSwitch: { ...killSwitch, providerSecret: killSwitch.providerSecret },
      decision,
      grant,
      request: modelRequest,
      spend,
      spentDecisionIds,
      now: clock(),
    });
    if (!verdict.allowed) return deny(verdict.reason, verdict.detail);

    await journalEvent(MODEL_EVENT_TYPES.requested, grant.projectId, grant.taskId, {
      attemptId: grant.attemptId,
      roleId: grant.roleId,
      requestId: modelRequest.requestId,
      decisionId: decision.decisionId,
      adapterId: adapter.id,
      providerId: adapter.providerId,
      model: decision.model,
      // The packet by reference and hash. The packet's *content* is not
      // journalled: it is already durable where it was built, and copying it
      // into every event would make the ledger grow with the context.
      contextPacketRef: modelRequest.contextPacketRef,
      contextPacketHash: modelRequest.contextPacketHash,
      artifactContract: modelRequest.artifactContract,
      maxOutputTokens: modelRequest.maxOutputTokens,
      remainingBudget: verdict.remaining,
    });

    const apiKey = readCredential();
    if (!apiKey) return deny('provider-secret-missing', 'The credential reference resolved to nothing at dispatch time.');

    // A transport attempt consumes the one-shot decision even when the
    // provider refuses or fails. Otherwise a 429 or network error could be
    // followed by another real call under permission that authorised one.
    spentDecisionIds.add(decision.decisionId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), modelRequest.timeoutMs);
    if (timer.unref) timer.unref();

    let result;
    try {
      result = await adapter.complete({ request: { ...modelRequest, model: decision.model }, apiKey, signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      const message = error instanceof Error ? error.message : String(error);
      const reason = PROVIDER_REFUSAL_REASONS.includes(error?.reason) ? error.reason : 'provider-error';
      await journalEvent(MODEL_EVENT_TYPES.failed, grant.projectId, grant.taskId, {
        attemptId: grant.attemptId,
        roleId: grant.roleId,
        requestId: modelRequest.requestId,
        decisionId: decision.decisionId,
        adapterId: adapter.id,
        stopReason: controller.signal.aborted ? 'timed-out' : 'error',
        reason,
        message,
      });
      return send(response, 502, { error: 'provider-failed', reason, requestId: modelRequest.requestId, message });
    }
    clearTimeout(timer);

    try {
      spend = accountModelCall({ spend, usage: result.usage, pricingGbpPerMillionTokens: decision.pricingGbpPerMillionTokens });
    } catch (error) {
      const reason = error instanceof ModelLaneError ? error.reason : 'usage-unreconcilable';
      await journalEvent(MODEL_EVENT_TYPES.failed, grant.projectId, grant.taskId, {
        attemptId: grant.attemptId,
        requestId: modelRequest.requestId,
        decisionId: decision.decisionId,
        stopReason: 'error',
        reason,
      });
      return send(response, 502, { error: 'usage-unreconcilable', reason, requestId: modelRequest.requestId });
    }

    const call = {
      requestId: modelRequest.requestId,
      decisionId: decision.decisionId,
      adapterId: adapter.id,
      providerId: adapter.providerId,
      model: result.model,
      stopReason: result.stopReason,
      providerStopReason: result.providerStopReason ?? null,
      usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
      durationMs: result.durationMs ?? 0,
    };
    calls.push(call);

    await journalEvent(MODEL_EVENT_TYPES.completed, grant.projectId, grant.taskId, {
      attemptId: grant.attemptId,
      roleId: grant.roleId,
      ...call,
      spend,
      remainingBudget: remainingModelBudget({ decision, spend }),
    });

    // The answer, the model that gave it and how it stopped. Not the provider's
    // response envelope, and not its request id: a stable contract that carried
    // one would make the next runtime a migration.
    return send(response, 200, {
      requestId: modelRequest.requestId,
      text: result.text,
      stopReason: result.stopReason,
      model: result.model,
      usage: call.usage,
    });
  }

  const server = http.createServer((request, response) => {
    handle(request, response).catch(() => send(response, 500, { error: 'model-gateway-failed' }));
  });
  server.on('upgrade', (_request, socket) => socket.destroy());

  return {
    server,
    /** What the attempt spent. Read by the supervisor to build the durable record. */
    usage() {
      return { spend, calls: [...calls] };
    },
    async listen(socketPath) {
      const resolved = path.resolve(socketPath);
      await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
      await fs.promises.rm(resolved, { force: true });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(resolved, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      await fs.promises.chmod(resolved, 0o600);
      return resolved;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
