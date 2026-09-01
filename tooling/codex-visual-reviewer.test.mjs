import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  REVIEWER_VENDOR,
  criterionCoverage,
  evidenceBinding,
  evidenceCeiling,
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
  { id: 'brand-fit', question: 'Does the visual language feel correct for this organisation?' },
  { id: 'responsive-recomposition', question: 'Is the narrow rendering a designed composition in its own right?' },
];

// Route matters as much as width now. Coverage used to be computed from
// viewports alone, so two captures of the home page satisfied every criterion
// including responsive quality — a single well-tuned page could carry a whole
// multi-page site. The default here is two routes so the width rules stay the
// thing under test; the route rule has its own test below.
function capture(id, viewport, route = '/') {
  return { id, route, viewport, state: {}, file: `captures/${id}-${route.replace(/\W/g, '') || 'home'}.png`, sha256: `sha-${id}-${route}` };
}

const bothRoutes = (viewport) => [capture(`${viewport}-home`, viewport, '/'), capture(`${viewport}-about`, viewport, '/about')];

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
      captures: viewports.flatMap((viewport) => bothRoutes(viewport)),
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
  holisticTier: 'strong-professional',
  criterionScores: [
    { criterion: 'brand-fit', score: 9, whyNotHigher: 'The voice is right but not yet unmistakable.', positiveEvidence: ['The register of the type matches the practice.'] },
    { criterion: 'responsive-recomposition', score: 9, whyNotHigher: 'The phone header still costs more height than it needs.', positiveEvidence: ['The register regroups rather than stacking.'] },
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
  const responsive = coverage.find((entry) => entry.id === 'responsive-recomposition');
  assert.equal(responsive.covered, false);
  assert.equal(responsive.status, 'unproven');
  assert.deepEqual(responsive.missingViewports, ['mobile']);
  assert.match(responsive.detail, /needs desktop and mobile/);

  // And the criterion that only needs a picture is fine with one.
  assert.equal(coverage.find((entry) => entry.id === 'brand-fit').status, 'evidenced');
});

test('two widths that are not the two widths do not cover a criterion that names them', () => {
  // The defect this guards. `responsive-quality` asks whether the mobile
  // rendering is designed or merely narrowed. Desktop and tablet are two
  // distinct viewports and satisfy any count-based rule, while photographing no
  // phone at all — so a count would have called this criterion evidenced and
  // let a reviewer pass a mobile rendering nobody has seen.
  const coverage = criterionCoverage(CRITERIA, [capture('a', 'desktop', '/'), capture('b', 'tablet', '/about')]);
  const responsive = coverage.find((entry) => entry.id === 'responsive-recomposition');
  assert.equal(responsive.covered, false, 'two non-phone widths cannot answer a question about the phone');
  assert.deepEqual(responsive.missingViewports, ['mobile']);

  // And the phone alone is equally not an answer: the question is comparative.
  const phoneOnly = criterionCoverage(CRITERIA, [capture('a', 'mobile', '/'), capture('b', 'mobile', '/about')]);
  assert.equal(phoneOnly.find((entry) => entry.id === 'responsive-recomposition').covered, false);
  assert.deepEqual(phoneOnly.find((entry) => entry.id === 'responsive-recomposition').missingViewports, ['desktop']);

  // The pair the criterion actually names does cover it.
  const both = criterionCoverage(CRITERIA, [capture('a', 'desktop', '/'), capture('b', 'mobile', '/about')]);
  assert.equal(both.find((entry) => entry.id === 'responsive-recomposition').status, 'evidenced');
});

test('visual material needs the widths it claims to judge framing at', () => {
  const criteria = [{ id: 'visual-material', question: 'Is the material framed well at every width?' }];
  assert.equal(criterionCoverage(criteria, [capture('a', 'desktop')])[0].covered, false);
  assert.equal(criterionCoverage(criteria, [capture('a', 'desktop'), capture('b', 'mobile')])[0].covered, true);
});

test('a home page cannot prove a question about a website', () => {
  // The hole this closes. Coverage was computed from viewports alone, so two
  // captures of the home page — desktop and mobile — satisfied every criterion
  // including responsive recomposition and information architecture. A single
  // well-tuned page could carry a whole multi-page site to a top score, which
  // is the one claim a home page cannot support.
  const criteria = [{ id: 'information-architecture', question: 'What belongs where?' }];
  const homeOnly = criterionCoverage(criteria, [capture('a', 'desktop', '/'), capture('b', 'mobile', '/')]);
  assert.equal(homeOnly[0].covered, false);
  assert.match(homeOnly[0].detail, /1 route/);

  const threeRoutes = criterionCoverage(criteria, [
    capture('a', 'desktop', '/'), capture('b', 'desktop', '/work'), capture('c', 'desktop', '/contact'),
  ]);
  assert.equal(threeRoutes[0].covered, true);
});

test('the evidence a review rests on caps what it may claim', () => {
  const thin = evidenceCeiling([capture('a', 'desktop', '/')]);
  assert.equal(thin.cap, 7, 'one page at one width supports a professional reading and no more');

  const wide = evidenceCeiling([
    capture('a', 'desktop', '/'), capture('b', 'mobile', '/'),
    capture('c', 'desktop', '/work'), capture('d', 'desktop', '/studio'), capture('e', 'desktop', '/contact'),
  ]);
  assert.equal(wide.cap, 10, 'a benchmark claim needs the website, and this is the website');
});

test('a pass is refused while any scoped criterion is unproven', () => {
  const packet = packetWith({ viewports: ['desktop'] });
  const dir = packetDirectory(packet);
  const answer = () => JSON.stringify({
    verdict: 'pass',
    rationale: 'Looks good.',
    criterionScores: [{ criterion: 'brand-fit', score: 9, whyNotHigher: 'right, not unmistakable', positiveEvidence: ['type register matches the practice'] }],
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
    runCodex: () => JSON.stringify({ verdict: 'rework', rationale: 'Needs a mobile look.', criterionScores: [{ criterion: 'brand-fit', score: 9, whyNotHigher: 'right, not unmistakable', positiveEvidence: ['type register matches the practice'] }], addressedRules: [] }),
    version: () => 'codex-cli',
  });
  assert.equal(rework.verdict, 'rework');
  assert.deepEqual(rework.unprovenCriteria.map((entry) => entry.criterion), ['responsive-recomposition']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a reviewer that scores evidence it was not given is refused', () => {
  const packet = packetWith({ viewports: ['desktop'] });
  const dir = packetDirectory(packet);
  const answer = () => JSON.stringify({
    verdict: 'rework',
    rationale: 'x',
    criterionScores: [{ criterion: 'brand-fit', score: 9, whyNotHigher: 'right, not unmistakable', positiveEvidence: ['type register matches the practice'] }, { criterion: 'responsive-recomposition', score: 9, whyNotHigher: 'header height', positiveEvidence: ['regrouped'] }],
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
  assert.equal(before.captureCount, 4);
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
  fs.rmSync(path.join(dir, packet.candidates[0].captures[0].file));
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
      runCodex: goodAnswer({ criterionScores: [{ criterion: 'brand-fit', score: 11 }, { criterion: 'responsive-recomposition', score: 9, whyNotHigher: 'header height', positiveEvidence: ['regrouped'] }] }),
    }),
    /a number from 0 to 10/,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- A route minimum cannot exceed the routes the artifact has -------------

test('a single-page artifact is not held to a three-route minimum', () => {
  // `minRoutes` exists to stop a home page standing in for pages that exist and
  // nobody looked at. A one-page document has no other pages to stand in for,
  // and marking it unproven asks for evidence it cannot produce — failing closed
  // for a reason nobody can act on.
  const criteria = [
    { id: 'information-architecture', question: 'What belongs where?' },
    { id: 'composition-pacing', question: 'How is it paced?' },
  ];
  const onePage = [capture('a', 'desktop', '/'), capture('b', 'mobile', '/')];

  const unaware = criterionCoverage(criteria, onePage);
  assert.equal(unaware[0].covered, false, 'with no declared route count the conservative minimum still applies');

  const aware = criterionCoverage(criteria, onePage, { artifactRouteCount: 1 });
  assert.equal(aware[0].covered, true);
  assert.equal(aware[1].covered, true);
});

test('a declared route count cannot excuse pages nobody photographed', () => {
  // The guard that keeps the relaxation honest. The count is what the ARTIFACT
  // has, never what the capture run managed — otherwise a lazy capture is
  // self-justifying: photograph one page, declare one page, satisfy everything.
  const criteria = [{ id: 'information-architecture', question: 'What belongs where?' }];
  const homeOnly = criterionCoverage(criteria, [capture('a', 'desktop', '/')], { artifactRouteCount: 6 });
  assert.equal(homeOnly[0].covered, false);
  assert.match(homeOnly[0].detail, /1 route/);
});

test('a fully photographed one-page artifact is complete evidence, not thin evidence', () => {
  const onePage = [capture('a', 'desktop', '/'), capture('b', 'mobile', '/')];

  assert.equal(evidenceCeiling(onePage).cap, 7, 'undeclared, one route reads as thin evidence however many widths it carries');

  const declared = evidenceCeiling(onePage, { artifactRouteCount: 1 });
  assert.equal(declared.cap, 10, 'a one-page site can be excellent; capping it for having one page judges page count');
  assert.equal(declared.coversWholeArtifact, true);
  assert.match(declared.detail, /covers all 1 route/);

  // And a six-route site photographed once is still thin.
  const partial = evidenceCeiling(onePage, { artifactRouteCount: 6 });
  assert.equal(partial.coversWholeArtifact, false);
  assert.ok(partial.cap < 10);
});
