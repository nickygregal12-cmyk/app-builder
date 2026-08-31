import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEvent } from '@app-builder/control-plane';
import { contractSchema } from '@app-builder/contracts';
import { approvedBuildHash, approvedBuildStateEvidence, assertApprovedBuildPlanExecutable, assertApprovedBuildPlanIdentity, mintApprovedBuildPlan } from './approved-build-plan.js';
import { claimApprovedBuildPlanExecution, getApprovedBuildPlan, getApprovedBuildPlanByApprovalId, getApprovedBuildPlanExecution, listApprovedBuildPlans, recordApprovedBuildPlan } from './approved-build-plan-store.js';

const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,120}$/;

// The shape an execution request may name is the shape the contract can mint,
// read from the contract rather than restated here. A second hand-written
// pattern is a second authority: it drifted once already, accepting ids with
// `.` and `:` and as few as one character after the prefix — shapes the schema
// refuses — so the service would look up plan ids that could never exist.
const APPROVED_PLAN_ID = new RegExp(contractSchema('approved-build-plan').properties.planId.pattern);
const SHA256 = /^[a-f0-9]{64}$/;

function alreadyClaimed(planId, prior, requestId) {
  const suffix = prior?.requestId === requestId ? ' by this request' : ' by another request';
  return new Error(`Approved build plan ${planId} has already been claimed${suffix}; mint a new approved plan before another generation attempt.`);
}

function fullProject(service, projectId) {
  const project = service?.store?.getProject(projectId) ?? null;
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return project;
}

function clone(value) {
  return structuredClone(value);
}

function assetDirectory(service, projectId) {
  return typeof service?.ingestion?.assetDirectory === 'function'
    ? service.ingestion.assetDirectory(projectId)
    : null;
}

function directoryDigest(directory) {
  if (!directory || !fs.existsSync(directory)) return approvedBuildHash([]);
  const root = path.resolve(directory);
  const entries = [];

  function walk(current) {
    const names = fs.readdirSync(current).sort();
    for (const name of names) {
      const absolute = path.join(current, name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error('Approved build asset source cannot contain symbolic links.');
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!stat.isFile()) throw new Error('Approved build asset source contains an unsupported filesystem entry.');
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const bytes = fs.readFileSync(absolute);
      entries.push({ path: relative, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }

  walk(root);
  return approvedBuildHash(entries);
}

export function currentApprovedBuildSnapshot(service, projectId) {
  const project = fullProject(service, projectId);
  const inputs = clone({
    manifest: project.manifest,
    knowledgePack: project.knowledgePack,
    intakeBundle: project.intakeBundle,
    contentOverrides: service.readOverrides(projectId).overrides,
    assetDecisions: service.readAssetDecisions(projectId).decisions,
    sectionVariants: service.readSectionVariants(projectId).choices,
    designChoices: service.readDesignChoices(projectId).choices,
    referenceInfluence: service.designReferenceInfluence(projectId),
    bespokePresentations: service.readBespokePresentations(projectId).presentations,
  });
  const assetSourceHash = directoryDigest(assetDirectory(service, projectId));
  return {
    project: clone(project),
    inputs,
    evidence: approvedBuildStateEvidence({ ...inputs, assetSourceHash }),
    assetSourceHash,
  };
}

export function currentApprovedBuildState(service, projectId) {
  return currentApprovedBuildSnapshot(service, projectId).evidence;
}

function lockProjectForApprovedGeneration(service, projectId) {
  const before = fullProject(service, projectId);
  if (before.state === 'generating') throw new Error('Approved build plan execution cannot start while project generation is running.');
  service.store.upsertProject({ ...before, state: 'generating', updatedAt: new Date().toISOString() });
  return clone(before);
}

function restoreProjectAfterRejectedExecution(service, projectId, before) {
  const current = fullProject(service, projectId);
  if (current.state !== 'generating') return;
  service.store.upsertProject({
    ...current,
    state: before.state,
    workspacePath: before.workspacePath,
    updatedAt: new Date().toISOString(),
  });
}

function copyApprovedAssetSource(service, projectId, expectedHash) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-approved-build-'));
  const target = path.join(root, 'assets');
  fs.mkdirSync(target, { recursive: true });
  const source = assetDirectory(service, projectId);
  if (source && fs.existsSync(source)) fs.cpSync(source, target, { recursive: true, force: false });
  const copiedHash = directoryDigest(target);
  if (copiedHash !== expectedHash) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error('Approved build asset source changed while the execution snapshot was being frozen.');
  }
  return { root, directory: target };
}

function frozenGenerationService(service, projectId, snapshot, assetSourceDirectory, originalState, planId) {
  const frozenProject = clone({
    ...snapshot.project,
    state: originalState.state,
    workspacePath: originalState.workspacePath,
    manifest: snapshot.inputs.manifest,
    knowledgePack: snapshot.inputs.knowledgePack,
    intakeBundle: snapshot.inputs.intakeBundle,
  });
  const frozen = clone(snapshot.inputs);
  const frozenIngestion = new Proxy(service.ingestion, {
    get(target, property, receiver) {
      if (property === 'assetDirectory') {
        return (id) => id === projectId ? assetSourceDirectory : target.assetDirectory(id);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  return new Proxy(service, {
    get(target, property, receiver) {
      if (property === 'requireProject') return (id) => id === projectId ? frozenProject : target.requireProject(id);
      if (property === 'readOverrides') return (id) => id === projectId ? { schemaVersion: 1, projectId, overrides: clone(frozen.contentOverrides) } : target.readOverrides(id);
      if (property === 'readAssetDecisions') return (id) => id === projectId ? { schemaVersion: 1, projectId, decisions: clone(frozen.assetDecisions) } : target.readAssetDecisions(id);
      if (property === 'readSectionVariants') return (id) => id === projectId ? { schemaVersion: 1, projectId, choices: clone(frozen.sectionVariants) } : target.readSectionVariants(id);
      if (property === 'readDesignChoices') return (id) => id === projectId ? { schemaVersion: 1, projectId, choices: clone(frozen.designChoices) } : target.readDesignChoices(id);
      if (property === 'designReferenceInfluence') return (id) => id === projectId ? clone(frozen.referenceInfluence) : target.designReferenceInfluence(id);
      if (property === 'readBespokePresentations') return (id) => id === projectId ? { schemaVersion: 1, projectId, presentations: clone(frozen.bespokePresentations) } : target.readBespokePresentations(id);
      // `project.generate` is refused on every route once a contract is approved.
      // This is the one path that may take it, and it says so with the plan that
      // authorised it rather than by skipping the decision.
      if (property === 'decideMutation') {
        return (operationId, id, options = {}) => target.decideMutation(
          operationId,
          id,
          operationId === 'project.generate' && id === projectId
            ? { ...options, satisfiedBy: 'approved-build-plan', authorizationId: planId }
            : options,
        );
      }
      if (property === 'ingestion') return frozenIngestion;
      return Reflect.get(target, property, receiver);
    },
  });
}

async function recordExecutionFailure(service, projectId, planId, planHash, requestId, error) {
  try {
    await service.store.recordEvent(createEvent({
      projectId,
      type: 'approved-build-plan.execution-failed',
      actor: 'factory-service',
      payload: { planId, planHash, requestId, errorClass: error?.name ?? 'Error' },
    }));
  } catch {
    // Preserve the execution failure that matters. An audit-store failure is
    // already visible at the lower store boundary and must not replace it with
    // a second exception that hides why execution stopped.
  }
}

export async function approveProjectBuildPlan(service, projectId, { approvalId, approvalMode, confirmed, approvedAt = new Date().toISOString(), planId = undefined } = {}) {
  const project = fullProject(service, projectId);
  if (project.state === 'generating') throw new Error('Cannot approve a build plan while project generation is running.');
  if (approvalMode !== 'explicit-local-operator' || confirmed !== true) throw new Error('Approved build plan requires explicit local operator confirmation.');
  if (!OPAQUE_ID.test(String(approvalId ?? ''))) throw new Error('Approved build plan requires an explicit local approval id.');

  const existing = getApprovedBuildPlanByApprovalId(service.store, projectId, approvalId);
  if (existing) return existing;

  await service.decideMutation('project.approved-build-plan.approve', projectId);
  const snapshot = currentApprovedBuildSnapshot(service, projectId);
  const plan = mintApprovedBuildPlan({ projectId, approvalId, source: snapshot.evidence, approvedAt, ...(planId ? { planId } : {}) });
  recordApprovedBuildPlan(service.store, plan);
  await service.store.recordEvent(createEvent({
    projectId,
    type: 'approved-build-plan.approved',
    actor: 'factory-service',
    payload: {
      planId: plan.planId,
      planHash: plan.planHash,
      projectStateHash: plan.source.projectStateHash,
      approvalId: plan.approval.approvalId,
    },
  }));
  return plan;
}

export function getApprovedProjectBuildPlan(service, projectId, planId) {
  fullProject(service, projectId);
  return getApprovedBuildPlan(service.store, projectId, planId);
}

export function listApprovedProjectBuildPlans(service, projectId) {
  fullProject(service, projectId);
  return listApprovedBuildPlans(service.store, projectId);
}

export async function executeApprovedProjectBuildPlan(service, projectId, { planId, expectedPlanHash, requestId, now = () => new Date() } = {}) {
  fullProject(service, projectId);
  if (!APPROVED_PLAN_ID.test(String(planId ?? ''))) throw new Error('Approved build plan execution requires an exact bounded plan id.');
  if (!SHA256.test(String(expectedPlanHash ?? ''))) throw new Error('Approved build plan execution requires an exact SHA-256 plan hash.');
  if (!OPAQUE_ID.test(String(requestId ?? ''))) throw new Error('Approved build plan execution requires a bounded request id.');

  const plan = getApprovedBuildPlan(service.store, projectId, planId);
  if (!plan) throw new Error(`No approved build plan ${planId} exists for project ${projectId}.`);
  const identified = assertApprovedBuildPlanIdentity(plan, { projectId, expectedPlanHash });

  // Being spent is terminal; drift is recoverable. Report the terminal fact
  // first, or a retry of a consumed plan whose project has since changed is
  // told its state drifted — which invites the operator to restore the state
  // and try again, and no restoration can make a spent plan executable.
  const priorClaim = getApprovedBuildPlanExecution(service.store, identified.planId);
  if (priorClaim) throw alreadyClaimed(planId, priorClaim, requestId);

  const firstSnapshot = currentApprovedBuildSnapshot(service, projectId);
  const checked = assertApprovedBuildPlanExecutable(plan, { projectId, expectedPlanHash, currentSource: firstSnapshot.evidence });

  const claimedAtDate = now();
  if (!(claimedAtDate instanceof Date) || !Number.isFinite(claimedAtDate.getTime())) throw new Error('Approved build plan execution clock is invalid.');
  const claimedAt = claimedAtDate.toISOString();
  // The read above is not the guard — this insert is. Two requests can both
  // pass the read and only one can win the unique constraint, so the loser
  // still has to be told here.
  const claimed = claimApprovedBuildPlanExecution(service.store, { planId: checked.planId, projectId, requestId, claimedAt });
  if (!claimed.claimed) throw alreadyClaimed(planId, claimed.claim, requestId);

  // Decided after the plan is verified and claimed, so the record is about a
  // plan that genuinely authorised this attempt rather than one that was merely
  // named. The plan is what satisfies the requirement; it is still a second
  // document, and migrating it onto ActionAuthorization is named work.
  await service.decideMutation('project.approved-build-plan.execute', projectId, { satisfiedBy: 'approved-build-plan', authorizationId: checked.planId });

  const originalProject = lockProjectForApprovedGeneration(service, projectId);
  let assetSnapshot = null;
  let generationStarted = false;
  try {
    await service.store.recordEvent(createEvent({
      projectId,
      type: 'approved-build-plan.execution-claimed',
      actor: 'factory-service',
      payload: { planId, planHash: checked.planHash, requestId, projectStateHash: checked.source.projectStateHash },
    }));

    // The claim event is an await boundary. Re-read every approved input after
    // it so an edit that landed while the audit write was in flight cannot be
    // smuggled into generation under an older approval.
    const executionSnapshot = currentApprovedBuildSnapshot(service, projectId);
    assertApprovedBuildPlanExecutable(checked, { projectId, expectedPlanHash, currentSource: executionSnapshot.evidence });

    // Generated repositories consume actual asset files as well as knowledge
    // metadata. Freeze those bytes, verify that the copy hashes to the approved
    // source, and point this one generation at the copy. A recrop or replacement
    // that happens later can only affect a later build.
    assetSnapshot = copyApprovedAssetSource(service, projectId, checked.source.assetSourceHash);
    const generationService = frozenGenerationService(service, projectId, executionSnapshot, assetSnapshot.directory, originalProject, checked.planId);
    generationStarted = true;
    const result = await Reflect.apply(service.generateProject, generationService, [projectId]);

    await service.store.recordEvent(createEvent({
      projectId,
      taskId: result.task?.id ?? null,
      type: 'approved-build-plan.executed',
      actor: 'factory-service',
      payload: { planId, planHash: checked.planHash, requestId },
    }));
    return { plan: checked, execution: claimed.claim, result };
  } catch (error) {
    const current = fullProject(service, projectId);
    if (!generationStarted || current.state === 'generating') restoreProjectAfterRejectedExecution(service, projectId, originalProject);
    await recordExecutionFailure(service, projectId, planId, checked.planHash, requestId, error);
    throw error;
  } finally {
    if (assetSnapshot) fs.rmSync(assetSnapshot.root, { recursive: true, force: true });
  }
}
