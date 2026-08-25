import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildBuildContract,
  buildProjectManifest,
  createSourceReference,
} from '../packages/factory-core/src/index.js';

const projectTypesConfig = {
  projectTypes: { 'marketing-site': { defaultModules: ['seo'] } },
  moduleRegistry: { modules: { seo: { status: 'ready' } } },
};

const questions = [
  { id: 'project_name', label: 'Name', type: 'text', required: true },
  { id: 'primary_goal', label: 'Goal', type: 'text', required: true },
  { id: 'target_users', label: 'Users', type: 'text', required: true },
  { id: 'must_have', label: 'Must', type: 'list', required: true },
];

const answers = {
  project_name: 'Governed Brand',
  primary_goal: 'Generate enquiries',
  target_users: 'Homeowners',
  must_have: ['Understand services', 'Contact the business'],
};

test('legacy source metadata remains accepted but imported instructions never gain authority', () => {
  const reference = createSourceReference({
    kind: 'document',
    name: 'brochure.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    instructionAuthority: 'user',
  });
  assert.equal(reference.name, 'brochure.pdf');
  assert.equal(reference.provenance, 'user-supplied');
  assert.equal(reference.instructionAuthority, 'none');
  assert.equal(reference.publishUseAllowed, false);
  assert.equal(reference.rightsStatus, undefined);
  assert.equal('content' in reference, false);
});

test('approved asset governance survives intake normalization into Build Contract and Manifest', () => {
  const source = createSourceReference({
    kind: 'logo',
    label: 'Approved company logo',
    name: 'logo.svg',
    provenance: 'user-supplied',
    purpose: 'brand identity',
    rightsStatus: 'approved-for-use',
    assetStatus: 'approved',
    sourceRole: 'brand-supporting',
    sourceChannel: 'upload',
  });
  assert.equal(source.publishUseAllowed, true);

  const contract = buildBuildContract({
    projectType: 'marketing-site',
    answers,
    questions,
    projectTypesConfig,
    sourceReferences: [source],
  });
  const manifest = buildProjectManifest({
    projectType: 'marketing-site',
    answers,
    projectTypesConfig,
    sourceReferences: [source],
  });

  for (const carried of [contract.sourceInputs[0], manifest.inputs.sources[0]]) {
    assert.equal(carried.rightsStatus, 'approved-for-use');
    assert.equal(carried.assetStatus, 'approved');
    assert.equal(carried.sourceRole, 'brand-supporting');
    assert.equal(carried.sourceChannel, 'upload');
    assert.equal(carried.instructionAuthority, 'none');
    assert.equal(carried.publishUseAllowed, true);
  }
});

test('reference-only public sources remain non-publishable throughout contract creation', () => {
  const source = createSourceReference({
    kind: 'url',
    label: 'Company Instagram',
    uri: 'https://www.instagram.com/example/',
    provenance: 'external-research',
    purpose: 'brand reference',
    rightsStatus: 'reference-only',
    assetStatus: 'do-not-use',
    sourceRole: 'brand-supporting',
    sourceChannel: 'instagram',
    publishUseAllowed: false,
  });
  assert.equal(source.publishUseAllowed, false);
  assert.equal(source.instructionAuthority, 'none');
});

test('unsafe publication combinations fail closed before Build Contract approval', () => {
  assert.throws(() => createSourceReference({
    kind: 'logo',
    label: 'Unlicensed logo',
    rightsStatus: 'reference-only',
    assetStatus: 'approved',
  }), /require rightsStatus approved-for-use/);

  assert.throws(() => createSourceReference({
    kind: 'image',
    label: 'Unapproved image',
    rightsStatus: 'approved-for-use',
    assetStatus: 'suggested',
    publishUseAllowed: true,
  }), /require approved-for-use rights and approved asset status/);
});

test('source-reference schema exposes the same governance vocabulary without making it mandatory for old records', () => {
  const schema = JSON.parse(fs.readFileSync('schemas/source-reference.schema.json', 'utf8'));
  assert.deepEqual(schema.properties.rightsStatus.enum, ['approved-for-use', 'reference-only', 'unknown', 'restricted']);
  assert.deepEqual(schema.properties.assetStatus.enum, ['approved', 'suggested', 'generated', 'rejected', 'do-not-use']);
  assert.equal(schema.properties.instructionAuthority.const, 'none');
  assert.equal(schema.required.includes('rightsStatus'), false);
  assert.equal(schema.required.includes('assetStatus'), false);
});
