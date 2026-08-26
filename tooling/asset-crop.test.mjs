import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CROP_ROLES, cropWindow } from '../packages/content-intelligence/src/index.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { assetInventory, decideProjectAsset, originalAssetPath, recropProjectAsset } from '../apps/service/src/asset-governance.js';

function photo(label = 'WORK', width = 2000, height = 1500) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#2f5d3a"/><text x="80" y="400" font-size="90" fill="#fff">${label}</text></svg>`);
}

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Crop Test', slug, type: 'marketing-site', primaryGoal: 'Prove a person can say where the subject is.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Work', 'Contact'],
    entities: [],
    company: { identity: { name: 'Crop Test' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
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

test('a crop window keeps the chosen point centred until the edges stop it', () => {
  const source = { width: 2000, height: 1500, targetWidth: 1600, targetHeight: 900 };

  const centred = cropWindow({ ...source, focalPoint: { x: 0.5, y: 0.5 } });
  assert.equal(centred.width, 2000, 'a 16:9 window from a 4:3 image is as wide as the image');
  assert.equal(centred.height, 1125);
  assert.equal(centred.left, 0);
  assert.equal(centred.top, Math.round((1500 - 1125) / 2));

  // A subject near the top pulls the window up, not off.
  const high = cropWindow({ ...source, focalPoint: { x: 0.5, y: 0.1 } });
  assert.equal(high.top, 0);
  assert.equal(high.height, centred.height, 'moving the point changes where the window sits, not its size');

  const low = cropWindow({ ...source, focalPoint: { x: 0.5, y: 0.95 } });
  assert.equal(low.top, 1500 - 1125, 'the window stops at the bottom edge rather than running past it');
});

test('a window never escapes the image, whatever it is asked for', () => {
  for (const focalPoint of [{ x: -5, y: -5 }, { x: 5, y: 5 }, { x: 0, y: 1 }, {}, null]) {
    for (const { width, height } of CROP_ROLES) {
      const window = cropWindow({ width: 1800, height: 1200, targetWidth: width, targetHeight: height, focalPoint });
      assert.ok(window.left >= 0 && window.top >= 0, `negative origin for ${JSON.stringify(focalPoint)}`);
      assert.ok(window.left + window.width <= 1800, 'window runs off the right edge');
      assert.ok(window.top + window.height <= 1200, 'window runs off the bottom edge');
      assert.ok(window.width > 0 && window.height > 0);
    }
  }
});

test('an ingested image keeps its original so a crop can be recomputed from it', async () => {
  const dirs = roots('app-builder-crop-original-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-crop-original', manifest: manifest('crop-original') });
    await service.ingestSources(project.id, [
      { type: 'file', name: 'work.svg', label: 'Recent work', kind: 'image', data: photo(), purpose: 'portfolio', approvedForUse: true },
    ]);
    const asset = service.getKnowledgePack(project.id).assets[0];
    const original = originalAssetPath(service, project.id, asset);
    assert.ok(original, 'the original is retained');
    assert.ok(fs.statSync(original).size > 0);

    // The original stays factory-side: it is not a variant, so nothing places it.
    assert.equal((asset.variants ?? []).some((variant) => String(variant.uri).includes('-original.')), false);
    assert.equal(assetInventory(service, project.id)[0].recroppable, true);

    const preview = service.readAssetPreview(project.id, asset.id);
    assert.equal(preview.file, original, 'the picture someone points at is the one the crop comes from');
    assert.equal(service.readAssetPreview(project.id, 'asset-nope'), null);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('a chosen focal point recomputes the crops, needs re-review, and survives re-ingestion', async () => {
  const dirs = roots('app-builder-crop-focal-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-crop-focal', manifest: manifest('crop-focal') });
    await service.ingestSources(project.id, [
      { type: 'file', name: 'work.svg', label: 'Recent work', kind: 'image', data: photo(), purpose: 'portfolio', approvedForUse: true },
    ]);
    const asset = service.getKnowledgePack(project.id).assets[0];
    const cropFile = path.join(service.ingestion.assetDirectory(project.id), `${asset.contentHash.slice(0, 16)}-hero-16x9.webp`);
    const attentionCrop = fs.readFileSync(cropFile);

    await decideProjectAsset(service, project.id, asset.id, { decision: 'approve', cropReview: 'approved' });
    assert.equal(assetInventory(service, project.id)[0].cropReview, 'approved');

    for (const bad of [{ x: 2, y: 0.5 }, { x: 0.5 }, null, { x: 'left', y: 'top' }]) {
      await assert.rejects(() => recropProjectAsset(service, project.id, asset.id, bad), /A focal point needs x and y between 0 and 1/);
    }
    await assert.rejects(() => recropProjectAsset(service, project.id, 'asset-nope', { x: 0.5, y: 0.5 }), /Unknown project asset/);

    const recropped = await recropProjectAsset(service, project.id, asset.id, { x: 0.2, y: 0.15 });
    assert.deepEqual(recropped.asset.focalPoint, { x: 0.2, y: 0.15 });
    assert.equal(recropped.asset.cropReview, 'pending', 'a recomputed crop is a new thing to look at');
    assert.equal(recropped.asset.publishUseAllowed, true, 'choosing a point does not withdraw the asset itself');
    assert.notDeepEqual(fs.readFileSync(cropFile), attentionCrop, 'the crop on disk actually changed');
    assert.equal(fs.existsSync(cropFile), true);

    // A rebuild withholds the crop again until someone agrees with the new one.
    const pending = await service.generateProject(project.id);
    assert.equal(fs.readdirSync(path.join(pending.workspace, 'public/assets')).some((file) => file.includes('hero-16x9')), false);

    // Re-ingesting regenerates derived files; the chosen framing must not be
    // handed back to the attention heuristic.
    const focalCrop = fs.readFileSync(cropFile);
    await service.ingestSources(project.id, [
      { type: 'file', name: 'brochure.md', label: 'Brochure', data: Buffer.from('# Crop Test\n\nA joinery workshop.'), purpose: 'content', approvedForUse: true },
    ]);
    assert.deepEqual(fs.readFileSync(cropFile), focalCrop, 're-ingestion must not undo a chosen focal point');
    assert.deepEqual(assetInventory(service, project.id).find((entry) => entry.id === asset.id).focalPoint, { x: 0.2, y: 0.15 });

    await decideProjectAsset(service, project.id, asset.id, { decision: 'approve', cropReview: 'approved' });
    const shipped = await service.generateProject(project.id);
    assert.equal(fs.readdirSync(path.join(shipped.workspace, 'public/assets')).some((file) => file.includes('hero-16x9')), true);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
