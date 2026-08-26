import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { mergeManagedFile } from './lib/managed-file-merge.mjs';
import { MANAGED_BASELINE_ROOT, reconcileManagedFiles } from './lib/recipe-upgrades.mjs';

const BASE = 'one\ntwo\nthree\n';

test('a file nobody edited is replaced by the target outright', () => {
  const merge = mergeManagedFile({ base: BASE, ours: BASE, theirs: 'one\ntwo\nthree\nfour\n' });
  assert.equal(merge.result, 'clean');
  assert.equal(merge.merged, 'one\ntwo\nthree\nfour\n');
});

test('a target that does not change the file leaves the project\'s own edit standing', () => {
  const merge = mergeManagedFile({ base: BASE, ours: 'one\nEDITED\nthree\n', theirs: BASE });
  assert.equal(merge.result, 'unchanged');
  assert.equal(merge.merged, 'one\nEDITED\nthree\n');
});

/**
 * The case the whole thing exists for: until now, one edited managed file meant
 * this project could never take an upgrade again.
 */
test('an edit and a change on different lines both survive', () => {
  const merge = mergeManagedFile({ base: BASE, ours: 'one\nEDITED\nthree\n', theirs: 'one\ntwo\nthree\nfour\n' });
  assert.equal(merge.result, 'clean');
  assert.equal(merge.conflicts, 0);
  assert.equal(merge.merged, 'one\nEDITED\nthree\nfour\n', 'the project keeps its edit and gains the target\'s addition');
});

test('an edit and a change on the same lines conflict, and say where', () => {
  const merge = mergeManagedFile({ base: BASE, ours: 'one\nOURS\nthree\n', theirs: 'one\nTHEIRS\nthree\n', label: 'lead-generation 2.0.0' });
  assert.equal(merge.result, 'conflicted');
  assert.equal(merge.conflicts, 1);
  assert.match(merge.merged, /<<<<<<< project/);
  assert.match(merge.merged, /\|\|\|\|\|\|\| installed/, 'diff3 markers show what was installed, so a reviewer can see which side moved');
  assert.match(merge.merged, />>>>>>> lead-generation 2\.0\.0/);
  assert.match(merge.detail, /A person decides/);
});

test('a merge with a missing input is unavailable rather than guessed', () => {
  assert.equal(mergeManagedFile({ base: BASE, ours: null, theirs: BASE }).result, 'unavailable');
  assert.equal(mergeManagedFile({ base: undefined, ours: BASE, theirs: BASE }).result, 'unavailable');
});

// --- reconciliation over a project ----------------------------------------

function fixture({ baseline, current, target }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-reconcile-'));
  const projectDir = path.join(root, 'project');
  const recipeRoot = path.join(root, 'recipe');
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(recipeRoot, 'files/src'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, MANAGED_BASELINE_ROOT, 'demo/src'), { recursive: true });

  if (baseline !== null) fs.writeFileSync(path.join(projectDir, MANAGED_BASELINE_ROOT, 'demo/src/thing.ts'), baseline);
  if (current !== null) fs.writeFileSync(path.join(projectDir, 'src/thing.ts'), current);
  if (target !== null) fs.writeFileSync(path.join(recipeRoot, 'files/src/thing.ts'), target);

  return {
    root,
    projectDir,
    installation: { recipeId: 'demo', version: '1.0.0', managedFiles: [{ path: 'src/thing.ts', sha256: 'x' }] },
    definition: { root: recipeRoot, filesRoot: 'files', version: '2.0.0' },
  };
}

test('a project whose edits merge cleanly is reported as mergeable, and nothing is written to it', () => {
  const f = fixture({ baseline: BASE, current: 'one\nEDITED\nthree\n', target: 'one\ntwo\nthree\nfour\n' });
  try {
    const before = fs.readFileSync(path.join(f.projectDir, 'src/thing.ts'), 'utf8');
    const result = reconcileManagedFiles(f);
    assert.equal(result.mergeable, true);
    assert.equal(result.conflicts, 0);
    assert.equal(result.files[0].result, 'clean');
    assert.equal(result.files[0].merged, 'one\nEDITED\nthree\nfour\n');
    assert.equal(fs.readFileSync(path.join(f.projectDir, 'src/thing.ts'), 'utf8'), before, 'planning an upgrade must not edit the project it is planning for');
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('a conflict names the file and carries the markers for review', () => {
  const f = fixture({ baseline: BASE, current: 'one\nOURS\nthree\n', target: 'one\nTHEIRS\nthree\n' });
  try {
    const result = reconcileManagedFiles(f);
    assert.equal(result.mergeable, false);
    assert.deepEqual(result.conflictedFiles, ['src/thing.ts']);
    assert.equal(result.conflicts, 1);
    assert.equal(result.files[0].merged, null, 'a conflicted merge is not offered as a result to apply');
    assert.match(result.files[0].conflicted, /<<<<<<< project/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('a project generated before baselines were kept says so rather than merging against nothing', () => {
  const f = fixture({ baseline: null, current: 'one\nEDITED\nthree\n', target: 'one\ntwo\nthree\nfour\n' });
  try {
    const result = reconcileManagedFiles(f);
    assert.equal(result.mergeable, false);
    assert.deepEqual(result.unmergeableFiles, ['src/thing.ts']);
    assert.match(result.files[0].detail, /No installed baseline/);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});

test('a file the target dropped, or the project deleted, is a decision rather than a merge', () => {
  const dropped = fixture({ baseline: BASE, current: 'one\nEDITED\nthree\n', target: null });
  try {
    assert.match(reconcileManagedFiles(dropped).files[0].detail, /no longer ships this file/);
  } finally {
    fs.rmSync(dropped.root, { recursive: true, force: true });
  }

  const deleted = fixture({ baseline: BASE, current: null, target: BASE });
  try {
    assert.match(reconcileManagedFiles(deleted).files[0].detail, /no longer has this file/);
  } finally {
    fs.rmSync(deleted.root, { recursive: true, force: true });
  }
});
