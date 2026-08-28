/**
 * The SEO/AEO scanner, and the defect it was written against.
 *
 * `gates.seo` declared `seo-aeo-scanner` and nothing answered it, so the gate
 * had never been measured on any build. These cases do the two things that make
 * a new gate producer worth having: they show a known-good build passing, and
 * they show the known-bad state failing — including the known-bad state that is
 * *currently true of this repository's own application template*, so the check
 * is not guarding a hypothetical.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BLOCKING_CHECKS,
  PLACEHOLDER_TITLES,
  SEO_AEO_CHECKS,
  readBuiltDocuments,
  readDocument,
  scanSeoAeo,
} from './lib/seo-aeo.mjs';

const GOOD = (title, description, path_) => ({
  path: path_,
  html: `<!doctype html><html lang="en"><head><title>${title}</title>`
    + `<meta name="description" content="${description}" />`
    + '</head><body><h1>' + title + '</h1></body></html>',
});

/** A build a crawler can read: distinct titles, distinct descriptions, one h1. */
function healthyBuild() {
  return [
    GOOD('Nichol Bell Mackay — cost consultancy', 'Chartered quantity surveying across Scotland.', 'index.html'),
    GOOD('Services — Nichol Bell Mackay', 'Cost planning, procurement and contract administration.', 'services/index.html'),
    GOOD('Contact — Nichol Bell Mackay', 'Speak to the practice about a project.', 'contact/index.html'),
  ];
}

function findingIds(report) {
  return report.findings.map((entry) => entry.check);
}

// --- Known-good ---------------------------------------------------------------

test('a build whose documents each describe themselves is clean', () => {
  const documents = healthyBuild();
  const report = scanSeoAeo({ documents, routesDeclared: documents.length, siteUrl: null, compositionHash: 'abc' });
  assert.equal(report.clean, true, `expected clean, got: ${findingIds(report).join(', ')}`);
  assert.equal(report.documentsScanned, 3);
  assert.equal(report.compositionHash, 'abc');
});

test('not knowing the site URL is an advisory limit, never a failure', () => {
  const documents = healthyBuild();
  const report = scanSeoAeo({ documents, routesDeclared: documents.length, siteUrl: null });
  // The refusal to invent a deployment URL is the factory's own rule. A gate
  // that failed a build for keeping it would punish the honest behaviour.
  assert.ok(findingIds(report).includes('canonical-unavailable'));
  assert.equal(SEO_AEO_CHECKS['canonical-unavailable'].severity, 'advisory');
  assert.ok(!BLOCKING_CHECKS.includes('canonical-unavailable'));
  assert.equal(report.clean, true);
});

test('once the site URL is known, a missing canonical is a real failure', () => {
  const documents = healthyBuild();
  const report = scanSeoAeo({ documents, routesDeclared: documents.length, siteUrl: 'https://example.com' });
  assert.ok(findingIds(report).includes('canonical-missing'));
  assert.equal(report.clean, false);
  assert.ok(!findingIds(report).includes('canonical-unavailable'), 'a known URL cannot also be an unknown one');
});

// --- The defect this was written against --------------------------------------

test('the application template ships a placeholder title, and the scanner says so', () => {
  // Not a fixture. This is the document `templates/react-vite-neutral` actually
  // ships, read from the repository, so this case fails the day someone fixes
  // it — which is the correct time for it to change.
  const shipped = fs.readFileSync('templates/react-vite-neutral/files/index.html', 'utf8');
  const read = readDocument(shipped);
  assert.ok(read.title, 'the template document has a title to judge');
  assert.ok(
    PLACEHOLDER_TITLES.has(read.title.toLowerCase()),
    `the shipped application template title is "${read.title}"; if this is now a real title, delete this assertion and keep the one below`,
  );

  const report = scanSeoAeo({ documents: [{ path: 'index.html', html: shipped }], routesDeclared: 1 });
  assert.ok(findingIds(report).includes('document-title-placeholder'));
  assert.ok(findingIds(report).includes('document-description-missing'));
  assert.equal(report.clean, false, 'the state this producer exists to catch must not report clean');
});

test('a single-page build serving many declared routes is reported, not excused', () => {
  // The application renderer is a Vite SPA: one document, and every route's
  // title is set after hydration. A crawler that does not run JavaScript sees
  // one head for the whole site, so per-route metadata that only exists at
  // runtime is not metadata anybody received.
  const report = scanSeoAeo({
    documents: [GOOD('Nichol Bell Mackay', 'Chartered quantity surveying.', 'index.html')],
    routesDeclared: 6,
  });
  const route = report.findings.find((entry) => entry.check === 'route-metadata-not-crawlable');
  assert.ok(route, 'six declared routes served by one document must be a finding');
  assert.match(route.detail, /6 routes/);
  assert.match(route.detail, /1 HTML document/);
  assert.equal(report.clean, false);
});

test('one document serving one declared route is not that finding', () => {
  const report = scanSeoAeo({
    documents: [GOOD('Nichol Bell Mackay', 'Chartered quantity surveying.', 'index.html')],
    routesDeclared: 1,
  });
  assert.ok(!findingIds(report).includes('route-metadata-not-crawlable'));
});

// --- The rest of the known-bad states ------------------------------------------

test('a document with no title fails', () => {
  const report = scanSeoAeo({ documents: [{ path: 'index.html', html: '<html lang="en"><head></head><body><h1>x</h1></body></html>' }], routesDeclared: 1 });
  assert.ok(findingIds(report).includes('document-title-missing'));
  assert.equal(report.clean, false);
});

test('two routes sharing one title fails, and names both documents', () => {
  const documents = [
    GOOD('Nichol Bell Mackay', 'One description.', 'index.html'),
    GOOD('Nichol Bell Mackay', 'Another description.', 'services/index.html'),
  ];
  const report = scanSeoAeo({ documents, routesDeclared: 2 });
  const duplicate = report.findings.find((entry) => entry.check === 'document-title-duplicated');
  assert.ok(duplicate);
  assert.match(duplicate.where, /index\.html/);
  assert.match(duplicate.where, /services\/index\.html/);
});

test('two routes sharing one description fails', () => {
  const documents = [
    GOOD('One', 'The same sentence about the whole site.', 'index.html'),
    GOOD('Two', 'The same sentence about the whole site.', 'services/index.html'),
  ];
  assert.ok(findingIds(scanSeoAeo({ documents, routesDeclared: 2 })).includes('document-description-duplicated'));
});

test('a document with no top-level heading fails, because an answer engine has nothing to cite', () => {
  const report = scanSeoAeo({
    documents: [{ path: 'index.html', html: '<html lang="en"><head><title>Real title here</title><meta name="description" content="Real description."></head><body><div>copy</div></body></html>' }],
    routesDeclared: 1,
  });
  assert.ok(findingIds(report).includes('document-heading-missing'));
  assert.equal(report.clean, false);
});

test('structured data that will not parse fails', () => {
  const html = '<html lang="en"><head><title>Real title here</title><meta name="description" content="Real description.">'
    + '<script type="application/ld+json">{"@type": "WebSite",}</script></head><body><h1>x</h1></body></html>';
  const report = scanSeoAeo({ documents: [{ path: 'index.html', html }], routesDeclared: 1 });
  assert.ok(findingIds(report).includes('structured-data-unparseable'));
  assert.equal(report.clean, false);
});

test('structured data that parses is not a finding', () => {
  const html = '<html lang="en"><head><title>Real title here</title><meta name="description" content="Real description.">'
    + '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script></head><body><h1>x</h1></body></html>';
  assert.ok(!findingIds(scanSeoAeo({ documents: [{ path: 'index.html', html }], routesDeclared: 1 })).includes('structured-data-unparseable'));
});

// --- The extractor itself -------------------------------------------------------

test('metadata is read in either attribute order', () => {
  const forward = readDocument('<meta name="description" content="A sentence." />');
  const reverse = readDocument('<meta content="A sentence." name="description" />');
  assert.equal(forward.description, 'A sentence.');
  assert.equal(reverse.description, 'A sentence.', 'attribute order is not a fact about the page');
});

test('an unreadable head reports absence rather than assuming presence', () => {
  // The failure direction that matters: anything this cannot parse must become
  // a finding, never a silent pass.
  const read = readDocument('<html><head><title></title></head><body></body></html>');
  assert.equal(read.title, null);
  assert.equal(read.description, null);
  assert.equal(read.language, null);
  assert.equal(read.canonical, false);
});

test('entities and whitespace do not hide a duplicate title', () => {
  const documents = [
    { path: 'a.html', html: '<html lang="en"><head><title>Bell &amp;  Mackay</title><meta name="description" content="One."></head><body><h1>x</h1></body></html>' },
    { path: 'b.html', html: '<html lang="en"><head><title>Bell &amp; Mackay</title><meta name="description" content="Two."></head><body><h1>x</h1></body></html>' },
  ];
  assert.ok(findingIds(scanSeoAeo({ documents, routesDeclared: 2 })).includes('document-title-duplicated'));
});

// --- Coverage: a pass over nothing must be visible as one -----------------------

test('an empty build is reported as zero documents examined', () => {
  const report = scanSeoAeo({ documents: [], routesDeclared: 0 });
  assert.equal(report.documentsScanned, 0);
  // It is "clean" only in the sense that nothing was wrong with nothing. The
  // coverage number is what the gate report carries so that is visible, and it
  // is why the check declares `coverageField`.
  assert.equal(report.clean, true);
});

test('routes declared with no documents at all is a failure, not a clean empty build', () => {
  const report = scanSeoAeo({ documents: [], routesDeclared: 6 });
  assert.ok(findingIds(report).includes('route-metadata-not-crawlable'));
  assert.equal(report.clean, false);
});

// --- Reading a real directory ----------------------------------------------------

test('built documents are read recursively and in stable order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-dist-'));
  fs.mkdirSync(path.join(dir, 'services'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(dir, 'services', 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(dir, 'assets.js'), 'ignored');
  const documents = readBuiltDocuments(dir);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(documents.map((entry) => entry.path), ['index.html', 'services/index.html']);
});

test('a missing dist directory reads as no documents rather than throwing', () => {
  assert.deepEqual(readBuiltDocuments(path.join(os.tmpdir(), 'definitely-not-a-build-dir-xyz')), []);
});

// --- Registry wiring --------------------------------------------------------------

test('the check is registered against the gate that names it, and no longer listed as unanswered', () => {
  const registry = JSON.parse(fs.readFileSync('config/gate-producers.json', 'utf8'));
  const pipelines = JSON.parse(fs.readFileSync('config/agent-pipelines.json', 'utf8'));
  const check = registry.checks['seo-aeo-scanner'];
  assert.ok(check, 'the scanner must be a registered check or nothing reads its artifact');
  assert.equal(check.gate, 'seo');
  assert.ok(pipelines.gates.seo.deterministicChecks.includes('seo-aeo-scanner'));
  assert.ok(registry.producers[check.producer], 'the check names a registered producer');
  assert.ok(
    !registry.unregistered.checks.includes('seo-aeo-scanner'),
    'a check with a producer must not still be listed as one nothing answers',
  );
  // Every id the gate fails on has to exist, or the registry would name a
  // finding the scanner can never emit and the check would silently never fail.
  for (const id of check.failOnFindings) {
    assert.ok(SEO_AEO_CHECKS[id], `failOnFindings names ${id}, which the scanner cannot produce`);
    assert.equal(SEO_AEO_CHECKS[id].severity, 'blocker', `${id} fails the gate and must be declared a blocker`);
  }
  // And the converse: every blocker the scanner can emit must fail the gate,
  // otherwise a blocking finding would be recorded and quietly tolerated.
  assert.deepEqual([...check.failOnFindings].sort(), [...BLOCKING_CHECKS].sort());
});
