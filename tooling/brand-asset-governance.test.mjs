import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertKnowledgePack,
  buildKnowledgePack,
  deriveSourceGovernance,
  normalizeReferenceSource,
  normalizeSource,
} from '../packages/content-intelligence/src/index.js';

const LOGO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#123456"/><text x="80" y="180" font-size="72">ACME</text></svg>');

test('public company references are observation-only unless rights are explicitly approved', () => {
  const instagram = normalizeReferenceSource({
    uri: 'https://www.instagram.com/acme/',
    label: 'Acme Instagram',
    purpose: 'brand reference',
  });
  assert.equal(instagram.sourceChannel, 'instagram');
  assert.equal(instagram.sourceRole, 'brand-supporting');
  assert.equal(instagram.rightsStatus, 'reference-only');
  assert.equal(instagram.assetStatus, 'do-not-use');
  assert.equal(instagram.publishUseAllowed, false);
  assert.equal(instagram.instructionAuthority, 'none');
});

test('existing company websites are primary brand evidence but not automatically republishable', () => {
  const governance = deriveSourceGovernance({
    uri: 'https://acme.test/',
    provenance: 'existing-site',
    purpose: 'existing-site page',
  }, 'url');
  assert.equal(governance.sourceRole, 'primary-brand');
  assert.equal(governance.sourceChannel, 'website');
  assert.equal(governance.rightsStatus, 'reference-only');
  assert.equal(governance.publishUseAllowed, false);
});

test('uploaded assets require explicit approved-for-use state before publication', async () => {
  const unapproved = await normalizeSource({
    data: LOGO,
    name: 'logo.svg',
    label: 'Company logo',
    kind: 'logo',
    provenance: 'user-supplied',
  });
  assert.equal(unapproved.rightsStatus, 'unknown');
  assert.equal(unapproved.assetStatus, 'suggested');
  assert.equal(unapproved.publishUseAllowed, false);

  const approved = await normalizeSource({
    data: LOGO,
    name: 'approved-logo.svg',
    label: 'Approved company logo',
    kind: 'logo',
    provenance: 'user-supplied',
    approvedForUse: true,
  });
  assert.equal(approved.rightsStatus, 'approved-for-use');
  assert.equal(approved.assetStatus, 'approved');
  assert.equal(approved.publishUseAllowed, true);
});

test('knowledge packs preserve governance and separate publishable from reference-only assets', async () => {
  const approved = await normalizeSource({
    data: LOGO,
    name: 'approved-logo.svg',
    label: 'Approved company logo',
    kind: 'logo',
    provenance: 'user-supplied',
    approvedForUse: true,
    purpose: 'brand identity',
  });
  const reference = await normalizeSource({
    data: LOGO,
    uri: 'https://assets.acme.test/reference-logo.svg',
    name: 'reference-logo.svg',
    label: 'Observed public logo',
    kind: 'logo',
    provenance: 'external-research',
    purpose: 'brand reference',
  });
  const pack = assertKnowledgePack(buildKnowledgePack([approved, reference]));
  const approvedAsset = pack.assets.find((asset) => asset.sourceId === approved.id);
  const referenceAsset = pack.assets.find((asset) => asset.sourceId === reference.id);

  assert.equal(approvedAsset.publishUseAllowed, true);
  assert.equal(referenceAsset.publishUseAllowed, false);
  assert.ok(pack.brand.publishableAssetIds.includes(approvedAsset.id));
  assert.ok(pack.brand.referenceOnlyAssetIds.includes(referenceAsset.id));
  assert.ok(pack.brand.sourceCandidates.some((candidate) => candidate.sourceId === approved.id));
  assert.ok(pack.brand.sourceCandidates.some((candidate) => candidate.sourceId === reference.id));
});

test('knowledge-pack validation fails closed when asset governance diverges from its source', async () => {
  const source = await normalizeSource({
    data: LOGO,
    name: 'logo.svg',
    label: 'Approved company logo',
    kind: 'logo',
    provenance: 'user-supplied',
    approvedForUse: true,
  });
  const pack = buildKnowledgePack([source]);
  pack.assets[0].rightsStatus = 'reference-only';
  assert.throws(() => assertKnowledgePack(pack), /governance field rightsStatus/);
});

test('approved asset state cannot be combined with reference-only rights', () => {
  assert.throws(() => deriveSourceGovernance({
    uri: 'https://example.org/logo.svg',
    provenance: 'external-research',
    rightsStatus: 'reference-only',
    assetStatus: 'approved',
  }, 'logo'), /approved requires rightsStatus approved-for-use/);
});
