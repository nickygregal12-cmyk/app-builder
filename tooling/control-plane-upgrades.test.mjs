import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateProject, readJson } from './lib/generator.mjs';
import { compareManagedInventory, createRecipeInstallation, planRecipeUpgrade } from '../packages/control-plane/src/upgrades.js';
import { currentManagedHashes, planProjectRecipeUpgrades, recordRecipeInstallations } from './lib/recipe-upgrades.mjs';

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

test('newly generated projects can persist recipe installation hashes and later detect divergence', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-upgrade-inventory-'));
  const output = path.join(temp, 'project');
  try {
    const manifest = readJson('examples/b2b-generator-project-manifest.json');
    generateProject(manifest, output);
    const inventory = recordRecipeInstallations(output);
    assert.equal(inventory.unresolved.length, 0);
    assert.ok(inventory.installed.length > 0);
    assert.ok(fs.existsSync(path.join(output, '.app-builder/recipe-installations.json')));
    const withManagedFiles = inventory.installed.find((entry) => entry.managedFiles.length > 0);
    assert.ok(withManagedFiles, 'expected at least one recipe with managed files');
    assert.deepEqual(compareManagedInventory(withManagedFiles, currentManagedHashes(output, withManagedFiles)).modified, []);
    const managed = withManagedFiles.managedFiles[0].path;
    fs.appendFileSync(path.join(output, managed), '\n// project-specific change\n');
    assert.deepEqual(compareManagedInventory(withManagedFiles, currentManagedHashes(output, withManagedFiles)).modified, [managed]);
    const plan = planProjectRecipeUpgrades(output);
    assert.equal(plan.blocked, 0);
    assert.equal(plan.proposals.length, inventory.installed.length);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
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

test('recipe schema can declare explicit upgrade compatibility without requiring it for existing recipes', () => {
  const schema = JSON.parse(fs.readFileSync('schemas/recipe.schema.json', 'utf8'));
  assert.ok(schema.properties.upgrade);
  assert.ok(schema.properties.upgrade.properties.compatibleFrom);
  assert.equal(schema.required.includes('upgrade'), false);
});
