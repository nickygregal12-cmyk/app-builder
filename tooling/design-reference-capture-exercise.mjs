#!/usr/bin/env node
/**
 * Prove the reference measurement script works in a real browser.
 *
 * The unit tests stub Chromium, which is right for them: what they check is the
 * analysis, and a browser would make them slow and flaky without making them
 * stronger. But "the factory can look at a site you like" is a claim about a
 * browser, and a claim about a browser that no browser was ever asked to
 * support is exactly the kind of thing this repository refuses to record as
 * done. So this drives a real one.
 *
 * Two fixture pages are served over loopback and measured with the same
 * `measurePage` the capture uses. They are deliberately opposites:
 *
 *   editorial — 96px display type, 160px between sections, no hero image,
 *               ruled headings, one ground, almost no transitions
 *   immersive — a full-bleed lead image, tight rhythm, alternating grounds,
 *               plain headings, a lot of motion, collapsed mobile navigation
 *
 * The exercise passes when the measurements separate them and the traits the
 * interpreter derives are the ones a person would name looking at each page.
 *
 * `assertSafeReferenceUrl` is NOT relaxed here, and could not be: it refuses
 * loopback, which is where the fixture server is. That is the point. This
 * exercises the measurement half in a browser; the refusal half is exercised by
 * `tooling/visual-reference.test.mjs`, which proves every spelling of a private
 * destination is turned away before a browser is launched.
 *
 *   node tooling/design-reference-capture-exercise.mjs
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interpretObservations } from './lib/visual-reference.mjs';
import { REFERENCE_VIEWPORTS, measurePage, observationsFrom } from './lib/visual-reference-capture.mjs';
import { describeEvidenceBrowser, evidenceBrowserStatus } from './lib/evidence-browser.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/design-references');

function serve(file) {
  const html = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

async function measure(browser, url) {
  const measurements = {};
  for (const viewport of REFERENCE_VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20_000 });
      await page.waitForTimeout(400);
      measurements[viewport.name] = await page.evaluate(measurePage);
    } finally {
      await context.close();
    }
  }
  return observationsFrom({ desktop: measurements.desktop, mobile: measurements.mobile });
}

const EXPECTED = {
  'editorial.html': ['oversized-display-type', 'generous-whitespace', 'typographic-opening', 'ruled-section-headings', 'single-ground', 'restrained-motion'],
  'immersive.html': ['imagery-led-opening', 'dense-information', 'plain-section-headings', 'alternating-section-ground', 'expressive-motion', 'disclosure-navigation'],
};

const status = await evidenceBrowserStatus({ env: process.env });
if (!status.ready) {
  console.error(describeEvidenceBrowser(status));
  console.error('This exercise drives a real browser on purpose. Without one it reports nothing rather than passing.');
  process.exit(1);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch(process.env.APP_BUILDER_BROWSER_EXECUTABLE ? { executablePath: process.env.APP_BUILDER_BROWSER_EXECUTABLE } : {});
const report = { schemaVersion: 1, browser: status.executablePath, pages: [] };
let failed = false;

try {
  for (const [file, expected] of Object.entries(EXPECTED)) {
    const server = await serve(file);
    try {
      const observed = await measure(browser, server.url);
      const interpreted = interpretObservations(observed);
      const traits = interpreted.map((entry) => entry.trait);
      const missing = expected.filter((trait) => !traits.includes(trait));
      report.pages.push({
        fixture: file,
        observed,
        interpreted,
        expected,
        missing,
        // Every trait names the measurements behind it. A page that produced a
        // trait with nothing behind it would be the failure this whole boundary
        // exists to prevent, so it is checked here too rather than assumed.
        unsupported: interpreted.filter((entry) => !entry.fromObservations.length).map((entry) => entry.trait),
      });
      if (missing.length || interpreted.some((entry) => !entry.fromObservations.length)) failed = true;
      console.log(`${file}: ${traits.length} trait(s) — ${traits.join(', ')}`);
      if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
    } finally {
      await server.close();
    }
  }
} finally {
  await browser.close();
}

// The two fixtures must not read the same. A measurement script that reports
// the same traits for an editorial page and an immersive one is measuring
// nothing.
const [editorial, immersive] = report.pages.map((page) => new Set(page.interpreted.map((entry) => entry.trait)));
const shared = [...editorial].filter((trait) => immersive.has(trait));
report.separation = { shared, distinct: shared.length < Math.min(editorial.size, immersive.size) / 2 };
if (!report.separation.distinct) {
  failed = true;
  console.error(`The two fixtures produced overlapping traits (${shared.join(', ')}). A measurement that cannot tell them apart is not a measurement.`);
}

const out = path.resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '.app-builder/design-reference-exercise.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nReal browser: ${status.executablePath}`);
console.log(`Report: ${out}`);
process.exit(failed ? 1 : 0);
