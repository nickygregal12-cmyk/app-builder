#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * What the cross-browser portability lane actually proved.
 *
 * The lane is deliberately small, and a small lane has a specific failure mode:
 * a check whose population is empty passes, and a wall of passes reads as
 * "portable" when it means "there was nothing to look at". The imagery check on
 * a build with no photographs is exactly that. So this aggregator separates
 * three states rather than two — a check that held, a check that failed, and a
 * check that was never exercised — and refuses to describe the third as the
 * first.
 *
 * It also refuses a run that lost an engine. A portability lane that quietly
 * became Chromium-only is worse than no lane, because it reports success in the
 * shape of cross-browser evidence.
 */

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, '.app-builder/portability');

// The engines the lane claims. Renaming a project without updating this is a
// change to what the evidence means, so it fails rather than adapting.
export const REQUIRED_ENGINES = Object.freeze(['chromium', 'firefox', 'webkit', 'mobile-webkit']);

/**
 * A check is exercised when it had something to measure. Each entry says how to
 * tell, because "empty" is check-specific: no images is an empty population, no
 * overflow offenders is a pass.
 */
const EXERCISED = Object.freeze({
  'horizontal-overflow': (m) => Number.isFinite(m.viewportWidth),
  'sticky-header': (m) => (m.scrolledBy ?? 0) > 0,
  'viewport-units': (m) => typeof m.minHeight === 'string' && m.minHeight !== '',
  'responsive-imagery': (m) => (m.count ?? 0) > 0,
  'form-controls': (m) => (m.count ?? 0) > 0,
  'reduced-motion': (m) => Array.isArray(m.offenders),
  'mobile-navigation': (m) => m.disclosure === true,
});

export function summarise(byEngine) {
  const engines = {};
  const notExercised = [];
  for (const [engine, measurements] of Object.entries(byEngine)) {
    const checks = {};
    for (const measurement of measurements) {
      const predicate = EXERCISED[measurement.check];
      const exercised = predicate ? predicate(measurement) : true;
      checks[`${measurement.route} ${measurement.check}`] = exercised ? 'exercised' : 'not-exercised';
      if (!exercised) notExercised.push({ engine, route: measurement.route, check: measurement.check });
    }
    engines[engine] = { measurements: measurements.length, checks };
  }
  const missingEngines = REQUIRED_ENGINES.filter((engine) => !(engine in byEngine));
  return {
    schemaVersion: 1,
    lane: 'cross-browser-visual-portability',
    engines,
    missingEngines,
    notExercised,
    // Deliberately not a score. The lane says which engines ran and which
    // checks had something to look at; what that means for a project is a
    // reading, not a number.
    complete: missingEngines.length === 0,
  };
}

export function readEvidence(root = EVIDENCE) {
  if (!fs.existsSync(root)) return {};
  const byEngine = {};
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, 'measurements.json');
    if (!fs.existsSync(file)) continue;
    byEngine[entry.name] = JSON.parse(fs.readFileSync(file, 'utf8')).measurements ?? [];
  }
  return byEngine;
}

function main() {
  const byEngine = readEvidence();
  const report = summarise(byEngine);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  for (const engine of REQUIRED_ENGINES) {
    const state = report.engines[engine];
    console.log(`${engine.padEnd(14)} ${state ? `${state.measurements} measurement(s)` : 'DID NOT RUN'}`);
  }
  for (const entry of report.notExercised) {
    console.log(`not exercised: ${entry.engine} ${entry.route} ${entry.check} — the check ran and had nothing to measure. It is not evidence.`);
  }
  console.log(`Evidence: ${path.relative(ROOT, EVIDENCE)}`);

  if (!report.complete) {
    console.error(`Portability lane is incomplete: ${report.missingEngines.join(', ')} produced no evidence. A lane missing an engine reports success in the shape of cross-browser proof.`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
