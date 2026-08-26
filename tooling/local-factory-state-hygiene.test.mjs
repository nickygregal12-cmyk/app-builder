import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('machine-local .app-builder state is never tracked by git', () => {
  const result = spawnSync('git', ['ls-files', '--', '.app-builder'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'git ls-files failed');
  assert.equal(
    result.stdout.trim(),
    '',
    `Machine-local Factory state must not be repository truth. Remove tracked .app-builder entries:\n${result.stdout.trim()}`,
  );
});
