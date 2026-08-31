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
 * Load the corpus, refusing anything that does not declare where it came from.
 *
 * Synthetic material that forgets to say it is synthetic is the one way this
 * corpus could cause harm — it would become "evidence" in a later report about
 * how the factory scores against real businesses.
 */
export function loadCorpus() {
  const corpus = JSON.parse(fs.readFileSync(path.join(CORPUS_DIRECTORY, 'corpus.v1.json'), 'utf8'));
  for (const item of corpus.items) {
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

  return {
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
     * `examples/critic-calibration/panel.v1.json` is the empty structure waiting
     * for them, and a reviewer panel is an owner action. Null is the honest
     * value; zero would be a claim nobody measured.
     */
    humanAgreement: null,
    humanAgreementUnavailable: 'No adjudicated human scores exist. A qualified, blinded review panel is an owner action, and a calibration that invented reference scores would measure the Critic against this tool\'s opinion.',
  };
}
