/**
 * The hosted run path must read the decision it was actually given.
 *
 * This is the regression for a failure that reached the real host with every
 * gate green. The final preflight passed all sixteen checks, the run wrapper
 * claimed the decision correctly — atomically renaming the authority away, as
 * designed — and the service then died with
 *
 *   ENOENT: no such file or directory,
 *   open '/etc/app-builder/model-enable-decision.json'
 *
 * before any provider call, with the authorisation already spent.
 *
 * The cause was a duplicated lookup. `decisionPathFor` was module-private, so
 * `model-canary-host.mjs` reimplemented it as
 * `env.APP_BUILDER_MODEL_DECISION_FILE ?? DECISION_PATH` and skipped the
 * credentials directory entirely. Preflight resolved the credential and passed;
 * the next line reopened the authority the claim had removed.
 *
 * So these tests assert the *behaviour* at that seam: with the authority absent
 * and the decision present only as a systemd credential, the hosted consumer
 * must succeed. A test that asserted the source contained `decisionPathFor`
 * would have passed against the broken build.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { decisionPathFor, readStoredDecision } from './model-canary.mjs';
import { hostedDecision } from './model-canary-host.mjs';

const TOKEN = 'not-a-real-token.not-a-real-signature';
const DECISION = JSON.stringify({ decision: { decisionId: 'hosted-consumer-test' }, token: TOKEN });

function hostedWorkspace() {
  const base = mkdtempSync(join(tmpdir(), 'app-builder-hosted-decision-'));
  const credentials = join(base, 'credentials');
  const etc = join(base, 'etc');
  rmSync(credentials, { recursive: true, force: true });
  writeFileSync(join(base, '.keep'), '');
  return { base, credentials, etc };
}

test('after the claim, the hosted consumer reads the systemd credential', () => {
  const w = hostedWorkspace();
  try {
    // Exactly the production state after run-model-canary.sh: the authority has
    // been renamed to the claim, and systemd has exposed the claim as a
    // credential. Nothing sets APP_BUILDER_MODEL_DECISION_FILE.
    mkdirSync(w.credentials, { recursive: true });
    mkdirSync(w.etc, { recursive: true });
    const authority = join(w.etc, 'model-enable-decision.json');
    writeFileSync(authority, DECISION, { mode: 0o600 });
    renameSync(authority, join(w.credentials, 'model-enable-decision'));
    assert.equal(existsSync(authority), false, 'the authority is spent, as the claim intends');

    const env = { CREDENTIALS_DIRECTORY: w.credentials };
    assert.equal(decisionPathFor(env), join(w.credentials, 'model-enable-decision'));

    // Through the shared primitive...
    assert.equal(readStoredDecision(env).token, TOKEN);
    // ...and, crucially, through the hosted entry point's own seam. Asserting
    // only the former is what let the duplicated lookup survive: the resolver
    // was always correct, and the host simply did not call it.
    assert.equal(
      hostedDecision(env).token, TOKEN,
      'the hosted run must read the claimed decision, not the removed authority',
    );
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('an explicit decision file still wins, because the authorising unit uses it', () => {
  const w = hostedWorkspace();
  try {
    mkdirSync(w.credentials, { recursive: true });
    const explicit = join(w.base, 'staged.json');
    writeFileSync(explicit, DECISION, { mode: 0o600 });
    // A credential is also present; the explicit path must still take priority.
    writeFileSync(join(w.credentials, 'model-enable-decision'), JSON.stringify({ token: 'wrong-one' }), { mode: 0o600 });

    const env = { CREDENTIALS_DIRECTORY: w.credentials, APP_BUILDER_MODEL_DECISION_FILE: explicit };
    assert.equal(decisionPathFor(env), explicit);
    assert.equal(readStoredDecision(env).token, TOKEN);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('with no explicit file and no credential, only the development authority is used', () => {
  const w = hostedWorkspace();
  try {
    mkdirSync(w.credentials, { recursive: true });
    // A credentials directory that contains no decision must not be treated as
    // one; resolution falls through to the development path.
    const env = { CREDENTIALS_DIRECTORY: w.credentials };
    assert.equal(decisionPathFor(env), '/etc/app-builder/model-enable-decision.json');
    assert.equal(decisionPathFor({}), '/etc/app-builder/model-enable-decision.json');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a missing or malformed decision fails closed, and the token is never in the message', () => {
  const w = hostedWorkspace();
  try {
    mkdirSync(w.credentials, { recursive: true });
    const env = { CREDENTIALS_DIRECTORY: w.credentials, APP_BUILDER_MODEL_DECISION_FILE: join(w.base, 'absent.json') };

    assert.throws(() => readStoredDecision(env), /No usable enable decision/);

    const malformed = join(w.base, 'malformed.json');
    writeFileSync(malformed, 'not json at all');
    assert.throws(
      () => readStoredDecision({ APP_BUILDER_MODEL_DECISION_FILE: malformed }),
      /not readable JSON/,
    );

    const tokenless = join(w.base, 'tokenless.json');
    writeFileSync(tokenless, JSON.stringify({ decision: { decisionId: 'x' } }));
    assert.throws(
      () => readStoredDecision({ APP_BUILDER_MODEL_DECISION_FILE: tokenless }),
      /carries no token/,
    );

    // The value is authority, not diagnostics.
    const leaky = join(w.base, 'leaky.json');
    writeFileSync(leaky, JSON.stringify({ token: '   ' }));
    try {
      readStoredDecision({ APP_BUILDER_MODEL_DECISION_FILE: leaky });
      assert.fail('a blank token must be refused');
    } catch (error) {
      assert.equal(error.message.includes(TOKEN), false);
      assert.equal(/token['"]?\s*[:=]\s*\S/.test(error.message), false, 'no token value may appear in a refusal');
    }
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('the hosted entry point resolves the decision through the shared contract', () => {
  const source = readFileSync(new URL('./model-canary-host.mjs', import.meta.url), 'utf8');
  // The seam that produced the incident: a private helper in one module and a
  // hand-rolled copy in the other.
  assert.match(source, /readStoredDecision/);
  assert.equal(
    /APP_BUILDER_MODEL_DECISION_FILE \?\? DECISION_PATH/.test(source), false,
    'the hosted path must not reimplement decision resolution',
  );
  assert.equal(
    /const DECISION_PATH =/.test(source), false,
    'a private authority constant here is what the duplicate lookup was built from',
  );
});
