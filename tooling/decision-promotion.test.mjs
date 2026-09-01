/**
 * The privilege boundary between the unprivileged signer and root.
 *
 * Independent review demonstrated a root file-read oracle here: the staging
 * directory is writable by the runtime user, `install` dereferences its source,
 * and so replacing the staged decision with a symlink made root copy the target
 * into a file the canary later republished as a credential. The obvious target
 * was /var/lib/systemd/credential.secret, which would have unsealed every
 * encrypted credential on the host.
 *
 * These tests run the real promotion program against real files. Asserting that
 * the source contains "O_NOFOLLOW" would not have caught the original bug and
 * would not catch its return.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROMOTE = join(ROOT, 'ops/hetzner/promote-model-decision.py');

const SENTINEL = 'ROOT-ONLY-SENTINEL-CONTENT-THAT-MUST-NEVER-BE-COPIED';
const DECISION = JSON.stringify({ decision: { decisionId: 'test' }, token: 'not-a-real-token' });

function workspace() {
  const base = mkdtempSync(join(tmpdir(), 'app-builder-promote-'));
  const staging = join(base, 'staging');
  const etc = join(base, 'etc');
  execFileSync('mkdir', ['-p', staging, etc]);
  chmodSync(staging, 0o700);
  return { base, staging, etc, destination: join(etc, 'model-enable-decision.json') };
}

/** Run the promotion exactly as the wrapper does. Never throws on failure. */
function promote({ staging, destination }) {
  try {
    const stdout = execFileSync('python3', [
      PROMOTE, '--source', join(staging, 'decision.json'), '--destination', destination,
      '--signer-uid', String(process.getuid()),
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('a legitimate staged decision is promoted, atomically and privately', () => {
  const w = workspace();
  try {
    writeFileSync(join(w.staging, 'decision.json'), DECISION, { mode: 0o600 });
    const result = promote(w);
    assert.equal(result.ok, true, result.stderr);
    assert.equal(readFileSync(w.destination, 'utf8'), DECISION);
    assert.equal(statSync(w.destination).mode & 0o777, 0o600, 'the published decision is not group or world readable');
    // No temporary file is left behind under the destination directory.
    assert.equal(existsSync(join(w.etc, '.model-enable-decision.json.incoming')), false);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a staged symlink is refused, and the sentinel is neither copied nor printed', () => {
  const w = workspace();
  try {
    const secret = join(w.base, 'root-only.txt');
    writeFileSync(secret, SENTINEL, { mode: 0o600 });

    // Exactly the demonstrated attack: the signer's file is replaced after it
    // was written, before root reads it.
    writeFileSync(join(w.staging, 'decision.json'), DECISION, { mode: 0o600 });
    rmSync(join(w.staging, 'decision.json'));
    symlinkSync(secret, join(w.staging, 'decision.json'));

    const result = promote(w);
    assert.equal(result.ok, false, 'promotion must refuse a symlinked source');
    assert.match(result.stderr, /symbolic link/);
    assert.equal(existsSync(w.destination), false, 'nothing may be published');
    assert.equal(result.stdout.includes(SENTINEL), false, 'the target must never be printed');
    assert.equal(result.stderr.includes(SENTINEL), false, 'the target must never be printed');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a symlink cannot overwrite an existing authoritative decision either', () => {
  const w = workspace();
  try {
    writeFileSync(w.destination, DECISION, { mode: 0o600 });
    const secret = join(w.base, 'root-only.txt');
    writeFileSync(secret, SENTINEL, { mode: 0o600 });
    symlinkSync(secret, join(w.staging, 'decision.json'));

    assert.equal(promote(w).ok, false);
    assert.equal(readFileSync(w.destination, 'utf8'), DECISION, 'the previous decision is untouched');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('non-regular, empty and multiply-linked sources are refused', () => {
  const w = workspace();
  try {
    const staged = join(w.staging, 'decision.json');

    // A FIFO would block a reader forever; a directory is not a decision.
    execFileSync('mkfifo', ['-m', '600', staged]);
    let result = promote(w);
    assert.equal(result.ok, false, 'a FIFO must be refused');
    assert.match(result.stderr, /not a regular file/);
    rmSync(staged);

    execFileSync('mkdir', [staged]);
    assert.equal(promote(w).ok, false, 'a directory must be refused');
    rmSync(staged, { recursive: true });

    writeFileSync(staged, '', { mode: 0o600 });
    result = promote(w);
    assert.equal(result.ok, false, 'an empty source must be refused');
    assert.match(result.stderr, /empty/);
    rmSync(staged);

    // A second name for the same bytes means the signer did not solely control
    // what root is about to publish.
    const other = join(w.base, 'other-name.json');
    writeFileSync(other, DECISION, { mode: 0o600 });
    linkSync(other, staged);
    result = promote(w);
    assert.equal(result.ok, false, 'a hardlinked source must be refused');
    assert.match(result.stderr, /more than one link/);
    rmSync(staged);

    assert.equal(existsSync(w.destination), false, 'no refusal may publish anything');
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a group- or world-accessible staged decision is refused', () => {
  const w = workspace();
  try {
    const staged = join(w.staging, 'decision.json');
    writeFileSync(staged, DECISION, { mode: 0o600 });
    chmodSync(staged, 0o644);
    const result = promote(w);
    assert.equal(result.ok, false, 'the signer runs with UMask=0077; 0644 was not written by it');
    assert.match(result.stderr, /group or world accessible/);
    assert.equal(existsSync(w.destination), false);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});

test('a source owned by another uid is refused', () => {
  const w = workspace();
  try {
    writeFileSync(join(w.staging, 'decision.json'), DECISION, { mode: 0o600 });
    const result = (() => {
      try {
        execFileSync('python3', [
          PROMOTE, '--source', join(w.staging, 'decision.json'), '--destination', w.destination,
          // Any uid that is not ours: the file is ours, so this must refuse.
          '--signer-uid', String(process.getuid() + 1),
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, stderr: '' };
      } catch (error) {
        return { ok: false, stderr: error.stderr ?? '' };
      }
    })();
    assert.equal(result.ok, false);
    assert.match(result.stderr, /not the signer/);
    assert.equal(existsSync(w.destination), false);
  } finally {
    rmSync(w.base, { recursive: true, force: true });
  }
});
