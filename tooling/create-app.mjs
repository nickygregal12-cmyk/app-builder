#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { composeProject } from '../packages/composition/src/index.js';
import { readJson, validateManifest } from './lib/manifest.mjs';
import { buildGenerationPlan } from './lib/generator.mjs';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { recordRecipeInstallations } from './lib/recipe-upgrades.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const manifestPath = arg('--manifest');
if (!manifestPath) {
  console.error('Usage: npm run create-app -- --manifest <manifest.json> [--knowledge-pack <knowledge-pack.json>] [--out <directory>] [--plan]');
  process.exit(2);
}

const manifest = readJson(manifestPath);
const knowledgePackPath = arg('--knowledge-pack');
const knowledgePack = knowledgePackPath ? readJson(knowledgePackPath) : null;
const errors = validateManifest(manifest);
if (errors.length) {
  console.error('Refusing to generate from an invalid manifest:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

try {
  const plan = buildGenerationPlan(manifest);
  const composition = composeProject({ manifest, knowledgePack });
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({
      project: manifest.project,
      template: { id: plan.template.id, version: plan.template.version },
      adapters: plan.adapters.map((adapter) => ({ id: adapter.id, kind: adapter.kind, version: adapter.version })),
      recipes: plan.recipes.map((recipe) => ({ id: recipe.id, module: recipe.module, version: recipe.version })),
      missingModules: plan.missingModules,
      composition: {
        pages: composition.pages.map((page) => ({ id: page.id, path: page.path, title: page.title, sectionCount: page.sectionIds.length })),
        sectionCount: composition.sections.length,
        warnings: composition.warnings,
        knowledgePackHash: composition.input.knowledgePackHash,
      },
    }, null, 2));
    process.exit(plan.missingModules.length ? 1 : 0);
  }
  const out = path.resolve(arg('--out') ?? path.join('generated', manifest.project.slug));
  const generated = generateComposedProject(manifest, out, { knowledgePack });
  const installationInventory = recordRecipeInstallations(out);
  console.log(`Generated standalone project: ${out}`);
  console.log(`Template: ${generated.plan.template.id} ${generated.plan.template.version}`);
  console.log(`Adapters: ${generated.plan.adapters.map((adapter) => adapter.id).join(', ') || 'none'}`);
  console.log(`Recipes: ${generated.plan.recipes.map((recipe) => recipe.id).join(', ') || 'none'}`);
  console.log(`Composition: ${generated.composition.pages.length} pages, ${generated.composition.sections.length} sections, ${generated.composition.warnings.length} warning(s)`);
  console.log(`Recipe installation inventory: ${installationInventory.installed.length} recorded, ${installationInventory.unresolved.length} unresolved`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
