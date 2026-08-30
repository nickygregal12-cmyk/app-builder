import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import { composeProject } from '../packages/composition/src/index.js';
import { compileAssetReadiness } from './lib/asset-readiness.mjs';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { compileDesignLintReport } from './lib/design-lint.mjs';
import {
  MINIMUM_DIFFERING_PLANES,
  applyVisualDirection,
  assessDiversity,
  compileVisualDirection,
  loadVisualDirections,
  responsiveCompositionTokens,
  selectVisualDirections,
  structuralSignature,
  visualDirectionClasses,
} from './lib/visual-direction.mjs';
import {
  assertCandidateTransition,
  buildCandidateSet,
  evaluatePromotionGate,
  promoteCandidate,
  recordCandidateEvidence,
  recordReview,
  reviewCriteriaFor,
} from './lib/visual-candidates.mjs';

const STYLES_CSS = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');

// A runtime identity for a fixture. Independence is decided on `vendor`, so a
// fixture that omits it is not a shortcut — it is a different test.
const identity = (role, vendor = 'anthropic', model = 'claude-opus-5') => ({ role, vendor, model });

// The reviewer in these fixtures is a different vendor to the creator, because
// that is the only combination the guard permits. A fixture reviewer defaulting
// to the creator's vendor would make every downstream test a test of the guard.
const reviewer = (role = 'design-critic') => identity(role, 'openai', 'gpt-5.6');
const APP_TSX = fs.readFileSync('templates/react-vite-neutral/files/src/App.tsx', 'utf8');
const TOKENS_CSS = fs.readFileSync('templates/shared/presentation/tokens.css', 'utf8');
const REGISTRY = loadVisualDirections();

function projectManifest(type = 'marketing-site') {
  const manifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
  manifest.project.type = type;
  return manifest;
}

function photographs(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `asset-photo-${index}`,
    kind: 'image',
    publishUseAllowed: true,
    rightsStatus: 'owner-approved',
    assetStatus: 'approved',
    metadata: { alt: `Project photograph ${index}` },
    variants: [{ role: 'hero-16x9', width: 1600, height: 900, uri: `assets/photo-${index}.jpg`, format: 'jpeg' }],
  }));
}

/**
 * A business with enough material for a page to have a shape.
 *
 * The example manifest alone composes a hero, a gallery and a call to action,
 * which is not a page a direction can reorder — and a fixture too thin to show
 * a difference would let a broken reordering pass. This is the shape a real
 * small business produces: services, proof, areas and contact.
 */
function knowledgePackWithPhotographs(count) {
  const fact = (id, value) => ({ id, path: id, value, verification: 'user-provided', confidence: 1, sourceId: 'source-approved', evidence: [] });
  return {
    packHash: 'a'.repeat(64),
    facts: [fact('identity.name', 'Kilbride Retrofit'), fact('contact.email', 'hello@example-business.test')],
    companyProfile: {
      identity: { name: { value: 'Kilbride Retrofit', factId: 'identity.name' }, description: { value: 'Whole-house retrofit for period properties.', factId: 'identity.name' } },
      contact: { email: { value: 'hello@example-business.test', factId: 'contact.email' } },
      services: [
        { id: 'service-1', sourceId: 'source-approved', name: 'Home survey', description: 'A whole-house assessment before any work starts.' },
        { id: 'service-2', sourceId: 'source-approved', name: 'Retrofit installation', description: 'Fabric-first improvements fitted by our own team.' },
        { id: 'service-3', sourceId: 'source-approved', name: 'Aftercare', description: 'Monitoring and adjustment through the first heating season.' },
      ],
      testimonials: [{ id: 'testimonial-1', sourceId: 'source-approved', quote: 'Clear, and they cleaned up after themselves.', customer: 'J Smith' }],
      accreditations: [{ id: 'accreditation-1', sourceId: 'source-approved', name: 'Example Quality Scheme' }],
      serviceAreas: [{ id: 'area-1', sourceId: 'source-approved', value: 'Glasgow', factId: 'identity.name' }, { id: 'area-2', sourceId: 'source-approved', value: 'Renfrewshire', factId: 'identity.name' }],
    },
    assets: photographs(count),
  };
}

function build(directionId, { type = 'marketing-site', knowledgePack = null } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-direction-'));
  const out = path.join(tmp, 'project');
  const result = generateComposedProject(projectManifest(type), out, {
    knowledgePack,
    designChoices: directionId ? { visualDirection: directionId } : {},
  });
  const spec = JSON.parse(fs.readFileSync(path.join(out, '.product/design-system.json'), 'utf8'));
  const designModule = fs.readFileSync(path.join(out, 'src/generated/design.ts'), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  fs.rmSync(tmp, { recursive: true, force: true });
  return { ...result, spec, designModule, packageJson };
}

test('every declared visual direction compiles, and every dimension it declares is read by something', () => {
  for (const id of Object.keys(REGISTRY.directions)) {
    const direction = compileVisualDirection(id, REGISTRY);
    const { dimensions, responsive } = direction.artDirection;

    // Each structural dimension names a consumer in the template. A dimension
    // nothing reads is a knob on a picture of a machine, and this is the check
    // that keeps one from being added.
    // The renderer builds the class from the strategy, so what proves the
    // consumer is the stylesheet rule and the DOM branch, not a literal.
    assert.ok(STYLES_CSS.includes(`.hero-${dimensions.heroStrategy}`) || dimensions.heroStrategy === 'split',
      `${id} declares heroStrategy ${dimensions.heroStrategy} and the stylesheet never reads it`);
    assert.ok(APP_TSX.includes('data-hero-strategy'), 'the renderer must publish the hero strategy it rendered');
    assert.ok(STYLES_CSS.includes(`.grid-${dimensions.gridFamily}`) || dimensions.gridFamily === 'symmetric',
      `${id} declares gridFamily ${dimensions.gridFamily} and the stylesheet never reads it`);
    assert.ok(STYLES_CSS.includes(`.headings-${dimensions.headingTreatment}`) || dimensions.headingTreatment === 'plain',
      `${id} declares headingTreatment ${dimensions.headingTreatment} and the stylesheet never reads it`);
    assert.ok(STYLES_CSS.includes(`.moment-${dimensions.distinctiveMoment}`) || dimensions.distinctiveMoment === 'none',
      `${id} declares distinctiveMoment ${dimensions.distinctiveMoment} and nothing renders it`);
    assert.ok(STYLES_CSS.includes(`.nav-${dimensions.navigationFamily}`) || dimensions.navigationFamily === 'utility',
      `${id} declares navigationFamily ${dimensions.navigationFamily} and the stylesheet never reads it`);
    // ctaPlacement decides desktop order *and* whether mobile conversion-first
    // may pull the ask forward, so the stylesheet has to be able to tell the
    // two declarations apart rather than moving every conversion section.
    assert.ok(STYLES_CSS.includes(`.cta-${dimensions.ctaPlacement}`) || dimensions.ctaPlacement === 'closing',
      `${id} declares ctaPlacement ${dimensions.ctaPlacement} and the stylesheet never reads it`);
    assert.ok(STYLES_CSS.includes(`.mobile-hero-${responsive.mobileHero}`) || responsive.mobileHero === 'copy-first',
      `${id} declares mobileHero ${responsive.mobileHero} and the stylesheet never reads it`);
    assert.ok(STYLES_CSS.includes(`.mobile-order-${responsive.mobileSectionOrder}`) || responsive.mobileSectionOrder === 'as-desktop',
      `${id} declares mobileSectionOrder ${responsive.mobileSectionOrder} and the stylesheet never reads it`);
    assert.ok(STYLES_CSS.includes(`.mobile-motion-${responsive.mobileMotion}`) || responsive.mobileMotion === 'as-desktop',
      `${id} declares mobileMotion ${responsive.mobileMotion} and the stylesheet never reads it`);
  }

  // The two responsive decisions that are values rather than structures compile
  // to custom properties, and the stylesheet reads both.
  for (const token of Object.keys(responsiveCompositionTokens({ mobileDensity: 'tighter', mobileMotion: 'reduced' }))) {
    assert.ok(STYLES_CSS.includes(token) || TOKENS_CSS.includes(token), `${token} is compiled and nothing reads it`);
  }
});

test('a direction re-presents a build and cannot edit it', () => {
  const manifest = projectManifest();
  const knowledgePack = knowledgePackWithPhotographs(3);
  const baseline = composeProject({ manifest, knowledgePack });

  for (const id of Object.keys(REGISTRY.directions)) {
    const directed = applyVisualDirection(baseline, compileVisualDirection(id, REGISTRY));

    assert.deepEqual(directed.pages.map((page) => page.path), baseline.pages.map((page) => page.path));
    for (const page of baseline.pages) {
      const next = directed.pages.find((entry) => entry.id === page.id);
      assert.deepEqual([...next.sectionIds].sort(), [...page.sectionIds].sort(), `${id} changed what is on ${page.path}`);
    }
    for (const section of baseline.sections) {
      const next = directed.sections.find((entry) => entry.id === section.id);
      assert.deepEqual(next.bindings, section.bindings, `${id} edited the content of ${section.id}`);
      assert.deepEqual(next.actions, section.actions, `${id} edited the actions of ${section.id}`);
      assert.deepEqual(next.assetIds, section.assetIds, `${id} edited the assets of ${section.id}`);
    }
    assert.deepEqual(directed.warnings, baseline.warnings);
  }
});

test('a direction that reorders a page rehashes it, so the hash never describes something else', () => {
  const baseline = composeProject({ manifest: projectManifest(), knowledgePack: knowledgePackWithPhotographs(3) });
  const directed = applyVisualDirection(baseline, compileVisualDirection('immersive-lead', REGISTRY));
  assert.notEqual(directed.compositionHash, baseline.compositionHash);
  const home = directed.pages[0];
  const baseHome = baseline.pages[0];
  assert.notDeepEqual(home.sectionIds, baseHome.sectionIds, 'immersive-lead declares a section order and produced the composed one');
});

test('a build with no promoted direction renders exactly what it rendered before Phase 4D', () => {
  const undirected = build(null);
  assert.equal(undirected.spec.visualDirection, null);
  assert.equal(undirected.spec.layout.shellClasses, undirected.spec.layout.shellClass);
  const baseline = composeProject({ manifest: projectManifest() });
  assert.equal(undirected.composition.compositionHash, baseline.compositionHash);
});

test('two candidates over one product truth differ structurally, and say the same thing', () => {
  const knowledgePack = knowledgePackWithPhotographs(3);
  const editorial = build('editorial-authority', { knowledgePack });
  const immersive = build('immersive-lead', { knowledgePack });

  // Same truth: every binding on every section is identical.
  for (const section of editorial.composition.sections) {
    const twin = immersive.composition.sections.find((entry) => entry.id === section.id);
    assert.deepEqual(twin.bindings, section.bindings, `${section.id} says something different in the two candidates`);
  }

  // Different structure: the sequence, the opening and the shell all differ.
  const sequence = (result) => result.composition.pages[0].sectionIds;
  assert.notDeepEqual(sequence(editorial), sequence(immersive));
  assert.notEqual(editorial.spec.artDirection.dimensions.heroStrategy, immersive.spec.artDirection.dimensions.heroStrategy);
  assert.notEqual(editorial.spec.layout.shellClasses, immersive.spec.layout.shellClasses);
  assert.notEqual(editorial.spec.artDirection.dimensions.navigationFamily, immersive.spec.artDirection.dimensions.navigationFamily);

  const signatures = [editorial, immersive].map((result) => structuralSignature({
    direction: { id: result.spec.visualDirection, artDirection: result.spec.artDirection },
    composition: result.composition,
    design: { density: result.spec.controls.density, patternId: result.spec.layout.patternId },
  }));
  assert.equal(assessDiversity(signatures).distinct, true);

  // And neither one has acquired a factory dependency on the way.
  for (const result of [editorial, immersive]) {
    const dependencies = { ...result.packageJson.dependencies, ...result.packageJson.devDependencies };
    assert.equal(Object.keys(dependencies).some((name) => name.startsWith('@app-builder/')), false);
  }
});

test('two candidates that differ only in tokens are refused before anything is rendered', () => {
  const composition = composeProject({ manifest: projectManifest(), knowledgePack: knowledgePackWithPhotographs(3) });
  const direction = compileVisualDirection('structured-practice', REGISTRY);
  const directed = applyVisualDirection(composition, direction);

  // The same direction twice, with different token values. This is precisely
  // the theme swap the stage exists to refuse.
  const a = structuralSignature({ direction, composition: directed, design: { density: 'comfortable', patternId: 'public-marketing' } });
  const b = structuralSignature({ direction: { ...direction, id: 'structured-practice-teal' }, composition: directed, design: { density: 'comfortable', patternId: 'public-marketing' } });

  const diversity = assessDiversity([a, b]);
  assert.equal(diversity.distinct, false);
  assert.equal(diversity.duplicates[0].reason, 'theme-swap');
  assert.throws(() => buildCandidateSet({
    projectId: 'project-x',
    createdAt: '2026-08-26T00:00:00.000Z',
    createdBy: identity('visual-direction'),
    frozenTruth: { projectType: 'marketing-site', manifestVersion: 2, knowledgePackHash: null, baselineCompositionHash: composition.compositionHash },
    assetReadiness: compileAssetReadiness({}),
    candidates: [
      { candidateId: 'candidate-a', directionId: 'structured-practice', directionLabel: 'A', artDirection: direction.artDirection, signature: a, compositionHash: directed.compositionHash },
      { candidateId: 'candidate-b', directionId: 'structured-practice-teal', directionLabel: 'B', artDirection: direction.artDirection, signature: b, compositionHash: directed.compositionHash },
    ],
  }), /not genuinely different/);
});

test('a set needs at least two candidates, because one candidate is not a choice', () => {
  assert.throws(() => buildCandidateSet({
    projectId: 'project-x',
    createdAt: '2026-08-26T00:00:00.000Z',
    createdBy: identity('visual-direction'),
    frozenTruth: { projectType: 'marketing-site', manifestVersion: 2, knowledgePackHash: null, baselineCompositionHash: 'f'.repeat(64) },
    assetReadiness: compileAssetReadiness({}),
    candidates: [{ candidateId: 'candidate-a', directionId: 'structured-practice', directionLabel: 'A', signature: { axes: {}, sequence: [] }, compositionHash: 'f'.repeat(64) }],
  }), /at least two candidates/);
});

test('no publishable photography is an art-direction input rather than a broken imagery-led build', () => {
  const bare = compileAssetReadiness({ knowledgePack: { assets: [] } });
  assert.equal(bare.supportsImageryLed, false);
  assert.equal(bare.strategy, 'typography-led');
  assert.ok(bare.remedies.some((entry) => entry.id === 'typography-led-direction'));

  const refusedRun = selectVisualDirections({ projectType: 'marketing-site', registry: REGISTRY, assetReadiness: bare });
  assert.ok(refusedRun.refused.some((entry) => entry.directionId === 'immersive-lead' && entry.reason === 'imagery-not-available'));
  assert.equal(refusedRun.eligible.some((direction) => direction.id === 'immersive-lead'), false);
  assert.ok(refusedRun.eligible.length >= 2, 'refusing an imagery-led direction must still leave a real choice');

  const withPhotographs = compileAssetReadiness({ knowledgePack: knowledgePackWithPhotographs(3) });
  assert.equal(withPhotographs.supportsImageryLed, true);
  assert.equal(withPhotographs.strategy, 'imagery-viable');
  const allowedRun = selectVisualDirections({ projectType: 'marketing-site', registry: REGISTRY, assetReadiness: withPhotographs });
  assert.ok(allowedRun.eligible.some((direction) => direction.id === 'immersive-lead'));
});

test('an asset the business has not cleared never counts towards coverage', () => {
  const pack = knowledgePackWithPhotographs(3);
  const readiness = compileAssetReadiness({
    knowledgePack: { assets: pack.assets.map((asset) => ({ ...asset, publishUseAllowed: false, rightsStatus: 'reference-only' })) },
  });
  assert.equal(readiness.supportsImageryLed, false);
  assert.equal(readiness.counts.withheld, 3);
  assert.deepEqual(readiness.coverage.hero, []);
  assert.ok(readiness.remedies.some((entry) => entry.id === 'clear-rights'));

  // A per-asset decision that clears one of them is respected, in that direction only.
  const cleared = compileAssetReadiness({
    knowledgePack: { assets: pack.assets.map((asset) => ({ ...asset, publishUseAllowed: false })) },
    assetDecisions: pack.assets.map((asset) => ({ assetId: asset.id, effect: { publishUseAllowed: true } })),
  });
  assert.equal(cleared.supportsImageryLed, true);
});

test('a public-facing candidate must carry a distinctive moment', () => {
  const refusedRun = selectVisualDirections({ projectType: 'marketing-site', registry: REGISTRY, requested: ['dense-utility'] });
  assert.deepEqual(refusedRun.eligible, []);
  assert.equal(refusedRun.refused[0].reason, 'no-distinctive-moment');

  // The same direction is perfectly appropriate where nobody is being persuaded.
  const internal = selectVisualDirections({ projectType: 'internal-tool', registry: REGISTRY, requested: ['dense-utility'] });
  assert.equal(internal.eligible.length, 1);
});

test('a distinctive moment with nothing to render is refused rather than generated', () => {
  const manifest = projectManifest();
  // A practice with no photography and no gallery. The nbm acceptance is
  // exactly this shape, and it is what found the rule missing: a direction
  // whose memorable idea was a numbered index of the work was offered to a
  // business with no work to index.
  const withoutWork = composeProject({ manifest, knowledgePack: null });
  const bare = compileAssetReadiness({});
  const refusedRun = selectVisualDirections({ projectType: 'marketing-site', registry: REGISTRY, assetReadiness: bare, composition: withoutWork });
  const fullBleed = refusedRun.refused.find((entry) => entry.directionId === 'immersive-lead');
  assert.ok(fullBleed, 'an imagery-led direction is refused where there is no imagery');

  // With services to number, the same moment has something to render, and the
  // direction is eligible again.
  const withServices = composeProject({ manifest, knowledgePack: knowledgePackWithPhotographs(0) });
  const allowed = selectVisualDirections({ projectType: 'marketing-site', registry: REGISTRY, assetReadiness: bare, composition: withServices, requested: ['structured-practice'] });
  assert.equal(allowed.eligible.length, 1, JSON.stringify(allowed.refused));
  assert.ok(STYLES_CSS.includes('.moment-figure-index .section-item-grid'), 'a figure index has to render over services where there is no gallery');

  // And a composition with neither refuses it, with a reason that says what is missing.
  const nothing = { pages: [{ id: 'page-home', sectionIds: ['s1'] }], sections: [{ id: 's1', type: 'rich-text', variant: 'default', bindings: [], actions: [], assetIds: [] }] };
  const impossible = selectVisualDirections({ projectType: 'marketing-site', registry: REGISTRY, assetReadiness: bare, composition: nothing, requested: ['structured-practice'] });
  assert.equal(impossible.eligible.length, 0);
  assert.equal(impossible.refused[0].reason, 'distinctive-moment-not-renderable');
  assert.match(impossible.refused[0].detail, /renders nothing/);
});

test('a DesignLint violation blocks promotion and is not a matter for review', () => {
  const gate = evaluatePromotionGate({ findings: [{ rule: 'accent-contrast', severity: 'violation', detail: 'unreadable' }], counts: { violation: 1, warning: 0, recommendation: 0 } });
  assert.equal(gate.status, 'blocked');
  assert.deepEqual(gate.mustAddress, []);

  const candidate = { candidateId: 'candidate-a', state: 'deterministic-blocked', gate, provenance: { createdBy: identity('visual-direction') }, outcome: 'pending' };
  assert.throws(() => recordReview(candidate, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: [] }), /not a matter for review/);
  assert.throws(() => assertCandidateTransition('deterministic-blocked', 'promoted'), /cannot move from deterministic-blocked to promoted/);
});

test('a warning lets a candidate reach review, and a review that ignores it is refused', () => {
  const designLint = {
    findings: [
      { rule: 'repetitive-section-presentation', severity: 'warning', detail: 'four in a row' },
      { rule: 'uniform-page-rhythm', severity: 'recommendation', detail: 'flat' },
    ],
    counts: { violation: 0, warning: 1, recommendation: 1 },
  };
  const gate = evaluatePromotionGate(designLint);
  assert.equal(gate.status, 'review-required');
  assert.deepEqual(gate.mustAddress, ['repetitive-section-presentation']);

  const candidate = { candidateId: 'candidate-a', state: 'deterministic-pass', gate, provenance: { createdBy: identity('visual-direction') }, outcome: 'pending' };
  assert.throws(() => recordReview(candidate, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: [] }), /does not address the DesignLint warnings/);

  const reviewed = recordReview(candidate, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: ['repetitive-section-presentation'], rationale: 'A list of services is a list.' });
  assert.equal(reviewed.state, 'reviewed');
});

test('a recommendation never blocks anything', () => {
  const gate = evaluatePromotionGate({ findings: [{ rule: 'uniform-page-rhythm', severity: 'recommendation', detail: 'flat' }], counts: { violation: 0, warning: 0, recommendation: 1 } });
  assert.equal(gate.status, 'clear');
  assert.deepEqual(gate.mustAddress, []);
});

test('the creator of a candidate cannot promote it', () => {
  const candidate = { candidateId: 'candidate-a', state: 'deterministic-pass', gate: { status: 'clear', blocking: [], mustAddress: [] }, provenance: { createdBy: identity('visual-direction') }, outcome: 'pending' };
  assert.throws(() => recordReview(candidate, { verdict: 'pass', reviewedBy: identity('visual-direction'), addressedRules: [] }), /cannot also promote it/);
});

/**
 * Independence is a property of the runtime that judged, not of the label it
 * was given.
 *
 * A role string is chosen by whoever writes the call. Comparing two of them
 * catches a caller who reuses one name and nothing else: the same model, told
 * to answer to `design-critic` instead of `visual-direction`, is a different
 * string and the same opinion. That is the failure rule 17 exists to prevent,
 * so the comparison is on the vendor that actually produced the verdict.
 *
 * Model is deliberately not the axis. One vendor's small model reviewing its
 * large model's work shares training, data and blind spots; it is a cheaper
 * opinion, not a second one.
 */
test('a review from the creator\'s own vendor is refused however it labels itself', () => {
  const candidate = {
    candidateId: 'candidate-a',
    state: 'deterministic-pass',
    gate: { status: 'clear', blocking: [], mustAddress: [] },
    provenance: { createdBy: { role: 'visual-direction', vendor: 'anthropic', model: 'claude-opus-5' } },
    outcome: 'pending',
  };

  // Same vendor, same model, a different role label.
  assert.throws(
    () => recordReview(candidate, { verdict: 'pass', reviewedBy: { role: 'design-critic', vendor: 'anthropic', model: 'claude-opus-5' }, addressedRules: [] }),
    /same vendor/,
    'a role rename is not independence',
  );

  // Same vendor, a different model. Restarting a sibling is not a second opinion.
  assert.throws(
    () => recordReview(candidate, { verdict: 'pass', reviewedBy: { role: 'design-critic', vendor: 'anthropic', model: 'claude-haiku-4-5' }, addressedRules: [] }),
    /same vendor/,
    'a smaller model from the same vendor is not independence',
  );

  // The one permitted shape: a genuinely different vendor.
  const reviewed = recordReview(candidate, { verdict: 'pass', reviewedBy: { role: 'design-critic', vendor: 'openai', model: 'gpt-5.6' }, addressedRules: [], rationale: 'Reads as the practice it is for.' });
  assert.equal(reviewed.state, 'reviewed');
});

/**
 * An unprovable independence claim and a false one are worth the same, so both
 * sides must declare a vendor and neither may be a bare string.
 *
 * The string case is not hypothetical: every candidate written before this
 * change recorded its creator as a role name. Those candidates cannot be shown
 * to be independently reviewable, so they are refused rather than grandfathered
 * — the alternative is a set of promotable artifacts whose independence nobody
 * can establish.
 */
test('an identity that cannot be checked is refused on either side', () => {
  const gate = { status: 'clear', blocking: [], mustAddress: [] };
  const candidate = { candidateId: 'candidate-a', state: 'deterministic-pass', gate, provenance: { createdBy: identity('visual-direction') }, outcome: 'pending' };

  assert.throws(
    () => recordReview(candidate, { verdict: 'pass', reviewedBy: 'design-critic', addressedRules: [] }),
    /declares no vendor/,
    'a bare role string reviewing anything is refused',
  );
  assert.throws(
    () => recordReview(candidate, { verdict: 'pass', reviewedBy: { role: 'design-critic', model: 'gpt-5.6' }, addressedRules: [] }),
    /declares no vendor/,
    'an identity missing its vendor is refused',
  );

  const legacy = { candidateId: 'candidate-legacy', state: 'deterministic-pass', gate, provenance: { createdBy: 'visual-direction' }, outcome: 'pending' };
  assert.throws(
    () => recordReview(legacy, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: [] }),
    /cannot be established/,
    'a candidate whose creator predates vendor recording cannot be reviewed at all',
  );

  const anonymous = { candidateId: 'candidate-anon', state: 'deterministic-pass', gate, outcome: 'pending' };
  assert.throws(
    () => recordReview(anonymous, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: [] }),
    /records no creator/,
    'a candidate with no provenance at all is refused, not treated as independent of everyone',
  );
});

/**
 * Two callers writing the same vendor differently are still the same vendor.
 *
 * Without this, independence is buyable with a capital letter — and the caller
 * most likely to produce `Anthropic` rather than `anthropic` is a hand-written
 * config or a second code path, which is exactly the drift this guard exists to
 * catch.
 */
test('vendor comparison is not defeated by case or surrounding whitespace', () => {
  const gate = { status: 'clear', blocking: [], mustAddress: [] };
  const candidate = { candidateId: 'candidate-a', state: 'deterministic-pass', gate, provenance: { createdBy: identity('visual-direction', 'anthropic') }, outcome: 'pending' };

  for (const written of ['Anthropic', 'ANTHROPIC', ' anthropic ', 'AnThRoPiC']) {
    assert.throws(
      () => recordReview(candidate, { verdict: 'pass', reviewedBy: { role: 'design-critic', vendor: written, model: 'claude-opus-5' }, addressedRules: [] }),
      /same vendor/,
      `${JSON.stringify(written)} is the creator's vendor and must not buy independence`,
    );
  }
});

/**
 * The guard has to bite at both gates.
 *
 * `recordVisualReview` and `promoteCandidate` are separate entry points, and a
 * verdict recorded legitimately by one vendor must not become promotable by the
 * vendor that built the thing. Testing only the review path would leave
 * promotion as an unguarded second door.
 */
test('promotion applies the same vendor rule as review', () => {
  const gate = { status: 'clear', blocking: [], mustAddress: [] };
  const candidate = { candidateId: 'candidate-a', state: 'deterministic-pass', gate, provenance: { createdBy: identity('visual-direction') }, outcome: 'pending' };
  const reviewed = recordReview(candidate, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: [], rationale: 'Good.' });
  const set = { schemaVersion: 2, promotedCandidateId: null, candidates: [reviewed] };

  assert.throws(
    () => promoteCandidate(set, 'candidate-a', { promotedBy: identity('design-critic') }),
    /same vendor/,
    'the creating vendor cannot promote, even against someone else\'s passing verdict',
  );
  assert.throws(
    () => promoteCandidate(set, 'candidate-a', { promotedBy: 'design-critic' }),
    /declares no vendor/,
    'a bare string cannot promote',
  );
});

test('the critic is asked only what needs judgement, and only what applies', () => {
  const settled = new Set(['accent-contrast', 'reduced-motion-required', 'repetitive-section-presentation', 'competing-primary-actions', 'uniform-page-rhythm']);
  for (const criterion of reviewCriteriaFor({ projectType: 'marketing-site', publishesImagery: true })) {
    assert.equal(settled.has(criterion.id), false, `${criterion.id} is something a rule already decides`);
  }
  const publicWithImagery = reviewCriteriaFor({ projectType: 'marketing-site', publishesImagery: true }).map((entry) => entry.id);
  const internalWithout = reviewCriteriaFor({ projectType: 'internal-tool', publishesImagery: false }).map((entry) => entry.id);
  assert.ok(publicWithImagery.includes('imagery-suitability'));
  assert.equal(internalWithout.includes('imagery-suitability'), false);
  assert.equal(internalWithout.includes('conversion-clarity'), false);
  assert.ok(internalWithout.includes('responsive-quality'));
});

test('exactly one candidate is promoted, and the rest are closed rather than left open', () => {
  const knowledgePack = knowledgePackWithPhotographs(3);
  const manifest = projectManifest();
  const baseline = composeProject({ manifest, knowledgePack });
  const readiness = compileAssetReadiness({ knowledgePack });

  const candidates = ['structured-practice', 'editorial-authority', 'immersive-lead'].map((id) => {
    const direction = compileVisualDirection(id, REGISTRY);
    const composition = applyVisualDirection(baseline, direction);
    return {
      candidateId: `candidate-${id}`,
      directionId: id,
      directionLabel: direction.label,
      artDirection: direction.artDirection,
      signature: structuralSignature({ direction, composition, design: { density: direction.design.density, patternId: 'public-marketing' } }),
      compositionHash: composition.compositionHash,
    };
  });

  let set = buildCandidateSet({
    projectId: 'project-x',
    createdAt: '2026-08-26T00:00:00.000Z',
    createdBy: identity('visual-direction'),
    frozenTruth: { projectType: 'marketing-site', manifestVersion: 2, knowledgePackHash: knowledgePack.packHash, baselineCompositionHash: baseline.compositionHash },
    assetReadiness: readiness,
    candidates,
  });
  assert.equal(set.diversity.distinct, true);
  assert.equal(set.diversity.minimumDifferingPlanes, MINIMUM_DIFFERING_PLANES);
  assert.deepEqual(validateContract('visual-candidate-set', set), []);

  set = {
    ...set,
    candidates: set.candidates.map((candidate) => recordCandidateEvidence(candidate, { evidenceId: `evidence-${'0'.repeat(16)}`, designLint: { findings: [], counts: { violation: 0, warning: 0, recommendation: 0 }, clean: true } })),
  };
  assert.ok(set.candidates.every((candidate) => candidate.state === 'deterministic-pass'));

  set = {
    ...set,
    candidates: set.candidates.map((candidate) => (candidate.candidateId === 'candidate-editorial-authority'
      ? recordReview(candidate, { verdict: 'pass', reviewedBy: reviewer(), addressedRules: [], rationale: 'The typographic opening reads as the practice it is for.' })
      : recordReview(candidate, { verdict: 'rework', reviewedBy: reviewer(), addressedRules: [], rationale: 'Weaker hierarchy on the opening.' }))),
  };

  const promoted = promoteCandidate(set, 'candidate-editorial-authority', { promotedBy: reviewer(), decidedAt: '2026-08-26T01:00:00.000Z' });
  assert.equal(promoted.promotedCandidateId, 'candidate-editorial-authority');
  assert.equal(promoted.candidates.filter((candidate) => candidate.outcome === 'promoted').length, 1);
  assert.equal(promoted.candidates.filter((candidate) => candidate.outcome === 'pending').length, 0, 'a candidate left pending is how a set quietly gets two winners');
  assert.deepEqual(validateContract('visual-candidate-set', promoted), []);
  assert.throws(() => promoteCandidate(promoted, 'candidate-structured-practice', { promotedBy: reviewer() }), /already promoted/);
});

test('a candidate with no passing review is never promoted, however few candidates are left', () => {
  const set = {
    schemaVersion: 1,
    setId: 'candidates-0000000000000000',
    projectId: 'project-x',
    createdAt: '2026-08-26T00:00:00.000Z',
    createdBy: identity('visual-direction'),
    candidates: [
      { candidateId: 'candidate-a', state: 'reviewed', gate: { status: 'clear', blocking: [], mustAddress: [] }, review: { verdict: 'rework', reviewedBy: reviewer() }, provenance: { createdBy: identity('visual-direction') }, outcome: 'pending' },
      { candidateId: 'candidate-b', state: 'reviewed', gate: { status: 'clear', blocking: [], mustAddress: [] }, review: { verdict: 'reject', reviewedBy: reviewer() }, provenance: { createdBy: identity('visual-direction') }, outcome: 'rejected' },
    ],
    promotedCandidateId: null,
  };
  assert.throws(() => promoteCandidate(set, 'candidate-a', { promotedBy: reviewer() }), /rework, not the least bad one/);
});

test('promoting a direction is a durable design choice a rebuild replays', () => {
  const promoted = build('editorial-authority');
  assert.equal(promoted.spec.visualDirection, 'editorial-authority');
  assert.ok(promoted.spec.layout.shellClasses.includes('grid-editorial-rows'));
  assert.ok(promoted.designModule.includes('"visualDirectionId": "editorial-authority"'));

  // Rebuilding from the same durable choice reproduces the same presentation.
  const again = build('editorial-authority');
  assert.equal(again.composition.compositionHash, promoted.composition.compositionHash);
  assert.equal(again.spec.layout.shellClasses, promoted.spec.layout.shellClasses);
});

test('an unknown direction is refused where it is recorded, not where it is rendered', () => {
  assert.throws(() => compileVisualDirection('brutalist-maximalism', REGISTRY), /Unknown visual direction/);
  assert.throws(() => build('brutalist-maximalism'), /Unknown visual direction/);
});

test('every direction still lints clean, so a direction cannot ship a deterministic defect', () => {
  const knowledgePack = knowledgePackWithPhotographs(3);
  for (const id of Object.keys(REGISTRY.directions)) {
    const type = id === 'dense-utility' ? 'internal-tool' : 'marketing-site';
    const result = build(id, { type, knowledgePack });
    const report = compileDesignLintReport({
      spec: result.spec,
      composition: result.composition,
      tokenSourceCss: TOKENS_CSS,
      compositionHash: result.composition.compositionHash,
    });
    assert.equal(report.counts.violation, 0, `${id} raised ${JSON.stringify(report.findings)}`);
    assert.equal(evaluatePromotionGate(report).status !== 'blocked', true);
  }
});

test('the shell class list is compiled once and describes the direction the build was given', () => {
  const direction = compileVisualDirection('immersive-lead', REGISTRY);
  const classes = visualDirectionClasses({ id: direction.id, artDirection: direction.artDirection, shellClass: 'layout-public' });
  assert.ok(classes.startsWith('layout-public '));
  assert.ok(classes.includes('grid-asymmetric'));
  assert.ok(classes.includes('mobile-order-conversion-first'));
  // No direction, no classes. A build that never chose one keeps its old shell.
  assert.equal(visualDirectionClasses({ id: null, shellClass: 'layout-public' }), 'layout-public');
});
