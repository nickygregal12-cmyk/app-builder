/**
 * The root dependency graph is reproducible, and stays that way.
 *
 * The defect this closes was quiet: `package-lock.json` was gitignored and CI
 * ran `npm install`, so every install re-resolved the tree from ranges. The
 * tree a contributor tested was not the tree CI installed, and neither was the
 * tree the next contributor got. It cost this programme a cycle once already —
 * a pull request passed `npm run check` locally against `oxlint@1.71` and
 * failed hosted CI on a rule added in `1.80`, same declared dependency,
 * different resolved version.
 *
 * A lockfile committed today fixes that once. These rules are what stop it
 * coming back, because every way it comes back is a one-line edit somebody
 * makes for a good reason: re-adding the ignore rule to quieten a diff,
 * switching a job back to `npm install` to work around a lockfile conflict, or
 * adding a workspace whose dependencies nothing locks.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));

const WORKFLOW_DIRECTORY = path.join(REPOSITORY_ROOT, '.github/workflows');
const workflows = fs.readdirSync(WORKFLOW_DIRECTORY)
  .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
  .map((entry) => ({ name: entry, text: fs.readFileSync(path.join(WORKFLOW_DIRECTORY, entry), 'utf8') }));

test('the root lockfile is tracked rather than ignored', () => {
  assert.ok(fs.existsSync(path.join(REPOSITORY_ROOT, 'package-lock.json')), 'the root lockfile is missing');

  // An ignore rule is how the lockfile disappeared the first time, and a
  // re-added one is invisible in a green run: the file stays on the author's
  // disk and never reaches the checkout CI installs from.
  const ignored = read('.gitignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => line.replace(/^\/+/, '').replace(/\/+$/, '') === 'package-lock.json');
  assert.deepEqual(ignored, [], '.gitignore excludes the root lockfile, so a fresh checkout cannot reproduce the tree');
});

test('the lockfile locks every workspace the root manifest declares', () => {
  const manifest = readJson('package.json');
  const lock = readJson('package-lock.json');

  // A workspace absent from the lockfile installs from ranges while everything
  // around it is pinned — the original defect surviving inside one directory.
  const locked = new Set(Object.keys(lock.packages ?? {}));
  const declared = (manifest.workspaces ?? []).flatMap((pattern) => {
    const parent = pattern.endsWith('/*') ? pattern.slice(0, -2) : null;
    if (!parent) return [pattern];
    const directory = path.join(REPOSITORY_ROOT, parent);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
      .filter((entry) => fs.existsSync(path.join(directory, entry, 'package.json')))
      .map((entry) => `${parent}/${entry}`);
  });

  assert.ok(declared.length > 0, 'no workspaces were found, so this rule is checking nothing');
  for (const workspace of declared) {
    assert.ok(locked.has(workspace), `${workspace} is a declared workspace the root lockfile does not lock`);
  }
});

test('every workflow installs the root dependencies reproducibly', () => {
  // Read the text rather than parsed YAML: the thing being checked *is* the
  // command line, and `npm install` reintroduces the defect whatever shape the
  // step around it has.
  const offenders = [];
  for (const workflow of workflows) {
    for (const [index, line] of workflow.text.split('\n').entries()) {
      const command = line.trim();
      if (command.startsWith('#')) continue;
      // Generated applications are installed inside their own directories by
      // the acceptance scripts and carry no lockfile of ours; this rule is
      // about the root install step, which is the one that runs bare.
      if (/^-?\s*run:\s*npm install\b/.test(command)) offenders.push(`${workflow.name}:${index + 1} ${command}`);
    }
  }
  assert.deepEqual(offenders, [], 'a workflow installs the root dependencies with npm install, which re-resolves the graph the lockfile pins');

  const rootInstalls = workflows.flatMap((workflow) => workflow.text.split('\n')
    .filter((line) => /^-?\s*run:\s*npm ci\b/.test(line.trim()))
    .map((line) => `${workflow.name}: ${line.trim()}`));
  assert.ok(rootInstalls.length > 0, 'no workflow installs the root dependencies at all, so this rule is checking nothing');
});
