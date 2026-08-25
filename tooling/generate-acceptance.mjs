#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { auditLaunchReadiness } from './lib/launch-readiness.mjs';
import { recordRecipeInstallations } from './lib/recipe-upgrades.mjs';

const projectTypes = JSON.parse(fs.readFileSync('config/project-types.json', 'utf8')).projectTypes;
const orderedTypes = ['marketing-site', 'b2b-saas', 'consumer-app', 'internal-tool', 'content-site', 'ai-app'];

function manifestFor(type) {
  const backend = ['marketing-site', 'content-site'].includes(type) ? 'none' : 'supabase';
  const modules = Object.fromEntries((projectTypes[type].defaultModules ?? []).map((name) => [name, true]));
  return {
    schemaVersion: 2,
    project: {
      name: `${type} acceptance`,
      slug: `${type}-acceptance`,
      type,
      primaryGoal: `Prove deterministic ${type} composition, generation and independent build acceptance.`,
    },
    audience: { targetUsers: 'Acceptance-test users', roles: [] },
    journeys: ['Complete the primary workflow'],
    majorSurfaces: [],
    entities: ['Primary record'],
    company: { identity: {}, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: [] },
    modules,
    infrastructure: { backend, deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { accentColor: '#315b72', designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { tenantModel: null, integrations: [], uploads: {}, existingData: [], expectedScale: null, sensitivity: null, hardConstraints: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

const launchRules = JSON.parse(fs.readFileSync(path.resolve('config/launch-readiness-rules.json'), 'utf8'));
const launchCeilings = JSON.parse(fs.readFileSync(path.resolve('config/factory-benchmarks.json'), 'utf8')).launchReadiness?.ceilings ?? {};

for (const type of orderedTypes) {
  if (!projectTypes[type]) throw new Error(`Missing first-class project type: ${type}`);
  const output = path.resolve(`.tmp/generated-acceptance-${type}`);
  fs.rmSync(output, { recursive: true, force: true });
  const { composition } = generateComposedProject(manifestFor(type), output);
  if (composition.pages.length < 1 || composition.sections.length < 1) throw new Error(`${type} did not produce usable composition.`);
  const inventory = recordRecipeInstallations(output);
  if (inventory.unresolved.length) throw new Error(`${type} generated with unresolved recipe installation inventory.`);

  // A generated project that compiles is not the same as one worth launching. Audit the composed
  // product and hold it against a recorded ceiling, so a change that makes output worse fails here
  // rather than during someone's hand review.
  const report = auditLaunchReadiness({ composition, rules: launchRules, manifest: manifestFor(type) });
  fs.writeFileSync(
    path.join(output, '.app-builder/launch-readiness.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  const ceiling = launchCeilings[type];
  if (typeof ceiling === 'number' && report.predictedManualEdits > ceiling) {
    throw new Error(
      `${type} predicts ${report.predictedManualEdits} meaningful manual edits, above its recorded ceiling of ${ceiling}. `
      + 'Fix the generated product rather than raising the ceiling.',
    );
  }
  console.log(`${type} -> ${output} (${composition.pages.length} pages, ${composition.sections.length} sections, ${inventory.installed.length} recipe installation records, ${report.predictedManualEdits}/${ceiling ?? '-'} predicted edits)`);
}
