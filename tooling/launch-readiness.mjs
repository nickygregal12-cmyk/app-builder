#!/usr/bin/env node
/**
 * Launch-readiness audit CLI.
 *
 *   node tooling/launch-readiness.mjs --project .tmp/generated-acceptance-marketing-site
 *   node tooling/launch-readiness.mjs --project <dir> --json
 *   node tooling/launch-readiness.mjs --project <dir> --fail-on-blocker
 *
 * It reads the generated project's own `.app-builder/composition.json`, so it audits what was
 * actually produced rather than what the factory intended to produce.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { auditLaunchReadiness } from './lib/launch-readiness.mjs';

const root = process.cwd();
const args = process.argv.slice(2);

function flag(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1] ?? null;
}

const project = flag('project');
if (!project) {
  console.error('Usage: node tooling/launch-readiness.mjs --project <generated-project-dir> [--json] [--fail-on-blocker]');
  process.exit(1);
}

const projectRoot = path.resolve(root, project);
const compositionPath = path.join(projectRoot, '.app-builder/composition.json');
if (!fs.existsSync(compositionPath)) {
  console.error(`No composed output at ${path.relative(root, compositionPath)}. Generate the project first.`);
  process.exit(1);
}

const composition = JSON.parse(fs.readFileSync(compositionPath, 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(root, 'config/launch-readiness-rules.json'), 'utf8'));
const manifestPath = path.join(projectRoot, '.app-builder/manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

const topicsPath = path.join(root, 'config/hard-constraint-topics.json');
const hardConstraintTopics = fs.existsSync(topicsPath) ? JSON.parse(fs.readFileSync(topicsPath, 'utf8')) : null;

const report = auditLaunchReadiness({ composition, rules, manifest, hardConstraintTopics });

if (args.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const { summary } = report;
  console.log(`Launch readiness for ${report.projectType ?? 'project'} at ${path.relative(root, projectRoot) || '.'}`);
  console.log(`  launchable: ${report.launchable ? 'yes' : 'no'}`);
  console.log(`  predicted meaningful manual edits: ${report.predictedManualEdits} (target for Phase 3.8E is under 20)`);
  console.log(`  ${summary.blocker} blocker, ${summary.major} major, ${summary.minor} minor; ${summary.evidenceGaps} evidence gap(s)`);
  for (const item of report.findings) {
    console.log(`  [${item.severity}] ${item.category}/${item.check} (${item.owningRole}) ${item.where}`);
    console.log(`      ${item.detail}`);
  }
  if (report.evidenceGaps.length > 0) {
    console.log(`  ${report.evidenceGaps.length} state/journey step(s) need executable evidence; run browser acceptance to close them.`);
  }
  if (report.hardConstraints.length > 0) {
    console.log(`  declared hard constraints: ${report.hardConstraints.length}`);
    for (const entry of report.hardConstraints) {
      console.log(`      [${entry.status}] ${entry.constraint}`);
      console.log(`          ${entry.detail}`);
    }
  }
}

if (args.includes('--fail-on-blocker') && !report.launchable) process.exit(1);
