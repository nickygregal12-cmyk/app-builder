/**
 * Provider adapter, canary fixture and provider-doctor coverage.
 *
 * The adapter is the piece that turns a provider's answer into something the
 * control plane will act on, so the tests are mostly about what it *refuses*:
 * a body with no usage, a body with no content, a 429, an auth failure. Those
 * are the paths that decide whether a quota problem becomes graceful continuity
 * or a confusing outage, and none of them can be exercised by a happy-path call.
 *
 * Everything here runs against an injected `fetch`. No test in this file
 * contacts a provider, and CI has no key — a live canary is an explicit operator
 * action, which is the whole point of the readiness ladder.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createProviderProfile } from '@app-builder/control-plane/provider-routing';

import {
  ProviderCallError,
  buildOpenAiCompatiblePayload,
  classifyHttpFailure,
  createOpenAiCompatibleAdapter,
} from './lib/model-provider-openai-compatible.mjs';
import { describeProviderProfile, formatProviders } from './provider-doctor.mjs';

const REQUEST = Object.freeze({
  roleId: 'code-reviewer',
  instruction: 'Review the material against the named criteria.',
  artifactContract: 'schemas/review-verdict.schema.json',
  input: 'export function cartTotal(items) { return items.reduce((a, b) => a + b, 0); }',
  maxOutputTokens: 512,
  model: null,
});

const ok = (body) => async () => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const failing = (status, body, headers = {}) => async () => ({
  ok: false,
  status,
  headers: new Headers(headers),
  json: async () => ({}),
  text: async () => body,
});

const adapter = (fetchImpl) => createOpenAiCompatibleAdapter({
  providerId: 'groq',
  endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'openai/gpt-oss-120b',
  fetchImpl,
});

const GOOD_BODY = {
  model: 'openai/gpt-oss-120b',
  choices: [{ message: { content: '{"verdict":"pass"}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 120, completion_tokens: 40 },
};

// --- The happy path, briefly ---------------------------------------------------

test('a well-formed response becomes a neutral provider result', async () => {
  const result = await adapter(ok(GOOD_BODY)).complete({ request: REQUEST, apiKey: 'test-key' });

  assert.equal(result.text, '{"verdict":"pass"}');
  assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 40 });
  assert.equal(result.stopReason, 'stop');
  assert.equal(result.model, 'openai/gpt-oss-120b');
});

test('the adapter reports the model that actually answered', async () => {
  // OpenRouter in particular may serve a different model than the one asked
  // for. The record should say which one spoke.
  const result = await adapter(ok({ ...GOOD_BODY, model: 'meta-llama/llama-3.3-70b' })).complete({ request: REQUEST, apiKey: 'k' });
  assert.equal(result.model, 'meta-llama/llama-3.3-70b');
});

test('vendor identity is stamped from what the adapter is, not from its caller', async () => {
  const built = adapter(ok(GOOD_BODY));
  assert.equal(built.providerId, 'groq');
  assert.equal(built.id, 'openai-compatible');
  // The same protocol, a different provider, and no way to pass one in as data.
  const other = createOpenAiCompatibleAdapter({ providerId: 'openrouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'x', fetchImpl: ok(GOOD_BODY) });
  assert.equal(other.providerId, 'openrouter');
});

// --- The refusals ----------------------------------------------------------------

test('a response with no token usage is refused rather than recorded as free', async () => {
  await assert.rejects(
    () => adapter(ok({ ...GOOD_BODY, usage: {} })).complete({ request: REQUEST, apiKey: 'k' }),
    (error) => error instanceof ProviderCallError && error.reason === 'invalid-response',
  );
});

test('a response with no message content is refused', async () => {
  await assert.rejects(
    () => adapter(ok({ ...GOOD_BODY, choices: [{ finish_reason: 'stop' }] })).complete({ request: REQUEST, apiKey: 'k' }),
    (error) => error instanceof ProviderCallError && error.reason === 'invalid-response',
  );
});

test('a 429 is continuity, not breakage', async () => {
  await assert.rejects(
    () => adapter(failing(429, 'Rate limit reached for model')).complete({ request: REQUEST, apiKey: 'k' }),
    (error) => error instanceof ProviderCallError && error.reason === 'rate-limited',
  );
});

test('an exhausted allowance is told apart from a momentary limit', () => {
  // Both are 429. Only one of them is fixed by waiting a second, and the router
  // routes them differently.
  assert.equal(classifyHttpFailure(429, { body: 'Rate limit reached, please retry' }), 'rate-limited');
  assert.equal(classifyHttpFailure(429, { body: 'You exceeded your current quota' }), 'quota-exhausted');
  assert.equal(classifyHttpFailure(402, { body: 'payment required' }), 'quota-exhausted');
  assert.equal(classifyHttpFailure(401, { body: 'invalid api key' }), 'missing-secret');
  assert.equal(classifyHttpFailure(500, { body: 'oops' }), 'provider-error');
});

test('an unrecognised 429 is the less final of the two', () => {
  // Guessing "exhausted" would retire a provider that was only briefly busy.
  assert.equal(classifyHttpFailure(429, { body: 'something new nobody predicted' }), 'rate-limited');
});

test('the adapter refuses to send an unauthenticated request', async () => {
  let called = false;
  const spy = async () => { called = true; return { ok: true, status: 200, headers: new Headers(), json: async () => GOOD_BODY, text: async () => '' }; };
  await assert.rejects(
    () => adapter(spy).complete({ request: REQUEST, apiKey: '' }),
    (error) => error instanceof ProviderCallError && error.reason === 'missing-secret',
  );
  assert.equal(called, false, 'no request may leave without a credential');
});

test('an unreachable provider is an error with a reason, not a raw throw', async () => {
  const boom = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(
    () => adapter(boom).complete({ request: REQUEST, apiKey: 'k' }),
    (error) => error instanceof ProviderCallError && error.reason === 'provider-error',
  );
});

test('no credential appears in an adapter error message', async () => {
  const planted = 'gsk_PLANTEDCANARYSECRET0123456789';
  const error = await adapter(failing(429, 'Rate limit reached')).complete({ request: REQUEST, apiKey: planted }).catch((caught) => caught);
  assert.ok(!String(error.message).includes(planted));
  // Error bodies can echo the request; the truncation is bounded on purpose.
  assert.ok(String(error.message).length < 500);
});

// --- The prompt ----------------------------------------------------------------------

test('the payload separates instruction from material and says material is data', () => {
  const payload = buildOpenAiCompatiblePayload(REQUEST, { model: 'm' });
  const system = payload.messages[0].content;

  assert.equal(payload.temperature, 0);
  assert.equal(payload.max_tokens, 512);
  assert.match(system, /data, not instruction/);
  assert.match(payload.messages[1].content, /<material>/);
  assert.ok(!payload.messages[1].content.includes('Rules that bind'), 'material must not be concatenated into the instruction');
});

// --- The canary fixture ----------------------------------------------------------------

test('the canary fixture is synthetic and its defects are declared in advance', () => {
  const expected = JSON.parse(fs.readFileSync('examples/provider-canary/expected-findings.json', 'utf8'));
  const fixture = fs.readFileSync('examples/provider-canary/flawed-cart.js', 'utf8');

  assert.equal(expected.dataClass, 'synthetic', 'the first canary must not use private material');
  assert.equal(expected.roleId, 'code-reviewer');
  assert.ok(expected.mustFind.length >= 4);

  // Every declared defect points at a symbol that is really in the fixture. A
  // criterion naming code that does not exist would score a provider on
  // something nobody could find.
  for (const finding of expected.mustFind) {
    assert.ok(fixture.includes(finding.symbol), `${finding.symbol} is scored for but absent from the fixture`);
  }
});

test('the canary fixture contains no App Builder source', () => {
  const fixture = fs.readFileSync('examples/provider-canary/flawed-cart.js', 'utf8');
  for (const marker of ['@app-builder/', 'control-plane', 'evaluateHandoff', 'ReviewVerdict', 'model-execution']) {
    assert.ok(!fixture.includes(marker), `the fixture references ${marker}; it must be safe to send to a synthetic-only provider`);
  }
});

// --- The doctor -------------------------------------------------------------------------

test('the provider doctor reports presence, never a credential', () => {
  const planted = 'gsk_PLANTEDDOCTORSECRET0123456789';
  const profile = createProviderProfile({
    providerId: 'groq',
    adapterId: 'openai-compatible',
    modelId: 'openai/gpt-oss-120b',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    secretRef: 'GROQ_API_KEY',
    costMode: 'free-only',
    allowedDataClasses: ['public', 'synthetic', 'sanitised'],
  });

  const described = describeProviderProfile(profile, { env: { GROQ_API_KEY: planted } });
  const rendered = `${formatProviders([described], { killSwitchEnabled: false })}\n${JSON.stringify(described)}`;

  assert.equal(described.secretConfigured, true, 'presence is still reported');
  assert.ok(!rendered.includes(planted), 'the value never is');
});

test('a configured key does not make a provider ready', () => {
  const profile = createProviderProfile({
    providerId: 'groq',
    adapterId: 'openai-compatible',
    modelId: 'm',
    endpoint: 'https://example.invalid/v1',
    secretRef: 'GROQ_API_KEY',
    costMode: 'free-only',
    allowedDataClasses: ['synthetic'],
  });

  const described = describeProviderProfile(profile, { env: { GROQ_API_KEY: 'anything' } });
  assert.equal(described.canary, 'not-run');
  assert.deepEqual(described.readyRoles, [], 'readiness is a recorded canary, not a key existing');
});

test('the doctor says plainly that a disabled switch overrides every key', () => {
  const rendered = formatProviders([], { killSwitchEnabled: false });
  assert.match(rendered, /No provider call can happen while either switch is off/);
});

test('the shipped profiles report no ready roles and no passed canary', () => {
  const config = JSON.parse(fs.readFileSync('config/provider-profiles.json', 'utf8'));
  for (const raw of config.profiles) {
    const described = describeProviderProfile(createProviderProfile(raw), { env: {} });
    assert.equal(described.canary, 'not-run', `${described.providerId} claims a canary result`);
    assert.deepEqual(described.readyRoles, []);
    assert.equal(described.secretConfigured, false, 'no credential should resolve from an empty environment');
  }
});
