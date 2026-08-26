/**
 * The visual promotion contract — Phase 4D.1.
 *
 * Promotion used to be the absence of a decision: whatever the factory composed
 * was what shipped. With more than one candidate it becomes a real decision,
 * and a real decision needs a record of what was compared, what the
 * deterministic checks already settled, who judged the rest, and why one
 * candidate won.
 *
 * Three rules give this file its shape.
 *
 * **DesignLint decides what a rule can decide.** A violation is not advice: a
 * candidate carrying one cannot be promoted, and no reviewer may override it.
 * A warning is different — it is probably wrong rather than certainly wrong, so
 * it lets a candidate reach review but the reviewer has to speak to it by rule
 * id. A recommendation never blocks anything, because "a dense internal tool is
 * deliberately flat" has to remain a legitimate answer.
 *
 * **A creator cannot approve its own work.** AGENTS.md rule 17 is not softened
 * because the artifact is a picture. `assertIndependentReview` refuses a verdict
 * whose reviewer is the candidate's creator.
 *
 * **Exactly one candidate is promoted.** Not zero-or-more, not the least bad
 * one. Where no candidate clears its gate and its review, the answer is rework,
 * and `promote` says so rather than picking a winner.
 */

import { createHash } from 'node:crypto';
import { assessDiversity, MINIMUM_DIFFERING_PLANES } from './visual-direction.mjs';

const list = (value) => (Array.isArray(value) ? value : []);

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export const CANDIDATE_STATES = Object.freeze(['draft', 'rendered', 'deterministic-pass', 'deterministic-blocked', 'reviewed', 'promoted', 'rejected']);

/**
 * The legal moves.
 *
 * `deterministic-blocked` has no edge to `promoted`, and that absence is the
 * point: a candidate with an unreadable accent cannot be argued into shipping.
 * Rejection is reachable from everywhere after draft, because a candidate can
 * be abandoned at any point after it exists.
 */
const TRANSITIONS = Object.freeze({
  draft: ['rendered', 'rejected'],
  rendered: ['deterministic-pass', 'deterministic-blocked', 'rejected'],
  'deterministic-pass': ['reviewed', 'rejected'],
  'deterministic-blocked': ['rejected'],
  reviewed: ['promoted', 'rejected'],
  promoted: [],
  rejected: [],
});

export function assertCandidateTransition(from, to) {
  if (!CANDIDATE_STATES.includes(from)) throw new Error(`Unknown candidate state: ${String(from)}.`);
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`A visual candidate cannot move from ${from} to ${String(to)}. It offers: ${TRANSITIONS[from].join(', ') || 'nothing — this is a terminal state'}.`);
  }
  return to;
}

export const VISUAL_REVIEW_VERDICTS = Object.freeze(['pass', 'rework', 'reject']);

/**
 * What a visual critic is asked, and what it is deliberately not asked.
 *
 * Every criterion here needs judgement. None of them can be settled by reading
 * the compiled design and the composition, which is the test a criterion has to
 * pass to be here at all: contrast, reduced motion, repetition and competing
 * actions are DesignLint's, and a critic asked about them is being paid to
 * re-derive an answer that already exists.
 *
 * `appliesTo` keeps the list from being padded. A dense internal tool is not
 * judged on conversion clarity, and a build with no photographs is not judged
 * on whether its photographs suit the business.
 */
export const VISUAL_REVIEW_CRITERIA = Object.freeze([
  Object.freeze({ id: 'brand-fit', appliesTo: 'all', question: 'Does the build read as this business, given the accent and typographic voice its own material showed?' }),
  Object.freeze({ id: 'visual-hierarchy', appliesTo: 'all', question: 'On each page, does the eye reach the most important thing first?' }),
  Object.freeze({ id: 'coherence', appliesTo: 'all', question: 'Do the opening, the grid, the rhythm and the motion read as one decision rather than several?' }),
  Object.freeze({ id: 'distinctiveness', appliesTo: 'public', question: 'Does this look like a considered site for this business, or like a template with its colours changed?' }),
  Object.freeze({ id: 'credibility', appliesTo: 'public', question: 'Would the intended customer trust this business more after seeing this than before?' }),
  Object.freeze({ id: 'conversion-clarity', appliesTo: 'public', question: 'Is the next action obvious at every point a visitor might be ready to take it?' }),
  Object.freeze({ id: 'imagery-suitability', appliesTo: 'imagery', question: 'Do the published photographs suit the business, and are they framed well at every width?' }),
  Object.freeze({ id: 'responsive-quality', appliesTo: 'all', question: 'Is the mobile rendering a designed composition, or the desktop one with fewer columns?' }),
  Object.freeze({ id: 'distinctive-moment', appliesTo: 'public', question: 'Does the declared distinctive moment actually land, and does it suit this business rather than decorate it?' }),
]);

/** The criteria a particular candidate is judged on. */
export function reviewCriteriaFor({ projectType, publishesImagery = false } = {}) {
  const isPublic = ['marketing-site', 'content-site'].includes(projectType);
  return VISUAL_REVIEW_CRITERIA.filter((criterion) => {
    if (criterion.appliesTo === 'all') return true;
    if (criterion.appliesTo === 'public') return isPublic;
    if (criterion.appliesTo === 'imagery') return publishesImagery;
    return false;
  }).map((criterion) => ({ ...criterion }));
}

/**
 * Turn a DesignLint report into a promotion gate.
 *
 * `mustAddress` is the half that makes a warning mean something. Without it a
 * warning is a line in a report that everybody scrolls past; with it, a review
 * that does not mention `repetitive-section-presentation` is refused, and the
 * rule has actually participated in the decision.
 */
export function evaluatePromotionGate(designLint) {
  if (!designLint) return { status: 'not-run', blocking: [], mustAddress: [] };
  const findings = list(designLint.findings);
  const blocking = findings
    .filter((finding) => finding.severity === 'violation')
    .map((finding) => ({ rule: finding.rule, detail: finding.detail }));
  const mustAddress = [...new Set(findings.filter((finding) => finding.severity === 'warning').map((finding) => finding.rule))].sort();
  return {
    status: blocking.length ? 'blocked' : mustAddress.length ? 'review-required' : 'clear',
    blocking,
    mustAddress,
  };
}

/**
 * Refuse a review that skipped what the rules asked it to look at.
 *
 * A reviewer is free to disagree with a warning — "three service cards in a row
 * is what a service list is" is a legitimate answer. It is not free to be
 * silent about it, because silence is indistinguishable from not having looked.
 */
export function assertReviewAddressesGate(gate, review) {
  const addressed = new Set(list(review?.addressedRules));
  const missed = list(gate?.mustAddress).filter((rule) => !addressed.has(rule));
  if (missed.length) {
    throw new Error(`Visual review does not address the DesignLint warnings it was given: ${missed.join(', ')}. A reviewer may disagree with a warning; it may not be silent about one.`);
  }
  return true;
}

/**
 * No self-approval, for pictures as much as for code.
 *
 * The creator of a candidate is recorded when the candidate is created rather
 * than asserted at review time, so this compares two durable facts instead of
 * trusting the reviewer's own account of who it is.
 */
export function assertIndependentReview(candidate, review) {
  const creator = candidate?.provenance?.createdBy;
  const reviewer = review?.reviewedBy;
  if (!reviewer) throw new Error('A visual review must record who issued it.');
  if (creator && reviewer === creator) {
    throw new Error(`${reviewer} created this candidate and cannot also promote it. Stage promotion is always independent.`);
  }
  return true;
}

/**
 * Record a visual verdict against a candidate.
 *
 * Independence and gate coverage are checked before the verdict is believed,
 * and a verdict is refused outright for a candidate a rule already blocked:
 * there is nothing for judgement to add to "the accent is unreadable".
 */
export function recordReview(candidate, review) {
  if (!VISUAL_REVIEW_VERDICTS.includes(review?.verdict)) {
    throw new Error(`Unknown visual review verdict: ${String(review?.verdict)}. It offers: ${VISUAL_REVIEW_VERDICTS.join(', ')}.`);
  }
  if (candidate.gate?.status === 'blocked') {
    throw new Error(`Candidate ${candidate.candidateId} is blocked by ${candidate.gate.blocking.map((entry) => entry.rule).join(', ')}. A deterministic violation is not a matter for review.`);
  }
  assertIndependentReview(candidate, review);
  assertReviewAddressesGate(candidate.gate, review);
  const state = review.verdict === 'reject' ? 'rejected' : 'reviewed';
  assertCandidateTransition(candidate.state, state);
  return {
    ...candidate,
    state,
    review: { ...review },
    outcome: review.verdict === 'reject' ? 'rejected' : candidate.outcome,
    rationale: review.rationale ?? candidate.rationale ?? null,
    reworkOwner: review.verdict === 'rework' ? (review.reworkOwner ?? 'visual-direction') : null,
    provenance: { ...candidate.provenance, reviewedBy: review.reviewedBy, decidedAt: review.decidedAt ?? null },
  };
}

/**
 * Promote exactly one candidate.
 *
 * The set is rewritten rather than mutated in place, and every other candidate
 * is closed as rejected in the same operation. Leaving a sibling `pending`
 * would be how a set quietly acquires two winners.
 */
export function promoteCandidate(set, candidateId, { promotedBy, rationale = null, decidedAt = null } = {}) {
  if (!promotedBy) throw new Error('Promoting a visual candidate must record who promoted it.');
  const target = list(set.candidates).find((candidate) => candidate.candidateId === candidateId);
  if (!target) throw new Error(`No visual candidate ${String(candidateId)} in this set.`);
  if (set.promotedCandidateId) throw new Error(`This set already promoted ${set.promotedCandidateId}. Exactly one candidate is promoted; a second decision is a new set.`);
  if (target.gate?.status === 'blocked') throw new Error(`Candidate ${candidateId} carries a deterministic violation and cannot be promoted.`);
  if (target.review?.verdict !== 'pass') throw new Error(`Candidate ${candidateId} has no passing visual review. Where no candidate is good enough the answer is rework, not the least bad one.`);
  assertIndependentReview(target, { reviewedBy: promotedBy });
  assertCandidateTransition(target.state, 'promoted');

  const candidates = list(set.candidates).map((candidate) => {
    if (candidate.candidateId === candidateId) {
      return { ...candidate, state: 'promoted', outcome: 'promoted', rationale: rationale ?? candidate.rationale ?? null, provenance: { ...candidate.provenance, promotedBy, decidedAt } };
    }
    if (candidate.outcome === 'rejected') return candidate;
    return {
      ...candidate,
      state: 'rejected',
      outcome: 'rejected',
      rationale: candidate.rationale ?? `Not promoted: ${candidateId} was.`,
      provenance: { ...candidate.provenance, decidedAt },
    };
  });
  return { ...set, candidates, promotedCandidateId: candidateId };
}

/**
 * Assemble the set.
 *
 * The diversity check runs here, before anything expensive: a set whose
 * candidates are the same build in other colours is refused rather than
 * rendered three times and compared by a person who then says so.
 */
export function buildCandidateSet({ projectId, createdAt, frozenTruth, assetReadiness, candidates, refusedDirections = [], createdBy = 'visual-direction' } = {}) {
  if (!projectId) throw new Error('A visual candidate set belongs to a project.');
  if (!createdAt) throw new Error('A visual candidate set records when it was created.');
  const entries = list(candidates);
  if (entries.length < 2) throw new Error(`A visual candidate set needs at least two candidates to be a choice; this one has ${entries.length}.`);

  const diversity = assessDiversity(entries.map((entry) => entry.signature));
  if (!diversity.distinct) {
    throw new Error(`These candidates are not genuinely different: ${diversity.duplicates.map((entry) => entry.detail).join(' ')}`);
  }

  const prepared = entries.map((entry) => {
    const gate = evaluatePromotionGate(entry.designLint ?? null);
    return {
      candidateId: entry.candidateId,
      directionId: entry.directionId,
      directionLabel: entry.directionLabel,
      state: entry.state ?? 'draft',
      artDirection: entry.artDirection,
      signature: entry.signature,
      compositionHash: entry.compositionHash,
      designSystemSpecHash: entry.designSystemSpecHash ?? null,
      workspace: entry.workspace ?? null,
      assetStrategy: assetReadiness.strategy,
      referenceAnalysisIds: list(entry.referenceAnalysisIds),
      evidenceId: entry.evidenceId ?? null,
      designLint: entry.designLint ?? null,
      gate,
      review: null,
      outcome: 'pending',
      rationale: null,
      reworkOwner: null,
      provenance: { createdBy, reviewedBy: null, promotedBy: null, decidedAt: null },
    };
  });

  return {
    schemaVersion: 1,
    setId: `candidates-${hash({ projectId, createdAt, directions: prepared.map((entry) => entry.directionId) }).slice(0, 16)}`,
    projectId,
    createdAt,
    frozenTruth,
    assetReadiness: {
      strategy: assetReadiness.strategy,
      supportsImageryLed: assetReadiness.supportsImageryLed,
      strategyReason: assetReadiness.strategyReason,
    },
    diversity: {
      distinct: diversity.distinct,
      minimumDifferingPlanes: MINIMUM_DIFFERING_PLANES,
      duplicates: diversity.duplicates,
    },
    refusedDirections,
    candidates: prepared,
    promotedCandidateId: null,
  };
}

/**
 * Move a candidate on once its evidence and lint exist.
 *
 * Rendering and linting are two different facts and are recorded as two moves,
 * because a candidate that rendered and then failed a rule is a different
 * situation from one that never rendered at all.
 */
export function recordCandidateEvidence(candidate, { evidenceId, designLint }) {
  const rendered = { ...candidate, state: assertCandidateTransition(candidate.state, 'rendered'), evidenceId, designLint };
  const gate = evaluatePromotionGate(designLint);
  const next = gate.status === 'blocked' ? 'deterministic-blocked' : 'deterministic-pass';
  return {
    ...rendered,
    gate,
    state: assertCandidateTransition(rendered.state, next),
    rationale: gate.status === 'blocked' ? `Blocked by ${gate.blocking.map((entry) => entry.rule).join(', ')}.` : rendered.rationale ?? null,
    outcome: rendered.outcome ?? 'pending',
  };
}
