#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
let failed = false;

const required = [
  'docs/FACTORY_CONTROL_PLANE.md',
  'docs/AGENT_RUNTIME.md',
  'docs/AGENT_SPECIALIST_ARCHITECTURE.md',
  'docs/AGENT_HANDOFFS_AND_CONVERGENCE.md',
  'docs/DESIGN_INTELLIGENCE.md',
  'docs/ENGINEERING_QUALITY_PROGRAMME.md',
  'config/factory-status.json',
  'config/agent-policies.json',
  'config/factory-benchmarks.json',
  'config/agent-roles.json',
  'config/agent-pipelines.json',
  'config/skill-registry.json',
  'config/external-sources.json',
  'config/agent-routing-benchmarks.json',
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
  'schemas/agent-role.schema.json',
  'schemas/review-verdict.schema.json',
  'schemas/stage-handoff.schema.json',
  'schemas/convergence-report.schema.json',
  'schemas/skill-registration.schema.json',
  'schemas/external-source.schema.json',
  'schemas/routing-benchmark-case.schema.json',
  'packages/control-plane/package.json',
  'packages/control-plane/src/index.js',
  'packages/control-plane/src/upgrades.js',
  'packages/control-plane/src/roles.js',
  'packages/control-plane/src/routing.js',
  'tooling/lib/recipe-upgrades.mjs',
  'tooling/plan-recipe-upgrades.mjs',
  'tooling/control-plane.test.mjs',
  'tooling/control-plane-upgrades.test.mjs',
  'tooling/change-set-scope.property.test.mjs',
  'tooling/agent-architecture.test.mjs',
  'tooling/agent-routing-benchmark.test.mjs',
  'tooling/agent-route.mjs',
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
  for (const stage of ['3.5A', '3.5B', '3.8H', '3.8I']) {
    if (!(status.completedStages ?? []).includes(stage)) {
      console.error(`Factory status must retain Phase ${stage} as a completed foundation.`);
      failed = true;
    }
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
  if (pkg.exports?.['./roles'] !== './src/roles.js') {
    console.error('Control-plane package must expose the specialist-role primitives.');
    failed = true;
  }
  if (pkg.exports?.['./routing'] !== './src/routing.js') {
    console.error('Control-plane package must expose the deterministic routing primitives.');
    failed = true;
  }

  // Specialist-agent architecture invariants. The detailed cross-reference checks live in
  // tooling/agent-architecture.test.mjs; the doctor guards the boundaries that must never drift.
  const roleRegistry = readJson('config/agent-roles.json');
  const pipelineRegistry = readJson('config/agent-pipelines.json');
  const skillRegistry = readJson('config/skill-registry.json');
  const sourceRegistry = readJson('config/external-sources.json');
  const routes = readJson('config/agent-routing.json').routes ?? {};
  const roles = roleRegistry.roles ?? {};
  const pipelines = pipelineRegistry.pipelines ?? {};

  for (const [roleId, role] of Object.entries(roles)) {
    if (!policies.policies?.[role.policyId]) {
      console.error(`Role ${roleId} references unknown capability policy ${role.policyId}.`);
      failed = true;
    }
    const route = routes[role.routeId];
    if (!route) {
      console.error(`Role ${roleId} references unknown context route ${role.routeId}.`);
      failed = true;
    } else if (role.contextCeilingTokens > route.maxTokens) {
      console.error(`Role ${roleId} exceeds the ${role.routeId} context ceiling.`);
      failed = true;
    }
    for (const skill of role.skills ?? []) {
      if (!skillRegistry.skills?.[skill]) {
        console.error(`Role ${roleId} requests unregistered skill ${skill}.`);
        failed = true;
      }
    }
    if (role.kind === 'reviewer' && (role.mutationScopes ?? []).length > 0) {
      console.error(`Reviewer role ${roleId} must not own repository mutation scope.`);
      failed = true;
    }
    if (role.kind === 'creator' && (role.reviewedBy ?? []).length === 0) {
      console.error(`Creator role ${roleId} must declare an independent reviewer.`);
      failed = true;
    }
    if ((role.reviewedBy ?? []).includes(roleId)) {
      console.error(`Role ${roleId} cannot review itself.`);
      failed = true;
    }
  }

  const projectTypes = readJson('config/project-types.json').projectTypes ?? {};
  for (const projectType of Object.keys(projectTypes)) {
    if (!pipelines[projectType]) {
      console.error(`Project type ${projectType} has no specialist pipeline.`);
      failed = true;
    }
  }

  for (const [pipelineId, pipeline] of Object.entries(pipelines)) {
    for (const stage of pipeline.stages ?? []) {
      const role = roles[stage.role];
      if (!role) {
        console.error(`${pipelineId}/${stage.id} references unknown role ${stage.role}.`);
        failed = true;
        continue;
      }
      if (role.kind === 'creator' && (!stage.reviewer || stage.reviewer === stage.role)) {
        console.error(`${pipelineId}/${stage.id} would let ${stage.role} approve its own work.`);
        failed = true;
      }
      if (role.kind === 'reviewer' && stage.reviewer) {
        console.error(`${pipelineId}/${stage.id} is a reviewer stage and must not carry its own reviewer.`);
        failed = true;
      }
    }
    for (const gateId of pipeline.requiredGates ?? []) {
      const gate = pipelineRegistry.gates?.[gateId];
      if (!gate) {
        console.error(`${pipelineId} requires unregistered gate ${gateId}.`);
        failed = true;
        continue;
      }
      const reworkRole = pipeline.reworkOverrides?.[gateId] ?? gate.defaultReworkRole;
      if (roles[reworkRole]?.kind !== 'creator') {
        console.error(`${pipelineId} gate ${gateId} must route rework to a creator role.`);
        failed = true;
      }
    }
  }

  for (const [sourceId, source] of Object.entries(sourceRegistry.sources ?? {})) {
    if (source.instructionAuthority !== 'none') {
      console.error(`External source ${sourceId} must remain data, never instruction authority.`);
      failed = true;
    }
    if (source.adoption === 'adopted-pinned') {
      if (!source.pinnedRef || source.securityReview !== 'passed' || !source.license) {
        console.error(`Adopted source ${sourceId} must be pinned, licensed and security reviewed.`);
        failed = true;
      }
    } else if ((source.allowedRoles ?? []).length > 0) {
      console.error(`Source ${sourceId} grants role access without being adopted and pinned.`);
      failed = true;
    }
  }

  for (const [skillId, skill] of Object.entries(skillRegistry.skills ?? {})) {
    if (skill.lifecycle !== 'proven') continue;
    for (const sourceId of skill.priorArt ?? []) {
      const source = sourceRegistry.sources?.[sourceId];
      if (source?.adoption !== 'adopted-pinned' || source?.securityReview !== 'passed') {
        console.error(`Proven skill ${skillId} depends on unpinned or unreviewed source ${sourceId}.`);
        failed = true;
      }
    }
  }

  // Routing discipline. Installed is not loaded, and a broad prompt must not buy expensive
  // specialists. The full positive/negative case set runs in tooling/agent-routing-benchmark.test.mjs.
  const routing = readJson('config/agent-routing.json');
  const loadBudget = routing.skillLoadBudget ?? {};
  for (const [roleId, role] of Object.entries(roles)) {
    const loaded = {};
    for (const skill of role.skills ?? []) {
      const loadClass = skillRegistry.skills?.[skill]?.loadClass;
      if (!loadClass || !Object.hasOwn(loadBudget, loadClass)) {
        console.error(`Skill ${skill} requested by role ${roleId} has no budgeted load class.`);
        failed = true;
        continue;
      }
      loaded[loadClass] = (loaded[loadClass] ?? 0) + 1;
    }
    for (const [loadClass, count] of Object.entries(loaded)) {
      if (count > loadBudget[loadClass]) {
        console.error(`Role ${roleId} loads ${count} competing ${loadClass} skills; the budget allows ${loadBudget[loadClass]}.`);
        failed = true;
      }
    }
  }
  for (const route of routing.taskRoutes ?? []) {
    if (!routing.routes?.[route.contextRoute]) {
      console.error(`Task route ${route.id} names unknown context route ${route.contextRoute}.`);
      failed = true;
    }
    for (const roleId of route.roles ?? []) {
      if (!roles[roleId]) {
        console.error(`Task route ${route.id} names unknown role ${roleId}.`);
        failed = true;
      }
    }
  }
  const benchmarkCases = readJson('config/agent-routing-benchmarks.json').cases ?? [];
  if (!benchmarkCases.some((benchmarkCase) => benchmarkCase.expectUnclassified)) {
    console.error('Routing benchmarks must hold at least one prompt that stays unclassified rather than guessing.');
    failed = true;
  }
  if (!benchmarkCases.some((benchmarkCase) => (benchmarkCase.forbiddenRoles ?? []).length > 0)) {
    console.error('Routing benchmarks must hold negative triggers, not only positive ones.');
    failed = true;
  }
  if (!String(readJson('package.json').scripts?.['agent:bench'] ?? '').includes('agent-route.mjs')) {
    console.error('Root package must expose the deterministic routing benchmark as agent:bench.');
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
console.log('Control-plane doctor: durable state, permissions, trust, specialist roles/pipelines/gates, reviewer independence, skill and external-source governance, six-project benchmarks, upgrade inventories/NFR/design contracts and portability remain valid.');
