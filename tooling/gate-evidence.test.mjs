/**
 * Deterministic coverage for the gate-evidence lane.
 *
 * The dangerous direction here is one-way: every mistake this module could make
 * turns something unmeasured into a pass. So most of what follows is refusals —
 * evidence that is missing, unreadable, stale, for another build, for another
 * project, or produced by nothing at all — and each of them must leave the gate
 * `not-run` rather than quietly satisfied.
 *
 * The registered producers are exercised against their real implementations
 * rather than stubs, and each registered check has a planted failure: a gate
 * that has never been seen failing is not a gate.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { evaluateConvergence } from '@app-builder/control-plane/roles';
import {
  CHECK_STATUSES,
  EVIDENCE_REFUSALS,
  assertProducerRegistry,
  decideCheck,
  evaluateEvidenceIntegrity,
  resolveGateResults,
  summariseResolutions,
} from '@app-builder/control-plane/gate-evidence';

import { auditAssetRights } from './lib/asset-rights.mjs';

const REGISTRY = JSON.parse(fs.readFileSync('config/gate-producers.json', 'utf8'));
const PIPELINES = JSON.parse(fs.readFileSync('config/agent-pipelines.json', 'utf8'));
const GATES = PIPELINES.gates;
const BUILD_REF = 'composition-hash-1';
const BUILD = { projectId: 'project-1', buildRef: BUILD_REF, evidenceKinds: [] };

/** A launch-readiness artifact as the resolver receives it. */
function launchArtifact(findings = [], overrides = {}) {
  return {
    ref: '.app-builder/gate-evidence/launch-readiness.json',
    hash: 'sha256:aaa',
    projectId: 'project-1',
    value: { schemaVersion: 1, compositionHash: BUILD_REF, predictedManualEdits: findings.length, findings, ...overrides },
  };
}

function assetArtifact(findings = [], published = 3) {
  return {
    ref: '.app-builder/gate-evidence/asset-rights.json',
    hash: 'sha256:bbb',
    projectId: 'project-1',
    value: { schemaVersion: 1, compositionHash: BUILD_REF, published, findings },
  };
}

function lintArtifact(findings = []) {
  return {
    ref: '.app-builder/gate-evidence/design-lint.json',
    hash: 'sha256:ccc',
    projectId: 'project-1',
    value: { schemaVersion: 1, compositionHash: BUILD_REF, findings, counts: { violation: 0, warning: 0, recommendation: 0 } },
  };
}

function resolveProvenance(artifacts, build = BUILD) {
  return resolveGateResults({ gates: GATES, requiredGates: ['provenance'], registry: REGISTRY, artifacts, build });
}

// ---------------------------------------------------------------------------
// The registry itself.
// ---------------------------------------------------------------------------

test('the committed registry is consistent with the gate registry', () => {
  const summary = assertProducerRegistry(REGISTRY, GATES);
  assert.ok(summary.producerCount > 0);
  assert.ok(summary.checkCount > 0);
  // Everything declared answers a check some registered gate actually names.
  for (const entry of Object.values(REGISTRY.checks)) {
    assert.ok(GATES[entry.gate].deterministicChecks.includes(entry.id));
  }
});

test('the registry refuses a check that no gate names, an unknown gate and an unknown producer', () => {
  const withUnnamedCheck = { ...REGISTRY, checks: { ...REGISTRY.checks, 'made-up-check': { id: 'made-up-check', gate: 'provenance', producer: 'launch-readiness' } } };
  assert.throws(() => assertProducerRegistry(withUnnamedCheck, GATES), /does not declare check made-up-check/);

  const wrongGate = { ...REGISTRY, checks: { ...REGISTRY.checks, 'fact-provenance-check': { ...REGISTRY.checks['fact-provenance-check'], gate: 'no-such-gate' } } };
  assert.throws(() => assertProducerRegistry(wrongGate, GATES), /unregistered gate: no-such-gate/);

  const wrongProducer = { ...REGISTRY, checks: { ...REGISTRY.checks, 'fact-provenance-check': { ...REGISTRY.checks['fact-provenance-check'], producer: 'no-such-producer' } } };
  assert.throws(() => assertProducerRegistry(wrongProducer, GATES), /unregistered producer: no-such-producer/);
});

test('a check whose key and declared id disagree is a mismatched declaration, not a rename', () => {
  const mismatched = { ...REGISTRY, checks: { ...REGISTRY.checks, 'asset-rights-check': { ...REGISTRY.checks['asset-rights-check'], id: 'fact-provenance-check' } } };
  assert.throws(() => assertProducerRegistry(mismatched, GATES), /check asset-rights-check declares id fact-provenance-check/);
});

test('one gate cannot carry the same check twice, however it is spelled', () => {
  // Object keys cannot collide, so the duplicate arrives as two entries whose
  // declared gate and id are the same pair — which is the shape that would let
  // two producers disagree and read order decide.
  const duplicated = {
    ...REGISTRY,
    checks: {
      ...REGISTRY.checks,
      'design-lint': { ...REGISTRY.checks['design-lint'] },
      'design-system-lint': { ...REGISTRY.checks['design-system-lint'], gate: 'visual', id: 'design-lint' },
    },
  };
  assert.throws(() => assertProducerRegistry(duplicated, GATES), /declares id design-lint|declared twice/);
});

// ---------------------------------------------------------------------------
// Deciding one check.
// ---------------------------------------------------------------------------

test('a clean artifact passes its check and carries its own reference and hash', () => {
  const { results, resolutions } = resolveProvenance({
    'launch-readiness': launchArtifact([{ check: 'missing-page-purpose', detail: 'no purpose' }]),
    'asset-rights': assetArtifact([]),
  });
  assert.equal(results.provenance.status, 'pass');
  const [gate] = resolutions;
  assert.deepEqual(gate.checks.map((check) => check.status), ['pass', 'pass']);
  assert.deepEqual(gate.evidence.map((entry) => entry.checkId), ['fact-provenance-check', 'asset-rights-check']);
  for (const entry of gate.evidence) assert.match(entry.hash, /^sha256:/);
});

test('a planted provenance finding fails the gate and names the finding, not the file', () => {
  const { results, resolutions } = resolveProvenance({
    'launch-readiness': launchArtifact([
      { check: 'generated-claim-without-source', detail: 'Trusted by hundreds of clients' },
    ]),
    'asset-rights': assetArtifact([]),
  });
  assert.equal(results.provenance.status, 'fail');
  assert.deepEqual(results.provenance.failingCriteria, ['fact-provenance-check']);
  assert.match(resolutions[0].checks[0].detail, /generated-claim-without-source: Trusted by hundreds/);
});

test('a planted asset-rights finding fails the gate', () => {
  const { results } = resolveProvenance({
    'launch-readiness': launchArtifact([]),
    'asset-rights': assetArtifact([{ check: 'published-without-rights', detail: 'rightsStatus is unknown' }]),
  });
  assert.equal(results.provenance.status, 'fail');
  assert.deepEqual(results.provenance.failingCriteria, ['asset-rights-check']);
});

test('a finding the check does not name never fails it', () => {
  // `no-publishable-imagery` is a real launch-readiness finding and a real
  // product problem. It is not a provenance defect, and a gate that failed on
  // every finding its producer emits would be a different gate.
  const { results } = resolveProvenance({
    'launch-readiness': launchArtifact([{ check: 'no-publishable-imagery', detail: 'nothing cleared' }]),
    'asset-rights': assetArtifact([]),
  });
  assert.equal(results.provenance.status, 'pass');
});

// ---------------------------------------------------------------------------
// Every way evidence can fail to apply. All of them are not-run.
// ---------------------------------------------------------------------------

test('missing evidence leaves the gate not-run, and says which command would produce it', () => {
  const { results, resolutions } = resolveProvenance({ 'launch-readiness': launchArtifact([]) });
  assert.equal(results.provenance.status, 'not-run');
  const missing = resolutions[0].checks.find((check) => check.id === 'asset-rights-check');
  assert.equal(missing.reason, 'artifact-missing');
  assert.match(missing.detail, /npm run gates:evidence/);
  assert.ok(resolutions[0].blockers.includes('check-not-run:asset-rights-check:artifact-missing'));
});

test('evidence for another build is refused rather than read', () => {
  const stale = assetArtifact([]);
  stale.value.compositionHash = 'composition-hash-from-the-previous-build';
  const { results, resolutions } = resolveProvenance({ 'launch-readiness': launchArtifact([]), 'asset-rights': stale });
  assert.equal(results.provenance.status, 'not-run');
  const refused = resolutions[0].checks.find((check) => check.id === 'asset-rights-check');
  assert.equal(refused.reason, 'evidence-for-another-build');
  assert.match(refused.detail, /is not this build's composition-hash-1/);
  // The refusal holds however clean the stale artifact was.
  assert.equal(refused.status, 'not-run');
});

test('evidence for another project is refused before its contents are read', () => {
  const foreign = launchArtifact([{ check: 'generated-claim-without-source', detail: 'someone else’s defect' }]);
  foreign.projectId = 'project-2';
  const { resolutions } = resolveProvenance({ 'launch-readiness': foreign, 'asset-rights': assetArtifact([]) });
  const refused = resolutions[0].checks.find((check) => check.id === 'fact-provenance-check');
  assert.equal(refused.status, 'not-run');
  assert.equal(refused.reason, 'evidence-for-another-project');
  // Not `fail`: a defect belonging to another project is not this build's.
  assert.deepEqual(resolutions[0].checks.filter((check) => check.status === 'fail'), []);
});

test('an artifact that records no build reference cannot be tied to a build', () => {
  const untied = launchArtifact([]);
  delete untied.value.compositionHash;
  const { resolutions } = resolveProvenance({ 'launch-readiness': untied, 'asset-rights': assetArtifact([]) });
  const refused = resolutions[0].checks.find((check) => check.id === 'fact-provenance-check');
  assert.equal(refused.reason, 'build-reference-missing');
});

test('an unreadable or wrongly shaped artifact is not-run, never a pass', () => {
  const unreadable = { ref: 'x.json', error: 'Unexpected end of JSON input', projectId: 'project-1', value: null };
  const { resolutions: broken } = resolveProvenance({ 'launch-readiness': unreadable, 'asset-rights': assetArtifact([]) });
  assert.equal(broken[0].checks[0].reason, 'artifact-unreadable');

  const wrongShape = launchArtifact([]);
  wrongShape.value.findings = 'not an array';
  const { resolutions: shaped } = resolveProvenance({ 'launch-readiness': wrongShape, 'asset-rights': assetArtifact([]) });
  assert.equal(shaped[0].checks[0].reason, 'artifact-unreadable');
  assert.match(shaped[0].checks[0].detail, /has no findings array/);
});

test('a check with no registered producer keeps its gate not-run', () => {
  // Chosen from the registry rather than named, so this keeps testing the
  // property as producers are added — a gate that acquires one stops being the
  // example and the next unanswered one takes its place.
  const unanswered = Object.entries(GATES).find(([, gate]) =>
    (gate.deterministicChecks ?? []).length > 0
    && (gate.deterministicChecks ?? []).every((check) => !Object.hasOwn(REGISTRY.checks, check)));
  assert.ok(unanswered, 'every declared check now has a producer, so this test has nothing left to prove and should be deleted');
  const [gateId, gate] = unanswered;

  const { results, resolutions } = resolveGateResults({
    gates: GATES, requiredGates: [gateId], registry: REGISTRY, artifacts: {}, build: BUILD,
  });
  assert.equal(results[gateId].status, 'not-run');
  assert.deepEqual(
    resolutions[0].checks.map((check) => check.reason),
    gate.deterministicChecks.map(() => 'no-registered-producer'),
  );
});

test('a gate with no deterministic check at all is not-run rather than vacuously passed', () => {
  const { results, resolutions } = resolveGateResults({
    gates: GATES, requiredGates: ['responsive'], registry: REGISTRY, artifacts: {}, build: BUILD,
  });
  assert.equal(results.responsive.status, 'not-run');
  assert.ok(resolutions[0].blockers.includes('gate-has-no-deterministic-checks'));
});

test('every refusal reason a check can carry is a declared one', () => {
  const reasons = new Set();
  const cases = [
    {},
    { 'launch-readiness': { ref: 'x', error: 'broken', value: null } },
    { 'launch-readiness': (() => { const a = launchArtifact([]); a.projectId = 'other'; return a; })() },
    { 'launch-readiness': (() => { const a = launchArtifact([]); delete a.value.compositionHash; return a; })() },
    { 'launch-readiness': (() => { const a = launchArtifact([]); a.value.compositionHash = 'other'; return a; })() },
  ];
  for (const artifacts of cases) {
    for (const check of resolveProvenance(artifacts).resolutions[0].checks) {
      if (check.reason) reasons.add(check.reason);
      assert.ok(CHECK_STATUSES.includes(check.status));
    }
  }
  for (const reason of reasons) assert.ok(EVIDENCE_REFUSALS.includes(reason), `${reason} is not a declared refusal`);
});

test('evidence integrity fails for missing, malformed, wrong-build and unresolved registered checks', () => {
  const cases = [
    { expected: 'artifact-missing', artifacts: { 'launch-readiness': launchArtifact([]) } },
    { expected: 'artifact-unreadable', artifacts: { 'launch-readiness': launchArtifact([]), 'asset-rights': { ref: 'asset.json', value: null, error: 'malformed' } } },
    { expected: 'evidence-for-another-build', artifacts: { 'launch-readiness': launchArtifact([]), 'asset-rights': assetArtifact([], 3) } },
    { expected: 'build-reference-missing', artifacts: { 'launch-readiness': launchArtifact([]), 'asset-rights': assetArtifact([], 3) } },
  ];
  cases[2].artifacts['asset-rights'].value.compositionHash = 'wrong-build';
  delete cases[3].artifacts['asset-rights'].value.compositionHash;

  for (const { expected, artifacts } of cases) {
    const { resolutions } = resolveProvenance(artifacts);
    const integrity = evaluateEvidenceIntegrity({ resolutions, registry: REGISTRY });
    assert.equal(integrity.status, 'fail', expected);
    assert.ok(integrity.failures.some((entry) => entry.reason === expected), expected);
  }
});

test('resolved product failure does not become an evidence-system failure', () => {
  const { resolutions } = resolveProvenance({
    'launch-readiness': launchArtifact([{ check: 'generated-claim-without-source', detail: 'unsupported claim' }]),
    'asset-rights': assetArtifact([]),
  });
  assert.equal(resolutions[0].status, 'fail');
  assert.deepEqual(evaluateEvidenceIntegrity({ resolutions, registry: REGISTRY }), {
    status: 'pass', lane: null, deferredToOtherLanes: [], expectedChecks: 2, resolvedChecks: 2, failures: [],
  });
});

test('a check another lane produces is deferred, and one this lane owes is still a failure', () => {
  // The registration blocker, as a rule rather than as a decision not to
  // register. `gates:evidence` builds one project and measures it; the
  // accessibility audit builds a different one. A check produced over there
  // resolving `not-run` here is not broken wiring — it is a gate measured
  // somewhere else, and treating the two the same is what kept three real
  // producers out of the registry.
  const registry = {
    producers: {
      'launch-readiness': { ...REGISTRY.producers['launch-readiness'], lane: 'gate-evidence' },
      'axe-accessibility': { id: 'axe-accessibility', command: 'npm run test:e2e:accessibility', lane: 'accessibility', artifactKind: 'AxeReport', buildRefField: 'compositionHash' },
    },
    checks: {
      'fact-provenance-check': REGISTRY.checks['fact-provenance-check'],
      'axe-serious-critical': { id: 'axe-serious-critical', gate: 'provenance', producer: 'axe-accessibility', findingsField: 'findings', findingIdField: 'check', failOnFindings: ['serious', 'critical'] },
    },
  };
  const resolutions = [{
    gateId: 'provenance',
    checks: [
      { id: 'fact-provenance-check', status: 'pass' },
      { id: 'axe-serious-critical', status: 'not-run', reason: 'evidence-for-another-build' },
    ],
  }];

  const inLane = evaluateEvidenceIntegrity({ resolutions, registry, lane: 'gate-evidence' });
  assert.equal(inLane.status, 'pass', 'a check another lane produces must not fail this lane');
  assert.equal(inLane.expectedChecks, 1);
  assert.deepEqual(inLane.deferredToOtherLanes.map((entry) => entry.checkId), ['axe-serious-critical'], 'and it is named, so deferred cannot be mistaken for covered');

  // The lane that does own it still has to produce it.
  const owning = evaluateEvidenceIntegrity({ resolutions, registry, lane: 'accessibility' });
  assert.equal(owning.status, 'fail');
  assert.deepEqual(owning.failures.map((entry) => entry.checkId), ['axe-serious-critical']);

  // And with no lane declared, nothing is deferred — the stricter reading,
  // which is the right default for a caller that has not said what it ran.
  const unscoped = evaluateEvidenceIntegrity({ resolutions, registry });
  assert.equal(unscoped.status, 'fail');
  assert.deepEqual(unscoped.deferredToOtherLanes, []);
});

test('a producer that does not say which lane makes it is refused', () => {
  const registry = {
    producers: { p: { id: 'p', command: 'npm run x', artifactKind: 'R', buildRefField: 'compositionHash' } },
    checks: {},
  };
  assert.throws(() => assertProducerRegistry(registry, GATES), /Producer p lane is required/);
});

// ---------------------------------------------------------------------------
// What deterministic evidence may never buy.
// ---------------------------------------------------------------------------

test('a gate wanting an independent reviewer stays not-run however clean its checks are', () => {
  const { results, resolutions } = resolveGateResults({
    gates: GATES, requiredGates: ['visual'], registry: REGISTRY, artifacts: { 'design-lint': lintArtifact([]) }, build: BUILD,
  });
  assert.equal(resolutions[0].checks[0].status, 'pass');
  assert.equal(results.visual.status, 'not-run');
  assert.ok(resolutions[0].blockers.includes('independent-verdict-missing'));
});

test('a supplied verdict decides the gate, and its score is what the minimum is held against', () => {
  const artifacts = { 'design-lint': lintArtifact([]) };
  const build = { ...BUILD, evidenceKinds: ['RenderedEvidence', 'DesignLintReport'] };
  const passing = resolveGateResults({
    gates: GATES, requiredGates: ['visual'], registry: REGISTRY, artifacts, build,
    verdicts: { visual: { status: 'pass', score: 9, verdictId: 'verdict-1' } },
  });
  assert.equal(passing.results.visual.status, 'pass');
  assert.equal(passing.results.visual.score, 9);

  // The minimum lives in the gate registry and is applied by evaluateConvergence,
  // so a below-bar verdict cannot be recorded as a pass by supplying one.
  const below = resolveGateResults({
    gates: GATES, requiredGates: ['visual'], registry: REGISTRY, artifacts, build,
    verdicts: { visual: { status: 'pass', score: 4, verdictId: 'verdict-2' } },
  });
  const report = evaluateConvergence({
    projectId: 'project-1',
    pipeline: { id: 'p', requiredGates: ['visual'], reworkOverrides: {} },
    gates: GATES,
    results: below.results,
  }, '2026-08-27T00:00:00.000Z');
  assert.equal(report.gates[0].status, 'fail');
  assert.ok(report.gates[0].failingCriteria.some((entry) => entry.startsWith('score-below-minimum')));
  assert.equal(evaluateEvidenceIntegrity({ resolutions: below.resolutions, registry: REGISTRY }).status, 'pass');
});

test('a gate whose required evidence is absent has nothing for a reviewer to look at', () => {
  const { results, resolutions } = resolveGateResults({
    gates: GATES, requiredGates: ['visual'], registry: REGISTRY,
    artifacts: { 'design-lint': lintArtifact([]) },
    build: { ...BUILD, evidenceKinds: ['DesignLintReport'] },
    verdicts: { visual: { status: 'pass', score: 9, verdictId: 'verdict-1' } },
  });
  assert.equal(results.visual.status, 'not-run');
  assert.ok(resolutions[0].blockers.includes('missing-evidence:RenderedEvidence'));
});

// ---------------------------------------------------------------------------
// The whole marketing-site pipeline, through the real convergence contract.
// ---------------------------------------------------------------------------

test('one measured gate does not converge a pipeline of eighteen', () => {
  const pipeline = PIPELINES.pipelines['marketing-site'];
  const { results, resolutions } = resolveGateResults({
    gates: GATES,
    requiredGates: pipeline.requiredGates,
    registry: REGISTRY,
    artifacts: { 'launch-readiness': launchArtifact([]), 'asset-rights': assetArtifact([]), 'design-lint': lintArtifact([]) },
    build: BUILD,
  });
  const report = evaluateConvergence({ projectId: 'project-1', pipeline, gates: GATES, results }, '2026-08-27T00:00:00.000Z');

  assert.equal(results.provenance.status, 'pass');
  assert.equal(report.converged, false);
  assert.equal(report.stopReason, 'gate-not-run');

  const summary = summariseResolutions(resolutions);
  assert.equal(summary.gates, 18);
  assert.equal(summary.passed, 1);
  assert.deepEqual(summary.everyCheckAnswered, ['design-system', 'visual', 'provenance']);
  assert.deepEqual(summary.awaitingIndependentVerdict, ['design-system', 'visual']);
});

test('a failing measured gate routes rework to the role that owns it', () => {
  const pipeline = PIPELINES.pipelines['marketing-site'];
  const { results } = resolveGateResults({
    gates: GATES,
    requiredGates: pipeline.requiredGates,
    registry: REGISTRY,
    artifacts: {
      'launch-readiness': launchArtifact([{ check: 'declared-proof-missing', detail: 'the case study has no source' }]),
      'asset-rights': assetArtifact([]),
      'design-lint': lintArtifact([]),
    },
    build: BUILD,
  });
  const report = evaluateConvergence({ projectId: 'project-1', pipeline, gates: GATES, results }, '2026-08-27T00:00:00.000Z');
  const routed = report.rework.find((entry) => entry.gateId === 'provenance');
  // The pipeline's own override wins over the gate's default, which is the
  // whole reason `reworkOverrides` exists: who fixes a provenance defect on a
  // marketing site is not who fixes one everywhere.
  assert.equal(routed.role, pipeline.reworkOverrides.provenance);
  assert.notEqual(pipeline.reworkOverrides.provenance, GATES.provenance.defaultReworkRole);
  assert.deepEqual(routed.reasons, ['fact-provenance-check']);
  // Rework outranks the unrun gates in the stop reason: something is wrong now.
  assert.equal(report.stopReason, 'rework-required');
});

// ---------------------------------------------------------------------------
// The asset-rights producer itself, against its real implementation.
// ---------------------------------------------------------------------------

test('the asset-rights audit passes only what was cleared, and says how much it looked at', () => {
  const cleared = auditAssetRights({
    assets: { 'asset-1': { id: 'asset-1', kind: 'image', rightsStatus: 'approved-for-use', assetStatus: 'approved', variants: [{}] } },
    compositionHash: BUILD_REF,
  });
  assert.equal(cleared.clean, true);
  assert.equal(cleared.published, 1);
  assert.equal(cleared.compositionHash, BUILD_REF);

  const unrighted = auditAssetRights({
    assets: { 'asset-2': { id: 'asset-2', kind: 'image', rightsStatus: 'reference-only', assetStatus: 'approved', variants: [{}] } },
    compositionHash: BUILD_REF,
  });
  assert.deepEqual(unrighted.findings.map((finding) => finding.check), ['published-without-rights']);
  assert.match(unrighted.findings[0].detail, /reference-only/);

  const refused = auditAssetRights({
    assets: { 'asset-3': { id: 'asset-3', kind: 'image', rightsStatus: 'approved-for-use', assetStatus: 'do-not-use', variants: [{}] } },
    compositionHash: BUILD_REF,
  });
  assert.deepEqual(refused.findings.map((finding) => finding.check), ['published-while-rejected']);

  // An asset with no rights recorded at all is not a pass by omission.
  const silent = auditAssetRights({ assets: { 'asset-4': { id: 'asset-4', kind: 'image' } }, compositionHash: BUILD_REF });
  assert.deepEqual(silent.findings.map((finding) => finding.check), ['published-without-rights']);

  // Publishing nothing is clean and says so, which is a different claim.
  const empty = auditAssetRights({ assets: {}, compositionHash: BUILD_REF });
  assert.equal(empty.clean, true);
  assert.equal(empty.published, 0);
});

test('evidence that names a different artifact revision is refused, and evidence that names none is reported as unbound', () => {
  // A composition hash is not an artifact: two builds of one composition can
  // install different graphs and produce different bytes and both carry it. So
  // a producer that records which artifact revision it measured gets the
  // stronger check, and one that does not is read as before and marked.
  const check = { id: 'c', gate: 'g', producer: 'p', findingsField: 'findings', findingIdField: 'check', failOnFindings: ['bad'] };
  const producer = { id: 'p', command: 'npm run gates:evidence', artifactKind: 'R', buildRefField: 'compositionHash' };
  const build = { projectId: 'project-1', buildRef: 'composition-1', artifactRevisionId: 'revision-1' };
  const artifact = (extra) => ({ ref: '.app-builder/x.json', projectId: 'project-1', value: { compositionHash: 'composition-1', findings: [], ...extra } });

  const bound = decideCheck({ check, producer, artifact: artifact({ artifactRevisionId: 'revision-1' }), build });
  assert.equal(bound.status, 'pass');
  assert.equal(bound.boundToArtifact, true);

  const elsewhere = decideCheck({ check, producer, artifact: artifact({ artifactRevisionId: 'revision-2' }), build });
  assert.equal(elsewhere.status, 'not-run');
  assert.equal(elsewhere.reason, 'evidence-for-another-artifact-revision');
  assert.equal(elsewhere.boundToArtifact, false);

  const legacy = decideCheck({ check, producer, artifact: artifact({}), build });
  assert.equal(legacy.status, 'pass', 'a producer that predates artifact binding still answers its gate');
  assert.equal(legacy.boundToArtifact, false, 'and says it was not bound, so a promotion rule can tell the difference');

  // With no artifact revision in play at all, nothing is bound and nothing is
  // refused for not being bound.
  const unversioned = decideCheck({ check, producer, artifact: artifact({ artifactRevisionId: 'revision-2' }), build: { projectId: 'project-1', buildRef: 'composition-1' } });
  assert.equal(unversioned.status, 'pass');
  assert.equal(unversioned.boundToArtifact, false);
});
