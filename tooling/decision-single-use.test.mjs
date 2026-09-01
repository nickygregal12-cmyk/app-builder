/**
 * One decision, one attempt — across process and service restarts.
 *
 * Two bugs live behind these tests, and the second was caused by how the first
 * was tested.
 *
 * The original: `spentDecisionIds` is a `Set` inside one process while the
 * canary unit is `Type=oneshot`, so every start began with an empty set and one
 * authorisation was worth as many calls as somebody was willing to restart the
 * unit.
 *
 * The fix was a claim performed by root before the unit starts, justified by
 * `rename(2)` being atomic. But the first version of THIS FILE reimplemented
 * that claim in JavaScript with `renameSync` on one temporary filesystem, and
 * passed — while production ran `mv` from /etc to /run, which are different
 * filesystems, where rename fails EXDEV and `mv` silently copies instead. The
 * test proved a property of the simulation, not of the system.
 *
 * So these tests execute `ops/hetzner/claim-model-decision.py`, the primitive
 * production actually calls, and the cross-device case is exercised against a
 * real second filesystem rather than reasoned about.
 */

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLAIMER = join(ROOT, 'ops/hetzner/claim-model-decision.py');
const DECISION = JSON.stringify({ decision: { decisionId: 'single-use-test' }, token: 'not-a-real-token' });
const run = promisify(execFile);

/** The production claim, invoked exactly as run-model-canary.sh invokes it. */
function claim(source, destination) {
  try {
    const stdout = execFileSync('python3', [CLAIMER, '--source', source, '--destination', destination],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '', code: 0 };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? '', code: error.status };
  }
}

function workspace() {
  const base = mkdtempSync(join(tmpdir(), 'app-builder-single-use-'));
  const authoritative = join(base, 'model-enable-decision.json');
  const claimed = join(base, 'model-enable-decision.claimed.json');
  writeFileSync(authoritative, DECISION, { mode: 0o600 });
  return { base, authoritative, claimed };
}

test('the first run claims the decision, and the authoritative name is gone before any attempt', () => {
  const w = workspace();
  try {
    assert.equal(claim(w.authoritative, w.claimed).ok, true);
    assert.equal(existsSync(w.authoritative), false, 'the decision is spent before the unit starts');
    assert.equal(readFileSync(w.claimed, 'utf8'), DECISION, 'the run still has the decision it claimed');
    assert.equal(statSync(w.claimed).mode & 0o777, 0o600, 'rename preserves the restrictive mode');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a second run cannot reuse it, however the first one ended', () => {
  const w = workspace();
  try {
    claim(w.authoritative, w.claimed);
    // (b) crash after claim before request, (c) mid-request, (d) after response.
    for (const ending of ['crash-before-request', 'crash-mid-request', 'completed']) {
      rmSync(w.claimed, { force: true });
      const second = claim(w.authoritative, w.claimed);
      assert.equal(second.ok, false, `must not be reusable after ${ending}`);
      assert.match(second.stderr, /no authorised decision to claim/);
    }
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a crash before the claim leaves the decision usable, which is the only safe direction', () => {
  const w = workspace();
  try {
    assert.equal(existsSync(w.authoritative), true);
    assert.equal(claim(w.authoritative, w.claimed).ok, true);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('concurrent runs against one decision produce exactly one winner', async () => {
  // The property the whole mechanism rests on, exercised through the production
  // helper rather than asserted about rename(2) in the abstract.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const w = workspace();
    try {
      const claimants = [0, 1, 2, 3].map((index) =>
        run('python3', [CLAIMER, '--source', w.authoritative, '--destination', join(w.base, `claim-${index}.json`)])
          .then(() => ({ won: true })).catch(() => ({ won: false })));
      const winners = (await Promise.all(claimants)).filter((result) => result.won);

      assert.equal(winners.length, 1, `exactly one claimant may win (round ${attempt})`);
      assert.equal(existsSync(w.authoritative), false, 'the source disappears');
      const claims = [0, 1, 2, 3].filter((index) => existsSync(join(w.base, `claim-${index}.json`)));
      assert.equal(claims.length, 1, 'no second claim may exist, and no replayable copy may remain');
    } finally {
      rmSync(w.base, { recursive: true, force: true });
    }
  }
});

test('a claim that would cross a filesystem boundary is refused, never copied', () => {
  // The bug this file previously hid. /run is tmpfs and /etc is not, so the old
  // `mv` fell back to copy-then-unlink and reported success. A real second
  // filesystem is used here rather than trusting the reasoning.
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (!runtimeDir || !existsSync(runtimeDir)) return; // no second filesystem available
  const w = workspace();
  const across = join(runtimeDir, `app-builder-claim-test-${process.pid}.json`);
  try {
    if (statSync(w.base).dev === statSync(runtimeDir).dev) return; // same fs; nothing to prove here
    const result = claim(w.authoritative, across);
    assert.equal(result.ok, false, 'a cross-device claim must be refused');
    assert.match(result.stderr, /filesystem boundary|EXDEV/);
    assert.equal(existsSync(across), false, 'nothing may be copied across');
    assert.equal(existsSync(w.authoritative), true, 'and the decision must remain unspent rather than half-moved');
  } finally {
    rmSync(across, { force: true });
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a leftover claim stops the next run rather than being silently overwritten', () => {
  const w = workspace();
  try {
    writeFileSync(w.claimed, DECISION, { mode: 0o600 });
    const result = claim(w.authoritative, w.claimed);
    assert.equal(result.ok, false);
    assert.match(result.stderr, /previous claim is still present/);
    assert.equal(existsSync(w.authoritative), true, 'a refused run consumes nothing');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a symlinked or empty authority is refused', () => {
  const w = workspace();
  try {
    rmSync(w.authoritative);
    symlinkSync(join(w.base, 'elsewhere.json'), w.authoritative);
    let result = claim(w.authoritative, w.claimed);
    assert.equal(result.ok, false);
    assert.match(result.stderr, /symbolic link|no authorised decision/);
    rmSync(w.authoritative, { force: true });

    writeFileSync(w.authoritative, '', { mode: 0o600 });
    result = claim(w.authoritative, w.claimed);
    assert.equal(result.ok, false);
    assert.match(result.stderr, /empty/);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a fresh authorisation is usable again', () => {
  const w = workspace();
  try {
    claim(w.authoritative, w.claimed);
    rmSync(w.claimed, { force: true });
    writeFileSync(w.authoritative, DECISION, { mode: 0o600 });
    assert.equal(claim(w.authoritative, w.claimed).ok, true);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('production claims through the helper, and the unit loads the claim, not the authority', () => {
  const runner = readFileSync(join(ROOT, 'ops/hetzner/run-model-canary.sh'), 'utf8');
  assert.match(runner, /^python3 "\$\{CLAIMER\}" --source "\$DECISION" --destination "\$CLAIM"$/m);
  assert.equal(/^mv -n /m.test(runner), false, 'mv falls back to a non-atomic copy across filesystems');

  const lines = runner.split('\n').map((line) => line.trim());
  const claimAt = lines.findIndex((line) => line.startsWith('python3 "${CLAIMER}"'));
  const startAt = lines.findIndex((line) => line.startsWith('systemctl start "$UNIT"'));
  assert.ok(claimAt > 0 && startAt > 0 && claimAt < startAt, 'the decision is spent before the attempt');

  const installer = readFileSync(join(ROOT, 'ops/hetzner/install-model-canary-unit.sh'), 'utf8');
  assert.match(installer, /LoadCredential=model-enable-decision:\$\{CLAIM\}/);
  // The claim must share a filesystem with the authority, or rename is not atomic.
  assert.match(installer, /CLAIM="\$\{ETC_DIR\}\/model-enable-decision\.claimed\.json"/);
  assert.equal(/CLAIM=\/run\//.test(installer), false, '/run is tmpfs: a claim there is cross-device and reboot-fragile');
});

test('the in-memory guard remains, as defence in depth rather than as the authority', () => {
  const gateway = readFileSync(join(ROOT, 'tooling/lib/model-gateway.mjs'), 'utf8');
  assert.match(gateway, /spentDecisionIds/);
});
