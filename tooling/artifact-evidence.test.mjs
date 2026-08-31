/**
 * Evidence is about one exact artifact, and a rebuild says the same thing.
 *
 * The refusal that already existed was real but narrow: a producer's report
 * records a `compositionHash`, and a report carrying a different one is not
 * read. What that cannot catch is the case the reproducibility work uncovered —
 * two builds of one composition installing different dependency graphs and
 * producing different bytes, all carrying the same composition hash. A
 * behaviour report about yesterday's output satisfies that check for today's.
 *
 * Most of the closure here is arithmetic rather than a new rule. Identity is
 * append-only, so changing source, lock or output is not an edit but a
 * different revision with a different id and no evidence of its own. The tests
 * that say "a source change invalidates downstream evidence" therefore assert
 * something slightly different and stronger: the evidence stays perfectly
 * valid, about a revision that is no longer the one being released.
 *
 * The last test is the one that matters most. It drives the real service
 * through the governed path — approve a contract, execute the plan, verify the
 * build — and then traces the resulting artifact by digest and rebuilds the
 * whole lineage from the raw ledger file. If that disagrees with the live
 * projection, the read model is a second source of truth and everything above
 * it is decoration.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ARTIFACT_REVISION_EVENTS,
  EVIDENCE_BINDING_REFUSALS,
  EvidenceBindingError,
  artifactRevisionDigest,
  assertEvidenceBinding,
  bindArtifactEvidence,
  liveArtifactRevision,
  reduceArtifactRevisions,
  reviewEvidence,
} from '@app-builder/control-plane/artifact-evidence';
import {
  advanceArtifactRevision,
  createArtifactRevision,
  forkArtifactRevision,
} from '@app-builder/control-plane/artifact-lifecycle';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { approveProjectBuildPlan, executeApprovedProjectBuildPlan } from '../apps/service/src/approved-build-plan-service.js';
import { buildOutputManifest, lockDigest, sourceDigest } from './lib/build-identity.mjs';
import { declaredToolchain, runningToolchain } from './lib/toolchain.mjs';

const digest = (seed) => seed.repeat(64).slice(0, 64);
const CONTRACT = digest('a1');
const SOURCE = digest('b2');
const LOCK = digest('c3');
const OUTPUT = digest('d4');
const TOOLCHAIN = { node: '22.23.2', npm: '10.9.8' };

function built(overrides = {}) {
  let revision = createArtifactRevision({
    projectId: 'project-1', producedBy: 'builder', approvedBy: 'owner',
    basis: 'Owner approved the contract.', identity: { contractDigest: CONTRACT },
    ...overrides,
  }, '2026-01-01T00:00:00.000Z');
  revision = advanceArtifactRevision(revision, 'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: overrides.sourceDigest ?? SOURCE } });
  return advanceArtifactRevision(revision, 'buildable', {
    actor: 'builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: overrides.outputDigest ?? OUTPUT },
  });
}

function refusalOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof EvidenceBindingError, `expected an EvidenceBindingError, got ${error?.name}: ${error?.message}`);
    assert.ok(EVIDENCE_BINDING_REFUSALS.includes(error.refusal), `${error.refusal} is not a declared refusal`);
    return error.refusal;
  }
  return assert.fail('expected a refusal and got none');
}

test('evidence records which part of the artifact it was measured against', () => {
  const revision = built();
  const behaviour = bindArtifactEvidence(revision, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'], producedBy: 'journey-runner' });
  assert.equal(behaviour.revisionId, revision.id);
  assert.deepEqual(behaviour.measuredAgainst, ['outputDigest']);
  assert.deepEqual(behaviour.boundTo, { outputDigest: OUTPUT });
  assert.equal(behaviour.revisionDigest, artifactRevisionDigest(revision));
  assert.doesNotThrow(() => assertEvidenceBinding(revision, behaviour));
});

test('evidence that names nothing is refused rather than treated as being about everything', () => {
  const revision = built();
  assert.equal(refusalOf(() => bindArtifactEvidence(revision, { id: 'x', kind: 'k', measuredAgainst: [] })), 'evidence-names-nothing');
  assert.equal(refusalOf(() => bindArtifactEvidence(revision, { id: 'x', kind: 'k', measuredAgainst: ['vibes'] })), 'evidence-names-nothing');
  assert.equal(refusalOf(() => bindArtifactEvidence(revision, { id: '', kind: 'k', measuredAgainst: ['outputDigest'] })), 'evidence-names-nothing');
});

test('evidence cannot be measured against something the artifact has not recorded yet', () => {
  const materialized = advanceArtifactRevision(
    createArtifactRevision({ projectId: 'project-1', producedBy: 'builder', approvedBy: 'owner', basis: 'Approved.', identity: { contractDigest: CONTRACT } }),
    'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } },
  );
  assert.equal(
    refusalOf(() => bindArtifactEvidence(materialized, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'] })),
    'evidence-ahead-of-artifact',
  );
  assert.doesNotThrow(() => bindArtifactEvidence(materialized, { id: 'lint-1', kind: 'source-lint', measuredAgainst: ['sourceDigest'] }));
});

test('unbound evidence and another revision’s evidence are different refusals', () => {
  const revision = built();
  const other = built({ id: 'revision-other' });
  const evidence = bindArtifactEvidence(revision, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'] });

  assert.equal(refusalOf(() => assertEvidenceBinding(revision, { id: 'legacy', boundTo: {} })), 'evidence-unbound');
  assert.equal(refusalOf(() => assertEvidenceBinding(other, evidence)), 'evidence-for-another-revision');
});

test('substituting the artifact under its own evidence is caught', () => {
  const revision = built();
  const evidence = bindArtifactEvidence(revision, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'] });

  // The reducer refuses this in-place, so a substitution has to be hand-made —
  // which is exactly the shape of the attack: state written by something other
  // than the reducer, offered to a reader that trusts it.
  const substituted = { ...revision, identity: { ...revision.identity, outputDigest: digest('ee') } };
  assert.equal(refusalOf(() => assertEvidenceBinding(substituted, evidence)), 'evidence-identity-mismatch');

  // And the same the other way round: evidence edited to name bytes it never saw.
  const forged = { ...evidence, boundTo: { outputDigest: digest('ff') } };
  assert.equal(refusalOf(() => assertEvidenceBinding(revision, forged)), 'evidence-identity-mismatch');
});

test('a source, lock or output change carries its evidence to a revision nobody is releasing', () => {
  const revision = built();
  const journey = bindArtifactEvidence(revision, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'] });
  const install = bindArtifactEvidence(revision, { id: 'install-1', kind: 'build-report', measuredAgainst: ['sourceDigest', 'lockDigest'] });

  // Changing any of the three is refused in place, so it is a child revision —
  // and the child holds none of the parent's evidence. That is the whole
  // invalidation mechanism: nothing is invalidated, it simply is not about this.
  for (const component of ['sourceDigest', 'lockDigest', 'outputDigest']) {
    assert.throws(
      () => advanceArtifactRevision(revision, 'behavior-verified', { actor: 'runner', basis: 'Changed bytes.', evidenceRefs: ['x'], identity: { [component]: digest('99') } }),
      /identity is append-only/,
      `${component} must not be changeable under evidence that measured it`,
    );
  }

  const { child } = forkArtifactRevision(revision, { actor: 'critic', basis: 'The enquiry form loses its error state.' });
  const review = reviewEvidence(child, [journey, install]);
  assert.equal(review.usable, false);
  assert.deepEqual(review.bound, []);
  assert.deepEqual(review.refused.map((entry) => entry.refusal), ['evidence-for-another-revision', 'evidence-for-another-revision']);

  // The parent still has usable evidence; it is simply superseded.
  assert.equal(reviewEvidence(revision, [journey, install]).usable, true);
});

test('reviewing evidence reports every refusal, not the first', () => {
  const revision = built();
  const good = bindArtifactEvidence(revision, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'] });
  const review = reviewEvidence(revision, [good, { id: 'legacy', boundTo: {} }, { ...good, id: 'elsewhere', revisionId: 'revision-other' }]);
  assert.deepEqual(review.bound.map((item) => item.id), ['journey-1']);
  assert.deepEqual(review.refused.map((entry) => entry.refusal), ['evidence-unbound', 'evidence-for-another-revision']);
  assert.equal(review.usable, false);
});

test('the projection is a replay: the same events produce the same revisions and the same digests', () => {
  const at = '2026-01-01T00:00:00.000Z';
  const events = [
    { type: ARTIFACT_REVISION_EVENTS.created, projectId: 'project-1', timestamp: at, payload: { revisionId: 'revision-1', projectId: 'project-1', producedBy: 'builder', actor: 'owner', basis: 'Approved.', contractDigest: CONTRACT, at } },
    { type: ARTIFACT_REVISION_EVENTS.advanced, projectId: 'project-1', timestamp: at, payload: { revisionId: 'revision-1', from: 'contract-approved', to: 'materialized', actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE }, at } },
    { type: 'something.else', projectId: 'project-1', timestamp: at, payload: {} },
    { type: ARTIFACT_REVISION_EVENTS.advanced, projectId: 'project-1', timestamp: at, payload: { revisionId: 'revision-1', from: 'materialized', to: 'buildable', actor: 'builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT }, at } },
  ];

  const first = reduceArtifactRevisions(events);
  const second = reduceArtifactRevisions(events);
  assert.equal(first.size, 1);
  assert.deepEqual(first.get('revision-1'), second.get('revision-1'), 'replaying must be deterministic, including timestamps');
  assert.equal(artifactRevisionDigest(first.get('revision-1')), artifactRevisionDigest(second.get('revision-1')));
  assert.equal(liveArtifactRevision(first).lifecycleState, 'buildable');

  // A stream missing its opening event is incomplete, and saying so beats
  // inventing a revision to hang the rest of the history on.
  assert.throws(() => reduceArtifactRevisions(events.slice(1)), /advances unknown artifact revision/);
});

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Lineage Test', slug, type: 'marketing-site', primaryGoal: 'Prove one artifact carries its own evidence.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Lineage Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
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

test('a real governed build is traceable by digest, and rebuilds identically from the ledger file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-lineage-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  try {
    service.createProject({ id: 'project-1', manifest: manifest('lineage-test') });

    // An ungoverned project has no revision. That is the honest answer: nothing
    // has been approved, so there is nothing for `contract-approved` to be about.
    assert.equal(service.liveArtifactRevision('project-1'), null);

    const plan = await approveProjectBuildPlan(service, 'project-1', {
      approvalId: 'approval-1', approvalMode: 'explicit-local-operator', confirmed: true,
    });
    const opened = service.liveArtifactRevision('project-1');
    assert.equal(opened.lifecycleState, 'contract-approved');
    assert.equal(opened.identity.contractDigest, plan.source.projectStateHash);

    const executed = await executeApprovedProjectBuildPlan(service, 'project-1', {
      planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-1',
    });
    const workspace = executed.result.workspace;
    const materialized = service.liveArtifactRevision('project-1');
    assert.equal(materialized.lifecycleState, 'materialized');
    assert.equal(materialized.identity.sourceDigest, sourceDigest(workspace), 'the recorded source digest is the digest of the tree on disk');
    assert.equal(materialized.identity.outputDigest, null, 'materialized asserts nothing about a build');

    await service.verifyProject('project-1');
    const verified = service.liveArtifactRevision('project-1');
    const supported = runningToolchain().node === declaredToolchain().node && runningToolchain().npm === declaredToolchain().npm;

    if (supported) {
      assert.equal(verified.lifecycleState, 'buildable');
      assert.equal(verified.identity.lockDigest, lockDigest(workspace));
      assert.equal(verified.identity.outputDigest, buildOutputManifest(path.join(workspace, 'dist')).digest);

      // Evidence measured against this build is about this build, and evidence
      // measured against the digests of a differently-built one is not.
      const journey = bindArtifactEvidence(verified, { id: 'journey-1', kind: 'browser-journey', measuredAgainst: ['outputDigest'] });
      assert.doesNotThrow(() => assertEvidenceBinding(verified, journey));
      assert.equal(refusalOf(() => assertEvidenceBinding({ ...verified, identity: { ...verified.identity, outputDigest: digest('ab') } }, journey)), 'evidence-identity-mismatch');
    } else {
      // A host off the declared toolchain records everything and claims nothing,
      // which is the same honesty the build identity itself reports.
      assert.equal(verified.lifecycleState, 'materialized');
    }

    // The read model is a replay. Rebuilding from the ledger file — not from
    // the store, not from memory — must produce the identical revision.
    const ledger = fs.readFileSync(store.ledgerPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const rebuilt = liveArtifactRevision(reduceArtifactRevisions(ledger));
    assert.deepEqual(rebuilt, verified, 'the projection disagrees with the ledger it is supposed to be a projection of');
    assert.equal(artifactRevisionDigest(rebuilt), artifactRevisionDigest(verified));

    // And the digest is what a person would trace the build by.
    assert.match(artifactRevisionDigest(verified), /^[0-9a-f]{64}$/);
    assert.deepEqual(verified.history.map((entry) => entry.to), supported
      ? ['contract-approved', 'materialized', 'buildable']
      : ['contract-approved', 'materialized']);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
