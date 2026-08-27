#!/usr/bin/env node
/**
 * Stage Q4 — the payload gate.
 *
 *   npm run audit:payload                       # every class, generated and built here
 *   npm run audit:payload -- --type b2b-saas    # one class
 *   npm run audit:payload -- --dist DIR --type marketing-site   # a build that already exists
 *
 * It generates a canonical project per class, installs and builds it as an
 * ordinary repository, measures what the build asks a visitor to download, and
 * holds that against `config/payload-budgets.json`. Building is the point: a
 * payload budget measured from source is a budget on the wrong number.
 *
 * It is not in `npm run check`. Six installs and six builds is minutes rather
 * than seconds, and a gate that slow in the inner loop gets skipped. It has its
 * own command and writes `.app-builder/payload/report.json`, which
 * `config/gate-producers.json` reads as the `performance-budgets` check.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { evaluatePayloadBudgets, measureBuildPayload } from './lib/payload-budget.mjs';
import { generateComposedProject } from './lib/composed-generator.mjs';

const BUDGETS = JSON.parse(fs.readFileSync('config/payload-budgets.json', 'utf8'));
const PROJECT_TYPES = JSON.parse(fs.readFileSync('config/project-types.json', 'utf8')).projectTypes;
const OUT = path.resolve('.app-builder/payload');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/**
 * The same canonical manifest `npm run generate:acceptance` uses.
 *
 * A budget measured from a different fixture than the one the acceptance run
 * builds would drift away from it silently, and the two would eventually be
 * measuring different products under the same class name.
 */
function manifestFor(type) {
  const backend = ['marketing-site', 'content-site'].includes(type) ? 'none' : 'supabase';
  const modules = Object.fromEntries((PROJECT_TYPES[type].defaultModules ?? []).map((name) => [name, true]));
  return {
    schemaVersion: 2,
    project: { name: `${type} payload`, slug: `${type}-payload`, type, primaryGoal: `Measure what a ${type} build asks a visitor to download.` },
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

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${(result.stderr || result.stdout || '').split('\n').slice(-8).join('\n')}`);
  }
}

const only = argument('--type');
const existingDist = argument('--dist');
const types = only ? [only] : Object.keys(BUDGETS.classes);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const reports = [];
for (const type of types) {
  if (!PROJECT_TYPES[type]) throw new Error(`Not a first-class project type: ${type}`);
  let dist;
  let compositionHash = null;

  if (existingDist) {
    dist = path.resolve(existingDist);
  } else {
    const workspace = path.resolve(`.tmp/payload-${type}`);
    fs.rmSync(workspace, { recursive: true, force: true });
    const { composition } = generateComposedProject(manifestFor(type), workspace);
    compositionHash = composition.compositionHash ?? null;
    run('npm', ['install', '--no-audit', '--no-fund'], workspace);
    run('npm', ['run', 'build'], workspace);
    dist = path.join(workspace, 'dist');
  }

  const measurement = measureBuildPayload(dist);
  const report = evaluatePayloadBudgets({ measurement, budget: BUDGETS.classes[type], projectType: type, compositionHash });
  reports.push(report);

  const label = report.budgeted ? (report.clean ? 'PASS   ' : 'FAIL   ') : 'NO-BUDGET';
  console.log(
    `${label} ${type.padEnd(15)} js=${measurement.bytes.js} css=${measurement.bytes.css} `
    + `documents=${measurement.routeDocuments} maxRequests=${measurement.maxRouteRequests}`,
  );
  for (const route of measurement.routes) console.log(`         ${route.route.padEnd(12)} ${route.bytes} bytes, ${route.requests.total} request(s)`);
  for (const finding of report.findings) console.error(`         ${finding.check}: ${finding.detail}`);
}

fs.writeFileSync(
  path.join(OUT, 'report.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    authority: 'payload-budget',
    baselineMeasuredAt: BUDGETS.baselineMeasuredAt,
    // One report per class, plus the flattened findings the gate producer reads.
    classes: reports,
    findings: reports.flatMap((report) => report.findings.map((finding) => ({ ...finding, projectType: report.projectType }))),
    compositionHash: reports.length === 1 ? reports[0].compositionHash : null,
  }, null, 2)}\n`,
);

const failed = reports.filter((report) => !report.clean);
console.log(`\n${reports.length} class(es) measured, ${reports.filter((report) => report.budgeted).length} budgeted, ${failed.length} over budget.`);
console.log(`Report: ${path.relative(process.cwd(), path.join(OUT, 'report.json'))}`);

if (failed.length > 0) process.exitCode = 1;
