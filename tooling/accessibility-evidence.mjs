#!/usr/bin/env node
/**
 * Turn the accessibility lane's run into an artifact a gate can resolve.
 *
 *   npm run test:e2e:accessibility     # runs the lane, then this
 *
 * The lane audits a real generated application with real axe passes over routes
 * read from the composition. Until now the results went to a Playwright
 * attachment: openable by a person, unreadable by
 * `packages/control-plane/src/gate-evidence.js`. So `axe-serious-critical` sat
 * in the `unregistered` list — a check the accessibility gate names and nothing
 * answers — and the gate was `not-run` because of a missing file rather than a
 * missing browser.
 *
 * This writes that file. It runs no browser and audits nothing.
 *
 * ## Why the check is still unregistered
 *
 * The artifact exists now and nothing reads it yet, which looks like an
 * oversight and is not.
 *
 * `evaluateEvidenceIntegrity` fails on any registered check that resolves
 * `not-run`, and `npm run gates:evidence` exits non-zero when integrity fails.
 * That command builds the NBM genuine-business project; this lane audits the
 * generated acceptance marketing site. Two builds, two composition hashes, and
 * an artifact whose build reference does not match is refused as another
 * build's evidence — which is the whole point of binding it, and which would
 * take CI down on every run if the check were registered today.
 *
 * No reordering of CI fixes that, because it is a fact about which product each
 * command measures rather than about when they run. Registering this needs the
 * two lanes to audit one build, which is a decision about what the
 * accessibility gate is for. So the check stays on the unanswered list, where
 * it is true, and this artifact waits for it.
 *
 * Registering it would not make the accessibility gate pass in any case. That
 * gate declares `requiresIndependentReviewer: true`, so it stays `not-run`
 * until a person issues a verdict, and an automated pass over a minority of
 * WCAG rules is exactly the evidence that should not buy its way past rule 17.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { compileAxeReport, compositionHashOf, readAxeMeasurements } from './lib/axe-evidence.mjs';

const ROOT = process.cwd();
const EVIDENCE = path.join(ROOT, '.app-builder/accessibility');
const MEASUREMENTS = path.join(EVIDENCE, 'measurements');

/**
 * The project the lane audits, and the viewports it claims to cover.
 *
 * Both are stated here rather than discovered, for the reason
 * `tooling/portability-evidence.mjs` states about its engines: renaming a
 * Playwright project without updating this is a change to what the evidence
 * means. A lane that quietly became desktop-only would otherwise report a
 * complete result over half its population.
 */
const PROJECT_DIR = process.env.APP_BUILDER_ACCESSIBILITY_PROJECT ?? '.tmp/generated-acceptance-marketing-site';
export const REQUIRED_VIEWPORTS = Object.freeze(['desktop-chromium', 'mobile-chromium']);

function declaredRoutes(projectDir) {
  const file = path.join(projectDir, '.app-builder/composition.json');
  const composition = JSON.parse(fs.readFileSync(file, 'utf8'));
  return (composition.pages ?? [])
    .filter((page) => typeof page.path === 'string' && page.path.startsWith('/'))
    .map((page) => ({ route: page.path, pageId: String(page.id ?? 'unknown') }));
}

function main() {
  const measurements = readAxeMeasurements(MEASUREMENTS);

  // A lane that recorded nothing did not pass quietly; it did not run. Writing
  // an artifact here would hand the gate a clean report over an empty
  // population, and an absent artifact is `artifact-missing` — a refusal with a
  // reason, which is the honest answer.
  if (!measurements.length) {
    console.error(`No accessibility measurements under ${path.relative(ROOT, MEASUREMENTS)}. The lane recorded nothing, so no evidence is written: a report over an empty population would read as a clean audit.`);
    process.exit(1);
  }

  const routes = declaredRoutes(PROJECT_DIR);
  const report = compileAxeReport({
    measurements,
    declaredRoutes: routes,
    viewports: REQUIRED_VIEWPORTS,
    compositionHash: compositionHashOf(PROJECT_DIR),
    projectDir: PROJECT_DIR,
  });

  fs.mkdirSync(EVIDENCE, { recursive: true });
  const file = path.join(EVIDENCE, 'report.json');
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);

  const blocking = report.findings.filter((finding) => finding.impact === 'serious' || finding.impact === 'critical');
  console.log(`Build:    compositionHash ${report.compositionHash ?? '(none — this evidence is bound to no build)'}`);
  console.log(`Audited:  ${report.auditsRecorded}/${report.auditsExpected} route/viewport pairs across ${report.viewports.length} viewport(s)`);
  console.log(`Findings: ${report.findings.length} (${blocking.length} serious or critical)`);
  for (const entry of report.notAudited) {
    console.log(`not audited: ${entry.viewport} ${entry.route} — declared by the composition and never measured. Recorded as a critical finding.`);
  }
  for (const finding of blocking.slice(0, 10)) {
    console.log(`  ${finding.impact.padEnd(8)} ${finding.rule} at ${finding.route} (${finding.viewport})`);
  }
  console.log(`Evidence: ${path.relative(ROOT, file)}`);

  if (report.compositionHash === null) {
    console.error('The audited project records no compositionHash, so this evidence is bound to no build and any gate reading it will refuse it.');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
