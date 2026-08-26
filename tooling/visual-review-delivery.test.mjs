import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

/**
 * The evidence and the way to look at it have to agree.
 *
 * A visual candidate set that nobody can open is the expensive half of the job.
 * The acceptance run leaves ordinary factory state behind and `npm run
 * review:visual-candidates` points the ordinary Console at exactly that state;
 * if the two ever name different directories the reviewer is shown an empty
 * factory and concludes the run never happened. Nothing else would fail.
 */

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

function flag(command, name) {
  const parts = command.split(/\s+/);
  const index = parts.indexOf(`--${name}`);
  return index === -1 ? null : parts[index + 1] ?? null;
}

test('the review command opens the state the acceptance run leaves behind', () => {
  const source = fs.readFileSync('tooling/visual-candidate-acceptance.mjs', 'utf8');
  const declared = source.match(/const REVIEW_ROOT = '([^']+)'/);
  assert.ok(declared, 'the acceptance run has to name where it leaves its evidence');
  const root = declared[1];
  assert.equal(root.startsWith('.tmp'), false, 'evidence a reviewer needs does not live in build scratch');

  const command = packageJson.scripts['review:visual-candidates'];
  assert.ok(command, 'there is one command that opens the review surface');
  assert.equal(flag(command, 'state-root'), `${root}/service`);
  assert.equal(flag(command, 'workspaces-root'), `${root}/workspaces`);
});

test('the acceptance run writes its factory state where it says it does', () => {
  const source = fs.readFileSync('tooling/visual-candidate-acceptance.mjs', 'utf8');
  assert.match(source, /const stateRoot = path\.join\(root, 'service'\)/);
  assert.match(source, /const workspacesRoot = path\.join\(root, 'workspaces'\)/);
  assert.match(source, /new FactoryStore\(\{ stateRoot \}\)/);
});

test('pointing the stack at a factory state that is not there says so', () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'review-')), 'never-ran');
  const result = spawnSync(process.execPath, ['tooling/dev-stack.mjs', '--state-root', missing], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No factory state at/);
  // Booting an empty factory instead is the failure worth preventing: it looks
  // like a run that produced nothing rather than a path that is wrong.
  assert.equal(fs.existsSync(missing), false);
});
