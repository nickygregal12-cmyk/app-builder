import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { TestInfo } from '@playwright/test';
import { expect, test } from './journey';
import { composedRoutes } from './routes';

/**
 * Where this lane leaves evidence a gate can read.
 *
 * The axe result is attached to the Playwright report as well, and that
 * attachment is for a person. `tooling/accessibility-evidence.mjs` compiles
 * what is written here into the artifact `axe-serious-critical` resolves
 * against — a test report is not an artifact, and the check went unanswered for
 * exactly that reason.
 *
 * One file per viewport project, so two projects never write the same file.
 */
const EVIDENCE = '.app-builder/accessibility/measurements';

function record(testInfo: TestInfo, measurement: Record<string, unknown>) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const file = path.join(EVIDENCE, `${testInfo.project.name}.json`);
  const existing = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { schemaVersion: 1, viewport: testInfo.project.name, measurements: [] };
  existing.measurements = existing.measurements.filter(
    (entry: Record<string, unknown>) => entry.route !== measurement.route,
  );
  existing.measurements.push(measurement);
  existing.measurements.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    String(a.route).localeCompare(String(b.route)));
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
}

/**
 * The generated marketing app, audited at the pages it actually has.
 *
 * The routes are read from the composition rather than listed here. A hardcoded
 * `/services` outlived the manifest that would have produced it — the
 * acceptance manifest declares no services — so the dev server answered 404
 * with the site's own branded not-found document, axe found nothing wrong with
 * that document, and the lane reported a clean WCAG result for a page that does
 * not exist. Every part behaved correctly and the claim was still false.
 */

const blockingImpacts = new Set(['serious', 'critical']);

for (const { route, pageId, notFound } of composedRoutes('.tmp/generated-acceptance-marketing-site')) {
  test(`generated marketing app has no serious or critical WCAG A/AA violations at ${route}`, async ({ page, browserSignals }, testInfo) => {
    // The not-found page is a composed page whose correct answer is 404. It is
    // audited like any other — a person who lands there still has to be able to
    // read it and find their way out — and its status is declared rather than
    // excused, so the gate keeps failing every other 404 in this lane.
    if (notFound) {
      browserSignals.declare({
        id: 'not-found-page-answers-not-found',
        kinds: ['http-error'],
        match: { url: `${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, status: [404] },
        because:
          'This is the composed not-found page, and 404 is the answer it is supposed to give. A not-found page that '
          + 'answered 200 would be a soft-404, which is the defect rather than the fix.',
      });
    }

    const response = await page.goto(route);

    // The route resolved to the page the composition named. Stated here as well
    // as caught by the gate, because the expectation belongs where a reader
    // looking at this test will ask the question.
    if (notFound) {
      expect(response?.status(), `${route} is the not-found page and must say so rather than soft-404`).toBe(404);
    } else {
      expect(response?.status(), `${route} is a composed page and must not answer as not-found`).toBeLessThan(400);
    }
    await page.locator('main').waitFor();

    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    await testInfo.attach('axe-accessibility-results', {
      body: JSON.stringify({ pageId, route, ...result }, null, 2),
      contentType: 'application/json',
    });

    // Recorded before the assertion, so a run that fails still leaves evidence
    // of what it found. Evidence that only survives a passing run describes a
    // product that never has problems.
    record(testInfo, {
      route,
      pageId,
      viewport: testInfo.project.name,
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes,
      })),
      passes: result.passes.length,
      incomplete: result.incomplete.length,
    });

    const blocking = result.violations.filter((violation) => violation.impact && blockingImpacts.has(violation.impact));
    expect(blocking, blocking.map((violation) => `${violation.impact}: ${violation.id} — ${violation.help}`).join('\n')).toEqual([]);
  });
}
