import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import { applySectionVariants, composeProject, stripSectionVariants } from '../packages/composition/src/index.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { chooseSectionVariant, sectionVariantOptions } from '../apps/service/src/section-variants.js';
import { readJson } from './lib/manifest.mjs';

const template = readJson('templates/react-vite-neutral/template.json');
const STYLES = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');
const APP = fs.readFileSync('templates/react-vite-neutral/files/src/App.tsx', 'utf8');

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Variant Test', slug, type: 'marketing-site', primaryGoal: 'Prove a section can be shown more than one way.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Services', 'Contact'],
    entities: [],
    company: {
      identity: { name: 'Variant Test' },
      services: ['Painting', 'Joinery', 'Fitted furniture'],
      locations: ['Glasgow'],
      contactDetails: { email: 'hello@example.com' },
      trustSignals: [],
      conversionGoals: ['email'],
    },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

test('every declared variant is one the template actually renders differently', () => {
  const declared = new Set(Object.values(template.presentation.components).flatMap((component) => (component.variants ?? []).map((variant) => variant.id)));
  assert.ok(declared.size > 0, 'a template that declares no variants offers no choice at all');

  // A declared variant that changes nothing would be a control that does
  // nothing, so each one has to be reachable in the renderer or the stylesheet.
  for (const variant of declared) {
    const rendered = APP.includes(`'${variant}'`) || STYLES.includes(`.variant-${variant}`) || STYLES.includes(`.${variant}-list`);
    assert.ok(rendered, `variant ${variant} is declared but nothing renders it differently`);
  }

  // And a component with a single presentation declares no choice rather than
  // offering the one it already has.
  for (const [type, component] of Object.entries(template.presentation.components)) {
    assert.ok(Array.isArray(component.variants), `${type} must declare its variants, even as an empty list`);
    assert.notEqual(component.variants.length, 1, `${type} offers a choice of one, which is not a choice`);
    const ids = component.variants.map((variant) => variant.id);
    assert.equal(new Set(ids).size, ids.length, `${type} declares a duplicate variant`);
  }
});

test('a chosen variant is applied, keeps what it replaced and is recoverable', () => {
  const composition = composeProject({ manifest: manifest('apply') });
  const section = composition.sections.find((entry) => entry.type === 'item-grid');
  assert.ok(section);

  const chosen = applySectionVariants(composition, [{ sectionId: section.id, variant: 'features' }]);
  const after = chosen.sections.find((entry) => entry.id === section.id);
  assert.equal(after.variant, 'features');
  assert.equal(after.variantOverriddenFrom, section.variant);
  assert.notEqual(chosen.compositionHash, composition.compositionHash);
  assert.deepEqual(validateContract('composition', chosen), []);

  const restored = stripSectionVariants(chosen);
  assert.equal(restored.sections.find((entry) => entry.id === section.id).variant, section.variant);
  assert.equal('variantOverriddenFrom' in restored.sections.find((entry) => entry.id === section.id), false);
  assert.equal(restored.compositionHash, composition.compositionHash, 'stripping returns exactly what the factory composed');
});

test('choosing what was already composed changes nothing', () => {
  const composition = composeProject({ manifest: manifest('noop') });
  const section = composition.sections.find((entry) => entry.type === 'item-grid');
  assert.equal(applySectionVariants(composition, [{ sectionId: section.id, variant: section.variant }]), composition);
  assert.equal(applySectionVariants(composition, []), composition);
  assert.equal(applySectionVariants(composition, [{ sectionId: 'page-nowhere', variant: 'list' }]), composition);
});

test('a section can only be shown a way its template renders', async () => {
  const dirs = roots('app-builder-variants-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-variants', manifest: manifest('variant-test') });

    await assert.rejects(() => chooseSectionVariant(service, project.id, 'page-home-services', 'list'), /Presentation choices need a generated build/);
    assert.deepEqual(sectionVariantOptions(service, project.id), []);

    const generated = await service.generateProject(project.id);
    const options = sectionVariantOptions(service, project.id);
    assert.ok(options.length > 0, 'a build with item sections offers presentation choices');

    // A component with one presentation is not offered at all.
    const offeredTypes = new Set(options.map((entry) => entry.sectionType));
    assert.equal(offeredTypes.has('contact-panel'), false, 'a component that renders one way offers no choice');
    for (const option of options) assert.ok(option.variants.length >= 2);

    const target = options.find((entry) => entry.sectionType === 'item-grid');
    assert.ok(target);
    assert.equal(target.chosen, false);
    assert.ok(target.pageId && target.pagePath, 'a choice is offered where the section actually appears');

    await assert.rejects(() => chooseSectionVariant(service, project.id, target.sectionId, 'carousel'), /does not render carousel\. It offers: cards, list, features/);
    await assert.rejects(() => chooseSectionVariant(service, project.id, 'page-home-invented', 'list'), /Unknown project section/);
    assert.deepEqual(service.readSectionVariants(project.id).choices, []);

    await chooseSectionVariant(service, project.id, target.sectionId, 'features');
    assert.deepEqual(validateContract('section-variant', service.readSectionVariants(project.id)), []);

    // A presentation choice is composition, so the running preview shows it
    // without a rebuild.
    const live = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.app-builder/composition.json'), 'utf8'));
    const liveSection = live.sections.find((entry) => entry.id === target.sectionId);
    assert.equal(liveSection.variant, 'features');
    assert.equal(liveSection.variantOverriddenFrom, target.variant);
    assert.match(fs.readFileSync(path.join(generated.workspace, 'src/generated/composition.ts'), 'utf8'), /"variant": "features"/);

    const afterChoice = sectionVariantOptions(service, project.id).find((entry) => entry.sectionId === target.sectionId);
    assert.equal(afterChoice.variant, 'features');
    assert.equal(afterChoice.composedVariant, target.variant);
    assert.equal(afterChoice.chosen, true);

    // It survives a rebuild, and identity is unaffected because a presentation
    // choice does not move the element it applies to.
    const before = service.resolveElement(project.id, { pageId: target.pageId, sectionId: target.sectionId, elementKey: 'binding:title' });
    assert.equal(before.status, 'resolved');

    const rebuilt = await service.generateProject(project.id);
    assert.equal(rebuilt.composition.sections.find((entry) => entry.id === target.sectionId).variant, 'features', 'a rebuild must not discard how someone decided the page should read');
    assert.equal(service.resolveElement(project.id, { pageId: target.pageId, sectionId: target.sectionId, elementKey: 'binding:title' }).status, 'resolved');

    // Clearing returns the section to what the factory composed.
    await chooseSectionVariant(service, project.id, target.sectionId, 'clear');
    assert.deepEqual(service.readSectionVariants(project.id).choices, []);
    const cleared = JSON.parse(fs.readFileSync(path.join(rebuilt.workspace, '.app-builder/composition.json'), 'utf8'));
    const clearedSection = cleared.sections.find((entry) => entry.id === target.sectionId);
    assert.equal(clearedSection.variant, target.variant);
    assert.equal('variantOverriddenFrom' in clearedSection, false);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
