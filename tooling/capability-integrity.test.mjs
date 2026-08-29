import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { capabilityIntegrityProblems, deriveCapabilityIntegrity } from './lib/capability-integrity.mjs';

const modules = { alerts: { status: 'ready' }, auth: { status: 'ready' } };
const recipes = {
  auth: { module: 'auth', status: 'ready', requires: [] },
  alerts: { module: 'alerts', status: 'ready', requires: ['auth'] },
};
const audit = (overrides = {}) => deriveCapabilityIntegrity({
  requestedModules: ['auth', 'alerts'], modules, recipes,
  generatedModules: ['auth', 'alerts'], consumedModules: ['auth', 'alerts'],
  evidence: [{ module: 'alerts', producer: 'browser-journey', status: 'passed' }],
  ...overrides,
});

test('derives requested through proved without a duplicate lifecycle table', () => {
  const alerts = audit().find((entry) => entry.module === 'alerts');
  assert.deepEqual(alerts, {
    module: 'alerts', requested: true, registered: true, resolvable: true,
    generated: true, consumed: true, proved: true, missingDependencies: [], problems: [],
  });
});

test('distinguishes a requested capability with no registration or implementation', () => {
  const ledger = audit({ requestedModules: ['unknown'], generatedModules: [], consumedModules: [], evidence: [] });
  assert.deepEqual(ledger[0].problems, ['unregistered']);
});

test('detects a registered module that cannot resolve', () => {
  const ledger = audit({ requestedModules: ['alerts'], recipes: {}, generatedModules: [], consumedModules: [], evidence: [] });
  assert.deepEqual(ledger[0].problems, ['unresolvable']);
});

test('fails closed on incompatible dependency closure', () => {
  const alerts = audit({ generatedModules: ['alerts'] }).find((entry) => entry.module === 'alerts');
  assert.equal(alerts.resolvable, false);
  assert.deepEqual(alerts.missingDependencies, ['auth']);
  assert.ok(alerts.problems.includes('incompatible-dependency-closure'));
});

test('detects generated output with no behavioural consumer', () => {
  const problems = capabilityIntegrityProblems(audit({ consumedModules: ['auth'] }));
  assert.ok(problems.some((item) => item.module === 'alerts' && item.problem === 'generated-unconsumed'));
});

test('a proof claim requires passed evidence for the same capability', () => {
  const alerts = audit({ claimedProvenModules: ['alerts'], evidence: [] }).find((entry) => entry.module === 'alerts');
  assert.equal(alerts.proved, false);
  assert.ok(alerts.problems.includes('proof-claim-without-evidence'));
});

test('canonical B2B registries expose the existing generated admin consumer gap', () => {
  const moduleRegistry = JSON.parse(fs.readFileSync('config/modules.json', 'utf8')).modules;
  const recipeRegistry = JSON.parse(fs.readFileSync('config/recipes.json', 'utf8')).recipes;
  const requestedModules = JSON.parse(fs.readFileSync('config/project-types.json', 'utf8'))
    .projectTypes['b2b-saas'].defaultModules;
  const loadedRecipes = {};
  const consumedModules = [];
  for (const [id, registryEntry] of Object.entries(recipeRegistry)) {
    const recipe = JSON.parse(fs.readFileSync(`${registryEntry.path}/recipe.json`, 'utf8'));
    loadedRecipes[id] = recipe;
    const source = fs.readFileSync(`${registryEntry.path}/files/${recipe.entry}`, 'utf8');
    // These are the hooks generated recipes.tsx actually invokes. Merely
    // exporting a helper does not make generated application behaviour use it.
    if (/export (?:function|const) setup\b|export (?:const|\{[^}]*\b)Provider\b|export (?:const|\{[^}]*\b)Gate\b|export const sections\b/s.test(source)) {
      consumedModules.push(recipe.module);
    }
  }
  const ledger = deriveCapabilityIntegrity({
    requestedModules, modules: moduleRegistry, recipes: loadedRecipes,
    generatedModules: requestedModules, consumedModules,
  });
  const admin = ledger.find((entry) => entry.module === 'admin');
  assert.deepEqual(admin.problems, ['generated-unconsumed']);
  for (const module of ['auth', 'profiles', 'organisations', 'records', 'uploads', 'notifications', 'analytics', 'observability']) {
    assert.equal(ledger.find((entry) => entry.module === module).consumed, true, `${module} must reach generated runtime behaviour`);
  }
});
