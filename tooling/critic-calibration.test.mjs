/**
 * The calibration corpus, and the ways a measurement of a Critic could flatter it.
 *
 * The tests that matter most are the two degenerate Critics: the one that
 * passes everything, which the false-pass count catches, and the one that
 * rejects everything, which it does not. A corpus that only measured false
 * passes would award a perfect score to a Critic whose answer is always no.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { OUTCOMES, blindedOrder, loadCorpus, measureCalibration, passesBar } from './lib/critic-calibration.mjs';
import { VISUAL_REVIEW_CRITERIA } from './lib/visual-candidates.mjs';

const CORPUS = loadCorpus();
const PIPELINES = JSON.parse(fs.readFileSync('config/agent-pipelines.json', 'utf8'));

/** Score every item the same way, to build a Critic with one fixed habit. */
function uniformVerdicts(score, failingCriteria = ['distinctiveness']) {
  return CORPUS.items.map((item) => ({
    itemId: item.id,
    meanScore: score,
    criterionScores: [{ criterion: 'brand-fit', score }, { criterion: 'coherence', score }],
    failingCriteria: score >= CORPUS.bar.minimumScore ? [] : failingCriteria,
  }));
}

/** A Critic that gets everything right, for the shape the measurement should report. */
function idealVerdicts() {
  return CORPUS.items.map((item) => {
    const damaged = item.expectedOutcome === 'planted-defect';
    const score = damaged ? 5.0 : 8.8;
    return {
      itemId: item.id,
      meanScore: score,
      criterionScores: [{ criterion: 'brand-fit', score }, { criterion: 'coherence', score }],
      failingCriteria: damaged ? (item.expectedFailingCriteria ?? [item.plantedDefect.criterion]) : [],
    };
  });
}

// --- The corpus agrees with the repository it claims to measure --------------------

test('the corpus bar is the visual gate, not a copy that drifted from it', () => {
  assert.equal(CORPUS.bar.minimumScore, PIPELINES.gates.visual.minimumScore);
  assert.equal(CORPUS.bar.minimumCriterionScore, PIPELINES.gates.visual.minimumCriterionScore);
});

test('every criterion the corpus expects to fail is a criterion that exists', () => {
  const known = new Set(VISUAL_REVIEW_CRITERIA.map((criterion) => criterion.id));
  for (const item of CORPUS.items) {
    for (const criterion of item.expectedFailingCriteria ?? []) {
      assert.ok(known.has(criterion), `${item.id} expects a failure on "${criterion}", which is not a review criterion`);
    }
    if (item.plantedDefect?.criterion) {
      assert.ok(known.has(item.plantedDefect.criterion), `${item.id} plants a defect in "${item.plantedDefect.criterion}", which is not a review criterion`);
    }
  }
});

test('every synthetic artifact the corpus names exists and says it is synthetic', () => {
  for (const item of CORPUS.items.filter((entry) => entry.provenance === 'synthetic-fixture')) {
    assert.ok(fs.existsSync(item.artifact.ref), `${item.id} names ${item.artifact.ref}, which does not exist`);
    const html = fs.readFileSync(item.artifact.ref, 'utf8');
    // In the file itself, not only in the manifest. A fixture that travels
    // without its label is one screenshot away from being someone's evidence.
    assert.match(html, /SYNTHETIC/, `${item.artifact.ref} does not declare itself synthetic`);
  }
});

test('every real anchor points at a verdict that exists and records what it really scored', () => {
  for (const item of CORPUS.items.filter((entry) => entry.provenance === 'genuine-business-review')) {
    const verdicts = JSON.parse(fs.readFileSync(item.artifact.ref, 'utf8'));
    const review = verdicts.reviews.find((entry) => entry.candidateId === item.artifact.candidateId);
    assert.ok(review, `${item.id} names candidate ${item.artifact.candidateId}, which ${item.artifact.ref} does not contain`);

    const scores = review.criterionScores.map((entry) => entry.score);
    const mean = Number((scores.reduce((total, value) => total + value, 0) / scores.length).toFixed(2));
    assert.equal(mean, item.observedIndependentReview.mean, `${item.id} records a mean of ${item.observedIndependentReview.mean} and the verdict computes ${mean}`);
    assert.equal(Math.min(...scores), item.observedIndependentReview.criterionFloor, `${item.id} records the wrong criterion floor`);
    assert.equal(review.verdict, item.observedIndependentReview.verdict);
  }
});

test('every anchor really is below the bar it is used as an anchor for', () => {
  for (const item of CORPUS.items.filter((entry) => entry.observedIndependentReview)) {
    const observed = item.observedIndependentReview;
    assert.ok(
      observed.mean < CORPUS.bar.minimumScore || observed.criterionFloor < CORPUS.bar.minimumCriterionScore,
      `${item.id} is used as a below-bar anchor and its recorded review clears the bar`,
    );
  }
});

test('the corpus is stratified rather than a pile', () => {
  const strata = new Set(CORPUS.items.map((item) => item.stratum));
  assert.ok(strata.size >= 10, `only ${strata.size} strata; a corpus that does not vary cannot show what a Critic is blind to`);
  assert.ok(CORPUS.items.some((item) => item.expectedOutcome === 'no-planted-defect'), 'a corpus of nothing but defects rewards a Critic that rejects everything');
  assert.ok(CORPUS.items.some((item) => item.heldOut), 'nothing is held out, so every item can be tuned against');
  // Both halves of the polished-but-weak pair, in different visual languages.
  assert.equal(CORPUS.items.filter((item) => item.stratum === 'polished-commercially-weak').length, 2);
});

// --- The bar is applied the way the gate applies it ----------------------------------

test('a strong mean does not carry one badly failing criterion over the bar', () => {
  const verdict = {
    meanScore: 8.7,
    criterionScores: [{ criterion: 'a', score: 9.8 }, { criterion: 'b', score: 9.8 }, { criterion: 'c', score: 6.4 }],
  };
  assert.equal(passesBar(verdict, CORPUS.bar), false);
  verdict.criterionScores[2].score = 6.5;
  assert.equal(passesBar(verdict, CORPUS.bar), true);
});

test('a verdict with no criterion scores does not pass on its mean alone', () => {
  assert.equal(passesBar({ meanScore: 9.5, criterionScores: [] }, CORPUS.bar), false);
});

// --- The two degenerate Critics --------------------------------------------------------

test('a Critic that passes everything is caught by false passes', () => {
  const measurement = measureCalibration({ corpus: CORPUS, verdicts: uniformVerdicts(9.2) });
  const damaged = CORPUS.items.filter((item) => item.expectedOutcome === 'planted-defect').length;

  assert.equal(measurement.falsePasses.length, damaged);
  assert.equal(measurement.falsePassRate, 1);
});

test('a Critic that rejects everything scores a perfect false-pass rate and fails on separation', () => {
  const measurement = measureCalibration({ corpus: CORPUS, verdicts: uniformVerdicts(2.0) });

  // The number that looks like success.
  assert.equal(measurement.falsePasses.length, 0);
  assert.equal(measurement.falsePassRate, 0);
  // The number that tells the truth.
  assert.equal(measurement.separation, 0);
  assert.equal(measurement.discriminates, false);
});

test('a Critic that separates the two groups is reported as discriminating', () => {
  const measurement = measureCalibration({ corpus: CORPUS, verdicts: idealVerdicts() });

  assert.equal(measurement.falsePasses.length, 0);
  assert.ok(measurement.separation > 3);
  assert.equal(measurement.discriminates, true);
  assert.deepEqual(measurement.misdiagnosed, []);
});

// --- Right answer, wrong reason ----------------------------------------------------------

test('failing an item without naming any criterion the defect sits in is reported', () => {
  const verdicts = idealVerdicts().map((verdict) => (
    verdict.itemId === 'cc-05' ? { ...verdict, failingCriteria: ['imagery-suitability'] } : verdict
  ));
  const measurement = measureCalibration({ corpus: CORPUS, verdicts });

  const entry = measurement.misdiagnosed.find((item) => item.itemId === 'cc-05');
  assert.ok(entry, 'a Critic that failed the empty-but-beautiful site over its imagery was not reported');
  assert.deepEqual(entry.named, ['imagery-suitability']);
});

// --- Missing answers are not approvals -----------------------------------------------------

test('an item the Critic never scored is reported rather than counted', () => {
  const verdicts = idealVerdicts().filter((verdict) => verdict.itemId !== 'cc-04');
  const measurement = measureCalibration({ corpus: CORPUS, verdicts });

  assert.deepEqual(measurement.itemsMissing, ['cc-04']);
  assert.equal(measurement.itemsScored, CORPUS.items.length - 1);
  assert.equal(measurement.falsePasses.length, 0, 'a skipped item must not become a false pass either');
});

test('held-out items can be excluded, and excluding them changes what was considered', () => {
  const all = measureCalibration({ corpus: CORPUS, verdicts: idealVerdicts() });
  const open = measureCalibration({ corpus: CORPUS, verdicts: idealVerdicts(), includeHeldOut: false });

  assert.ok(open.itemsConsidered < all.itemsConsidered);
});

// --- Human agreement is absent and says so ---------------------------------------------------

test('no measurement claims agreement with human scores that do not exist', () => {
  const measurement = measureCalibration({ corpus: CORPUS, verdicts: idealVerdicts() });
  assert.equal(measurement.humanAgreement, null);
  assert.match(measurement.humanAgreementUnavailable, /owner action|panel/);

  const panel = JSON.parse(fs.readFileSync('examples/critic-calibration/panel.v1.json', 'utf8'));
  assert.equal(panel.status, 'awaiting-reviewers');
  assert.deepEqual(panel.scores, []);
  assert.deepEqual(panel.adjudicated, []);
});

// --- Blinding ---------------------------------------------------------------------------------

test('a blinded order is reproducible from its seed and is not the corpus order', () => {
  const first = blindedOrder(CORPUS.items, 'autumn-1');
  const again = blindedOrder(CORPUS.items, 'autumn-1');
  const other = blindedOrder(CORPUS.items, 'autumn-2');

  assert.deepEqual(first, again, 'the same seed must reproduce the same order, or a disputed result cannot be re-examined');
  assert.notDeepEqual(first.map((entry) => entry.itemId), other.map((entry) => entry.itemId));
  assert.notDeepEqual(first.map((entry) => entry.itemId), CORPUS.items.map((item) => item.id), 'the blinded order is the corpus order, so nothing is blinded');
  assert.equal(first.length, CORPUS.items.length);
});

test('blinding without a seed is refused', () => {
  assert.throws(() => blindedOrder(CORPUS.items, null), /cannot be reproduced/);
});

// --- The corpus refuses to be mislabelled ---------------------------------------------------------

test('every item declares a provenance and an outcome the loader accepts', () => {
  for (const item of CORPUS.items) {
    assert.ok(['synthetic-fixture', 'genuine-business-review'].includes(item.provenance));
    assert.ok(OUTCOMES.includes(item.expectedOutcome));
    if (item.expectedOutcome === 'planted-defect') assert.ok(item.plantedDefect?.description);
  }
});
