/**
 * Evidence must depict what ships, and the cases here are the failures that
 * already happened rather than failures somebody imagined.
 *
 * The class has cost two independent reviews. #163 photographed six routes as
 * one document, which was fixed by asserting rendered identity. The static
 * renderer review reported "exposed generator metadata in the public footer",
 * and the critic was right about the picture and wrong about the product: the
 * strip renders under `import.meta.env.DEV` and exists in no built output.
 *
 * No assertion about a screenshot could have caught the second one. The missing
 * fact was never in the image — it was which artifact was serving. These cases
 * plant that: a dev-only marker that must not survive a build, a set claiming
 * one artifact while another was photographed, and a set reused across a
 * rebuild.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertEvidenceDepictsShipping,
  describeBuiltArtifact,
  describeDevServer,
  evidenceShippingRefusals,
  hashBuiltArtifact,
} from './lib/rendering-source.mjs';
import { buildEvidenceSet } from './lib/rendered-evidence.mjs';

function temporary(build) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-rendering-source-'));
  try {
    return build(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** A minimal built artifact: a document and an asset, as a real dist has. */
function writeDist(root, { marker = null, name = 'dist' } = {}) {
  const dist = path.join(root, name);
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html><html lang="en"><head><title>Northwind</title></head><body><div id="root"></div>${marker ?? ''}</body></html>`);
  fs.writeFileSync(path.join(dist, 'assets/app-a1b2c3.js'), 'console.log("built");\n');
  return dist;
}

const PLAN = {
  viewports: [{ name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 }],
  captures: [{
    id: 'home--desktop--viewport-desktop',
    pageId: 'home',
    route: '/',
    viewport: 'desktop',
    state: { axis: 'viewport', state: 'desktop', risk: 'low', interaction: null, proves: 'The home route renders at desktop width.' },
    elementRefs: [],
  }],
  uncovered: [],
};

function evidenceWith(renderingSource) {
  return buildEvidenceSet({
    plan: PLAN,
    results: [{ id: PLAN.captures[0].id, bytes: Buffer.from('not a real png, and this test is not about pixels') }],
    projectId: 'project-1',
    buildRef: '/workspace/northwind',
    compositionHash: 'a'.repeat(64),
    capturedAt: '2026-08-28T12:00:00.000Z',
    renderingSource,
  });
}

// --- The contract ---------------------------------------------------------------

test('evidence cannot be built without saying what was serving', () => {
  assert.throws(
    () => buildEvidenceSet({
      plan: PLAN,
      results: [{ id: PLAN.captures[0].id, bytes: Buffer.from('x') }],
      projectId: 'project-1',
      buildRef: '/workspace/northwind',
      compositionHash: 'a'.repeat(64),
      capturedAt: '2026-08-28T12:00:00.000Z',
    }),
    /what was serving/i,
    'a default here would be a guess, and one of the two available guesses is the defect',
  );
});

test('the rendering source is inside the set hash', () => {
  temporary((root) => {
    const dist = writeDist(root);
    const dev = evidenceWith(describeDevServer());
    const built = evidenceWith(describeBuiltArtifact({ workspace: root, dist }));
    assert.notEqual(dev.setHash, built.setHash, 'a set whose identity ignored what was serving could have it rewritten unnoticed');
  });
});

// --- Planted: the dev-only marker -----------------------------------------------

test('a development capture is refused as evidence about what ships', () => {
  // The exact shape of the static-renderer review failure: a marker that exists
  // only under a development server. Nothing about the picture is wrong; the
  // picture is of something nobody is served.
  const evidence = evidenceWith(describeDevServer());
  const refusals = evidenceShippingRefusals(evidence, { label: 'This set' });
  assert.equal(refusals.length, 1);
  assert.match(refusals[0], /development/);
  assert.equal(evidence.renderingSource.depictsShippingArtifact, false);
  assert.throws(() => assertEvidenceDepictsShipping(evidence), /development/);
});

test('a dev-only marker changes the artifact hash, so it cannot hide in one', () => {
  temporary((root) => {
    const clean = describeBuiltArtifact({ workspace: root, dist: writeDist(root, { name: 'clean' }) });
    const withMarker = describeBuiltArtifact({
      workspace: root,
      dist: writeDist(root, { name: 'dev-chrome', marker: '<div class="factory-meta">app-builder dev</div>' }),
    });
    assert.notEqual(clean.artifactHash, withMarker.artifactHash);
  });
});

// --- Planted: artifact mismatch --------------------------------------------------

test('capturing build A while claiming build B is refused', () => {
  temporary((root) => {
    const a = writeDist(root, { name: 'build-a' });
    const b = writeDist(root, { name: 'build-b', marker: '<!-- a later build -->' });
    // The set says it photographed A. B is what is actually there.
    const evidence = evidenceWith(describeBuiltArtifact({ workspace: root, dist: a }));
    const refusals = evidenceShippingRefusals(evidence, { dist: b, label: 'This set' });
    assert.equal(refusals.length, 1);
    assert.match(refusals[0], /changed after the captures were taken/);
    assert.throws(() => assertEvidenceDepictsShipping(evidence, { dist: b }));
  });
});

test('an unchanged artifact is not a mismatch', () => {
  temporary((root) => {
    const dist = writeDist(root);
    const evidence = evidenceWith(describeBuiltArtifact({ workspace: root, dist }));
    assert.deepEqual(evidenceShippingRefusals(evidence, { dist }), []);
    assert.equal(assertEvidenceDepictsShipping(evidence, { dist }).serverMode, 'built-artifact');
  });
});

// --- Planted: stale evidence reused across a rebuild -----------------------------

test('captures reused after a rebuild are refused', () => {
  temporary((root) => {
    const dist = writeDist(root);
    const evidence = evidenceWith(describeBuiltArtifact({ workspace: root, dist }));
    assert.deepEqual(evidenceShippingRefusals(evidence, { dist }), [], 'clean before the rebuild');

    // Change the source and rebuild into the same place, exactly as a second
    // build would. The pictures are still real; they are of the previous build.
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><html lang="en"><head><title>Northwind — rebuilt</title></head><body><div id="root"></div></body></html>');
    const refusals = evidenceShippingRefusals(evidence, { dist });
    assert.equal(refusals.length, 1);
    assert.match(refusals[0], /no longer here/);
  });
});

test('a renamed chunk is a different artifact even when every byte is accounted for', () => {
  temporary((root) => {
    const dist = writeDist(root);
    const before = hashBuiltArtifact(dist).artifactHash;
    fs.renameSync(path.join(dist, 'assets/app-a1b2c3.js'), path.join(dist, 'assets/app-d4e5f6.js'));
    assert.notEqual(hashBuiltArtifact(dist).artifactHash, before, 'hashing contents alone would call two different builds the same one');
  });
});

// --- Absence is a refusal, not a pass --------------------------------------------

test('evidence that records nothing about its source is refused, never assumed good', () => {
  const refusals = evidenceShippingRefusals({ id: 'evidence-0000000000000000' }, { label: 'Old evidence' });
  assert.equal(refusals.length, 1);
  assert.match(refusals[0], /does not record what was serving/);
});

test('an unknown server mode is refused rather than treated as one of the known ones', () => {
  const refusals = evidenceShippingRefusals({ renderingSource: { serverMode: 'production-ish', artifactHash: null } });
  assert.equal(refusals.length, 1);
  assert.match(refusals[0], /unknown server mode/);
});

test('a built-artifact claim with no hash has nothing to check and is refused', () => {
  const refusals = evidenceShippingRefusals({ renderingSource: { serverMode: 'built-artifact', artifactHash: null } });
  assert.ok(refusals.some((entry) => /records no hash/.test(entry)));
});

// --- Ordinary lifecycle is not tampering -----------------------------------------

test('an artifact that has been cleaned up is unverifiable, not a refusal', () => {
  temporary((root) => {
    const dist = writeDist(root);
    const evidence = evidenceWith(describeBuiltArtifact({ workspace: root, dist }));
    fs.rmSync(dist, { recursive: true, force: true });
    // A candidate workspace is removed once its set is decided. The binding
    // recorded in the set stands; re-verification is simply unavailable, and
    // calling ordinary cleanup tampering would train people to ignore this.
    assert.deepEqual(evidenceShippingRefusals(evidence, { dist }), []);
  });
});

// --- Determinism and portability ---------------------------------------------------

test('the same artifact hashes the same wherever it lives', () => {
  temporary((root) => {
    const first = writeDist(root, { name: 'one' });
    const second = writeDist(root, { name: 'two' });
    assert.equal(hashBuiltArtifact(first).artifactHash, hashBuiltArtifact(second).artifactHash);
  });
});

test('the artifact is recorded relative to the workspace, so a moved workspace still matches', () => {
  temporary((root) => {
    const source = describeBuiltArtifact({ workspace: root, dist: writeDist(root) });
    assert.equal(source.artifact, 'dist', 'an absolute path in evidence stops matching the first time a run happens elsewhere');
    assert.equal(source.fileCount, 2);
  });
});

test('an empty or missing artifact cannot be claimed', () => {
  temporary((root) => {
    assert.throws(() => hashBuiltArtifact(path.join(root, 'never-built')), /never produced/);
    fs.mkdirSync(path.join(root, 'empty'));
    assert.throws(() => hashBuiltArtifact(path.join(root, 'empty')), /nothing for evidence to depict/);
  });
});
