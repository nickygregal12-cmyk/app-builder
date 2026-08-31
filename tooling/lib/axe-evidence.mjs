/**
 * What the accessibility lane actually audited, in a form a gate can read.
 *
 * The lane has run real axe passes against a real generated application for
 * some time. What it has never produced is an artifact: results were attached
 * to a Playwright test report, which a person can open and no gate can resolve.
 * So `axe-serious-critical` sits in the `unregistered` list of
 * `config/gate-producers.json` — a check the accessibility gate names and
 * nothing answers.
 *
 * This compiles the one into the other. It runs nothing and audits nothing; it
 * reads what the lane recorded and states it in the shape
 * `packages/control-plane/src/gate-evidence.js` already knows how to decide.
 *
 * The check remains unregistered, for a reason that is about the two commands
 * rather than about this file: `gates:evidence` and the accessibility lane
 * audit different builds, and a registered check that can only ever resolve to
 * `evidence-for-another-build` would fail evidence integrity on every run.
 * `tooling/accessibility-evidence.mjs` states that in full. What this removes
 * is the missing artifact; what remains is a decision about which build the
 * accessibility gate measures.
 *
 * ## Why an incomplete audit fails rather than passes
 *
 * The decision rule available to a registered check is "fail when a finding of
 * one of these kinds is present". Read naively, that hands a clean pass to a
 * run that audited nothing at all: no audits, no violations, no findings, pass.
 * `tests/accessibility/routes.ts` already carries the scar from the version of
 * this mistake that shipped — a hardcoded `/services` outlived the manifest
 * that produced it, axe cheerfully audited the 404 document, and the lane
 * reported a clean WCAG result for a page that did not exist.
 *
 * So coverage is not merely reported alongside the status; a gap in it becomes
 * a finding. A route the composition declares and the lane did not audit is
 * emitted as a `critical` finding of its own, which fails the check. The
 * population is part of the claim, and a claim over the wrong population is
 * false however green its assertions were.
 *
 * ## What this evidence is about
 *
 * A development server, serving the generated project's own source. It is
 * local-browser product evidence and not evidence about a deployed artifact,
 * which is the same distinction `npm run evidence:generated-app` already draws
 * and for the same reason. The artifact says so in a field rather than in a
 * comment, so a reader who never opens this file still sees it.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Impacts axe assigns. Only the first two fail a build; all four are recorded. */
export const BLOCKING_IMPACTS = Object.freeze(['critical', 'serious']);
export const RECORDED_IMPACTS = Object.freeze(['critical', 'serious', 'moderate', 'minor']);

/** The id given to a declared route that produced no audit. */
export const NOT_AUDITED = 'route-not-audited';

/**
 * Compile one report from what the lane recorded.
 *
 * @param {object}   input
 * @param {object[]} input.measurements    one per route per viewport, as the spec wrote them
 * @param {object[]} input.declaredRoutes  the routes the composition declares
 * @param {string[]} input.viewports       the viewport projects the lane claims to cover
 * @param {string|null} input.compositionHash  the build this is evidence for
 */
export function compileAxeReport({ measurements = [], declaredRoutes = [], viewports = [], compositionHash = null, projectDir = null } = {}) {
  const findings = [];

  for (const measurement of measurements) {
    for (const violation of measurement.violations ?? []) {
      // Every impact is recorded, including the two that do not fail. A
      // moderate violation is a real finding somebody should see, and dropping
      // it here would mean the only way to learn about it was to fail on it.
      findings.push({
        impact: RECORDED_IMPACTS.includes(violation.impact) ? violation.impact : 'minor',
        rule: violation.id ?? null,
        route: measurement.route,
        pageId: measurement.pageId ?? null,
        viewport: measurement.viewport ?? null,
        detail: violation.help ?? violation.description ?? null,
        nodes: Array.isArray(violation.nodes) ? violation.nodes.length : null,
      });
    }
  }

  /**
   * Every route the composition declares, at every viewport the lane claims.
   *
   * Checked as a grid rather than as two lists, because the failure worth
   * catching is partial: a lane that audits every route on desktop and loses
   * the mobile project has covered every route and half the population, and
   * counting routes alone would call that complete.
   */
  const audited = new Set(measurements.map((entry) => `${entry.viewport}::${entry.route}`));
  const notAudited = [];
  for (const viewport of viewports) {
    for (const declared of declaredRoutes) {
      const key = `${viewport}::${declared.route}`;
      if (audited.has(key)) continue;
      notAudited.push({ route: declared.route, pageId: declared.pageId ?? null, viewport });
      findings.push({
        impact: 'critical',
        rule: NOT_AUDITED,
        route: declared.route,
        pageId: declared.pageId ?? null,
        viewport,
        detail: `The composition declares ${declared.route} and the ${viewport} lane recorded no audit for it. An accessibility result over an incomplete population is not a result.`,
        nodes: null,
      });
    }
  }

  return {
    schemaVersion: 1,
    lane: 'generated-app-accessibility',
    artifactKind: 'AccessibilityReport',

    // The build reference. Read from the generated project's own composition,
    // so evidence gathered against one build cannot be read as another's.
    compositionHash,
    projectDir,

    // What was asked of the page, so a later reader does not have to assume a
    // standard from the word "accessibility".
    standard: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    viewports,

    routesDeclared: declaredRoutes.length,
    routesAudited: new Set(measurements.map((entry) => entry.route)).size,
    // The coverage number a passing check carries. Route/viewport pairs rather
    // than routes, because that is the population the claim is over.
    auditsRecorded: measurements.length,
    auditsExpected: declaredRoutes.length * viewports.length,
    notAudited,

    findings,

    serverMode: 'development',
    depictsShippingArtifact: false,
    doesNotProve: [
      'Conformance. Automated rules catch a minority of WCAG failures, and a run with no violations is not an accessible product.',
      'Anything about the deployed site. This audits a development server serving the generated project, so it is evidence about that build and not about what a visitor receives.',
      'Usability with assistive technology. No screen reader, magnifier or switch device was used, and no person tried to complete anything.',
    ],
  };
}

/**
 * Read what the lane wrote.
 *
 * One file per viewport project, each holding that project's measurements, so
 * two Playwright workers never write the same file. A viewport that produced no
 * file is simply absent, and `compileAxeReport` turns that absence into
 * findings rather than into silence.
 */
export function readAxeMeasurements(root) {
  if (!fs.existsSync(root)) return [];
  const measurements = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const parsed = JSON.parse(fs.readFileSync(path.join(root, entry.name), 'utf8'));
    for (const measurement of parsed.measurements ?? []) measurements.push(measurement);
  }
  return measurements;
}

/**
 * The build reference, read from the project that was audited.
 *
 * Null when it cannot be read, and null is not a failure here: it becomes
 * `build-reference-missing` when the gate tries to resolve the artifact, which
 * is a refusal with a reason rather than a report that quietly belongs to no
 * build.
 */
export function compositionHashOf(projectDir) {
  try {
    const composition = JSON.parse(fs.readFileSync(path.join(projectDir, '.app-builder/composition.json'), 'utf8'));
    return composition.compositionHash ?? null;
  } catch {
    return null;
  }
}
