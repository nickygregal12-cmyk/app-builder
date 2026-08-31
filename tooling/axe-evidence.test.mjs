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
 * The real registration, read from the registry rather than restated here.
 *
 * It was unregisterable until #251. `evaluateEvidenceIntegrity` used to fail on
 * any registered check that resolved `not-run`, and `npm run gates:evidence`
 * exits non-zero when integrity fails — so a check whose producer builds a
 * different project would have taken CI down on every run. #251 made integrity
 * ask whether the lane that ran completed its own evidence, and named that as
 * what kept three real producers unregistered. This is one of the three.
 *
 * Read from the file so a test cannot pass against a registration that does not
 * exist. An earlier version of these tests held a copy of the intended entry,
 * which was right while there was nothing to read and would now be a fixture
 * agreeing with itself.
 */
const INTENDED_PRODUCER = REGISTRY.producers['axe-accessibility'];
const INTENDED_CHECK = REGISTRY.checks['axe-serious-critical'];
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

test('axe-serious-critical is registered, in its own lane, and no longer listed as unanswered', () => {
  assert.ok(!REGISTRY.unregistered.checks.includes('axe-serious-critical'));
  assert.equal(INTENDED_CHECK.gate, 'accessibility');

  // Its own lane is the whole reason it can be registered. A producer in the
  // gate-evidence lane would have to answer for the project that command
  // builds, and this one builds and serves its own.
  assert.equal(INTENDED_PRODUCER.lane, 'accessibility');
  assert.notEqual(INTENDED_PRODUCER.lane, 'gate-evidence');

  // The other two are still open, and saying so is the point of the list.
  assert.deepEqual(REGISTRY.unregistered.checks, ['e2e-tests', 'executed-rls-acceptance']);
});

test('the gate-evidence lane defers this check rather than failing on it', async () => {
  const { evaluateEvidenceIntegrity } = await import('@app-builder/control-plane/gate-evidence');
  // The accessibility gate resolved with its check not-run, exactly as it would
  // be in a gates:evidence run that never produced an axe artifact.
  const resolutions = [{ gateId: 'accessibility', checks: [{ id: 'axe-serious-critical', status: 'not-run', reason: 'artifact-missing' }] }];

  const own = evaluateEvidenceIntegrity({ resolutions, registry: REGISTRY, lane: 'accessibility' });
  assert.equal(own.status, 'fail', 'its own lane must still be answerable for it');

  const other = evaluateEvidenceIntegrity({ resolutions, registry: REGISTRY, lane: 'gate-evidence' });
  assert.ok(other.deferredToOtherLanes.some((entry) => entry.checkId === 'axe-serious-critical'));
  assert.ok(
    !other.failures.some((entry) => entry.checkId === 'axe-serious-critical'),
    'the gate-evidence lane was held responsible for a check another lane produces',
  );
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
