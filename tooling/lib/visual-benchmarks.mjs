/**
 * Anchoring the top of the scale to something outside this repository.
 *
 * Absolute scoring inflates. A reviewer looking at one competent site and asked
 * for a number out of ten has nothing to push against, and the number drifts
 * upward — which is how three prototypes with named, unfixed defects came back
 * at 8.5 to 8.71 against a bar of 8.5. Comparison is harder to inflate: "is
 * this stronger than that, on typography?" is a question with a wrong answer.
 *
 * So a high-end verdict carries a pairwise comparison against a reference whose
 * *problem* resembles the candidate's, and the aggregate of those comparisons
 * becomes `benchmarkGap`, which caps the overall score.
 *
 * ## The failure this module is built to avoid
 *
 * The obvious way to build this is to ask "does the candidate look like the
 * reference?", and that would be worse than not building it. It would teach the
 * factory to produce Linear pastiches for plumbers, and it would mark down a
 * restrained accountancy site for not having Aman's photography — photography
 * an accountant has no reason to own. Style is not quality.
 *
 * Two things keep it honest. `selectReference` picks on the shape of the
 * business problem rather than on visual similarity. And the dimensions
 * compared are all decision-quality dimensions — authorship, craft, hierarchy,
 * specificity — which a quiet site can win on. A restrained site with excellent
 * typography and editing can legitimately come back `roughly-comparable`
 * against Aesop, and it should.
 *
 * ## What is not stored here
 *
 * No third-party markup, stylesheet, font or image. `references.v1.json` holds
 * written analyses of publicly visible design decisions, which is what a
 * comparison about decision-making actually needs. It also states plainly that
 * those analyses are characterisations from prior familiarity rather than dated
 * captures, because a corpus that overstates its own provenance is the thing
 * this repository keeps having to correct.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BENCHMARK_GAPS, BENCHMARK_GAP_MEANING, PAIRWISE_DIMENSIONS, PAIRWISE_OUTCOMES } from './visual-rubric.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFERENCES_PATH = path.resolve(HERE, '../../examples/visual-benchmarks/references.v1.json');

const list = (value) => (Array.isArray(value) ? value : []);

export function loadBenchmarkReferences(file = REFERENCES_PATH) {
  const corpus = JSON.parse(fs.readFileSync(file, 'utf8'));
  const vocabulary = corpus.businessFacets ?? {};
  for (const reference of list(corpus.references)) {
    if (!reference.url || !reference.dateObserved || !reference.qualityClass) {
      throw new Error(`Benchmark reference ${reference.id} does not record a url, a date observed and a quality class. A reference nobody can go and look at is an assertion.`);
    }
    for (const facet of list(reference.businessFacets)) {
      if (!Object.hasOwn(vocabulary, facet)) {
        throw new Error(`Benchmark reference ${reference.id} declares business facet ${JSON.stringify(facet)}, which the corpus vocabulary does not define. A facet nobody defined cannot be matched against.`);
      }
    }
  }
  return corpus;
}

/**
 * Whether a reference is allowed to be selected at all, and why not when it is not.
 *
 * `loadBenchmarkReferences` refuses a corpus whose entries lack provenance, but a corpus can also
 * be passed in directly — by a test, a caller holding a filtered set, or a future registry that
 * assembles entries from more than one file. Eligibility is therefore re-established at selection
 * rather than assumed from load, so there is no path on which an entry with no date observed, or
 * a quality class the corpus never defined, can win a comparison it was never admitted to.
 *
 * This is a gate, not a score. An ineligible reference does not rank badly; it does not rank.
 */
function eligibility(reference, corpus) {
  const reasons = [];
  if (!reference?.id) reasons.push('no id');
  if (!reference?.url) reasons.push('no url');
  if (!reference?.dateObserved) reasons.push('no dateObserved');
  if (!reference?.qualityClass) reasons.push('no qualityClass');
  else if (!Object.hasOwn(corpus?.qualityClasses ?? {}, reference.qualityClass)) {
    reasons.push(`quality class ${JSON.stringify(reference.qualityClass)} is not one the corpus defines`);
  }
  return { eligible: reasons.length === 0, reasons };
}

/**
 * Choose the reference a candidate should be compared with.
 *
 * On the business problem, deliberately, so that a data-heavy report site is measured against the
 * report, a hospitality business against the hospitality reference, and a plumber against neither.
 *
 * ## Why this is matched on declared facets rather than on prose
 *
 * It used to be matched on prose, and it did not work. The business-problem term asked whether a
 * reference's short category sentence *contained* the candidate's business description as a
 * substring — `appropriateFor.some((entry) => entry.includes(businessKind))` — so it fired only
 * when a candidate happened to describe itself in a few words that appeared verbatim inside a
 * reference's phrase. Measured against every packet committed in this repository at the time, four
 * of six scored zero on it, including "architecture practice", "developer and operations software"
 * and "hospitality lettings and places to stay". That term was weighted higher than any other
 * signal, so the term documented as primary was the one almost no real input could earn, and
 * selection fell through to design anchors — which is the visual-similarity trap this module's own
 * header warns against.
 *
 * Reversing the containment does not fix it: "hospitality lettings and places to stay" does not
 * contain "hospitality and destination businesses" either. Nor does loosening it to shared words,
 * which is worse than the disease — "places to **stay**" and "businesses that must **stay**
 * navigable" share a token and nothing else, and a rule that matched them would be inventing a
 * relationship out of English rather than reading one somebody declared.
 *
 * So both sides declare, from one closed vocabulary the corpus defines. A facet is a fact about
 * the business — who buys, what is sold, at what scale — never about how anything looks. Matching
 * is set intersection: no parsing, no similarity, no threshold, and a reviewer can always answer
 * "why this reference and not that one" by naming the facets.
 *
 * ## The order, and why it is an order rather than a weighted sum
 *
 * Ranked lexicographically, most-significant first. Each step is a sentence, not a coefficient:
 *
 *   1. shared business facets, more first — the business problem, which is the thing this module
 *      exists to match on, and which is a GATE rather than a term: on the facet path a reference
 *      sharing none of the candidate's facets is not ranked lower, it is not a match at all;
 *   2. shared design anchors, more first — the design problem, which is real signal and which may
 *      only ORDER references that have already established business relevance. Anchors never
 *      qualify a reference on their own, because that is selection by visual similarity;
 *   3. declared breadth, narrower first — between two references that fit equally well, the one
 *      claiming to be a model for fewer kinds of business is making the more specific claim, and
 *      the more specific claim is the better-earned match;
 *   4. id, ascending — a stated, arbitrary last resort so that a genuine tie is stable.
 *
 * A weighted sum was what produced the previous behaviour: `anchorHits * 2 + kindHit * 3` made a
 * reference matching two anchors and no business facet beat one matching the business exactly, and
 * nothing in the numbers said that was intended. An ordering cannot silently trade one signal for
 * another, which is the property worth having.
 *
 * ## Determinism
 *
 * The result does not depend on the order references appear in the registry. Every comparison in
 * the chain is total, and the final one is on `id`, so any permutation of the corpus yields the
 * same winner. There is a test for exactly that.
 *
 * ## The legacy path
 *
 * A candidate that declares no facets still gets the old prose behaviour, unchanged, and the note
 * says the match is weak. That is not an endorsement of it — it is there so this change cannot
 * regress a caller that has not been migrated yet, and so the migration is visible in the note
 * rather than silent in the score.
 *
 * Returns candidates in order rather than one answer, because a reviewer that disagrees with the
 * first should be able to see and justify a different choice. "No reference resembles this problem"
 * is a legitimate state and returns no reference at all, rather than the least-bad one.
 */
export function selectReference({ businessKind = null, businessFacets = [], anchors = [], corpus = null } = {}) {
  const loaded = corpus ?? loadBenchmarkReferences();
  const lower = (value) => String(value).toLowerCase();
  const vocabulary = loaded.businessFacets ?? {};

  const wantedAnchors = new Set(list(anchors).map(lower));
  const wantedFacets = new Set(list(businessFacets).map(lower));

  /*
   * An undeclared business facet is refused, not noted.
   *
   * Business facets are a CLOSED vocabulary: the corpus defines every one of them, and both sides
   * draw from that definition. A facet the corpus has never heard of is therefore not a candidate
   * describing itself unusually — it is a typo, or a term somebody invented without adding it. It
   * silently matches nothing, and because facets now gate matching it can change which reference
   * caps a verdict, or remove the comparison altogether. Recording that in a caveat and scoring
   * anyway means the caveat has to be read by somebody who already has a number in front of them.
   *
   * So it throws, symmetrically with `loadBenchmarkReferences`, which already refuses a
   * *reference* declaring a facet the vocabulary does not define. A closed vocabulary that is
   * enforced on one side and merely observed on the other is not closed.
   *
   * ANCHORS ARE DELIBERATELY NOT TREATED THIS WAY, and the difference is not squeamishness.
   * There is no declared anchor vocabulary anywhere in the corpus. The set below is *derived* —
   * the union of whatever `anchorsFor` values the current references happen to carry — so
   * "unknown" means only "no reference offers this today", which changes whenever a reference is
   * added or edited. Failing closed on that would make a candidate's validity depend on the
   * contents of the corpus rather than on a contract, and would turn adding a reference into a
   * breaking change for unrelated packets. Prototype E is the worked example: it declared
   * `editorial-rhythm`, which one reference happens to offer, and `place-and-atmosphere`, which
   * none does — and neither was a mistake, because nothing ever told it what the options were.
   *
   * Anchors therefore stay a caveat until a vocabulary is declared for them. When one is, this
   * should become the same refusal.
   */
  const unknownFacets = [...wantedFacets].filter((facet) => !Object.hasOwn(vocabulary, facet));
  if (unknownFacets.length) {
    const known = Object.keys(vocabulary).sort().join(', ');
    throw new Error(
      `Business facet(s) ${unknownFacets.map((facet) => JSON.stringify(facet)).join(', ')} are not defined by the benchmark corpus, so they match nothing and would silently change which reference caps this verdict. Declare them in the corpus vocabulary or correct the candidate. Defined facets: ${known || '(none)'}.`,
    );
  }

  const anchorVocabulary = new Set(list(loaded.references).flatMap((reference) => list(reference.anchorsFor).map(lower)));
  const unknownAnchors = [...wantedAnchors].filter((anchor) => !anchorVocabulary.has(anchor));

  const kind = businessKind ? lower(businessKind) : null;
  const legacy = wantedFacets.size === 0 && Boolean(kind);

  const scored = list(loaded.references).map((reference) => {
    const { eligible, reasons } = eligibility(reference, loaded);
    const facets = new Set(list(reference.businessFacets).map(lower));
    const sharedFacets = [...wantedFacets].filter((facet) => facets.has(facet));
    const sharedAnchors = list(reference.anchorsFor).map(lower).filter((anchor) => wantedAnchors.has(anchor));
    const legacyHit = legacy && list(reference.appropriateFor).some((entry) => lower(entry).includes(kind));
    const problemFit = legacy ? (legacyHit ? 1 : 0) : sharedFacets.length;
    return {
      reference,
      eligible,
      ineligibleBecause: reasons,
      problemFit,
      sharedFacets,
      sharedAnchors,
      breadth: facets.size,
      /*
       * On the facet path, business relevance is a GATE and anchors only rank.
       *
       * Allowing `problemFit > 0 || sharedAnchors.length > 0` here would have rebuilt the very
       * fallback this module exists to remove: a candidate that had adopted facets, and shared
       * none of them with any reference, could still acquire a benchmark on design-anchor overlap
       * alone — which is selection by visual similarity wearing a different name, and it is how
       * a one-property letting was sent to a global retailer in the first place.
       *
       * So once a candidate declares what kind of business it is, a reference that is a model for
       * a different kind of business cannot be its benchmark, however much they look alike. If
       * nothing shares a facet the honest answer is that the corpus has no comparison to offer.
       *
       * The legacy prose path keeps the old disjunction deliberately. It is there so callers that
       * have not migrated do not change behaviour, and tightening it would be exactly the silent
       * regression the legacy path exists to prevent.
       */
      fits: eligible && (legacy ? (problemFit > 0 || sharedAnchors.length > 0) : problemFit > 0),
    };
  });

  const ranked = [...scored].sort((a, b) =>
    Number(b.fits) - Number(a.fits)
    || b.problemFit - a.problemFit
    || b.sharedAnchors.length - a.sharedAnchors.length
    || a.breadth - b.breadth
    || a.reference.id.localeCompare(b.reference.id));

  const winner = ranked.find((entry) => entry.fits) ?? null;
  const why = (entry) => {
    if (!entry.eligible) return `not eligible: ${entry.ineligibleBecause.join('; ')}`;
    const parts = [];
    if (legacy) parts.push(entry.problemFit ? 'matches the declared business kind in its description (legacy prose match)' : 'does not match the declared business kind');
    else parts.push(entry.sharedFacets.length ? `shares business facets ${entry.sharedFacets.join(', ')}` : 'shares no business facet');
    parts.push(entry.sharedAnchors.length ? `shares anchors ${entry.sharedAnchors.join(', ')}` : 'shares no anchor');
    parts.push(`declares ${entry.breadth} facet(s)`);
    return parts.join('; ');
  };

  const caveats = [
    legacy ? 'The candidate declared no business facets, so this fell back to the legacy prose match and the result should be treated as weak.' : null,
    unknownAnchors.length ? `The candidate declared anchor(s) no reference offers and which therefore matched nothing: ${unknownAnchors.join(', ')}.` : null,
  ].filter(Boolean);

  return {
    matched: Boolean(winner),
    note: [
      winner
        ? `Selected ${winner.reference.id}: it ${why(winner)}. Compare on quality of decision-making, never on visual similarity.`
        : legacy
          ? 'No reference in the corpus solves a problem resembling this one. Record that there is no comparison rather than forcing one.'
          : `No reference in the corpus is a model for a business declaring ${[...wantedFacets].join(', ') || 'no facets'}. Design anchors alone do not qualify a reference once the business is declared, so there is no comparison to offer. Record that rather than forcing one.`,
      ...caveats,
    ].join(' '),
    caveats,
    // Always empty: an undefined business facet throws above rather than reaching a caller as
    // data. Kept in the shape so a consumer written against the previous contract still reads.
    unknownFacets,
    unknownAnchors,
    usedLegacyBusinessKindMatch: legacy,
    ordered: ranked.map((entry) => ({
      id: entry.reference.id,
      name: entry.reference.name,
      qualityClass: entry.reference.qualityClass,
      eligible: entry.eligible,
      fits: entry.fits,
      problemFit: entry.problemFit,
      sharedFacets: entry.sharedFacets,
      sharedAnchors: entry.sharedAnchors,
      breadth: entry.breadth,
      why: why(entry),
    })),
    // No match returns no reference. Handing back the least-bad entry alongside `matched: false`
    // invites a caller to use it, and a comparison against a reference that does not fit produces
    // a number, and the number is noise.
    reference: winner?.reference ?? null,
  };
}

/**
 * Turn a set of pairwise judgements into a benchmark gap.
 *
 * The rule is written in terms of how often the reference wins *substantially*,
 * because that is the observation that actually bears on "is this benchmark
 * class". One dimension where the reference is a bit better is compatible with
 * excellent work; three where it is in a different league is not, whatever the
 * absolute scores said.
 *
 * Thresholds are stated as fractions of the dimensions actually compared, so a
 * partial comparison is not silently more generous than a complete one.
 */
export function deriveBenchmarkGap(comparisons) {
  const entries = list(comparisons).filter((entry) => PAIRWISE_OUTCOMES.includes(entry?.outcome));
  if (!entries.length) {
    return { gap: 'UNASSESSED', detail: 'No pairwise comparison was recorded, so no gap has been measured. This is not the same as no gap.', counts: null, compared: 0 };
  }

  const counts = Object.fromEntries(PAIRWISE_OUTCOMES.map((outcome) => [outcome, entries.filter((entry) => entry.outcome === outcome).length]));
  const total = entries.length;
  const substantial = counts['reference-substantially-stronger'] / total;
  const referenceAhead = (counts['reference-substantially-stronger'] + counts['reference-stronger']) / total;
  const candidateHolds = (counts['candidate-stronger'] + counts['roughly-comparable']) / total;

  let gap;
  if (substantial >= 0.25 || referenceAhead >= 0.6) gap = 'LARGE';
  else if (substantial > 0 || referenceAhead >= 0.35) gap = 'MATERIAL';
  else if (candidateHolds >= 0.85) gap = 'NONE';
  else gap = 'SMALL';

  return {
    gap,
    detail: BENCHMARK_GAP_MEANING[gap],
    counts,
    compared: total,
    dimensionsNotCompared: PAIRWISE_DIMENSIONS.filter((dimension) => !entries.some((entry) => entry.dimension === dimension)),
  };
}

/**
 * Refuse a comparison that does not say what it compared against.
 *
 * A pairwise result with no reference recorded cannot be re-examined, and an
 * unre-examinable comparison is the kind of evidence that quietly becomes a
 * justification for whatever the reviewer already thought.
 */
export function assertComparisonRecorded(comparison) {
  if (!comparison?.referenceId) throw new Error('A pairwise comparison must name the reference it was made against.');
  const entries = list(comparison.comparisons);
  if (!entries.length) throw new Error(`The comparison against ${comparison.referenceId} judged no dimensions.`);
  for (const entry of entries) {
    if (!PAIRWISE_DIMENSIONS.includes(entry?.dimension)) {
      throw new Error(`Unknown pairwise dimension ${JSON.stringify(entry?.dimension)}. It offers: ${PAIRWISE_DIMENSIONS.join(', ')}.`);
    }
    if (!PAIRWISE_OUTCOMES.includes(entry?.outcome)) {
      throw new Error(`Unknown pairwise outcome ${JSON.stringify(entry?.outcome)} for ${entry?.dimension}. It offers: ${PAIRWISE_OUTCOMES.join(', ')}.`);
    }
    if (!String(entry?.note ?? '').trim()) {
      throw new Error(`The ${entry.dimension} comparison records no reason. A pairwise verdict without a sentence cannot be disagreed with, which is the only thing it was for.`);
    }
  }
  return true;
}

export { BENCHMARK_GAPS, BENCHMARK_GAP_MEANING, PAIRWISE_DIMENSIONS, PAIRWISE_OUTCOMES };
