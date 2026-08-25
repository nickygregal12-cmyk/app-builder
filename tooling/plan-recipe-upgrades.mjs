#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { planProjectRecipeUpgrades, recordRecipeInstallations } from './lib/recipe-upgrades.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const project = arg('--project');
if (!project) {
  console.error('Usage: npm run upgrade:plan -- --project <generated-project> [--record-installations]');
  process.exit(2);
}

try {
  const projectDir = path.resolve(project);
  if (process.argv.includes('--record-installations')) recordRecipeInstallations(projectDir);
  const plan = planProjectRecipeUpgrades(projectDir);
  console.log(JSON.stringify(plan, null, 2));
  if (plan.blocked > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
