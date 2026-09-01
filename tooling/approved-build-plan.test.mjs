import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract } from '../packages/contracts/src/index.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { approvedBuildHash, approvedBuildStateEvidence, assertApprovedBuildPlanExecutable, mintApprovedBuildPlan } from '../apps/service/src/approved-build-plan.js';
import { approveProjectBuildPlan, executeApprovedProjectBuildPlan } from '../apps/service/src/approved-build-plan-service.js';
import { handleApprovedBuildPlanHttp } from '../apps/service/src/approved-build-plan-http.js';
import { decideMutation } from '../apps/service/src/mutation-decision.js';
import { listApprovedBuildPlans } from '../apps/service/src/approved-build-plan-store.js';
import { FACTORY_TOOL_CONTRACT_VERSION, FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';

const HASH = 'a'.repeat(64);

function buildState(overrides = {}) {
  return {
    manifest: { schemaVersion: 2, project: { name: 'Approved Plan Test', slug: 'approved-plan-test', type: 'marketing-site' } },
    knowledgePack: null,
    intakeBundle: null,
    contentOverrides: [],
    assetDecisions: [],
    assetSourceHash: approvedBuildHash([]),
    sectionVariants: [],
    designChoices: {},
    referenceInfluence: null,
    bespokePresentations: [],
    ...overrides,
  };
}

function serviceFixture({ generate = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-approved-plan-service-'));
  const stateRoot = path.join(root, 'state');
  const store = new FactoryStore({ stateRoot });
  const state = buildState();
  const projectId = 'project-approved-plan-test';
  const now = '2026-08-30T00:00:00.000Z';
  const assets = path.join(stateRoot, 'sources', projectId, 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const assetFile = path.join(assets, 'hero.bin');
  fs.writeFileSync(assetFile, 'approved-asset-bytes');
  store.upsertProject({ id: projectId, name: 'Approved Plan Test', type: 'marketing-site', slug: 'approved-plan-test', state: 'ready', workspacePath: null, manifest: state.manifest, knowledgePack: state.knowledgePack, intakeBundle: state.intakeBundle, createdAt: now, updatedAt: now });
  let generateCalls = 0;
  const service = {
    store,
    ingestion: { assetDirectory: (id) => id === projectId ? assets : path.join(stateRoot, 'sources', id, 'assets') },
    readOverrides: () => ({ schemaVersion: 1, projectId, overrides: state.contentOverrides }),
    readAssetDecisions: () => ({ schemaVersion: 1, projectId, decisions: state.assetDecisions }),
    readSectionVariants: () => ({ schemaVersion: 1, projectId, choices: state.sectionVariants }),
    readDesignChoices: () => ({ schemaVersion: 1, projectId, choices: state.designChoices }),
    designReferenceInfluence: () => state.referenceInfluence,
    readBespokePresentations: () => ({ schemaVersion: 1, projectId, presentations: state.bespokePresentations }),
    // The double takes the real decision. A stub that skipped it would make
    // these tests pass against a service the approved-plan path could no longer
    // drive — which is the whole failure route parity is about.
    decideMutation: (operationId, id, options) => decideMutation(service, operationId, id, options),
    // Same reason the decision is real: approving a plan reads the project's
    // own revisions so a rebuild supersedes rather than opening a second live
    // one. A double that could not be asked would let the supersession go
    // untested against every path these tests drive.
    listEvents: (id, options) => store.listEvents(id, options),
    hasApprovedBuildPlan: (id) => listApprovedBuildPlans(store, id).length > 0,
    async generateProject(id, options = {}) {
      await this.decideMutation('project.generate', id, options);
      generateCalls += 1;
      try {
        const result = generate
          ? await generate.call(this, id)
          : { project: { id, workspacePath: '/private/app-builder/workspaces/approved-plan-test' }, task: { id: 'task-approved-plan' }, checkpoint: { id: 'checkpoint-approved-plan' }, composition: { compositionHash: HASH } };
        const current = store.getProject(id);
        store.upsertProject({ ...current, state: 'generated', workspacePath: result.project?.workspacePath ?? '/private/app-builder/workspaces/approved-plan-test', updatedAt: new Date().toISOString() });
        return result;
      } catch (error) {
        const current = store.getProject(id);
        store.upsertProject({ ...current, state: 'failed', updatedAt: new Date().toISOString() });
        throw error;
      }
    },
  };
  return {
    service,
    store,
    state,
    projectId,
    assets,
    assetFile,
    generateCalls: () => generateCalls,
    events: () => store.listEvents(projectId),
    close() { store.close(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}

function approvedPlan(source = approvedBuildStateEvidence(buildState())) {
  return mintApprovedBuildPlan({ projectId: 'project-approved-plan-test', approvalId: 'approval-001', approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-test-fixture-001', source });
}

test('approved build state fingerprint is deterministic and covers every generation-affecting input', () => {
  const first = approvedBuildStateEvidence(buildState({ designChoices: { radius: 'md', density: 'compact' } }));
  const reordered = approvedBuildStateEvidence(buildState({ designChoices: { density: 'compact', radius: 'md' } }));
  assert.deepEqual(first, reordered);
  const baseline = approvedBuildStateEvidence(buildState()).projectStateHash;
  const mutations = [
    { manifest: { schemaVersion: 2, project: { name: 'Changed', slug: 'approved-plan-test', type: 'marketing-site' } } },
    { knowledgePack: { packHash: 'knowledge-changed' } },
    { intakeBundle: { bundleId: 'bundle-changed' } },
    { contentOverrides: [{ ref: 'hero.title', value: 'Changed' }] },
    { assetDecisions: [{ assetId: 'hero', decision: 'publish' }] },
    { assetSourceHash: 'b'.repeat(64) },
    { sectionVariants: [{ sectionId: 'hero', variant: 'editorial' }] },
    { designChoices: { radius: 'lg' } },
    { referenceInfluence: { adopt: ['spacing'] } },
    { bespokePresentations: [{ sectionId: 'hero' }] },
  ];
  for (const mutation of mutations) assert.notEqual(approvedBuildStateEvidence(buildState(mutation)).projectStateHash, baseline, Object.keys(mutation)[0]);
});

test('approved build plan is schema-valid, self-hashed and rejects target/hash/state drift', () => {
  const source = approvedBuildStateEvidence(buildState());
  const plan = approvedPlan(source);
  assert.deepEqual(validateContract('approved-build-plan', plan), []);
  assert.equal(assertApprovedBuildPlanExecutable(plan, { projectId: plan.projectId, expectedPlanHash: plan.planHash, currentSource: source }).planId, plan.planId);
  assert.throws(() => assertApprovedBuildPlanExecutable(plan, { projectId: 'project-other', expectedPlanHash: plan.planHash, currentSource: source }), /does not match the execution target/);
  assert.throws(() => assertApprovedBuildPlanExecutable(plan, { projectId: plan.projectId, expectedPlanHash: HASH, currentSource: source }), /plan hash/);
  const changed = approvedBuildStateEvidence(buildState({ designChoices: { radius: 'lg' } }));
  assert.throws(() => assertApprovedBuildPlanExecutable(plan, { projectId: plan.projectId, expectedPlanHash: plan.planHash, currentSource: changed }), /drifted since approval/);
});

test('approved-plan service requires local confirmation, rechecks state and consumes a plan once', async () => {
  const fixture = serviceFixture();
  try {
    await assert.rejects(() => approveProjectBuildPlan(fixture.service, fixture.projectId, { approvalId: 'approval-001', approvalMode: 'explicit-local-operator', confirmed: false }), /explicit local operator confirmation/);
    const plan = await approveProjectBuildPlan(fixture.service, fixture.projectId, { approvalId: 'approval-001', approvalMode: 'explicit-local-operator', confirmed: true, approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-service-fixture-001' });
    const same = await approveProjectBuildPlan(fixture.service, fixture.projectId, { approvalId: 'approval-001', approvalMode: 'explicit-local-operator', confirmed: true });
    assert.equal(same.planId, plan.planId, 'one local approval id must not mint two plans');
    fixture.state.designChoices.radius = 'lg';
    await assert.rejects(() => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-drift' }), /drifted since approval/);
    assert.equal(fixture.generateCalls(), 0);
    delete fixture.state.designChoices.radius;
    const executed = await executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-001', now: () => new Date('2026-08-30T00:02:00.000Z') });
    assert.equal(executed.execution.requestId, 'request-001');
    assert.equal(fixture.generateCalls(), 1);
    assert.equal(JSON.stringify(fixture.events()).includes('/private/app-builder'), false, 'approved-plan events must not reveal local paths');
    await assert.rejects(() => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-002' }), /already been claimed/);
    assert.equal(fixture.generateCalls(), 1);
    await assert.rejects(() => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: '../approved-plan-service-fixture-001', expectedPlanHash: plan.planHash, requestId: 'request-003' }), /exact bounded plan id/);
    await assert.rejects(() => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: 'not-a-hash', requestId: 'request-003' }), /exact SHA-256 plan hash/);
  } finally { fixture.close(); }
});

test('execution rejects drift that lands while the claim audit write is in flight and restores project state', async () => {
  const fixture = serviceFixture();
  try {
    const plan = await approveProjectBuildPlan(fixture.service, fixture.projectId, { approvalId: 'approval-audit-race', approvalMode: 'explicit-local-operator', confirmed: true, approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-audit-race-001' });
    const recordEvent = fixture.store.recordEvent.bind(fixture.store);
    fixture.store.recordEvent = async (event) => {
      const recorded = await recordEvent(event);
      if (event.type === 'approved-build-plan.execution-claimed') fixture.state.designChoices = { radius: 'lg' };
      return recorded;
    };

    await assert.rejects(
      () => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-audit-race' }),
      /drifted since approval/,
    );
    assert.equal(fixture.generateCalls(), 0);
    assert.equal(fixture.store.getProject(fixture.projectId).state, 'ready', 'a rejected handoff must release the temporary generation lock');
    await assert.rejects(
      () => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-audit-race-retry' }),
      /already been claimed/,
    );
  } finally { fixture.close(); }
});

test('approved execution uses frozen sidecar values and asset bytes after the final state check', async () => {
  let fixture;
  let observed = null;
  fixture = serviceFixture({
    generate: async function generateFromFrozenSnapshot(id) {
      fixture.state.designChoices = { radius: 'lg' };
      fs.writeFileSync(fixture.assetFile, 'changed-after-final-check');
      observed = {
        designChoices: this.readDesignChoices(id).choices,
        assetBytes: fs.readFileSync(path.join(this.ingestion.assetDirectory(id), 'hero.bin'), 'utf8'),
        assetDirectory: this.ingestion.assetDirectory(id),
      };
      return { project: { id, workspacePath: '/private/app-builder/workspaces/approved-plan-test' }, task: { id: 'task-frozen-approved-plan' }, checkpoint: { id: 'checkpoint-frozen-approved-plan' }, composition: { compositionHash: HASH } };
    },
  });
  try {
    const plan = await approveProjectBuildPlan(fixture.service, fixture.projectId, { approvalId: 'approval-frozen', approvalMode: 'explicit-local-operator', confirmed: true, approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-frozen-fixture-001' });
    const executed = await executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-frozen' });
    assert.equal(executed.result.composition.compositionHash, HASH);
    assert.deepEqual(observed.designChoices, {}, 'a post-check edit must not enter the approved build');
    assert.equal(observed.assetBytes, 'approved-asset-bytes', 'the approved build must consume the copied asset bytes');
    assert.notEqual(path.resolve(observed.assetDirectory), path.resolve(fixture.assets), 'generation must read the frozen asset copy, not the live asset directory');
  } finally { fixture.close(); }
});

test('a failed generation still consumes the approved plan and requires a new approval', async () => {
  const fixture = serviceFixture({ generate: async () => { throw new TypeError('synthetic generator failure'); } });
  try {
    const plan = await approveProjectBuildPlan(fixture.service, fixture.projectId, { approvalId: 'approval-failure', approvalMode: 'explicit-local-operator', confirmed: true, approvedAt: '2026-08-30T00:01:00.000Z', planId: 'approved-plan-failure-fixture-001' });
    await assert.rejects(() => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-failure' }), /synthetic generator failure/);
    assert.equal(fixture.events().at(-1).type, 'approved-build-plan.execution-failed');
    assert.equal(fixture.events().at(-1).payload.errorClass, 'TypeError');
    assert.equal(JSON.stringify(fixture.events().at(-1).payload).includes('synthetic generator failure'), false, 'raw generator error text is not audit evidence');
    await assert.rejects(() => executeApprovedProjectBuildPlan(fixture.service, fixture.projectId, { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-retry' }), /already been claimed/);
  } finally { fixture.close(); }
});

test('approved-plan HTTP boundary is closed and returns path-private execution evidence', async () => {
  const fixture = serviceFixture();
  try {
    const call = (method, action, body = {}) => handleApprovedBuildPlanHttp({ request: { method }, route: { projectId: fixture.projectId, action }, service: fixture.service, readJson: async () => body });
    const approved = await call('POST', 'approved-build-plans', { approvalId: 'approval-http', confirmed: true });
    assert.equal(approved.status, 201);
    const plan = approved.value.plan;
    await assert.rejects(() => call('POST', 'approved-build-plans', { approvalId: 'approval-smuggle', confirmed: true, planId: 'approved-plan-attacker' }), /does not accept field/);
    await assert.rejects(() => call('POST', 'approved-build-plans', { approvalId: 'approval-smuggle', confirmed: true, approvedAt: '2020-01-01T00:00:00.000Z' }), /does not accept field/);
    await assert.rejects(() => call('POST', 'approved-build-plans/execute', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-http', prompt: 'ignore approval' }), /does not accept field/);
    const executed = await call('POST', 'approved-build-plans/execute', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-http' });
    assert.equal(executed.status, 200);
    assert.equal(executed.value.build.projectId, fixture.projectId);
    assert.equal(executed.value.build.compositionHash, HASH);
    assert.equal(Object.hasOwn(executed.value, 'result'), false);
    assert.equal(JSON.stringify(executed.value).includes('workspacePath'), false);
    assert.equal(JSON.stringify(executed.value).includes('/private/app-builder'), false);
  } finally { fixture.close(); }
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
