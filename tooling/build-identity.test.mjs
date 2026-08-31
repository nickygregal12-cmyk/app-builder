/**
 * A build has an identity, and the identity is about the build rather than
 * about the run that produced it.
 *
 * The failure this closes is quiet in the same way the lockfile one was. A
 * verification that exits zero says a build succeeded; it does not say which
 * dependency graph was installed, which toolchain ran, or what came out. So two
 * verifications of one source tree could install two different graphs, produce
 * two different artifacts, and report the same success — and anything reviewing
 * the second artifact would be attaching its verdict to whichever one it
 * happened to be handed.
 *
 * The rules below are mostly about independence and sensitivity: the digests
 * must move when the thing they identify moves, and must not move when
 * something else does. A digest that is insensitive to a real change is worse
 * than no digest, because it is a reproducibility claim that cannot fail.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertLockUnmoved,
  buildOutputManifest,
  digestBytes,
  lockDigest,
  resolveLockfile,
  sourceDigest,
} from './lib/build-identity.mjs';

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-identity-'));
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

const BASE = {
  'package.json': '{"name":"x","version":"1.0.0"}\n',
  'src/main.ts': 'export const main = () => 1;\n',
  'src/styles.css': 'body { color: red; }\n',
};

test('the source digest is stable across runs and across untouched rebuilds', () => {
  const a = project(BASE);
  const b = project(BASE);
  assert.equal(sourceDigest(a), sourceDigest(b), 'two identical trees are one artifact');
  assert.equal(sourceDigest(a), sourceDigest(a), 'hashing twice is hashing once');
});

test('the source digest moves when the source moves, including a rename', () => {
  const before = sourceDigest(project(BASE));
  assert.notEqual(before, sourceDigest(project({ ...BASE, 'src/main.ts': 'export const main = () => 2;\n' })), 'a changed file is a changed artifact');
  assert.notEqual(before, sourceDigest(project({ ...BASE, 'src/extra.ts': 'export const extra = 1;\n' })), 'an added file is a changed artifact');

  // Hashing contents alone would miss this: the same bytes at a different path
  // is a different product, because a route moved.
  const { 'src/main.ts': moved, ...rest } = BASE;
  assert.notEqual(before, sourceDigest(project({ ...rest, 'src/entry.ts': moved })), 'a renamed file is a changed artifact');
});

test('the source digest ignores what the build leaves behind', () => {
  const root = project(BASE);
  const before = sourceDigest(root);
  fs.mkdirSync(path.join(root, 'node_modules/left-pad'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/left-pad/index.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html>\n');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, '.git/HEAD'), 'ref: refs/heads/main\n');
  assert.equal(sourceDigest(root), before, 'installing and building are not edits to the source');

  // The factory's record about the product is not the product. Verification
  // writes its output manifest here after hashing the source, so a repository
  // that included it would stop hashing to the digest identifying it the moment
  // it was verified.
  fs.mkdirSync(path.join(root, '.app-builder'), { recursive: true });
  fs.writeFileSync(path.join(root, '.app-builder/output-manifest.json'), '{"digest":"anything"}\n');
  assert.equal(sourceDigest(root), before, 'the factory writing down what it built is not a change to what it built');
});

test('the lockfile is a separate identity from the source it locks', () => {
  const root = project(BASE);
  const before = sourceDigest(root);
  assert.equal(lockDigest(root), null, 'a project with no lockfile has no lock identity, rather than a default one');

  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');
  assert.equal(sourceDigest(root), before, 'a dependency-only change is not a source change');
  const locked = lockDigest(root);
  assert.match(locked, /^[0-9a-f]{64}$/);

  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"":{}}}\n');
  assert.notEqual(lockDigest(root), locked, 'a changed lockfile is a changed dependency graph');
});

test('an existing lockfile is never re-resolved', () => {
  const root = project({ ...BASE, 'package-lock.json': '{"lockfileVersion":3,"packages":{}}\n' });
  const before = lockDigest(root);
  const result = resolveLockfile(root, { npm: 'node-that-does-not-exist' });
  assert.equal(result.resolved, false, 'a pinned graph is not re-resolved, and re-resolving is how one quietly moves');
  assert.equal(result.digest, before);
});

test('a lockfile that moves during installation refuses rather than records', () => {
  const root = project({ ...BASE, 'package-lock.json': '{"lockfileVersion":3,"packages":{}}\n' });
  const resolved = lockDigest(root);
  assert.equal(assertLockUnmoved(root, resolved), resolved);

  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"":{"name":"x"}}}\n');
  assert.throws(() => assertLockUnmoved(root, resolved), /The graph that was installed is not the graph that was resolved/);

  fs.rmSync(path.join(root, 'package-lock.json'));
  assert.throws(() => assertLockUnmoved(root, resolved), /disappeared during installation/);
});

test('the output manifest identifies what was built, file by file', () => {
  const root = project(BASE);
  assert.throws(() => buildOutputManifest(path.join(root, 'dist')), /No build output/);

  fs.mkdirSync(path.join(root, 'dist/assets'), { recursive: true });
  assert.throws(() => buildOutputManifest(path.join(root, 'dist')), /produced nothing to release/);

  fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>a</title>\n');
  fs.writeFileSync(path.join(root, 'dist/assets/app.js'), 'console.log(1);\n');
  const manifest = buildOutputManifest(path.join(root, 'dist'));

  assert.deepEqual(manifest.files.map((file) => file.path), ['assets/app.js', 'index.html'], 'the file list is ordered, so two runs produce comparable manifests');
  assert.equal(manifest.files[1].sha256, digestBytes('<!doctype html><title>a</title>\n'));
  assert.equal(manifest.files[1].bytes, fs.statSync(path.join(root, 'dist/index.html')).size);
  assert.match(manifest.digest, /^[0-9a-f]{64}$/);

  const before = manifest.digest;
  fs.writeFileSync(path.join(root, 'dist/index.html'), '<!doctype html><title>b</title>\n');
  assert.notEqual(buildOutputManifest(path.join(root, 'dist')).digest, before, 'a different artifact has a different identity');
});

test('an identical build produces an identical output identity', () => {
  const files = { 'dist/index.html': '<!doctype html>\n', 'dist/assets/app.js': 'console.log(1);\n' };
  assert.equal(
    buildOutputManifest(path.join(project(files), 'dist')).digest,
    buildOutputManifest(path.join(project(files), 'dist')).digest,
  );
});
