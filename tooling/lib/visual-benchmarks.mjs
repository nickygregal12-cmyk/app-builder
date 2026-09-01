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
  for (const reference of list(corpus.references)) {
    if (!reference.url || !reference.dateObserved || !reference.qualityClass) {
      throw new Error(`Benchmark reference ${reference.id} does not record a url, a date observed and a quality class. A reference nobody can go and look at is an assertion.`);
    }
  }
  return corpus;
}

/**
 * Choose the reference a candidate should be compared with.
 *
 * On the business problem, deliberately. `anchorsFor` and `appropriateFor`
 * describe what kind of design problem a reference solved well, and the match
 * is made against the candidate's own problem — so a data-heavy report site is
 * measured against the report, and a hospitality business against Aman, and a
 * plumber against neither.
 *
 * Returns candidates in order rather than one answer, because a reviewer that
 * disagrees with the first should be able to see and justify a different
 * choice. An unmatched candidate returns the full list with a note saying so:
 * "no reference resembles this problem" is a legitimate state and pretending
 * otherwise would force a bad comparison.
 */
export function selectReference({ businessKind = null, anchors = [], corpus = null } = {}) {
  const loaded = corpus ?? loadBenchmarkReferences();
  const wanted = new Set(list(anchors).map((value) => String(value).toLowerCase()));
  const kind = businessKind ? String(businessKind).toLowerCase() : null;

  const ranked = list(loaded.references)
    .map((reference) => {
      const anchorHits = list(reference.anchorsFor).filter((anchor) => wanted.has(String(anchor).toLowerCase())).length;
      const kindHit = kind && list(reference.appropriateFor).some((entry) => String(entry).toLowerCase().includes(kind)) ? 1 : 0;
      return { reference, score: anchorHits * 2 + kindHit * 3 };
    })
    .sort((a, b) => b.score - a.score || a.reference.id.localeCompare(b.reference.id));

  const matched = ranked.filter((entry) => entry.score > 0);
  return {
    matched: matched.length > 0,
    // No match is reported rather than resolved. A comparison forced against an
    // irrelevant reference produces a number, and the number is noise.
    note: matched.length
      ? `Matched on ${matched[0].score} point(s) of problem overlap. Compare on quality of decision-making, never on visual similarity.`
      : 'No reference in the corpus solves a problem resembling this one. Compare against the closest by decision-making, and record that the match is weak.',
    ordered: ranked.map((entry) => ({ id: entry.reference.id, name: entry.reference.name, score: entry.score, qualityClass: entry.reference.qualityClass })),
    reference: ranked[0]?.reference ?? null,
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
