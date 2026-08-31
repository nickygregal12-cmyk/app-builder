/**
 * Candidate portability, held to the claim it makes.
 *
 * The failure this guards against is a review that costs money and answers
 * nothing. A reviewer judging a candidate is judging a repository, and a
 * screenshot is silent about whether that repository installs, checks, builds,
 * emits anything, or can live outside the factory that made it. Every one of
 * those was previously either unproven before the review or proven and not
 * written down, which are the same thing to the person reading the packet.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertPortableForReview,
  buildPortabilityRecord,
  inspectFactoryIndependence,
  inspectRenderer,
  inspectShippingArtifact,
  summarisePortability,
} from './lib/candidate-portability.mjs';

/** A workspace on disk, because these functions answer questions about files. */
function workspace({ manifest = {}, dist = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-portability-'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'generated-site', ...manifest }));
  for (const [file, contents] of Object.entries(dist)) {
    const target = path.join(root, 'dist', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

const SHIPPED = { 'index.html': '<!doctype html><title>Site</title>', 'assets/app.js': 'console.log(1)' };

test('a repository that depends on the factory cannot be handed to anybody', () => {
  const factoryScoped = inspectFactoryIndependence(workspace({
    manifest: { dependencies: { react: '^19.0.0', '@app-builder/composition': '^1.0.0' } },
  }));
  assert.equal(factoryScoped.ok, false);
  assert.deepEqual(factoryScoped.offenders, ['@app-builder/composition@^1.0.0']);

  const ordinary = inspectFactoryIndependence(workspace({ manifest: { dependencies: { react: '^19.0.0' } } }));
  assert.equal(ordinary.ok, true);
});

test('a dependency resolved through this filesystem is the same defect under another name', () => {
  // It installs here and nowhere else, which is exactly what the factory-scope
  // rule exists to prevent — so a `file:` specifier must not slip past it.
  for (const range of ['file:../factory', 'link:../../packages/composition', 'portal:../x']) {
    const result = inspectFactoryIndependence(workspace({ manifest: { dependencies: { shared: range } } }));
    assert.equal(result.ok, false, `${range} should not be portable`);
    assert.deepEqual(result.offenders, [`shared@${range}`]);
  }
});

test('a devDependency on the factory counts, because a check that needs the factory is not portable either', () => {
  const result = inspectFactoryIndependence(workspace({ manifest: { devDependencies: { '@app-builder/contracts': '^1.0.0' } } }));
  assert.equal(result.ok, false);
});

test('a build that exits zero and ships nothing has not shipped', () => {
  const empty = inspectShippingArtifact(workspace());
  assert.equal(empty.ok, false);
  assert.equal(empty.fileCount, 0);
  assert.match(empty.shortfalls[0], /no files/);

  // Files but no shell: nothing can serve the site, and the candidate would be
  // photographed as a blank page with nothing saying why.
  const headless = inspectShippingArtifact(workspace({ dist: { 'assets/app.js': 'x' } }));
  assert.equal(headless.ok, false);
  assert.match(headless.shortfalls[0], /no dist\/index\.html/);
});

test('a real artifact is measured rather than merely confirmed', () => {
  const artifact = inspectShippingArtifact(workspace({ dist: { ...SHIPPED, 'about/index.html': '<!doctype html>' } }));
  assert.equal(artifact.ok, true);
  assert.equal(artifact.hasShell, true);
  assert.equal(artifact.fileCount, 3);
  // Prerendered documents counted separately: a build claiming several routes
  // that emitted one shell is the defect a whole review once spent itself on.
  assert.equal(artifact.documentCount, 2);
  assert.ok(artifact.totalBytes > 0);
});

test('a candidate that switched renderer is not a variant of the product', () => {
  assert.equal(inspectRenderer('application', 'application').ok, true);
  const switched = inspectRenderer('static', 'application');
  assert.equal(switched.ok, false);
  assert.match(switched.detail, /presentation, not the renderer/);
  // Nothing to compare against is not a failure — it is the honest state for a
  // set whose canonical renderer was never declared.
  assert.equal(inspectRenderer('application', null).ok, true);
});

test('a record says which candidate paid for the install and which inherited it', () => {
  const shared = buildPortabilityRecord({
    candidateId: 'candidate-b',
    workspace: workspace({ dist: SHIPPED }),
    installMode: 'shared-from-sibling',
    installedFrom: 'candidate-a',
    steps: [{ command: 'npm run check', ok: true }, { command: 'npm run build', ok: true }],
  });
  assert.equal(shared.portable, true);
  assert.equal(shared.install.mode, 'shared-from-sibling');
  assert.match(shared.install.detail, /byte-identical/);

  const clean = buildPortabilityRecord({
    candidateId: 'candidate-a',
    workspace: workspace({ dist: SHIPPED }),
    installMode: 'clean',
    steps: [],
  });
  assert.match(clean.install.detail, /its own package\.json/);
});

test('a record names every shortfall at once rather than the first one', () => {
  const record = buildPortabilityRecord({
    candidateId: 'candidate-broken',
    workspace: workspace({ manifest: { dependencies: { '@app-builder/composition': '^1.0.0' } } }),
    installMode: 'clean',
    steps: [{ command: 'npm run check', ok: false }],
    renderer: 'static',
    expectedRenderer: 'application',
  });
  assert.equal(record.portable, false);
  // A failed script, a factory dependency, an empty artifact and a switched
  // renderer — one run should report all four, not send someone round again.
  assert.equal(record.shortfalls.length, 4);
});

test('an unbuildable candidate never reaches a review', () => {
  const good = buildPortabilityRecord({ candidateId: 'ok', workspace: workspace({ dist: SHIPPED }), installMode: 'clean' });
  const bad = buildPortabilityRecord({ candidateId: 'broken', workspace: workspace(), installMode: 'clean' });

  assert.deepEqual(assertPortableForReview([good]), [good]);
  assert.throws(() => assertPortableForReview([good, bad]), (error) => {
    // The refusal has to name the candidate and the reason, or whoever reads it
    // has to reproduce the run to find out what happened.
    assert.match(error.message, /1 of 2/);
    assert.match(error.message, /broken/);
    assert.match(error.message, /no files/);
    return true;
  });
});

test('a set is only reviewable when every candidate in it is', () => {
  const good = buildPortabilityRecord({ candidateId: 'a', workspace: workspace({ dist: SHIPPED }), installMode: 'clean' });
  const bad = buildPortabilityRecord({ candidateId: 'b', workspace: workspace(), installMode: 'shared-from-sibling', installedFrom: 'a' });

  const whole = summarisePortability([good, bad]);
  assert.equal(whole.allPortable, false, 'a comparison across three candidates of which one cannot build is not a comparison');
  assert.equal(whole.portable, 1);
  assert.equal(whole.total, 2);
  assert.equal(whole.cleanInstalls, 1);
  assert.ok(whole.shortfalls[0].startsWith('b: '), 'a set-level shortfall must say which candidate it belongs to');

  // An empty set is not portable by default. Nothing was proven, and a vacuous
  // pass reading as evidence is the failure mode this whole module exists for.
  assert.equal(summarisePortability([]).allPortable, false);
});
