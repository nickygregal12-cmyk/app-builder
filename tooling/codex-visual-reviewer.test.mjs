import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  REVIEWER_VENDOR,
  criterionCoverage,
  evidenceBinding,
  extractVerdictJson,
  normaliseVerdict,
  reviewCandidate,
  reviewPacketCandidates,
} from './lib/codex-visual-reviewer.mjs';

/**
 * No test in this file runs Codex.
 *
 * The transport is injected everywhere, so the suite exercises the part that
 * decides whether a verdict may be believed without spending a credit or
 * depending on a third party being reachable from CI. What the real CLI does is
 * a separate, operator-run concern; what this module does with the answer is
 * the part that has to hold every time.
 */

const CRITERIA = [
  { id: 'credibility', question: 'Would the customer trust this business more?' },
  { id: 'responsive-quality', question: 'Is the mobile rendering a designed composition?' },
];

function capture(id, viewport) {
  return { id, route: '/', viewport, state: {}, file: `captures/${id}.png`, sha256: `sha-${id}` };
}

function packetWith({ viewports = ['desktop', 'mobile'], mustAddress = [], status = 'clear' } = {}) {
  return {
    business: 'NBM',
    setId: 'set-1',
    projectId: 'project-1',
    qualityGate: { minimumScore: 8.5, minimumCriterionScore: 7 },
    criteria: CRITERIA,
    candidates: [{
      candidateId: 'candidate-a',
      directionId: 'structured-practice',
      directionLabel: 'Structured practice',
      compositionHash: 'hash-a',
      gate: { status, blocking: status === 'blocked' ? [{ rule: 'unreadable-accent' }] : [], mustAddress },
      captures: viewports.map((viewport, index) => capture(`cap-${index}`, viewport)),
    }],
  };
}

/** A packet on disk, with real files behind the captures it references. */
function packetDirectory(packet) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-review-'));
  fs.mkdirSync(path.join(dir, 'captures'), { recursive: true });
  for (const candidate of packet.candidates) {
    for (const entry of candidate.captures) fs.writeFileSync(path.join(dir, entry.file), 'png');
  }
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(packet));
  return dir;
}

const goodAnswer = (extra = {}) => () => JSON.stringify({
  verdict: 'pass',
  model: 'gpt-5.6',
  rationale: 'Reads as a professional practice.',
  criterionScores: [
    { criterion: 'credibility', score: 9 },
    { criterion: 'responsive-quality', score: 9 },
  ],
  failingCriteria: [],
  blockingConcerns: [],
  addressedRules: [],
  ...extra,
});

// --- The identity, which is the only reason any of this counts -------------

test('the reviewer stamps its own vendor and refuses one it is handed', () => {
  const packet = packetWith();
  const dir = packetDirectory(packet);

  const verdict = reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: goodAnswer(), version: () => 'codex-cli 0.150.1' });
  assert.equal(verdict.reviewedBy.vendor, REVIEWER_VENDOR);
  assert.equal(verdict.reviewedBy.vendor, 'openai');
  assert.equal(verdict.reviewedBy.model, 'gpt-5.6');

  // The point of the module. A caller cannot choose who reviewed.
  for (const field of ['reviewedBy', 'vendor', 'model', 'role']) {
    assert.throws(
      () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: goodAnswer(), [field]: 'anthropic' }),
      /cannot be supplied to the Codex reviewer/,
      `${field} must be refused, not ignored`,
    );
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a supplied vendor cannot survive even when it names the vendor the module would stamp', () => {
  const packet = packetWith();
  const dir = packetDirectory(packet);
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: goodAnswer(), vendor: 'openai' }),
    /self-report/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the reviewer will not call a provider without an explicit authorisation', () => {
  const packet = packetWith();
  const dir = packetDirectory(packet);
  let called = false;
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', runCodex: () => { called = true; return goodAnswer()(); } }),
    /refuses to run without an explicit authorisation/,
  );
  assert.equal(called, false, 'an unauthorised review must not reach the provider at all');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Coverage: the half a reviewer cannot be trusted to self-report --------

test('a criterion the captures do not cover is unproven rather than scored', () => {
  const coverage = criterionCoverage(CRITERIA, [capture('a', 'desktop')]);
  const responsive = coverage.find((entry) => entry.id === 'responsive-quality');
  assert.equal(responsive.covered, false);
  assert.equal(responsive.status, 'unproven');
  assert.deepEqual(responsive.missingViewports, ['mobile']);
  assert.match(responsive.detail, /needs desktop and mobile/);

  // And the criterion that only needs a picture is fine with one.
  assert.equal(coverage.find((entry) => entry.id === 'credibility').status, 'evidenced');
});

test('two widths that are not the two widths do not cover a criterion that names them', () => {
  // The defect this guards. `responsive-quality` asks whether the mobile
  // rendering is designed or merely narrowed. Desktop and tablet are two
  // distinct viewports and satisfy any count-based rule, while photographing no
  // phone at all — so a count would have called this criterion evidenced and
  // let a reviewer pass a mobile rendering nobody has seen.
  const coverage = criterionCoverage(CRITERIA, [capture('a', 'desktop'), capture('b', 'tablet')]);
  const responsive = coverage.find((entry) => entry.id === 'responsive-quality');
  assert.equal(responsive.covered, false, 'two non-phone widths cannot answer a question about the phone');
  assert.deepEqual(responsive.missingViewports, ['mobile']);

  // And the phone alone is equally not an answer: the question is comparative.
  const phoneOnly = criterionCoverage(CRITERIA, [capture('a', 'mobile')]);
  assert.equal(phoneOnly.find((entry) => entry.id === 'responsive-quality').covered, false);
  assert.deepEqual(phoneOnly.find((entry) => entry.id === 'responsive-quality').missingViewports, ['desktop']);

  // The pair the criterion actually names does cover it.
  const both = criterionCoverage(CRITERIA, [capture('a', 'desktop'), capture('b', 'mobile')]);
  assert.equal(both.find((entry) => entry.id === 'responsive-quality').status, 'evidenced');
});

test('imagery suitability needs the widths it claims to judge framing at', () => {
  const criteria = [{ id: 'imagery-suitability', question: 'Are the photographs framed well at every width?' }];
  assert.equal(criterionCoverage(criteria, [capture('a', 'desktop')])[0].covered, false);
  assert.equal(criterionCoverage(criteria, [capture('a', 'desktop'), capture('b', 'mobile')])[0].covered, true);
});

test('a pass is refused while any scoped criterion is unproven', () => {
  const packet = packetWith({ viewports: ['desktop'] });
  const dir = packetDirectory(packet);
  const answer = () => JSON.stringify({
    verdict: 'pass',
    rationale: 'Looks good.',
    criterionScores: [{ criterion: 'credibility', score: 9 }],
    addressedRules: [],
  });
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: answer }),
    /unproven on this evidence/,
  );

  // The same evidence supports rework, which is the honest verdict here.
  const rework = reviewCandidate({
    packet,
    packetDir: dir,
    authorised: true,
    candidateId: 'candidate-a',
    runCodex: () => JSON.stringify({ verdict: 'rework', rationale: 'Needs a mobile look.', criterionScores: [{ criterion: 'credibility', score: 9 }], addressedRules: [] }),
    version: () => 'codex-cli',
  });
  assert.equal(rework.verdict, 'rework');
  assert.deepEqual(rework.unprovenCriteria.map((entry) => entry.criterion), ['responsive-quality']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a reviewer that scores evidence it was not given is refused', () => {
  const packet = packetWith({ viewports: ['desktop'] });
  const dir = packetDirectory(packet);
  const answer = () => JSON.stringify({
    verdict: 'rework',
    rationale: 'x',
    criterionScores: [{ criterion: 'credibility', score: 9 }, { criterion: 'responsive-quality', score: 9 }],
    addressedRules: [],
  });
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: answer }),
    /which the captures do not cover/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a reviewer silent about a DesignLint warning is refused', () => {
  const packet = packetWith({ mustAddress: ['repetitive-section-presentation'] });
  const dir = packetDirectory(packet);
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: goodAnswer() }),
    /may not be silent about one/,
  );

  const engaged = reviewCandidate({
    packet,
    packetDir: dir,
    candidateId: 'candidate-a',
    authorised: true,
    runCodex: goodAnswer({ addressedRules: [{ rule: 'repetitive-section-presentation', response: 'Disagree — the sections differ in density.' }] }),
  });
  assert.deepEqual(engaged.addressedRules, ['repetitive-section-presentation']);
  assert.equal(engaged.addressedRuleNotes[0].response, 'Disagree — the sections differ in density.');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- Binding, refusals and parsing ----------------------------------------

test('a verdict is bound to the exact captures it was issued over', () => {
  const before = evidenceBinding(packetWith().candidates[0]);
  const changed = packetWith();
  changed.candidates[0].captures[0].sha256 = 'sha-different';
  assert.notEqual(before.captureDigest, evidenceBinding(changed.candidates[0]).captureDigest, 'recapturing must not silently inherit an old verdict');
  assert.equal(before.captureCount, 2);
});

test('a deterministically blocked candidate is not sent for judgement', () => {
  const packet = packetWith({ status: 'blocked' });
  const dir = packetDirectory(packet);
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: goodAnswer() }),
    /not a matter for review/,
  );
  const decided = reviewPacketCandidates({ packetDir: dir, authorised: true, runCodex: goodAnswer() });
  assert.deepEqual(decided.reviews, []);
  assert.deepEqual(decided.skipped, [{ candidateId: 'candidate-a', reason: 'deterministically blocked' }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a packet that references a capture it does not contain is refused', () => {
  const packet = packetWith();
  const dir = packetDirectory(packet);
  fs.rmSync(path.join(dir, 'captures/cap-0.png'));
  assert.throws(
    () => reviewCandidate({ packet, packetDir: dir, candidateId: 'candidate-a', authorised: true, runCodex: goodAnswer() }),
    /A review of missing pictures is not a review/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a verdict is read out of ordinary CLI output but never repaired', () => {
  assert.equal(extractVerdictJson('banner\n```json\n{"verdict":"pass"}\n```\n').verdict, 'pass');
  assert.equal(extractVerdictJson('noise {"verdict":"rework"} trailing').verdict, 'rework');
  assert.throws(() => extractVerdictJson('I could not read the images.'), /returned no JSON verdict/);
  assert.throws(() => extractVerdictJson('{"verdict": pass}'), SyntaxError);
});

test('an unknown verdict word is refused rather than mapped to the nearest one', () => {
  const packet = packetWith();
  assert.throws(
    () => normaliseVerdict({ verdict: 'approved', criterionScores: [] }, { candidate: packet.candidates[0], coverage: criterionCoverage(CRITERIA, packet.candidates[0].captures), model: 'm' }),
    /unknown verdict/,
  );
});

test('an out-of-range score is refused', () => {
  const packet = packetWith();
  const dir = packetDirectory(packet);
  assert.throws(
    () => reviewCandidate({
      packet,
      packetDir: dir,
      candidateId: 'candidate-a',
      authorised: true,
      runCodex: goodAnswer({ criterionScores: [{ criterion: 'credibility', score: 11 }, { criterion: 'responsive-quality', score: 9 }] }),
    }),
    /a number from 0 to 10/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
