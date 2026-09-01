import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSamenessPrompt,
  MINIMUM_CORPUS,
  planCrossBuildVisualReview,
  SAMENESS_QUESTIONS,
  summariseSameness,
} from './lib/cross-build-visual-review.mjs';

const build = (name, kind) => ({
  build: name,
  business: name,
  businessKind: kind,
  captures: [
    { route: '/', viewport: 'desktop', file: `${name}/home--desktop.jpg` },
    { route: '/', viewport: 'mobile', file: `${name}/home--mobile.jpg` },
  ],
});

const CORPUS = [build('ashcombe', 'architecture'), build('marram', 'planting studio'), build('plumbline', 'database tooling')];

test('a sameness review needs a population, not a pair', () => {
  // Two builds that resemble each other are an anecdote. The finding this
  // produces — "the factory has a house style" — is a claim about a population,
  // and a review over two would produce an answer worth nothing that would be
  // quoted later as though it were worth something.
  assert.throws(
    () => planCrossBuildVisualReview({ builds: CORPUS.slice(0, 2) }),
    /needs at least 3 builds/,
  );
  assert.equal(MINIMUM_CORPUS, 3);

  const plan = planCrossBuildVisualReview({ builds: CORPUS });
  assert.equal(plan.builds.length, 3);
});

test('builds without the requested capture are not counted toward the minimum', () => {
  const missing = [...CORPUS.slice(0, 2), { build: 'x', captures: [{ route: '/about', viewport: 'desktop' }] }];
  assert.throws(() => planCrossBuildVisualReview({ builds: missing }), /offers 2/);
});

test('every question asks whether similarity is explained, not whether things differ', () => {
  // The rule this module must not break. Difference for its own sake is worse
  // than sameness — it is sameness plus noise — and two businesses of the same
  // kind may legitimately look alike.
  for (const question of SAMENESS_QUESTIONS) {
    assert.ok(question.guard.length > 40, `${question.id} has no guard against demanding random difference`);
  }
  const prompt = buildSamenessPrompt(planCrossBuildVisualReview({ builds: CORPUS }));
  assert.match(prompt, /NOT being asked whether they are different/);
  assert.match(prompt, /Difference for its own sake is worse than sameness/);
  assert.match(prompt, /Two businesses of the same kind may legitimately look alike/);
});

test('the prompt names the businesses so a reviewer can judge whether sameness is supported', () => {
  const prompt = buildSamenessPrompt(planCrossBuildVisualReview({ builds: CORPUS }));
  assert.match(prompt, /architecture/);
  assert.match(prompt, /planting studio/);
  assert.match(prompt, /database tooling/);
});

test('a corpus where no build is shaped by its own business is one template', () => {
  const plan = planCrossBuildVisualReview({ builds: CORPUS });
  const summary = summariseSameness({
    verdict: 'one-template',
    answers: [{ id: 'shared-design-language', finding: 'One language.', supportedByBusinesses: false }],
    sharedMotifs: [{ motif: 'centred statement over a tinted band', builds: ['ashcombe', 'marram', 'plumbline'], businessReason: null }],
    eachBuildIsShapedByItsBusiness: { ashcombe: null, marram: null, plumbline: null },
  }, plan);

  assert.match(summary.headline, /No build in this corpus of 3 carries a visual decision explained by its own business/);
  assert.equal(summary.sharedMotifsWithoutReason.length, 1);
  assert.equal(summary.unexplainedSimilarities.length, 1);
});

test('shared language with a business reason is not a finding against the corpus', () => {
  const plan = planCrossBuildVisualReview({ builds: CORPUS });
  const summary = summariseSameness({
    verdict: 'shared-language-explained',
    answers: [{ id: 'shared-design-language', finding: 'Shared component vocabulary is visible.', supportedByBusinesses: true }],
    sharedMotifs: [{ motif: 'ruled section headings', builds: ['ashcombe', 'marram'], businessReason: 'Both publish long project records where a rule separates entries.' }],
    eachBuildIsShapedByItsBusiness: { ashcombe: 'Project pages lead with the building, at scale.', marram: 'The plant register is the navigation.', plumbline: 'The migration plan is the hero.' },
  }, plan);

  assert.deepEqual(summary.unexplainedSimilarities, []);
  assert.deepEqual(summary.sharedMotifsWithoutReason, []);
  assert.match(summary.headline, /3 of 3 builds carry at least one visual decision/);
});

test('it decides nothing, and says so', () => {
  // Same reason anti-template-diagnostic.mjs exits zero: the moment this blocks
  // a build it has invented a threshold no corpus has earned.
  const plan = planCrossBuildVisualReview({ builds: CORPUS });
  const summary = summariseSameness({ answers: [], sharedMotifs: [], eachBuildIsShapedByItsBusiness: {} }, plan);
  assert.match(summary.decidesNothing, /diagnostic/);
});
