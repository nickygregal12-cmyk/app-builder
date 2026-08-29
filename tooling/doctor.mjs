#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { loadPresentationManifest, undeclaredComponents } from './lib/presentation-registry.mjs';

const root = process.cwd();
const required = [
  'AGENTS.md', 'docs/ARCHITECTURE.md', 'docs/PRODUCT.md', 'docs/CREDIT-EFFICIENCY.md', 'docs/ROADMAP.md', 'docs/MASTER_PLAN.md',
  'config/modules.json', 'config/project-types.json', 'config/agent-routing.json', 'config/templates.json', 'config/renderers.json', 'config/recipes.json', 'config/adapters.json', 'config/layout-patterns.json', 'config/scenarios.json',
  'schemas/project-manifest.schema.json', 'schemas/build-contract.schema.json', 'schemas/company-profile.schema.json', 'schemas/intake-session.schema.json',
  'schemas/source-reference.schema.json', 'schemas/intake-feedback.schema.json', 'schemas/ambiguity-followup.schema.json', 'schemas/template.schema.json', 'schemas/recipe.schema.json', 'schemas/adapter.schema.json',
  'questionnaires/v1/base.json', 'tooling/create-app.mjs', 'tooling/recipe.mjs', 'tooling/generate-acceptance.mjs', 'tooling/supabase-security.test.mjs', 'tooling/phase2-complete.test.mjs',
  'templates/react-vite-neutral/template.json', 'templates/astro-static-content/template.json',
  'templates/shared/presentation/tokens.css', 'templates/shared/presentation/styles.css', 'templates/react-vite-neutral/files/src/scenarios/index.ts',
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
  const renderers = JSON.parse(fs.readFileSync(path.join(root, 'config/renderers.json'), 'utf8'));
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
    // Phase 4.2: a project type selects a renderer, and the renderer names the
    // template. Both hops are checked, because a project type whose renderer
    // names a template that does not support it would be a build that fails at
    // generation rather than a registry that says so here.
    const rendererId = renderers.projectTypeDefaults?.[projectType];
    const renderer = renderers.renderers?.[rendererId];
    if (!renderer) { console.error(`Project type ${projectType} selects renderer ${String(rendererId)}, which the renderer registry does not declare.`); failed = true; continue; }
    const templateId = renderer.template;
    const entry = templates.templates?.[templateId];
    if (!entry || entry.status !== 'ready') { console.error(`Renderer ${rendererId} (project type ${projectType}) names template ${String(templateId)}, which is not ready.`); failed = true; continue; }
    const definition = JSON.parse(fs.readFileSync(path.join(root, entry.path, 'template.json'), 'utf8'));
    if (definition.id !== templateId || definition.version !== entry.version || !definition.projectTypes?.includes(projectType)) {
      console.error(`Template registry mismatch for ${templateId} / ${projectType}.`); failed = true;
    }
  }

  // Every renderer is implemented by exactly one ready template, and that
  // template agrees which renderer it implements. Two templates claiming one
  // renderer, or a template selected by a renderer it does not implement, is a
  // registry that can pick either.
  const rendererIds = new Set(Object.keys(renderers.renderers ?? {}));
  for (const [rendererId, renderer] of Object.entries(renderers.renderers ?? {})) {
    const entry = templates.templates?.[renderer.template];
    if (!entry || entry.status !== 'ready') { console.error(`Renderer ${rendererId} names template ${String(renderer.template)}, which is not a ready template.`); failed = true; continue; }
    if (entry.renderer !== rendererId) { console.error(`Renderer ${rendererId} names template ${renderer.template}, which declares it implements ${String(entry.renderer)}.`); failed = true; }
  }
  const templateDefinitions = [];
  for (const [templateId, entry] of Object.entries(templates.templates ?? {})) {
    if (entry.renderer && !rendererIds.has(entry.renderer)) { console.error(`Template ${templateId} implements unknown renderer ${entry.renderer}.`); failed = true; }
    const definition = JSON.parse(fs.readFileSync(path.join(root, entry.path, 'template.json'), 'utf8'));
    templateDefinitions.push(definition);
    if (definition.renderer !== entry.renderer) { console.error(`Template ${templateId} declares renderer ${String(definition.renderer)} but the registry records ${String(entry.renderer)}.`); failed = true; }
    for (const shared of definition.sharedFiles ?? []) {
      if (!fs.existsSync(path.join(root, 'templates/shared', shared.from))) { console.error(`Template ${templateId} declares missing shared presentation file: ${shared.from}`); failed = true; }
    }
  }
  // The presentation manifest is one file compiled per template, so "nobody
  // renders this" is a question about every template at once. Compilation asks
  // the per-template half; this asks the half that keeps the manifest from
  // becoming a catalogue of components that do not exist.
  const orphanComponents = undeclaredComponents(loadPresentationManifest(root), templateDefinitions);
  if (orphanComponents.length) {
    console.error(`Presentation manifest describes component(s) no template renders: ${orphanComponents.join(', ')}.`);
    failed = true;
  }
  for (const override of renderers.capabilityOverrides ?? []) {
    if (!rendererIds.has(override.renderer)) { console.error(`Renderer capability override targets unknown renderer ${String(override.renderer)}.`); failed = true; }
    for (const moduleName of override.modules ?? []) {
      if (!modules[moduleName]) { console.error(`Renderer capability override names unknown module ${moduleName}.`); failed = true; }
    }
  }

  /**
   * Every implementation a contributor declares actually exists.
   *
   * A recipe or adapter declares a base file set and may declare one per
   * renderer. Both are checked from the same walk, so a renderer variant whose
   * files were never written is a doctor failure rather than a build that
   * copies nothing and reports success.
   */
  function checkContributorFiles(kind, id, contributorPath, definition) {
    const sets = [{ label: 'base', filesRoot: definition.filesRoot ?? 'files', files: definition.files ?? [] }];
    for (const [rendererId, variant] of Object.entries(definition.renderers ?? {})) {
      if (!rendererIds.has(rendererId)) { console.error(`${kind} ${id} declares an implementation for unknown renderer ${rendererId}.`); failed = true; continue; }
      const template = renderers.renderers[rendererId].template;
      if (!(definition.compatibleTemplates ?? []).includes(template)) {
        console.error(`${kind} ${id} implements renderer ${rendererId} but does not list its template ${template} as compatible, so it could never be selected.`); failed = true;
      }
      sets.push({ label: rendererId, filesRoot: variant.filesRoot ?? definition.filesRoot ?? 'files', files: variant.files ?? definition.files ?? [] });
    }
    for (const set of sets) {
      for (const relative of set.files) {
        if (!fs.existsSync(path.join(root, contributorPath, set.filesRoot, relative))) {
          console.error(`${kind} ${id} (${set.label}) declares missing managed file: ${relative}`); failed = true;
        }
      }
    }
  }

  for (const [adapterId, entry] of Object.entries(adapters.adapters ?? {})) {
    const file = path.join(root, entry.path, 'adapter.json');
    if (!fs.existsSync(file)) { console.error(`Adapter ${adapterId} is missing adapter.json.`); failed = true; continue; }
    const definition = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (definition.id !== adapterId || definition.version !== entry.version || definition.kind !== entry.kind || definition.status !== entry.status) {
      console.error(`Adapter registry mismatch for ${adapterId}.`); failed = true;
    }
    checkContributorFiles('Adapter', adapterId, entry.path, definition);
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
    checkContributorFiles('Recipe', recipeId, entry.path, definition);
    for (const relative of definition.database?.fragments ?? []) {
      if (!fs.existsSync(path.join(root, entry.path, relative))) { console.error(`Recipe ${recipeId} declares missing database fragment: ${relative}`); failed = true; }
    }
  }
  for (const [moduleId, moduleEntry] of Object.entries(modules)) {
    if (!moduleEntry.implementationRecipe) continue;
    const recipeEntry = recipes.recipes?.[moduleEntry.implementationRecipe];
    if (!recipeEntry || recipeEntry.status !== 'ready' || recipeEntry.module !== moduleId) {
      console.error(`Module ${moduleId} names unavailable or mismatched implementation recipe ${moduleEntry.implementationRecipe}.`); failed = true; continue;
    }
    const recipe = JSON.parse(fs.readFileSync(path.join(root, recipeEntry.path, 'recipe.json'), 'utf8'));
    if (JSON.stringify(moduleEntry.requiresModules ?? []) !== JSON.stringify(recipe.requires ?? [])) {
      console.error(`Module ${moduleId} compatibility dependencies do not match recipe ${moduleEntry.implementationRecipe}.`); failed = true;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}

/**
 * Nothing the factory generates from may be invisible to a fresh clone.
 *
 * `.gitignore` carries rules aimed at generated output — `generated/`, `dist/`,
 * `.tmp/` — and a template ships its own placeholder module at one of those
 * paths. An ignored file is still there for whoever wrote it and simply absent
 * in CI, so the failure arrives as a missing file in a checkout rather than as
 * a mistake at the point it was made.
 */
try {
  const ignored = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', 'templates', 'recipes', 'adapters'], { cwd: root, encoding: 'utf8' });
  if (ignored.status === 0) {
    for (const file of ignored.stdout.split('\n').map((line) => line.trim()).filter(Boolean)) {
      console.error(`Factory source is git-ignored and would be missing from a fresh clone: ${file}`);
      failed = true;
    }
  }
} catch {
  // A checkout without git still runs every other check.
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
console.log('App Builder doctor: intake, renderers, templates, adapters, ready defaults, layouts, scenarios, recipes, renderer implementations, database fragments, browser acceptance and contamination guard are valid.');
