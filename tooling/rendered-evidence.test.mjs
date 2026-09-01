import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import { composeProject } from '../packages/composition/src/index.js';
import { deriveJourneys, deriveStateMatrix } from './lib/launch-readiness.mjs';
import { compileMotionContract } from './lib/motion-contract.mjs';

const launchRules = JSON.parse(fs.readFileSync('config/launch-readiness-rules.json', 'utf8'));

/**
 * Every evidence set has to declare what was serving when it was captured.
 *
 * These cases are about capture bookkeeping — hashing, dropping what failed,
 * refusing degenerate routes — rather than about provenance, so they declare
 * the honest thing a real run declares: a named, hashed built artifact.
 * `tooling/rendering-source.test.mjs` is where the declaration itself is tested.
 */
const BUILT_ARTIFACT = Object.freeze({
  serverMode: 'built-artifact',
  artifact: 'dist',
  artifactHash: 'b'.repeat(64),
  fileCount: 2,
  depictsShippingArtifact: true,
  detail: 'Fixture: captured against a built artifact.',
});

import { INTERACTIONS, VIEWPORTS, applyEvidenceToStateMatrix, buildEvidenceSet, captureFile, deriveEvidencePlan, findDegenerateRouteCaptures } from './lib/rendered-evidence.mjs';
import { captureEvidence } from './lib/rendered-evidence-capture.mjs';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { readJson } from './lib/manifest.mjs';

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

function manifest(slug, modules = {}) {
  return {
    schemaVersion: 2,
    project: { name: 'Evidence Test', slug, type: 'marketing-site', primaryGoal: 'Prove what the build actually renders.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Evidence Test' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules,
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function planFor(projectManifest = readJson('examples/project-manifest.example.json')) {
  const composition = composeProject({ manifest: projectManifest });
  return { composition, plan: deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, launchRules) }) };
}

function fakeResults(plan) {
  return plan.captures.map((capture, index) => ({ id: capture.id, bytes: Buffer.from(`png-${capture.id}-${index}`) }));
}

// The evidence widths and the Console's preview widths are the same fact held
// in two languages, so neither file can import the other. The invariant is
// therefore asserted rather than shared: without this, changing one width
// leaves the other silently behind and a reviewer approves a rendering nobody
// photographed. The existing viewport tests do not catch that — they assert
// viewport *names* and coverage, never dimensions.
test('the Console previews at exactly the widths the factory photographs', () => {
  const workspace = fs.readFileSync('apps/console/src/workspace/BuilderWorkspace.tsx', 'utf8');
  const declaration = workspace.match(/const deviceWidth: Record<Device, number> = \{([^}]*)\}/);
  assert.ok(declaration, 'BuilderWorkspace must declare deviceWidth for this invariant to be checkable');
  const consoleWidths = Object.fromEntries(
    declaration[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name, width] = entry.split(':').map((part) => part.trim());
        return [name, Number(width)];
      }),
  );
  const evidenceWidths = Object.fromEntries(VIEWPORTS.map((viewport) => [viewport.name, viewport.width]));
  assert.deepEqual(
    consoleWidths,
    evidenceWidths,
    'BuilderWorkspace deviceWidth drifted from VIEWPORTS: the preview someone reviews would not be the rendering the factory captured',
  );
});

test('every route is planned at every viewport', () => {
  const { composition, plan } = planFor();
  assert.deepEqual(plan.viewports.map((viewport) => viewport.name), ['desktop', 'tablet', 'mobile']);
  for (const page of composition.pages) {
    for (const viewport of VIEWPORTS) {
      const capture = plan.captures.find((entry) => entry.route === page.path && entry.viewport === viewport.name && entry.state.axis === 'viewport');
      assert.ok(capture, `no ${viewport.name} capture planned for ${page.path}`);
      assert.equal(capture.pageId, page.id);
      assert.match(capture.state.proves, /not evidence that anything on the page works/);
    }
  }
  assert.equal(new Set(plan.captures.map((entry) => entry.id)).size, plan.captures.length, 'capture ids must be unique');
});

test('planning is deterministic', () => {
  assert.deepEqual(planFor().plan, planFor().plan);
});

test('a write state is never planned as a capture and says why', () => {
  const { plan } = planFor(manifest('write-states', { 'lead-generation': true }));
  const writes = plan.uncovered.filter((entry) => entry.axis === 'write');
  assert.ok(writes.length > 0, 'the marketing example has a conversion surface, so write states exist');
  for (const entry of writes.filter((item) => item.state !== 'failed')) {
    assert.equal(entry.reason, 'not-visually-provable');
    assert.match(entry.detail, /executable journey evidence/);
  }
  assert.equal(plan.captures.some((capture) => capture.state.axis === 'write' && capture.state.state === 'succeeded'), false, 'a picture must never claim a write succeeded');
});

test('data and content states are recorded as needing a fixture rather than omitted', () => {
  const { composition, plan } = planFor(manifest('fixture-states', { 'lead-generation': true }));
  const matrix = deriveStateMatrix(composition, launchRules);
  const declared = matrix.flatMap((surface) => surface.states
    .filter((entry) => entry.axis !== 'viewport')
    .map((entry) => `${surface.page}::${entry.axis}::${entry.state}`));
  const accounted = new Set([
    ...plan.uncovered.map((entry) => `${entry.route}::${entry.axis}::${entry.state}`),
    ...plan.captures.map((capture) => `${capture.route}::${capture.state.axis}::${capture.state.state}`),
  ]);
  for (const entry of declared) assert.ok(accounted.has(entry), `state ${entry} is neither captured nor declared uncovered`);
  for (const entry of plan.uncovered.filter((item) => ['data', 'content'].includes(item.axis))) {
    assert.equal(entry.reason, 'needs-a-deterministic-fixture');
  }
});

test('an interaction state is planned only where the build has the section for it', () => {
  const withoutForm = deriveEvidencePlan({
    composition: composeProject({ manifest: manifest('no-form') }),
    stateMatrix: deriveStateMatrix(composeProject({ manifest: manifest('no-form') }), launchRules),
  });
  assert.equal(withoutForm.captures.some((capture) => capture.state.interaction === 'enquiry-submit-failed'), false);

  const composition = composeProject({ manifest: manifest('with-form', { 'lead-generation': true }) });
  const withForm = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, launchRules) });
  const interactions = withForm.captures.filter((capture) => capture.state.interaction === 'enquiry-submit-failed');
  assert.equal(interactions.length, VIEWPORTS.length, 'the failure state is worth seeing at every viewport');
  assert.match(interactions[0].state.proves, /not evidence that a successful submission works/);
  assert.equal(INTERACTIONS['enquiry-submit-failed'].requiresSectionType, 'enquiry-form');
});

/**
 * The header is not a section, so it qualifies by viewport instead.
 *
 * Every capture in every set photographed the navigation closed, and the
 * seventh independent review asked for the opened state before calling
 * responsive navigation complete. It is on every route, so it cannot be gated
 * on a section type; and it exists only below the disclosure width, so a
 * desktop picture of a bar that never collapsed would prove nothing.
 */
test('the disclosed navigation is planned on every route, and only where it discloses', () => {
  const composition = composeProject({ manifest: manifest('no-form') });
  const plan = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, launchRules) });
  const opened = plan.captures.filter((capture) => capture.state.interaction === 'navigation-disclosed');

  assert.equal(INTERACTIONS['navigation-disclosed'].requiresSectionType, null, 'the header is on every route, not in a section');
  // One still per route. No motion contract was supplied, so no presentation has declared that it
  // moves the panel, and nothing temporal is planned.
  const stills = opened.filter((capture) => !capture.state.sequence);
  assert.equal(stills.length, composition.pages.length, 'every route should photograph its own navigation panel');
  assert.equal(opened.length, stills.length, 'nothing declared movement, so nothing temporal is planned');
  assert.deepEqual([...new Set(opened.map((capture) => capture.viewport))], ['mobile'], 'the panel only exists below the disclosure width');
  assert.equal(opened.every((capture) => capture.state.risk === 'high'), true);
  assert.match(stills[0].state.proves, /not evidence that any destination in it resolves/);
});

test('an evidence set validates, hashes what was captured and drops what was not', () => {
  const { composition, plan } = planFor();
  /*
   * Dropped from the plain viewport captures on purpose. A declared interaction
   * that produces no bytes is a refusal rather than a gap — see the test below —
   * so this exercises the case that legitimately degrades: a page state the run
   * simply did not reach.
   */
  const droppable = plan.captures.filter((capture) => !capture.state.interaction).slice(-2);
  const results = fakeResults(plan).filter((result) => !droppable.some((capture) => capture.id === result.id));
  const evidence = buildEvidenceSet({
    plan,
    results,
    projectId: 'project-evidence',
    buildRef: '/workspaces/evidence',
    compositionHash: composition.compositionHash,
    capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT,
  });

  assert.deepEqual(validateContract('rendered-evidence', evidence), []);
  assert.equal(evidence.captures.length, results.length, 'a planned capture with no bytes is not recorded');
  assert.equal(evidence.captures.every((capture) => capture.evidenceKind === 'visual'), true);
  for (const capture of evidence.captures) assert.equal(capture.file, captureFile(capture.id));
  for (const capture of droppable) {
    assert.ok(
      evidence.uncovered.some((entry) => entry.route === capture.route && entry.state === capture.state.state && entry.detail === 'Planned but not captured in this run.'),
      'a capture that did not happen is declared, not silently missing',
    );
  }
});

test('identical captures hash identically and different bytes do not', () => {
  const { composition, plan } = planFor();
  const args = { plan, projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash, capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT };
  const first = buildEvidenceSet({ ...args, results: fakeResults(plan) });
  const second = buildEvidenceSet({ ...args, results: fakeResults(plan) });
  assert.equal(first.setHash, second.setHash);
  const changed = buildEvidenceSet({ ...args, results: fakeResults(plan).map((result, index) => (index ? result : { ...result, bytes: Buffer.from('different') })) });
  assert.notEqual(changed.setHash, first.setHash);
});

test('rendered evidence raises only the states a picture settles', () => {
  const { composition, plan } = planFor();
  const evidence = buildEvidenceSet({ plan, results: fakeResults(plan), projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash, capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT });
  const matrix = applyEvidenceToStateMatrix(deriveStateMatrix(composition, launchRules), evidence);
  const states = matrix.flatMap((surface) => surface.states);

  assert.ok(states.some((entry) => entry.axis === 'viewport' && entry.evidence === 'rendered'), 'a capture at that width is the evidence for that viewport state');
  for (const entry of states.filter((item) => item.axis !== 'viewport')) {
    assert.equal(entry.evidence, 'none', `a screenshot must not raise the ${entry.axis} ${entry.state} state`);
  }
});

test('rendered evidence never answers a journey step', () => {
  // The journey has to land on a page this composition serves: a mailto: primary action leaves the
  // site, so it has no on-site steps for a capture to be mistaken for.
  const routed = manifest('journeys', { 'lead-generation': true });
  routed.company = { ...routed.company, conversionGoals: ['contact form'] };
  const composition = composeProject({ manifest: routed });
  const plan = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, launchRules) });
  const evidence = buildEvidenceSet({ plan, results: fakeResults(plan), projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash, capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT });

  // The build has an enquiry form and evidence of how it fails. That is a
  // picture of a state, not proof the enquiry arrives.
  assert.ok(evidence.captures.some((capture) => capture.state.interaction === 'enquiry-submit-failed'));
  const unproven = deriveJourneys(composition, launchRules).flatMap((journey) => journey.steps).filter((step) => step.status === 'needs-executable-evidence');
  assert.ok(unproven.length > 0);
  for (const step of unproven) {
    assert.equal(evidence.captures.some((capture) => capture.state.state === step.step), false, `a capture must not stand in for the ${step.step} step`);
  }
});

test('capture refuses an interaction that is not in the closed registry', async () => {
  const plan = {
    viewports: [{ ...VIEWPORTS[0] }],
    captures: [{ id: 'x', pageId: 'page-home', route: '/', viewport: 'desktop', state: { axis: 'write', state: 'failed', risk: 'high', interaction: 'run-anything', proves: 'nothing' }, elementRefs: [] }],
    uncovered: [],
  };
  const pageStub = {
    goto: async () => undefined,
    locator: () => ({ waitFor: async () => undefined }),
    screenshot: async () => Buffer.from('png'),
  };
  const browserStub = {
    newContext: async () => ({ newPage: async () => pageStub, close: async () => undefined }),
    close: async () => undefined,
  };
  const { results, failures } = await captureEvidence({ plan, baseUrl: 'http://127.0.0.1:1/', launch: async () => browserStub });
  assert.deepEqual(results, []);
  assert.match(failures[0].message, /Unknown evidence interaction: run-anything/);
});

test('the service refuses to capture without a running preview and keeps evidence outside the repository', async () => {
  const dirs = roots('app-builder-evidence-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-evidence', manifest: manifest('evidence-test') });
    const generated = await service.generateProject(project.id);

    await assert.rejects(() => service.captureRenderedEvidence(project.id), /captured from the running preview/);
    assert.deepEqual(service.listRenderedEvidence(project.id), []);
    assert.equal(service.getRenderedEvidence(project.id, 'evidence-0000000000000000'), null);

    // The plan is readable without a browser, so a reviewer can see what would
    // be captured before anything is launched.
    const plan = service.renderedEvidencePlan(project.id);
    assert.ok(plan.captures.length >= generated.composition.pages.length * 3);
    assert.ok(plan.captures[0].elementRefs.length > 0, 'captures address the same elements the Builder does');

    for (const unsafe of ['..', '../escape', '.']) {
      assert.throws(() => service.evidenceDirectory(project.id, unsafe), /Unsafe evidence directory/);
    }
    assert.throws(() => service.evidenceDirectory('../escape'), /Unsafe evidence directory/);

    assert.equal(fs.existsSync(path.join(generated.workspace, 'evidence')), false, 'evidence must not land inside the portable repository');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('a capture that did not reach its state is dropped, not published as that state', async () => {
  // The Phase 3.8E nbm run published a picture labelled write/failed showing
  // "Thanks — your enquiry has been sent." The interaction waited for the form
  // to settle either way and photographed whichever outcome arrived.
  const { outcome } = INTERACTIONS['enquiry-submit-failed'];
  assert.ok(outcome, 'an interaction must say what reaching its state looks like');
  assert.ok(outcome.reached.test('We could not send your enquiry. Please try again.'));
  assert.ok(!outcome.reached.test('Thanks — your enquiry has been sent.'),
    'a success message must not satisfy the failed-write state');
  assert.ok(outcome.settled.test('Thanks — your enquiry has been sent.'),
    'a success message still settles the form, which is when the check runs');
  assert.ok(outcome.failRequest,
    'the failure has to be caused deterministically; a preview whose POST succeeds cannot reach this state on its own');
});

test('a declared interaction that captured nothing is refused, not filed as an unmet fixture need', () => {
  /*
   * This test used to assert that a failed interaction capture landed in
   * `uncovered`, which kept it out of the proven set — the right concern, and
   * too weak an answer.
   *
   * `uncovered` means "the factory cannot reach this state yet". An interaction
   * is in a closed registry, its precondition was checked against the
   * composition before it was planned, and it asserts on arrival. If one
   * produces no bytes then something broke, and recording it under the same
   * heading as work that was never done files a regression as a backlog item.
   * Fourteen of fifteen interaction states once vanished from a packet through a
   * single wrong manifest key with no error raised.
   */
  const composition = composeProject({ manifest: manifest('drop', { 'lead-generation': true }) });
  const plan = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, launchRules) });
  // Only the interaction that declares no sequence, so this exercises the
  // general rule rather than the sequence rule that runs before it.
  const interactionCaptures = plan.captures.filter((capture) => capture.state.interaction && !capture.state.sequence
    && !INTERACTIONS[capture.state.interaction].temporal);
  assert.ok(interactionCaptures.length > 0);

  assert.throws(
    () => buildEvidenceSet({
      plan,
      results: fakeResults(plan).filter((result) => !interactionCaptures.some((capture) => capture.id === result.id)),
      projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash, capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT,
    }),
    /declared interaction capture\(s\) produced no bytes/,
  );

  // And the state still cannot be proven by a set that never photographed it:
  // the reason it is unproven is now that there is no set at all.
  const matrix = applyEvidenceToStateMatrix(deriveStateMatrix(composition, launchRules), { captures: [] });
  const failedWrite = matrix.flatMap((surface) => surface.states).find((state) => state.axis === 'write' && state.state === 'failed');
  assert.equal(failedWrite.evidence, 'none', 'the state it could not reach stays unproven');
});

// --- Degenerate route evidence --------------------------------------------
//
// The defect this guards was found by an independent reviewer, not by the
// factory: the nbm candidate sets photographed six routes and produced six
// byte-identical PNGs per viewport. The packet recorded six identical content
// hashes and reported complete evidence.

test('routes the composition builds differently cannot be photographed identically', () => {
  const { composition, plan } = planFor();
  // Every capture returns the same bytes, which is what a browser that never
  // left the home page produces.
  const collapsed = plan.captures.map((capture) => ({ id: capture.id, bytes: Buffer.from('the-home-page') }));
  const args = { plan, projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash, capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT };

  // Without the composition the check cannot be made, and the old behaviour stands.
  assert.ok(buildEvidenceSet({ ...args, results: collapsed }).captures.length > 0);

  // With it, this is a failed capture rather than a durable record.
  assert.throws(
    () => buildEvidenceSet({ ...args, results: collapsed, composition }),
    /degenerate/,
    'six identical pictures of six different compositions is not evidence',
  );
});

test('pages composed from the same sections are allowed to render alike', () => {
  const { composition, plan } = planFor();
  const captures = [
    { pageId: 'a', route: '/a', viewport: 'desktop', state: { axis: 'viewport', state: 'desktop' }, contentHash: 'same' },
    { pageId: 'b', route: '/b', viewport: 'desktop', state: { axis: 'viewport', state: 'desktop' }, contentHash: 'same' },
  ];
  const twins = { pages: [{ id: 'a', sectionIds: ['s1'] }, { id: 'b', sectionIds: ['s1'] }] };
  assert.deepEqual(findDegenerateRouteCaptures({ composition: twins, captures }), [], 'identical sections may legitimately render identically');

  const different = { pages: [{ id: 'a', sectionIds: ['s1'] }, { id: 'b', sectionIds: ['s1', 's2'] }] };
  const found = findDegenerateRouteCaptures({ composition: different, captures });
  assert.equal(found.length, 1);
  assert.deepEqual(found[0].routes, ['/a', '/b']);

  // A real composition photographed properly raises nothing.
  const honest = buildEvidenceSet({
    plan, results: fakeResults(plan), projectId: 'p', buildRef: '/w',
    compositionHash: composition.compositionHash, capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT, composition,
  });
  assert.deepEqual(findDegenerateRouteCaptures({ composition, captures: honest.captures }), []);
});

test('a desktop capture is never compared against a phone one', () => {
  const captures = [
    { pageId: 'a', route: '/a', viewport: 'desktop', state: { axis: 'viewport', state: 'desktop' }, contentHash: 'same' },
    { pageId: 'b', route: '/b', viewport: 'mobile', state: { axis: 'viewport', state: 'mobile' }, contentHash: 'same' },
  ];
  const composition = { pages: [{ id: 'a', sectionIds: ['s1'] }, { id: 'b', sectionIds: ['s1', 's2'] }] };
  assert.deepEqual(findDegenerateRouteCaptures({ composition, captures }), [], 'different widths are not comparable evidence');
});

/**
 * The disclosed navigation is evidence about a screen, not about a document.
 *
 * Its panel is anchored to the sticky header and overlays what is beneath it,
 * so a `fullPage` capture is the whole page with a menu floating over the top —
 * a picture of something no visitor sees. Three independent reviews read it as
 * the navigation clipping and removing the page's introduction and marked
 * responsive quality down for it, which is a defect in the frame rather than in
 * the product.
 */
test('a state that overlays the page is photographed as a screen', () => {
  assert.equal(INTERACTIONS['navigation-disclosed'].frame, 'viewport', 'the disclosed panel must be captured as a screen, or its evidence misrepresents it');
  // Every other state is a document, and stays one: the enquiry outcome can sit
  // below the fold and a viewport capture would cut it off.
  for (const [name, interaction] of Object.entries(INTERACTIONS)) {
    if (name === 'navigation-disclosed') continue;
    assert.notEqual(interaction.frame, 'viewport', `${name} would lose anything below the fold`);
  }
  const source = fs.readFileSync(new URL('./lib/rendered-evidence-capture.mjs', import.meta.url), 'utf8');
  assert.match(source, /fullPage:\s*frame\s*!==\s*'viewport'/, 'the capture must honour the declared frame rather than always photographing the document');
});

// --- Temporal evidence -----------------------------------------------------
//
// Five independent reviews of hand-built work capped `interaction-craft` with a
// version of the same sentence: transition quality, touch behaviour and
// live-update smoothness cannot be judged from stills. One said it while looking
// at eighteen separate state captures, which is what settles that the answer is
// not more endpoints.

test('temporal evidence needs BOTH the interaction and the presentation to declare it', () => {
  /*
   * The two halves, and the reason they are two.
   *
   * The interaction registry knows how to trigger the disclosure, how to tell it arrived, and what
   * a temporal record of it would prove. It cannot know whether *this build* moves the panel: that
   * is a fact about the presentation, and the MotionContract already owns it. Declaring the need
   * in the registry alone made every build that contained the interaction owe three frames,
   * including builds that disclose their navigation instantly — which is what failed the MGB lane.
   */
  const composition = composeProject({ manifest: manifest('temporal', { 'lead-generation': true }) });
  const stateMatrix = deriveStateMatrix(composition, launchRules);
  const declared = Object.entries(INTERACTIONS).filter(([, entry]) => entry.temporal);
  assert.ok(declared.length > 0, 'the fixture needs an interaction that supports temporal evidence');

  const [name, interaction] = declared[0];
  const moving = { animates: [interaction.temporal.surface] };
  const stillPresentation = { animates: [] };

  const withMotion = deriveEvidencePlan({ composition, stateMatrix, motionContract: moving });
  const withoutMotion = deriveEvidencePlan({ composition, stateMatrix, motionContract: stillPresentation });

  assert.ok(withMotion.captures.some((capture) => capture.state.sequence), 'a presentation that moves the surface owes the sequence');
  assert.equal(withoutMotion.captures.some((capture) => capture.state.sequence), false, 'a presentation that does not move it owes nothing temporal');
  assert.ok(
    withoutMotion.captures.some((capture) => capture.state.interaction === name && capture.state.motion === 'reduced'),
    'the still is captured either way — a static presentation is a presentation, not a missing capture',
  );

  // And an interaction that supports no temporal evidence never gets a sequence, however much
  // the presentation moves.
  for (const [other, entry] of Object.entries(INTERACTIONS)) {
    if (entry.temporal) continue;
    assert.equal(
      withMotion.captures.some((capture) => capture.state.interaction === other && capture.state.sequence),
      false,
      `${other} does not support temporal evidence and must not be given a sequence`,
    );
  }
});

test('A — animated navigation: the presentation declares movement and owes a complete sequence', () => {
  const composition = composeProject({ manifest: manifest('animated') });
  const stateMatrix = deriveStateMatrix(composition, launchRules);
  const [, interaction] = Object.entries(INTERACTIONS).find(([, entry]) => entry.temporal);
  const plan = deriveEvidencePlan({ composition, stateMatrix, motionContract: { animates: [interaction.temporal.surface] } });

  const frames = plan.captures.filter((capture) => capture.state.sequence);
  assert.deepEqual([...new Set(frames.map((capture) => capture.state.sequence.frame))], ['before', 'during', 'after']);

  const during = frames.find((capture) => capture.state.sequence.frame === 'during');
  assert.ok(during.state.sequence.atProgress > 0 && during.state.sequence.atProgress < 1, 'the during frame records where it was seeked to');
  assert.equal(during.state.sequence.surface, interaction.temporal.surface);
  assert.ok(during.state.sequence.subject, 'the sequence names the element whose movement is load-bearing');
  assert.match(during.state.proves, /not evidence of how long it takes/);
  assert.equal(during.state.motion, 'allowed');

  // The still stays reduced-motion, which is what makes it the counterpart rather than a second
  // thing to capture.
  const still = plan.captures.find((capture) => capture.state.interaction && !capture.state.sequence);
  assert.equal(still.state.motion, 'reduced');

  // An incomplete sequence is refused, and says why the frame is missing rather than only that
  // it is.
  const withoutDuring = fakeResults(plan).filter((result) => result.id !== during.id);
  assert.throws(
    () => buildEvidenceSet({
      plan, results: withoutDuring,
      failures: [{ id: during.id, reason: 'no-movement', message: 'the panel animated nothing when it was triggered' }],
      projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash,
      capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT,
    }),
    /missing its during frame.*no-movement.*animated nothing/s,
  );
});

test('B — static navigation: the same interaction, a presentation that does not move, and no failure', () => {
  /*
   * The MGB case. Three directions were selected whose navigation discloses instantly — the
   * shipped stylesheet does it with `display: none`, which cannot be transitioned — so the trigger
   * animated nothing, the during frame failed, and the evidence set was refused for an incomplete
   * sequence. The refusal was right. What was wrong was owing the sequence at all.
   *
   * The difference here comes from the motion contract, not from anything that knows which
   * business this is.
   */
  const composition = composeProject({ manifest: manifest('static-nav') });
  const stateMatrix = deriveStateMatrix(composition, launchRules);
  const plan = deriveEvidencePlan({ composition, stateMatrix, motionContract: compileMotionContract('expressive') });

  assert.equal(
    plan.captures.some((capture) => capture.state.sequence),
    false,
    'the shipped template discloses its navigation instantly at every intensity, so it owes no temporal evidence',
  );
  const stills = plan.captures.filter((capture) => capture.state.interaction);
  assert.ok(stills.length > 0, 'the interaction is still captured');
  assert.equal(stills.every((capture) => capture.state.motion === 'reduced'), true);

  // And the set completes rather than being refused.
  const evidence = buildEvidenceSet({
    plan, results: fakeResults(plan), composition,
    projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash,
    capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT,
  });
  assert.deepEqual(validateContract('rendered-evidence', evidence), []);
  assert.ok(evidence.captures.length > 0);
});

test('the shipped template declares that it does not move its navigation panel', () => {
  /*
   * Stated as a test because it is a fact about the stylesheet that evidence planning relies on,
   * and because it should fail the day somebody animates the disclosure without saying so.
   */
  for (const intensity of ['none', 'subtle', 'moderate', 'expressive']) {
    assert.equal(
      compileMotionContract(intensity).animates.includes('navigation-disclosure'),
      false,
      `${intensity} claims to move the navigation panel; templates/shared/presentation/styles.css discloses it with display:none`,
    );
  }
  assert.deepEqual(compileMotionContract('none').animates, [], 'nothing moves at all when the contract says none');
});

test('a page whose composition has no declared interaction carries no motion evidence at all', () => {
  const composition = composeProject({ manifest: manifest('brochure') });
  const desktopOnly = VIEWPORTS.filter((viewport) => viewport.name === 'desktop');
  const plan = deriveEvidencePlan({ composition, stateMatrix: deriveStateMatrix(composition, launchRules), viewports: desktopOnly });

  assert.ok(plan.captures.length > 0, 'the pages are still photographed');
  assert.equal(plan.captures.some((capture) => capture.state.sequence), false);
});

test('an evidence set that omits a declared route is refused', () => {
  const { composition, plan } = planFor();
  const [firstRoute] = composition.pages.map((page) => page.path);
  const withoutRoute = plan.captures.filter((capture) => capture.route !== firstRoute);
  const results = fakeResults({ captures: withoutRoute });

  assert.throws(
    () => buildEvidenceSet({
      plan: { ...plan, captures: withoutRoute }, results, composition,
      projectId: 'p', buildRef: '/w', compositionHash: composition.compositionHash,
      capturedAt: '2026-08-26T00:00:00.000Z', renderingSource: BUILT_ARTIFACT,
    }),
    new RegExp(`Missing: ${firstRoute.replace(/[/]/g, '\\/')}`),
  );
});
