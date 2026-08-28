/**
 * The document a generated application actually serves, and the defect it was
 * written against.
 *
 * The known-bad state is not hypothetical and is not a fixture: it is the head
 * `templates/react-vite-neutral` shipped until this change, and the SEO/AEO
 * scanner already refuses it. These cases plant that state, prove the scanner
 * fails for the intended reason, and then prove a generated project no longer
 * carries it.
 *
 * The subject is the generated repository's own `index.html` — a source file
 * Vite copies through to `dist` untouched. `document-metadata-acceptance.mjs`
 * is the case that installs, builds and scans the real `dist`; this file is the
 * cheap deterministic half that runs on every pull request.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { applyDocumentHead, composeDocumentHead, renderDocumentHead, HEAD_CLOSE, HEAD_OPEN } from './lib/document-head.mjs';
import { generateProject } from './lib/generator.mjs';
import { readDocument, scanSeoAeo } from './lib/seo-aeo.mjs';

const FACTORY_ROOT = process.cwd();

function manifest(project) {
  return {
    schemaVersion: 1,
    project: { type: 'b2b-saas', ...project },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'none' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 1 },
  };
}

/** Generate into a fresh directory and hand back what the document says. */
function generate(project) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-head-'));
  const target = path.join(out, 'project');
  try {
    generateProject(manifest(project), target, { factoryRoot: FACTORY_ROOT });
    return {
      html: fs.readFileSync(path.join(target, 'index.html'), 'utf8'),
      evidence: JSON.parse(fs.readFileSync(path.join(target, '.app-builder/document-head.json'), 'utf8')),
    };
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

const ACME = {
  name: 'Acme Workspace',
  slug: 'acme-workspace',
  primaryGoal: 'Give teams a secure shared workspace with profiles, organisations and administration.',
};

// --- The planted defect --------------------------------------------------------

test('the template still ships the placeholder, and the scanner still refuses it', () => {
  // The placeholder lives INSIDE the managed markers on purpose. If substitution
  // ever stops running, this exact string reaches `dist`, and this is the
  // finding that catches it. Deleting the placeholder from the template would
  // make a failed generation ship a document with no title at all, which the
  // scanner also refuses but less legibly.
  const shipped = fs.readFileSync('templates/react-vite-neutral/files/index.html', 'utf8');
  assert.ok(shipped.includes(HEAD_OPEN) && shipped.includes(HEAD_CLOSE), 'the template declares the seam the generator writes through');

  const report = scanSeoAeo({ documents: [{ path: 'index.html', html: shipped }], routesDeclared: 1 });
  const findings = report.findings.map((entry) => entry.check);
  assert.ok(findings.includes('document-title-placeholder'), 'the unsubstituted template is the state this producer exists to catch');
  assert.ok(findings.includes('document-description-missing'));
  assert.equal(report.clean, false);
});

// --- Positive: what a generated project ships ----------------------------------

test('a generated application names itself in the document, not after hydration', () => {
  const { html } = generate(ACME);
  const read = readDocument(html);

  assert.equal(read.title, 'Acme Workspace');
  assert.equal(read.description, ACME.primaryGoal);
  assert.equal(read.ogTitle, 'Acme Workspace');
  assert.ok(!html.includes('Generated application'), 'the scaffold placeholder must not survive generation');

  // The whole point: this is in the document, so it does not need JavaScript.
  assert.ok(!html.includes('document.title'), 'the head is written, not patched');
});

test('the generated document passes the checks the placeholder failed', () => {
  const { html } = generate(ACME);
  const findings = scanSeoAeo({ documents: [{ path: 'index.html', html }], routesDeclared: 1 })
    .findings.map((entry) => entry.check);
  assert.ok(!findings.includes('document-title-placeholder'));
  assert.ok(!findings.includes('document-description-missing'));
});

test('a declared site URL becomes a canonical and an og:url', () => {
  const { html, evidence } = generate({ ...ACME, siteUrl: 'https://acme.example/' });
  assert.match(html, /<link rel="canonical" href="https:\/\/acme\.example\/" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/acme\.example\/" \/>/);
  assert.equal(readDocument(html).canonical, true);
  assert.equal(evidence.withheld.find((entry) => entry.key === 'canonical'), undefined);

  // And once the URL is known, the scanner's canonical rule is the one that
  // applies. A build that knew its address and emitted no canonical would fail.
  const report = scanSeoAeo({ documents: [{ path: 'index.html', html }], routesDeclared: 1, siteUrl: 'https://acme.example' });
  assert.ok(!report.findings.some((entry) => entry.check === 'canonical-missing'));
});

// --- Partial: unknown stays absent, with a reason ------------------------------

test('an unknown canonical is withheld with its reason, never invented', () => {
  const { html, evidence } = generate(ACME);
  assert.ok(!/rel="canonical"/i.test(html), 'no canonical may be emitted for an address nobody declared');
  assert.ok(!/og:url/i.test(html));

  const withheld = Object.fromEntries(evidence.withheld.map((entry) => [entry.key, entry]));
  for (const key of ['canonical', 'og:url', 'og:image', 'og:locale']) {
    assert.equal(withheld[key]?.status, 'unproven', `${key} must be recorded as unproven rather than silently missing`);
    assert.ok(withheld[key].reason.length > 20, `${key} must say why`);
  }

  // Not knowing the deployment URL is a limit of what the build knows. The
  // scanner records it as advisory, and a clean build stays clean.
  const report = scanSeoAeo({ documents: [{ path: 'index.html', html }], routesDeclared: 1, siteUrl: null });
  assert.ok(report.findings.some((entry) => entry.check === 'canonical-unavailable'));
});

test('no social image is named for a project that supplied none', () => {
  const { html } = generate(ACME);
  assert.ok(!/og:image/i.test(html), 'a link preview with an invented picture is worse than one with none');
});

// --- Isolation: one project's metadata is not another's ------------------------

test('a generated application never receives another project\'s metadata', () => {
  const first = generate(ACME);
  const second = generate({
    name: 'Northwind Freight',
    slug: 'northwind-freight',
    primaryGoal: 'Track shipments and settle carrier invoices in one place.',
    siteUrl: 'https://northwind.example',
  });

  assert.equal(readDocument(first.html).title, 'Acme Workspace');
  assert.equal(readDocument(second.html).title, 'Northwind Freight');
  assert.ok(!first.html.includes('Northwind'));
  assert.ok(!second.html.includes('Acme'));
  // The first project declared no URL and the second did. Neither borrows.
  assert.ok(!/rel="canonical"/i.test(first.html));
  assert.match(second.html, /https:\/\/northwind\.example\//);
});

// --- The composer, on its own ---------------------------------------------------

test('every emitted field names the approved truth it came from', () => {
  const head = composeDocumentHead({ project: ACME });
  for (const field of head.fields) {
    assert.equal(field.status, 'derived');
    assert.ok(field.source, `${field.key} must name its source`);
    assert.ok(
      field.source.startsWith('manifest.project.') || field.source.startsWith('constant'),
      `${field.key} traces to "${field.source}", which is neither project truth nor a declared constant`,
    );
  }
});

test('a long primary goal is cut on a word boundary rather than mid-word', () => {
  const goal = `${'Chartered quantity surveying and construction cost consultancy '.repeat(4)}across Scotland.`;
  const head = composeDocumentHead({ project: { ...ACME, primaryGoal: goal } });
  const description = head.fields.find((field) => field.key === 'description');
  assert.ok(description.value.length <= 161, `${description.value.length} characters`);
  assert.ok(description.value.endsWith('…'));
  assert.ok(!/\s…$/.test(description.value), 'the ellipsis follows a word, not a space');
  assert.match(description.source, /truncated/);
});

test('a site URL that is not a real http address is not a site URL', () => {
  for (const value of ['not a url', 'javascript:alert(1)', 'ftp://example.com', '']) {
    const head = composeDocumentHead({ project: { ...ACME, siteUrl: value } });
    assert.ok(!head.fields.some((field) => field.key === 'canonical'), `"${value}" must not become a canonical address`);
    assert.ok(head.withheld.some((entry) => entry.key === 'canonical'));
  }
});

test('markup in project truth is escaped rather than emitted', () => {
  const head = composeDocumentHead({ project: { ...ACME, name: 'Bell & Mackay "Ltd" <b>' } });
  const rendered = renderDocumentHead(head);
  assert.ok(!rendered.includes('<b>'), 'a name is text, and text that closes a tag is an injection');
  assert.match(rendered, /Bell &amp; Mackay &quot;Ltd&quot; &lt;b&gt;/);
  // And it survives the round trip as the name it is.
  assert.equal(readDocument(`<html><head>${rendered}</head></html>`).title, 'Bell & Mackay "Ltd" <b>');
});

// --- Fail closed ----------------------------------------------------------------

test('a document with no markers is refused rather than silently left alone', () => {
  const head = composeDocumentHead({ project: ACME });
  assert.throws(
    () => applyDocumentHead('<!doctype html><html><head><title>Generated application</title></head></html>', head),
    /no .*markers/i,
    'silently doing nothing is how a placeholder reaches a built artifact while the generator reports success',
  );
});

test('substitution replaces the managed block and leaves the rest of the head alone', () => {
  const source = fs.readFileSync('templates/react-vite-neutral/files/index.html', 'utf8');
  const result = applyDocumentHead(source, composeDocumentHead({ project: ACME }));
  assert.ok(result.includes('<meta name="theme-color" content="#f5f5f2" />'), 'unmanaged head content is not the generator\'s to remove');
  assert.ok(result.includes('<meta charset="UTF-8" />'));
  assert.ok(result.includes('<div id="root"></div>'));
  assert.ok(!result.includes('Generated application'));
  assert.equal((result.match(new RegExp(HEAD_OPEN.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'g')) ?? []).length, 1, 'the block is replaced, not appended');
});
