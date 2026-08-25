import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, validateManifest } from './lib/manifest.mjs';

test('example v1 project manifest remains valid for backwards compatibility', () => {
  assert.deepEqual(validateManifest(readJson('examples/project-manifest.example.json')), []);
});

test('valid project manifest v2 is accepted', () => {
  const manifest = {
    schemaVersion: 2,
    project: { name:'North Star Roofing', slug:'north-star-roofing', type:'marketing-site', primaryGoal:'Generate enquiries' },
    audience: { summary:'Homeowners', roles:[] },
    journeys: ['Understand services','Request a quote'],
    majorSurfaces: ['Home','Services','Contact'],
    entities: [],
    company: { identity:{name:'North Star Roofing'}, services:['Roof repairs'], locations:['Glasgow'], contactDetails:{}, trustSignals:[], conversionGoals:['quote request'] },
    constraints: { hard:[], expectedScale:'under-1000', sensitivity:'', tenantModel:'', integrations:[], existingData:[], uploadTypes:[], customCapabilities:[], excludedCapabilities:[], unresolvedCapabilities:[] },
    modules: { seo:true, 'lead-generation':true },
    infrastructure: { backend:'none', deployment:'netlify' },
    aiBudget: { mode:'economy', maxBuildCostGbp:5 },
    brand: { designControl:'sensible-defaults' },
    inputs: { inventory:[], sources:[] },
    outOfScope: []
  };
  assert.deepEqual(validateManifest(manifest), []);
});

test('manifest v2 fails when its composition-shaping fields are missing', () => {
  const manifest = readJson('examples/project-manifest.example.json');
  manifest.schemaVersion = 2;
  const errors = validateManifest(manifest);
  assert.ok(errors.some((error) => error.includes('majorSurfaces')));
  assert.ok(errors.some((error) => error.includes('audience')));
});

test('invalid project slug is rejected', () => {
  const manifest = readJson('examples/project-manifest.example.json');
  manifest.project.slug = 'Bad Slug';
  assert.ok(validateManifest(manifest).some((error) => error.includes('kebab-case')));
});

test('module values must be booleans', () => {
  const manifest = readJson('examples/project-manifest.example.json');
  manifest.modules.auth = 'yes';
  assert.ok(validateManifest(manifest).some((error) => error.includes('modules.auth')));
});
