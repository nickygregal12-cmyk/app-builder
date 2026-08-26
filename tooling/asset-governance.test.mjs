import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import { composeProject } from '../packages/composition/src/index.js';
import { decideAssetGovernance } from '../packages/content-intelligence/src/index.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { assetInventory, decideProjectAsset } from '../apps/service/src/asset-governance.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function svg(label, width = 1600, height = 900) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#336699"/><text x="80" y="200" font-size="80">${label}</text></svg>`);
}

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Asset Governance', slug, type: 'marketing-site', primaryGoal: 'Prove a photograph needs its own decision.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Work', 'Contact'],
    entities: [],
    company: { identity: { name: 'Asset Governance' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
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

/** An asset as the knowledge pack derives it, plus the source it came from. */
function asset(overrides = {}) {
  return {
    id: 'asset-1111111111111111',
    sourceId: 'source-1',
    kind: 'image',
    contentHash: 'a'.repeat(64),
    provenance: 'existing-site',
    rightsStatus: 'reference-only',
    assetStatus: 'do-not-use',
    sourceRole: 'primary-brand',
    sourceChannel: 'website',
    instructionAuthority: 'none',
    publishUseAllowed: false,
    ...overrides,
  };
}

const referenceOnlySource = { id: 'source-1', rightsStatus: 'reference-only' };
const approvedSource = { id: 'source-1', rightsStatus: 'approved-for-use' };

test('approving an asset whose source is not approved needs a declaration about that asset', () => {
  assert.throws(
    () => decideAssetGovernance(asset(), referenceOnlySource, { decision: 'approve' }),
    /needs an explicit rights declaration for this asset/,
  );

  const declared = decideAssetGovernance(asset(), referenceOnlySource, { decision: 'approve', rightsDeclaration: 'owned-by-the-business' });
  assert.deepEqual(declared, { rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true });

  // Reading a public page is not the same permission as republishing its
  // photographs, so the declaration is per asset and never inferred.
  assert.throws(() => decideAssetGovernance(asset(), referenceOnlySource, { decision: 'approve', rightsDeclaration: 'because-it-is-public' }), /Unsupported rights declaration/);
});

test('narrowing never needs a declaration, and an approved source still approves without one', () => {
  for (const decision of ['reject', 'do-not-use']) {
    const effect = decideAssetGovernance(asset({ rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true }), approvedSource, { decision });
    assert.equal(effect.publishUseAllowed, false, 'refusing to publish something is always allowed');
  }
  assert.equal(decideAssetGovernance(asset(), approvedSource, { decision: 'approve' }).publishUseAllowed, true);
});

test('an exact duplicate is refused rather than published twice', () => {
  assert.throws(
    () => decideAssetGovernance(asset({ duplicateOf: 'asset-0000000000000000' }), approvedSource, { decision: 'approve' }),
    /exact duplicate of asset-0000000000000000; approve that one instead/,
  );
});

test('unsupported decisions and crop states fail closed', () => {
  assert.throws(() => decideAssetGovernance(asset(), approvedSource, { decision: 'publish-it' }), /Unsupported asset decision/);
  assert.throws(() => decideAssetGovernance(asset(), approvedSource, { decision: 'approve', cropReview: 'looks-fine' }), /Unsupported crop review state/);
});

test('composition places an asset a person approved and drops one they turned down', () => {
  const pack = {
    assets: [
      asset({ id: 'asset-aaaaaaaaaaaaaaaa', variants: [{ role: 'hero-16x9', format: 'webp', width: 1600, height: 900, uri: 'assets/a-hero.webp', reviewBeforePublish: true }] }),
      asset({ id: 'asset-bbbbbbbbbbbbbbbb', rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true, variants: [] }),
    ],
  };
  const base = { manifest: manifest('compose'), knowledgePack: pack };

  const inherited = composeProject(base);
  const inheritedPlaced = new Set(inherited.sections.flatMap((section) => section.assetIds));
  assert.equal(inheritedPlaced.has('asset-bbbbbbbbbbbbbbbb'), true);
  assert.equal(inheritedPlaced.has('asset-aaaaaaaaaaaaaaaa'), false, 'a reference-only asset is not published by default');

  const decided = composeProject({
    ...base,
    assetDecisions: [
      { assetId: 'asset-aaaaaaaaaaaaaaaa', cropReview: 'pending', effect: { rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true } },
      { assetId: 'asset-bbbbbbbbbbbbbbbb', cropReview: 'pending', effect: { rightsStatus: 'approved-for-use', assetStatus: 'rejected', publishUseAllowed: false } },
    ],
  });
  const decidedPlaced = new Set(decided.sections.flatMap((section) => section.assetIds));
  assert.equal(decidedPlaced.has('asset-aaaaaaaaaaaaaaaa'), true, 'a declared asset publishes even though its source is reference-only');
  assert.equal(decidedPlaced.has('asset-bbbbbbbbbbbbbbbb'), false, 'a rejected asset is dropped even though its source approved it');

  // The composition records which decisions produced it.
  assert.equal(inherited.input.assetDecisionsHash, null);
  assert.match(decided.input.assetDecisionsHash, /^[a-f0-9]{64}$/);
  assert.notEqual(decided.compositionHash, inherited.compositionHash);
  assert.deepEqual(validateContract('composition', decided), []);
});

test('the same decisions always hash the same way and a crop review changes it', () => {
  const pack = { assets: [asset({ rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true })] };
  const decisions = [{ assetId: asset().id, cropReview: 'pending', effect: { rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true } }];
  const first = composeProject({ manifest: manifest('hash'), knowledgePack: pack, assetDecisions: decisions });
  const second = composeProject({ manifest: manifest('hash'), knowledgePack: pack, assetDecisions: [...decisions] });
  assert.equal(first.input.assetDecisionsHash, second.input.assetDecisionsHash);

  const reviewed = composeProject({
    manifest: manifest('hash'),
    knowledgePack: pack,
    assetDecisions: [{ ...decisions[0], cropReview: 'approved' }],
  });
  assert.notEqual(reviewed.input.assetDecisionsHash, first.input.assetDecisionsHash, 'approving a crop changes what the build would ship');
});

test('an ingested asset can be decided after ingestion and the decision survives a rebuild', async () => {
  const dirs = roots('app-builder-asset-governance-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-assets', manifest: manifest('asset-governance') });

    // Nothing to decide about before ingestion.
    await assert.rejects(() => decideProjectAsset(service, project.id, 'asset-nope', { decision: 'approve' }), /need an ingested knowledge pack/);

    await service.ingestSources(project.id, [
      { type: 'file', name: 'photo.svg', label: 'Recent work', kind: 'image', data: svg('WORK'), purpose: 'portfolio', approvedForUse: false },
      { type: 'file', name: 'logo.png', label: 'Logo', kind: 'logo', data: PNG, purpose: 'brand identity', approvedForUse: true },
    ]);

    const inventory = assetInventory(service, project.id);
    assert.ok(inventory.length >= 2, 'every ingested image is in the inventory, decided or not');
    const photo = inventory.find((entry) => entry.sourceLabel === 'Recent work');
    assert.ok(photo);
    assert.equal(photo.decision, null, 'an undecided asset says so rather than looking approved');
    assert.equal(photo.publishUseAllowed, false);
    assert.equal(photo.width, 1600);
    assert.equal(photo.rightsDeclarationRequired, true);
    assert.ok(photo.cropCount > 0, 'the smart crops exist and are what cropReview governs');
    assert.equal(photo.cropReview, 'pending');

    await assert.rejects(() => decideProjectAsset(service, project.id, 'asset-not-here', { decision: 'approve' }), /Unknown project asset/);
    await assert.rejects(() => decideProjectAsset(service, project.id, photo.id, { decision: 'approve' }), /needs an explicit rights declaration/);

    const approved = await decideProjectAsset(service, project.id, photo.id, { decision: 'approve', rightsDeclaration: 'owned-by-the-business', cropReview: 'approved', note: 'Our own photograph.' });
    assert.equal(approved.asset.publishUseAllowed, true);
    assert.equal(approved.asset.decision.rightsDeclaration, 'owned-by-the-business');
    assert.deepEqual(validateContract('asset-decision', service.readAssetDecisions(project.id)), []);

    // The pack itself is untouched: it stays derived truth about sources, and
    // every asset in it still agrees with the source it came from.
    const pack = service.getKnowledgePack(project.id);
    assert.equal(pack.assets.find((entry) => entry.id === photo.id).publishUseAllowed, false);

    const generated = await service.generateProject(project.id);
    const placed = new Set(generated.composition.sections.flatMap((section) => section.assetIds));
    assert.equal(placed.has(photo.id), true, 'the decision reaches the build');
    assert.match(generated.composition.input.assetDecisionsHash, /^[a-f0-9]{64}$/);

    // A decision made after the build is durable and replayed into the next one.
    await decideProjectAsset(service, project.id, photo.id, { decision: 'do-not-use' });
    const rebuilt = await service.generateProject(project.id);
    const rebuiltPlaced = new Set(rebuilt.composition.sections.flatMap((section) => section.assetIds));
    assert.equal(rebuiltPlaced.has(photo.id), false, 'a rebuild must not resurrect an asset someone withdrew');

    const cleared = await decideProjectAsset(service, project.id, photo.id, { decision: 'clear' });
    assert.equal(cleared.asset.decision, null);
    assert.equal(cleared.asset.publishUseAllowed, false, 'clearing returns the asset to what it inherited, not to approved');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('an unreviewed smart crop is withheld from the generated repository but the picture still ships', async () => {
  const dirs = roots('app-builder-asset-crops-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-crops', manifest: manifest('asset-crops') });
    await service.ingestSources(project.id, [
      { type: 'file', name: 'hero.svg', label: 'Hero photo', kind: 'image', data: svg('HERO'), purpose: 'hero imagery', approvedForUse: true },
    ]);
    const photo = assetInventory(service, project.id).find((entry) => entry.sourceLabel === 'Hero photo');
    assert.ok(photo.cropCount > 0);

    // Assert on what actually landed in the repository rather than on what the
    // generator said it did.
    const shipped = (workspace) => fs.readdirSync(path.join(workspace, 'public/assets'));

    const pending = await service.generateProject(project.id);
    const pendingFiles = shipped(pending.workspace);
    assert.ok(pendingFiles.some((file) => /\.(webp|avif)$/.test(file)), 'the picture still publishes');
    assert.equal(pendingFiles.some((file) => file.includes('hero-16x9')), false, 'an attention crop nobody has looked at is withheld');
    assert.match(fs.readFileSync(path.join(pending.workspace, 'src/generated/assets.ts'), 'utf8'), /"role": "responsive"/);

    await decideProjectAsset(service, project.id, photo.id, { decision: 'approve', cropReview: 'approved' });
    const reviewed = await service.generateProject(project.id);
    assert.equal(shipped(reviewed.workspace).some((file) => file.includes('hero-16x9')), true, 'an approved crop ships');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
