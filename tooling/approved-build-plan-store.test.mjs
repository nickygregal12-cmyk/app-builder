import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryStore } from '../apps/service/src/store.js';
import { approvedBuildStateEvidence, mintApprovedBuildPlan } from '../apps/service/src/approved-build-plan.js';
import { claimApprovedBuildPlanExecution, getApprovedBuildPlan, recordApprovedBuildPlan } from '../apps/service/src/approved-build-plan-store.js';

function state() {
  return approvedBuildStateEvidence({
    manifest: {}, knowledgePack: null, intakeBundle: null, contentOverrides: [], assetDecisions: [], sectionVariants: [], designChoices: {}, referenceInfluence: null, bespokePresentations: [],
  });
}

test('approved build-plan storage is isolated from the core ledger store and single-use', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-approved-plan-store-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const now = '2026-08-30T00:00:00.000Z';
  const projectId = 'project-store-plan';
  try {
    store.upsertProject({ id: projectId, name: 'Store Plan', type: 'marketing-site', slug: 'store-plan', state: 'ready', workspacePath: null, manifest: {}, knowledgePack: null, intakeBundle: null, createdAt: now, updatedAt: now });
    const plan = mintApprovedBuildPlan({ projectId, approvalId: 'approval-store', approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-store-001', source: state() });
    recordApprovedBuildPlan(store, plan);
    assert.equal(getApprovedBuildPlan(store, projectId, plan.planId).planHash, plan.planHash);
    assert.throws(() => recordApprovedBuildPlan(store, plan), /UNIQUE|constraint/i);
    const first = claimApprovedBuildPlanExecution(store, { planId: plan.planId, projectId, requestId: 'request-store-001', claimedAt: '2026-08-30T00:02:00.000Z' });
    const second = claimApprovedBuildPlanExecution(store, { planId: plan.planId, projectId, requestId: 'request-store-002', claimedAt: '2026-08-30T00:03:00.000Z' });
    assert.equal(first.claimed, true);
    assert.equal(second.claimed, false);
    assert.equal(second.claim.requestId, 'request-store-001');
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
