#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { generateProject } from './lib/generator.mjs';

const projectTypes = JSON.parse(fs.readFileSync('config/project-types.json', 'utf8')).projectTypes;
const orderedTypes = ['marketing-site', 'b2b-saas', 'consumer-app', 'internal-tool', 'content-site', 'ai-app'];

function manifestFor(type) {
  const backend = ['marketing-site', 'content-site'].includes(type) ? 'none' : 'supabase';
  const modules = Object.fromEntries((projectTypes[type].defaultModules ?? []).map((name) => [name, true]));
  return {
    schemaVersion: 1,
    project: {
      name: `${type} acceptance`,
      slug: `${type}-acceptance`,
      type,
      primaryGoal: `Prove deterministic ${type} generation and independent build acceptance.`,
    },
    modules,
    infrastructure: { backend, deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { accentColor: '#315b72' },
    inputs: { sources: [] },
    outOfScope: [],
  };
}

for (const type of orderedTypes) {
  if (!projectTypes[type]) throw new Error(`Missing first-class project type: ${type}`);
  const output = path.resolve(`.tmp/generated-acceptance-${type}`);
  fs.rmSync(output, { recursive: true, force: true });
  generateProject(manifestFor(type), output);
  console.log(`${type} -> ${output}`);
}
