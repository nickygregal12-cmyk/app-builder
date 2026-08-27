import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintScopeIsReal, parseTestSummary, testsWereExecuted } from './lib/generated-gate-vacuity.mjs';

/**
 * The generated-app lint gate was green for a while because it was linting zero files. These are the
 * checks that would have caught that, and the fixtures that prove they still would — a vacuity check
 * that has only ever seen a healthy project is precisely the thing it exists to prevent.
 */

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-vacuity-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

const PASSING_RUN = ['# tests 4', '# suites 0', '# pass 4', '# fail 0', '# cancelled 0', '# skipped 0'].join('\n');
const EMPTY_RUN = ['# tests 0', '# suites 0', '# pass 0', '# fail 0', '# cancelled 0', '# skipped 0'].join('\n');

test('a run that executed tests is accepted', () => {
  const verdict = testsWereExecuted(PASSING_RUN);
  assert.equal(verdict.ok, true, verdict.reason);
  assert.deepEqual(parseTestSummary(PASSING_RUN), { tests: 4, pass: 4, fail: 0 });
});

test('a run that executed nothing is refused, even though it exited zero', () => {
  // The whole point. `node --test tooling/*.test.mjs` against a directory with no test files exits
  // 0 and reports `# tests 0`, so a generated project that stopped shipping its project test would
  // still report a passing check.
  const verdict = testsWereExecuted(EMPTY_RUN);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /zero tests/);
});

test('a run that reported nothing at all is refused rather than assumed fine', () => {
  for (const output of ['', 'some unrelated output', undefined]) {
    const verdict = testsWereExecuted(output);
    assert.equal(verdict.ok, false, JSON.stringify(output));
    assert.match(verdict.reason, /no TAP summary/);
  }
});

test('a run with failures is refused', () => {
  const verdict = testsWereExecuted(PASSING_RUN.replace('# fail 0', '# fail 1'));
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /1 test\(s\) failed/);
});

test('a lint script whose paths hold real files is accepted', () => {
  const root = fixture({ 'src/main.tsx': 'export const App = () => null;\n', 'tooling/generate.mjs': 'export const x = 1;\n', 'vite.config.ts': 'export default {};\n' });
  const verdict = lintScopeIsReal(root, 'oxlint src tooling vite.config.ts --deny-warnings');
  assert.equal(verdict.ok, true, verdict.reason);
  assert.deepEqual(verdict.paths.map((entry) => entry.files), [1, 1, 1]);
});

test('a lint script pointed at an empty directory is refused', () => {
  const root = fixture({ 'src/README.md': '# not lintable\n', 'tooling/.keep': '' });
  const verdict = lintScopeIsReal(root, 'oxlint src tooling --deny-warnings');
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /no lintable files in them: src, tooling/);
});

test('one empty path among populated ones is still refused', () => {
  // The shape the original defect took, one directory at a time: the total stays positive while
  // half the scope quietly disappears.
  const root = fixture({ 'src/main.tsx': 'export const App = () => null;\n', 'tooling/README.md': '# no scripts here\n' });
  const verdict = lintScopeIsReal(root, 'oxlint src tooling --deny-warnings');
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /no lintable files in them: tooling/);
  assert.deepEqual(verdict.paths.map((entry) => entry.files), [1, 0]);
});

test('a lint script pointed at a directory that is not there is refused', () => {
  const root = fixture({ 'src/main.tsx': 'export const App = () => null;\n' });
  const verdict = lintScopeIsReal(root, 'oxlint src tooling vite.config.ts --deny-warnings');
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /do not exist: tooling, vite\.config\.ts/);
});

test('a lint script that names no paths at all is refused', () => {
  // Whatever such a script lints is the linter's default, which is a decision nobody in the
  // generated repository made and which changes when the linter does.
  const root = fixture({ 'src/main.tsx': 'export const App = () => null;\n' });
  assert.equal(lintScopeIsReal(root, 'oxlint --deny-warnings').ok, false);
  assert.equal(lintScopeIsReal(root, '').ok, false);
  assert.equal(lintScopeIsReal(root, undefined).ok, false);
});

test('node_modules and dotted directories do not make an empty scope look populated', () => {
  const root = fixture({
    'src/node_modules/react/index.js': 'module.exports = {};\n',
    'src/.cache/thing.js': 'module.exports = {};\n',
  });
  const verdict = lintScopeIsReal(root, 'oxlint src --deny-warnings');
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /no lintable files in them: src/);
});

test('the canonical generated apps, when present, carry a real lint scope', () => {
  // Runs against whatever `npm run generate:acceptance` last produced. It is skipped rather than
  // failed when nothing has been generated, because this asserts a property of generated output and
  // there is none to assert against — the benchmark is where the gate is enforced.
  const roots = fs.existsSync('.tmp')
    ? fs.readdirSync('.tmp').filter((name) => name.startsWith('generated-acceptance-')).map((name) => path.join('.tmp', name))
    : [];
  for (const root of roots) {
    const manifest = path.join(root, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const scripts = JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts ?? {};
    const verdict = lintScopeIsReal(root, scripts.lint);
    assert.equal(verdict.ok, true, `${root}: ${verdict.reason}`);
  }
});
