import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { updateProjectSourceGovernance } from '../apps/service/src/source-governance.js';
import { FACTORY_TOOL_CONTRACT_VERSION } from '../apps/service/src/tool-contract.js';

function manifest() {
  return {
    schemaVersion: 2,
    project: { name: 'Governed Sources', slug: 'governed-sources', type: 'marketing-site', primaryGoal: 'Generate enquiries.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Understand services', 'Contact the business'],
    majorSurfaces: ['Home', 'Services', 'Contact'],
    entities: [],
    company: { identity: {}, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: ['email'] },
    modules: { seo: true },
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: {
      inventory: ['logo/brand', 'existing website'],
      sources: [
        {
          id: 'logo-upload', kind: 'logo', label: 'Company logo', name: 'logo.svg', provenance: 'user-supplied', purpose: 'brand identity',
          rightsStatus: 'unknown', assetStatus: 'suggested', sourceRole: 'brand-supporting', sourceChannel: 'upload', instructionAuthority: 'none', publishUseAllowed: false, recordedAt: '2026-08-25T00:00:00.000Z',
        },
        {
          id: 'public-site', kind: 'url', label: 'Existing website', uri: 'https://example.com', provenance: 'existing-site', purpose: 'brand reference',
          rightsStatus: 'reference-only', assetStatus: 'do-not-use', sourceRole: 'primary-brand', sourceChannel: 'website', instructionAuthority: 'none', publishUseAllowed: false, recordedAt: '2026-08-25T00:00:00.000Z',
        },
      ],
    },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-source-governance-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  return { root, store, service };
}

async function cleanup(context) {
  await context.service.close();
  context.store.close();
  fs.rmSync(context.root, { recursive: true, force: true });
}

test('service persists approved user-supplied source governance and records durable evidence', async () => {
  const context = setup();
  try {
    context.service.createProject({ id: 'project-governed', manifest: manifest() });
    const result = await updateProjectSourceGovernance(context.service, 'project-governed', 'logo-upload', 'approve-for-use');
    assert.equal(result.source.rightsStatus, 'approved-for-use');
    assert.equal(result.source.assetStatus, 'approved');
    assert.equal(result.source.publishUseAllowed, true);
    assert.equal(result.source.instructionAuthority, 'none');

    const persisted = context.service.getManifest('project-governed').inputs.sources.find((source) => source.id === 'logo-upload');
    assert.equal(persisted.publishUseAllowed, true);
    assert.deepEqual(context.service.listEvents('project-governed').map((event) => event.type), ['mutation.decided', 'source.governance.updated']);
  } finally {
    await cleanup(context);
  }
});

test('service refuses public URL republication and post-generation source mutation', async () => {
  const context = setup();
  try {
    context.service.createProject({ id: 'project-governed', manifest: manifest() });
    await assert.rejects(() => updateProjectSourceGovernance(context.service, 'project-governed', 'public-site', 'approve-for-use'), /Public URL references cannot be approved/);

    const project = context.store.getProject('project-governed');
    context.store.upsertProject({ ...project, state: 'generated', updatedAt: new Date().toISOString() });
    await assert.rejects(() => updateProjectSourceGovernance(context.service, 'project-governed', 'logo-upload', 'reference-only'), /only be changed before project generation/);
    // The refusals left no governance record, which is what this asserts. The
    // decision to attempt each one is recorded, because a decision taken is a
    // fact whether or not the operation that followed it succeeded.
    const events = context.service.listEvents('project-governed');
    assert.deepEqual(events.filter((event) => event.type === 'source.governance.updated'), []);
    assert.deepEqual(events.map((event) => event.type), ['mutation.decided', 'mutation.decided']);
  } finally {
    await cleanup(context);
  }
});

test('HTTP facade exposes bounded governance decisions and advertises them in the service tool contract', async () => {
  const context = setup();
  const server = createFactoryHttpServer({ service: context.service });
  try {
    context.service.createProject({ id: 'project-governed', manifest: manifest() });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const tools = await fetch(`${base}/tools`).then((response) => response.json());
    // What this test is about is that the facade advertises the contract it is
    // actually serving, not which number that contract is on. Pinning the
    // literal here made every contract addition look like a governance
    // regression; tooling/approved-build-plan.test.mjs pins the number itself.
    assert.equal(tools.contractVersion, FACTORY_TOOL_CONTRACT_VERSION);
    assert.equal(tools.tools.some((tool) => tool.name === 'project.source.governance.update'), true);

    const response = await fetch(`${base}/projects/project-governed/sources/logo-upload/governance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve-for-use' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source.publishUseAllowed, true);

    const invalid = await fetch(`${base}/projects/project-governed/sources/public-site/governance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve-for-use' }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await cleanup(context);
  }
});
