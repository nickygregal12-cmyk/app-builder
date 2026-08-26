import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { compileDesignSystemSpec, renderDesignSystemCss } from './lib/design-choices.mjs';
import { generateProject, loadCatalog, reconcileProjectRecipes } from './lib/generator.mjs';

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: {
      name: 'Portable Design Test',
      slug,
      type: 'marketing-site',
      primaryGoal: 'Prove the compiled design remains portable and reproducible.',
    },
    audience: { summary: 'Prospective customers', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: {
      identity: { name: 'Portable Design Test' },
      services: ['Consulting'],
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
    constraints: {
      hard: [],
      expectedScale: 'under-1000',
      sensitivity: 'normal-business-data',
      tenantModel: '',
      integrations: [],
      existingData: [],
      uploadTypes: [],
      customCapabilities: [],
      excludedCapabilities: [],
      unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    root,
    stateRoot: path.join(root, 'state'),
    workspacesRoot: path.join(root, 'workspaces'),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function designSpec(workspace) {
  return readJson(path.join(workspace, '.product', 'design-system.json'));
}

function assertPortableDesign(workspace, design) {
  const spec = designSpec(workspace);
  assert.deepEqual(spec, compileDesignSystemSpec(design), 'portable DesignSystemSpec must be the exact compiler output for the live design');
  assert.equal(
    fs.readFileSync(path.join(workspace, 'src/generated/brand.css'), 'utf8'),
    renderDesignSystemCss(spec),
    'the stylesheet must render from the same spec that was persisted',
  );

  const projectRecord = readJson(path.join(workspace, '.app-builder', 'project.json'));
  assert.equal(projectRecord.designSystemSpec, '.product/design-system.json');
  const handover = readJson(path.join(workspace, '.app-builder', 'handover.json'));
  assert.equal(handover.designSystemSpec, '.product/design-system.json');

  const packageJson = readJson(path.join(workspace, 'package.json'));
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];
  assert.equal(
    dependencyNames.some((name) => name.startsWith('@app-builder/')),
    false,
    'portable design metadata must not make the generated app depend on App Builder at runtime or build time',
  );
  return spec;
}

test('DesignSystemSpec is portable, live-synchronised and reproducible across rebuilds', async () => {
  const dirs = roots('app-builder-portable-design-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });

  try {
    const project = service.createProject({ id: 'project-portable-design', manifest: manifest('portable-design-test') });
    const first = await service.generateProject(project.id);
    const initialDesign = service.designContract(project.id).design;
    const initialSpec = assertPortableDesign(first.workspace, initialDesign);
    assert.equal(initialSpec.authority, 'design-contract');
    assert.ok(first.checkpoint.artifacts.includes('.product/design-system.json'), 'the generated repository checkpoint must name the portable design artifact');

    const updated = await service.writeDesignChoices(project.id, {
      density: 'dense',
      accentColor: '#7a1f3d',
      maxWidth: '90rem',
    });
    const liveSpec = assertPortableDesign(first.workspace, updated.design);
    assert.equal(liveSpec.controls.density, 'dense');
    assert.equal(liveSpec.controls.accentColor, '#7a1f3d');
    assert.equal(liveSpec.controls.maxWidth, '90rem');
    assert.notDeepEqual(liveSpec, initialSpec, 'a real design edit must change the portable artifact');

    const second = await service.generateProject(project.id);
    assert.notEqual(second.workspace, first.workspace, 'a rebuild must remain a new ordinary repository version');
    const rebuiltDesign = service.designContract(project.id).design;
    const rebuiltSpec = assertPortableDesign(second.workspace, rebuiltDesign);
    assert.deepEqual(rebuiltSpec, liveSpec, 'durable design choices must reproduce the same DesignSystemSpec in the next workspace');

    const oldSpec = designSpec(first.workspace);
    assert.deepEqual(oldSpec, liveSpec, 'creating a new build must not rewrite the previous repository under review');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('clearing a human design override returns the portable spec to the factory-composed value', async () => {
  const dirs = roots('app-builder-portable-design-clear-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });

  try {
    const project = service.createProject({ id: 'project-portable-design-clear', manifest: manifest('portable-design-clear') });
    const build = await service.generateProject(project.id);
    const composedSpec = assertPortableDesign(build.workspace, service.designContract(project.id).design);

    await service.writeDesignChoices(project.id, { density: 'dense', radius: '0rem' });
    const overridden = assertPortableDesign(build.workspace, service.designContract(project.id).design);
    assert.equal(overridden.controls.density, 'dense');
    assert.equal(overridden.controls.radius, '0rem');

    // Clearing one control must return that control alone, and the whole
    // artifact must be recompiled rather than left carrying the old token.
    const cleared = await service.writeDesignChoices(project.id, { radius: null });
    assert.equal(Object.hasOwn(cleared.chosen, 'radius'), false, 'a cleared control must stop being a durable human choice');
    const clearedSpec = assertPortableDesign(build.workspace, cleared.design);
    assert.equal(clearedSpec.controls.radius, composedSpec.controls.radius, 'a cleared control must return to the factory-composed value');
    assert.equal(clearedSpec.tokens['--layout-radius'], composedSpec.tokens['--layout-radius']);
    assert.equal(clearedSpec.controls.density, 'dense', 'clearing one control must not discard the others');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('recipe reconciliation preserves the portable design system artifact', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-portable-design-recipes-'));
  const out = path.join(tmp, 'project');

  try {
    const catalog = loadCatalog();
    const projectManifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
    generateProject(projectManifest, out, { catalog, designChoices: { density: 'dense', accentColor: '#7a1f3d' } });
    const before = designSpec(out);
    assert.equal(before.controls.density, 'dense');
    assert.equal(before.controls.accentColor, '#7a1f3d');

    // Adding and removing a capability is not a design decision. The compiled
    // artifact and the stylesheet must both survive it unchanged.
    reconcileProjectRecipes(out, ['feature-flags', 'seo'], { catalog });
    assert.deepEqual(designSpec(out), before, 'installing a recipe must not reset the compiled design system');
    reconcileProjectRecipes(out, ['seo'], { catalog });
    const after = designSpec(out);
    assert.deepEqual(after, before, 'removing a recipe must not reset the compiled design system');
    assert.equal(fs.readFileSync(path.join(out, 'src/generated/brand.css'), 'utf8'), renderDesignSystemCss(after));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
