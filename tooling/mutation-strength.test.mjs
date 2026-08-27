import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { MUTATION_OPERATORS, generateMutations, runMutationTesting } from './lib/mutation-harness.mjs';
import { MUTATION_TARGETS } from './lib/mutation-targets.mjs';

/**
 * The mutation run itself is `npm run mutation:strength` and is far too slow to sit in
 * `npm run check`. What belongs here is everything that would make that run lie: a generator that
 * quietly produces nothing, a registry pointing at tests that do not cover their target, and an
 * equivalence record that outlives the line it excuses.
 */

test('the registry names real files, and real tests that actually import them', () => {
  assert.ok(MUTATION_TARGETS.length > 0);
  const ids = MUTATION_TARGETS.map((target) => target.id);
  assert.deepEqual([...new Set(ids)], ids, 'target ids must be unique');

  for (const target of MUTATION_TARGETS) {
    assert.ok(fs.existsSync(target.file), `${target.id} names a file that does not exist: ${target.file}`);
    assert.ok(target.why?.trim(), `${target.id} must say why it is worth the runtime`);
    assert.ok(target.tests.length > 0, `${target.id} declares no tests`);

    // The declaration has to name its consumer, in the Stage Q10 sense: a target whose tests do not
    // reach it would report every mutation as surviving, and one whose tests reach it only by
    // accident would report a strength the module does not have.
    const specifier = path.basename(target.file, '.js');
    for (const testFile of target.tests) {
      assert.ok(fs.existsSync(testFile), `${target.id} names a test file that does not exist: ${testFile}`);
      const text = fs.readFileSync(testFile, 'utf8');
      // `index.js` is imported as the package itself rather than by file name, which is the same
      // module reached by its other spelling.
      const spellings = specifier === 'index'
        ? [/@app-builder\/control-plane'/, /control-plane\/src\/index\.js/]
        : [new RegExp(`control-plane/(src/)?${specifier}`), new RegExp(`service/src/${specifier}\\.js`)];
      assert.ok(
        spellings.some((pattern) => pattern.test(text)),
        `${testFile} is declared as covering ${target.file} but does not import it`,
      );
    }
  }
});

test('every recorded equivalence still describes a mutation that exists', () => {
  for (const target of MUTATION_TARGETS) {
    const generated = new Set(generateMutations(target.file, fs.readFileSync(target.file, 'utf8')).map((mutation) => mutation.id));
    for (const entry of target.equivalent ?? []) {
      // Otherwise an equivalence outlives the line it excused, and the next mutation to land on
      // that line inherits an exemption nobody granted it.
      assert.ok(generated.has(entry.id), `${target.id} records ${entry.id} as equivalent, but no such mutation is generated any more`);
      assert.ok(entry.why?.trim().length > 40, `${entry.id} must say why it cannot change behaviour, not merely that it does not`);
    }
  }
});

test('mutations are generated for every declared target, in useful numbers', () => {
  for (const target of MUTATION_TARGETS) {
    const mutations = generateMutations(target.file, fs.readFileSync(target.file, 'utf8'));
    assert.ok(mutations.length > 10, `${target.id} generated only ${mutations.length} mutations; a generator that finds nothing reports perfect strength`);
    const operators = new Set(mutations.map((mutation) => mutation.operator));
    assert.ok(operators.size > 3, `${target.id} exercised only ${operators.size} operator(s)`);
  }
});

test('mutation ids are unique per site, so one equivalence cannot excuse its neighbour', () => {
  const source = 'const ok = (a, b, c) => a || b || c;\nconst both = (a, b) => a && b;\n';
  const mutations = generateMutations('fixture.js', source);
  const ids = mutations.map((mutation) => mutation.id);
  assert.deepEqual([...new Set(ids)], ids);
  assert.ok(ids.includes('fixture:1:or-to-and#1'));
  assert.ok(ids.includes('fixture:1:or-to-and#2'));
});

test('comments, strings, template literals and regular expressions are not mutation sites', () => {
  // Mutating them produces nonsense rather than a plausible weakening, and a survivor that means
  // nothing is worse than no survivor: it teaches the reader to skim the list.
  const source = [
    '// this comment has && and >= and true in it',
    '/* so does this one: || and === */',
    "const message = 'expected >= 32 && a real value';",
    'const template = `${x} || ${y}`;',
    'const pattern = /a&&b|c>=d/;',
    'const real = x >= 1 && y === 2;',
  ].join('\n');
  const mutations = generateMutations('fixture.js', source);
  assert.deepEqual(mutations.map((mutation) => mutation.line), [6, 6, 6], JSON.stringify(mutations.map((m) => `${m.line}:${m.operator}`)));
});

test('a weakening the tests do not notice is reported, and one they do notice is killed', () => {
  // The harness proving itself: one module, two tests, and a rule only one of them checks.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-mutation-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/guard.js'), [
    'export function allowed(role, approved) {',
    '  return role === "operator" && approved === true;',
    '}',
    'export function withinBudget(spent, limit) {',
    '  return spent < limit;',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'guard.test.mjs'), [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { allowed, withinBudget } from './src/guard.js';",
    "test('an operator who is approved is allowed', () => {",
    "  assert.equal(allowed('operator', true), true);",
    "  assert.equal(allowed('operator', false), false);",
    "  assert.equal(allowed('visitor', true), false);",
    '});',
    // Deliberately says nothing about the boundary, so widening `<` to `<=` escapes.
    "test('spending less than the limit is within budget', () => {",
    '  assert.equal(withinBudget(1, 5), true);',
    '  assert.equal(withinBudget(9, 5), false);',
    '});',
    '',
  ].join('\n'));

  const report = runMutationTesting({ root, target: { file: 'src/guard.js', tests: ['guard.test.mjs'] } });
  const survivors = report.survived.map((mutation) => mutation.operator);
  assert.ok(survivors.includes('lt-widened'), `the untested budget boundary should have survived: ${JSON.stringify(report.survived.map((m) => m.id))}`);
  assert.ok(report.killed.some((mutation) => mutation.operator === 'and-to-or'), 'the covered permission check should have killed its mutation');
  assert.equal(report.total, report.killed.length + report.survived.length + report.skipped.length);

  // And the target file must be exactly as it was found. A harness that leaves a weakened module on
  // disk when it finishes is a worse problem than the one it was looking for.
  assert.match(fs.readFileSync(path.join(root, 'src/guard.js'), 'utf8'), /role === "operator" && approved === true/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('the operator set only ever weakens', () => {
  for (const operator of MUTATION_OPERATORS) {
    assert.ok(operator.why?.trim(), `${operator.id} must name the weakening it represents`);
    assert.notEqual(operator.pattern.source, operator.replacement, `${operator.id} must change something`);
  }
  const ids = MUTATION_OPERATORS.map((operator) => operator.id);
  assert.deepEqual([...new Set(ids)], ids);
});

test('the mutation report is written where CI can publish it', () => {
  // Only meaningful once a run has happened; when one has, it must be readable rather than a blob.
  const report = path.join(process.cwd(), '.app-builder/mutation-strength/report.json');
  if (!fs.existsSync(report)) return;
  const parsed = JSON.parse(fs.readFileSync(report, 'utf8'));
  assert.equal(parsed.schemaVersion, 1);
  assert.ok(Array.isArray(parsed.targets));
});
