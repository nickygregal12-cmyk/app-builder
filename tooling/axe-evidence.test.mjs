/**
 * The accessibility artifact, and the ways it could quietly overclaim.
 *
 * Two of these matter more than the rest. A lane that audited nothing must not
 * produce a passing check, and a lane that lost one of its two viewports must
 * not report a complete result over half its population. Both are the same
 * mistake — a true statement about the wrong population — and both are the
 * mistake `tests/accessibility/routes.ts` already carries a scar from.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { BLOCKING_IMPACTS, NOT_AUDITED, compileAxeReport } from './lib/axe-evidence.mjs';
import { assertProducerRegistry, decideCheck } from '@app-builder/control-plane/gate-evidence';

const REGISTRY = JSON.parse(fs.readFileSync('config/gate-producers.json', 'utf8'));
const PIPELINES = JSON.parse(fs.readFileSync('config/agent-pipelines.json', 'utf8'));
const BUILD = 'sha256:composition';

/**
 * The registration this artifact is shaped for, held here rather than in
 * `config/gate-producers.json`.
 *
 * It is not registered yet, and the reason is a fact about the two commands
 * rather than about this file. `evaluateEvidenceIntegrity` fails on any
 * registered check that resolves `not-run`, and `npm run gates:evidence` exits
 * non-zero when integrity fails. That command builds the NBM project; this lane
 * audits the generated acceptance marketing site. Two builds, two composition
 * hashes — so a registered `axe-serious-critical` would resolve to
 * `evidence-for-another-build` on every run and take CI down with it.
 *
 * Registering it therefore needs the two lanes to agree on one build first,
 * which is a decision about what the accessibility gate measures and not
 * something a producer entry can paper over. Until then the check stays in
 * `unregistered`, honestly, and these tests hold the artifact to the contract it
 * will have to satisfy on the day it is registered.
 */
const INTENDED_PRODUCER = {
  id: 'axe-accessibility',
  command: 'npm run test:e2e:accessibility',
  artifactKind: 'AccessibilityReport',
  artifact: '.app-builder/accessibility/report.json',
  buildRefField: 'compositionHash',
};
const INTENDED_CHECK = {
  id: 'axe-serious-critical',
  gate: 'accessibility',
  producer: 'axe-accessibility',
  findingsField: 'findings',
  findingIdField: 'impact',
  failOnFindings: ['critical', 'serious'],
  coverageField: 'auditsRecorded',
  coverageLabel: 'route/viewport pairs audited',
};
const VIEWPORTS = ['desktop-chromium', 'mobile-chromium'];
const ROUTES = [{ route: '/', pageId: 'home' }, { route: '/contact', pageId: 'contact' }];

/** A full grid of clean audits: both routes, both viewports, nothing found. */
function cleanMeasurements() {
  return VIEWPORTS.flatMap((viewport) => ROUTES.map(({ route, pageId }) => ({ route, pageId, viewport, violations: [] })));
}

function decide(report) {
  return decideCheck({
    check: INTENDED_CHECK,
    producer: INTENDED_PRODUCER,
    artifact: { ref: '.app-builder/accessibility/report.json', hash: 'sha256:x', value: report, projectId: null },
    build: { buildRef: BUILD },
  });
}

// --- The registry itself -------------------------------------------------------

test('the check this artifact answers is one the accessibility gate really declares', () => {
  assertProducerRegistry(REGISTRY, PIPELINES.gates);
  assert.ok(PIPELINES.gates[INTENDED_CHECK.gate].deterministicChecks.includes(INTENDED_CHECK.id));
  assert.ok(PIPELINES.gates[INTENDED_CHECK.gate].requiredEvidence.includes(INTENDED_PRODUCER.artifactKind));
});

test('axe-serious-critical is still recorded as unanswered, because it still is', () => {
  // The artifact exists now and nothing reads it, and the registry says so.
  // Removing it from this list before the two lanes share a build would make
  // the list a survey rather than a record of gaps.
  assert.ok(REGISTRY.unregistered.checks.includes('axe-serious-critical'));
  assert.equal(REGISTRY.checks['axe-serious-critical'], undefined);
});

test('the accessibility gate would still want a person even with this check passing', () => {
  // Stated as a test because it is the thing most likely to be forgotten when
  // somebody finally registers the producer and sees a green check.
  assert.equal(PIPELINES.gates.accessibility.requiresIndependentReviewer, true);
});

// --- Impact is used the way axe means it ------------------------------------------

test('a serious or critical violation fails the check; moderate and minor do not', () => {
  for (const impact of BLOCKING_IMPACTS) {
    const measurements = cleanMeasurements();
    measurements[0].violations = [{ id: 'color-contrast', impact, help: 'Elements must have sufficient colour contrast', nodes: [{}] }];
    const decided = decide(compileAxeReport({ measurements, declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD }));
    assert.equal(decided.status, 'fail', `${impact} did not fail the check`);
  }

  for (const impact of ['moderate', 'minor']) {
    const measurements = cleanMeasurements();
    measurements[0].violations = [{ id: 'landmark-one-main', impact, help: 'Document should have one main landmark', nodes: [{}] }];
    const report = compileAxeReport({ measurements, declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });
    assert.equal(decide(report).status, 'pass', `${impact} failed the check`);
    // Recorded even though it does not fail. A finding nobody can see is a
    // finding nobody will fix.
    assert.equal(report.findings.filter((finding) => finding.impact === impact).length, 1);
  }
});

// --- The population is part of the claim --------------------------------------------

test('a route the composition declares and the lane never audited fails the check', () => {
  const measurements = cleanMeasurements().filter((entry) => entry.route !== '/contact');
  const report = compileAxeReport({ measurements, declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });

  assert.equal(report.notAudited.length, 2, 'both viewports lost /contact and both should be recorded');
  assert.equal(report.findings.filter((finding) => finding.rule === NOT_AUDITED).length, 2);

  const decided = decide(report);
  assert.equal(decided.status, 'fail');
  // The failure detail names the route rather than the rule id, because the
  // decision rule keys on impact. What a reader needs is which page went
  // unaudited, and that is what it says.
  assert.match(decided.detail, /\/contact/);
});

test('a lane that lost one viewport does not report a complete result', () => {
  // Every declared route audited — on desktop only. Counting routes would call
  // this complete; counting the grid does not.
  const measurements = cleanMeasurements().filter((entry) => entry.viewport === 'desktop-chromium');
  const report = compileAxeReport({ measurements, declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });

  assert.equal(report.routesAudited, ROUTES.length);
  assert.equal(report.auditsRecorded, 2);
  assert.equal(report.auditsExpected, 4);
  assert.equal(decide(report).status, 'fail');
  assert.ok(report.notAudited.every((entry) => entry.viewport === 'mobile-chromium'));
});

test('a lane that audited nothing produces findings rather than a clean pass', () => {
  const report = compileAxeReport({ measurements: [], declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });
  assert.equal(report.auditsRecorded, 0);
  assert.equal(decide(report).status, 'fail');
});

// --- Evidence belongs to one build ------------------------------------------------

test('a clean full-grid audit passes, and carries the coverage it earned', () => {
  const report = compileAxeReport({ measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });
  const decided = decide(report);

  assert.equal(decided.status, 'pass');
  assert.deepEqual(decided.coverage, { label: 'route/viewport pairs audited', value: 4 });
});

test('evidence from another build is refused rather than read', () => {
  const report = compileAxeReport({ measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: 'sha256:some-other-build' });
  const decided = decide(report);

  assert.equal(decided.status, 'not-run');
  assert.equal(decided.reason, 'evidence-for-another-build');
});

test('evidence bound to no build is refused rather than read', () => {
  const report = compileAxeReport({ measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: null });
  const decided = decide(report);

  assert.equal(decided.status, 'not-run');
  assert.equal(decided.reason, 'build-reference-missing');
});

test('a missing artifact is not-run with a reason, never a pass by omission', () => {
  const decided = decideCheck({
    check: INTENDED_CHECK,
    producer: INTENDED_PRODUCER,
    artifact: null,
    build: { buildRef: BUILD },
  });

  assert.equal(decided.status, 'not-run');
  assert.equal(decided.reason, 'artifact-missing');
});

// --- What the artifact refuses to claim ---------------------------------------------

test('the report states what an automated pass does not prove', () => {
  const report = compileAxeReport({ measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });

  assert.equal(report.depictsShippingArtifact, false);
  assert.equal(report.serverMode, 'development');
  assert.ok(report.doesNotProve.some((sentence) => sentence.startsWith('Conformance.')));
  assert.ok(report.doesNotProve.some((sentence) => sentence.includes('assistive technology')));
});

// --- Which part of the artifact this is evidence about ------------------------------

test('a dev-server audit names the source and lock it served, and refuses the output', () => {
  const report = compileAxeReport({
    measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD,
    boundTo: { sourceDigest: 'a'.repeat(64), lockDigest: 'b'.repeat(64) },
  });

  assert.deepEqual(report.measuredAgainst, ['lockDigest', 'sourceDigest']);
  assert.equal(report.boundTo.sourceDigest, 'a'.repeat(64));

  // The component it must never claim. Naming it would file a dev-server audit
  // as evidence about a shipping artifact.
  assert.ok(!report.measuredAgainst.includes('outputDigest'));
  const refused = report.notMeasuredAgainst.find((entry) => entry.component === 'outputDigest');
  assert.ok(refused, 'outputDigest is absent rather than refused, so its absence reads as an oversight');
  assert.match(refused.reason, /Nothing was built/);
});

test('the components this report names are ones the evidence contract recognises', async () => {
  const { EVIDENCE_BOUND_COMPONENTS } = await import('@app-builder/control-plane/artifact-evidence');
  const report = compileAxeReport({
    measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD,
    boundTo: { sourceDigest: 'a'.repeat(64), lockDigest: 'b'.repeat(64) },
  });

  for (const component of [...report.measuredAgainst, ...report.notMeasuredAgainst.map((entry) => entry.component)]) {
    assert.ok(EVIDENCE_BOUND_COMPONENTS.includes(component), `${component} is not an identity component evidence can be measured against`);
  }
});

test('a digest the lane could not compute is null and is not claimed as measured', () => {
  const report = compileAxeReport({
    measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD,
    boundTo: { sourceDigest: 'a'.repeat(64), lockDigest: null },
  });

  assert.deepEqual(report.measuredAgainst, ['sourceDigest']);
  assert.equal(report.boundTo.lockDigest, null, 'an uncomputable digest must be recorded as null rather than dropped');
});

test('a report with no digests at all claims to be measured against nothing', () => {
  // `bindArtifactEvidence` refuses evidence that names nothing rather than
  // reading it as being about everything. This report must be refusable the
  // same way instead of quietly claiming coverage it does not have.
  const report = compileAxeReport({ measurements: cleanMeasurements(), declaredRoutes: ROUTES, viewports: VIEWPORTS, compositionHash: BUILD });
  assert.deepEqual(report.measuredAgainst, []);
  assert.equal(report.boundTo, null);
});
