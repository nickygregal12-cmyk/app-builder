import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareManagedInventory, createRecipeInstallation, planRecipeUpgrade } from '../packages/control-plane/src/upgrades.js';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function installation() {
  return createRecipeInstallation({ recipeId: 'auth', version: '1.2.0', fileHashes: { 'src/auth.ts': hashA, 'src/login.tsx': hashB }, installedAtFactoryVersion: '0.1.0' });
}

test('recipe installation inventories are stable and detect user changes', () => {
  const record = installation();
  assert.deepEqual(record.managedFiles.map((item) => item.path), ['src/auth.ts', 'src/login.tsx']);
  assert.deepEqual(compareManagedInventory(record, { 'src/auth.ts': hashA, 'src/login.tsx': hashB }), {
    modified: [], missing: [], unchanged: ['src/auth.ts', 'src/login.tsx'],
  });
  assert.deepEqual(compareManagedInventory(record, { 'src/auth.ts': hashB }), {
    modified: ['src/auth.ts'], missing: ['src/login.tsx'], unchanged: [],
  });
});

test('recipe upgrades fail closed on modified files, majors and undeclared compatibility', () => {
  const record = installation();
  const clean = { 'src/auth.ts': hashA, 'src/login.tsx': hashB };
  assert.equal(planRecipeUpgrade({ installation: record, targetVersion: '1.2.0', currentHashes: clean }).status, 'no-op');
  assert.equal(planRecipeUpgrade({ installation: record, targetVersion: '1.3.0', currentHashes: { ...clean, 'src/auth.ts': hashB }, compatibleFrom: ['1.2.0'] }).status, 'review-required');
  assert.match(planRecipeUpgrade({ installation: record, targetVersion: '2.0.0', currentHashes: clean, compatibleFrom: ['1.2.0'] }).reason, /Major-version/);
  assert.match(planRecipeUpgrade({ installation: record, targetVersion: '1.3.0', currentHashes: clean }).reason, /not explicitly declared compatibility/);
  assert.equal(planRecipeUpgrade({ installation: record, targetVersion: '1.3.0', currentHashes: clean, compatibleFrom: ['1.2.0'] }).status, 'ready');
  assert.equal(planRecipeUpgrade({ installation: record, targetVersion: '1.1.0', currentHashes: clean }).status, 'blocked');
});

test('Phase 3.5B benchmark registry has six ready canonical project classes', () => {
  const config = JSON.parse(fs.readFileSync('config/factory-benchmarks.json', 'utf8'));
  const canonical = config.cases.filter((item) => item.canonical === true);
  assert.equal(canonical.length, 6);
  assert.deepEqual(new Set(canonical.map((item) => item.projectType)), new Set(config.requiredProjectTypes));
  assert.equal(canonical.every((item) => item.status === 'ready'), true);
  assert.ok(config.profiles?.deterministicBuild);
});

test('non-functional and design contracts exist before manifest v2 adoption', () => {
  const nfr = JSON.parse(fs.readFileSync('schemas/non-functional-requirements.schema.json', 'utf8'));
  const design = JSON.parse(fs.readFileSync('schemas/design-contract.schema.json', 'utf8'));
  for (const key of ['accessibility', 'performance', 'security', 'privacy', 'compatibility', 'localisation', 'operations', 'compliance']) {
    assert.ok(nfr.properties[key], key);
  }
  for (const key of ['typography', 'hierarchy', 'responsive', 'motion', 'imagery', 'interaction']) assert.ok(design.properties[key], key);
});
