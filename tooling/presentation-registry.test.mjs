import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  auditComposedPresentation,
  compilePresentationRegistry,
  loadPresentationManifest,
  readyPresentation,
  unmetPresentationRequirements,
  unresolvableTokens,
} from './lib/presentation-registry.mjs';
import { compileDesignTokens } from './lib/design-choices.mjs';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { buildGenerationPlan, loadCatalog } from './lib/generator.mjs';
import { componentVariants } from '../apps/service/src/section-variants.js';

const TEMPLATE = JSON.parse(fs.readFileSync('templates/react-vite-neutral/template.json', 'utf8'));
const MANIFEST = loadPresentationManifest();
const TOKENS_CSS = fs.readFileSync('templates/shared/presentation/tokens.css', 'utf8');
const REGISTRY = compilePresentationRegistry({ template: TEMPLATE, manifest: MANIFEST });

function projectManifest() {
  return JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
}

test('the registry is seeded only from components the factory actually renders', () => {
  const rendered = new Set(Object.keys(TEMPLATE.presentation.components));
  assert.deepEqual(new Set(Object.keys(REGISTRY.components)), rendered, 'every rendered component is described and nothing else is');
  assert.equal(REGISTRY.templateId, TEMPLATE.id);
  assert.equal(REGISTRY.presentationVersion, TEMPLATE.presentation.version);

  // Variants stay the template's declaration rather than being restated, so
  // there is one place a presentation can be added.
  for (const [sectionType, entry] of Object.entries(REGISTRY.components)) {
    assert.deepEqual(entry.variants.map((variant) => variant.id), (TEMPLATE.presentation.components[sectionType].variants ?? []).map((variant) => variant.id));
    assert.equal(entry.componentVersion, TEMPLATE.presentation.components[sectionType].version);
  }

  // A catalogue of components nobody renders is exactly what this refuses.
  assert.throws(
    () => compilePresentationRegistry({ template: TEMPLATE, manifest: { components: { ...MANIFEST.components, 'pricing-comparison-section': { sectionType: 'pricing-comparison', lifecycle: 'ready', renderer: 'template', runtimeRequirements: [], tokens: [] } } } }),
    /does not render. Seed the registry from components that exist/,
  );
  const { 'hero-section': _dropped, ...withoutHero } = MANIFEST.components;
  assert.throws(() => compilePresentationRegistry({ template: TEMPLATE, manifest: { components: withoutHero } }), /the template renders hero-section but the manifest does not describe them/);
  assert.throws(
    () => compilePresentationRegistry({ template: TEMPLATE, manifest: { components: { ...MANIFEST.components, 'hero-section': { ...MANIFEST.components['hero-section'], lifecycle: 'someday' } } } }),
    /declares lifecycle someday/,
  );
});

test('every ready component depends on tokens a build can actually resolve', () => {
  const plan = buildGenerationPlan(projectManifest(), { catalog: loadCatalog() });
  const compiled = compileDesignTokens(plan.design);
  const defaults = new Set([...TOKENS_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  assert.deepEqual(unresolvableTokens(REGISTRY, { compiled, defaults }), [], 'a ready component must not depend on a custom property nothing defines');

  // The check is what makes the declaration worth carrying: drop the compiler
  // output and the template defaults, and every dependency becomes unresolvable.
  const stranded = unresolvableTokens(REGISTRY, { compiled: {}, defaults: new Set() });
  assert.ok(stranded.length > 0);
  assert.ok(stranded.some((entry) => entry.componentId === 'hero-section' && entry.token === '--hero-scale'), 'the hero depends on the art-direction token that sizes it');
  assert.ok(stranded.some((entry) => entry.componentId === 'gallery-section' && entry.token === '--motion-decorative-scale'), 'the gallery depends on the motion token that moves it');

  // A planned entry is a description, not a promise, so it is not held to this.
  const planned = { ...REGISTRY, components: { ...REGISTRY.components, hero: { ...REGISTRY.components.hero, lifecycle: 'planned', tokens: ['--not-a-token'] } } };
  assert.deepEqual(unresolvableTokens(planned, { compiled, defaults }), []);
});

test('a section whose presentation the build cannot satisfy is refused, not rendered empty', () => {
  const enquiry = REGISTRY.components['enquiry-form'];
  assert.equal(enquiry.renderer, 'recipe');
  assert.ok(enquiry.runtimeRequirements.includes('recipe:lead-generation'));

  // The failure this exists for is quiet: the section renders as a heading with
  // nothing under it when the recipe that owns it was never installed.
  assert.deepEqual(unmetPresentationRequirements(enquiry, { recipeIds: ['seo'] }), ['recipe:lead-generation']);
  assert.deepEqual(unmetPresentationRequirements(enquiry, { recipeIds: ['lead-generation'] }), []);

  // A gallery composes with no pictures at all where it only points at where
  // the work lives, so asset placement is not one of its requirements. A
  // requirement nothing can fail is not a requirement.
  assert.deepEqual(unmetPresentationRequirements(REGISTRY.components.gallery, { recipeIds: [] }), []);
  assert.deepEqual(
    unmetPresentationRequirements({ runtimeRequirements: ['a-thing-nobody-checks'] }, { recipeIds: [] }),
    ['unknown:a-thing-nobody-checks'],
    'a manifest must not be able to declare a dependency nothing knows how to check',
  );

  const composition = { sections: [{ id: 'page-contact-enquiry', type: 'enquiry-form', variant: 'default' }] };
  assert.deepEqual(
    auditComposedPresentation({ registry: REGISTRY, composition, recipeIds: [] }),
    [{ sectionId: 'page-contact-enquiry', sectionType: 'enquiry-form', problem: 'unmet-requirement', detail: 'recipe:lead-generation' }],
  );
  assert.deepEqual(auditComposedPresentation({ registry: REGISTRY, composition, recipeIds: ['lead-generation'] }), []);

  const unregistered = auditComposedPresentation({ registry: REGISTRY, composition: { sections: [{ id: 'page-home-pricing', type: 'pricing-comparison', variant: 'default' }] }, recipeIds: [] });
  assert.equal(unregistered[0].problem, 'unregistered');
});

test('a variant nothing renders never reaches a generated repository', () => {
  // The composer used to name presentations the template never implemented —
  // `accent` on a call to action, `prose` on a passage, `panel` on the enquiry
  // form. They travelled into the composition, the generated module and element
  // identity, and styled nothing.
  const composition = { sections: [{ id: 'page-home-cta', type: 'cta', variant: 'accent' }] };
  assert.deepEqual(
    auditComposedPresentation({ registry: REGISTRY, composition, recipeIds: [] }),
    [{ sectionId: 'page-home-cta', sectionType: 'cta', problem: 'unrendered-variant', detail: 'cta-section does not render accent. It renders: default.' }],
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-presentation-'));
  try {
    const out = path.join(tmp, 'project');
    const { plan, composition: composed } = generateComposedProject(projectManifest(), out, {});
    assert.deepEqual(auditComposedPresentation({ registry: REGISTRY, composition: composed, recipeIds: plan.recipes.map((recipe) => recipe.id) }), [], 'a real build must place nothing the registry refuses');
    for (const section of composed.sections) {
      const allowed = ['default', ...REGISTRY.components[section.type].variants.map((variant) => variant.id)];
      assert.ok(allowed.includes(section.variant), `${section.id} is composed as ${section.variant}`);
    }
    assert.equal(fs.readFileSync(path.join(out, 'src/generated/composition.ts'), 'utf8').includes('"variant": "prose"'), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the Console is offered presentations through the registry, not straight from the template', () => {
  const offered = componentVariants(TEMPLATE, 'item-grid');
  assert.deepEqual(offered.variants.map((variant) => variant.id), ['cards', 'list', 'features']);
  assert.equal(componentVariants(TEMPLATE, 'contact-panel').variants.length, 0, 'a component that renders one way offers no choice');
  assert.deepEqual(componentVariants(TEMPLATE, 'pricing-comparison'), { component: null, variants: [] });

  // A described but not-yet-ready component is offered to nobody, which is the
  // reason the offering goes through the registry at all.
  const plannedTemplate = structuredClone(TEMPLATE);
  const plannedRegistry = compilePresentationRegistry({
    template: plannedTemplate,
    manifest: { components: { ...MANIFEST.components, 'item-grid-section': { ...MANIFEST.components['item-grid-section'], lifecycle: 'planned' } } },
  });
  assert.equal(readyPresentation(plannedRegistry, 'item-grid'), null);
  assert.ok(readyPresentation(plannedRegistry, 'hero'));
});
