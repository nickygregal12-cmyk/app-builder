import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { REQUIRED_ENGINES, summarise } from './portability-evidence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = fs.readFileSync(path.join(ROOT, 'playwright.portability.config.ts'), 'utf8');
const SPEC = fs.readFileSync(path.join(ROOT, 'tests/portability/generated-site.spec.ts'), 'utf8');
const SHARED_STYLES = fs.readFileSync(path.join(ROOT, 'templates/shared/presentation/styles.css'), 'utf8');

/**
 * The lane's shape is part of what it claims.
 *
 * `docs/VISUAL_EXCELLENCE.md` §9 asks for a *targeted* portability lane, and
 * both directions of drift break it: an engine quietly dropped turns
 * cross-browser evidence back into Chromium evidence, and a route list that
 * grows without limit turns a smoke lane into a second full suite. Neither
 * change announces itself in a diff, so both are held here.
 */
test('the lane includes a viewport the mobile stylesheet applies to', () => {
  // The sticky-header defect lived under `@media (max-width: 720px)` and every
  // desktop project in the matrix is 1280 wide, so three engines agreed the
  // page was fine and none of them had loaded the rule that broke it. A phone
  // project is not a nice-to-have in this lane; it is the only member that can
  // see half the stylesheet.
  const mobileBreakpoint = [...SHARED_STYLES.matchAll(/@media \(max-width:\s*(\d+)px\)/g)]
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b)[0];
  assert.ok(Number.isFinite(mobileBreakpoint), 'the shared presentation no longer has a mobile breakpoint to cover');
  assert.match(CONFIG, /devices\['iPhone \d+'\]/, `the shared stylesheet changes below ${mobileBreakpoint}px and only a phone project loads those rules`);
});

test('the portability lane covers three engines and a phone', () => {
  for (const engine of REQUIRED_ENGINES) {
    assert.match(CONFIG, new RegExp(`name:\\s*'${engine}'`), `the portability config no longer declares the ${engine} project`);
  }
  assert.match(CONFIG, /devices\['Desktop Firefox'\]/, 'the firefox project must run the Firefox engine, not a renamed Chromium');
  assert.match(CONFIG, /devices\['Desktop Safari'\]/, 'the webkit project must run WebKit');
  assert.match(CONFIG, /devices\['iPhone \d+'\]/, 'the mobile project must be a phone descriptor, which is where the mobile-Safari composition failures live');
});

test('the Chromium executable override is not applied to the other engines', () => {
  // `APP_BUILDER_BROWSER_EXECUTABLE` names a Chromium. Applied at `use` it
  // would launch Chrome under the WebKit and Firefox project names, and the
  // lane would report three engines while running one.
  const globalUse = CONFIG.slice(CONFIG.indexOf('  use: {'), CONFIG.indexOf('  projects:'));
  assert.doesNotMatch(globalUse, /executablePath/, 'the Chromium executable override must not sit in the shared `use` block');
  const chromiumProject = CONFIG.match(/name:\s*'chromium'[^\n]*\n/)?.[0] ?? '';
  assert.match(chromiumProject, /executablePath/, 'the chromium project should still honour a host Chromium');
});

test('the lane stays a smoke lane rather than a second full suite', () => {
  const routes = SPEC.match(/const ROUTES = \[([^\]]*)\]/)?.[1] ?? '';
  const count = routes.split(',').filter((entry) => entry.trim()).length;
  assert.ok(count >= 1, 'the lane needs at least one route');
  assert.ok(count <= 4, `the portability lane covers ${count} routes; it is a targeted smoke lane, and tripling the suite is the expensive way it was written to avoid`);
});

test('every portability check names a defect a different engine actually produces', () => {
  // Each check has a rationale comment above it. A check nobody can explain is
  // a check nobody will fix when it fails.
  for (const claim of ['100vw', '100vh', 'sticky', 'object-fit', '16px', 'reduced motion']) {
    assert.ok(SPEC.includes(claim), `the spec no longer explains the ${claim} defect class`);
  }
});

test('an engine that did not run makes the lane incomplete rather than green', () => {
  const chromiumOnly = summarise({ chromium: [{ route: '/', check: 'horizontal-overflow', viewportWidth: 1280, scrollWidth: 1280, offenders: [] }] });
  assert.equal(chromiumOnly.complete, false);
  assert.deepEqual(chromiumOnly.missingEngines, ['firefox', 'webkit', 'mobile-webkit']);
});

test('a check with nothing to measure is recorded as not exercised, never as evidence', () => {
  const full = Object.fromEntries(REQUIRED_ENGINES.map((engine) => [engine, [
    { route: '/', check: 'responsive-imagery', count: 0, images: [] },
    { route: '/', check: 'horizontal-overflow', viewportWidth: 1280, scrollWidth: 1280, offenders: [] },
  ]]));
  const report = summarise(full);
  assert.equal(report.complete, true, 'every engine ran, so the lane is complete');
  assert.equal(report.notExercised.length, REQUIRED_ENGINES.length, 'a build with no images exercises the imagery check on no engine');
  for (const entry of report.notExercised) assert.equal(entry.check, 'responsive-imagery');
  assert.equal(report.engines.chromium.checks['/ responsive-imagery'], 'not-exercised');
  assert.equal(report.engines.chromium.checks['/ horizontal-overflow'], 'exercised');
});

test('a sticky-header check on a page too short to scroll is not evidence either', () => {
  const report = summarise(Object.fromEntries(REQUIRED_ENGINES.map((engine) => [engine, [
    { route: '/', check: 'sticky-header', scrolledBy: 0, topBefore: 0, topAfter: 0 },
  ]])));
  assert.equal(report.notExercised.length, REQUIRED_ENGINES.length);
  assert.equal(report.engines.webkit.checks['/ sticky-header'], 'not-exercised');
});

/**
 * The first defect this lane found, held deterministically so a browser is not
 * needed to catch it again.
 *
 * At <=720px the header rule set `position: relative`, which overrode the
 * `position: sticky` it is given at every other width. The disclosure panel
 * under it is absolutely positioned and does need a positioned ancestor —
 * `relative` is the reflex answer — but `sticky` is already a positioned value
 * and already that ancestor. So the navigation scrolled away with the page on
 * every phone, in every engine, and nothing noticed because nothing asked a
 * mobile viewport whether the header stayed put.
 *
 * The browser lane catches it on `mobile-webkit`. This catches it in
 * `npm run check`, which is where a change to this stylesheet is actually made.
 */
test('no rule takes the site header off sticky', () => {
  const offenders = [];
  for (const match of SHARED_STYLES.matchAll(/([^{}]*\.site-header[^{}]*)\{([^}]*)\}/g)) {
    const [, selector, body] = match;
    const position = body.match(/(?:^|;)\s*position\s*:\s*([a-z-]+)/);
    if (!position) continue;
    // A rule for something *inside* the header positions itself, which is
    // ordinary. Only a rule whose subject is the header itself is the header.
    const subject = selector.split(',').map((entry) => entry.trim()).some((entry) => /\.site-header[a-z0-9_.:[\]"'=-]*$/i.test(entry));
    if (!subject) continue;
    if (position[1] !== 'sticky') offenders.push({ selector: selector.trim(), position: position[1] });
  }
  assert.deepEqual(
    offenders,
    [],
    `these rules take the site header off sticky, so the navigation scrolls away with the page: ${JSON.stringify(offenders)}. The disclosure panel does not need position: relative here — sticky is already a positioned ancestor.`,
  );
});
