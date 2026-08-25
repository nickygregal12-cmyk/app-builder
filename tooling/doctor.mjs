#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'AGENTS.md', 'docs/ARCHITECTURE.md', 'docs/PRODUCT.md', 'docs/CREDIT-EFFICIENCY.md', 'docs/ROADMAP.md', 'docs/MASTER_PLAN.md',
  'config/modules.json', 'config/project-types.json', 'config/agent-routing.json', 'config/templates.json', 'config/recipes.json', 'config/adapters.json', 'config/layout-patterns.json', 'config/scenarios.json',
  'schemas/project-manifest.schema.json', 'schemas/build-contract.schema.json', 'schemas/company-profile.schema.json', 'schemas/intake-session.schema.json',
  'schemas/source-reference.schema.json', 'schemas/intake-feedback.schema.json', 'schemas/ambiguity-followup.schema.json', 'schemas/template.schema.json', 'schemas/recipe.schema.json', 'schemas/adapter.schema.json',
  'questionnaires/v1/base.json', 'tooling/create-app.mjs', 'tooling/recipe.mjs', 'tooling/generate-acceptance.mjs', 'tooling/supabase-security.test.mjs', 'tooling/phase2-complete.test.mjs',
  'templates/react-vite-neutral/template.json', 'templates/react-vite-neutral/files/src/design/tokens.css', 'templates/react-vite-neutral/files/src/scenarios/index.ts',
  'adapters/supabase/adapter.json', 'adapters/netlify/adapter.json',
  'recipes/seo/recipe.json', 'recipes/feature-flags/recipe.json', 'recipes/auth/recipe.json', 'recipes/profiles/recipe.json', 'recipes/organisations/recipe.json', 'recipes/admin/recipe.json',
  'recipes/uploads/recipe.json', 'recipes/analytics/recipe.json', 'recipes/observability/recipe.json', 'recipes/lead-generation/recipe.json',
  'examples/generator-project-manifest.json', 'examples/b2b-generator-project-manifest.json',
  'apps/console/package.json', 'playwright.config.ts', 'tests/e2e/intake.spec.ts',
];
let failed = false;

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) { console.error(`Missing required foundation file: ${relative}`); failed = true; }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const jsonFiles = [
  ...walk(path.join(root, 'config')), ...walk(path.join(root, 'schemas')), ...walk(path.join(root, 'questionnaires')),
  ...walk(path.join(root, 'templates')), ...walk(path.join(root, 'recipes')), ...walk(path.join(root, 'adapters')),
].filter((file) => file.endsWith('.json'));
for (const file of new Set(jsonFiles)) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { console.error(`Invalid JSON: ${path.relative(root, file)}`); failed = true; }
}

try {
  const modules = JSON.parse(fs.readFileSync(path.join(root, 'config/modules.json'), 'utf8')).modules ?? {};
  const projectTypes = JSON.parse(fs.readFileSync(path.join(root, 'config/project-types.json'), 'utf8')).projectTypes ?? {};
  const templates = JSON.parse(fs.readFileSync(path.join(root, 'config/templates.json'), 'utf8'));
  const recipes = JSON.parse(fs.readFileSync(path.join(root, 'config/recipes.json'), 'utf8'));
  const adapters = JSON.parse(fs.readFileSync(path.join(root, 'config/adapters.json'), 'utf8'));
  const layouts = JSON.parse(fs.readFileSync(path.join(root, 'config/layout-patterns.json'), 'utf8'));

  for (const [projectType, config] of Object.entries(projectTypes)) {
    const questionnaire = path.join(root, 'questionnaires/v1', `${config.questionnaire}.json`);
    if (!fs.existsSync(questionnaire)) { console.error(`Project type ${projectType} references missing questionnaire.`); failed = true; }
    for (const moduleName of config.defaultModules ?? []) {
      if (modules[moduleName]?.status !== 'ready') { console.error(`Project type ${projectType} defaults to non-ready module ${moduleName}.`); failed = true; }
    }
    const layoutId = layouts.projectTypeDefaults?.[projectType];
    if (!layouts.patterns?.[layoutId]) { console.error(`Project type ${projectType} has no valid layout pattern.`); failed = true; }
    const templateId = templates.projectTypeDefaults?.[projectType];
    const entry = templates.templates?.[templateId];
    if (!entry || entry.status !== 'ready') { console.error(`Project type ${projectType} has no ready default template.`); failed = true; continue; }
    const definition = JSON.parse(fs.readFileSync(path.join(root, entry.path, 'template.json'), 'utf8'));
    if (definition.id !== templateId || definition.version !== entry.version || !definition.projectTypes?.includes(projectType)) {
      console.error(`Template registry mismatch for ${templateId} / ${projectType}.`); failed = true;
    }
  }

  for (const [adapterId, entry] of Object.entries(adapters.adapters ?? {})) {
    const file = path.join(root, entry.path, 'adapter.json');
    if (!fs.existsSync(file)) { console.error(`Adapter ${adapterId} is missing adapter.json.`); failed = true; continue; }
    const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (definition.id !== adapterId || definition.version !== entry.version || definition.kind !== entry.kind || definition.status !== entry.status) {
      console.error(`Adapter registry mismatch for ${adapterId}.`); failed = true;
    }
    for (const relative of definition.files ?? []) {
      if (!fs.existsSync(path.join(root, entry.path, 'files', relative))) { console.error(`Adapter ${adapterId} declares missing file: ${relative}`); failed = true; }
    }
  }

  for (const [recipeId, entry] of Object.entries(recipes.recipes ?? {})) {
    const file = path.join(root, entry.path, 'recipe.json');
    if (!fs.existsSync(file)) { console.error(`Recipe ${recipeId} is missing recipe.json.`); failed = true; continue; }
    const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (definition.id !== recipeId || definition.version !== entry.version || definition.module !== entry.module || definition.status !== entry.status) {
      console.error(`Recipe registry mismatch for ${recipeId}.`); failed = true;
    }
    if (!modules[definition.module]) { console.error(`Recipe ${recipeId} references unknown module ${definition.module}.`); failed = true; }
    if (definition.status === 'ready' && modules[definition.module]?.status !== 'ready') { console.error(`Ready recipe ${recipeId} has a non-ready module.`); failed = true; }
    for (const dependency of definition.requires ?? []) {
      if (recipes.recipes?.[dependency]?.status !== 'ready') { console.error(`Recipe ${recipeId} requires unavailable recipe ${dependency}.`); failed = true; }
    }
    for (const adapterId of definition.requiresAdapters ?? []) {
      if (adapters.adapters?.[adapterId]?.status !== 'ready') { console.error(`Recipe ${recipeId} requires unavailable adapter ${adapterId}.`); failed = true; }
    }
    for (const relative of definition.files ?? []) {
      if (!fs.existsSync(path.join(root, entry.path, 'files', relative))) { console.error(`Recipe ${recipeId} declares missing managed file: ${relative}`); failed = true; }
    }
    for (const relative of definition.database?.fragments ?? []) {
      if (!fs.existsSync(path.join(root, entry.path, relative))) { console.error(`Recipe ${recipeId} declares missing database fragment: ${relative}`); failed = true; }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}

const scanRoots = ['apps', 'packages', 'config', 'schemas', 'questionnaires', 'tooling', 'templates', 'recipes', 'adapters', 'tests'];
const banned = [/euro[- ]?2028/i, /football predictor/i, /last man standing/i, /golden boot/i, /joker scoring/i];
for (const base of scanRoots) {
  for (const file of walk(path.join(root, base))) {
    if (path.relative(root, file) === 'tooling/doctor.mjs') continue;
    if (!/\.(?:md|json|mjs|js|ts|tsx|css|html|sql|toml)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const hit = banned.find((pattern) => pattern.test(text));
    if (hit) { console.error(`Predictor contamination guard failed: ${path.relative(root, file)} matches ${hit}`); failed = true; }
  }
}

if (failed) process.exit(1);
console.log('App Builder doctor: intake, templates, adapters, ready defaults, layouts, scenarios, recipes, database fragments, browser acceptance and contamination guard are valid.');
