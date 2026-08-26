import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import {
  assertEditableElement,
  bindingElementKey,
  composeProject,
  deriveElementIdentities,
  elementRef,
  parseElementRef,
  resolveElementIdentity,
  stripContentOverrides,
  applyContentOverrides,
} from '../packages/composition/src/index.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { readJson } from './lib/manifest.mjs';

const template = readJson('templates/react-vite-neutral/template.json');
const presentation = template.presentation;
const SECTION_TYPES = readJson('schemas/section-spec.schema.json').properties.type.enum;

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

function marketingManifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Identity Test', slug, type: 'marketing-site', primaryGoal: 'Prove a rendered element resolves to one identity.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Identity Test' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function derive(composition = composeProject({ manifest: readJson('examples/project-manifest.example.json') })) {
  return deriveElementIdentities({
    composition,
    presentation,
    projectId: 'project-identity-test',
    templateId: template.id,
    templateVersion: template.version,
  });
}

test('the template declares a presentation component for every composable section type', () => {
  const declared = Object.keys(presentation.components);
  assert.deepEqual(SECTION_TYPES.filter((type) => !declared.includes(type)), [], 'an undeclared section type cannot be identified, so it cannot be edited');
  const roles = new Set(Object.keys(presentation.elementRoles));
  for (const [type, component] of Object.entries(presentation.components)) {
    for (const role of [...Object.values(component.bindingRoles), component.defaultBindingRole]) {
      assert.ok(roles.has(role), `${type} maps to undeclared element role ${role}`);
    }
  }
  for (const structural of ['section', 'action', 'asset']) {
    assert.ok(roles.has(structural), `the structural ${structural} role must be declared`);
  }
});

test('a derived index satisfies its contract and addresses every binding of every section', () => {
  const composition = composeProject({ manifest: readJson('examples/project-manifest.example.json') });
  const index = derive(composition);
  assert.deepEqual(validateContract('element-identity', index), []);

  const pageOfSection = new Map();
  for (const page of composition.pages) for (const id of page.sectionIds) pageOfSection.set(id, page.id);
  for (const section of composition.sections) {
    for (const binding of section.bindings) {
      const ref = elementRef(pageOfSection.get(section.id), section.id, bindingElementKey(binding.key));
      assert.ok(index.elements.some((entry) => entry.ref === ref), `no identity for ${ref}`);
    }
    assert.ok(index.elements.some((entry) => entry.ref === elementRef(pageOfSection.get(section.id), section.id, 'section')));
  }
  assert.equal(new Set(index.elements.map((entry) => entry.ref)).size, index.elements.length, 'refs must be unique');
});

test('an identity carries the whole chain from page to token', () => {
  const index = derive();
  const hero = index.elements.find((entry) => entry.sectionType === 'hero' && entry.bindingKey === 'title');
  assert.ok(hero);
  assert.equal(hero.componentId, 'hero-section');
  assert.equal(hero.componentInstanceId, hero.sectionId);
  assert.equal(hero.elementRole, 'display');
  assert.equal(hero.pagePath, '/');
  assert.deepEqual(hero.editableProperties, ['text']);
  assert.ok(hero.designTokens.includes('--text-4xl'));
  assert.equal(hero.sourceLocation.artifact, '.app-builder/composition.json');
  assert.match(hero.sourceLocation.pointer, /^\/sections\/\d+\/bindings\/\d+$/);
  assert.equal(hero.sourceLocation.renderer, 'src/App.tsx');
  assert.ok(hero.provenance.origin);
});

test('derivation is deterministic for the same composition', () => {
  assert.deepEqual(derive(), derive());
});

test('an element the template declares no editable property for fails closed', () => {
  const index = derive();
  const section = index.elements.find((entry) => entry.elementKey === 'section');
  assert.deepEqual(section.editableProperties, []);
  assert.throws(() => assertEditableElement(index, section.ref, 'text'), /does not expose an editable text property/);
});

test('missing, stale and malformed identities are distinguished and all refused', () => {
  const index = derive();
  const valid = index.elements.find((entry) => entry.editableProperties.includes('text'));

  assert.equal(resolveElementIdentity(index, valid.ref).status, 'resolved');
  assert.equal(resolveElementIdentity(index, 'page-home/page-home-hero/binding:nothing').status, 'unknown');
  assert.equal(resolveElementIdentity(index, '../../etc/passwd').status, 'malformed');
  assert.equal(resolveElementIdentity(index, 'page-home/page-home-hero').status, 'malformed');
  assert.equal(resolveElementIdentity(index, null).status, 'malformed');
  assert.equal(resolveElementIdentity(index, valid.ref, { compositionHash: 'f'.repeat(64) }).status, 'stale');

  for (const [ref, reason] of [
    ['page-home/page-home-hero/binding:nothing', /does not resolve/],
    ['not-an-address', /is not a valid element address/],
  ]) {
    assert.throws(() => assertEditableElement(index, ref, 'text'), reason);
  }
  assert.throws(() => assertEditableElement(index, valid.ref, 'text', { compositionHash: 'f'.repeat(64) }), /moved past/);
});

test('parseElementRef refuses an address that is not one', () => {
  assert.deepEqual(parseElementRef('page-home/page-home-hero/binding:title'), { pageId: 'page-home', sectionId: 'page-home-hero', elementKey: 'binding:title' });
  for (const bad of ['', 'a/b', 'a/b/c/d', 'PAGE/section/binding:title', 'page/section/whatever', 42, undefined]) {
    assert.equal(parseElementRef(bad), null, `${String(bad)} must not parse`);
  }
});

test('derivation refuses a template with no presentation contract', () => {
  assert.throws(
    () => deriveElementIdentities({ composition: composeProject({ manifest: readJson('examples/project-manifest.example.json') }), presentation: null, projectId: 'p', templateId: 'bare' }),
    /declares no presentation contract/,
  );
});

test('a human edit does not move any element address', () => {
  const composition = composeProject({ manifest: readJson('examples/project-manifest.example.json') });
  const hero = composition.sections.find((section) => section.type === 'hero');
  const edited = applyContentOverrides(composition, [{ sectionId: hero.id, bindingKey: 'title', value: 'Written by a person', editedAt: '2026-08-25T00:00:00.000Z' }]);
  assert.notEqual(edited.compositionHash, composition.compositionHash);
  assert.equal(stripContentOverrides(edited).compositionHash, composition.compositionHash);
  assert.deepEqual(derive(stripContentOverrides(edited)).elements.map((entry) => entry.ref), derive(composition).elements.map((entry) => entry.ref));
});

test('a generated build records an index the service resolves, and refuses an edit that does not', async () => {
  const dirs = roots('app-builder-identity-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-identity', manifest: marketingManifest('identity-test') });

    // Before a build there is no index, so there is nothing an edit can attach
    // to and the service says so rather than writing hopefully.
    await assert.rejects(
      () => service.saveOverrides(project.id, [{ sectionId: 'page-home-hero', bindingKey: 'title', value: 'Too early', editedAt: '2026-08-25T00:00:00.000Z' }]),
      /Unresolved element identity/,
    );

    const generated = await service.generateProject(project.id);
    const written = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.app-builder/element-identity.json'), 'utf8'));
    assert.deepEqual(validateContract('element-identity', written), []);
    assert.equal(written.projectId, project.id);
    // A marketing site is rendered statically, so this is also the proof that
    // direct manipulation survives the static renderer: the index the Builder
    // resolves against is derived from the composition and the template's
    // presentation contract, and neither of those is React's.
    assert.equal(written.templateId, 'astro-static-content');
    assert.equal(written.compositionHash, generated.composition.compositionHash);

    // The index is builder metadata, not something the app imports.
    assert.equal(fs.existsSync(path.join(generated.workspace, 'src/generated/element-identity.ts')), false);

    const heroId = generated.composition.sections.find((section) => section.type === 'hero').id;
    const resolved = service.resolveElement(project.id, { pageId: 'page-home', sectionId: heroId, elementKey: 'binding:title' });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.identity.componentId, 'hero-section');
    assert.equal(resolved.identity.provenance.overridden, false);

    for (const target of [
      { pageId: 'page-home', sectionId: heroId, elementKey: 'binding:invented' },
      { pageId: 'page-nowhere', sectionId: heroId, elementKey: 'binding:title' },
    ]) {
      assert.equal(service.resolveElement(project.id, target).status, 'unknown');
    }
    assert.equal(service.resolveElement(project.id, { pageId: '..', sectionId: heroId, elementKey: 'binding:title' }).status, 'malformed');

    // A section the build does not render cannot be edited.
    await assert.rejects(
      () => service.saveOverrides(project.id, [{ sectionId: 'page-home-invented', bindingKey: 'title', value: 'Nowhere', editedAt: '2026-08-25T00:00:00.000Z' }]),
      /Unresolved element identity/,
    );
    // Nor can a binding key the section does not carry.
    await assert.rejects(
      () => service.saveOverrides(project.id, [{ sectionId: heroId, bindingKey: 'invented', value: 'Nowhere', editedAt: '2026-08-25T00:00:00.000Z' }]),
      /Unresolved element identity/,
    );
    assert.deepEqual(service.readOverrides(project.id).overrides, []);

    // A resolvable edit still works, and resolution then reports live provenance.
    await service.saveOverrides(project.id, [{ sectionId: heroId, bindingKey: 'title', value: 'Painters in Glasgow', editedAt: '2026-08-25T00:00:00.000Z' }]);
    const afterEdit = service.resolveElement(project.id, { pageId: 'page-home', sectionId: heroId, elementKey: 'binding:title' });
    assert.equal(afterEdit.status, 'resolved', 'writing a sentence must not invalidate the address it was written at');
    assert.equal(afterEdit.identity.provenance.origin, 'human');
    assert.equal(afterEdit.identity.provenance.overridden, true);

    // An out-of-band change to the composition makes the index stale rather
    // than letting an edit land against an index that no longer describes it.
    const compositionFile = path.join(generated.workspace, '.app-builder/composition.json');
    const tampered = JSON.parse(fs.readFileSync(compositionFile, 'utf8'));
    tampered.sections.find((section) => section.id === heroId).purpose = 'Changed outside the factory';
    fs.writeFileSync(compositionFile, JSON.stringify(tampered, null, 2));
    assert.equal(service.resolveElement(project.id, { pageId: 'page-home', sectionId: heroId, elementKey: 'binding:title' }).status, 'stale');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
