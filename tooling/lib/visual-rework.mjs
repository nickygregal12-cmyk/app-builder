/**
 * One bounded, targeted visual rework pass.
 *
 * A failed visual review used to be a dead end. `recordReview` could record
 * `rework`, and then nothing happened: there was no plan, no revised candidate,
 * no lineage and no ceiling. The two failure modes that leaves open are the
 * ones this file closes.
 *
 * **A review is not a new brief.** A candidate that passed hierarchy,
 * credibility and responsive quality and failed distinctiveness must come back
 * with those three intact and that one addressed. Regenerating the site would
 * throw away three passing criteria to fix one, and the next review would have
 * nothing to compare against. `planVisualRework` therefore names both halves —
 * what failed, and what must survive — and produces the specific axis changes
 * that answer the failure.
 *
 * **A loop needs a ceiling.** "Keep making it prettier until the model is
 * happy" is not a process; it is an unbounded spend with a subjective stop
 * condition. The ceiling is `gates.visual.reworkIterationBudget`, and it is
 * enforced here rather than remembered.
 *
 * The third thing this file does is admit its own limits. Some failures cannot
 * be answered by turning a dial: a distinctive moment that does not land is not
 * a moment set at the wrong intensity, and a weak photograph is not an
 * art-direction defect. Those become a classified `customPresentation`
 * requirement or a `returnedTo` routing, and both are honest outcomes. The
 * Presentation Registry is explicitly not allowed to be a ceiling, so "the
 * closest existing component" is not permitted to be the automatic answer.
 */

import { createHash } from 'node:crypto';
import {
  DEFAULT_COMPOSITION_DIMENSIONS,
  DEFAULT_RESPONSIVE_PLAN,
  REFERENCE_TUNABLE_AXES,
} from './visual-direction.mjs';

const list = (value) => (Array.isArray(value) ? value : []);

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

/** A step along an ordered scale, clamped at both ends. */
function step(axis, from, direction) {
  const scale = REFERENCE_TUNABLE_AXES[axis];
  if (!scale) return null;
  const index = scale.indexOf(from);
  if (index === -1) return null;
  const next = scale[Math.min(scale.length - 1, Math.max(0, index + direction))];
  return next === from ? null : next;
}

/**
 * What each failing criterion asks the factory to change.
 *
 * Every remedy here is a change the build can actually make and a renderer
 * actually reads. A criterion with no remedy is not padded with one: it is
 * routed to the role that owns it, or classified as needing a presentation the
 * registry does not have. That distinction is the whole value of the map — a
 * remedy invented so every criterion has an entry would send an art-direction
 * lane off to fix a photograph.
 */
const REMEDIES = Object.freeze({
  distinctiveness: {
    describe: 'a build that reads as a considered site for this business rather than a template',
    // Distinctiveness is carried by how much room the opening claims. There is
    // a top to that scale, and reaching it is meaningful: it means the answer
    // is not a louder version of the same idea.
    change: (state) => {
      const to = step('visualDistinctiveness', state.visualDistinctiveness, 1);
      return to ? { axis: 'visualDistinctiveness', from: state.visualDistinctiveness, to, because: 'A stronger opening is the change available to a build judged generic.' } : null;
    },
    exhausted: {
      need: 'a presentation that is specific to this business rather than a stronger setting of a general one',
      because: 'The opening is already at the most expressive setting the plan offers, so the build is as distinctive as the registry can make it and was still judged generic.',
    },
  },
  'distinctive-moment': {
    describe: 'a memorable idea that suits this business rather than decorating it',
    // Deliberately no axis change. A declared moment that does not land is not
    // a moment at the wrong intensity, and pretending otherwise is exactly how
    // the closest existing component becomes the permanent answer.
    change: () => null,
    exhausted: {
      need: 'a bespoke presentation for the section carrying the distinctive moment',
      because: 'The registry offers lead-statement, full-bleed-lead and figure-index. The reviewer saw one of them render and judged that it did not land, so a different one from the same list is a guess rather than an answer.',
    },
  },
  'visual-hierarchy': {
    describe: 'a page where the eye reaches the most important thing first',
    change: (state) => {
      const to = step('visualDistinctiveness', state.visualDistinctiveness, 1);
      return to ? { axis: 'visualDistinctiveness', from: state.visualDistinctiveness, to, because: 'Widening the gap between the opening and everything under it is what the plan can do about hierarchy.' } : null;
    },
    exhausted: {
      need: 'a section presentation that establishes hierarchy structurally rather than by scale',
      because: 'The opening is already the largest the plan offers and the hierarchy still did not read.',
    },
  },
  coherence: {
    describe: 'an opening, grid, rhythm and motion that read as one decision',
    change: (state) => {
      const to = step('layoutVariance', state.layoutVariance, -1);
      return to ? { axis: 'layoutVariance', from: state.layoutVariance, to, because: 'Fewer changes of ground make a page read as one decision rather than several.' } : null;
    },
    exhausted: {
      need: 'a composition that holds together without varying its ground at all',
      because: 'The page already sits on one ground throughout and still did not read as one decision.',
    },
  },
  'responsive-quality': {
    describe: 'a phone rendering that is a designed composition rather than the desktop one with fewer columns',
    change: (state) => (state.mobileDensity === 'tighter' && state.mobileSectionOrder === 'conversion-first'
      ? null
      : {
        axis: state.mobileDensity === 'tighter' ? 'mobileSectionOrder' : 'mobileDensity',
        from: state.mobileDensity === 'tighter' ? state.mobileSectionOrder : state.mobileDensity,
        to: state.mobileDensity === 'tighter' ? 'conversion-first' : 'tighter',
        because: 'The responsive plan is where a phone stops being a narrow desktop: tighten the rhythm, then bring the ask forward.',
      }),
    exhausted: {
      need: 'a section that composes differently on a phone rather than the same section tightened',
      because: 'The responsive plan is already tightened and reordered, which is everything it can express.',
    },
  },
  'conversion-clarity': {
    describe: 'a next action that is obvious wherever a visitor is ready to take it',
    change: (state) => ({
      axis: 'ctaPlacement',
      from: state.ctaPlacement,
      to: state.ctaPlacement === 'closing' ? 'mid-page' : 'closing',
      because: 'Where the ask sits relative to the contact detail is the placement decision the direction owns.',
    }),
    exhausted: {
      need: 'a conversion presentation the registry does not offer',
      because: 'Both placements the direction can express have been tried.',
    },
  },
  'brand-fit': {
    describe: 'a build that reads as this business',
    // Not this lane's. The accent and typographic voice come from what the
    // company's own material showed; a build that does not read as the business
    // is a question about that resolution, not about art direction.
    routeTo: 'brand-research',
    detail: 'The accent and typographic voice are resolved from the company\'s own material by BrandSpec. A build that does not read as the business is a brand-resolution question, and no art-direction axis answers it.',
  },
  credibility: {
    describe: 'a build the intended customer trusts more after seeing it',
    routeTo: 'composition',
    detail: 'Credibility comes from what proof the page carries and in what order. That is the composer\'s decision over the knowledge pack, not a presentation setting.',
  },
  'imagery-suitability': {
    describe: 'published photographs that suit the business and frame well at every width',
    routeTo: 'asset-governance',
    detail: 'Which photographs publish, and how they are cropped, is asset governance. No art-direction axis improves an unsuitable photograph.',
  },
});

export const REWORKABLE_CRITERIA = Object.freeze(Object.keys(REMEDIES).filter((id) => REMEDIES[id].change));

/** The axis values a rework reads, gathered from the candidate's own plan. */
function candidateState(candidate) {
  const dimensions = { ...DEFAULT_COMPOSITION_DIMENSIONS, ...candidate?.artDirection?.dimensions };
  const responsive = { ...DEFAULT_RESPONSIVE_PLAN, ...candidate?.artDirection?.responsive };
  return { ...dimensions, ...responsive };
}

/**
 * Which section a bespoke presentation would be for.
 *
 * Derived from the candidate's own signature rather than guessed: the
 * distinctive moment lives on the opening, and everything else that reaches
 * this point is about the page as a whole.
 */
function customPresentationSection(candidate, criterion) {
  const first = list(candidate?.signature?.sequence)[0];
  const opening = list(first?.presentation)[0] ?? null;
  if (criterion === 'distinctive-moment' || criterion === 'distinctiveness' || criterion === 'visual-hierarchy') {
    return { sectionId: first?.pageId ? `${first.pageId}:opening` : 'opening', sectionType: opening };
  }
  return { sectionId: first?.pageId ? `${first.pageId}:page` : 'page', sectionType: opening };
}

/**
 * Plan one bounded revision.
 *
 * Throws when the budget is spent. That refusal is the ceiling: a set whose
 * candidates have each had their allowed passes is decided — promoted or
 * rejected — rather than revised again.
 */
export function planVisualRework({ set, candidate, gate, criteria = null, plannedBy = 'design-critic', createdAt } = {}) {
  if (!set?.setId) throw new Error('A visual rework plan belongs to a candidate set.');
  if (!candidate) throw new Error('A visual rework plan revises a candidate.');
  if (!createdAt) throw new Error('A visual rework plan records when it was created.');
  if (candidate.review?.verdict !== 'rework') {
    throw new Error(`Candidate ${candidate.candidateId} was not returned for rework (its verdict is ${String(candidate.review?.verdict ?? 'none')}). Only a rework verdict asks for a revision.`);
  }
  const budget = gate?.reworkIterationBudget ?? 2;
  const iteration = (candidate.iteration ?? 0) + 1;
  if (iteration > budget) {
    throw new Error(`Candidate ${candidate.candidateId} has had its ${budget} bounded visual rework pass(es). Decide the set — promote, reject — rather than revising again.`);
  }

  const failing = [...new Set(list(candidate.review.failingCriteria))];
  if (!failing.length) {
    throw new Error(`The rework verdict on ${candidate.candidateId} names no failing criteria, so there is nothing to target. A rework that cannot say what failed is a request to start again.`);
  }
  const scoped = criteria ? criteria.map((entry) => entry.id) : null;
  const unknown = failing.filter((id) => !REMEDIES[id]);
  if (unknown.length) throw new Error(`Unknown visual criteria in the rework verdict: ${unknown.join(', ')}.`);
  if (scoped) {
    const outOfScope = failing.filter((id) => !scoped.includes(id));
    if (outOfScope.length) throw new Error(`The rework verdict fails criteria this candidate was not judged on: ${outOfScope.join(', ')}.`);
  }

  const state = candidateState(candidate);
  const targets = [];
  const returnedTo = [];
  const exhausted = [];
  for (const criterion of failing) {
    const remedy = REMEDIES[criterion];
    if (remedy.routeTo) {
      returnedTo.push({ criterion, role: remedy.routeTo, detail: remedy.detail });
      continue;
    }
    const change = remedy.change(state);
    if (change) {
      targets.push({ ...change, criterion });
      state[change.axis] = change.to;
      continue;
    }
    exhausted.push({ criterion, ...remedy.exhausted });
  }

  // Everything the review passed stays named, so the next review is measured
  // against what this candidate already got right rather than only against the
  // thing that failed.
  const preserved = (scoped ?? list(candidate.review.criterionScores).map((entry) => entry.criterion))
    .filter((id) => !failing.includes(id));

  const customPresentation = exhausted.length
    ? {
      ...customPresentationSection(candidate, exhausted[0].criterion),
      reason: `${exhausted.map((entry) => entry.criterion).join(', ')} failed and no axis the factory can tune would answer it.`,
      artDirectionNeed: exhausted[0].need,
      registryInsufficientBecause: exhausted[0].because,
      responsiveBehaviour: 'Must compose deliberately at 390px, not inherit the desktop arrangement narrowed.',
      motionBehaviour: `Must respect the candidate's motion contract (${state.motionIntensity}) and prefers-reduced-motion.`,
      owner: gate?.reworkOwner ?? 'art-direction',
      status: 'classified',
    }
    : null;

  if (!targets.length && !customPresentation && returnedTo.length === failing.length) {
    // Everything that failed belongs to somebody else. Saying so is the plan.
    // Producing a revised candidate here would change nothing and would spend
    // an iteration proving it.
    return {
      schemaVersion: 1,
      planId: `rework-${hash({ setId: set.setId, candidateId: candidate.candidateId, iteration }).slice(0, 16)}`,
      setId: set.setId,
      projectId: set.projectId,
      parentCandidateId: candidate.candidateId,
      reviewVerdictId: candidate.review.verdictId ?? null,
      iteration,
      iterationBudget: budget,
      owner: returnedTo[0].role,
      failingCriteria: failing,
      preservedCriteria: preserved,
      targets: [],
      returnedTo,
      customPresentation: null,
      frozenTruthHash: set.frozenTruth.baselineCompositionHash,
      revisedCandidateId: null,
      createdAt,
      plannedBy,
    };
  }

  return {
    schemaVersion: 1,
    planId: `rework-${hash({ setId: set.setId, candidateId: candidate.candidateId, iteration }).slice(0, 16)}`,
    setId: set.setId,
    projectId: set.projectId,
    parentCandidateId: candidate.candidateId,
    reviewVerdictId: candidate.review.verdictId ?? null,
    iteration,
    iterationBudget: budget,
    owner: candidate.reworkOwner ?? gate?.reworkOwner ?? 'art-direction',
    failingCriteria: failing,
    preservedCriteria: preserved,
    targets,
    returnedTo,
    customPresentation,
    frozenTruthHash: set.frozenTruth.baselineCompositionHash,
    revisedCandidateId: null,
    createdAt,
    plannedBy,
  };
}

/**
 * The plan, as overrides the direction compiler can apply.
 *
 * Deliberately the same shape the compiler already takes for a design
 * reference, so there is one mechanism for "something outside the registry
 * asked this direction to differ" rather than two.
 */
export function reworkOverrides(plan) {
  const overrides = { artDirection: {}, design: {}, composition: {}, responsive: {} };
  const bucket = (axis) => {
    if (['layoutVariance', 'motionIntensity', 'visualDistinctiveness', 'restraintLevel'].includes(axis)) return 'artDirection';
    if (['density', 'maxWidth', 'radius'].includes(axis)) return 'design';
    if (['mobileHero', 'navigation', 'mobileSectionOrder', 'mobileDensity', 'mobileMotion'].includes(axis)) return 'responsive';
    return 'composition';
  };
  for (const target of list(plan?.targets)) overrides[bucket(target.axis)][target.axis] = target.to;
  return overrides;
}

/**
 * Attach a revision to the set, with the lineage that makes it a revision.
 *
 * The frozen truth is compared rather than copied. A revised candidate whose
 * composition hash differs from the set's baseline has regenerated the product
 * — new facts, new routes, new claims — and is refused, because the whole point
 * of comparing candidates is that they say the same thing.
 */
export function attachRevisedCandidate(set, { plan, candidate } = {}) {
  if (!plan?.planId) throw new Error('Attaching a revision needs the plan that asked for it.');
  const parent = list(set.candidates).find((entry) => entry.candidateId === plan.parentCandidateId);
  if (!parent) throw new Error(`No visual candidate ${plan.parentCandidateId} in set ${set.setId}.`);
  if (list(set.candidates).some((entry) => entry.candidateId === candidate.candidateId)) {
    throw new Error(`Candidate ${candidate.candidateId} is already in this set.`);
  }
  assertFrozenTruthUnchanged(set, candidate, plan);

  const revised = {
    ...candidate,
    iteration: plan.iteration,
    referenceAnalysisIds: [...list(parent.referenceAnalysisIds)],
    lineage: {
      parentCandidateId: plan.parentCandidateId,
      planId: plan.planId,
      reviewVerdictId: plan.reviewVerdictId ?? null,
      iteration: plan.iteration,
      frozenTruthHash: plan.frozenTruthHash,
      failingCriteria: [...plan.failingCriteria],
      preservedCriteria: [...list(plan.preservedCriteria)],
      requestedChanges: list(plan.targets).map((target) => ({ axis: target.axis, from: target.from, to: target.to, because: target.because })),
    },
  };

  return {
    ...set,
    // The set stays open. A revision is another candidate over the same truth,
    // and it has to be reviewed by somebody who did not make it, like any other.
    setOutcome: 'undecided',
    decision: null,
    candidates: [...set.candidates, revised],
    reworkPlans: [...list(set.reworkPlans), { ...plan, revisedCandidateId: revised.candidateId }],
  };
}

/**
 * A revision re-presents; it does not regenerate.
 *
 * Facts, services, routes, claims, capabilities and source provenance all live
 * in the composition, and the composition hash is the one value that changes if
 * any of them do. Comparing it is therefore the whole check, and it is cheap
 * enough to run every time.
 */
export function assertFrozenTruthUnchanged(set, candidate, plan = null) {
  const baseline = set?.frozenTruth?.baselineCompositionHash;
  if (plan && plan.frozenTruthHash !== baseline) {
    throw new Error(`Rework plan ${plan.planId} was made against a different product truth (${plan.frozenTruthHash}) from this set (${baseline}). Regenerate the plan rather than applying a stale one.`);
  }
  const parent = list(set.candidates).find((entry) => entry.candidateId === plan?.parentCandidateId);
  const expected = parent?.compositionHash;
  if (expected && candidate.compositionHash !== expected) {
    throw new Error(`Revised candidate ${candidate.candidateId} composes to ${candidate.compositionHash}, not the ${expected} its parent composed to. A rework changes how the product is presented; it never changes what the product says.`);
  }
  return true;
}

/** Whether any candidate in the set may still be revised. */
export function remainingReworkBudget(set, gate) {
  const budget = gate?.reworkIterationBudget ?? 2;
  const spent = Math.max(0, ...list(set?.candidates).map((candidate) => candidate.iteration ?? 0), 0);
  return { budget, spent, remaining: Math.max(0, budget - spent), exhausted: spent >= budget };
}
