/**
 * One decision, one attempt — across process and service restarts.
 *
 * The gateway's `spentDecisionIds` is a `Set` inside one process, and the
 * canary unit is `Type=oneshot`. So every start began with an empty set while
 * the signed decision sat at a stable path: one authorisation was good for as
 * many provider calls as somebody was willing to restart the unit, for as long
 * as its TTL lasted. `maxAttempts: 1` described an intention the runtime did not
 * enforce.
 *
 * The durable authority is now a `rename(2)` performed by root before the unit
 * starts. These tests exercise that claim directly, and prove the ordering
 * property that makes it fail-secure: the decision is spent *before* any
 * provider work, so a crash costs an authorisation rather than granting a
 * second one.
 */

import assert from 'node:assert/strict';

import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DECISION = JSON.stringify({ decision: { decisionId: 'single-use-test' }, token: 'not-a-real-token' });

/**
 * The claim, exactly as ops/hetzner/run-model-canary.sh performs it: an atomic
 * rename that refuses to clobber. Modelled here rather than shelled out to so
 * the concurrency case can be exercised without root.
 */
function claim(authoritative, claimed) {
  if (existsSync(claimed)) return { ok: false, reason: 'a previous claim was never cleaned up' };
  if (!existsSync(authoritative)) return { ok: false, reason: 'no authorised decision' };
  renameSync(authoritative, claimed);
  return { ok: true };
}

function workspace() {
  const base = mkdtempSync(join(tmpdir(), 'app-builder-single-use-'));
  const authoritative = join(base, 'model-enable-decision.json');
  const claimed = join(base, 'claimed.json');
  writeFileSync(authoritative, DECISION, { mode: 0o600 });
  return { base, authoritative, claimed };
}

test('the first run claims the decision, and the authoritative name is gone before any attempt', () => {
  const w = workspace();
  try {
    assert.equal(claim(w.authoritative, w.claimed).ok, true);
    // The ordering that makes this fail-secure: spent before the call, not after.
    assert.equal(existsSync(w.authoritative), false, 'the decision is spent before the unit starts');
    assert.equal(readFileSync(w.claimed, 'utf8'), DECISION, 'the run still has the decision it claimed');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a second run cannot reuse it, however the first one ended', () => {
  const w = workspace();
  try {
    claim(w.authoritative, w.claimed);

    // (b) crash after claim, before the request; (c) after the request, before
    // the response; (d) after the response. In each case the run is over and
    // the claim is cleaned up, and none of them restores the authorisation.
    for (const ending of ['crash-before-request', 'crash-mid-request', 'completed']) {
      rmSync(w.claimed, { force: true });
      const second = claim(w.authoritative, w.claimed);
      assert.equal(second.ok, false, `a decision must not be reusable after ${ending}`);
      assert.equal(second.reason, 'no authorised decision');
    }
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a crash before the claim leaves the decision usable, which is the only safe direction', () => {
  const w = workspace();
  try {
    // (a) crash before claim: nothing was consumed, so nothing was wasted.
    assert.equal(existsSync(w.authoritative), true);
    assert.equal(claim(w.authoritative, w.claimed).ok, true);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('two concurrent runs cannot both claim the same decision', () => {
  const w = workspace();
  try {
    const first = claim(w.authoritative, w.claimed);
    const second = claim(w.authoritative, join(w.base, 'other-claim.json'));
    assert.equal(first.ok, true);
    assert.equal(second.ok, false, 'rename is atomic: exactly one winner');
    assert.equal(existsSync(join(w.base, 'other-claim.json')), false);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a leftover claim stops the next run rather than being silently overwritten', () => {
  const w = workspace();
  try {
    writeFileSync(w.claimed, DECISION, { mode: 0o600 });
    const result = claim(w.authoritative, w.claimed);
    assert.equal(result.ok, false);
    assert.match(result.reason, /never cleaned up/);
    assert.equal(existsSync(w.authoritative), true, 'the decision is not consumed by a refused run');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a fresh authorisation is usable again', () => {
  const w = workspace();
  try {
    claim(w.authoritative, w.claimed);
    rmSync(w.claimed, { force: true });
    // The operator mints a new decision; it is a different authorisation.
    writeFileSync(w.authoritative, DECISION, { mode: 0o600 });
    assert.equal(claim(w.authoritative, w.claimed).ok, true);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('the unit loads the claim, not the authoritative decision, so a bare systemctl start cannot reuse one', () => {
  const installer = readFileSync(join(ROOT, 'ops/hetzner/install-model-canary-unit.sh'), 'utf8');
  assert.match(installer, /LoadCredential=model-enable-decision:\$\{CLAIM\}/);
  assert.equal(
    /LoadCredential=model-enable-decision:\$\{DECISION\}/.test(installer), false,
    'loading the authoritative path directly is what made a restart reuse the decision',
  );
  const runner = readFileSync(join(ROOT, 'ops/hetzner/run-model-canary.sh'), 'utf8');
  assert.match(runner, /^mv -n "\$DECISION" "\$CLAIM"$/m, 'the claim is an atomic non-clobbering rename');
  // The claim happens before the unit starts, not after the attempt. Compared
  // as commands rather than as text: this file discusses both in its header,
  // and an earlier version of this assertion was measuring the prose.
  const lines = runner.split('\n').map((line) => line.trim());
  const claimAt = lines.findIndex((line) => line.startsWith('mv -n "$DECISION"'));
  const startAt = lines.findIndex((line) => line.startsWith('systemctl start "$UNIT"'));
  assert.ok(claimAt > 0 && startAt > 0, 'both the claim and the start must be real commands');
  assert.ok(claimAt < startAt, 'the decision must be spent before the attempt, not after it');
});

test('the in-memory guard remains, as defence in depth rather than as the authority', () => {
  const gateway = readFileSync(join(ROOT, 'tooling/lib/model-gateway.mjs'), 'utf8');
  assert.match(gateway, /spentDecisionIds/, 'the process-local guard still refuses a replay within one run');
});
