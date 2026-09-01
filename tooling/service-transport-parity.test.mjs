/**
 * The service and the Console describe the project summary once.
 *
 * They used to describe it twice. `apps/console/src/service/client.ts` carried
 * a hand-written `ProjectSummary`, and the service built the object it was
 * supposed to describe with nothing comparing them. That is survivable while a
 * shape is stable and it stops being survivable the moment one changes: the
 * lifecycle claim and the build identity were both added to the service and
 * then typed a second time by hand, and a Console reading `lifecycleState` from
 * a service that had renamed it would compile on both sides and render nothing.
 * No test would fail. Nobody would be told.
 *
 * So the schema is the family, the Console imports the generated type, and the
 * service asserts the contract on the way out. Two of the three ways this can
 * drift are now impossible rather than merely tested — the Console cannot
 * disagree with a type it does not write, and the service cannot emit a shape
 * its own boundary refuses. What is left to test is that nobody has quietly
 * gone back to hand-writing it, and that the refusal is real.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertContract, contractSchema, validateContract } from '@app-builder/contracts';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { approveProjectBuildPlan, executeApprovedProjectBuildPlan } from '../apps/service/src/approved-build-plan-service.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Transport Parity', slug, type: 'marketing-site', primaryGoal: 'Prove the boundary is described once.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Transport Parity' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: {
      hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '',
      integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

function factory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-transport-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  return { root, store, service, async close() { await service.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('the Console imports the summary type rather than describing it again', () => {
  const client = fs.readFileSync(path.join(REPOSITORY_ROOT, 'apps/console/src/service/client.ts'), 'utf8');
  assert.match(client, /export type ProjectSummary = AppBuilderProjectSummary;/, 'the Console must alias the generated type, not restate it');

  // The specific regression: a hand-written object type under this name. It is
  // one edit away at any time, and it is invisible in review because it looks
  // like ordinary TypeScript.
  assert.doesNotMatch(client, /export type ProjectSummary = \{/, 'the Console has gone back to hand-writing the summary shape');
  assert.match(client, /import type \{[^}]*AppBuilderProjectSummary[^}]*\} from '@app-builder\/contracts';/);
});

test('the generated type exists and is derived from the schema, not committed by hand', () => {
  const generated = path.join(REPOSITORY_ROOT, 'packages/contracts/generated/project-summary.d.ts');
  assert.ok(fs.existsSync(generated), 'the contract family generates no type, so the Console is aliasing nothing');
  const text = fs.readFileSync(generated, 'utf8');
  assert.match(text, /GENERATED FILE — DO NOT EDIT/);
  assert.match(text, /Source: schemas\/project-summary\.schema\.json/);
  assert.match(text, /export interface AppBuilderProjectSummary/);

  // `npm run contracts:check` already fails on drift between schema and type.
  // This asserts the family is wired to that mechanism at all, because a family
  // nobody generates would pass that check by not being in it.
  const registry = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'config/contract-families.json'), 'utf8'));
  const family = registry.families.find((entry) => entry.id === 'project-summary');
  assert.ok(family, 'project-summary is not a declared contract family');
  assert.equal(family.typeName, 'AppBuilderProjectSummary');
  assert.match(family.schemaHash, /^[0-9a-f]{64}$/);
  assert.match(family.typesHash, /^[0-9a-f]{64}$/);
});

test('the service emits the contract it declares, at every stage a project passes through', async () => {
  const harness = factory();
  try {
    const { service } = harness;

    // Fresh: no lifecycle, no build identity, and the projection says why
    // rather than leaving the absence to be interpreted.
    const created = service.createProject({ id: 'project-1', manifest: manifest('transport-parity') });
    assert.deepEqual(validateContract('project-summary', created), []);
    assert.equal(created.lifecycle.lifecycleState, null);
    assert.ok(created.lifecycle.basis.length > 20);
    assert.equal(created.buildIdentity, null);

    // Governed: a revision is open, so the projection carries a real state.
    const plan = await approveProjectBuildPlan(service, 'project-1', { approvalId: 'approval-1', approvalMode: 'explicit-local-operator', confirmed: true });
    assert.deepEqual(validateContract('project-summary', service.getProject('project-1')), []);

    const executed = await executeApprovedProjectBuildPlan(service, 'project-1', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-1' });
    assert.deepEqual(validateContract('project-summary', executed.result.project), []);

    // Verified: the build identity is populated, which is the branch that was
    // typed by hand twice and never compared.
    const verified = await service.verifyProject('project-1');
    assert.deepEqual(validateContract('project-summary', verified.project), []);
    assert.ok(verified.project.buildIdentity, 'a verified project records what it installed from and built');
    assert.equal(typeof verified.project.buildIdentity.reproducible, 'boolean');

    // And the list projection is the same shape as the single one, which is the
    // other place two spellings could have diverged.
    for (const entry of service.listProjects()) assert.deepEqual(validateContract('project-summary', entry), []);
  } finally {
    await harness.close();
  }
});

test('a field the service adds and the schema does not know is refused at the boundary', () => {
  const schema = contractSchema('project-summary');
  assert.equal(schema.additionalProperties, false, 'without this, a field added on one side is simply invisible on the other');

  const valid = {
    id: 'p', name: 'n', type: 'marketing-site', slug: 's', state: 'ready',
    lifecycle: { lifecycleState: null, basis: 'Nothing has been approved.', missing: [], legacyState: 'ready', meaning: null, notMeaning: null },
    buildIdentity: null, workspacePath: null, manifestVersion: 1, knowledgePackHash: null,
    approvedIntakeBundleId: null, createdAt: 'now', updatedAt: 'now',
  };
  assert.deepEqual(validateContract('project-summary', valid), []);

  // The drift this family exists to catch, planted in both directions.
  assert.throws(() => assertContract('project-summary', { ...valid, releaseState: 'released' }), /releaseState is not allowed/);
  const { lifecycle, ...withoutLifecycle } = valid;
  assert.throws(() => assertContract('project-summary', withoutLifecycle), /lifecycle is required/);
  assert.throws(() => assertContract('project-summary', { ...valid, lifecycle: { ...lifecycle, lifecycleState: 'launchable' } }), /lifecycleState is unsupported/);

  // A build identity that names a digest which is not one. The Console renders
  // these as a traceable identity; a truncated or absent digest displayed as if
  // it were exact is worse than no identity at all.
  assert.throws(() => assertContract('project-summary', {
    ...valid,
    buildIdentity: { sourceDigest: 'abc', lockDigest: 'abc', toolchain: { node: '22.23.2', npm: '10.9.8' }, outputDigest: 'abc', outputFiles: 1, reproducible: true, toolchainSummary: 'ok', recordedAt: 'now' },
  }), /must be a SHA-256 hex digest/);
});

test('a toolchain nobody could read is null rather than assumed', () => {
  // `runningToolchain` returns null when npm cannot be asked, and the
  // difference between "npm 10.9.8" and "we could not find out" is the
  // difference between a reproducibility claim and an honest gap.
  const withUnknownNpm = {
    id: 'p', name: 'n', type: 'marketing-site', slug: 's', state: 'verified',
    lifecycle: { lifecycleState: 'materialized', basis: 'Recorded but not reproducible.', missing: ['toolchain'], legacyState: 'verified', meaning: 'A portable source tree exists.', notMeaning: 'That it builds.' },
    buildIdentity: {
      sourceDigest: 'a'.repeat(64), lockDigest: 'b'.repeat(64), toolchain: { node: '22.23.2', npm: null },
      outputDigest: 'c'.repeat(64), outputFiles: 12, reproducible: false, toolchainSummary: 'npm unknown', recordedAt: 'now',
    },
    workspacePath: '/workspaces/p', manifestVersion: 2, knowledgePackHash: null,
    approvedIntakeBundleId: null, createdAt: 'now', updatedAt: 'now',
  };
  assert.deepEqual(validateContract('project-summary', withUnknownNpm), []);
});
