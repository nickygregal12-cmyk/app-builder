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
 * from the vendor that produced the candidate — not merely from the same label,
 * which is what it used to compare and which a rename defeated.
 *
 * **Exactly one candidate is promoted.** Not zero-or-more, not the least bad
 * one. Where no candidate clears its gate and its review, the answer is rework,
 * and `promote` says so rather than picking a winner.
 */

import fs from 'node:fs';
import path from 'node:path';
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


export const VISUAL_QUALITY_GATE_ID = 'visual';
export const AGENT_PIPELINES_PATH = 'config/agent-pipelines.json';

/**
 * The professional bar, read from where the repository already keeps it.
 *
 * `config/agent-pipelines.json` has carried `gates.visual.minimumScore` since
 * the convergence contract was written, and `evaluateConvergence` already fails
 * a gate whose score falls under it. What was missing was that the visual
 * candidate review — the one place a person actually judges a rendered build —
 * never produced a score, so the bar governed a code path nothing reached.
 *
 * This reads that gate rather than declaring a second one. Hard-coding 8.5 here
 * would give the repository two numbers to disagree about, and the number is a
 * programme target rather than a fact about visual quality.
 *
 * Two fields do the work together. `minimumScore` is the overall bar. But an
 * average is exactly the wrong instrument on its own: eight competent criteria
 * and one badly failing one is a site with an obvious visible flaw, and it can
 * still average out above the bar. `minimumCriterionScore` is the floor no
 * single criterion may fall through.
 */
export function loadVisualQualityGate(factoryRoot = process.cwd()) {
  const registry = JSON.parse(fs.readFileSync(path.join(factoryRoot, AGENT_PIPELINES_PATH), 'utf8'));
  const gate = registry.gates?.[VISUAL_QUALITY_GATE_ID];
  if (!gate) throw new Error(`${AGENT_PIPELINES_PATH} declares no ${VISUAL_QUALITY_GATE_ID} gate, so there is no professional bar to hold a candidate to.`);
  return Object.freeze({
    gateId: VISUAL_QUALITY_GATE_ID,
    minimumScore: gate.minimumScore ?? null,
    minimumCriterionScore: gate.minimumCriterionScore ?? null,
    reworkIterationBudget: Number.isInteger(gate.reworkIterationBudget) ? gate.reworkIterationBudget : 2,
    reworkOwner: gate.defaultReworkRole ?? 'art-direction',
    evaluatedBy: gate.evaluatedBy ?? null,
  });
}

/**
 * Turn a set of criterion scores into the two numbers the bar reads.
 *
 * A reviewer must score every criterion it was scoped, and only those. Scoring
 * a criterion the candidate was never judged on inflates the average with an
 * opinion about something nobody looked at; skipping one hides the weakness.
 */
export function scoreVisualReview(review, criteria = null) {
  const scores = list(review?.criterionScores);
  if (!scores.length) return null;
  for (const entry of scores) {
    const value = Number(entry?.score);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      throw new Error(`Visual review scores ${String(entry?.criterion)} as ${String(entry?.score)}. A criterion score is a number from 0 to 10.`);
    }
  }
  const scored = new Set(scores.map((entry) => entry.criterion));
  if (scored.size !== scores.length) throw new Error('A visual review scores each criterion once.');
  if (criteria) {
    const expected = criteria.map((criterion) => criterion.id);
    const missing = expected.filter((id) => !scored.has(id));
    const extra = [...scored].filter((id) => !expected.includes(id));
    if (missing.length) throw new Error(`Visual review does not score every criterion it was given: ${missing.join(', ')}.`);
    if (extra.length) throw new Error(`Visual review scores criteria this candidate was not judged on: ${extra.join(', ')}.`);
  }
  const values = scores.map((entry) => Number(entry.score));
  const lowest = scores.reduce((worst, entry) => (Number(entry.score) < Number(worst.score) ? entry : worst));
  return {
    criterionScores: scores.map((entry) => ({ criterion: entry.criterion, score: Number(entry.score), note: entry.note ?? null })),
    overallScore: Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2)),
    lowestScore: Number(lowest.score),
    lowestCriterion: lowest.criterion,
  };
}

/**
 * Whether a candidate clears the professional bar.
 *
 * Returned rather than thrown, because "this is competent and not good enough"
 * is a legitimate, recordable state that the whole rework loop exists to
 * handle. Only *promoting* something that does not clear it is refused.
 */
export function assessProfessionalThreshold(score, gate) {
  if (!gate || (gate.minimumScore === null && gate.minimumCriterionScore === null)) {
    return { met: null, detail: 'No professional bar is declared for this programme, so nothing is measured against one.' };
  }
  if (!score) {
    return { met: false, detail: `This review carries no criterion scores, so it cannot be held to the ${gate.minimumScore} bar. A verdict without a score is an opinion the gate cannot read.` };
  }
  const failures = [];
  if (gate.minimumScore !== null && score.overallScore < gate.minimumScore) {
    failures.push(`overall ${score.overallScore} is below the ${gate.minimumScore} professional bar`);
  }
  if (gate.minimumCriterionScore !== null && score.lowestScore < gate.minimumCriterionScore) {
    failures.push(`${score.lowestCriterion} scores ${score.lowestScore}, below the ${gate.minimumCriterionScore} floor no single criterion may fall through`);
  }
  return failures.length
    ? { met: false, detail: `${failures.join('; ')}.` }
    : { met: true, detail: `Overall ${score.overallScore} against a ${gate.minimumScore} bar, lowest criterion ${score.lowestScore}.` };
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
 * A runtime identity: the role a caller played, and the model that played it.
 *
 * `vendor` is the load-bearing field. The rest is for the audit trail.
 */
export function runtimeIdentity({ role, vendor, model } = {}) {
  if (!role) throw new Error('A runtime identity records the role it played.');
  if (!vendor) throw new Error(`The ${role} identity records no vendor. Independence is decided on vendor, so an identity without one cannot be checked.`);
  if (!model) throw new Error(`The ${role} identity records no model.`);
  return Object.freeze({ role: String(role), vendor: String(vendor), model: String(model) });
}

export function describeIdentity(identity) {
  if (!identity) return 'an unrecorded runtime';
  if (typeof identity === 'string') return identity;
  return `${identity.role} (${identity.vendor}/${identity.model})`;
}

/**
 * No self-approval, for pictures as much as for code.
 *
 * The comparison is on **vendor**, not on the identity as written. A role
 * string is chosen by whoever writes the call, so comparing two of them only
 * catches a caller who reused one name: the same model answering to
 * `design-critic` instead of `visual-direction` is a different string and the
 * same opinion. That is precisely the failure rule 17 exists to prevent, and
 * for most of this file's life the guard did not catch it.
 *
 * Model is deliberately not the axis either. One vendor's small model reviewing
 * its large model's work shares training data, tokeniser and blind spots; it is
 * a cheaper opinion, not a second one.
 *
 * Both sides must declare a vendor, and a candidate with no provenance at all is
 * refused too. An unprovable independence claim and a false one are worth the
 * same, so neither is waved through.
 *
 * **What this does not do.** `vendor` is a declared fact, not an attested one:
 * this function compares what two callers said about themselves. A caller that
 * lies — generating as `anthropic`, reviewing as `openai` — defeats it, and no
 * comparison performed here can detect that. The guard is therefore a defence
 * against drift, renaming and forgetfulness, which is how self-approval actually
 * happens, and not against a caller forging its own provenance.
 *
 * The defence against forgery is upstream and structural: an adapter stamps its
 * own identity from what it is rather than accepting one from its caller, so the
 * Codex reviewer records `openai` because it is the thing that called Codex. Any
 * new reviewer path must do the same. A path that takes `vendor` from request
 * input is a path where this guard means nothing.
 */
export function assertIndependentReview(candidate, review) {
  const creator = candidate?.provenance?.createdBy;
  const reviewer = review?.reviewedBy;
  if (!reviewer) throw new Error('A visual review must record who issued it.');
  if (typeof reviewer === 'string' || !reviewer.vendor) {
    throw new Error(`This review is issued by ${describeIdentity(reviewer)}, which declares no vendor. Independence is decided on vendor, so a review without one cannot be believed.`);
  }
  if (!creator) {
    throw new Error(`Candidate ${candidate?.candidateId} records no creator, so nothing can be shown to be independent of it. A candidate without provenance cannot be reviewed.`);
  }
  if (typeof creator === 'string' || !creator.vendor) {
    throw new Error(`Candidate ${candidate?.candidateId} records its creator as ${describeIdentity(creator)}, which declares no vendor. Its independence cannot be established, so it cannot be reviewed.`);
  }
  // Compared as the same vendor would be written by two different callers.
  // `Anthropic`, `anthropic ` and `anthropic` are one vendor, and letting
  // whitespace or a capital letter buy independence would make the guard a
  // formatting check.
  if (sameVendor(creator.vendor, reviewer.vendor)) {
    throw new Error(`${describeIdentity(reviewer)} and ${describeIdentity(creator)} are the same vendor (${creator.vendor}). A relabelled runtime from the vendor that created this candidate cannot also promote it; stage promotion is always independent.`);
  }
  return true;
}

const normaliseVendor = (value) => String(value ?? '').trim().toLowerCase();
export const sameVendor = (left, right) => normaliseVendor(left) === normaliseVendor(right);

/**
 * Record a visual verdict against a candidate.
 *
 * Independence and gate coverage are checked before the verdict is believed,
 * and a verdict is refused outright for a candidate a rule already blocked:
 * there is nothing for judgement to add to "the accent is unreadable".
 */
export function recordReview(candidate, review, { qualityGate = null, criteria = null } = {}) {
  if (!VISUAL_REVIEW_VERDICTS.includes(review?.verdict)) {
    throw new Error(`Unknown visual review verdict: ${String(review?.verdict)}. It offers: ${VISUAL_REVIEW_VERDICTS.join(', ')}.`);
  }
  if (candidate.gate?.status === 'blocked') {
    throw new Error(`Candidate ${candidate.candidateId} is blocked by ${candidate.gate.blocking.map((entry) => entry.rule).join(', ')}. A deterministic violation is not a matter for review.`);
  }
  assertIndependentReview(candidate, review);
  assertReviewAddressesGate(candidate.gate, review);

  const score = scoreVisualReview(review, criteria);
  const threshold = assessProfessionalThreshold(score, qualityGate);
  // The one thing the bar forbids. A reviewer may score a candidate 6.2 and say
  // so; what it may not do is call 6.2 a pass, because a pass is what promotion
  // reads. "Competent and not good enough" has to stay expressible, and it is:
  // it is a rework verdict with the scores attached.
  if (review.verdict === 'pass' && threshold.met === false) {
    throw new Error(`Candidate ${candidate.candidateId} cannot be passed: ${threshold.detail} Where nothing clears the bar the answer is rework or reject, never the least bad one.`);
  }

  const state = review.verdict === 'reject' ? 'rejected' : 'reviewed';
  assertCandidateTransition(candidate.state, state);
  return {
    ...candidate,
    state,
    review: {
      ...review,
      criterionScores: score?.criterionScores ?? [],
      overallScore: score?.overallScore ?? null,
      lowestScore: score?.lowestScore ?? null,
      lowestCriterion: score?.lowestCriterion ?? null,
      blockingConcerns: list(review.blockingConcerns),
      failingCriteria: list(review.failingCriteria),
      thresholdMet: threshold.met,
      thresholdDetail: threshold.detail,
      qualityGateId: qualityGate?.gateId ?? null,
      minimumScore: qualityGate?.minimumScore ?? null,
    },
    outcome: review.verdict === 'reject' ? 'rejected' : candidate.outcome,
    rationale: review.rationale ?? candidate.rationale ?? null,
    reworkOwner: review.verdict === 'rework' ? (review.reworkOwner ?? qualityGate?.reworkOwner ?? 'art-direction') : null,
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
  if (target.review?.thresholdMet === false) throw new Error(`Candidate ${candidateId} did not clear the professional bar: ${target.review.thresholdDetail}`);
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
  return { ...set, candidates, promotedCandidateId: candidateId, setOutcome: 'promoted', decision: { outcome: 'promoted', decidedBy: promotedBy, rationale, decidedAt } };
}


export const SET_OUTCOMES = Object.freeze(['undecided', 'promoted', 'rework-required', 'rejected']);

/**
 * The set-level decision, and the reason this file needed one.
 *
 * Promotion answered "which of these?". It could not answer "none of these",
 * because the only outcome it could record was a winner. That is the shape of
 * system that ends up shipping the least bad candidate: not because anybody
 * decided to, but because no other button existed.
 *
 * Three outcomes, and the two new ones are the point:
 *
 *   promoted        — one candidate cleared the gate, the bar and an
 *                     independent review. `promoteCandidate` still does it.
 *   rework-required — every candidate was judged and none passed, and at least
 *                     one is worth another bounded pass. The set stays open and
 *                     `planVisualRework` says exactly what to change.
 *   rejected        — every candidate was judged and none passed, and none is
 *                     worth reworking. The set closes with no product change.
 *                     This is a legitimate professional conclusion and the
 *                     system has to be able to reach it.
 *
 * A set cannot be decided before every candidate has been judged or blocked.
 * "None of these is good enough" is only true if somebody looked at all of them.
 */
export function decideCandidateSet(set, { outcome, decidedBy, rationale = null, decidedAt = null } = {}) {
  if (!SET_OUTCOMES.includes(outcome) || outcome === 'undecided') {
    throw new Error(`Unknown visual candidate set outcome: ${String(outcome)}. It offers: ${SET_OUTCOMES.filter((entry) => entry !== 'undecided').join(', ')}.`);
  }
  if (!decidedBy) throw new Error('Deciding a visual candidate set must record who decided it.');
  if (set.promotedCandidateId) throw new Error(`This set already promoted ${set.promotedCandidateId}.`);
  if (set.setOutcome && set.setOutcome !== 'undecided') throw new Error(`This set is already ${set.setOutcome}.`);

  const candidates = list(set.candidates);
  for (const candidate of candidates) {
    const judged = candidate.review || candidate.gate?.status === 'blocked' || candidate.outcome === 'rejected';
    if (!judged) {
      throw new Error(`Candidate ${candidate.candidateId} has not been judged. A set cannot be rejected or sent back for rework until somebody has looked at every candidate in it.`);
    }
    // Rule 17 applies to the set-level decision too: whoever created these
    // candidates does not get to close the book on them either.
    assertIndependentReview(candidate, { reviewedBy: decidedBy });
  }
  if (candidates.some((candidate) => candidate.review?.verdict === 'pass')) {
    const passing = candidates.filter((candidate) => candidate.review?.verdict === 'pass').map((candidate) => candidate.candidateId);
    throw new Error(`${passing.join(', ')} passed review, so this set has a winner to promote rather than a set-level ${outcome}.`);
  }
  if (outcome === 'rework-required' && !candidates.some((candidate) => candidate.review?.verdict === 'rework')) {
    throw new Error('No candidate was returned for rework, so there is nothing to rework. Reject the set instead.');
  }

  const closed = outcome === 'rejected'
    ? candidates.map((candidate) => (candidate.outcome === 'rejected'
      ? candidate
      : {
        ...candidate,
        state: assertCandidateTransition(candidate.state, 'rejected'),
        outcome: 'rejected',
        rationale: candidate.rationale ?? 'The set was rejected: no candidate cleared the professional bar and none was worth reworking.',
        provenance: { ...candidate.provenance, decidedAt },
      }))
    : candidates;

  return {
    ...set,
    candidates: closed,
    setOutcome: outcome,
    decision: { outcome, decidedBy, rationale, decidedAt },
  };
}

/**
 * What the set currently says about itself, without deciding anything.
 *
 * The Console needs this to offer the right buttons, and a reviewer needs it to
 * see whether "reject them all" is even available yet.
 */
export function summariseCandidateSet(set, gate = null) {
  const candidates = list(set?.candidates);
  const judged = candidates.filter((candidate) => candidate.review || candidate.gate?.status === 'blocked' || candidate.outcome === 'rejected');
  const passing = candidates.filter((candidate) => candidate.review?.verdict === 'pass');
  const reworkable = candidates.filter((candidate) => candidate.review?.verdict === 'rework');
  const scores = candidates
    .filter((candidate) => typeof candidate.review?.overallScore === 'number')
    .map((candidate) => ({ candidateId: candidate.candidateId, overallScore: candidate.review.overallScore, thresholdMet: candidate.review.thresholdMet }));
  return {
    setOutcome: set?.setOutcome ?? 'undecided',
    promotedCandidateId: set?.promotedCandidateId ?? null,
    total: candidates.length,
    judged: judged.length,
    fullyJudged: judged.length === candidates.length && candidates.length > 0,
    passing: passing.map((candidate) => candidate.candidateId),
    reworkable: reworkable.map((candidate) => candidate.candidateId),
    scores,
    minimumScore: gate?.minimumScore ?? null,
    minimumCriterionScore: gate?.minimumCriterionScore ?? null,
    reworkIterationBudget: gate?.reworkIterationBudget ?? null,
    // The two outcomes that were previously unreachable, stated as availability
    // rather than left for a caller to infer.
    canPromote: passing.length === 1,
    canRework: judged.length === candidates.length && candidates.length > 0 && passing.length === 0 && reworkable.length > 0,
    canReject: judged.length === candidates.length && candidates.length > 0 && passing.length === 0,
  };
}

/**
 * Assemble the set.
 *
 * The diversity check runs here, before anything expensive: a set whose
 * candidates are the same build in other colours is refused rather than
 * rendered three times and compared by a person who then says so.
 */
export function buildCandidateSet({ projectId, createdAt, frozenTruth, assetReadiness, truthReadiness = null, businessProfile = null, directionFit = null, candidates, refusedDirections = [], createdBy } = {}) {
  if (!projectId) throw new Error('A visual candidate set belongs to a project.');
  if (!createdAt) throw new Error('A visual candidate set records when it was created.');
  // No default. The runtime that drives a generation is the one that may not
  // later promote it, and a default here would invent an identity for whoever
  // forgot to declare one — which is exactly the candidate whose independence
  // most needs establishing.
  const creator = runtimeIdentity(createdBy);
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
      provenance: { createdBy: creator, reviewedBy: null, promotedBy: null, decidedAt: null },
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
    // What the candidates are composed from, in the words that are true of it.
    // A set built from owner-approved intake with three unread research
    // locations and three unsupplied assets is a legitimate prototype and an
    // illegitimate thing to call verified, and a reviewer cannot tell the
    // difference from a screenshot.
    truthReadiness: truthReadiness
      ? {
        status: truthReadiness.status,
        material: truthReadiness.material,
        referenceOnlyResearch: truthReadiness.referenceOnlyResearch,
        assetRightsWithoutBytes: truthReadiness.assetRightsWithoutBytes,
        notes: truthReadiness.truthBasis.notes,
      }
      : null,
    // Why this business got these directions and not the others.
    //
    // Two marketing sites with no photography used to be indistinguishable to
    // selection, so both received the same three. Recording the derived signals
    // beside the fit means a reviewer comparing two businesses can see whether
    // a shared direction was a considered match or the absence of a decision.
    businessProfile: businessProfile
      ? { projectType: businessProfile.projectType, signals: businessProfile.signals }
      : null,
    directionFit,
    diversity: {
      distinct: diversity.distinct,
      minimumDifferingPlanes: MINIMUM_DIFFERING_PLANES,
      duplicates: diversity.duplicates,
    },
    refusedDirections,
    candidates: prepared,
    promotedCandidateId: null,
    setOutcome: 'undecided',
    decision: null,
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
