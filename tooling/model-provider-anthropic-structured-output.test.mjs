import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildAnthropicPayload,
  createAnthropicModelAdapter,
} from './lib/model-provider-anthropic.mjs';
import { supportsStructuredOutputProfile } from './lib/model-output-contract.mjs';

const MODEL = 'claude-haiku-4-5-20251001';
const REQUEST = Object.freeze({
  requestId: 'anthropic-structured-proof',
  roleId: 'code-reviewer',
  projectId: 'model-canary',
  taskId: 'model-canary-task',
  instruction: 'Review the material against the named criteria.',
  artifactContract: 'schemas/review-verdict.schema.json',
  input: 'synthetic source only',
  maxOutputTokens: 512,
  model: MODEL,
});

test('the pinned Anthropic profile claims structured output only because the adapter supports the exact tuple', () => {
  const profile = JSON.parse(fs.readFileSync('config/provider-profiles.json', 'utf8')).profiles
    .find((entry) => entry.providerId === 'anthropic');

  assert.equal(profile.structuredOutput, true);
  assert.equal(supportsStructuredOutputProfile(profile), true);
  assert.equal(
    supportsStructuredOutputProfile({ ...profile, modelId: 'claude-unreviewed-model' }),
    false,
    'an unreviewed Claude model must not inherit structured-output authority',
  );
});

test('the Anthropic payload sends native output_config JSON Schema and leaves canonical refinements local', () => {
  const payload = buildAnthropicPayload(REQUEST, { model: MODEL });
  const schema = payload.output_config.format.schema;

  assert.equal(payload.output_config.format.type, 'json_schema');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.schemaVersion.enum, [1]);
  assert.deepEqual(schema.properties.id.enum, ['anthropic-structured-proof-verdict']);
  assert.deepEqual(schema.properties.projectId.enum, ['model-canary']);
  assert.deepEqual(schema.properties.taskId.enum, ['model-canary-task']);
  assert.deepEqual(schema.properties.reviewerRole.enum, ['code-reviewer']);
  assert.equal(schema.properties.id.minLength, undefined);
  assert.equal(schema.properties.score.minimum, undefined);
  assert.equal(schema.properties.score.maximum, undefined);
  assert.match(payload.system, /canonical local validation still runs/);
});

test('the exact Anthropic adapter advertises structured output and sends no credential in its body', async () => {
  // Assembled at run time, like every planted credential in tooling/secret-scan.test.mjs.
  // The point of this test is that a credential shaped like a live Anthropic key never
  // reaches the request body, so the shape has to be realistic — and a realistic shape
  // written as one contiguous literal is a committed credential, which the repository's own
  // scanner refuses. It exists in memory for the length of this test and nowhere else.
  const secret = ['sk-', 'ant-', 'api03-', 'PLANTEDSTRUCTUREDOUTPUT', 'X'.repeat(24)].join('');
  let captured = null;
  const fetchImpl = async (_url, init) => {
    captured = { headers: init.headers, body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: MODEL,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"verdict":"rework-required"}' }],
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
      text: async () => '',
    };
  };
  const adapter = createAnthropicModelAdapter({
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiVersion: '2023-06-01',
    model: MODEL,
    fetchImpl,
  });

  assert.equal(adapter.capabilities.structuredOutput, true);
  await adapter.complete({ request: REQUEST, apiKey: secret });

  assert.equal(captured.body.output_config.format.type, 'json_schema');
  assert.equal(captured.headers['x-api-key'], secret);
  assert.ok(!JSON.stringify(captured.body).includes(secret));
});

test('an unapproved Anthropic output contract is refused before provider traffic', async () => {
  let called = false;
  const adapter = createAnthropicModelAdapter({
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiVersion: '2023-06-01',
    model: MODEL,
    fetchImpl: async () => {
      called = true;
      throw new Error('must not run');
    },
  });

  await assert.rejects(
    () => adapter.complete({
      request: { ...REQUEST, artifactContract: '../../etc/passwd' },
      apiKey: 'test-key',
    }),
    /not approved for provider-side structured output/,
  );
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------
// What a provider cache would do to this adapter's accounting.
//
// No lane sends `cache_control` today, and this lane could not benefit if it
// did: its stable prefix is roughly 270 tokens and the pinned model will not
// cache a prefix below 4,096. These exist because the mapping has to be right
// before that changes, not after — with caching on, `input_tokens` is the
// uncached remainder, and an adapter that passes it through reports a shrinking
// prompt for a request nobody changed.
// ---------------------------------------------------------------------------

function adapterReturning(usage) {
  const adapter = createAnthropicModelAdapter({
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiVersion: '2023-06-01',
    model: MODEL,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: MODEL,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"verdict":"rework-required"}' }],
        usage,
      }),
      text: async () => '',
    }),
  });
  return adapter.complete({ request: REQUEST, apiKey: 'test-key' });
}

test('a response with no cache fields reports exactly what it did before', async () => {
  const result = await adapterReturning({ input_tokens: 2000, output_tokens: 100 });
  assert.equal(result.usage.inputTokens, 2000);
  assert.equal(result.usage.cacheReadInputTokens, 0);
  assert.equal(result.usage.cacheCreationInputTokens, 0);
});

test('a cached response still reports the whole prompt, with the parts beside it', async () => {
  const result = await adapterReturning({
    input_tokens: 200,
    output_tokens: 100,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 1800,
  });
  assert.equal(result.usage.inputTokens, 2000, 'the prompt did not shrink because a cache served most of it');
  assert.equal(result.usage.uncachedInputTokens, 200);
  assert.equal(result.usage.cacheReadInputTokens, 1800);
});

test('unusable cache counts are refused rather than treated as zero', async () => {
  await assert.rejects(
    () => adapterReturning({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: -1 }),
    /cache token counts/,
  );
});
