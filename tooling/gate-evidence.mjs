#!/usr/bin/env node
/**
 * Real deterministic evidence, resolved into a convergence report.
 *
 * `evaluateConvergence` has refused every pipeline it has ever been shown,
 * because every required gate was `not-run` and nothing produced a gate result.
 * The refusal was correct and it was also the only thing the contract had
 * demonstrated. This command closes that: it builds a genuine business through
 * the ordinary service, runs the producers that already exist, writes their
 * artifacts, resolves them into gate results through
 * `packages/control-plane/src/gate-evidence.js`, and hands those to the real
 * `evaluateConvergence`.
 *
 *   npm run gates:evidence            # build, produce, resolve, converge
 *   npm run gates:evidence -- --out d # somewhere other than .app-builder/gate-evidence
 *
 * What it is:  one real build, three real producers, four registered checks,
 *              and a convergence report over the marketing-site pipeline's
 *              eighteen required gates.
 * What it is not: a passing build. Convergence is false and is expected to stay
 *              false: fourteen of the eighteen gates have no producer, and the
 *              three that are fully measured still want an independent verdict
 *              that no one has issued. It promotes nothing, arms nothing and
 *              calls no model.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';

import { evaluateConvergence } from '@app-builder/control-plane/roles';
import { resolveGateResults, summariseResolutions } from '@app-builder/control-plane/gate-evidence';

import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { auditLaunchReadiness } from './lib/launch-readiness.mjs';
import { auditAssetRights } from './lib/asset-rights.mjs';

const BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';
const PIPELINE_ID = 'marketing-site';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const root = path.resolve(argument('--out') ?? '.app-builder/gate-evidence');
const registry = JSON.parse(fs.readFileSync('config/gate-producers.json', 'utf8'));
const pipelines = JSON.parse(fs.readFileSync('config/agent-pipelines.json', 'utf8'));
const launchRules = JSON.parse(fs.readFileSync('config/launch-readiness-rules.json', 'utf8'));

function hashOf(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Write a producer's artifact and describe it the way the resolver reads it. */
function publish(producerId, value, projectId) {
  const producer = registry.producers[producerId];
  if (!producer) throw new Error(`No registered producer: ${producerId}`);
  const file = path.join(root, path.basename(producer.artifact));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return { ref: path.relative(process.cwd(), file), hash: hashOf(value), value, projectId };
}

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const store = new FactoryStore({ stateRoot: path.join(root, 'service') });
const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), factoryRoot: process.cwd() });

const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
const { project } = await service.replayIntakeBundle(bundle);
const generated = await service.generateProject(project.id);
const composition = generated.composition;
const buildRef = composition.compositionHash ?? null;
if (!buildRef) throw new Error('The build produced no compositionHash, so no evidence could be bound to it.');

console.log('== Gate evidence ==\n');
console.log(`Business:  ${bundle.projectManifest.project.name} (${bundle.bundleId})`);
console.log(`Project:   ${project.id}`);
console.log(`Build:     compositionHash ${buildRef}`);
console.log(`Workspace: ${path.relative(process.cwd(), generated.workspace)}\n`);

// --- The producers, each run for real against this build --------------------

const manifest = service.getManifest(project.id);
const launchReadiness = auditLaunchReadiness({ composition, rules: launchRules, manifest });
const designLint = service.designLintReport(project.id);
if (!designLint) throw new Error('The build produced no DesignLintReport, so the design gates have no producer output.');
const assetsFile = path.join(generated.workspace, '.app-builder/assets.json');
const published = fs.existsSync(assetsFile) ? JSON.parse(fs.readFileSync(assetsFile, 'utf8')) : { assets: {} };
const assetRights = auditAssetRights({ assets: published.assets, compositionHash: buildRef });

const artifacts = {
  'launch-readiness': publish('launch-readiness', launchReadiness, project.id),
  'design-lint': publish('design-lint', designLint, project.id),
  'asset-rights': publish('asset-rights', assetRights, project.id),
};

for (const [id, artifact] of Object.entries(artifacts)) {
  console.log(`PRODUCED  ${id.padEnd(17)} ${artifact.ref}  ${artifact.hash.slice(0, 19)}…`);
}

// --- Resolution -------------------------------------------------------------

const requiredGates = pipelines.pipelines[PIPELINE_ID].requiredGates;
const { results, resolutions } = resolveGateResults({
  gates: pipelines.gates,
  requiredGates,
  registry,
  artifacts,
  // No verdict is supplied. Rule 17 means this command cannot issue one, and a
  // gate that wants one stays not-run in the report below.
  verdicts: {},
  build: { projectId: project.id, buildRef, evidenceKinds: [] },
});

console.log('\n== Gates ==\n');
for (const entry of resolutions) {
  const label = entry.status === 'pass' ? 'PASS' : entry.status === 'fail' ? 'FAIL' : 'NOT-RUN';
  console.log(`${label.padEnd(8)} ${entry.gateId}`);
  for (const check of entry.checks) {
    const state = check.status === 'not-run' ? `not-run (${check.reason})` : check.status;
    const coverage = check.coverage ? ` over ${check.coverage.value} ${check.coverage.label}` : '';
    console.log(`         · ${check.id}: ${state}${coverage}${check.hash ? ` [${check.hash.slice(0, 19)}…]` : ''}`);
    if (check.status === 'fail') console.log(`             ${check.detail}`);
  }
  if (entry.blockers.includes('independent-verdict-missing')) {
    console.log('         · independent verdict: missing — deterministic checks cannot supply it');
  }
}

const report = evaluateConvergence({
  projectId: project.id,
  pipeline: pipelines.pipelines[PIPELINE_ID],
  gates: pipelines.gates,
  results,
  iteration: 0,
});

const summary = summariseResolutions(resolutions);
fs.writeFileSync(
  path.join(root, 'report.json'),
  `${JSON.stringify({
    schemaVersion: 1,
    projectId: project.id,
    bundleId: bundle.bundleId,
    buildRef,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([id, entry]) => [id, { ref: entry.ref, hash: entry.hash }])),
    summary,
    resolutions,
    convergence: report,
  }, null, 2)}\n`,
);

console.log('\n== Convergence ==\n');
console.log(`converged:  ${report.converged}`);
console.log(`stopReason: ${report.stopReason}`);
console.log(`gates:      ${summary.gates} required, ${summary.passed} pass, ${summary.failed} fail, ${summary.notRun} not-run`);
console.log(`measured:   ${summary.everyCheckAnswered.join(', ') || 'none'} — every declared check answered from real evidence`);
console.log(`awaiting a verdict: ${summary.awaitingIndependentVerdict.join(', ') || 'none'}`);
console.log(`\nReport: ${path.relative(process.cwd(), path.join(root, 'report.json'))}`);

if (report.converged) {
  console.error('\nConvergence reported success. Nothing in this repository has earned that, so this is a defect in the wiring rather than a finished project.');
  process.exitCode = 1;
} else if (summary.everyCheckAnswered.length === 0) {
  console.error('\nNo gate had every declared check answered from real evidence. That is the thing this command exists to produce.');
  process.exitCode = 1;
}
