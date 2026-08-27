/**
 * Where a project actually is in its registered pipeline.
 *
 * `nextStage` in `roles.js` answers a positional question — what comes after
 * this stage in the registry. That is not the question an orchestrator asks
 * after a restart. It asks: given the artifacts that durably exist and the
 * stages durably recorded as promoted, which stage may run now, and if none
 * may, exactly why not.
 *
 * The difference matters because the honest answer is often "none". A stage
 * whose prerequisite artifacts do not exist must not run, and the pipeline
 * must not step over it to find one that can: the ordering in
 * `config/agent-pipelines.json` is the organisation's sequencing decision, and
 * an orchestrator that reorders it to make progress has replaced that decision
 * with its own.
 *
 * Everything here is derived from two inputs a caller reconstructs from the
 * durable ledger — which artifact kinds exist, and which stages were promoted.
 * Nothing is read from a session, a transcript or ambient state, and no input
 * is inferred: a completed stage the registry does not contain is an error
 * rather than something to ignore.
 *
 * Provider-neutral and dependency-free like the rest of the package.
 */

/** Every state a stage can be in relative to the durable record. */
export const STAGE_STATUSES = Object.freeze(['complete', 'ready', 'blocked', 'pending']);

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

function kindList(value, label) {
  if (!Array.isArray(value ?? [])) throw new Error(`${label} must be an array.`);
  return [...new Set((value ?? []).map((entry) => text(entry, `${label} entry`)))];
}

/**
 * Project the pipeline against durable state.
 *
 * @param {object} input
 * @param {object} input.pipeline a registered pipeline from `config/agent-pipelines.json`
 * @param {string[]} input.availableArtifactKinds artifact kinds that durably exist for this project
 * @param {string[]} input.completedStageIds stages a promoted handoff was durably recorded for
 * @returns {object} the projection, including the one stage that may run next or the typed
 *   reasons no stage may.
 */
export function projectPipelineProgress({ pipeline, availableArtifactKinds = [], completedStageIds = [] }) {
  const pipelineId = text(pipeline?.id, 'Pipeline id');
  const stages = pipeline?.stages ?? [];
  if (!Array.isArray(stages) || stages.length === 0) throw new Error(`Pipeline ${pipelineId} declares no stages.`);

  const available = new Set(kindList(availableArtifactKinds, 'Available artifact kinds'));
  const completed = new Set(kindList(completedStageIds, 'Completed stage ids'));
  const known = new Set(stages.map((stage) => text(stage?.id, 'Pipeline stage id')));
  for (const stageId of completed) {
    if (!known.has(stageId)) {
      throw new Error(`Durable state records stage ${stageId} as complete, but pipeline ${pipelineId} has no such stage.`);
    }
  }

  const blockers = [];
  const projected = [];
  let candidateIndex = -1;

  stages.forEach((stage, index) => {
    const id = text(stage.id, 'Pipeline stage id');
    const requires = kindList(stage.requires ?? [], `Stage ${id} requires`);
    const produces = kindList(stage.produces ?? [], `Stage ${id} produces`);
    const isComplete = completed.has(id);
    if (!isComplete && candidateIndex === -1) candidateIndex = index;

    // A stage recorded as promoted whose artifacts are gone is corrupt durable
    // state, not a stage to walk past. Saying so is the difference between
    // resuming and resuming onto a hole.
    const missingEvidence = isComplete ? produces.filter((kind) => !available.has(kind)) : [];
    for (const kind of missingEvidence) blockers.push(`stage-evidence-missing:${id}:${kind}`);

    const missingPrerequisites = isComplete ? [] : requires.filter((kind) => !available.has(kind));

    projected.push({
      id,
      index,
      role: text(stage.role, `Stage ${id} role`),
      reviewer: stage.reviewer ?? null,
      requires,
      produces,
      status: isComplete ? 'complete' : 'pending',
      missingPrerequisites,
      missingEvidence,
    });
  });

  const complete = candidateIndex === -1;
  let nextStage = null;

  if (!complete) {
    const candidate = projected[candidateIndex];
    if (candidate.missingPrerequisites.length === 0) {
      candidate.status = 'ready';
      nextStage = stages[candidateIndex];
    } else {
      candidate.status = 'blocked';
      for (const kind of candidate.missingPrerequisites) blockers.push(`missing-prerequisite:${candidate.id}:${kind}`);
    }
  }

  // Corrupt evidence outranks a ready candidate: the projection is only worth
  // acting on when what it claims already happened is still true.
  const runnable = nextStage !== null && blockers.length === 0;

  return {
    schemaVersion: 1,
    pipelineId,
    totalStages: stages.length,
    completedStageIds: projected.filter((stage) => stage.status === 'complete').map((stage) => stage.id),
    availableArtifactKinds: [...available].sort(),
    stages: projected,
    nextStageId: runnable ? nextStage.id : null,
    nextStage: runnable ? nextStage : null,
    blockers: [...new Set(blockers)],
    complete,
    stopReason: complete ? 'pipeline-stages-complete' : runnable ? null : 'stage-not-runnable',
  };
}

/**
 * A specialist may only act on the stage the registry assigns to it.
 *
 * The reviewer half of this rule is enforced by `evaluateHandoff`; this is the
 * creator half, and it exists because a runtime that dispatched the wrong role
 * would otherwise produce an artifact carrying a stage's authority without the
 * stage's owner behind it.
 */
export function assertStageAssignment({ stage, roleId }) {
  const stageId = text(stage?.id, 'Stage id');
  const ownerRole = text(stage?.role, `Stage ${stageId} role`);
  const actual = text(roleId, 'Role id');
  if (actual !== ownerRole) {
    throw new Error(`Stage ${stageId} is owned by ${ownerRole}; ${actual} may not execute it.`);
  }
  return { stageId, roleId: ownerRole, reviewer: stage.reviewer ?? null };
}

/**
 * The stage a rework verdict routes back to.
 *
 * A verdict names a role, not a stage, because roles are what the organisation
 * is made of. Turning that into a stage is a registry lookup, and the honest
 * failure — a role that owns no stage in this pipeline — is reported rather
 * than approximated by the nearest earlier stage.
 */
export function reworkStageForRole({ pipeline, roleId, beforeStageId = null }) {
  const pipelineId = text(pipeline?.id, 'Pipeline id');
  const role = text(roleId, 'Rework role id');
  const stages = pipeline?.stages ?? [];
  const limit = beforeStageId === null
    ? stages.length
    : (() => {
        const index = stages.findIndex((stage) => stage.id === beforeStageId);
        if (index === -1) throw new Error(`Unknown stage ${beforeStageId} in pipeline ${pipelineId}`);
        return index + 1;
      })();
  const owned = stages.slice(0, limit).filter((stage) => stage.role === role);
  if (owned.length === 0) return { stage: null, reason: `rework-role-owns-no-stage:${role}` };
  return { stage: owned.at(-1), reason: null };
}
