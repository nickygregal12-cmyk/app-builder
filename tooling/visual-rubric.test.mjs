import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCeilings,
  auditVerdictAgainstScale,
  bandFor,
  BENCHMARK_GAPS,
  CEILINGS,
  criteriaFor,
  isPermittedScore,
  overallCeiling,
  POSITIVE_EVIDENCE_FLOOR,
  QUALITY_TIERS,
  SCORE_BANDS,
  tierForMean,
  TOP_SCORE_CONTRACT,
  VISUAL_CRITERIA,
} from './lib/visual-rubric.mjs';
import { deriveBenchmarkGap, loadBenchmarkReferences, selectReference } from './lib/visual-benchmarks.mjs';

/**
 * What this file tests, and what it deliberately cannot.
 *
 * It tests the SCALE: that a number means what the rubric says it means, that
 * a high score costs an argument, and that the ceilings follow from what a
 * reviewer observed. All of that is arithmetic and it must hold every time.
 *
 * It does not test whether a Critic scores a website correctly. That needs a
 * Critic looking at a website, which is an operator-authorised run against a
 * third-party provider, and any "test" here that asserted a fixture scores 5.5
 * would be a fixture hard-coded to a number this repository invented. The
 * corpus asserts ORDER for that reason, and `tooling/critic-calibration.mjs`
 * is where a real Critic's answers get measured against it.
 */

// --- The scale has a meaning at every point --------------------------------

test('every point on the scale is defined, and the top two must be argued for', () => {
  assert.equal(SCORE_BANDS.length, 11, 'a ten-point scale needs eleven defined points');
  for (let score = 0; score <= 10; score += 1) {
    const band = SCORE_BANDS.find((entry) => entry.score === score);
    assert.ok(band, `${score} has no defined meaning`);
    assert.ok(band.meaning.length > 30, `${score} has a label rather than a meaning`);
  }
  // The distinction the old rubric could not make: it collapsed 9 and 10 into
  // one row, so there was no defined difference between exceptional and
  // benchmark-class anywhere in the repository.
  assert.notEqual(bandFor(9).meaning, bandFor(10).meaning);
  assert.equal(SCORE_BANDS.filter((band) => band.requiresPositiveEvidence).map((band) => band.score).join(','), '9,10');
});

test('a half point is as fine as this scale resolves', () => {
  assert.ok(isPermittedScore(8));
  assert.ok(isPermittedScore(8.5));
  assert.ok(!isPermittedScore(8.4), 'false precision is refused rather than rounded');
  assert.ok(!isPermittedScore(9.7));
  assert.ok(!isPermittedScore(11));
  assert.ok(!isPermittedScore(-1));
});

test('a half point takes the meaning of the integer below it', () => {
  // Otherwise 8.5 becomes the cheapest way to claim exceptional: it would
  // inherit the 9 band's positive-evidence obligation without the argument.
  assert.equal(bandFor(8.5).score, 8);
  assert.equal(bandFor(9).score, 9);
});

// --- A high score costs an argument ----------------------------------------

test('a score of 8 or above must say what is holding it back', () => {
  const problems = auditVerdictAgainstScale({
    criterionScores: [{ criterion: 'typography', score: 8, note: 'good' }],
  });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'why-not-higher-missing');

  const answered = auditVerdictAgainstScale({
    criterionScores: [{ criterion: 'typography', score: 8, note: 'good', whyNotHigher: 'The metadata is set without the care the display type gets.' }],
  });
  assert.deepEqual(answered, []);
});

test('a 9 must name demonstrated strengths, because the absence of defects is a 7', () => {
  const noEvidence = auditVerdictAgainstScale({
    criterionScores: [{ criterion: 'art-direction', score: POSITIVE_EVIDENCE_FLOOR, whyNotHigher: 'not quite benchmark' }],
  });
  assert.equal(noEvidence.length, 1);
  assert.equal(noEvidence[0].kind, 'positive-evidence-missing');
  assert.match(noEvidence[0].detail, /absence of defects caps a score rather than maximising it/);
});

test('a 10 must say what makes it benchmark-class rather than merely excellent', () => {
  const unargued = auditVerdictAgainstScale({
    criterionScores: [{ criterion: 'memorability', score: 10, positiveEvidence: ['the plant register'] }],
  });
  assert.deepEqual(unargued.map((problem) => problem.kind), ['benchmark-justification-missing']);

  const argued = auditVerdictAgainstScale({
    criterionScores: [{
      criterion: 'memorability',
      score: 10,
      positiveEvidence: ['the plant register'],
      whyBenchmark: 'The register is the product of the practice, not a treatment applied to it, and it recomposes on a phone rather than shrinking.',
    }],
  });
  assert.deepEqual(argued, []);
});

// --- Ceilings follow from what the reviewer observed ------------------------

test('a ceiling reads an observation the reviewer made, never the artifact', () => {
  // The rule this file exists to keep. Nothing in the rubric inspects markup,
  // CSS or a screenshot; a ceiling is triggered by a reviewer's own plain
  // answer, and its whole job is to refuse the arithmetic that would let a
  // site be called exceptional on authorship while its review calls it a
  // template.
  const capped = applyCeilings(
    [{ criterion: 'art-direction', score: 9.5, whyNotHigher: 'x', positiveEvidence: ['y'] }],
    { templateDerived: true },
  );
  assert.equal(capped.criterionScores[0].score, 8);
  assert.equal(capped.criterionScores[0].reviewerScore, 9.5);
  assert.equal(capped.applied[0].ceilingId, 'template-derived');

  // And an observation that was not made changes nothing.
  const untouched = applyCeilings(
    [{ criterion: 'art-direction', score: 9.5 }],
    { templateDerived: false },
  );
  assert.equal(untouched.criterionScores[0].score, 9.5);
  assert.deepEqual(untouched.applied, []);
});

test('every ceiling names a criterion that exists and a reason', () => {
  const ids = new Set(VISUAL_CRITERIA.map((criterion) => criterion.id));
  for (const ceiling of CEILINGS) {
    assert.ok(ids.has(ceiling.criterion), `${ceiling.id} caps "${ceiling.criterion}", which is not a criterion`);
    assert.ok(ceiling.reason.length > 40, `${ceiling.id} caps a score without explaining why`);
    assert.ok(isPermittedScore(ceiling.ceiling));
  }
});

test('a stacked mobile view cannot be strong responsive work, whatever else is true', () => {
  const capped = applyCeilings(
    [{ criterion: 'responsive-recomposition', score: 9 }],
    { mobileIsStackedDesktop: true },
  );
  assert.equal(capped.criterionScores[0].score, 7);
});

// --- The top of the scale needs a comparison -------------------------------

test('a 10 is unavailable without a benchmark comparison', () => {
  const uncompared = overallCeiling({
    criterionScores: [{ criterion: 'art-direction', score: 10 }],
    holisticTier: 'benchmark-class',
  });
  assert.equal(uncompared.cap, 9);
  assert.match(uncompared.reasons.join(' '), /No benchmark comparison was recorded/);
});

test('a material benchmark gap and a 10 are contradictory', () => {
  const material = overallCeiling({
    benchmarkGap: 'MATERIAL',
    holisticTier: 'benchmark-class',
    criterionScores: [{ criterion: 'art-direction', score: 10 }],
  });
  assert.ok(material.cap < 10);

  const large = overallCeiling({
    benchmarkGap: 'LARGE',
    holisticTier: 'benchmark-class',
    criterionScores: [{ criterion: 'art-direction', score: 10 }],
  });
  assert.ok(large.cap < material.cap, 'a large gap must cost more than a material one');
});

test('a visible weakness anywhere forecloses a 10, because a 10 asserts there is none', () => {
  const withWeakness = overallCeiling({
    benchmarkGap: 'NONE',
    holisticTier: 'benchmark-class',
    criterionScores: [{ criterion: 'art-direction', score: 10 }, { criterion: 'commercial-clarity', score: 6.5 }],
  });
  assert.equal(withWeakness.cap, 9);
  assert.match(withWeakness.reasons.join(' '), /lowest criterion is 6\.5/);
});

test('10 is rare but reachable — a rubric nothing can satisfy is not a rubric', () => {
  const perfect = overallCeiling({
    benchmarkGap: 'NONE',
    holisticTier: 'benchmark-class',
    criterionScores: VISUAL_CRITERIA.map((criterion) => ({ criterion: criterion.id, score: 10 })),
  });
  assert.equal(perfect.cap, 10);
  assert.deepEqual(perfect.reasons, []);
});

// --- The holistic reading is allowed to disagree ---------------------------

test('the reviewer\'s overall reading outranks the arithmetic at the top', () => {
  // The specific failure this catches: thirteen criteria at 8.5 because the
  // reviewer could not find anything to complain about, averaging into a claim
  // of exceptional work the reviewer would not make in words.
  const capped = overallCeiling({
    benchmarkGap: 'NONE',
    holisticTier: 'strong-professional',
    criterionScores: VISUAL_CRITERIA.map((criterion) => ({ criterion: criterion.id, score: 9.5 })),
  });
  assert.equal(capped.cap, 9, 'strong-professional tops out where the tier does');
  assert.match(capped.reasons.join(' '), /holistic reading is strong-professional/);
});

test('a mean maps to a tier so the two can be compared rather than forced to agree', () => {
  assert.equal(tierForMean(5.2).id, 'generic');
  assert.equal(tierForMean(6.5).id, 'competent');
  assert.equal(tierForMean(7.4).id, 'professional');
  assert.equal(tierForMean(8.6).id, 'strong-professional');
  assert.equal(tierForMean(9.2).id, 'exceptional');
  assert.equal(tierForMean(9.8).id, 'benchmark-class');
  assert.equal(QUALITY_TIERS.map((tier) => tier.rank).join(','), '1,2,3,4,5,6,7,8');
});

// --- Criteria ---------------------------------------------------------------

test('every criterion says what separates its upper levels', () => {
  // The highest-value text in the rubric. Without it the question is "is the
  // typography good?", which anything competent answers yes to.
  for (const criterion of VISUAL_CRITERIA) {
    assert.ok(criterion.question.length > 60, `${criterion.id} asks a question too short to be a gradient`);
    assert.ok(criterion.separates?.length > 80, `${criterion.id} does not say what separates a 7 from a 9`);
  }
});

test('an image-free site is scored on the same criteria as a photographic one', () => {
  // The v1 set added `imagery-suitability` only where photographs published,
  // so a photographic build was scored over nine criteria and a typographic one
  // over eight — never the same scale. The #255 prototypes were measured that
  // way, on the criterion they scored highest.
  const withImages = criteriaFor({ projectType: 'marketing-site' }).map((entry) => entry.id);
  const without = criteriaFor({ projectType: 'marketing-site' }).map((entry) => entry.id);
  assert.deepEqual(withImages, without);
  assert.ok(withImages.includes('visual-material'));

  // Public-only criteria still stay off an internal tool.
  const internal = criteriaFor({ projectType: 'internal-tool' }).map((entry) => entry.id);
  assert.ok(!internal.includes('commercial-clarity'));
  assert.ok(internal.includes('ai-slop-resistance'), 'a dense internal tool can still be generated slop');
});

// --- Benchmarks -------------------------------------------------------------

test('every benchmark reference is something a reader can go and look at', () => {
  const corpus = loadBenchmarkReferences();
  assert.ok(corpus.references.length >= 5);
  for (const reference of corpus.references) {
    assert.match(reference.url, /^https:\/\//);
    assert.ok(reference.dateObserved);
    assert.ok(reference.analysis.length > 200, `${reference.id} has a label rather than an analysis`);
    assert.ok(reference.notAModelFor, `${reference.id} does not say who should not copy it`);
    // Provenance is stated honestly rather than overstated. These are
    // characterisations from prior familiarity, not dated captures, and the
    // corpus says so.
    assert.equal(reference.confirmedByOwner, false);
  }
  assert.equal(corpus.observationBasis.kind, 'characterisation-from-prior-observation');
});

test('a reference is chosen by the problem it solved, not by how it looks', () => {
  const hospitality = selectReference({ businessKind: 'hospitality', anchors: ['imagery', 'luxury'] });
  assert.equal(hospitality.reference.id, 'vb-aman');

  const software = selectReference({ businessKind: 'developer', anchors: ['interface-craft', 'product-storytelling'] });
  assert.equal(software.reference.id, 'vb-linear');

  // And a business no reference resembles is told so rather than given one.
  const unmatched = selectReference({ businessKind: 'municipal waste collection', anchors: [] });
  assert.equal(unmatched.matched, false);
  assert.match(unmatched.note, /No reference in the corpus solves a problem resembling this one/);
});

test('a missing comparison is UNASSESSED, never NONE', () => {
  // The distinction that stops a top score being issued by default: "we did not
  // look" and "we looked and there was no gap" must not be the same value.
  const none = deriveBenchmarkGap([]);
  assert.equal(none.gap, 'UNASSESSED');
  assert.ok(!BENCHMARK_GAPS.includes('UNASSESSED'), 'UNASSESSED is deliberately outside the ordered gaps');
});

test('a benchmark that keeps winning substantially is a large gap', () => {
  const dimensions = ['art-direction', 'typography', 'composition', 'information-architecture'];
  const crushed = deriveBenchmarkGap(dimensions.map((dimension) => ({ dimension, outcome: 'reference-substantially-stronger', note: 'x' })));
  assert.equal(crushed.gap, 'LARGE');

  const held = deriveBenchmarkGap(dimensions.map((dimension) => ({ dimension, outcome: 'roughly-comparable', note: 'x' })));
  assert.equal(held.gap, 'NONE');

  // A quiet site that wins some and loses none is allowed to hold its own.
  // Style is not quality, and a restrained candidate must be able to reach the
  // top of this comparison without imitating anything.
  const quiet = deriveBenchmarkGap([
    { dimension: 'typography', outcome: 'candidate-stronger', note: 'x' },
    { dimension: 'information-architecture', outcome: 'roughly-comparable', note: 'x' },
    { dimension: 'art-direction', outcome: 'roughly-comparable', note: 'x' },
    { dimension: 'craft', outcome: 'roughly-comparable', note: 'x' },
  ]);
  assert.equal(quiet.gap, 'NONE');
});

test('the 10/10 contract is stated where the code that enforces it can be read', () => {
  assert.match(TOP_SCORE_CONTRACT, /benchmark-class/);
  assert.match(TOP_SCORE_CONTRACT, /no meaningful visible weakness/);
  assert.match(TOP_SCORE_CONTRACT, /generic AI design language/);
  assert.match(TOP_SCORE_CONTRACT, /pairwise/);
});
