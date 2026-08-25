import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPlan, generateProject, loadCatalog, reconcileProjectRecipes } from './lib/generator.mjs';

const marketingManifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
const catalog = loadCatalog();

test('generation plan keeps backend-less marketing apps adapter-free', () => {
  const plan = buildGenerationPlan(marketingManifest, { catalog });
  assert.equal(plan.template.id, 'react-vite-neutral');
  assert.deepEqual(plan.adapters, []);
  assert.deepEqual(plan.recipes.map((recipe) => recipe.id), ['feature-flags', 'seo']);
});

test('supabase backend is selected as infrastructure rather than a user module', () => {
  const manifest = structuredClone(marketingManifest);
  manifest.infrastructure.backend = 'supabase';
  const plan = buildGenerationPlan(manifest, { catalog });
  assert.deepEqual(plan.adapters.map((adapter) => adapter.id), ['supabase']);
  assert.equal(plan.missingModules.length, 0);
});

test('generation plan fails closed for enabled modules without a ready recipe', () => {
  const withAuth = structuredClone(marketingManifest);
  withAuth.modules.auth = true;
  withAuth.infrastructure.backend = 'supabase';
  const plan = buildGenerationPlan(withAuth, { catalog });
  assert.ok(plan.missingModules.includes('auth'));
});

test('generated supabase project pins the SDK and writes public env contract', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-supabase-'));
  const out = path.join(tmp, 'project');
  const manifest = structuredClone(marketingManifest);
  manifest.infrastructure.backend = 'supabase';
  generateProject(manifest, out, { catalog });
  const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  const adapters = JSON.parse(fs.readFileSync(path.join(out, '.app-builder/adapters.json'), 'utf8'));
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.112.4');
  assert.deepEqual(adapters.installed.map((entry) => entry.id), ['supabase']);
  assert.match(fs.readFileSync(path.join(out, '.env.example'), 'utf8'), /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(fs.existsSync(path.join(out, 'src/platform/supabase/client.ts')), true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('recipe add/remove reconciles managed files and manifest safely', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-recipes-'));
  const out = path.join(tmp, 'project');
  const seoOnly = structuredClone(marketingManifest);
  seoOnly.modules['feature-flags'] = false;
  generateProject(seoOnly, out, { catalog });
  let recipes = reconcileProjectRecipes(out, ['feature-flags', 'seo'], { catalog });
  assert.deepEqual(recipes.map((recipe) => recipe.id), ['feature-flags', 'seo']);
  recipes = reconcileProjectRecipes(out, ['seo'], { catalog });
  assert.deepEqual(recipes.map((recipe) => recipe.id), ['seo']);
  assert.equal(fs.existsSync(path.join(out, 'src/features/feature-flags/index.ts')), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});
