import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationPlan, generateProject, loadCatalog } from './lib/generator.mjs';

const catalog = loadCatalog();
const projectTypes = JSON.parse(fs.readFileSync('config/project-types.json', 'utf8')).projectTypes;
const modules = JSON.parse(fs.readFileSync('config/modules.json', 'utf8')).modules;

function manifestFor(type) {
  const backend = ['marketing-site', 'content-site'].includes(type) ? 'none' : 'supabase';
  const enabled = Object.fromEntries((projectTypes[type].defaultModules ?? []).map((name) => [name, true]));
  return {
    schemaVersion: 1,
    project: { name: `${type} acceptance`, slug: `${type}-acceptance`, type, primaryGoal: `Prove deterministic ${type} generation.` },
    modules: enabled,
    infrastructure: { backend, deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 5 },
    brand: { accentColor: '#315b72' },
    inputs: { sources: [] },
    outOfScope: [],
  };
}

function filesUnder(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [path.relative(root, full)];
  }).sort();
}

test('every project-type default module is a ready deterministic capability', () => {
  for (const [type, config] of Object.entries(projectTypes)) {
    for (const moduleName of config.defaultModules ?? []) assert.equal(modules[moduleName]?.status, 'ready', `${type} defaults to non-ready ${moduleName}`);
  }
});

test('all six project types have distinct deterministic layouts and generate standalone projects', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-phase2-'));
  const layouts = new Set();
  try {
    for (const type of Object.keys(projectTypes)) {
      const manifest = manifestFor(type);
      const out = path.join(temp, type);
      const plan = generateProject(manifest, out, { catalog });
      layouts.add(plan.design.patternId);
      assert.equal(plan.missingModules.length, 0);
      assert.ok(plan.adapters.some((adapter) => adapter.id === 'netlify'));
      assert.ok(fs.existsSync(path.join(out, 'netlify.toml')));
      assert.ok(fs.existsSync(path.join(out, 'docs/HANDOVER.md')));
      assert.ok(fs.existsSync(path.join(out, 'src/generated/design.ts')));
      assert.ok(fs.existsSync(path.join(out, 'src/generated/scenarios.ts')));
      const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
      assert.equal(Object.keys(pkg.dependencies ?? {}).some((name) => name.startsWith('@app-builder/')), false);
    }
    assert.equal(layouts.size, Object.keys(projectTypes).length);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('generation is byte-stable for identical inputs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-stable-'));
  const first = path.join(temp, 'first');
  const second = path.join(temp, 'second');
  const manifest = manifestFor('content-site');
  try {
    generateProject(manifest, first, { catalog });
    generateProject(manifest, second, { catalog });
    const files = filesUnder(first);
    assert.deepEqual(files, filesUnder(second));
    for (const relative of files) assert.deepEqual(fs.readFileSync(path.join(first, relative)), fs.readFileSync(path.join(second, relative)), relative);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('deployment selection fails closed for an unsupported target', () => {
  const manifest = manifestFor('content-site');
  manifest.infrastructure.deployment = 'cloudflare';
  assert.throws(() => buildGenerationPlan(manifest, { catalog }), /No ready deployment adapter for cloudflare/);
});

test('Netlify and lead-generation contracts include SPA routing and static form detection', () => {
  const netlify = fs.readFileSync('adapters/netlify/files/netlify.toml', 'utf8');
  const form = fs.readFileSync('recipes/lead-generation/files/public/__forms.html', 'utf8');
  const component = fs.readFileSync('recipes/lead-generation/files/src/features/lead-generation/index.tsx', 'utf8');
  assert.match(netlify, /publish = "dist"/);
  assert.match(netlify, /from = "\/\*"[\s\S]*to = "\/index\.html"[\s\S]*status = 200/);
  assert.match(form, /name="enquiry"/);
  assert.match(form, /netlify-honeypot="bot-field"/);
  assert.match(component, /fetch\('\/__forms\.html'/);
});

test('upload recipe owns a private bucket path and covers replace permissions safely', () => {
  const sql = fs.readFileSync('recipes/uploads/database/storage.sql', 'utf8').toLowerCase();
  assert.match(sql, /'user-files', 'user-files', false/);
  assert.match(sql, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.match(sql, /for select to authenticated/);
  assert.match(sql, /for insert to authenticated/);
  assert.match(sql, /for update to authenticated[\s\S]*using[\s\S]*with check/);
  assert.match(sql, /for delete to authenticated/);
});
