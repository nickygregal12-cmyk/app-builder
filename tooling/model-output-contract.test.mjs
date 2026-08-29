import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  approvedModelOutputContracts,
  resolveModelOutputContract,
  supportsStructuredOutputProfile,
  toStrictProviderSchema,
} from './lib/model-output-contract.mjs';
import {
  buildOpenAiCompatiblePayload,
  createOpenAiCompatibleAdapter,
} from './lib/model-provider-openai-compatible.mjs';

const REQUEST = Object.freeze({
  requestId: 'model-request-proof',
  roleId: 'code-reviewer',
  projectId: 'model-canary',
  taskId: 'model-canary-task',
  instruction: 'Review the material against the named criteria.',
  artifactContract: 'schemas/review-verdict.schema.json',
  input: 'synthetic source only',
  maxOutputTokens: 512,
  model: 'openai/gpt-oss-120b',
});

test('only repository-approved model output contracts can be resolved', () => {
  assert.deepEqual(approvedModelOutputContracts(), ['schemas/review-verdict.schema.json']);
  assert.throws(
    () => resolveModelOutputContract('../../etc/passwd'),
    /not approved for provider-side structured output/,
  );
  assert.throws(
    () => resolveModelOutputContract('schemas/other.schema.json'),
    /not approved for provider-side structured output/,
  );
});

test('the provider projection is strict while canonical-only refinements remain local', () => {
  const contract = resolveModelOutputContract(REQUEST.artifactContract, {
    trustedBindings: {
      schemaVersion: 1,
      id: 'model-request-proof-verdict',
      projectId: 'model-canary',
      taskId: 'model-canary-task',
      reviewerRole: 'code-reviewer',
    },
  });
  const schema = contract.schema;

  assert.equal(contract.strict, true);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.properties.schemaVersion.type, 'integer', 'a canonical const is given an explicit provider-side type');
  assert.deepEqual(schema.properties.schemaVersion.enum, [1]);
  assert.deepEqual(schema.properties.id.enum, ['model-request-proof-verdict']);
  assert.deepEqual(schema.properties.projectId.enum, ['model-canary']);
  assert.deepEqual(schema.properties.taskId.enum, ['model-canary-task']);
  assert.deepEqual(schema.properties.reviewerRole.enum, ['code-reviewer']);

  assert.deepEqual(schema.properties.taskId.type, ['string', 'null'], 'nullable union is preserved for strict provider mode');
  assert.equal(schema.properties.id.minLength, undefined, 'canonical minLength remains a local AJV constraint');
  assert.equal(schema.properties.authorRoles.minItems, undefined, 'canonical minItems remains a local AJV constraint');
  assert.equal(schema.properties.authorRoles.uniqueItems, undefined, 'canonical uniqueItems remains a local AJV constraint');
  assert.equal(schema.properties.score.minimum, undefined, 'canonical numeric minimum remains a local AJV constraint');
  assert.equal(schema.properties.score.maximum, undefined, 'canonical numeric maximum remains a local AJV constraint');

  const evidenceItem = schema.properties.evidence.items;
  assert.equal(evidenceItem.additionalProperties, false);
  assert.deepEqual([...evidenceItem.required].sort(), Object.keys(evidenceItem.properties).sort());
});

test('strict projection closes nested objects and requires all of their declared properties', () => {
  const projected = toStrictProviderSchema({
    type: 'object',
    properties: {
      nested: {
        type: 'object',
        properties: {
          value: { type: 'string', minLength: 4 },
          optional: { type: ['string', 'null'] },
        },
      },
    },
  });

  assert.deepEqual(projected.required, ['nested']);
  assert.equal(projected.additionalProperties, false);
  assert.deepEqual(projected.properties.nested.required.sort(), ['optional', 'value']);
  assert.equal(projected.properties.nested.additionalProperties, false);
  assert.equal(projected.properties.nested.properties.value.minLength, undefined);
  assert.deepEqual(projected.properties.nested.properties.optional.type, ['string', 'null']);
});

test('provider profiles cannot claim structured output without exact executable support', () => {
  const profiles = JSON.parse(fs.readFileSync('config/provider-profiles.json', 'utf8')).profiles;
  const claimed = profiles.filter((profile) => profile.structuredOutput === true);

  assert.deepEqual(claimed.map((profile) => `${profile.providerId}/${profile.modelId}`), [
    'anthropic/claude-haiku-4-5-20251001',
    'groq/openai/gpt-oss-120b',
  ]);
  for (const profile of profiles) {
    assert.equal(
      profile.structuredOutput === true,
      supportsStructuredOutputProfile(profile),
      `${profile.providerId}/${profile.modelId ?? 'un-pinned'} structuredOutput claim must match executable support`,
    );
  }
});

test('the OpenAI-compatible payload sends the actual strict JSON schema', () => {
  const payload = buildOpenAiCompatiblePayload(REQUEST, { model: REQUEST.model });

  assert.equal(payload.response_format.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.name, 'app_builder_review_verdict');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.equal(payload.response_format.json_schema.schema.additionalProperties, false);
  assert.deepEqual(
    payload.response_format.json_schema.schema.properties.reviewerRole.enum,
    ['code-reviewer'],
  );
  assert.match(payload.messages[0].content, /canonical local validation still runs/);
});

test('the exact Groq adapter advertises executable structured output while an unpinned OpenRouter adapter does not', () => {
  const groq = createOpenAiCompatibleAdapter({
    providerId: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: REQUEST.model,
    fetchImpl: async () => { throw new Error('not called'); },
  });
  const openrouter = createOpenAiCompatibleAdapter({
    providerId: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: null,
    fetchImpl: async () => { throw new Error('not called'); },
  });

  assert.equal(groq.capabilities.structuredOutput, true);
  assert.equal(openrouter.capabilities.structuredOutput, false);
});

test('the actual HTTP body contains structured output and no credential or unrelated repository material', async () => {
  const secret = 'gsk_PLANTEDSTRUCTUREDOUTPUTSECRET012345';
  let captured = null;
  const fetchImpl = async (_url, init) => {
    captured = { headers: init.headers, body: JSON.parse(init.body) };
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        model: REQUEST.model,
        choices: [{ message: { content: '{"verdict":"rework-required"}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 5 },
      }),
      text: async () => '',
    };
  };
  const adapter = createOpenAiCompatibleAdapter({
    providerId: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: REQUEST.model,
    fetchImpl,
  });

  await adapter.complete({ request: REQUEST, apiKey: secret });

  assert.equal(captured.body.response_format.type, 'json_schema');
  assert.equal(captured.body.response_format.json_schema.strict, true);
  const serialisedBody = JSON.stringify(captured.body);
  assert.ok(!serialisedBody.includes(secret), 'the provider credential belongs only in the transport header');
  assert.ok(!serialisedBody.includes('factory-status.json'));
  assert.ok(!serialisedBody.includes('AGENTS.md'));
});

test('an unapproved contract is refused before fetch can make a network request', async () => {
  let called = false;
  const adapter = createOpenAiCompatibleAdapter({
    providerId: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    model: REQUEST.model,
    fetchImpl: async () => { called = true; throw new Error('must not run'); },
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
