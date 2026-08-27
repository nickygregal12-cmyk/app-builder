import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
  FIXTURE_MARKER,
  SECRET_RULES,
  envFileFindings,
  scanRepository,
  scanText,
  serviceRoleJwtFindings,
} from './lib/secret-scan.mjs';

/**
 * Every planted credential below is assembled from fragments at run time.
 *
 * That is not decoration. A test file containing a contiguous string shaped like a live token is a
 * file that trips push protection, gets quoted into an issue, and eventually gets copied by someone
 * who does not read the surrounding comment. The scanner has to be shown finding each shape, and
 * this repository has to contain none of them — so the shapes exist only in memory, for the
 * milliseconds it takes to match them.
 */
const plant = (...fragments) => fragments.join('');

const PLANTED = [
  ['private-key-block', plant('-----', 'BEGIN ', 'RSA ', 'PRIVATE ', 'KEY', '-----')],
  ['aws-access-key-id', plant('AKIA', 'EXAMPLE', 'NOTREAL', 'AA')],
  ['github-token', plant('ghp_', 'A'.repeat(36))],
  ['anthropic-key', plant('sk-', 'ant-', 'api03-', 'B'.repeat(24))],
  ['openai-key', plant('sk-', 'C'.repeat(40))],
  ['slack-token', plant('xox', 'b-', '1234567890', '-abcdefghij')],
  ['google-api-key', plant('AIza', 'D'.repeat(35))],
  ['npm-token', plant('npm_', 'E'.repeat(36))],
];

/** A JWT claiming service_role, built rather than pasted. */
function serviceRoleToken(role = 'service_role') {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase', role, iat: 0, exp: 0 })}.${'F'.repeat(43)}`;
}

test('this repository contains no committed credential', () => {
  const findings = scanRepository(process.cwd());
  assert.deepEqual(findings, [], `committed credentials:\n${findings.map((entry) => `  ${entry.file}:${entry.line} ${entry.rule}`).join('\n')}`);
});

test('every rule finds its own shape', () => {
  // A scanner that has only ever returned zero and a scanner that matches nothing are the same
  // scanner from outside.
  for (const [rule, planted] of PLANTED) {
    const findings = scanText(`const value = '${planted}';`);
    assert.ok(findings.some((entry) => entry.rule === rule), `${rule} did not match its own planted fixture`);
  }
  const covered = new Set(PLANTED.map(([rule]) => rule));
  for (const rule of SECRET_RULES) {
    assert.ok(covered.has(rule.id), `${rule.id} has no planted fixture, so nothing proves it matches anything`);
    assert.ok(rule.detail?.trim(), `${rule.id} must say why its shape cannot be innocent`);
  }
});

test('a Supabase service-role key is found by what it claims, not by a prefix', () => {
  // The one that matters most in this repository: an ordinary-looking JWT that bypasses row-level
  // security, which is exactly what the database-security lane exists to prove holds.
  assert.equal(serviceRoleJwtFindings(serviceRoleToken()).length, 1);
  assert.equal(serviceRoleJwtFindings(serviceRoleToken('supabase_admin')).length, 1);

  // The publishable key is the one a browser is *supposed* to hold, and it must not be a finding —
  // a scanner that refuses the key the generated app needs is a scanner that gets turned off.
  assert.deepEqual(serviceRoleJwtFindings(serviceRoleToken('anon')), []);
  assert.deepEqual(serviceRoleJwtFindings(serviceRoleToken('authenticated')), []);
  assert.deepEqual(serviceRoleJwtFindings('eyJ not a token at all'), []);
});

test('a line that says it is a fixture is not a finding', () => {
  const planted = PLANTED[1][1];
  assert.equal(scanText(`const value = '${planted}';`).length, 1);
  assert.deepEqual(scanText(`const value = '${planted}'; // ${FIXTURE_MARKER}`), []);
  // The marker excuses its own line and nothing else.
  assert.equal(scanText(`// ${FIXTURE_MARKER}\nconst value = '${planted}';`).length, 1);
});

test('ordinary text that resembles a credential is not a finding', () => {
  // The rules that would have found these are the ones deliberately not written: entropy, and
  // `password =`. Both find hundreds of things in a real repository.
  for (const line of [
    'const password = process.env.DATABASE_PASSWORD;',
    'AKIAAA is not sixteen characters',
    'see https://docs.example.com/sk-getting-started',
    'const apiKey = readSecret("anthropic");',
    'a base64 blob: aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYSB0b2tlbg==',
    'ghp_short',
  ]) {
    assert.deepEqual(scanText(line), [], line);
  }
});

test('only .env.example is tracked, and it carries names rather than values', () => {
  assert.deepEqual(envFileFindings('adapters/x/files/.env.example', 'VITE_URL=\nVITE_KEY=\n'), []);
  assert.deepEqual(envFileFindings('adapters/x/files/.env.example', 'VITE_URL=<your-project-url>\nVITE_KEY=changeme\n'), []);
  assert.deepEqual(envFileFindings('src/index.ts', 'anything at all'), []);

  const tracked = envFileFindings('.env.production', 'VITE_URL=https://real.example\n');
  assert.deepEqual(tracked.map((entry) => entry.rule), ['env-file-tracked']);

  const valued = envFileFindings('adapters/x/files/.env.example', 'VITE_URL=\nSUPABASE_KEY=eyJhbGciOiJIUzI1NiJ9.abc.def\n');
  assert.deepEqual(valued.map((entry) => entry.rule), ['env-example-carries-a-value']);
  assert.equal(valued[0].line, 2);
});

test('a planted credential in a real tree is reported with its file and line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-secret-'));
  fs.mkdirSync(path.join(root, 'recipes/thing/files'), { recursive: true });
  fs.writeFileSync(path.join(root, 'recipes/thing/files/client.ts'), `const key = '${serviceRoleToken()}';\n`);
  fs.writeFileSync(path.join(root, 'recipes/thing/files/.env.example'), 'SUPABASE_URL=\n');
  fs.mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules/pkg/index.js'), `const key = '${PLANTED[2][1]}';\n`);

  const findings = scanRepository(root);
  assert.deepEqual(findings.map((entry) => [entry.file, entry.line, entry.rule]), [
    ['recipes/thing/files/client.ts', 1, 'supabase-service-role-jwt'],
  ], 'a credential in a recipe must be found, and node_modules must not be walked');
  fs.rmSync(root, { recursive: true, force: true });
});
