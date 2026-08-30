import { createEvent } from '@app-builder/control-plane';
import { approvedBuildStateEvidence, assertApprovedBuildPlanExecutable, mintApprovedBuildPlan } from './approved-build-plan.js';
import { claimApprovedBuildPlanExecution, getApprovedBuildPlan, getApprovedBuildPlanByApprovalId, listApprovedBuildPlans, recordApprovedBuildPlan } from './approved-build-plan-store.js';

const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const APPROVED_PLAN_ID = /^approved-plan-[A-Za-z0-9._:-]{1,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fullProject(service, projectId) {
  const project = service?.store?.getProject(projectId) ?? null;
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return project;
}

export function currentApprovedBuildState(service, projectId) {
  const project = fullProject(service, projectId);
  return approvedBuildStateEvidence({
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
}

export async function approveProjectBuildPlan(service, projectId, { approvalId, approvalMode, confirmed, approvedAt = new Date().toISOString(), planId = undefined } = {}) {
  const project = fullProject(service, projectId);
  if (project.state === 'generating') throw new Error('Cannot approve a build plan while project generation is running.');
  if (approvalMode !== 'explicit-local-operator' || confirmed !== true) throw new Error('Approved build plan requires explicit local operator confirmation.');
  if (!OPAQUE_ID.test(String(approvalId ?? ''))) throw new Error('Approved build plan requires an explicit local approval id.');

  const existing = getApprovedBuildPlanByApprovalId(service.store, projectId, approvalId);
  if (existing) return existing;

  const source = currentApprovedBuildState(service, projectId);
  const plan = mintApprovedBuildPlan({ projectId, approvalId, source, approvedAt, ...(planId ? { planId } : {}) });
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
  const currentSource = currentApprovedBuildState(service, projectId);
  const checked = assertApprovedBuildPlanExecutable(plan, { projectId, expectedPlanHash, currentSource });

  const claimedAtDate = now();
  if (!(claimedAtDate instanceof Date) || !Number.isFinite(claimedAtDate.getTime())) throw new Error('Approved build plan execution clock is invalid.');
  const claimedAt = claimedAtDate.toISOString();
  const claimed = claimApprovedBuildPlanExecution(service.store, { planId: checked.planId, projectId, requestId, claimedAt });
  if (!claimed.claimed) {
    const prior = claimed.claim;
    const suffix = prior?.requestId === requestId ? ' by this request' : ' by another request';
    throw new Error(`Approved build plan ${planId} has already been claimed${suffix}; mint a new approved plan before another generation attempt.`);
  }

  await service.store.recordEvent(createEvent({
    projectId,
    type: 'approved-build-plan.execution-claimed',
    actor: 'factory-service',
    payload: { planId, planHash: checked.planHash, requestId, projectStateHash: checked.source.projectStateHash },
  }));

  try {
    const result = await service.generateProject(projectId);
    await service.store.recordEvent(createEvent({
      projectId,
      taskId: result.task?.id ?? null,
      type: 'approved-build-plan.executed',
      actor: 'factory-service',
      payload: { planId, planHash: checked.planHash, requestId },
    }));
    return { plan: checked, execution: claimed.claim, result };
  } catch (error) {
    await service.store.recordEvent(createEvent({
      projectId,
      type: 'approved-build-plan.execution-failed',
      actor: 'factory-service',
      payload: { planId, planHash: checked.planHash, requestId, errorClass: error?.name ?? 'Error' },
    }));
    throw error;
  }
}
