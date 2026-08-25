import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CONTRACT_FAMILIES, assertContract, contractSchema, validateContract } from '@app-builder/contracts';
import { ASSET_STATUSES, RIGHTS_STATUSES, SOURCE_CHANNELS, SOURCE_ROLES } from '../packages/content-intelligence/src/governance.js';
import { readContractRegistry, undeclaredSchemas } from './lib/contract-families.mjs';
import { readJson } from './lib/manifest.mjs';

test('every schema is either a generated contract family or an explicitly deferred one', () => {
  const coverage = undeclaredSchemas(readContractRegistry());
  assert.deepEqual(coverage.undeclared, []);
  assert.deepEqual(coverage.missing, []);
});

test('declared families expose a compiled Ajv validator and a readable schema', () => {
  assert.ok(CONTRACT_FAMILIES.length >= 9);
  for (const family of CONTRACT_FAMILIES) {
    assert.equal(typeof family.boundary, 'string');
    assert.ok(family.boundary.length > 0, `${family.id} must record the boundary it validates`);
    assert.equal(contractSchema(family.id).title.length > 0, true, `${family.id} must resolve its schema`);
    assert.ok(validateContract(family.id, undefined).length > 0, `${family.id} must reject a missing document`);
  }
});

test('the example manifest validates through the shared contract surface', () => {
  assert.deepEqual(validateContract('project-manifest', readJson('examples/project-manifest.example.json')), []);
});

test('unknown contract families fail closed rather than validating silently', () => {
  assert.throws(() => validateContract('not-a-family', {}), /Unknown contract family/);
  assert.throws(() => contractSchema('not-a-family'), /Unknown contract family/);
});

test('assertContract reports every structural problem at once', () => {
  assert.throws(() => assertContract('change-set', { schemaVersion: 1 }), /Invalid change-set: .*required/);
});

test('content-intelligence governance constants stay derived from the schema enums', () => {
  const pack = contractSchema('knowledge-pack');
  const source = pack.properties.sources.items.properties;
  assert.deepEqual([...RIGHTS_STATUSES], source.rightsStatus.enum);
  assert.deepEqual([...ASSET_STATUSES], source.assetStatus.enum);
  assert.deepEqual([...SOURCE_ROLES], source.sourceRole.enum);
  assert.deepEqual([...SOURCE_CHANNELS], source.sourceChannel.enum);
});

test('generated contract types stay in step with the schemas', () => {
  const output = execFileSync(process.execPath, ['tooling/generate-contracts.mjs', '--check'], { encoding: 'utf8' });
  assert.match(output, /Contract drift check passed/);
  for (const family of CONTRACT_FAMILIES) {
    const declarations = fs.readFileSync(`packages/contracts/generated/${family.id}.d.ts`, 'utf8');
    assert.match(declarations, new RegExp(`\\b(?:interface|type) ${family.typeName}\\b`));
    assert.match(declarations, /GENERATED FILE — DO NOT EDIT/);
  }
});
