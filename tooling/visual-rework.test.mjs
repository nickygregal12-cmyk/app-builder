import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessProfessionalThreshold,
  decideCandidateSet,
  loadVisualQualityGate,
  promoteCandidate,
  recordReview,
  reviewCriteriaFor,
  scoreVisualReview,
  summariseCandidateSet,
} from './lib/visual-candidates.mjs';
import {
  attachRevisedCandidate,
  planVisualRework,
  remainingReworkBudget,
  reworkOverrides,
} from './lib/visual-rework.mjs';

const gate = loadVisualQualityGate(process.cwd());
const criteria = reviewCriteriaFor({ projectType: 'marketing-site', publishesImagery: false });

const FROZEN = 'a'.repeat(64);

function candidate(id, overrides = {}) {
  return {
    candidateId: id,
    directionId: id.replace('candidate-', ''),
    directionLabel: id,
    state: 'deterministic-pass',
    iteration: 0,
    artDirection: {
      dimensions: {
        heroStrategy: 'split',
        gridFamily: 'symmetric',
        headingTreatment: 'ruled',
        ctaPlacement: 'closing',
        distinctiveMoment: 'figure-index',
        layoutVariance: 'alternating',
        visualDistinctiveness: 'balanced',
        motionIntensity: 'subtle',
      },
      responsive: { mobileHero: 'copy-first', navigation: 'disclosure', mobileSectionOrder: 'as-desktop', mobileDensity: 'as-desktop', mobileMotion: 'as-desktop' },
    },
    signature: { axes: {}, sequence: [{ pageId: 'home', presentation: ['hero:primary', 'item-grid:cards'] }] },
    compositionHash: FROZEN,
    gate: { status: 'clear', blocking: [], mustAddress: [] },
    review: null,
    outcome: 'pending',
    rationale: null,
    reworkOwner: null,
    provenance: { createdBy: 'visual-direction', reviewedBy: null, promotedBy: null, decidedAt: null },
    ...overrides,
  };
}

function set(candidates) {
  return {
    schemaVersion: 1,
    setId: `candidates-${'b'.repeat(16)}`,
    projectId: 'project-a',
    createdAt: '2026-08-26T10:00:00.000Z',
    frozenTruth: { projectType: 'marketing-site', manifestVersion: 2, knowledgePackHash: null, baselineCompositionHash: FROZEN },
    assetReadiness: { strategy: 'typography-led', supportsImageryLed: false, strategyReason: 'No publishable photography.' },
    diversity: { distinct: true, minimumDifferingPlanes: 2, duplicates: [] },
    candidates,
    promotedCandidateId: null,
    setOutcome: 'undecided',
    decision: null,
  };
}

function scores(value, overrides = {}) {
  return criteria.map((criterion) => ({ criterion: criterion.id, score: overrides[criterion.id] ?? value }));
}

test('the professional bar is read from the pipeline gate rather than declared here', () => {
  assert.equal(gate.gateId, 'visual');
  assert.equal(typeof gate.minimumScore, 'number');
  assert.equal(gate.minimumScore, 8.5);
  assert.ok(gate.minimumCriterionScore < gate.minimumScore);
  assert.ok(gate.reworkIterationBudget >= 1);
});

test('a review must score every criterion it was given, and only those', () => {
  assert.throws(() => scoreVisualReview({ criterionScores: scores(8).slice(1) }, criteria), /does not score every criterion/);
  assert.throws(
    () => scoreVisualReview({ criterionScores: [...scores(8), { criterion: 'imagery-suitability', score: 9 }] }, criteria),
    /scores criteria this candidate was not judged on/,
  );
  assert.throws(() => scoreVisualReview({ criterionScores: [{ criterion: 'brand-fit', score: 12 }] }), /number from 0 to 10/);
});

test('a strong average cannot hide one badly failing criterion', () => {
  const strongAverage = scoreVisualReview({ criterionScores: scores(9.5, { distinctiveness: 4 }) }, criteria);
  assert.ok(strongAverage.overallScore >= gate.minimumScore, 'the average clears the bar');
  const verdict = assessProfessionalThreshold(strongAverage, gate);
  assert.equal(verdict.met, false);
  assert.match(verdict.detail, /distinctiveness scores 4/);
});

test('a competent-but-not-good-enough candidate cannot be passed', () => {
  assert.throws(
    () => recordReview(candidate('candidate-a'), {
      verdict: 'pass',
      reviewedBy: 'design-critic',
      addressedRules: [],
      criterionScores: scores(7.2),
    }, { qualityGate: gate, criteria }),
    /below the 8\.5 professional bar/,
  );
});

test('a verdict with no scores at all cannot be a pass', () => {
  assert.throws(
    () => recordReview(candidate('candidate-a'), { verdict: 'pass', reviewedBy: 'design-critic', addressedRules: [] }, { qualityGate: gate, criteria }),
    /carries no criterion scores/,
  );
});

test('the same candidate can be recorded as competent and returned for rework', () => {
  const reviewed = recordReview(candidate('candidate-a'), {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7.2, { distinctiveness: 5 }),
    failingCriteria: ['distinctiveness'],
  }, { qualityGate: gate, criteria });
  assert.equal(reviewed.review.thresholdMet, false);
  assert.equal(reviewed.review.overallScore < gate.minimumScore, true);
  assert.equal(reviewed.reworkOwner, gate.reworkOwner);
});

test('a candidate that clears the bar passes and can be promoted', () => {
  const passing = recordReview(candidate('candidate-a'), {
    verdict: 'pass',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(8.8),
  }, { qualityGate: gate, criteria });
  assert.equal(passing.review.thresholdMet, true);
  const rejected = recordReview(candidate('candidate-b'), {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7),
    failingCriteria: ['distinctiveness'],
  }, { qualityGate: gate, criteria });
  const promoted = promoteCandidate(set([passing, rejected]), 'candidate-a', { promotedBy: 'design-critic', decidedAt: '2026-08-26T11:00:00.000Z' });
  assert.equal(promoted.promotedCandidateId, 'candidate-a');
  assert.equal(promoted.setOutcome, 'promoted');
});

function reworked(id, overrides = {}) {
  return recordReview(candidate(id, overrides), {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7.5, { distinctiveness: 5, 'distinctive-moment': 5.5 }),
    failingCriteria: ['distinctiveness'],
    ...(overrides.review ?? {}),
  }, { qualityGate: gate, criteria });
}

test('a set where nothing is good enough can be sent back or closed, and never silently promoted', () => {
  const undecided = set([reworked('candidate-a'), reworked('candidate-b')]);
  const summary = summariseCandidateSet(undecided, gate);
  assert.equal(summary.canPromote, false);
  assert.equal(summary.canRework, true);
  assert.equal(summary.canReject, true);
  assert.deepEqual(summary.passing, []);

  const rejected = decideCandidateSet(undecided, { outcome: 'rejected', decidedBy: 'design-critic', rationale: 'Both are competent. Neither clears the bar.', decidedAt: '2026-08-26T11:00:00.000Z' });
  assert.equal(rejected.setOutcome, 'rejected');
  assert.equal(rejected.promotedCandidateId, null);
  assert.ok(rejected.candidates.every((entry) => entry.outcome === 'rejected'));
});

test('a set cannot be decided before somebody has looked at every candidate', () => {
  assert.throws(
    () => decideCandidateSet(set([reworked('candidate-a'), candidate('candidate-b')]), { outcome: 'rejected', decidedBy: 'design-critic' }),
    /has not been judged/,
  );
});

test('a set with a passing candidate has a winner rather than a set-level outcome', () => {
  const passing = recordReview(candidate('candidate-a'), {
    verdict: 'pass', reviewedBy: 'design-critic', addressedRules: [], criterionScores: scores(9),
  }, { qualityGate: gate, criteria });
  assert.throws(
    () => decideCandidateSet(set([passing, reworked('candidate-b')]), { outcome: 'rejected', decidedBy: 'design-critic' }),
    /has a winner to promote/,
  );
});

test('whoever created the candidates cannot close the book on them either', () => {
  const created = set([reworked('candidate-a'), reworked('candidate-b')]);
  assert.throws(
    () => decideCandidateSet(created, { outcome: 'rejected', decidedBy: 'visual-direction' }),
    /cannot also promote it/,
  );
});

test('a rework targets what failed and names what must survive', () => {
  const parent = reworked('candidate-a');
  const plan = planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  assert.deepEqual(plan.failingCriteria, ['distinctiveness']);
  assert.ok(plan.preservedCriteria.includes('visual-hierarchy'));
  assert.ok(plan.preservedCriteria.includes('responsive-quality'));
  assert.ok(!plan.preservedCriteria.includes('distinctiveness'));
  assert.deepEqual(plan.targets, [{
    axis: 'visualDistinctiveness',
    from: 'balanced',
    to: 'expressive',
    because: 'A stronger opening is the change available to a build judged generic.',
    criterion: 'distinctiveness',
  }]);
  assert.equal(plan.frozenTruthHash, FROZEN);
  assert.equal(plan.iteration, 1);
  assert.deepEqual(reworkOverrides(plan), { artDirection: { visualDistinctiveness: 'expressive' }, design: {}, composition: {}, responsive: {} });
});

test('a weak mobile composition is answered by the responsive plan, not by the desktop one', () => {
  const parent = recordReview(candidate('candidate-a'), {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7.5, { 'responsive-quality': 5 }),
    failingCriteria: ['responsive-quality'],
  }, { qualityGate: gate, criteria });
  const plan = planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  assert.deepEqual(reworkOverrides(plan).responsive, { mobileDensity: 'tighter' });
});

test('a failure this lane does not own is routed rather than absorbed', () => {
  const parent = recordReview(candidate('candidate-a'), {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7.5, { 'brand-fit': 5 }),
    failingCriteria: ['brand-fit'],
  }, { qualityGate: gate, criteria });
  const plan = planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.returnedTo.map((entry) => entry.role), ['brand-research']);
  assert.equal(plan.customPresentation, null);
});

test('a failure no registered presentation can answer classifies a bespoke requirement', () => {
  const parent = recordReview(candidate('candidate-a'), {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7.5, { 'distinctive-moment': 4 }),
    failingCriteria: ['distinctive-moment'],
  }, { qualityGate: gate, criteria });
  const plan = planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  assert.deepEqual(plan.targets, []);
  assert.ok(plan.customPresentation);
  assert.equal(plan.customPresentation.status, 'classified');
  assert.equal(plan.customPresentation.owner, gate.reworkOwner);
  assert.match(plan.customPresentation.registryInsufficientBecause, /lead-statement, full-bleed-lead and figure-index/);
  assert.ok(plan.customPresentation.responsiveBehaviour);
  assert.ok(plan.customPresentation.motionBehaviour);
});

test('an exhausted axis also classifies a bespoke requirement rather than repeating itself', () => {
  const expressive = candidate('candidate-a');
  expressive.artDirection.dimensions.visualDistinctiveness = 'expressive';
  const parent = recordReview(expressive, {
    verdict: 'rework',
    reviewedBy: 'design-critic',
    addressedRules: [],
    criterionScores: scores(7.5, { distinctiveness: 5 }),
    failingCriteria: ['distinctiveness'],
  }, { qualityGate: gate, criteria });
  const plan = planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  assert.deepEqual(plan.targets, []);
  assert.match(plan.customPresentation.registryInsufficientBecause, /already at the most expressive setting/);
});

test('a revision carries lineage back to the verdict that asked for it', () => {
  const parent = reworked('candidate-a');
  const original = set([parent, reworked('candidate-b')]);
  const plan = planVisualRework({ set: original, candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  const revised = candidate('candidate-a-r1', { state: 'draft', iteration: 0, gate: { status: 'not-run', blocking: [], mustAddress: [] } });
  const next = attachRevisedCandidate(original, { plan, candidate: revised });

  const stored = next.candidates.find((entry) => entry.candidateId === 'candidate-a-r1');
  assert.equal(stored.iteration, 1);
  assert.equal(stored.lineage.parentCandidateId, 'candidate-a');
  assert.equal(stored.lineage.planId, plan.planId);
  assert.equal(stored.lineage.frozenTruthHash, FROZEN);
  assert.deepEqual(stored.lineage.failingCriteria, ['distinctiveness']);
  assert.deepEqual(stored.lineage.requestedChanges, [{ axis: 'visualDistinctiveness', from: 'balanced', to: 'expressive', because: 'A stronger opening is the change available to a build judged generic.' }]);
  assert.equal(next.reworkPlans[0].revisedCandidateId, 'candidate-a-r1');
  // A revision reopens the set: it has to be judged like anything else.
  assert.equal(next.setOutcome, 'undecided');
});

test('a revision that regenerated the product is refused', () => {
  const parent = reworked('candidate-a');
  const original = set([parent]);
  const plan = planVisualRework({ set: original, candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' });
  const regenerated = candidate('candidate-a-r1', { state: 'draft', compositionHash: 'c'.repeat(64) });
  assert.throws(
    () => attachRevisedCandidate(original, { plan, candidate: regenerated }),
    /never changes what the product says/,
  );
});

test('the rework loop has a ceiling and says so when it is reached', () => {
  const parent = reworked('candidate-a', { iteration: gate.reworkIterationBudget });
  assert.throws(
    () => planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' }),
    new RegExp(`has had its ${gate.reworkIterationBudget} bounded visual rework pass`),
  );
  assert.deepEqual(remainingReworkBudget(set([parent]), gate), { budget: gate.reworkIterationBudget, spent: gate.reworkIterationBudget, remaining: 0, exhausted: true });
});

test('a rework verdict that names no failing criterion is a request to start again, and is refused', () => {
  const parent = recordReview(candidate('candidate-a'), {
    verdict: 'rework', reviewedBy: 'design-critic', addressedRules: [], criterionScores: scores(7),
  }, { qualityGate: gate, criteria });
  assert.throws(
    () => planVisualRework({ set: set([parent]), candidate: parent, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' }),
    /names no failing criteria/,
  );
});

test('only a rework verdict asks for a revision', () => {
  const passing = recordReview(candidate('candidate-a'), {
    verdict: 'pass', reviewedBy: 'design-critic', addressedRules: [], criterionScores: scores(9),
  }, { qualityGate: gate, criteria });
  assert.throws(
    () => planVisualRework({ set: set([passing]), candidate: passing, gate, criteria, createdAt: '2026-08-26T11:00:00.000Z' }),
    /was not returned for rework/,
  );
});
