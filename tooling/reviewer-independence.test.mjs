/**
 * Independence, tested at the level a role check cannot reach.
 *
 * The case that matters is the one that passes every existing check and is not
 * independent: one model, asked to build and then asked to judge, wearing two
 * role names. `assertReviewIndependence` in the control plane accepts it,
 * correctly, because it enforces the rule it was written to enforce. This
 * module is the part that notices.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { assertReviewIndependence } from '@app-builder/control-plane/roles';
import { INDEPENDENCE_RELATIONS, assessIndependence, describeExecutor, executorsFromVerdictSet } from './lib/reviewer-independence.mjs';

const anthropic = (role) => describeExecutor({ vendor: 'anthropic', model: 'claude-haiku-4-5-20251001', role, attestedBy: 'runtime' });
const openai = (role) => describeExecutor({ vendor: 'openai', model: 'GPT-5', role, attestedBy: 'runtime' });

// --- The case a role check cannot see ------------------------------------------------

test('one model wearing two role names passes the role check and is not independent', () => {
  // The control plane accepts it, and is right to: it enforces the rule it has.
  assert.doesNotThrow(() => assertReviewIndependence({ reviewerRole: 'design-critic', authorRoles: ['art-direction'] }));

  const result = assessIndependence({ author: anthropic('art-direction'), reviewer: anthropic('design-critic') });
  assert.equal(result.relation, 'same-model-different-role');
  assert.equal(result.independent, false);
  assert.match(result.refusals.join(' '), /agrees with itself/);
});

test('a different vendor is independent', () => {
  const result = assessIndependence({ author: anthropic('art-direction'), reviewer: openai('design-critic') });
  assert.equal(result.relation, 'different-vendor');
  assert.equal(result.independent, true);
  assert.deepEqual(result.refusals, []);
});

test('a different model from the same vendor clears different-model and not different-vendor', () => {
  const author = anthropic('art-direction');
  const reviewer = describeExecutor({ vendor: 'anthropic', model: 'claude-opus-4', role: 'design-critic', attestedBy: 'runtime' });

  assert.equal(assessIndependence({ author, reviewer }).independent, false);
  assert.equal(assessIndependence({ author, reviewer, requires: 'different-model' }).independent, true);
  assert.equal(assessIndependence({ author, reviewer }).relation, 'same-vendor-different-model');
});

test('the same model in the same role is the weakest relation there is', () => {
  const result = assessIndependence({ author: anthropic('design-critic'), reviewer: anthropic('design-critic') });
  assert.equal(result.relation, 'same-model-same-role');
  assert.equal(result.independent, false);
});

// --- Identity has to be stamped ----------------------------------------------------------

test('a reviewer identity supplied by its caller is refused however different it looks', () => {
  const reviewer = describeExecutor({ vendor: 'openai', model: 'GPT-5', role: 'design-critic', attestedBy: 'caller' });
  const result = assessIndependence({ author: anthropic('art-direction'), reviewer });

  // The vendors genuinely differ, and it is still refused, because the side
  // being reviewed chose what the reviewer says it is.
  assert.equal(result.relation, 'different-vendor');
  assert.equal(result.independent, false);
  assert.match(result.refusals.join(' '), /self-report/);
});

// --- Unknown stays unknown ------------------------------------------------------------------

test('an assessment with no author is unknown and refuses, rather than assuming', () => {
  const result = assessIndependence({ author: null, reviewer: openai('design-critic') });

  assert.equal(result.relation, 'unknown');
  assert.equal(result.independent, false);
  assert.match(result.refusals.join(' '), /nothing for the reviewer to be independent of/);
});

test('a reviewer with no vendor or model establishes nothing', () => {
  const result = assessIndependence({ author: anthropic('art-direction'), reviewer: describeExecutor({ role: 'design-critic' }) });
  assert.equal(result.relation, 'unknown');
  assert.equal(result.independent, false);
});

// --- What the stored evidence can actually show ------------------------------------------------

test('no committed verdict can establish executor independence, because none records an author', () => {
  const files = fs.readdirSync('examples/genuine-business').filter((name) => name.endsWith('verdicts.json'));
  assert.ok(files.length >= 5, 'expected the committed verdict sets to still be there');

  let reviews = 0;
  for (const file of files) {
    const set = JSON.parse(fs.readFileSync(`examples/genuine-business/${file}`, 'utf8'));
    for (const review of set.reviews ?? []) {
      reviews += 1;
      const { author, reviewer } = executorsFromVerdictSet(set, review);

      // The reviewer is recorded, and recorded well.
      assert.ok(reviewer.vendor, `${file}/${review.candidateId} records no reviewer vendor`);
      assert.ok(reviewer.model, `${file}/${review.candidateId} records no reviewer model`);

      // And there is nothing to compare it against.
      assert.equal(author, null);
      assert.equal(assessIndependence({ author, reviewer }).relation, 'unknown');
    }
  }
  assert.ok(reviews >= 10, `expected at least 10 stored reviews and found ${reviews}`);
});

test('the relation vocabulary has no value that means "probably fine"', () => {
  // A vocabulary that can hedge will hedge, and a gate cannot act on a hedge.
  for (const relation of INDEPENDENCE_RELATIONS) {
    assert.ok(!/likely|probable|partial|mostly/i.test(relation), `${relation} is a hedge`);
  }
});

test('an unknown requirement is refused rather than defaulted', () => {
  assert.throws(() => assessIndependence({ author: anthropic('a'), reviewer: openai('b'), requires: 'different-ish' }), /Unknown independence requirement/);
});

// --- The record a verdict should carry ------------------------------------------------------------

test('an executor identity carries what a later auditor needs, and nulls what nobody supplied', () => {
  const executor = describeExecutor({
    vendor: 'openai', model: 'GPT-5', adapterId: 'codex-cli', runtime: 'codex', role: 'design-critic',
    dataClass: 'synthetic', attemptId: 'attempt-1', costGbp: 0.04, attestedBy: 'runtime',
    artifact: { kind: 'visual-candidate', ref: 'candidate-structured-practice', hash: null },
  });

  assert.equal(executor.vendor, 'openai');
  assert.equal(executor.costGbp, 0.04);
  assert.equal(executor.artifact.hash, null);
  // An unsupplied field is null rather than absent, so a reader can tell the
  // difference between "nobody recorded this" and "this record is an old shape".
  assert.equal(describeExecutor({}).vendor, null);
  assert.equal(describeExecutor({}).attestedBy, null);
});

test('an attestation outside the vocabulary is not carried through as if it were valid', () => {
  assert.equal(describeExecutor({ attestedBy: 'trust-me' }).attestedBy, null);
});
