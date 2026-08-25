#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { readJson, validateManifest } from './lib/manifest.mjs';
import { buildGenerationPlan, generateProject } from './lib/generator.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const manifestPath = arg('--manifest');
if (!manifestPath) {
  console.error('Usage: npm run create-app -- --manifest <manifest.json> [--out <directory>] [--plan]');
  process.exit(2);
}

const manifest = readJson(manifestPath);
const errors = validateManifest(manifest);
if (errors.length) {
  console.error('Refusing to generate from an invalid manifest:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

try {
  const plan = buildGenerationPlan(manifest);
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({
      project: manifest.project,
      template: { id: plan.template.id, version: plan.template.version },
      adapters: plan.adapters.map((adapter) => ({ id: adapter.id, kind: adapter.kind, version: adapter.version })),
      recipes: plan.recipes.map((recipe) => ({ id: recipe.id, module: recipe.module, version: recipe.version })),
      missingModules: plan.missingModules,
    }, null, 2));
    process.exit(plan.missingModules.length ? 1 : 0);
  }
  const out = path.resolve(arg('--out') ?? path.join('generated', manifest.project.slug));
  generateProject(manifest, out);
  console.log(`Generated standalone project: ${out}`);
  console.log(`Template: ${plan.template.id} ${plan.template.version}`);
  console.log(`Adapters: ${plan.adapters.map((adapter) => adapter.id).join(', ') || 'none'}`);
  console.log(`Recipes: ${plan.recipes.map((recipe) => recipe.id).join(', ') || 'none'}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
