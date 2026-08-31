/**
 * The other half of the pair: what a bounded change is actually for.
 *
 * A Preservation Contract says what must survive. On its own it permits
 * nothing, because "you may change anything that does not break these" is not a
 * task — it is a licence with a safety rail. An Improvement Contract is the
 * matching half: one named defect, the evidence it is real, the outcome that
 * should move, and the size at which the change stops being reviewable.
 *
 * `docs/PLATFORM_PARITY_PROGRAMME.md` §5.3 already specifies this artifact and
 * says the important thing about it — it must be built from the existing
 * project/task/ChangeSet primitives rather than a second task system. This
 * module is therefore a validator, not a task store. It takes a stated
 * improvement and a Preservation Contract and answers whether the pair is
 * executable, which is a question about the statement rather than about
 * anything that has run.
 *
 * ## Why "make it better" is rejected on purpose
 *
 * It is the most common instruction a brownfield agent will ever receive, and
 * it is unfalsifiable. Every diff satisfies it. An improvement that cannot name
 * what would count as failure cannot be reviewed, cannot be rolled back on
 * evidence, and cannot be told apart from churn — so it is refused here rather
 * than discovered to be meaningless after the change is written.
 *
 * The refusals are deliberately about *structure*, never about whether the idea
 * is good. Whether reducing duplicated cart state is worth doing is a judgement
 * for a specialist with the evidence in front of them. Whether the contract
 * says which files may change is not a judgement at all.
 */

import { mutationPermitted } from './preservation-contract.mjs';

/**
 * Phrases that describe a mood rather than an outcome.
 *
 * Matched only against the measurable-outcome field, never against prose the
 * contract carries for a human to read. A rationale is allowed to say the
 * change will modernise something; a success measure is not, because the
 * measure is what somebody has to check afterwards.
 */
const UNFALSIFIABLE = [
  /\bmake it better\b/i,
  /\bimprove(?:ments?)? (?:the )?(?:code|codebase|quality|things)\b/i,
  /\bmodernis[ez]e?\b/i,
  /\bclean(?: it)? up\b/i,
  /\bbest practices?\b/i,
  /\bmore maintainable\b/i,
  /\btidy\b/i,
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Does a changed path fall inside a declared scope entry?
 *
 * Prefix matching on path segments, so `src/cart` covers `src/cart/index.ts`
 * and never `src/cartography.ts`. A scope that accidentally matched a sibling
 * directory by string prefix would be a scope that does not hold.
 */
function within(target, scope) {
  const normalise = (value) => String(value).replace(/^\.\//, '').replace(/\/+$/, '');
  const path = normalise(target);
  const prefix = normalise(scope);
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Validate a stated improvement against what must be preserved.
 *
 * @param {object} improvement   the stated change: defect, evidence, outcome, scope, churn
 * @param {object} preservation  the Preservation Contract for the same revision
 */
export function validateImprovementContract(improvement, preservation) {
  const refusals = [];

  // --- The two halves must be about the same product ------------------------------
  //
  // First, because every scope and churn check below is meaningless if the
  // contracts describe different revisions. This is the mistake that would
  // otherwise be found late and look like a scope bug.
  if (preservation?.authority !== 'brownfield-preservation-contract') {
    refusals.push('No Preservation Contract was supplied. An improvement with nothing to preserve is a change with no protected behaviour, which is the state this whole path exists to prevent.');
  } else if (improvement?.baselineRevision && improvement.baselineRevision !== preservation.revision) {
    refusals.push(`The improvement names baseline ${improvement.baselineRevision} and the Preservation Contract is for ${preservation.revision}. Two revisions is two products.`);
  } else if (!improvement?.baselineRevision) {
    refusals.push('The improvement names no baseline revision, so there is no before for its after to be measured against.');
  }

  // --- Is there a defect, and is it real? -------------------------------------------
  if (!improvement?.defect) {
    refusals.push('The improvement names no specific defect or opportunity. A change that cannot say what is wrong cannot be reviewed against anything.');
  }
  if (!list(improvement?.currentEvidence).length) {
    refusals.push('No evidence is offered that the defect is real. A diagnosis from reading alone is a hypothesis, and acting on it is how a preference becomes a finding.');
  }

  // --- Would anybody be able to tell whether it worked? --------------------------------
  const measures = list(improvement?.successMeasures);
  if (!measures.length) {
    refusals.push('The improvement declares no success measure, so no outcome can confirm or refute it.');
  }
  for (const measure of measures) {
    const text = typeof measure === 'string' ? measure : measure?.statement ?? '';
    const vague = UNFALSIFIABLE.find((pattern) => pattern.test(text));
    if (vague) {
      refusals.push(`Success measure ${JSON.stringify(text)} is unfalsifiable — every possible diff satisfies it. Name the thing that moves and the direction it moves in.`);
    }
    if (typeof measure === 'object' && measure && !measure.method) {
      refusals.push(`Success measure ${JSON.stringify(text)} does not say how it will be measured, so it is an intention rather than a check.`);
    }
  }

  // --- What must not move -----------------------------------------------------------
  if (!list(improvement?.mustNotRegress).length) {
    refusals.push('The improvement names nothing that must not regress. Every change to an existing product has something it is not allowed to break, and a contract that names none has not looked.');
  }

  // --- Scope ---------------------------------------------------------------------------
  const scope = list(improvement?.changeScope);
  const allowed = list(preservation?.scope?.allowed);
  const prohibited = list(preservation?.scope?.prohibited);

  if (!scope.length) {
    refusals.push('The improvement declares no change scope. An unbounded ChangeSet cannot be checked for escape, because there is nothing for it to escape from.');
  }
  for (const target of scope) {
    if (prohibited.some((area) => within(target, area))) {
      refusals.push(`Change scope ${JSON.stringify(target)} is inside a prohibited area. A prohibition the improvement may argue with is not a prohibition.`);
    } else if (allowed.length && !allowed.some((area) => within(target, area))) {
      refusals.push(`Change scope ${JSON.stringify(target)} is outside every area the Preservation Contract allows. Widening scope is a decision for whoever declared it, not for the change that wants more room.`);
    }
  }

  // --- Churn ----------------------------------------------------------------------------
  const ceiling = preservation?.scope?.churnCeiling ?? null;
  const estimate = improvement?.estimatedChurn ?? null;
  if (estimate === null || typeof estimate.changedFiles !== 'number') {
    refusals.push('The improvement estimates no churn, so it cannot be compared against the ceiling it is supposed to stay under.');
  } else if (ceiling && typeof ceiling.changedFiles === 'number' && estimate.changedFiles > ceiling.changedFiles) {
    refusals.push(`The improvement expects to change ${estimate.changedFiles} files against a ceiling of ${ceiling.changedFiles}. A slice that does not fit is decomposed, not permitted.`);
  }
  if (estimate && ceiling && typeof ceiling.changedLines === 'number' && typeof estimate.changedLines === 'number' && estimate.changedLines > ceiling.changedLines) {
    refusals.push(`The improvement expects to change ${estimate.changedLines} lines against a ceiling of ${ceiling.changedLines}.`);
  }

  // --- Accepted debt must stay accepted -------------------------------------------------
  //
  // An improvement is allowed to target a known failure — but only by saying so,
  // because that is a decision to reclassify accepted debt and it belongs to
  // whoever accepted it. Repairing one silently is the failure mode.
  for (const failure of list(preservation?.knownFailures)) {
    const targeted = measures.some((measure) => String(typeof measure === 'string' ? measure : measure?.statement ?? '').includes(failure.name))
      || list(improvement?.mustNotRegress).includes(failure.name);
    if (targeted && !list(improvement?.reclassifies).includes(failure.name)) {
      refusals.push(`The improvement touches known failure "${failure.name}" without declaring that it reclassifies it. Accepted debt is somebody's decision, and repairing it quietly overturns that decision without review.`);
    }
  }

  // --- What would make this unsafe ---------------------------------------------------------
  if (!list(improvement?.wouldBeUnsafeIf).length) {
    refusals.push('The improvement does not say what would make it unsafe or insufficient. A proposal that cannot describe its own failure conditions has not considered them.');
  }

  return {
    schemaVersion: 1,
    authority: 'brownfield-improvement-contract',
    baselineRevision: improvement?.baselineRevision ?? null,
    defect: improvement?.defect ?? null,
    successMeasures: measures,
    mustNotRegress: list(improvement?.mustNotRegress),
    changeScope: scope,
    estimatedChurn: estimate,
    reclassifies: list(improvement?.reclassifies),
    wouldBeUnsafeIf: list(improvement?.wouldBeUnsafeIf),

    /** Whether the *statement* is sound. Never whether the change may be made. */
    executable: refusals.length === 0,
    refusals,

    /**
     * Both halves, reported together and separately.
     *
     * A well-formed improvement against a repository nobody may touch is a
     * perfectly good plan that is not permitted, and reading that as "not
     * executable" would send somebody to fix the contract instead of finding
     * the evidence or the owner.
     */
    readyToExecute: refusals.length === 0 && mutationPermitted(preservation),
    blockedByPreservation: !mutationPermitted(preservation),
  };
}
