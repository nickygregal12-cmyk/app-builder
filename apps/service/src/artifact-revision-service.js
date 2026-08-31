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
 */
export async function openArtifactRevision(service, projectId, { contractDigest, approvedBy, producedBy = 'factory-generator', basis, parentRevisionId = null, at = new Date().toISOString() }) {
  const revision = createArtifactRevision({
    projectId,
    parentRevisionId,
    producedBy,
    approvedBy,
    basis,
    identity: { contractDigest },
  }, at);

  await service.store.recordEvent(createEvent({
    projectId,
    type: ARTIFACT_REVISION_EVENTS.created,
    actor: 'factory-service',
    payload: {
      revisionId: revision.id,
      projectId,
      parentRevisionId,
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
