import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { generateProject } from './lib/generator.mjs';

const manifest = {
  schemaVersion: 2,
  project: { name: 'North Star Roofing', slug: 'north-star-roofing', type: 'marketing-site', primaryGoal: 'Generate qualified roofing enquiries' },
  audience: { targetUsers: 'Homeowners', roles: [] },
  journeys: ['Understand services', 'Request a quote'],
  majorSurfaces: ['Home', 'Services', 'About', 'Contact'],
  entities: [],
  company: {
    identity: { name: 'North Star Roofing', description: 'Residential roofing and repair company.' },
    services: ['Roof repairs', 'New roofs'],
    locations: ['Glasgow'],
    contactDetails: { email: 'hello@example.com' },
    trustSignals: [],
    conversionGoals: ['contact form'],
  },
  modules: {},
  infrastructure: { backend: 'none', deployment: 'netlify' },
  aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
  brand: { designControl: 'sensible-defaults' },
  inputs: { inventory: [], sources: [] },
  constraints: { tenantModel: null, integrations: [], uploads: {}, existingData: [], expectedScale: null, sensitivity: null, hardConstraints: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
  outOfScope: [],
};

const pack = {
  schemaVersion: 1,
  packHash: 'knowledge-pack-test',
  facts: [{ id: 'fact-name', path: 'identity.name', value: 'North Star Roofing Ltd', sourceId: 'source-company', provenance: 'user-supplied', confidence: 1, verification: 'user-provided', evidence: [] }],
  companyProfile: {
    identity: { name: { value: 'North Star Roofing Ltd', factId: 'fact-name', verification: 'user-provided', confidence: 1 }, legalName: null, description: null },
    contact: { email: null, phone: null, website: null, address: null },
    serviceAreas: [], services: [], people: [], projects: [], testimonials: [], accreditations: [],
  },
  content: [],
};

test('supported generator writes portable composition state and rendered template input', () => {
  const out = path.resolve('.tmp/test-composed-generation');
  fs.rmSync(out, { recursive: true, force: true });
  const result = generateComposedProject(manifest, out, { knowledgePack: pack });
  assert.equal(result.composition.input.knowledgePackHash, 'knowledge-pack-test');
  assert.equal(result.composition.pages.length, 5, 'four surfaces plus the not-found route');
  const stored = JSON.parse(fs.readFileSync(path.join(out, '.app-builder/composition.json'), 'utf8'));
  assert.equal(stored.compositionHash, result.composition.compositionHash);
  const generatedModule = fs.readFileSync(path.join(out, 'src/generated/composition.ts'), 'utf8');
  assert.match(generatedModule, /North Star Roofing Ltd/);
  assert.match(generatedModule, /fact-name/);
  // The renderer is read from the template's own presentation declaration
  // rather than named here. Which file renders a composed section is a property
  // of the renderer that was selected, and this project type is now rendered
  // statically — asserting `src/App.tsx` would only ever be asserting which
  // renderer the factory happened to pick.
  const renderer = fs.readFileSync(path.join(out, result.plan.template.presentation.renderer), 'utf8');
  assert.match(renderer, /generated\/composition|lib\/composition/);
  assert.equal(result.plan.renderer.rendererId, 'static-content', 'a marketing site is rendered statically');
  assert.ok(fs.existsSync(path.join(out, 'package.json')));
  fs.rmSync(out, { recursive: true, force: true });
});

test('low-level legacy generator retains a buildable empty composition fallback', () => {
  const out = path.resolve('.tmp/test-legacy-generation');
  fs.rmSync(out, { recursive: true, force: true });
  generateProject({ ...manifest, schemaVersion: 1 }, out);
  const fallback = fs.readFileSync(path.join(out, 'src/generated/composition.ts'), 'utf8');
  assert.match(fallback, /composition-not-generated/);
  fs.rmSync(out, { recursive: true, force: true });
});
