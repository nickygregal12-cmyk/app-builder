/**
 * What the factory is allowed to produce before it is allowed to write:
 * a proposal, and nothing else.
 *
 * Proposal-only mode is the step between profiling a repository and changing
 * it. The profiler proved the factory can read an existing product without
 * touching it. A proposal proves something harder and more useful: that it can
 * say what it would do, what it is unsure about, and what would go wrong — in a
 * bounded artifact somebody can disagree with before a single file moves.
 *
 * ## A proposal is not a permission slip
 *
 * This is the property the module is built around, and it is enforced rather
 * than promised. `grantsMutation` is a literal `false` that no input can move.
 * There is no argument, no option and no code path that produces a proposal
 * carrying authority, because the moment a rich enough proposal can authorise
 * its own execution, the authorisation contract has been replaced by a
 * sufficiently confident model.
 *
 * What a proposal may carry is a *recommendation* about whether mutation should
 * proceed, alongside the two independent reasons it might not: the evidence is
 * inadequate, or nobody has authorised it. Those stay separate all the way to
 * the surface. They are fixed by different people.
 *
 * ## Retrieval is measured here rather than assumed
 *
 * Every proposal records what the factory read to produce it — files it
 * considered, files it actually used, how many search passes it took, and which
 * files it later turned out to have needed and missed. This exists because the
 * cheapest wrong answer to "brownfield is hard" is to install a semantic index
 * over the repository and hope. `docs/ROADMAP.md` defers that deliberately, and
 * the way to settle it is a measurement rather than an intuition about
 * repository size. These numbers are that measurement, gathered on every run at
 * no extra cost, so the decision can eventually be made on evidence that
 * already exists.
 */

import { mutationPermitted } from './preservation-contract.mjs';

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Summarise what a run read, and what it turned out to have missed.
 *
 * `requiredFiles` is the held-out half: the files a task genuinely cannot be
 * done without, recorded in the benchmark rather than shown to whatever
 * produced the proposal. Comparing it against `used` is what makes "retrieval
 * failed" a measurement instead of a complaint.
 */
export function measureRetrieval({ considered = [], used = [], searchIterations = 0, requiredFiles = null, tokensRead = null }) {
  const usedSet = new Set(used);
  const consideredSet = new Set(considered);
  const required = requiredFiles === null ? null : list(requiredFiles);

  return {
    filesConsidered: consideredSet.size,
    filesUsed: usedSet.size,
    searchIterations,
    tokensRead,
    // Files pulled into context that no part of the answer rested on. Not a
    // defect on its own — reading to rule something out is real work — but the
    // ratio is what a repository map would have to improve.
    irrelevantFilesLoaded: [...consideredSet].filter((file) => !usedSet.has(file)).length,
    requiredFilesMissed: required === null ? null : required.filter((file) => !usedSet.has(file)),
    // Only meaningful when the benchmark supplied the held-out answer. Null is
    // honest; zero would claim a perfect score nobody measured.
    retrievalComplete: required === null ? null : required.every((file) => usedSet.has(file)),
  };
}

/**
 * Build the proposal.
 *
 * @param {object} input
 * @param {object} input.baseline      the exact-revision fixed point
 * @param {object} input.preservation  what must survive, and whether evidence covers it
 * @param {object} [input.improvement] the validated Improvement Contract, where one exists
 * @param {object} input.diagnosis     the finding: what is wrong, what would change, what is uncertain
 * @param {object} [input.retrieval]   a `measureRetrieval` result for the run that produced this
 */
export function buildProposal({ baseline, preservation, improvement = null, diagnosis = {}, retrieval = null }) {
  const evidenceAdequate = preservation?.mutation?.evidenceAdequate === true;
  const authorised = preservation?.mutation?.authorised === true;
  const contractExecutable = improvement ? improvement.executable === true : false;

  /**
   * The recommendation, and every reason against it.
   *
   * Assembled as a list rather than a first-match so a reader sees all three
   * possible blockers at once. Reporting only the first would send somebody to
   * find an owner, and then — after they found one — to go and gather evidence.
   */
  const blockers = [];
  if (!evidenceAdequate) {
    blockers.push({
      kind: 'insufficient-preservation-evidence',
      detail: 'The Preservation Contract cannot state with evidence what must be preserved, so a regression introduced by this change would not be noticed.',
      refusals: list(preservation?.mutation?.refusals).filter((reason) => !reason.startsWith('No authorisation record')),
      owner: 'engineering',
    });
  }
  if (!authorised) {
    blockers.push({
      kind: 'not-authorised',
      detail: 'Nothing has granted mutation of this repository. Evidence establishes that a regression would be visible; it never establishes permission.',
      owner: 'repository owner',
    });
  }
  if (!contractExecutable) {
    blockers.push({
      kind: improvement ? 'improvement-contract-not-executable' : 'no-improvement-contract',
      detail: improvement
        ? 'The Improvement Contract is not well formed, so there is no bounded change for a mutation to be bounded by.'
        : 'No Improvement Contract accompanies this proposal. A diagnosis is not a scoped change.',
      refusals: list(improvement?.refusals),
      owner: 'engineering',
    });
  }

  return {
    schemaVersion: 1,
    authority: 'brownfield-proposal',
    subject: baseline?.subject ?? null,
    revision: baseline?.revision ?? null,
    preservationRevision: preservation?.revision ?? null,

    diagnosis: {
      finding: diagnosis.finding ?? null,
      // The vocabulary §5.1 of the parity programme already defines. Not
      // re-invented here, and deliberately not defaulted: a proposal that
      // cannot classify its own finding should say so rather than pick the
      // cheapest classification.
      classification: diagnosis.classification ?? null,
      evidenceUsed: list(diagnosis.evidenceUsed),
      /**
       * Carried at the top level of the artifact on purpose.
       *
       * Uncertainty buried three levels into a structure gets skimmed past. The
       * whole value of proposal-only mode is that somebody reads this field
       * before anything is written.
       */
      uncertain: list(diagnosis.uncertain),
      proposedChange: diagnosis.proposedChange ?? null,
      affects: list(diagnosis.affects),
      productImpact: diagnosis.productImpact ?? null,
      preservationRisks: list(diagnosis.preservationRisks),
      verificationPlan: list(diagnosis.verificationPlan),
      specialistRequired: diagnosis.specialistRequired ?? null,
    },

    estimatedChurn: improvement?.estimatedChurn ?? null,
    retrieval,

    /**
     * The recommendation. Advice about a decision, never the decision.
     */
    recommendation: {
      mutationShouldProceed: blockers.length === 0,
      blockers,
    },

    /**
     * The constant.
     *
     * A proposal never grants mutation authority, whatever it contains and
     * however confident it is. Asserted in the artifact so that a consumer
     * reading a stored proposal off disk can check the property rather than
     * trusting that the code which wrote it behaved.
     */
    grantsMutation: false,
    mutationPermittedByContract: mutationPermitted(preservation),
  };
}
