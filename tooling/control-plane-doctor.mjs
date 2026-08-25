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
  'packages/control-plane/package.json',
  'packages/control-plane/src/index.js',
  'tooling/control-plane.test.mjs',
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
  if (status.currentPhase !== '3.5' || status.status !== 'active') {
    console.error('Factory status must identify Phase 3.5 as active while the control-plane foundation is being built.');
    failed = true;
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
  const presentTypes = new Set((benchmarks.cases ?? []).map((entry) => entry.projectType));
  for (const type of benchmarks.requiredProjectTypes ?? []) {
    if (!presentTypes.has(type)) {
      console.error(`Benchmark registry has no case for project type: ${type}`);
      failed = true;
    }
  }
  if ((benchmarks.requiredProjectTypes ?? []).length !== 6) {
    console.error('Benchmark registry must cover the six first-class project types.');
    failed = true;
  }

  const pkg = readJson('packages/control-plane/package.json');
  if (pkg.name !== '@app-builder/control-plane' || pkg.dependencies) {
    console.error('Control-plane package must remain a provider-neutral dependency-free factory package in Phase 3.5A.');
    failed = true;
  }

  const rootPackage = readJson('package.json');
  if (!String(rootPackage.scripts?.doctor ?? '').includes('control-plane-doctor.mjs')) {
    console.error('Root doctor must run the Phase 3.5 control-plane doctor.');
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
console.log('Phase 3.5 control-plane doctor: durable-state contracts, permissions, trust boundary, benchmark coverage and portability are valid.');
