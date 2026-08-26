import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Reconcile a managed file someone edited with a newer version of it.
 *
 * Until now an upgrade whose managed files had been touched went to
 * `review-required` and stopped. That is fail-closed and correct, and it also
 * means the first person to fix a typo in a generated file could never take an
 * upgrade again — the recipe system's whole point, quietly lost to one edit.
 *
 * A three-way merge is the ordinary answer, and it needs three inputs the
 * factory has not had all of. `base` is the bytes the recipe installed;
 * `ours` is what the project has now; `theirs` is the new recipe version. The
 * missing one was `base`, because installation recorded a hash and the factory's
 * own copy of an old recipe version is gone once the recipe moves on. So
 * `recordRecipeInstallations` now keeps the installed bytes beside the hash,
 * and this is what uses them.
 *
 * `git merge-file` does the merge rather than a hand-written diff3. It is the
 * implementation every developer's own tooling already agrees with, its conflict
 * markers are the ones they can read, and a merge algorithm is not a thing to
 * write twice.
 *
 * A conflict is not a failure of this function. It is the answer: two changes
 * to the same lines need a person, and saying so with the hunks named is more
 * useful than either overwriting an edit or refusing every upgrade.
 */

export const MERGE_RESULTS = Object.freeze(['unchanged', 'clean', 'conflicted', 'unavailable']);

function gitAvailable() {
  return spawnSync('git', ['--version'], { stdio: 'ignore', shell: false }).status === 0;
}

/**
 * @returns {{result: 'unchanged'|'clean'|'conflicted'|'unavailable', merged: string|null, conflicts: number, detail: string}}
 */
export function mergeManagedFile({ base, ours, theirs, label = 'managed file' } = {}) {
  if (typeof base !== 'string' || typeof ours !== 'string' || typeof theirs !== 'string') {
    return { result: 'unavailable', merged: null, conflicts: 0, detail: 'A three-way merge needs the installed bytes, the project\'s bytes and the target\'s bytes. One of them is missing.' };
  }
  if (ours === theirs) return { result: 'unchanged', merged: ours, conflicts: 0, detail: 'The project already holds the target version of this file.' };
  if (ours === base) return { result: 'clean', merged: theirs, conflicts: 0, detail: 'Nobody edited this file, so the target version replaces it outright.' };
  if (base === theirs) return { result: 'unchanged', merged: ours, conflicts: 0, detail: 'The target does not change this file, so the project\'s own edit stands.' };

  if (!gitAvailable()) {
    return { result: 'unavailable', merged: null, conflicts: 0, detail: 'git is not callable here, so the merge cannot be attempted. The upgrade stays under review rather than guessing.' };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-merge-'));
  try {
    const files = { base: path.join(dir, 'base'), ours: path.join(dir, 'ours'), theirs: path.join(dir, 'theirs') };
    fs.writeFileSync(files.base, base);
    fs.writeFileSync(files.ours, ours);
    fs.writeFileSync(files.theirs, theirs);

    // `-p` writes to stdout and leaves the inputs alone: nothing is merged into
    // the project here. Planning an upgrade must not edit the project it is
    // planning for.
    const run = spawnSync('git', ['merge-file', '-p', '--diff3', '-L', 'project', '-L', 'installed', '-L', label, files.ours, files.base, files.theirs], { encoding: 'utf8' });
    if (run.status === null || run.status < 0) {
      return { result: 'unavailable', merged: null, conflicts: 0, detail: `git merge-file did not run: ${run.error?.message ?? 'unknown error'}` };
    }
    // git merge-file exits with the number of conflicts, or a negative value on error.
    const conflicts = run.status;
    if (conflicts === 0) {
      return { result: 'clean', merged: run.stdout, conflicts: 0, detail: 'The project\'s edit and the target\'s change touch different lines, so both survive.' };
    }
    return {
      result: 'conflicted',
      merged: run.stdout,
      conflicts,
      detail: `${conflicts} conflict${conflicts === 1 ? '' : 's'}: the project's edit and the target's change touch the same lines. A person decides, and the merged text below carries the usual markers.`,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
