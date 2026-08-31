import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';

const root = process.cwd();

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

const registry = readJson('config/capability-providers.json');
const modules = readJson('config/modules.json');
const CAPABILITIES = registry.capabilities;
const PROVIDERS = registry.providers;

test('the registry validates against its schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson('schemas/capability-provider.schema.json'));
  assert.equal(validate(registry), true, JSON.stringify(validate.errors, null, 2));
});

test('a capability id matches its key, and does not collide with a generated-app module', () => {
  const moduleIds = new Set(Object.keys(modules.modules ?? modules));
  for (const [key, capability] of Object.entries(CAPABILITIES)) {
    assert.equal(capability.id, key, `capability ${key} disagrees with its own id`);
    // A factory-side execution capability and a generated-app feature are
    // different things. Sharing an id would make "is analytics ready?" an
    // ambiguous question with two registries answering it differently.
    assert.equal(moduleIds.has(key), false, `capability ${key} collides with a generated-app module of the same name`);
  }
});

test('no external provider is ready, and readiness cannot be reached by editing one flag', () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.hosting === 'in-repository') continue;
    assert.equal(provider.ready, false, `${id} claims readiness; nothing external has earned it`);
    assert.equal(provider.credentialRef, null, `${id} names a credential reference before it is adopted`);
    assert.notEqual(provider.adoption, 'adopted', `${id} is adopted without a won benchmark`);
  }
});

test('an external provider cannot reach adopted without winning a benchmark task', () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.adoption !== 'adopted') continue;
    assert.equal(provider.benchmarkStatus, 'benchmarked-won',
      `${id} is adopted but has not won a benchmark task; selection is per task, and a provider that ran nothing won nothing`);
  }
});

test('every provider names a capability that exists, and competes on a task', () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    assert.ok(CAPABILITIES[provider.capability], `${id} serves unknown capability ${provider.capability}`);
    assert.ok(provider.candidateFor.length > 0, `${id} is registered for no task class`);
  }
});

test('a fallback serves the same capability as the provider that names it', () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    for (const fallbackId of provider.fallback) {
      const fallback = PROVIDERS[fallbackId];
      assert.ok(fallback, `${id} falls back to unregistered ${fallbackId}`);
      assert.equal(fallback.capability, provider.capability,
        `${id} falls back to ${fallbackId}, which serves ${fallback.capability} rather than ${provider.capability}`);
      assert.notEqual(fallbackId, id, `${id} falls back to itself`);
    }
  }
});

test('a quality-critical capability names the deterministic route a provider has to beat', () => {
  for (const [id, capability] of Object.entries(CAPABILITIES)) {
    if (capability.criticality !== 'quality-critical') continue;
    assert.ok(capability.deterministicAlternativeFirst.length > 40,
      `${id} is quality-critical with no substantive deterministic alternative; principle 1 says the cheap route is shown insufficient first`);
    assert.ok(capability.benchmark.toLowerCase().includes('docs/'),
      `${id} is quality-critical and names no benchmark authority`);
  }
});

test('a capability with no benchmark has no providers registered against it', () => {
  // Registering candidates for a capability nobody has defined a measurement
  // for is provider shopping, which is the specific failure this file exists
  // to make visible rather than to enable.
  const unmeasured = Object.values(CAPABILITIES)
    .filter((capability) => /^none/i.test(capability.benchmark))
    .map((capability) => capability.id);
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.hosting === 'in-repository') continue;
    assert.equal(unmeasured.includes(provider.capability), false,
      `${id} is registered against ${provider.capability}, which has no benchmark defined`);
  }
});

test('a conditional candidate says what must be demonstrated before it competes', () => {
  for (const [id, provider] of Object.entries(PROVIDERS)) {
    if (provider.adoption !== 'conditional-candidate') continue;
    assert.match(provider.notes, /only if|conditional/i,
      `${id} is a conditional candidate without stating the condition`);
  }
});

test('every capability points at a prose authority that owns its reasoning', () => {
  for (const [id, capability] of Object.entries(CAPABILITIES)) {
    assert.match(capability.owningAuthority, /docs\/[A-Z_]+\.md/,
      `${id} owns its own reasoning; principle 23 says prose authorities explain why`);
    const [file] = capability.owningAuthority.match(/docs\/[A-Z_]+\.md/);
    assert.ok(fs.existsSync(path.join(root, file)), `${id} names missing authority ${file}`);
  }
});

test('the registry records no delivery status', () => {
  // config/factory-status.json is the only answer to what is done, active and
  // outstanding. A second file that could disagree with it is worse than no
  // file, so the words that would let it disagree are refused here.
  const text = JSON.stringify(registry);
  for (const word of ['currentPhase', 'currentStage', 'completedStages', 'activeWork']) {
    assert.equal(text.includes(word), false, `the registry uses ${word}, which belongs to config/factory-status.json`);
  }
});
