#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
let failed = false;

const required = [
  'docs/FACTORY_CONTROL_PLANE.md',
  'docs/AGENT_RUNTIME.md',
  'config/factory-status.json',
  'config/agent-policies.json',
  'config/factory-benchmarks.json',
  'schemas/control-task.schema.json',
  'schemas/build-event.schema.json',
  'schemas/change-set.schema.json',
  'schemas/checkpoint.schema.json',
  'schemas/context-item.schema.json',
  'schemas/agent-policy.schema.json',
  'schemas/non-functional-requirements.schema.json',
  'schemas/design-contract.schema.json',
  'schemas/recipe-installation.schema.json',
  'schemas/recipe-upgrade-proposal.schema.json',
  'packages/control-plane/package.json',
  'packages/control-plane/src/index.js',
  'packages/control-plane/src/upgrades.js',
  'tooling/lib/recipe-upgrades.mjs',
  'tooling/plan-recipe-upgrades.mjs',
  'tooling/control-plane.test.mjs',
  'tooling/control-plane-upgrades.test.mjs',
  'tooling/benchmark-acceptance.mjs',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing control-plane file: ${relative}`);
    failed = true;
  }
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

try {
  const status = readJson('config/factory-status.json');
  if (status.status !== 'active') {
    console.error('Factory status must identify an active delivery stage.');
    failed = true;
  }
  if (!(status.completedStages ?? []).includes('3.5A') || !(status.completedStages ?? []).includes('3.5B')) {
    console.error('Factory status must retain Phase 3.5A/3.5B as completed control-plane foundations.');
    failed = true;
  }
  for (const doc of ['README.md', 'docs/ROADMAP.md']) {
    const text = fs.readFileSync(path.join(root, doc), 'utf8');
    if (!text.includes(status.currentStage)) {
      console.error(`${doc} does not match machine-readable currentStage: ${status.currentStage}`);
      failed = true;
    }
  }

  const policies = readJson('config/agent-policies.json');
  const productionActions = ['deploy.production', 'database.production_write'];
  for (const [policyId, policy] of Object.entries(policies.policies ?? {})) {
    for (const action of productionActions) {
      if (policy.allow?.includes(action) && !policy.approvalRequired?.includes(action)) {
        console.error(`Policy ${policyId} grants ${action} without approval.`);
        failed = true;
      }
    }
    const overlap = (policy.allow ?? []).filter((action) => policy.deny?.includes(action));
    if (overlap.length) {
      console.error(`Policy ${policyId} both allows and denies: ${overlap.join(', ')}`);
      failed = true;
    }
  }

  const contextSchema = readJson('schemas/context-item.schema.json');
  const authority = contextSchema.properties?.instructionAuthority?.enum ?? [];
  if (!['none', 'user', 'factory'].every((value) => authority.includes(value))) {
    console.error('Context-item schema is missing the instruction-authority trust boundary.');
    failed = true;
  }

  const benchmarks = readJson('config/factory-benchmarks.json');
  const canonical = (benchmarks.cases ?? []).filter((entry) => entry.canonical === true);
  const presentTypes = new Set(canonical.map((entry) => entry.projectType));
  for (const type of benchmarks.requiredProjectTypes ?? []) {
    if (!presentTypes.has(type)) {
      console.error(`Benchmark registry has no canonical case for project type: ${type}`);
      failed = true;
    }
  }
  if ((benchmarks.requiredProjectTypes ?? []).length !== 6 || canonical.length !== 6 || canonical.some((entry) => entry.status !== 'ready')) {
    console.error('Benchmark registry must contain six ready canonical first-class project cases.');
    failed = true;
  }
  if (!benchmarks.profiles?.deterministicBuild) {
    console.error('Benchmark registry is missing deterministicBuild scoring weights.');
    failed = true;
  }

  const nfr = readJson('schemas/non-functional-requirements.schema.json');
  for (const key of ['accessibility', 'performance', 'security', 'privacy', 'compatibility', 'localisation', 'operations', 'compliance']) {
    if (!nfr.properties?.[key]) { console.error(`NFR contract is missing ${key}.`); failed = true; }
  }
  const design = readJson('schemas/design-contract.schema.json');
  for (const key of ['typography', 'hierarchy', 'responsive', 'motion', 'imagery', 'interaction']) {
    if (!design.properties?.[key]) { console.error(`Design contract is missing ${key}.`); failed = true; }
  }
  const recipeSchema = readJson('schemas/recipe.schema.json');
  if (!recipeSchema.properties?.upgrade?.properties?.compatibleFrom) {
    console.error('Recipe schema must support explicit upgrade compatibility metadata.');
    failed = true;
  }

  const pkg = readJson('packages/control-plane/package.json');
  if (pkg.name !== '@app-builder/control-plane' || pkg.dependencies) {
    console.error('Control-plane package must remain provider-neutral and dependency-free at this boundary.');
    failed = true;
  }
  if (pkg.exports?.['./upgrades'] !== './src/upgrades.js') {
    console.error('Control-plane package must expose the upgrade-planning helper.');
    failed = true;
  }

  const rootPackage = readJson('package.json');
  if (!String(rootPackage.scripts?.doctor ?? '').includes('control-plane-doctor.mjs')) {
    console.error('Root doctor must retain the control-plane invariant check.');
    failed = true;
  }
  for (const script of ['benchmark:acceptance', 'upgrade:plan']) {
    if (!rootPackage.scripts?.[script]) {
      console.error(`Root scripts must expose ${script}.`);
      failed = true;
    }
  }

  const createApp = fs.readFileSync(path.join(root, 'tooling/create-app.mjs'), 'utf8');
  const generateAcceptance = fs.readFileSync(path.join(root, 'tooling/generate-acceptance.mjs'), 'utf8');
  if (!createApp.includes('recordRecipeInstallations') || !generateAcceptance.includes('recordRecipeInstallations')) {
    console.error('Newly generated projects and canonical acceptance builds must record recipe installation hashes.');
    failed = true;
  }

  const generatedRuntimeSearchRoots = ['templates', 'recipes', 'adapters'];
  for (const base of generatedRuntimeSearchRoots) {
    const stack = [path.join(root, base)];
    while (stack.length) {
      const current = stack.pop();
      if (!fs.existsSync(current)) continue;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(?:json|js|mjs|ts|tsx|md)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (text.includes('@app-builder/control-plane')) {
            console.error(`Generated-app runtime coupling detected: ${path.relative(root, full)}`);
            failed = true;
          }
        }
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}

if (failed) process.exit(1);
console.log('Control-plane doctor: durable state, permissions, trust, six-project benchmarks, upgrade inventories/NFR/design contracts and portability remain valid.');
