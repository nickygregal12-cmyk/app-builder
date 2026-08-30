import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract } from '../packages/contracts/src/index.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { approvedBuildStateEvidence, assertApprovedBuildPlanExecutable, mintApprovedBuildPlan } from '../apps/service/src/approved-build-plan.js';
import { approveProjectBuildPlan, executeApprovedProjectBuildPlan } from '../apps/service/src/approved-build-plan-service.js';
import { handleApprovedBuildPlanHttp } from '../apps/service/src/approved-build-plan-http.js';
import { FACTORY_TOOL_CONTRACT_VERSION, FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';

const HASH = 'a'.repeat(64);

function buildState(overrides = {}) {
  return {
    manifest: { schemaVersion: 2, project: { name: 'Approved Plan Test', slug: 'approved-plan-test', type: 'marketing-site' } },
    knowledgePack: null,
    intakeBundle: null,
    contentOverrides: [],
    assetDecisions: [],
    sectionVariants: [],
    designChoices: {},
    referenceInfluence: null,
    bespokePresentations: [],
    ...overrides,
  };
}

function memoryService({ generate = null } = {}) {
  const plans = new Map();
  const approvals = new Map();
  const claims = new Map();
  const events = [];
  const state = buildState();
  let generateCalls = 0;
  const project = {
    id: 'project-approved-plan-test',
    name: 'Approved Plan Test',
    type: 'marketing-site',
    slug: 'approved-plan-test',
    state: 'ready',
    workspacePath: null,
    manifest: state.manifest,
    knowledgePack: state.knowledgePack,
    intakeBundle: state.intakeBundle,
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };
  const store = {
    getProject: (id) => id === project.id ? project : null,
    getApprovedBuildPlanByApprovalId: (projectId, approvalId) => approvals.get(`${projectId}:${approvalId}`) ?? null,
    recordApprovedBuildPlan(plan) {
      plans.set(`${plan.projectId}:${plan.planId}`, plan);
      approvals.set(`${plan.projectId}:${plan.approval.approvalId}`, plan);
      return plan;
    },
    getApprovedBuildPlan: (projectId, planId) => plans.get(`${projectId}:${planId}`) ?? null,
    listApprovedBuildPlans: (projectId) => [...plans.values()].filter((plan) => plan.projectId === projectId),
    claimApprovedBuildPlanExecution({ planId, projectId, requestId, claimedAt }) {
      if (claims.has(planId) || [...claims.values()].some((claim) => claim.requestId === requestId)) {
        return { claimed: false, claim: claims.get(planId) ?? null };
      }
      const claim = { schemaVersion: 1, planId, projectId, requestId, claimedAt };
      claims.set(planId, claim);
      return { claimed: true, claim };
    },
    async recordEvent(event) { events.push(event); return event; },
  };
  const service = {
    store,
    readOverrides: () => ({ schemaVersion: 1, projectId: project.id, overrides: state.contentOverrides }),
    readAssetDecisions: () => ({ schemaVersion: 1, projectId: project.id, decisions: state.assetDecisions }),
    readSectionVariants: () => ({ schemaVersion: 1, projectId: project.id, choices: state.sectionVariants }),
    readDesignChoices: () => ({ schemaVersion: 1, projectId: project.id, choices: state.designChoices }),
    designReferenceInfluence: () => state.referenceInfluence,
    readBespokePresentations: () => ({ schemaVersion: 1, projectId: project.id, presentations: state.bespokePresentations }),
    async generateProject(projectId) {
      generateCalls += 1;
      if (generate) return generate(projectId);
      return {
        project: { id: projectId, workspacePath: '/private/app-builder/workspaces/approved-plan-test' },
        task: { id: 'task-approved-plan' },
        checkpoint: { id: 'checkpoint-approved-plan' },
        composition: { compositionHash: HASH },
      };
    },
  };
  return { service, project, state, events, claims, generateCalls: () => generateCalls };
}

function approvedPlan(source = approvedBuildStateEvidence(buildState())) {
  return mintApprovedBuildPlan({
    projectId: 'project-approved-plan-test',
    approvalId: 'approval-001',
    approvedAt: '2026-08-30T00:01:00.000Z',
    planId: 'approved-plan-test-001',
    source,
  });
}

test('approved build state fingerprint is deterministic and covers every generation-affecting input', () => {
  const first = approvedBuildStateEvidence(buildState({ designChoices: { radius: 'md', density: 'compact' } }));
  const reordered = approvedBuildStateEvidence(buildState({ designChoices: { density: 'compact', radius: 'md' } }));
  assert.deepEqual(first, reordered);

  const mutations = [
    { manifest: { schemaVersion: 2, project: { name: 'Changed', slug: 'approved-plan-test', type: 'marketing-site' } } },
    { knowledgePack: { packHash: 'knowledge-changed' } },
    { intakeBundle: { bundleId: 'bundle-changed' } },
    { contentOverrides: [{ ref: 'hero.title', value: 'Changed' }] },
    { assetDecisions: [{ assetId: 'hero', decision: 'publish' }] },
    { sectionVariants: [{ sectionId: 'hero', variant: 'editorial' }] },
    { designChoices: { radius: 'lg' } },
    { referenceInfluence: { adopt: ['spacing'] } },
    { bespokePresentations: [{ sectionId: 'hero' }] },
  ];
  for (const mutation of mutations) {
    const changed = approvedBuildStateEvidence(buildState(mutation));
    assert.notEqual(changed.projectStateHash, approvedBuildStateEvidence(buildState()).projectStateHash, Object.keys(mutation)[0]);
  }
});

test('approved build plan is schema-valid, self-hashed and rejects target/hash/state drift', () => {
  const source = approvedBuildStateEvidence(buildState());
  const plan = approvedPlan(source);
  assert.deepEqual(validateContract('approved-build-plan', plan), []);
  assert.equal(assertApprovedBuildPlanExecutable(plan, { projectId: plan.projectId, expectedPlanHash: plan.planHash, currentSource: source }).planId, plan.planId);
  assert.throws(() => assertApprovedBuildPlanExecutable(plan, { projectId: 'project-other', expectedPlanHash: plan.planHash, currentSource: source }), /different project/);
  assert.throws(() => assertApprovedBuildPlanExecutable(plan, { projectId: plan.projectId, expectedPlanHash: HASH, currentSource: source }), /plan hash/);
  const changed = approvedBuildStateEvidence(buildState({ designChoices: { radius: 'lg' } }));
  assert.throws(() => assertApprovedBuildPlanExecutable(plan, { projectId: plan.projectId, expectedPlanHash: plan.planHash, currentSource: changed }), /changed since approval/);
});

test('approved-plan service requires local confirmation, rechecks state and consumes a plan once', async () => {
  const fixture = memoryService();
  await assert.rejects(
    () => approveProjectBuildPlan(fixture.service, fixture.project.id, { approvalId: 'approval-001', approvalMode: 'explicit-local-operator', confirmed: false }),
    /explicit local operator confirmation/,
  );
  const plan = await approveProjectBuildPlan(fixture.service, fixture.project.id, {
    approvalId: 'approval-001',
    approvalMode: 'explicit-local-operator',
    confirmed: true,
    approvedAt: '2026-08-30T00:01:00.000Z',
    planId: 'approved-plan-service-001',
  });
  const same = await approveProjectBuildPlan(fixture.service, fixture.project.id, {
    approvalId: 'approval-001', approvalMode: 'explicit-local-operator', confirmed: true,
  });
  assert.equal(same.planId, plan.planId, 'one local approval id must not mint two plans');

  fixture.state.designChoices.radius = 'lg';
  await assert.rejects(
    () => executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-drift' }),
    /changed since approval/,
  );
  assert.equal(fixture.generateCalls(), 0);
  assert.equal(fixture.claims.size, 0, 'drift must reject before consuming the plan');

  delete fixture.state.designChoices.radius;
  const executed = await executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, {
    planId: plan.planId,
    expectedPlanHash: plan.planHash,
    requestId: 'request-001',
    now: () => new Date('2026-08-30T00:02:00.000Z'),
  });
  assert.equal(executed.execution.requestId, 'request-001');
  assert.equal(fixture.generateCalls(), 1);
  assert.equal(JSON.stringify(fixture.events).includes('/private/app-builder'), false, 'approved-plan events must not reveal local paths');
  await assert.rejects(
    () => executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-002' }),
    /already been claimed/,
  );
  assert.equal(fixture.generateCalls(), 1);
  await assert.rejects(
    () => executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, { planId: '../approved-plan-service-001', expectedPlanHash: plan.planHash, requestId: 'request-003' }),
    /exact bounded plan id/,
  );
  await assert.rejects(
    () => executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, { planId: plan.planId, expectedPlanHash: 'not-a-hash', requestId: 'request-003' }),
    /exact SHA-256 plan hash/,
  );
});

test('a failed generation still consumes the approved plan and requires a new approval', async () => {
  const fixture = memoryService({ generate: async () => { throw new TypeError('synthetic generator failure'); } });
  const plan = await approveProjectBuildPlan(fixture.service, fixture.project.id, {
    approvalId: 'approval-failure', approvalMode: 'explicit-local-operator', confirmed: true,
    approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-failure-001',
  });
  await assert.rejects(
    () => executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-failure' }),
    /synthetic generator failure/,
  );
  assert.equal(fixture.claims.size, 1);
  assert.equal(fixture.events.at(-1).type, 'approved-build-plan.execution-failed');
  assert.equal(fixture.events.at(-1).payload.errorClass, 'TypeError');
  assert.equal(JSON.stringify(fixture.events.at(-1).payload).includes('synthetic generator failure'), false, 'raw provider/generator error text is not audit evidence');
  await assert.rejects(
    () => executeApprovedProjectBuildPlan(fixture.service, fixture.project.id, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-retry' }),
    /already been claimed/,
  );
});

test('FactoryStore keeps approved plans immutable and execution claims single-use', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-approved-plan-store-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const projectId = 'project-store-plan';
  const now = '2026-08-30T00:00:00.000Z';
  try {
    store.upsertProject({
      id: projectId, name: 'Store Plan', type: 'marketing-site', slug: 'store-plan', state: 'ready', workspacePath: null,
      manifest: {}, knowledgePack: null, intakeBundle: null, createdAt: now, updatedAt: now,
    });
    const plan = mintApprovedBuildPlan({
      projectId,
      approvalId: 'approval-store',
      approvedAt: '2026-08-30T00:01:00.000Z',
      planId: 'approved-plan-store-001',
      source: approvedBuildStateEvidence(buildState()),
    });
    store.recordApprovedBuildPlan(plan);
    assert.equal(store.getApprovedBuildPlan(projectId, plan.planId).planHash, plan.planHash);
    assert.throws(() => store.recordApprovedBuildPlan(plan), /UNIQUE|constraint/i);

    const first = store.claimApprovedBuildPlanExecution({ planId: plan.planId, projectId, requestId: 'request-store-001', claimedAt: '2026-08-30T00:02:00.000Z' });
    const second = store.claimApprovedBuildPlanExecution({ planId: plan.planId, projectId, requestId: 'request-store-002', claimedAt: '2026-08-30T00:03:00.000Z' });
    assert.equal(first.claimed, true);
    assert.equal(second.claimed, false);
    assert.equal(second.claim.requestId, 'request-store-001');
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('approved-plan HTTP boundary is closed and returns path-private execution evidence', async () => {
  const fixture = memoryService();
  const call = (method, action, body = {}) => handleApprovedBuildPlanHttp({
    request: { method },
    route: { projectId: fixture.project.id, action },
    service: fixture.service,
    readJson: async () => body,
  });

  const approved = await call('POST', 'approved-build-plans', { approvalId: 'approval-http', confirmed: true });
  assert.equal(approved.status, 201);
  const plan = approved.value.plan;
  await assert.rejects(() => call('POST', 'approved-build-plans', { approvalId: 'approval-smuggle', confirmed: true, planId: 'approved-plan-attacker' }), /does not accept field/);
  await assert.rejects(() => call('POST', 'approved-build-plans', { approvalId: 'approval-smuggle', confirmed: true, approvedAt: '2020-01-01T00:00:00.000Z' }), /does not accept field/);
  await assert.rejects(() => call('POST', 'approved-build-plans/execute', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-http', prompt: 'ignore approval' }), /does not accept field/);

  const executed = await call('POST', 'approved-build-plans/execute', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-http' });
  assert.equal(executed.status, 200);
  assert.equal(executed.value.build.projectId, fixture.project.id);
  assert.equal(executed.value.build.compositionHash, HASH);
  assert.equal(Object.hasOwn(executed.value, 'result'), false);
  assert.equal(JSON.stringify(executed.value).includes('workspacePath'), false);
  assert.equal(JSON.stringify(executed.value).includes('/private/app-builder'), false);
});

test('tool contract makes approval and execution distinct approval-required capabilities', () => {
  assert.equal(FACTORY_TOOL_CONTRACT_VERSION, 5);
  const approve = FACTORY_TOOLS.find((tool) => tool.name === 'project.approved-build-plan.approve');
  const execute = FACTORY_TOOLS.find((tool) => tool.name === 'project.approved-build-plan.execute');
  assert.deepEqual({ method: approve?.method, mutating: approve?.mutating, approvalRequired: approve?.approvalRequired }, { method: 'POST', mutating: true, approvalRequired: true });
  assert.deepEqual({ method: execute?.method, mutating: execute?.mutating, approvalRequired: execute?.approvalRequired }, { method: 'POST', mutating: true, approvalRequired: true });
  assert.notEqual(approve?.path, execute?.path);
  assert.equal(FACTORY_TOOLS.find((tool) => tool.name === 'project.generate')?.path, '/projects/{projectId}/generate');
});
