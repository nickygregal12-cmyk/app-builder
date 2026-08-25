import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('generated project metadata is self-contained', () => {
  const project = JSON.parse(fs.readFileSync('.app-builder/project.json', 'utf8'));
  const recipes = JSON.parse(fs.readFileSync('.app-builder/recipes.json', 'utf8'));
  assert.equal(project.schemaVersion, 1);
  assert.ok(project.template.id);
  assert.ok(Array.isArray(recipes.installed));
  assert.equal(fs.existsSync('.app-builder/manifest.json'), true);
});
