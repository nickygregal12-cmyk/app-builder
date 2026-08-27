/**
 * Stage Q4 coverage.
 *
 * Budgets are the kind of gate most likely to be theatre: a number nobody
 * measured, satisfied by a build nobody looked at. So every dimension has a
 * planted regression that must fail it, the committed budgets are checked
 * against the baseline they say they came from, and the class shapes are
 * asserted as the different things they are — a static build with no script and
 * a document per route is not the same product as an application shell.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PAYLOAD_CHECKS, documentRequests, evaluatePayloadBudgets, measureBuildPayload } from './lib/payload-budget.mjs';

const BUDGETS = JSON.parse(fs.readFileSync('config/payload-budgets.json', 'utf8'));

/** A built directory, written to disk, because that is what the measurement reads. */
function build(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-payload-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

const STATIC_PAGE = '<!doctype html><html><head><link rel="stylesheet" href="/a.css"></head><body><h1>Hi</h1></body></html>';

test('a build is measured by kind, and an unrecognised file is counted rather than ignored', () => {
  const root = build({
    'index.html': STATIC_PAGE,
    'about/index.html': STATIC_PAGE,
    'a.css': 'body{color:red}',
    'app.js': 'console.log(1)',
    'hero.avif': 'x'.repeat(100),
    'font.woff2': 'y'.repeat(50),
    'sitemap.xml': '<urlset/>',
  });
  const measurement = measureBuildPayload(root);
  assert.equal(measurement.bytes.css, 15);
  assert.equal(measurement.bytes.js, 14);
  assert.equal(measurement.bytes.image, 100);
  assert.equal(measurement.bytes.font, 50);
  assert.equal(measurement.bytes.other, 9, 'sitemap.xml is other, not invisible');
  assert.equal(measurement.totalBytes, Object.values(measurement.bytes).reduce((sum, value) => sum + value, 0));
  assert.deepEqual(measurement.routes.map((route) => route.route), ['/', '/about']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a Netlify form definition is not an address a visitor reaches', () => {
  const root = build({ 'index.html': STATIC_PAGE, '__forms.html': '<form name="contact"></form>' });
  const measurement = measureBuildPayload(root);
  assert.equal(measurement.routeDocuments, 1, 'counting __forms.html would inflate the one number this exists to report');
  assert.ok(measurement.bytes.html > 0, 'its bytes are still downloaded and still counted');
  fs.rmSync(root, { recursive: true, force: true });
});

test('subresource requests are counted from the markup a browser receives', () => {
  const requests = documentRequests([
    '<script src="/app.js"></script>',
    '<script>inline()</script>',
    '<link rel="stylesheet" href="/a.css">',
    '<link rel="modulepreload" href="/b.js">',
    '<link rel="icon" href="/favicon.ico">',
    '<img src="/hero.avif">',
    '<source srcset="/hero.webp">',
  ].join(''));
  assert.equal(requests.scripts, 1, 'an inline script is not a request');
  assert.equal(requests.styles, 1);
  assert.equal(requests.preloads, 1, 'an icon link is not a preload');
  assert.equal(requests.images, 1);
  assert.equal(requests.sources, 1);
  assert.equal(requests.total, 5);
});

test('every budget dimension has a planted regression that fails it', () => {
  const budget = { maxBytes: { js: 0, css: 100 }, maxRouteDocumentBytes: 200, maxRouteRequests: 1, minRouteDocuments: 2 };
  const clean = build({ 'index.html': '<html></html>', 'about/index.html': '<html></html>', 'a.css': 'x'.repeat(50) });
  assert.equal(evaluatePayloadBudgets({ measurement: measureBuildPayload(clean), budget, projectType: 'x' }).clean, true);
  fs.rmSync(clean, { recursive: true, force: true });

  const cases = [
    [{ 'app.js': 'x' }, 'payload-over-budget', 'js'],
    [{ 'big.css': 'x'.repeat(200) }, 'payload-over-budget', 'css'],
    [{ 'heavy/index.html': 'x'.repeat(400) }, 'payload-over-budget', 'document:/heavy'],
    [{ 'busy/index.html': '<script src="/a.js"></script><script src="/b.js"></script>' }, 'requests-over-budget', '/busy'],
  ];
  for (const [extra, check, dimension] of cases) {
    const root = build({ 'index.html': '<html></html>', 'about/index.html': '<html></html>', 'a.css': 'x'.repeat(50), ...extra });
    const report = evaluatePayloadBudgets({ measurement: measureBuildPayload(root), budget, projectType: 'x' });
    assert.equal(report.clean, false, JSON.stringify(extra));
    assert.ok(report.findings.some((finding) => finding.check === check && finding.dimension === dimension), JSON.stringify(report.findings));
    // A finding says both numbers, because "over budget" alone is not actionable.
    for (const finding of report.findings) assert.match(finding.detail, /\d/);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // The floor is the one that catches a static class rendering as a shell.
  const shell = build({ 'index.html': '<html></html>', 'a.css': 'x'.repeat(50) });
  const report = evaluatePayloadBudgets({ measurement: measureBuildPayload(shell), budget, projectType: 'x' });
  assert.ok(report.findings.some((finding) => finding.check === 'route-documents-below-minimum'));
  fs.rmSync(shell, { recursive: true, force: true });
});

test('a class with no recorded budget is reported as unbudgeted, not as clean', () => {
  const root = build({ 'index.html': '<html></html>', 'huge.js': 'x'.repeat(10_000_000) });
  const report = evaluatePayloadBudgets({ measurement: measureBuildPayload(root), budget: undefined, projectType: 'unknown-class' });
  assert.equal(report.budgeted, false);
  assert.deepEqual(report.findings, []);
  // It passes, and the report says why it passed. Those are different claims
  // and a status alone cannot tell them apart.
  assert.equal(report.clean, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('every committed budget was measured first, and sits above what it measured', () => {
  const classes = Object.entries(BUDGETS.classes);
  assert.ok(classes.length >= 6, 'every first-class project type needs a budget or an explicit absence');
  assert.match(BUDGETS.baselineMeasuredAt, /^\d{4}-\d{2}-\d{2}$/);

  for (const [id, entry] of classes) {
    assert.ok(entry.measured, `${id} has a budget with no recorded measurement`);
    assert.ok(entry.headroom?.length > 40, `${id} must say what headroom it allowed and why`);
    assert.ok(['static', 'application'].includes(entry.renderer), id);
    for (const [kind, limit] of Object.entries(entry.maxBytes)) {
      assert.ok(limit >= entry.measured[kind], `${id} ${kind} budget ${limit} is below its own measurement ${entry.measured[kind]}`);
    }
    assert.ok(entry.maxRouteDocumentBytes >= entry.measured.maxRouteDocumentBytes, id);
    assert.ok(entry.maxRouteRequests >= entry.measured.maxRouteRequests, id);
    assert.ok(entry.minRouteDocuments <= entry.measured.routeDocuments, id);
  }
});

test('the two renderers are budgeted as the different shapes they are', () => {
  const staticClasses = Object.values(BUDGETS.classes).filter((entry) => entry.renderer === 'static');
  const applicationClasses = Object.values(BUDGETS.classes).filter((entry) => entry.renderer === 'application');
  assert.ok(staticClasses.length >= 2 && applicationClasses.length >= 2);

  // The static claim is zero client JavaScript, and the budget is what enforces
  // it rather than a sentence in a document.
  for (const entry of staticClasses) {
    assert.equal(entry.maxBytes.js, 0, 'a static class that may ship a script is not making the claim 4.2A made');
    assert.ok(entry.minRouteDocuments >= 2, 'a static build with one document is an application shell');
  }
  // The application shell's measured bundle is a finding rather than a
  // comfortable number, and it is recorded so the next thing to inflate it says so.
  for (const entry of applicationClasses) {
    assert.ok(entry.measured.js > 300_000, 'the recorded application bundle should still be the large number it is');
    assert.ok(entry.maxBytes.js < entry.measured.js * 1.25, 'headroom above 25% is not a budget');
  }
});

test('every finding names a declared check', () => {
  const root = build({ 'index.html': '<html></html>', 'app.js': 'x' });
  const report = evaluatePayloadBudgets({
    measurement: measureBuildPayload(root),
    budget: { maxBytes: { js: 0 }, minRouteDocuments: 2 },
    projectType: 'x',
  });
  assert.ok(report.findings.length >= 2);
  for (const finding of report.findings) {
    assert.ok(Object.hasOwn(PAYLOAD_CHECKS, finding.check), finding.check);
    assert.equal(finding.severity, 'violation');
    assert.ok(finding.guidance.length > 40);
  }
  fs.rmSync(root, { recursive: true, force: true });
});
