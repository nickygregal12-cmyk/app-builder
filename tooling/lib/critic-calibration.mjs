/**
 * Measuring a Critic, without asking the Critic how it did.
 *
 * `docs/VISUAL_EXCELLENCE.md` records that the visual gate has been met once,
 * in anger, and failed: a different-vendor critic rejected both nbm candidates
 * at 5.21 and 4.66 against a bar of 8.5 mean and 6.5 floor. That is the loop
 * working. What nobody has established is whether a *model* Critic put in that
 * seat would agree — and the specific way it would fail is not harshness but
 * generosity: passing a site that is beautifully composed and says nothing.
 *
 * This module measures that. It holds no promotion authority, decides no gate
 * and cannot mark anything as reviewed. It reads a corpus of artifacts whose
 * defects are known, reads what a Critic said about them, and reports where the
 * two disagree.
 *
 * ## Why the headline metric is separation rather than agreement
 *
 * The obvious measurement is "how close were the Critic's scores to the right
 * ones?" — and there are no right ones. Nobody has adjudicated a score for any
 * artifact here, because that needs a panel of qualified human reviewers
 * working to a blinded rubric, and that is an owner action rather than an
 * engineering one. A calibration that invented the reference scores would be
 * measuring a Critic against this module's opinion.
 *
 * So the corpus asserts only what can be known without a panel:
 *
 * - some artifacts were **built with a specific defect**, or were independently
 *   reviewed below the bar. A Critic that passes one of those is wrong, and no
 *   agreement about its exact score is needed to say so.
 * - some artifacts have **no planted defect**. That is not a claim they are
 *   excellent. They exist to catch the degenerate Critic — the one that rejects
 *   everything, scores a perfect zero false-pass rate, and has learned nothing.
 *
 * The pair gives **separation**: does the Critic score the undamaged artifacts
 * higher than the damaged ones? A blanket rejector separates by zero. That is
 * the number a panel is not required for, and it is the one worth having first.
 *
 * ## The bar is copied, and checked against its source
 *
 * `minimumScore` and `minimumCriterionScore` live in `config/agent-pipelines.json`
 * under `gates.visual`. The corpus carries a copy so the material is readable on
 * its own, and `tooling/critic-calibration.test.mjs` asserts the two agree. A
 * corpus that quietly measured against a bar the gate had moved away from would
 * be worse than no corpus.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORPUS_DIRECTORY = path.resolve(HERE, '../../examples/critic-calibration');

export const OUTCOMES = Object.freeze(['planted-defect', 'no-planted-defect']);

/**
 * The corpus CC1 could not fail on, and why CC2 exists.
 *
 * CC1's headline number is separation: does the Critic score undamaged
 * artifacts above damaged ones? A Critic that scores the generic template 8.6
 * and the excellent fixture 9.9 separates by 1.3 and passes handsomely — while
 * calling a bootstrap-era theme with its colours changed "strong professional
 * work". That is the exact miscalibration the visual gate suffers from, and the
 * corpus designed to detect miscalibration could not see it.
 *
 * So CC2 adds ordering across quality strata and, more importantly, a
 * measurement of what the Critic does at the TOP of the scale — how often it
 * issues a 9 or above, and to what. A Critic whose scores cluster between 8 and
 * 9 for everything competent has a working floor and no ceiling.
 */
export const CURRENT_CORPUS = 'corpus.v2.json';

/** Scores at or above this are claims about exceptional work, and are counted as such. */
const EXCEPTIONAL_CLAIM = 9;

/**
 * Load the corpus, refusing anything that does not declare where it came from.
 *
 * Synthetic material that forgets to say it is synthetic is the one way this
 * corpus could cause harm — it would become "evidence" in a later report about
 * how the factory scores against real businesses.
 */
export function loadCorpus(file = CURRENT_CORPUS) {
  const corpus = JSON.parse(fs.readFileSync(path.join(CORPUS_DIRECTORY, file), 'utf8'));
  const strata = new Set((corpus.qualityStrata ?? []).map((stratum) => stratum.id));
  for (const item of corpus.items) {
    if (strata.size && item.qualityStratum && !strata.has(item.qualityStratum)) {
      throw new Error(`Calibration item ${item.id} declares quality stratum ${JSON.stringify(item.qualityStratum)}, which the corpus does not define.`);
    }
    if (!['synthetic-fixture', 'genuine-business-review'].includes(item.provenance)) {
      throw new Error(`Calibration item ${item.id} declares provenance ${JSON.stringify(item.provenance)}. An item that does not say what it is can be mistaken for evidence about a real business.`);
    }
    if (!OUTCOMES.includes(item.expectedOutcome)) {
      throw new Error(`Calibration item ${item.id} declares expectedOutcome ${JSON.stringify(item.expectedOutcome)}, which is not one of ${OUTCOMES.join(', ')}.`);
    }
    if (item.expectedOutcome === 'planted-defect' && !item.plantedDefect) {
      throw new Error(`Calibration item ${item.id} is expected to fail and does not say why. An item whose defect is not written down cannot tell a right answer from a lucky one.`);
    }
  }
  return corpus;
}

/**
 * Does a verdict clear the gate?
 *
 * Both halves, because that is what the gate does: a strong mean must not hide
 * one badly failing criterion, which is the entire reason
 * `minimumCriterionScore` exists.
 */
export function passesBar(verdict, bar) {
  const scores = (verdict?.criterionScores ?? []).map((entry) => Number(entry.score));
  if (typeof verdict?.meanScore !== 'number' || !scores.length) return false;
  return verdict.meanScore >= bar.minimumScore && Math.min(...scores) >= bar.minimumCriterionScore;
}

/**
 * A stable, seeded presentation order.
 *
 * Reviewers must not see the corpus grouped by stratum: three generic sites in
 * a row teach the reader what the next answer is, and the scores stop being
 * independent. Ordering is derived from a hash of the seed and the item id so
 * the same seed reproduces the same order on any machine — a shuffle nobody can
 * reproduce makes a disputed result impossible to re-examine.
 *
 * The seed is the caller's, and the mapping back to strata stays in the corpus
 * rather than travelling with the blinded list.
 */
export function blindedOrder(items, seed) {
  if (!seed) throw new Error('Blinding needs a seed. An unseeded order cannot be reproduced, and a review nobody can re-examine is not evidence.');
  return [...items]
    .map((item) => ({ item, key: crypto.createHash('sha256').update(`${seed}::${item.id}`).digest('hex') }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ item }, index) => ({ position: index + 1, itemId: item.id, artifact: item.artifact }));
}

function mean(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

/**
 * Compare what a Critic said against what the corpus knows.
 *
 * @param {object}   input
 * @param {object}   input.corpus    a loaded corpus
 * @param {object[]} input.verdicts  one per item: { itemId, meanScore, criterionScores, failingCriteria }
 * @param {boolean}  [input.includeHeldOut] whether held-out items count toward the headline numbers
 */
export function measureCalibration({ corpus, verdicts = [], includeHeldOut = true }) {
  const bar = corpus.bar;
  const byId = new Map(verdicts.map((verdict) => [verdict.itemId, verdict]));
  const considered = corpus.items.filter((item) => includeHeldOut || !item.heldOut);

  const scored = [];
  const missing = [];
  for (const item of considered) {
    const verdict = byId.get(item.id);
    if (!verdict) { missing.push(item.id); continue; }
    scored.push({ item, verdict, passed: passesBar(verdict, bar) });
  }

  const damaged = scored.filter((entry) => entry.item.expectedOutcome === 'planted-defect');
  const undamaged = scored.filter((entry) => entry.item.expectedOutcome === 'no-planted-defect');

  /**
   * The headline failure: an artifact known to be defective, passed.
   *
   * Named per item rather than counted, because "two false passes" is a number
   * and "it passed the site that never says what the company does" is a finding.
   */
  const falsePasses = damaged.filter((entry) => entry.passed).map((entry) => ({
    itemId: entry.item.id,
    stratum: entry.item.stratum,
    meanScore: entry.verdict.meanScore,
    defect: entry.item.plantedDefect?.description ?? null,
  }));

  /**
   * Right answer, wrong reason.
   *
   * A Critic that fails the accessibility fixture because it dislikes the
   * typeface has produced the correct verdict from a reading that will not
   * generalise. Only computed for items the Critic did fail, and only where the
   * corpus named the criteria it should have failed on.
   */
  const misdiagnosed = damaged
    .filter((entry) => !entry.passed && Array.isArray(entry.item.expectedFailingCriteria) && entry.item.expectedFailingCriteria.length)
    .filter((entry) => {
      const named = new Set(entry.verdict.failingCriteria ?? []);
      return !entry.item.expectedFailingCriteria.some((criterion) => named.has(criterion));
    })
    .map((entry) => ({
      itemId: entry.item.id,
      expected: entry.item.expectedFailingCriteria,
      named: entry.verdict.failingCriteria ?? [],
    }));

  const damagedMean = mean(damaged.map((entry) => entry.verdict.meanScore));
  const undamagedMean = mean(undamaged.map((entry) => entry.verdict.meanScore));
  const separation = damagedMean === null || undamagedMean === null ? null : Number((undamagedMean - damagedMean).toFixed(3));

  /**
   * How the Critic ranks the quality strata.
   *
   * The strata are an ORDER, not a scale, so this reports the mean score per
   * stratum and whether the order is respected — never how far apart they
   * "should" be, which nobody has adjudicated.
   */
  const strataDefinitions = corpus.qualityStrata ?? [];
  const strataScores = strataDefinitions.map((stratum) => {
    const members = scored.filter((entry) => entry.item.qualityStratum === stratum.id);
    return {
      stratum: stratum.id,
      rank: stratum.rank,
      items: members.length,
      meanScore: members.length ? Number(mean(members.map((entry) => entry.verdict.meanScore)).toFixed(3)) : null,
    };
  });
  const ranked = strataScores.filter((entry) => entry.meanScore !== null).sort((a, b) => a.rank - b.rank);
  const strataInversions = [];
  for (let index = 1; index < ranked.length; index += 1) {
    if (ranked[index].meanScore <= ranked[index - 1].meanScore) {
      strataInversions.push({
        lower: ranked[index - 1].stratum,
        higher: ranked[index].stratum,
        detail: `${ranked[index].stratum} (${ranked[index].meanScore}) did not score above ${ranked[index - 1].stratum} (${ranked[index - 1].meanScore}), and the corpus asserts it is better work.`,
      });
    }
  }

  /**
   * The named pairwise assertions, checked individually.
   *
   * A stratum mean can hide a specific inversion — cc-25 scoring below cc-24 is
   * invisible in an average over ten items, and it is the single most
   * diagnostic result in the corpus because the two differ only in composition.
   */
  const orderingFailures = [];
  for (const assertion of corpus.orderingAssertions ?? []) {
    const scoreFor = (id) => {
      const direct = scored.find((entry) => entry.item.id === id);
      if (direct) return direct.verdict.meanScore;
      const members = scored.filter((entry) => entry.item.qualityStratum === id);
      return members.length ? mean(members.map((entry) => entry.verdict.meanScore)) : null;
    };
    const stronger = scoreFor(assertion.stronger);
    const weaker = scoreFor(assertion.weaker);
    if (stronger === null || weaker === null) continue;
    if (stronger <= weaker) {
      orderingFailures.push({
        assertion: assertion.id,
        stronger: assertion.stronger,
        strongerScore: Number(stronger.toFixed(3)),
        weaker: assertion.weaker,
        weakerScore: Number(weaker.toFixed(3)),
        why: assertion.why,
      });
    }
  }

  /**
   * What the Critic does at the top of the scale.
   *
   * The number CC1 never produced. A Critic that awards 9+ to a generic or
   * broken artifact is inflating, and a Critic that awards 9+ to nothing at all
   * may simply have a broken ceiling — both are reported, and neither is
   * scored, because "how many nines is correct?" depends on the corpus.
   */
  const topEndAwards = scored
    .filter((entry) => typeof entry.verdict.meanScore === 'number' && entry.verdict.meanScore >= EXCEPTIONAL_CLAIM)
    .map((entry) => ({ itemId: entry.item.id, stratum: entry.item.qualityStratum ?? entry.item.stratum, meanScore: entry.verdict.meanScore }));
  const unearnedTopEnd = topEndAwards.filter((entry) => ['T1-broken-amateur', 'T2-generic-template'].includes(entry.stratum));

  /**
   * Scores clustered in a narrow band is the signature of an uncalibrated
   * scale, whatever the separation says. If every artifact in a corpus that
   * spans broken to strong-professional lands between 7.5 and 9, the Critic is
   * not using the scale it was given.
   */
  const allScores = scored.map((entry) => entry.verdict.meanScore).filter((value) => typeof value === 'number');
  const spread = allScores.length ? Number((Math.max(...allScores) - Math.min(...allScores)).toFixed(3)) : null;

  return {
    /** The strata results, and the inversions they contain. */
    strataScores,
    strataInversions,
    ranksStrataCorrectly: ranked.length > 1 ? strataInversions.length === 0 : null,
    orderingFailures,
    honoursOrderingAssertions: (corpus.orderingAssertions ?? []).length ? orderingFailures.length === 0 : null,

    topEndAwards,
    unearnedTopEnd,
    /**
     * The headline upper-end failure, stated as plainly as `falsePasses` states
     * the lower-end one. A Critic that calls a polished generic site
     * exceptional is miscalibrated even if it rejects every broken one.
     */
    inflatesTopEnd: unearnedTopEnd.length > 0,
    scoreSpread: spread,

    schemaVersion: 1,
    authority: 'critic-calibration-measurement',
    corpus: corpus.corpus,
    bar,
    itemsConsidered: considered.length,
    itemsScored: scored.length,
    // Reported rather than treated as passes. A Critic that skipped an item did
    // not approve of it.
    itemsMissing: missing,

    falsePasses,
    falsePassRate: damaged.length ? Number((falsePasses.length / damaged.length).toFixed(3)) : null,
    misdiagnosed,

    separation,
    damagedMean: damagedMean === null ? null : Number(damagedMean.toFixed(3)),
    undamagedMean: undamagedMean === null ? null : Number(undamagedMean.toFixed(3)),
    /**
     * The degenerate Critic, caught.
     *
     * Rejecting everything produces a perfect false-pass rate. Separation at or
     * below zero says the Critic is not discriminating between an artifact
     * built with a defect and one built without, whatever its verdicts were.
     */
    discriminates: separation === null ? null : separation > 0,

    /**
     * The number this cannot produce, and why.
     *
     * Agreement with adjudicated human scores needs adjudicated human scores.
     * `examples/critic-calibration/panel.v2.json` is the empty structure waiting
     * for them, and a reviewer panel is an owner action. Null is the honest
     * value; zero would be a claim nobody measured.
     */
    humanAgreement: null,
    humanAgreementUnavailable: 'No adjudicated human scores exist. A qualified, blinded review panel is an owner action, and a calibration that invented reference scores would measure the Critic against this tool\'s opinion.',
  };
}
