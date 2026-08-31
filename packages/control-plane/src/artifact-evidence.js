/**
 * Evidence about one exact artifact, and the projection that rebuilds it.
 *
 * The factory already refused another build's evidence, and the refusal was
 * real: `gate-evidence.js` reads a `compositionHash` out of each producer's
 * artifact and will not grade this build against a report carrying a different
 * one. What it could not refuse is subtler, and worse.
 *
 * A composition hash is not an artifact. Two builds of one composition can
 * install different dependency graphs, run under different toolchains and
 * produce different bytes — that is exactly what the reproducibility work was
 * about — and every one of them carries the same `compositionHash`. So a
 * behaviour report measured against yesterday's output satisfies the freshness
 * check for today's, and the only thing standing between that and a release is
 * that nobody has tried.
 *
 * Binding evidence to an ArtifactRevision closes it, and mostly by arithmetic
 * rather than by a new rule. Identity is append-only: a revision's source, lock
 * and output can each be written once, so changing any of them is not an edit
 * but a *different revision*, with a different id and no evidence of its own.
 * "A source change invalidates downstream evidence" therefore needs no
 * invalidation step — the evidence is still perfectly valid, about a revision
 * that is no longer the one being released.
 *
 * What still needs checking is the small set of ways evidence and artifact can
 * be brought together dishonestly: evidence from another revision, evidence
 * naming digests the revision does not have, evidence measured against a
 * component that did not exist yet, and evidence with no binding at all. Those
 * are the four refusals below.
 *
 * The revisions themselves are a projection of the ledger rather than a second
 * store. A conversation is not the source of truth for a build, and neither is
 * a table that could drift from the events that produced it: `reduceArtifactRevisions`
 * takes the event stream and returns the revisions, so rebuilding is replaying.
 */

import { createHash } from 'node:crypto';

import {
  ARTIFACT_IDENTITY_COMPONENTS,
  advanceArtifactRevision,
  createArtifactRevision,
  disposeArtifactRevision,
} from './artifact-lifecycle.js';

/** The identity components a piece of evidence can be measured against. */
export const EVIDENCE_BOUND_COMPONENTS = Object.freeze(['sourceDigest', 'lockDigest', 'outputDigest']);

/** Every way evidence can fail to be about the artifact it is offered for. */
export const EVIDENCE_BINDING_REFUSALS = Object.freeze([
  'evidence-unbound',
  'evidence-for-another-revision',
  'evidence-identity-mismatch',
  'evidence-ahead-of-artifact',
  'evidence-names-nothing',
]);

export class EvidenceBindingError extends Error {
  constructor(refusal, message) {
    super(message);
    this.name = 'EvidenceBindingError';
    this.refusal = refusal;
  }
}

function refuse(refusal, message) {
  throw new EvidenceBindingError(refusal, message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/**
 * A digest of everything a revision has recorded about itself.
 *
 * It deliberately moves as the revision climbs, because it answers "is this
 * artifact still exactly what it was when you looked at it" — and a revision
 * that has since recorded its built output is not what it was. Evidence
 * therefore records the digest it saw *and* the components it was measured
 * against, and the components are what freshness is judged on.
 */
export function artifactRevisionDigest(revision) {
  return createHash('sha256').update(JSON.stringify(canonical({
    projectId: revision.projectId,
    parentRevisionId: revision.parentRevisionId ?? null,
    identity: Object.fromEntries(ARTIFACT_IDENTITY_COMPONENTS.map((component) => [component, revision.identity[component]])),
  }))).digest('hex');
}

/**
 * Attach evidence to the artifact it was measured against.
 *
 * `measuredAgainst` names which identity components the evidence is about: a
 * build report is about source and lock, a behaviour report is about the built
 * output. Naming them is not bookkeeping — it is the difference between "this
 * artifact passed" and "some artifact passed", and a report that names nothing
 * is refused rather than accepted as being about everything.
 */
export function bindArtifactEvidence(revision, { id, kind, measuredAgainst, producedBy, at = new Date().toISOString() }) {
  const components = [...new Set(measuredAgainst ?? [])];
  if (components.length === 0) {
    refuse('evidence-names-nothing', `Evidence ${id ?? '(unnamed)'} does not say which part of the artifact it was measured against, so nothing can be stale.`);
  }
  const unknown = components.filter((component) => !EVIDENCE_BOUND_COMPONENTS.includes(component));
  if (unknown.length) refuse('evidence-names-nothing', `Evidence cannot be measured against ${unknown.join(', ')}.`);

  const absent = components.filter((component) => revision.identity[component] === null);
  if (absent.length) {
    refuse('evidence-ahead-of-artifact', `Evidence claims to have been measured against ${absent.join(', ')}, which ${revision.id} has not recorded. Nothing can be measured against something that does not exist yet.`);
  }

  return Object.freeze({
    schemaVersion: 1,
    id: String(id ?? '').trim() || refuse('evidence-names-nothing', 'Evidence requires an identifier.'),
    kind: String(kind ?? '').trim() || refuse('evidence-names-nothing', 'Evidence requires a kind.'),
    revisionId: revision.id,
    revisionDigest: artifactRevisionDigest(revision),
    measuredAgainst: Object.freeze(components.sort()),
    boundTo: Object.freeze(Object.fromEntries(components.map((component) => [component, revision.identity[component]]))),
    producedBy: producedBy ?? null,
    at,
  });
}

/**
 * Is this evidence about this artifact, still?
 *
 * The order is the order a reader would want to be told things in: whether it
 * is bound at all, whether it is about this revision, and only then whether the
 * bytes it names are the bytes this revision holds. Being about another
 * revision entirely is a different problem from being about this one before it
 * changed, and reporting the second when the first is true would send somebody
 * looking for a substitution that did not happen.
 */
export function assertEvidenceBinding(revision, evidence) {
  if (!evidence?.revisionId) {
    refuse('evidence-unbound', `Evidence ${evidence?.id ?? '(unnamed)'} names no artifact revision, so it is evidence about nothing in particular.`);
  }
  if (evidence.revisionId !== revision.id) {
    refuse('evidence-for-another-revision', `Evidence ${evidence.id} is about ${evidence.revisionId}, not ${revision.id}.`);
  }
  const drifted = Object.entries(evidence.boundTo ?? {})
    .filter(([component, digest]) => revision.identity[component] !== digest)
    .map(([component]) => component);
  if (drifted.length) {
    refuse('evidence-identity-mismatch', `Evidence ${evidence.id} was measured against a different ${drifted.join(', ')} than ${revision.id} holds. Either the artifact was substituted or the evidence was.`);
  }
  return evidence;
}

/**
 * Which evidence a revision can honestly claim, and which it cannot.
 *
 * Returns rather than throws, because a caller deciding whether to promote
 * wants the whole picture — one refusal is a blocker, but so is a set of them,
 * and reporting the first is how the second and third get discovered one
 * release at a time.
 */
export function reviewEvidence(revision, evidence = []) {
  const bound = [];
  const refused = [];
  for (const item of evidence) {
    try {
      bound.push(assertEvidenceBinding(revision, item));
    } catch (error) {
      if (!(error instanceof EvidenceBindingError)) throw error;
      refused.push({ id: item?.id ?? null, refusal: error.refusal, detail: error.message });
    }
  }
  return { bound, refused, usable: refused.length === 0 };
}

/** Event types the projection is built from. Nothing else moves a revision. */
export const ARTIFACT_REVISION_EVENTS = Object.freeze({
  created: 'artifact.revision.created',
  advanced: 'artifact.revision.advanced',
  disposed: 'artifact.revision.disposed',
});

/**
 * Rebuild every artifact revision from the event stream.
 *
 * This is the whole reason revisions are events rather than rows: a read model
 * that cannot be reconstructed is a second source of truth, and the one thing
 * this repository has been consistent about is that durable state outranks
 * whatever a process happened to be holding. Replaying the same events must
 * produce the same revisions, including the same digests — so the reducer uses
 * the recorded timestamps rather than the clock.
 */
export function reduceArtifactRevisions(events = []) {
  const revisions = new Map();
  for (const event of events) {
    const payload = event?.payload ?? {};
    if (event?.type === ARTIFACT_REVISION_EVENTS.created) {
      const revision = createArtifactRevision({
        id: payload.revisionId,
        projectId: payload.projectId ?? event.projectId,
        parentRevisionId: payload.parentRevisionId ?? null,
        producedBy: payload.producedBy,
        approvedBy: payload.actor,
        basis: payload.basis,
        evidenceRefs: payload.evidenceRefs ?? [],
        identity: { contractDigest: payload.contractDigest },
      }, payload.at ?? event.timestamp);
      revisions.set(revision.id, revision);
      continue;
    }
    if (event?.type === ARTIFACT_REVISION_EVENTS.advanced) {
      const current = revisions.get(payload.revisionId);
      if (!current) throw new Error(`Ledger advances unknown artifact revision ${payload.revisionId}; the stream is incomplete.`);
      revisions.set(payload.revisionId, advanceArtifactRevision(current, payload.to, {
        actor: payload.actor,
        basis: payload.basis,
        evidenceRefs: payload.evidenceRefs ?? [],
        identity: payload.identity ?? {},
      }, payload.at ?? event.timestamp));
      continue;
    }
    if (event?.type === ARTIFACT_REVISION_EVENTS.disposed) {
      const current = revisions.get(payload.revisionId);
      if (!current) throw new Error(`Ledger disposes unknown artifact revision ${payload.revisionId}; the stream is incomplete.`);
      revisions.set(payload.revisionId, disposeArtifactRevision(current, payload.to, {
        actor: payload.actor,
        basis: payload.basis,
        evidenceRefs: payload.evidenceRefs ?? [],
      }, payload.at ?? event.timestamp));
    }
  }
  return revisions;
}

/** The revision a project is currently building, if it has one. */
export function liveArtifactRevision(revisions) {
  const live = [...revisions.values()].filter((revision) => !['superseded', 'withdrawn', 'rejected'].includes(revision.lifecycleState));
  if (live.length > 1) {
    throw new Error(`A project has ${live.length} live artifact revisions (${live.map((revision) => revision.id).join(', ')}); rework supersedes, so this stream is inconsistent.`);
  }
  return live[0] ?? null;
}
