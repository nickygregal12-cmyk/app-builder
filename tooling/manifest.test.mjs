import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson, validateManifest } from './lib/manifest.mjs';

test('example project manifest is valid', () => {
  assert.deepEqual(validateManifest(readJson('examples/project-manifest.example.json')), []);
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
