import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyContentOverrides, composeProject } from '../packages/composition/src/index.js';
import { validateContract } from '@app-builder/contracts';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { readJson } from './lib/manifest.mjs';

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

function marketingManifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Override Test', slug, type: 'marketing-site', primaryGoal: 'Prove human edits survive a rebuild.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Override Test' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

test('an edit is marked human and keeps what it replaced', () => {
  const composition = composeProject({ manifest: readJson('examples/project-manifest.example.json') });
  const hero = composition.sections.find((section) => section.type === 'hero');
  const before = hero.bindings.find((entry) => entry.key === 'title');

  const edited = applyContentOverrides(composition, [{ sectionId: hero.id, bindingKey: 'title', value: 'Written by a person', editedAt: '2026-08-25T00:00:00.000Z' }]);
  const after = edited.sections.find((section) => section.id === hero.id).bindings.find((entry) => entry.key === 'title');

  assert.equal(after.value, 'Written by a person');
  assert.equal(after.origin, 'human');
  assert.equal(after.generated, false, 'a human sentence is not factory-generated copy');
  assert.deepEqual(after.overriddenFrom, { origin: before.origin, value: before.value });
  assert.notEqual(edited.compositionHash, composition.compositionHash);
  assert.deepEqual(validateContract('composition', edited), []);
});

test('composition without edits is untouched and identical', () => {
  const composition = composeProject({ manifest: readJson('examples/project-manifest.example.json') });
  assert.equal(applyContentOverrides(composition, []), composition);
  assert.equal(applyContentOverrides(composition, [{ sectionId: 'page-nowhere', bindingKey: 'title', value: 'x', editedAt: 'now' }]), composition);
});

test('edits reach the live workspace and survive a rebuild', async () => {
  const dirs = roots('app-builder-overrides-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-overrides', manifest: marketingManifest('override-test') });
    const generated = await service.generateProject(project.id);
    const heroId = generated.composition.sections.find((section) => section.type === 'hero').id;

    const saved = await service.saveOverrides(project.id, [{ sectionId: heroId, bindingKey: 'title', value: 'Painters in Glasgow', editedAt: '2026-08-25T00:00:00.000Z' }]);
    assert.equal(saved.overrides.length, 1);

    // The running preview renders the workspace composition, so the edit has to
    // be there rather than only in the durable record.
    const live = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.app-builder/composition.json'), 'utf8'));
    const liveTitle = live.sections.find((section) => section.id === heroId).bindings.find((entry) => entry.key === 'title');
    assert.equal(liveTitle.value, 'Painters in Glasgow');
    assert.equal(liveTitle.origin, 'human');
    assert.match(fs.readFileSync(path.join(generated.workspace, 'src/generated/composition.ts'), 'utf8'), /Painters in Glasgow/);

    const rebuilt = await service.generateProject(project.id);
    assert.notEqual(rebuilt.workspace, generated.workspace);
    const rebuiltTitle = rebuilt.composition.sections.find((section) => section.id === heroId).bindings.find((entry) => entry.key === 'title');
    assert.equal(rebuiltTitle.value, 'Painters in Glasgow', 'a rebuild must not discard what someone wrote by hand');
    assert.equal(rebuiltTitle.origin, 'human');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('removing an edit restores the generated value rather than freezing the last one', async () => {
  const dirs = roots('app-builder-overrides-revert-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-revert', manifest: marketingManifest('revert-test') });
    const generated = await service.generateProject(project.id);
    const heroId = generated.composition.sections.find((section) => section.type === 'hero').id;
    const original = generated.composition.sections.find((section) => section.id === heroId).bindings.find((entry) => entry.key === 'title').value;

    await service.saveOverrides(project.id, [{ sectionId: heroId, bindingKey: 'title', value: 'Temporary', editedAt: '2026-08-25T00:00:00.000Z' }]);
    await service.saveOverrides(project.id, []);

    const live = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.app-builder/composition.json'), 'utf8'));
    const title = live.sections.find((section) => section.id === heroId).bindings.find((entry) => entry.key === 'title');
    assert.equal(title.value, original);
    assert.equal(title.origin !== 'human', true, 'reverting returns the binding to its deterministic origin');
    assert.equal('overriddenFrom' in title, false);

    // A composition whose hash describes different content than it holds is
    // worse than no hash at all.
    const { compositionHash, ...rest } = live;
    const rebuiltHash = createHash('sha256').update(JSON.stringify(rest)).digest('hex');
    assert.equal(compositionHash, rebuiltHash, 'the recorded hash must match the restored content');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('malformed edits are refused before anything is written', async () => {
  const dirs = roots('app-builder-overrides-invalid-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-invalid', manifest: marketingManifest('invalid-test') });
    for (const bad of [
      [{ sectionId: '../escape', bindingKey: 'title', value: 'x', editedAt: 'now' }],
      [{ sectionId: 'page-home-hero', value: 'x', editedAt: 'now' }],
      [{ sectionId: 'page-home-hero', bindingKey: 'title', value: 42, editedAt: 'now' }],
    ]) {
      await assert.rejects(() => service.saveOverrides(project.id, bad), /Invalid content-override/);
    }
    assert.deepEqual(service.readOverrides(project.id).overrides, []);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
