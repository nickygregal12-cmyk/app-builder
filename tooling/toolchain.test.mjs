/**
 * The build toolchain is declared exactly, in one place, and the declaration is
 * the thing every consumer reads.
 *
 * The defect this closes is the same shape as the lockfile one, one layer down.
 * The lockfile pins the dependency graph; the toolchain pins the program that
 * resolves it. Root `engines` said `node >=22.13` and every workflow said
 * `node-version: 22`, which resolves to a different patch — and a different
 * bundled npm — depending on the day the job ran. Two builds of one source tree
 * could therefore differ, and nothing recorded which one produced the output
 * somebody reviewed.
 *
 * So the rules below are mostly about drift between copies of the version. A
 * declaration that lives in four files is a declaration that will disagree with
 * itself, and the disagreement is invisible until a build is not reproducible.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertBuildableToolchain,
  declaredToolchain,
  describeToolchain,
  readToolchainRegistry,
  runningToolchain,
  toolchainMatches,
} from './lib/toolchain.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8');

test('the declaration is one exact pair, not a range', () => {
  const declared = declaredToolchain();
  assert.match(declared.node, /^\d+\.\d+\.\d+$/, 'the declared Node version must be exact');
  assert.match(declared.npm, /^\d+\.\d+\.\d+$/, 'the declared npm version must be exact');
  assert.ok(readToolchainRegistry().why.length > 0, 'the declaration says why this pair');
});

test('.nvmrc carries the declared Node version and nothing else', () => {
  assert.equal(read('.nvmrc').trim(), declaredToolchain().node);
});

test('the root manifest freezes the package manager at the declared npm', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.packageManager, `npm@${declaredToolchain().npm}`);
});

test('no workflow hard-codes a Node version beside the declaration', () => {
  const directory = path.join(REPOSITORY_ROOT, '.github/workflows');
  const workflows = fs.readdirSync(directory)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .map((entry) => ({ name: entry, text: fs.readFileSync(path.join(directory, entry), 'utf8') }));
  assert.ok(workflows.length > 0, 'no workflows were found, so this rule is checking nothing');

  // `node-version: 22` is the exact shape of the defect: it looks pinned and
  // floats. A second copy of the full version would not float, but it would
  // drift, which is the same failure discovered later.
  const offenders = workflows.flatMap((workflow) => workflow.text.split('\n')
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.startsWith('node-version:'))
    .map(({ line, index }) => `${workflow.name}:${index + 1} ${line}`));
  assert.deepEqual(offenders, [], 'a workflow states a Node version instead of reading .nvmrc');

  const readers = workflows.flatMap((workflow) => workflow.text.split('\n')
    .filter((line) => /^node-version-file:\s*\.nvmrc$/.test(line.trim())));
  assert.ok(readers.length > 0, 'no workflow resolves Node from .nvmrc, so this rule is checking nothing');
});

test('a matching toolchain is supported and an off-by-one patch is not', () => {
  const declared = declaredToolchain();
  assert.equal(toolchainMatches(declared), true);
  assert.equal(toolchainMatches({ node: `v${declared.node}`, npm: declared.npm }), true, 'a leading v is formatting, not a different version');

  for (const actual of [
    { node: '22.22.2', npm: declared.npm },
    { node: declared.node, npm: '10.9.7' },
    { node: '24.0.0', npm: '11.0.0' },
    { node: declared.node, npm: null },
    {},
  ]) {
    assert.equal(toolchainMatches(actual), false, `${JSON.stringify(actual)} must not be treated as the declared pair`);
  }
});

test('an unsupported toolchain is described honestly rather than quietly downgraded', () => {
  const declared = declaredToolchain();
  const position = describeToolchain({ node: '22.22.2', npm: '10.9.7' }, declared);
  assert.equal(position.supported, false);
  assert.deepEqual(position.mismatched, [`node 22.22.2 (declared ${declared.node})`, `npm 10.9.7 (declared ${declared.npm})`]);
  assert.match(position.summary, /can generate, verify, preview and export/);
  assert.match(position.summary, /cannot record a reproducible build identity/);

  const unknownNpm = describeToolchain({ node: declared.node, npm: null }, declared);
  assert.equal(unknownNpm.supported, false);
  assert.match(unknownNpm.summary, /npm unknown/, 'an npm that could not be asked is unknown, not assumed to be the declared one');
});

test('the refusal happens where the claim is made, and only there', () => {
  const declared = declaredToolchain();
  assert.doesNotThrow(() => assertBuildableToolchain(declared, declared));
  assert.throws(
    () => assertBuildableToolchain({ node: '22.22.2', npm: '10.9.7' }, declared),
    /A reproducible build identity requires the declared toolchain/,
  );
  // Describing is not refusing: every other lane keeps working on a host that
  // is standing somewhere else.
  assert.doesNotThrow(() => describeToolchain({ node: '20.0.0', npm: '9.0.0' }, declared));
});

test('the running toolchain is asked of npm rather than assumed from the Node release', () => {
  const running = runningToolchain({ npmVersion: '10.9.8\n' });
  assert.equal(running.npm, '10.9.8');
  assert.equal(running.node, process.versions.node);
});
