import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { updateProjectSourceGovernance } from '../apps/service/src/source-governance.js';
import { buildKnowledgePack } from '../packages/content-intelligence/src/index.js';

function manifest() {
  return {
    schemaVersion: 2,
    project: { name: 'Knowledge Guard', slug: 'knowledge-guard', type: 'marketing-site', primaryGoal: 'Generate enquiries.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: {}, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: ['email'] },
    modules: { seo: true },
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: {
      inventory: ['logo/brand'],
      sources: [{
        id: 'logo-upload', kind: 'logo', label: 'Company logo', name: 'logo.svg', provenance: 'user-supplied', purpose: 'brand identity',
        rightsStatus: 'unknown', assetStatus: 'suggested', sourceRole: 'brand-supporting', sourceChannel: 'upload', instructionAuthority: 'none', publishUseAllowed: false, recordedAt: '2026-08-25T00:00:00.000Z',
      }],
    },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

test('source governance cannot diverge from an already attached knowledge pack', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-source-knowledge-guard-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  try {
    service.createProject({
      id: 'project-knowledge',
      manifest: manifest(),
      // A real (if empty) pack: the service validates knowledge packs in full,
      // so a stub with only a schemaVersion is rejected at creation.
      knowledgePack: buildKnowledgePack([]),
    });
    await assert.rejects(
      () => updateProjectSourceGovernance(service, 'project-knowledge', 'logo-upload', 'approve-for-use'),
      /before knowledge ingestion is attached/,
    );
    assert.equal(service.getManifest('project-knowledge').inputs.sources[0].rightsStatus, 'unknown');
    // No governance record, which is the point. The decision to attempt it is
    // recorded, because it was genuinely taken.
    const events = service.listEvents('project-knowledge');
    assert.deepEqual(events.filter((event) => event.type === 'source.governance.updated'), []);
    assert.deepEqual(events.map((event) => event.type), ['mutation.decided']);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
