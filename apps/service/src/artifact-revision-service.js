/**
 * The artifact revision a governed build is producing, kept in the ledger.
 *
 * A revision exists only where there is an approved contract, and that is the
 * honest boundary rather than a limitation. `contract-approved` asserts that an
 * owner approved exact facts, constraints, journeys and criteria; a workspace
 * build nobody approved has not earned that state, and inventing a contract
 * digest for it so the ladder had something to start from would be the exact
 * overclaim the ladder exists to prevent. So an ungoverned build generates,
 * verifies and previews as it always did, and carries no revision — which is
 * also why it cannot be released.
 *
 * Revisions are events, not rows. The read model is `reduceArtifactRevisions`
 * over the project's own stream, so there is no table that can drift from what
 * happened, and rebuilding is replaying rather than repairing.
 */

import { createEvent } from '@app-builder/control-plane';
import {
  ARTIFACT_REVISION_EVENTS,
  liveArtifactRevision,
  reduceArtifactRevisions,
} from '@app-builder/control-plane/artifact-evidence';
import {
  advanceArtifactRevision,
  createArtifactRevision,
  disposeArtifactRevision,
} from '@app-builder/control-plane/artifact-lifecycle';

export function projectArtifactRevisions(service, projectId) {
  return reduceArtifactRevisions(service.listEvents(projectId));
}

export function liveProjectArtifactRevision(service, projectId) {
  return liveArtifactRevision(projectArtifactRevisions(service, projectId));
}

/**
 * Open a revision against an approved contract.
 *
 * Minting is separate from recording on purpose: the revision is built here so
 * that anything invalid — a missing contract digest, a producer approving its
 * own work — is refused before an event describing it reaches the ledger. An
 * unreplayable event is worse than a refused operation.
 *
 * A project that already has a live revision is being reworked, and rework
 * supersedes. Approving a second build plan used to open a second revision
 * beside the first, which is the one shape `liveArtifactRevision` refuses: the
 * next read of that project threw "2 live artifact revisions ... this stream is
 * inconsistent", and it threw forever, because the ledger is append-only. An
 * ordinary rebuild — approve, build, approve again — was enough to reach it.
 *
 * The predecessor is superseded in the same operation and named as the parent,
 * so the lineage is one chain rather than a fork nobody can reconcile. It is
 * superseded rather than carried forward because the new plan froze the
 * project's inputs again: this is a different contract digest whenever anything
 * changed, and the old revision's evidence stays perfectly valid about the old
 * revision, which is nobody's release candidate.
 */
export async function openArtifactRevision(service, projectId, { contractDigest, approvedBy, producedBy = 'factory-generator', basis, parentRevisionId = null, at = new Date().toISOString() }) {
  const superseded = parentRevisionId ? null : liveProjectArtifactRevision(service, projectId);
  const revision = createArtifactRevision({
    projectId,
    parentRevisionId: parentRevisionId ?? superseded?.id ?? null,
    producedBy,
    approvedBy,
    basis,
    identity: { contractDigest },
  }, at);

  // Built before either event is recorded, so a supersession the reducer would
  // refuse never reaches the ledger ahead of the revision that replaces it.
  if (superseded) {
    const disposed = disposeArtifactRevision(superseded, 'superseded', {
      actor: approvedBy,
      basis: `Superseded by ${revision.id}: the project's inputs were approved again, freezing contract ${contractDigest.slice(0, 12)}.`,
    }, at);
    await service.store.recordEvent(createEvent({
      projectId,
      type: ARTIFACT_REVISION_EVENTS.disposed,
      actor: 'factory-service',
      payload: {
        revisionId: superseded.id,
        to: 'superseded',
        actor: approvedBy,
        basis: disposed.history[disposed.history.length - 1].basis,
        at,
      },
    }));
  }

  await service.store.recordEvent(createEvent({
    projectId,
    type: ARTIFACT_REVISION_EVENTS.created,
    actor: 'factory-service',
    payload: {
      revisionId: revision.id,
      projectId,
      parentRevisionId: revision.parentRevisionId,
      producedBy,
      actor: approvedBy,
      basis: revision.history[0].basis,
      contractDigest,
      at,
    },
  }));
  return revision;
}

/**
 * Move the project's live revision one rung, if it has one and is standing on
 * the rung below.
 *
 * Both conditions are silent no-ops rather than errors, and deliberately: an
 * ungoverned build has no revision, and a re-run of an operation that already
 * advanced the revision is an ordinary thing an operator does. What must never
 * happen is a *wrong* advance, and the reducer refuses that on its own — this
 * only decides whether to ask it.
 */
export async function advanceProjectArtifactRevision(service, projectId, to, { from, identity = {}, actor, basis, evidenceRefs = [], at = new Date().toISOString() }) {
  const revision = liveProjectArtifactRevision(service, projectId);
  if (!revision || revision.lifecycleState !== from) return null;

  // Built here first, so an advance the reducer would refuse never becomes an
  // event that a rebuild would then have to refuse forever.
  const advanced = advanceArtifactRevision(revision, to, { identity, actor, basis, evidenceRefs }, at);

  await service.store.recordEvent(createEvent({
    projectId,
    type: ARTIFACT_REVISION_EVENTS.advanced,
    actor: 'factory-service',
    payload: { revisionId: revision.id, from, to, identity, actor, basis, evidenceRefs, at },
  }));
  return advanced;
}
