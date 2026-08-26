import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenerationPlan, generateProject, loadCatalog, reconcileProjectRecipes } from './lib/generator.mjs';

const marketingManifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
const catalog = loadCatalog();

test('generation plan keeps backend-less marketing apps free of backend adapters', () => {
  const plan = buildGenerationPlan(marketingManifest, { catalog });
  // Phase 4.2: a marketing site is rendered statically. The rest of the plan is
  // unchanged by that, which is the point of the seam — the renderer decides
  // how the truth is rendered, not what is installed.
  assert.equal(plan.renderer.rendererId, 'static-content');
  assert.equal(plan.template.id, 'astro-static-content');
  assert.deepEqual(plan.adapters.map((adapter) => adapter.id), ['netlify']);
  assert.equal(plan.adapters.some((adapter) => adapter.kind === 'backend'), false);
  assert.deepEqual(plan.recipes.map((recipe) => recipe.id), ['analytics', 'feature-flags', 'lead-generation', 'observability', 'seo']);
});

test('supabase backend is selected as infrastructure rather than a user module', () => {
  // A backend is infrastructure, so it is chosen on a project that is rendered
  // as an application: the Supabase adapter is a React client and says so.
  const manifest = structuredClone(marketingManifest);
  manifest.project.type = 'b2b-saas';
  manifest.infrastructure.backend = 'supabase';
  const plan = buildGenerationPlan(manifest, { catalog });
  assert.equal(plan.renderer.rendererId, 'application');
  assert.deepEqual(plan.adapters.map((adapter) => adapter.id), ['supabase', 'netlify']);
  assert.equal(plan.missingModules.length, 0);
});

test('generation plan fails closed for enabled modules without a ready recipe', () => {
  const withUnsupportedModule = structuredClone(marketingManifest);
  withUnsupportedModule.modules.billing = true;
  const plan = buildGenerationPlan(withUnsupportedModule, { catalog });
  assert.ok(plan.missingModules.includes('billing'));
});

test('generated supabase project pins the SDK and writes public env contract', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-supabase-'));
  const out = path.join(tmp, 'project');
  const manifest = structuredClone(marketingManifest);
  manifest.project.type = 'b2b-saas';
  manifest.infrastructure.backend = 'supabase';
  generateProject(manifest, out, { catalog });
  const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  const adapters = JSON.parse(fs.readFileSync(path.join(out, '.app-builder/adapters.json'), 'utf8'));
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.112.4');
  assert.deepEqual(adapters.installed.map((entry) => entry.id), ['supabase', 'netlify']);
  assert.match(fs.readFileSync(path.join(out, '.env.example'), 'utf8'), /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.equal(fs.existsSync(path.join(out, 'src/platform/supabase/client.ts')), true);
  assert.equal(fs.existsSync(path.join(out, 'netlify.toml')), true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('recipe add/remove reconciles managed files and manifest safely', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-recipes-'));
  const out = path.join(tmp, 'project');
  const seoOnly = structuredClone(marketingManifest);
  seoOnly.modules = { seo: true };
  generateProject(seoOnly, out, { catalog });
  let recipes = reconcileProjectRecipes(out, ['feature-flags', 'seo'], { catalog });
  assert.deepEqual(recipes.map((recipe) => recipe.id), ['feature-flags', 'seo']);
  recipes = reconcileProjectRecipes(out, ['seo'], { catalog });
  assert.deepEqual(recipes.map((recipe) => recipe.id), ['seo']);
  assert.equal(fs.existsSync(path.join(out, 'src/features/feature-flags/index.ts')), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});
