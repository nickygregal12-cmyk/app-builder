/**
 * A deferred stage that failed a real gate must keep saying so.
 *
 * `deferredCapabilities` originally held one kind of entry: a capability nobody
 * built because nothing reads it yet. Phase 4D added a second and more
 * dangerous kind — a stage that WAS built, WAS measured against `gates.visual`
 * and FAILED, set down so unrelated work could proceed. The failure mode is not
 * that someone deletes the entry; it is that "deferred" drifts into reading as
 * "fine", one plausible edit at a time, until a stage that scored 6.55 against a
 * required 8.5 is quietly treated as done.
 *
 * So `unpaidGate` carries its own numbers and its own evidence, and this file
 * plants the negatives that prove the doctor actually refuses them. Without
 * these, the guard in control-plane-doctor.mjs is a branch nobody has ever seen
 * taken — which is the same defect as a distinctive moment that renders as a
 * corner glyph, applied to a check instead of to a stylesheet.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repo = process.cwd();

/**
 * A throwaway repository root whose every entry is a symlink to the real one,
 * except `config/factory-status.json`, which is whatever this test wants it to
 * be. Copying the tree would be slow and would drift; symlinking means the
 * doctor reads the genuine repository everywhere else, so a failure here is
 * about the status file rather than about a half-built fixture.
 */
function doctorOver(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deferred-gate-'));
  for (const entry of fs.readdirSync(repo)) {
    if (entry === 'config') continue;
    fs.symlinkSync(path.join(repo, entry), path.join(dir, entry));
  }
  const config = path.join(dir, 'config');
  fs.mkdirSync(config);
  for (const entry of fs.readdirSync(path.join(repo, 'config'))) {
    if (entry === 'factory-status.json') continue;
    fs.symlinkSync(path.join(repo, 'config', entry), path.join(config, entry));
  }

  const status = JSON.parse(fs.readFileSync(path.join(repo, 'config/factory-status.json'), 'utf8'));
  mutate(status);
  fs.writeFileSync(path.join(config, 'factory-status.json'), `${JSON.stringify(status, null, 2)}\n`);

  const result = spawnSync(process.execPath, [path.join(repo, 'tooling/control-plane-doctor.mjs')], {
    cwd: dir,
    encoding: 'utf8',
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

/** The entry under test is a real one, so these negatives are reachable states. */
function unpaid(status) {
  const entry = (status.deferredCapabilities ?? []).find((candidate) => candidate.unpaidGate);
  assert.ok(entry, 'no deferred capability declares an unpaid gate, so this file is guarding nothing');
  return entry;
}

test('the repository as committed passes', () => {
  const { code, output } = doctorOver(() => {});
  assert.equal(code, 0, `the unmutated status file must pass:\n${output}`);
});

test('the subject exists: a deferred stage really does carry an unpaid gate', () => {
  const status = JSON.parse(fs.readFileSync(path.join(repo, 'config/factory-status.json'), 'utf8'));
  const entry = unpaid(status);
  assert.ok(entry.unpaidGate.threshold > 0, 'an unpaid gate with no threshold measures nothing');
  assert.ok(
    entry.unpaidGate.bestMean < entry.unpaidGate.threshold,
    'the committed entry must record a genuinely unmet threshold, or it is not debt',
  );
  // The stage may not also be claimed as finished. The doctor enforces this
  // separately; asserted here so the two facts are read together.
  assert.ok(
    !(status.completedStages ?? []).includes(entry.stage),
    `${entry.stage} is deferred and must not appear in completedStages`,
  );
});

test('a deferral may not quietly become a pass', () => {
  const { code, output } = doctorOver((status) => {
    const entry = unpaid(status);
    entry.unpaidGate.bestMean = entry.unpaidGate.threshold + 0.5;
  });
  assert.notEqual(code, 0, 'a best result above the threshold was accepted as deferred debt');
  assert.match(output, /at or above its threshold/);
});

test('a deferral exactly at the threshold is not debt either', () => {
  // The boundary, because `>` instead of `>=` is the likeliest way this check
  // gets loosened by someone tidying it.
  const { code } = doctorOver((status) => {
    const entry = unpaid(status);
    entry.unpaidGate.bestMean = entry.unpaidGate.threshold;
  });
  assert.notEqual(code, 0, 'a best result exactly at the threshold was accepted as deferred debt');
});

test('a failed measurement must cite evidence', () => {
  const { code, output } = doctorOver((status) => { unpaid(status).unpaidGate.evidence = []; });
  assert.notEqual(code, 0, 'an unpaid gate with no evidence was accepted');
  assert.match(output, /no evidence/);
});

test('cited evidence must actually exist', () => {
  const { code, output } = doctorOver((status) => {
    unpaid(status).unpaidGate.evidence = ['examples/genuine-business/nbm-visual-review-v9.verdicts.json'];
  });
  assert.notEqual(code, 0, 'an unpaid gate citing a missing verdict file was accepted');
  assert.match(output, /missing gate evidence/);
});

test('the durable record must actually exist', () => {
  const { code, output } = doctorOver((status) => { unpaid(status).unpaidGate.record = 'docs/NOT_A_REAL_RECORD.md'; });
  assert.notEqual(code, 0, 'an unpaid gate pointing at a missing record was accepted');
  assert.match(output, /missing durable record/);
});

test('an unpaid gate must state what it found, not only what it scored', () => {
  const { code, output } = doctorOver((status) => { delete unpaid(status).unpaidGate.finding; });
  assert.notEqual(code, 0, 'an unpaid gate with no finding was accepted');
  assert.match(output, /must record finding/);
});
