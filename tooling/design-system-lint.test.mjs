/**
 * Stage Q5 coverage.
 *
 * Every rule has a planted violation and a planted near-miss, because the
 * near-miss is the expensive half: a colour rule that also flagged
 * `rgb(var(--color-scrim) / 24%)` would push authors back to the literal it
 * exists to prevent, and one that flagged a token declaration would forbid
 * writing a brand down at all.
 *
 * The repository's own shipped surface is asserted clean alongside a floor on
 * how much of it was read, because a walk that found nothing would also report
 * no findings.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { DESIGN_SYSTEM_RULES, declaredTokens, lintDesignSystem, withoutComments } from './lib/design-system-lint.mjs';

const TOKENS = { file: 'tokens.css', source: fs.readFileSync('templates/shared/presentation/tokens.css', 'utf8') };

function lint(source, file = 'sheet.css') {
  return lintDesignSystem({ files: [TOKENS, { file, source }] }).findings;
}

test('a colour written into a rule is a violation, in every notation', () => {
  for (const value of ['#fff', '#f5f5f2', '#aabbccdd', 'rgb(10 12 14 / 24%)', 'rgba(20,20,15,.06)', 'hsl(210 40% 30%)', 'oklch(0.7 0.1 200)']) {
    const findings = lint(`.card { background: ${value} }`);
    assert.deepEqual(findings.map((entry) => entry.check), ['raw-colour'], value);
    assert.equal(findings[0].line, 1);
  }
});

test('a colour written into a custom property is the token being declared, not a bypass', () => {
  assert.deepEqual(lint(':root { --brand-ink: #101214; --brand-scrim: rgb(10 12 14) }'), []);
  // And a declaration is still a declaration when its value nests one.
  assert.deepEqual(lint(':root { --brand-edge: var(--color-border, #e3e0d9) }'), []);
  // The property immediately after one is not covered by it.
  assert.deepEqual(
    lint(':root { --brand-ink: #101214 }\n.card { color: #101214 }').map((entry) => entry.line),
    [2],
  );
});

test('a functional colour built from a token is how a token is varied, and is allowed', () => {
  assert.deepEqual(lint('.hero::after { background: rgb(var(--color-scrim) / 24%) }'), []);
  assert.deepEqual(lint('.hero { box-shadow: 0 1px 2px rgba(var(--color-scrim), .2) }'), []);
  // But a token-derived colour beside a literal one still reports the literal.
  const mixed = lint('.hero { background: rgb(var(--color-scrim) / 24%); border-color: #ccc }');
  assert.deepEqual(mixed.map((entry) => entry.check), ['raw-colour']);
  assert.equal(mixed[0].detail, '#ccc');
});

test('a reference to a property nothing declares is a violation, and its fallback does not excuse it', () => {
  const findings = lint('.nav { box-shadow: var(--shadow-nowhere, 0 1px 2px rgb(0 0 0 / 10%)) }');
  // Both rules fire, and they are two different statements about one line: the
  // property resolves to nothing, and the value it therefore always renders is
  // a colour typed into a rule. This is exactly the pair the template carried.
  assert.deepEqual(findings.map((entry) => entry.check).sort(), ['raw-colour', 'undeclared-token']);
  assert.ok(findings.some((entry) => entry.detail === '--shadow-nowhere'));
  assert.ok(findings.some((entry) => entry.detail === 'rgb(0 0 0 / 10%)'));
  // A property the token source declares resolves, and one the file declares itself does too.
  assert.deepEqual(lint('.nav { box-shadow: var(--shadow-raised) }'), []);
  assert.deepEqual(lint('.nav { --local: 4px; padding: var(--local) }'), []);
});

test('a colour named in a comment is prose, and the line numbers survive stripping it', () => {
  assert.deepEqual(lint('/* the old value was #f5f5f2 */\n.card { background: var(--color-page) }'), []);
  const findings = lint('/* a\n   multi-line\n   note */\n.card { color: #123456 }');
  assert.equal(findings[0].line, 4);
  assert.equal(withoutComments('/* x */\na').split('\n').length, 2);
});

test('every rule carries a severity and guidance a reader can act on', () => {
  for (const [id, rule] of Object.entries(DESIGN_SYSTEM_RULES)) {
    assert.equal(rule.severity, 'violation', id);
    assert.ok(rule.title?.trim(), id);
    assert.ok(rule.guidance?.length > 40, `${id} guidance must say what to do instead`);
  }
  // Every finding names a declared rule.
  for (const finding of lint('.card { background: #fff; box-shadow: var(--nope) }')) {
    assert.ok(Object.hasOwn(DESIGN_SYSTEM_RULES, finding.check), finding.check);
  }
});

test('the token source declares the properties the template consumes', () => {
  const declared = declaredTokens(TOKENS.source);
  for (const name of ['--color-accent', '--color-page', '--shadow-raised', '--radius-md', '--color-scrim']) {
    assert.ok(declared.has(name), `${name} must be declared where a brand can override it`);
  }
  assert.ok(declared.size >= 40, `the walk found only ${declared.size} tokens, which is too few to be the real set`);
});

test('the shipped surface is clean, and enough of it was read for that to mean something', () => {
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.css')) files.push({ file: full, source: fs.readFileSync(full, 'utf8') });
    }
  };
  walk('templates');
  walk('recipes');

  const report = lintDesignSystem({ files });
  assert.ok(report.files >= 3, `only ${report.files} shipped stylesheet(s) were found`);
  assert.ok(report.declaredTokens.length >= 40);
  assert.deepEqual(report.findings, [], JSON.stringify(report.findings.map((entry) => `${entry.file}:${entry.line} ${entry.detail}`), null, 2));
  assert.equal(report.clean, true);

  // The auth recipe is the one this stage was written for: it shipped a
  // complete parallel palette into every generated project with sign-in.
  const auth = files.find((entry) => entry.file.endsWith('auth.css'));
  assert.ok(auth, 'the auth recipe must still ship a stylesheet for this to be proving anything');
  assert.match(auth.source, /var\(--color-accent\)/);
  assert.match(auth.source, /var\(--color-accent-contrast\)/);
});
