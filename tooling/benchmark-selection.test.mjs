import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBenchmarkReferences, selectReference } from './lib/visual-benchmarks.mjs';

/**
 * Which benchmark a candidate is measured against, and why.
 *
 * The selector decides what question a site is asked. Compare a nine-page letting against a global
 * retailer and the reviewer will truthfully report that the retailer carries a larger catalogue,
 * editorial library and store network — three statements about the reference that say nothing
 * about the candidate's quality, and which nonetheless move its benchmark gap. Getting this wrong
 * is not a cosmetic error; it silently changes the score.
 *
 * These fixtures are deliberately synthetic. Named businesses and named references appear only in
 * the two regression tests at the end, which exist to pin observed real-world failures; every rule
 * is established on invented references so that the rule is the thing being tested and not the
 * corpus.
 */

const CLASSES = { 'benchmark-class': 'anchors 10', exceptional: 'anchors 9' };

const FACETS = {
  'facet-alpha': 'A business fact.',
  'facet-beta': 'Another business fact.',
  'facet-gamma': 'A third business fact.',
};

/** A reference with everything eligibility requires, so a test can vary one thing at a time. */
const reference = (id, extra = {}) => ({
  id,
  name: id,
  url: `https://example.invalid/${id}`,
  dateObserved: '2026-01-01',
  qualityClass: 'benchmark-class',
  anchorsFor: [],
  appropriateFor: [],
  businessFacets: [],
  ...extra,
});

const corpusOf = (...references) => ({ qualityClasses: CLASSES, businessFacets: FACETS, references });

test('selection does not depend on the order references appear in the registry', () => {
  const references = [
    reference('ref-a', { businessFacets: ['facet-alpha'] }),
    reference('ref-b', { businessFacets: ['facet-alpha', 'facet-beta'] }),
    reference('ref-c', { businessFacets: ['facet-gamma'] }),
  ];
  const ask = (ordered) => selectReference({
    businessFacets: ['facet-alpha', 'facet-beta'],
    corpus: corpusOf(...ordered),
  }).reference.id;

  const forwards = ask(references);
  assert.equal(forwards, 'ref-b', 'the reference sharing both facets is the better fit');
  assert.equal(ask([...references].reverse()), forwards, 'reversing the registry must not change the winner');
  assert.equal(ask([references[2], references[0], references[1]]), forwards);
  assert.equal(ask([references[1], references[2], references[0]]), forwards);
});

test('among two eligible references the more specific semantic fit wins', () => {
  // Both are eligible and both match the business. One matches it more completely.
  const result = selectReference({
    businessFacets: ['facet-alpha', 'facet-beta'],
    corpus: corpusOf(
      reference('broad-fit', { businessFacets: ['facet-alpha'] }),
      reference('close-fit', { businessFacets: ['facet-alpha', 'facet-beta'] }),
    ),
  });
  assert.equal(result.reference.id, 'close-fit');
  assert.ok(result.ordered.every((entry) => entry.fits), 'both were eligible; this is a ranking, not a filter');
  assert.match(result.note, /shares business facets facet-alpha, facet-beta/);
});

test('the business problem outranks the design anchors, and cannot be outvoted by them', () => {
  /*
   * The defect this replaced was a weighted sum in which two anchor hits beat one business-kind
   * hit. Anchors describe the design problem and are real signal; they are not what the module
   * exists to match on, and no number of them may overturn the business fit.
   */
  const result = selectReference({
    businessFacets: ['facet-alpha'],
    anchors: ['anchor-one', 'anchor-two', 'anchor-three'],
    corpus: corpusOf(
      reference('right-business', { businessFacets: ['facet-alpha'] }),
      reference('right-look', { businessFacets: ['facet-gamma'], anchorsFor: ['anchor-one', 'anchor-two', 'anchor-three'] }),
    ),
  });
  assert.equal(result.reference.id, 'right-business');
});

test('a genuine tie resolves the same way every time, and says how', () => {
  const tied = () => selectReference({
    businessFacets: ['facet-alpha'],
    corpus: corpusOf(
      reference('zulu', { businessFacets: ['facet-alpha'] }),
      reference('alfa', { businessFacets: ['facet-alpha'] }),
    ),
  }).reference.id;
  // Identical on every meaningful axis, so the stated last resort decides: id, ascending.
  assert.equal(tied(), 'alfa');
  assert.equal(tied(), 'alfa');

  // And breadth breaks it before id does, because claiming to model fewer businesses is the
  // more specific claim.
  const narrower = selectReference({
    businessFacets: ['facet-alpha'],
    corpus: corpusOf(
      reference('alfa-broad', { businessFacets: ['facet-alpha', 'facet-beta', 'facet-gamma'] }),
      reference('zulu-narrow', { businessFacets: ['facet-alpha'] }),
    ),
  });
  assert.equal(narrower.reference.id, 'zulu-narrow');
});

test('an ineligible reference cannot win however well it fits', () => {
  const perfectButUndated = reference('perfect', { businessFacets: ['facet-alpha', 'facet-beta'] });
  delete perfectButUndated.dateObserved;

  const result = selectReference({
    businessFacets: ['facet-alpha', 'facet-beta'],
    corpus: corpusOf(perfectButUndated, reference('worse', { businessFacets: ['facet-alpha'] })),
  });
  assert.equal(result.reference.id, 'worse', 'the better fit was not admitted, so it did not rank');
  const rejected = result.ordered.find((entry) => entry.id === 'perfect');
  assert.equal(rejected.eligible, false);
  assert.match(rejected.why, /no dateObserved/);
});

test('a reference whose quality class the corpus never defined cannot leak through', () => {
  const result = selectReference({
    businessFacets: ['facet-alpha'],
    corpus: corpusOf(
      reference('unclassed', { businessFacets: ['facet-alpha'], qualityClass: 'pretty-good' }),
      reference('classed', { businessFacets: ['facet-alpha'] }),
    ),
  });
  assert.equal(result.reference.id, 'classed');
  assert.match(result.ordered.find((entry) => entry.id === 'unclassed').why, /not one the corpus defines/);
});

test('no match stays no match, and returns no reference to use anyway', () => {
  const result = selectReference({
    businessFacets: ['facet-gamma'],
    corpus: corpusOf(reference('elsewhere', { businessFacets: ['facet-alpha'] })),
  });
  assert.equal(result.matched, false);
  assert.equal(result.reference, null, 'handing back the least-bad reference invites it to be used');
  // The facet path says which business it found no model for, because that is the actionable
  // half: either the candidate's facets are wrong or the corpus is missing a reference.
  assert.match(result.note, /No reference in the corpus is a model for a business declaring facet-gamma/);
  assert.match(result.note, /Record that rather than forcing one/);

  // The legacy prose path keeps its original wording, since nothing about it has changed.
  const viaProse = selectReference({
    businessKind: 'something else entirely',
    corpus: corpusOf(reference('elsewhere', { appropriateFor: ['a different problem'] })),
  });
  assert.equal(viaProse.matched, false);
  assert.equal(viaProse.reference, null);
  assert.match(viaProse.note, /No reference in the corpus solves a problem resembling this one/);
});

test('a business facet the corpus does not define is refused, not noted', () => {
  /*
   * Business facets are a closed vocabulary and they now gate matching, so an undefined one can
   * change which reference caps a verdict — or remove the comparison entirely — while looking
   * like a candidate describing itself unusually. Scoring anyway and recording a caveat puts the
   * caveat in front of somebody who already has a number.
   *
   * It is refused symmetrically with `loadBenchmarkReferences`, which already refuses a
   * *reference* declaring an undefined facet. A vocabulary enforced on one side only is not
   * closed.
   */
  assert.throws(
    () => selectReference({
      businessFacets: ['facet-alpha', 'facet-invented'],
      corpus: corpusOf(reference('ref', { businessFacets: ['facet-alpha'] })),
    }),
    /facet-invented.*not defined by the benchmark corpus/s,
  );

  // Including when every other facet is valid and would have matched on its own. A typo cannot
  // be assumed to be the unimportant one.
  assert.throws(() => selectReference({
    businessFacets: ['facet-invented'],
    corpus: corpusOf(reference('ref', { businessFacets: ['facet-alpha'] })),
  }));

  // And the error says what the options were, because the failure is a vocabulary failure.
  try {
    selectReference({ businessFacets: ['nope'], corpus: corpusOf(reference('ref')) });
    assert.fail('expected a refusal');
  } catch (error) {
    assert.match(error.message, /facet-alpha/);
  }
});

test('an anchor no reference offers is a caveat, not a refusal — the anchor vocabulary is not closed', () => {
  /*
   * The distinction is the reason this is a different test rather than the same one.
   *
   * There is no declared anchor vocabulary anywhere in the corpus. The set of "known" anchors is
   * derived — the union of whatever `anchorsFor` values the current references happen to carry —
   * so "unknown" means only "no reference offers this today" and changes whenever a reference is
   * added or edited. Refusing on it would make a candidate's validity depend on the contents of
   * the corpus rather than on a contract, and would turn adding a reference into a breaking
   * change for unrelated packets.
   */
  const result = selectReference({
    businessFacets: ['facet-alpha'],
    anchors: ['anchor-invented'],
    corpus: corpusOf(reference('ref', { businessFacets: ['facet-alpha'] })),
  });
  assert.equal(result.matched, true, 'an unrecognised anchor must not remove a valid business match');
  assert.deepEqual(result.unknownAnchors, ['anchor-invented']);
  assert.match(result.note, /anchor-invented/);
});

test('anchors may only order references that already share a business facet', () => {
  // Both are business-relevant; the anchors decide between them. This is what anchors are for.
  const ranked = selectReference({
    businessFacets: ['facet-alpha'],
    anchors: ['anchor-one'],
    corpus: corpusOf(
      reference('no-anchor', { businessFacets: ['facet-alpha'] }),
      reference('with-anchor', { businessFacets: ['facet-alpha'], anchorsFor: ['anchor-one'] }),
    ),
  });
  assert.equal(ranked.reference.id, 'with-anchor');
});

test('regression: shared anchors alone cannot supply a benchmark once facets are declared', () => {
  /*
   * The gate this pins. Before it, `problemFit > 0 || sharedAnchors.length > 0` let a candidate
   * that had adopted facets, and shared none of them with any reference, still acquire a
   * benchmark on design-anchor overlap — rebuilding the visual-similarity fallback the facet
   * vocabulary exists to remove, and by the same route that sent a one-property letting to a
   * global retailer.
   */
  const result = selectReference({
    businessFacets: ['facet-gamma'],
    anchors: ['anchor-one'],
    corpus: corpusOf(reference('only', { businessFacets: ['facet-alpha'], anchorsFor: ['anchor-one'] })),
  });

  assert.equal(result.matched, false);
  assert.equal(result.reference, null);
  // The reference was eligible and did share the anchor. It is excluded on business relevance
  // alone, which is the whole point.
  const entry = result.ordered.find((row) => row.id === 'only');
  assert.equal(entry.eligible, true);
  assert.deepEqual(entry.sharedAnchors, ['anchor-one']);
  assert.equal(entry.fits, false);
  assert.match(result.note, /Design anchors alone do not qualify a reference/);
});

test('the answer depends on declared facts, not on what the candidate is called', () => {
  const ask = (businessKind) => selectReference({
    businessKind,
    businessFacets: ['facet-alpha'],
    corpus: corpusOf(
      reference('ref-a', { businessFacets: ['facet-alpha'] }),
      reference('ref-b', { businessFacets: ['facet-beta'] }),
    ),
  }).reference.id;

  // Same declared facts, four different prose descriptions and names.
  const answers = new Set(['Hallowsand', 'prototype-e', 'a shepherd\'s hut in Powys', ''].map(ask));
  assert.equal(answers.size, 1, 'renaming the candidate changed the benchmark it is measured against');
  assert.equal([...answers][0], 'ref-a');
});

test('a candidate that declares no facets keeps the old prose behaviour, and is told it is weak', () => {
  const corpus = corpusOf(reference('prose', { appropriateFor: ['businesses of some kind'], businessFacets: ['facet-alpha'] }));
  const result = selectReference({ businessKind: 'some kind', corpus });
  assert.equal(result.matched, true);
  assert.equal(result.usedLegacyBusinessKindMatch, true);
  assert.match(result.note, /legacy prose match/);
  assert.match(result.note, /treated as weak/);
});

/*
 * The two regressions below name real entries on purpose. They pin behaviour that was observed to
 * be wrong against the shipped corpus, and a synthetic fixture cannot do that.
 */

test('regression: a small hospitality business is no longer sent to the large-catalogue retailer', () => {
  const corpus = loadBenchmarkReferences();

  /*
   * Observed on the shipped corpus before this change. A one-property tidal-island letting
   * declaring `businessKind: 'hospitality lettings and places to stay'` scored zero on the
   * business-kind term against every reference, because no reference's category sentence contains
   * that string. Selection fell through to anchors, where `restraint` matched the retailer, and a
   * two-all tie was then settled by `id.localeCompare` — "vb-ae" sorts before "vb-ai".
   *
   * The retailer's own entry says it is `notAModelFor` "Small businesses with eight pages", which
   * is exactly what was being sent to it, and the resulting review lost three of six pairwise
   * dimensions on the reference's catalogue size.
   */
  const legacy = selectReference({ businessKind: 'hospitality lettings and places to stay', corpus });
  assert.equal(legacy.matched, false, 'the prose term matched nothing at all, which was the defect');

  const declared = selectReference({
    businessKind: 'hospitality lettings and places to stay',
    businessFacets: ['hospitality', 'destination-travel', 'considered-purchase'],
    anchors: ['place-and-atmosphere', 'restraint', 'editorial-rhythm'],
    corpus,
  });
  assert.equal(declared.reference.id, 'vb-aman');
  assert.notEqual(declared.reference.id, 'vb-aesop');
  // The anchors it declared are not in any reference's vocabulary. That is now visible rather
  // than being silently worth nothing.
  assert.ok(declared.unknownAnchors.includes('place-and-atmosphere'));
});

test('regression: every reference in the shipped corpus is reachable by its own facets', () => {
  const corpus = loadBenchmarkReferences();
  for (const entry of corpus.references) {
    const result = selectReference({ businessFacets: entry.businessFacets, corpus });
    assert.equal(
      result.reference?.id,
      entry.id,
      `${entry.id} declares facets that select ${result.reference?.id ?? 'nothing'}, so nothing can reach it`,
    );
  }
});

test('the shipped corpus declares only facets it defines', () => {
  const corpus = loadBenchmarkReferences();
  assert.ok(Object.keys(corpus.businessFacets ?? {}).length > 5, 'the vocabulary is missing');
  for (const entry of corpus.references) {
    assert.ok(entry.businessFacets?.length, `${entry.id} declares no business facets, so it can only be reached by anchors`);
    for (const facet of entry.businessFacets) {
      assert.ok(Object.hasOwn(corpus.businessFacets, facet), `${entry.id} declares undefined facet ${facet}`);
    }
  }
});
