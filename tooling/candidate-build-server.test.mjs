import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveBuildDocument, serveCandidateBuild } from '../apps/service/src/visual-candidates.js';

/**
 * What the evidence server hands a browser for an address.
 *
 * This is the defect the first independent visual review found and could not
 * name: every nbm route was photographed as the home page. The composition was
 * right and the browser went to the right URL — `location.pathname` really was
 * `/services` — but the candidate builds prerender to `services/index.html`,
 * and the server only served a path that was itself a file. Every multi-document
 * route resolved to a directory and fell through to the shell.
 *
 * These tests are about document resolution rather than about a business: a
 * prerendered build must get its own document per route, and a single-document
 * SPA must keep the shell fallback its client router needs.
 */

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-candidate-server-'));
  for (const [file, contents] of Object.entries(files)) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

const PRERENDERED = {
  'index.html': '<main data-page-id="page-home">home</main>',
  'services/index.html': '<main data-page-id="page-services">services</main>',
  'about/index.html': '<main data-page-id="page-about">about</main>',
  '404.html': '<main data-page-id="page-not-found">not found</main>',
  '_astro/site.css': 'body{color:#000}',
};

const SPA = {
  'index.html': '<div id="root"></div>',
  'assets/app.js': 'console.log(1)',
};

test('a prerendered route resolves to its own document rather than the shell', () => {
  const root = fixture(PRERENDERED);
  assert.equal(resolveBuildDocument(root, '/'), path.join(root, 'index.html'));
  assert.equal(resolveBuildDocument(root, '/services'), path.join(root, 'services/index.html'));
  assert.equal(resolveBuildDocument(root, '/about'), path.join(root, 'about/index.html'));
  // Addressed without its extension, which is how a composition names /404.
  assert.equal(resolveBuildDocument(root, '/404'), path.join(root, '404.html'));
  assert.equal(resolveBuildDocument(root, '/_astro/site.css'), path.join(root, '_astro/site.css'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('an address with no document resolves to nothing, so a SPA keeps its shell fallback', () => {
  const root = fixture(SPA);
  assert.equal(resolveBuildDocument(root, '/services'), null);
  assert.equal(resolveBuildDocument(root, '/assets/app.js'), path.join(root, 'assets/app.js'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('an address that climbs out of the build is refused', () => {
  const root = fixture(PRERENDERED);
  assert.equal(resolveBuildDocument(root, '/../../etc/passwd'), null);
  assert.equal(resolveBuildDocument(root, '/%2e%2e/%2e%2e/etc/passwd'), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the server serves a distinct document per prerendered route', async () => {
  const root = fixture(PRERENDERED);
  const server = await serveCandidateBuild(root);
  try {
    const read = async (route) => {
      const response = await fetch(new URL(route.replace(/^\/+/, ''), server.url));
      return { status: response.status, type: response.headers.get('content-type'), body: await response.text() };
    };
    const home = await read('/');
    const services = await read('/services');
    const notFound = await read('/404');

    assert.equal(home.status, 200);
    assert.match(home.body, /page-home/);
    assert.match(services.body, /page-services/, 'a prerendered route must not be answered with the home document');
    assert.match(notFound.body, /page-not-found/);
    assert.notEqual(home.body, services.body);
    assert.match(services.type, /text\/html/);

    // Six routes photographed as one page is what this prevents; the documents
    // themselves have to differ before any screenshot can.
    const bodies = new Set([home.body, services.body, (await read('/about')).body, notFound.body]);
    assert.equal(bodies.size, 4);

    const asset = await read('/_astro/site.css');
    assert.match(asset.type, /text\/css/);
  } finally {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an unknown address still falls back to the shell for a client-side router', async () => {
  const root = fixture(SPA);
  const server = await serveCandidateBuild(root);
  try {
    const response = await fetch(new URL('deep/link', server.url));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="root"/);
  } finally {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * The capture's own identity assertion, independent of any server.
 *
 * The document resolution above is the root cause; this is the invariant that
 * makes the same class of defect impossible to publish next time, whatever
 * causes it.
 */
function browserFor(renderedPageId) {
  const page = {
    goto: async () => undefined,
    locator: () => ({
      waitFor: async () => undefined,
      getAttribute: async () => renderedPageId,
    }),
    evaluate: async () => undefined,
    waitForFunction: async () => undefined,
    screenshot: async () => Buffer.from('png-bytes'),
  };
  return {
    newContext: async () => ({ newPage: async () => page, close: async () => undefined }),
    close: async () => undefined,
  };
}

const IDENTITY_PLAN = {
  viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }],
  captures: [{
    id: 'page-services--desktop--viewport--desktop',
    pageId: 'page-services',
    route: '/services',
    viewport: 'desktop',
    state: { axis: 'viewport', state: 'desktop', risk: 'low', interaction: null, proves: 'How /services renders.' },
    elementRefs: [],
  }],
  uncovered: [],
};

test('a capture whose rendered page is the page it asked for becomes evidence', async () => {
  const { captureEvidence } = await import('./lib/rendered-evidence-capture.mjs');
  const { results, failures } = await captureEvidence({
    plan: IDENTITY_PLAN,
    baseUrl: 'http://127.0.0.1:1/',
    launch: async () => browserFor('page-services'),
  });
  assert.deepEqual(failures, []);
  assert.equal(results.length, 1);
});

test('a capture that photographs a different page than it asked for is a failure, not evidence', async () => {
  const { captureEvidence } = await import('./lib/rendered-evidence-capture.mjs');
  const { results, failures } = await captureEvidence({
    plan: IDENTITY_PLAN,
    baseUrl: 'http://127.0.0.1:1/',
    launch: async () => browserFor('page-home'),
  });
  assert.deepEqual(results, [], 'the wrong page must not produce bytes');
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /asked for \/services and photographed page page-home/);
});

test('a page that does not identify itself cannot be published as a route capture', async () => {
  const { captureEvidence } = await import('./lib/rendered-evidence-capture.mjs');
  const { results, failures } = await captureEvidence({
    plan: IDENTITY_PLAN,
    baseUrl: 'http://127.0.0.1:1/',
    launch: async () => browserFor(null),
  });
  assert.deepEqual(results, []);
  assert.match(failures[0].message, /does not identify itself/);
});
