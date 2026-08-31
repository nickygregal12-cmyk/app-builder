/**
 * Independence that means something more than a different job title.
 *
 * `assertReviewIndependence` in `packages/control-plane/src/roles.js` enforces
 * principle 17 the way it is written: the role issuing a verdict must not be one
 * of the roles that created the artifact. That is the right rule and it is not
 * the whole rule, because the same model can hold both roles. One model, asked
 * to build and then asked to judge, agrees with itself — and every part of the
 * check passes.
 *
 * `config/factory-status.json` already reasons at the level this module works
 * at. It records that the outstanding independent verdict cannot be issued by
 * Anthropic "because the producer of this evidence is Claude", and
 * `tooling/lib/codex-visual-reviewer.mjs` says the same thing in its own words:
 * restarting the same model is not independence. Both are correct and neither
 * is a contract anything checks.
 *
 * ## What this can and cannot do today
 *
 * Every visual review verdict in this repository records who reviewed —
 * `reviewedBy: { role, vendor, model }` — and none records who authored. So the
 * relation between them cannot be computed from a stored verdict at all. The
 * fact that an OpenAI critic reviewed Anthropic-created candidates is true, and
 * it lives in prose in a status file rather than in the evidence.
 *
 * That is the finding, and this module is written to state it rather than work
 * around it. An assessment with no author identity returns `unknown` and
 * refuses; it does not assume independence because the vendors it can see
 * happen to differ from something it cannot.
 *
 * ## Identity has to be stamped, not supplied
 *
 * A reviewer that accepts its own identity from the thing it is reviewing is
 * reporting rather than being observed. `codex-visual-reviewer.mjs` already
 * refuses a caller-supplied identity for exactly this reason, and the rule is
 * generalised here: an executor identity carries how it was attested, and a
 * caller-attested reviewer is not evidence of anything.
 */

/** How much distance the reviewer must have from the author. */
export const INDEPENDENCE_REQUIREMENTS = Object.freeze(['different-vendor', 'different-model', 'different-role']);

/** What the assessment found. Ordered strongest first. */
export const INDEPENDENCE_RELATIONS = Object.freeze([
  'different-vendor',
  'same-vendor-different-model',
  'same-model-different-role',
  'same-model-same-role',
  'unknown',
]);

/** Where an identity came from. Only a runtime may attest its own executor. */
export const ATTESTATIONS = Object.freeze(['runtime', 'caller']);

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The identity a verdict or an artifact should carry about what produced it.
 *
 * Deliberately more than vendor and model. A cost with no attempt to attach it
 * to, or an artifact identity with no data class, are each half a record — and
 * the half that is missing is always the one somebody needs later.
 */
export function describeExecutor(input = {}) {
  return {
    vendor: text(input.vendor),
    model: text(input.model),
    adapterId: text(input.adapterId),
    runtime: text(input.runtime),
    role: text(input.role),
    dataClass: text(input.dataClass),
    attemptId: text(input.attemptId),
    artifact: input.artifact ? { kind: text(input.artifact.kind), ref: text(input.artifact.ref), hash: text(input.artifact.hash) } : null,
    costGbp: typeof input.costGbp === 'number' ? input.costGbp : null,
    attestedBy: ATTESTATIONS.includes(input.attestedBy) ? input.attestedBy : null,
  };
}

/** Is this identity complete enough to reason about at all? */
function identifiable(executor) {
  return Boolean(executor?.vendor && executor?.model);
}

/**
 * How far apart are the thing that made the artifact and the thing judging it?
 *
 * @param {object} input
 * @param {object} input.author    executor that created or materially changed the artifact
 * @param {object} input.reviewer  executor issuing the verdict
 * @param {string} [input.requires] the distance this gate demands; default different-vendor
 */
export function assessIndependence({ author, reviewer, requires = 'different-vendor' }) {
  if (!INDEPENDENCE_REQUIREMENTS.includes(requires)) {
    throw new Error(`Unknown independence requirement: ${requires}. One of ${INDEPENDENCE_REQUIREMENTS.join(', ')}.`);
  }
  const refusals = [];

  // A reviewer that took its identity from the thing it reviewed is a
  // self-report. Checked before the comparison, because comparing two numbers
  // one side chose is not a comparison.
  if (reviewer?.attestedBy === 'caller') {
    refusals.push('The reviewer identity was supplied by its caller rather than stamped by the runtime that ran it. An identity the reviewed side can choose is a self-report, and independence built on one is worth nothing.');
  }

  let relation = 'unknown';
  if (!identifiable(author) || !identifiable(reviewer)) {
    // The state every committed verdict in this repository is in.
    refusals.push(
      !identifiable(author)
        ? 'No author executor is recorded, so there is nothing for the reviewer to be independent of. A verdict that names only its reviewer cannot demonstrate independence, however different that reviewer looks.'
        : 'No reviewer executor is recorded, so nothing is known about what issued this verdict.',
    );
  } else if (author.vendor !== reviewer.vendor) {
    relation = 'different-vendor';
  } else if (author.model !== reviewer.model) {
    relation = 'same-vendor-different-model';
  } else if (author.role !== reviewer.role) {
    relation = 'same-model-different-role';
  } else {
    relation = 'same-model-same-role';
  }

  // Whether the relation clears the bar this gate asked for.
  const rank = {
    'different-vendor': 3,
    'same-vendor-different-model': 2,
    'same-model-different-role': 1,
    'same-model-same-role': 0,
    unknown: -1,
  };
  const needed = { 'different-vendor': 3, 'different-model': 2, 'different-role': 1 }[requires];
  if (relation !== 'unknown' && rank[relation] < needed) {
    refusals.push(`This gate requires ${requires} and the reviewer is ${relation}. The same model asked to build and then to judge agrees with itself, and every role check still passes.`);
  }

  return {
    schemaVersion: 1,
    authority: 'reviewer-independence',
    requires,
    relation,
    independent: refusals.length === 0 && relation !== 'unknown',
    refusals,
    /**
     * How each side's identity was established.
     *
     * A caller-attested *reviewer* is refused above, because the side being
     * reviewed chose what its judge says it is. A caller-declared *author* is
     * weaker evidence rather than a refusal — somebody naming what produced an
     * artifact is ordinary bookkeeping, and refusing it would leave nothing
     * recordable at all for artifacts no provider call produced. It is reported
     * so a reader can weigh the claim rather than take it.
     */
    attestation: { author: author?.attestedBy ?? null, reviewer: reviewer?.attestedBy ?? null },
    author: author ?? null,
    reviewer: reviewer ?? null,
  };
}

/**
 * Attach executor identities to a verdict, refusing to mint one that claims an
 * independence it does not have.
 *
 * Both sides present and too close together throws: a verdict is a record, and
 * a record that says a model judged its own work is worse than no record,
 * because it will be counted later as an independent review.
 *
 * Either side absent attaches what there is and claims nothing. That is the
 * honest state for every verdict this repository already holds, and it is why
 * `schemas/review-verdict.schema.json` makes both fields optional: a required
 * field would have invalidated ten committed verdicts to record something
 * nobody captured at the time.
 */
/**
 * The executor as the verdict contract carries it.
 *
 * `describeExecutor` keeps an `artifact` alongside the identity, which is
 * useful when reasoning about a single attempt in isolation. On a verdict it
 * would be a second place to record something `artifactId` and `artifactKind`
 * already say, and two fields that can disagree about the same fact are worse
 * than one. So it is projected out here rather than widening the contract.
 */
function contractExecutor(executor) {
  if (!executor) return null;
  const { artifact: _artifact, ...identity } = executor;
  return identity;
}

export function attestVerdict({ verdict, author = null, reviewer = null, requires = 'different-vendor' }) {
  const assessment = assessIndependence({ author, reviewer, requires });
  const established = Boolean(author && reviewer);

  if (established && !assessment.independent) {
    throw new Error(`Refusing to record this verdict as independent: ${assessment.refusals.join(' ')}`);
  }

  return {
    ...verdict,
    authorExecutor: contractExecutor(author),
    reviewerExecutor: contractExecutor(reviewer),
  };
}

/**
 * Read the executors out of a verdict that carries them.
 *
 * Separate from `executorsFromVerdictSet`, which reads the older visual-review
 * shape. Two readers rather than one that guesses, because a reader that fell
 * back between shapes would silently return nothing on a verdict whose fields
 * had been renamed, and report it as "no author recorded" — the same answer it
 * gives for the honest case.
 */
export function executorsFromVerdict(verdict) {
  return {
    author: verdict?.authorExecutor ? describeExecutor(verdict.authorExecutor) : null,
    reviewer: verdict?.reviewerExecutor ? describeExecutor(verdict.reviewerExecutor) : null,
  };
}

/**
 * Read the executor identities out of a stored visual-review verdict set.
 *
 * The reviewer is recorded and the author is not, so this returns a null author
 * for every verdict this repository currently holds. That is not a parsing
 * failure and is not smoothed over: `assessIndependence` refuses on it, which is
 * the correct answer for evidence that cannot show what it is being compared
 * against.
 */
export function executorsFromVerdictSet(verdictSet, review) {
  const reviewedBy = review?.reviewedBy ?? {};
  return {
    author: null,
    reviewer: describeExecutor({
      vendor: reviewedBy.vendor,
      model: reviewedBy.model,
      role: reviewedBy.role,
      artifact: { kind: 'visual-candidate', ref: review?.candidateId, hash: null },
      // Stored verdicts record no attestation. Absent is left absent rather
      // than assumed to be a runtime stamp.
      attestedBy: reviewedBy.attestedBy,
    }),
    setId: verdictSet?.setId ?? null,
  };
}
