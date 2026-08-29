import { createHash, randomUUID } from 'node:crypto';
import { assertContract } from '@app-builder/contracts';

const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FINGERPRINT_VERSION = 'approved-build-state-v1';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function approvedBuildHash(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function approvedBuildStateEvidence({
  manifest,
  knowledgePack = null,
  intakeBundle = null,
  contentOverrides = [],
  assetDecisions = [],
  sectionVariants = {},
  designChoices = {},
  referenceInfluence = null,
  bespokePresentations = [],
}) {
  const evidence = {
    approvedIntakeBundleId: intakeBundle?.bundleId ?? null,
    manifestHash: approvedBuildHash(manifest),
    knowledgePackHash: approvedBuildHash(knowledgePack),
    approvedIntakeBundleHash: approvedBuildHash(intakeBundle),
    contentOverridesHash: approvedBuildHash(contentOverrides),
    assetDecisionsHash: approvedBuildHash(assetDecisions),
    sectionVariantsHash: approvedBuildHash(sectionVariants),
    designChoicesHash: approvedBuildHash(designChoices),
    referenceInfluenceHash: approvedBuildHash(referenceInfluence),
    bespokePresentationsHash: approvedBuildHash(bespokePresentations),
  };
  return { ...evidence, projectStateHash: approvedBuildHash(evidence) };
}

function planPayload(plan) {
  const { planHash: _ignored, ...payload } = plan;
  return payload;
}

export function approvedBuildPlanHash(plan) {
  return approvedBuildHash(planPayload(plan));
}

export function mintApprovedBuildPlan({ projectId, approvalId, source, approvedAt = new Date().toISOString(), planId = `approved-plan-${randomUUID()}` }) {
  if (typeof projectId !== 'string' || !projectId || projectId.length > 160) throw new Error('Approved build plan requires a bounded project id.');
  if (!OPAQUE_ID.test(String(approvalId ?? ''))) throw new Error('Approved build plan requires an explicit bounded approval id.');
  const when = new Date(approvedAt);
  if (!Number.isFinite(when.getTime())) throw new Error('Approved build plan approval time is invalid.');
  if (!source || typeof source !== 'object' || !SHA256.test(String(source.projectStateHash ?? ''))) throw new Error('Approved build plan requires a project-state fingerprint.');
  const draft = {
    schemaVersion: 1,
    planVersion: 1,
    planId,
    projectId,
    operation: 'project.generate',
    fingerprintVersion: FINGERPRINT_VERSION,
    singleUse: true,
    approval: {
      mode: 'explicit-local-operator',
      approvalId,
      approvedAt: when.toISOString(),
    },
    source,
  };
  return assertContract('approved-build-plan', { ...draft, planHash: approvedBuildHash(draft) });
}

export function assertApprovedBuildPlanExecutable(plan, { projectId, expectedPlanHash, currentSource }) {
  const checked = assertContract('approved-build-plan', plan);
  if (checked.projectId !== projectId) throw new Error('Approved build plan project does not match the execution target.');
  if (!SHA256.test(String(expectedPlanHash ?? '')) || expectedPlanHash !== checked.planHash) throw new Error('Approved build plan hash does not match the execution request.');
  if (approvedBuildPlanHash(checked) !== checked.planHash) throw new Error('Approved build plan content no longer matches its immutable hash.');
  if (checked.fingerprintVersion !== FINGERPRINT_VERSION) throw new Error('Approved build plan fingerprint version is unsupported.');
  if (!currentSource || currentSource.projectStateHash !== checked.source.projectStateHash) throw new Error('Approved build plan project state has drifted since approval.');
  return checked;
}
