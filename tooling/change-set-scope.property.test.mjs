import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { createChangeSet, validateChangeSetResult } from '../packages/control-plane/src/index.js';

// Phase 3.8A follow-up. The ChangeSet path policy guards an autonomous mutation
// boundary, so the allow/deny/expected behaviour is asserted as properties over
// generated paths rather than only against the hand-written adversarial cases.

const segmentChar = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split(''));
const segment = fc.array(segmentChar, { minLength: 1, maxLength: 8 }).map((chars) => chars.join(''));
const repositoryPath = fc.array(segment, { minLength: 1, maxLength: 5 }).map((segments) => segments.join('/'));
const directoryPath = fc.array(segment, { minLength: 1, maxLength: 4 }).map((segments) => segments.join('/'));

function changeSetWith(overrides) {
  return createChangeSet({
    taskId: 'task-property',
    objective: 'Property-checked bounded mutation',
    acceptanceChecks: ['npm run check'],
    rollback: 'git restore .',
    allowedFiles: ['*'],
    ...overrides,
  });
}

test('directory scopes admit every descendant of the declared directory', () => {
  fc.assert(fc.property(directoryPath, repositoryPath, (directory, tail) => {
    const changeSet = changeSetWith({ allowedFiles: [`${directory}/**`] });
    const result = validateChangeSetResult(changeSet, [`${directory}/${tail}`, directory]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.outOfScope, []);
  }));
});

test('directory scopes never admit a sibling that merely shares a textual prefix', () => {
  fc.assert(fc.property(directoryPath, segment, repositoryPath, (directory, extra, tail) => {
    const sibling = `${directory}${extra}/${tail}`;
    const changeSet = changeSetWith({ allowedFiles: [`${directory}/**`] });
    const result = validateChangeSetResult(changeSet, [sibling]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.outOfScope, [sibling]);
  }));
});

test('trailing-separator scopes behave identically to directory scopes', () => {
  fc.assert(fc.property(directoryPath, segment, repositoryPath, (directory, extra, tail) => {
    const changeSet = changeSetWith({ allowedFiles: [`${directory}/`] });
    assert.equal(validateChangeSetResult(changeSet, [`${directory}/${tail}`]).ok, true);
    assert.equal(validateChangeSetResult(changeSet, [`${directory}${extra}/${tail}`]).ok, false);
  }));
});

test('exact file scopes admit only that file', () => {
  fc.assert(fc.property(repositoryPath, segment, (file, extra) => {
    const changeSet = changeSetWith({ allowedFiles: [file] });
    assert.equal(validateChangeSetResult(changeSet, [file]).ok, true);
    assert.equal(validateChangeSetResult(changeSet, [`${file}${extra}`]).ok, false);
    assert.equal(validateChangeSetResult(changeSet, [`${file}/${extra}`]).ok, false);
  }));
});

test('Windows separators are canonicalised to repository-relative paths', () => {
  fc.assert(fc.property(directoryPath, repositoryPath, (directory, tail) => {
    const changeSet = changeSetWith({ allowedFiles: [`${directory}/**`] });
    const result = validateChangeSetResult(changeSet, [`${directory}\\${tail}`.replaceAll('/', '\\')]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.invalidPaths, []);
  }));
});

test('traversal, absolute and ambiguous actual paths fail closed under any allow rule', () => {
  const unsafePath = fc.oneof(
    repositoryPath.map((value) => `../${value}`),
    repositoryPath.map((value) => `/${value}`),
    repositoryPath.map((value) => `//${value}`),
    repositoryPath.map((value) => `C:/${value}`),
    repositoryPath.map((value) => `${value}/`),
    repositoryPath.map((value) => `${value}/../secret`),
    repositoryPath.map((value) => `${value}//nested`),
    repositoryPath.map((value) => `./${value}`),
    repositoryPath.map((value) => `${value}\0`),
  );
  fc.assert(fc.property(unsafePath, (unsafe) => {
    const result = validateChangeSetResult(changeSetWith({ allowedFiles: ['*'] }), [unsafe]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.invalidPaths, [unsafe]);
    assert.ok(result.outOfScope.includes(unsafe));
  }));
});

test('forbidden scope always wins over an overlapping allow scope', () => {
  fc.assert(fc.property(directoryPath, directoryPath, repositoryPath, (allowed, forbiddenChild, tail) => {
    const forbiddenDirectory = `${allowed}/${forbiddenChild}`;
    const changeSet = changeSetWith({ allowedFiles: [`${allowed}/**`], forbiddenFiles: [`${forbiddenDirectory}/**`] });
    const file = `${forbiddenDirectory}/${tail}`;
    const result = validateChangeSetResult(changeSet, [file]);
    assert.equal(result.ok, false);
    assert.deepEqual(result.forbiddenHits, [file]);
  }));
});

test('expected files are reported without widening or narrowing the allow decision', () => {
  fc.assert(fc.property(directoryPath, segment, repositoryPath, (directory, other, tail) => {
    fc.pre(other !== directory.split('/')[0]);
    const changeSet = changeSetWith({
      allowedFiles: [`${directory}/**`, `${other}/**`],
      expectedFiles: [`${directory}/**`],
    });
    const unexpected = `${other}/${tail}`;
    const result = validateChangeSetResult(changeSet, [`${directory}/${tail}`, unexpected]);
    assert.equal(result.ok, true, 'expectedFiles must not deny an allowed path');
    assert.deepEqual(result.unexpectedFiles, [unexpected]);
  }));
});

test('scope-rule normalisation is stable and separator-independent', () => {
  fc.assert(fc.property(directoryPath, fc.constantFrom('/**', '/', '', '*'), (directory, suffix) => {
    const posixRule = `${directory}${suffix}`;
    const windowsRule = `${directory.replaceAll('/', '\\')}${suffix.replace('/', '\\')}`;
    const fromPosix = changeSetWith({ allowedFiles: [posixRule] }).allowedFiles;
    const fromWindows = changeSetWith({ allowedFiles: [windowsRule] }).allowedFiles;
    assert.deepEqual(fromWindows, fromPosix, 'separator style must not change the declared scope');
    assert.deepEqual(changeSetWith({ allowedFiles: fromPosix }).allowedFiles, fromPosix, 'normalisation must be idempotent');
  }));
});

test('unsafe scope declarations are rejected before any work starts', () => {
  const unsafeRule = fc.oneof(
    directoryPath.map((value) => `/${value}/**`),
    directoryPath.map((value) => `../${value}/**`),
    directoryPath.map((value) => `${value}/../other/**`),
    directoryPath.map((value) => `C:/${value}/**`),
    directoryPath.map((value) => `${value}//nested/**`),
    directoryPath.map((value) => `${value}/*/nested`),
    directoryPath.map((value) => `${value}/**/*.ts`),
    fc.constant(''),
    fc.constant('   '),
  );
  fc.assert(fc.property(unsafeRule, (rule) => {
    assert.throws(() => changeSetWith({ allowedFiles: [rule] }), /scope rule|repository-relative|non-empty/);
  }));
});
