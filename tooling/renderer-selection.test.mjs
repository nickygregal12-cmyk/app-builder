import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRenderers, resolveRendererVariant, selectRenderer } from './lib/renderer-selection.mjs';
import { buildGenerationPlan, loadCatalog } from './lib/generator.mjs';

const renderers = loadRenderers();
const catalog = loadCatalog();
const projectTypes = Object.keys(JSON.parse(fs.readFileSync('config/project-types.json', 'utf8')).projectTypes);

function manifestFor(type, modules = {}) {
  return {
    schemaVersion: 2,
    project: { name: `${type} selection`, slug: `${type}-selection`, type, primaryGoal: 'Prove renderer selection.' },
    audience: { targetUsers: 'Test', roles: [] },
    journeys: ['Complete the primary workflow'],
    majorSurfaces: [],
    entities: ['Primary record'],
    company: { identity: {}, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: [] },
    modules,
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { accentColor: '#315b72', designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { tenantModel: null, integrations: [], uploads: {}, existingData: [], expectedScale: null, sensitivity: null, hardConstraints: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

test('every project type selects one declared renderer, and public sites are rendered statically', () => {
  const selected = Object.fromEntries(projectTypes.map((type) => [type, selectRenderer(manifestFor(type)).rendererId]));
  assert.deepEqual(selected, {
    'marketing-site': 'static-content',
    'content-site': 'static-content',
    'b2b-saas': 'application',
    'consumer-app': 'application',
    'internal-tool': 'application',
    'ai-app': 'application',
  });
});

test('selection is a pure function of the project type and the enabled modules', () => {
  // The same inputs twice, and inputs that differ only in ways selection must
  // ignore. A renderer that could vary between two builds of one approved truth
  // would make a rebuild a re-roll.
  const manifest = manifestFor('marketing-site', { seo: true, analytics: true });
  const first = selectRenderer(manifest);
  const second = selectRenderer(structuredClone(manifest));
  assert.deepEqual(first, second);

  const renamed = manifestFor('marketing-site', { seo: true, analytics: true });
  renamed.project.name = 'A completely different name';
  renamed.project.primaryGoal = 'A completely different goal, with words like application and SaaS in it.';
  assert.equal(selectRenderer(renamed).rendererId, first.rendererId);
});

test('an authenticated application area moves a public site to the application renderer, with a recorded reason', () => {
  const selection = selectRenderer(manifestFor('marketing-site', { seo: true, auth: true }));
  assert.equal(selection.rendererId, 'application');
  assert.equal(selection.overridden, true);
  assert.equal(selection.defaultRendererId, 'static-content');
  assert.match(selection.reason, /auth/);
});

test('an override only ever widens what a project can do', () => {
  // Nothing may move an application project onto the static renderer. An
  // override that took capability away would be a silent degradation dressed as
  // a decision, which is exactly what this seam exists to prevent.
  for (const type of ['b2b-saas', 'consumer-app', 'internal-tool', 'ai-app']) {
    for (const modules of [{ seo: true }, { seo: true, 'lead-generation': true }, {}]) {
      assert.equal(selectRenderer(manifestFor(type, modules)).rendererId, 'application', `${type} must stay on the application renderer`);
    }
  }
});

test('a build-time capability does not move a marketing site off the static renderer', () => {
  // Feature flags are read when the site is built. Treating them as an
  // application area would ship an SPA to gate a paragraph.
  const selection = selectRenderer(manifestFor('marketing-site', { seo: true, 'feature-flags': true }));
  assert.equal(selection.rendererId, 'static-content');
  assert.equal(selection.overridden, false);
});

test('a project type with no declared renderer fails closed', () => {
  assert.throws(() => selectRenderer(manifestFor('unsupported-type')), /No renderer is declared for project type/);
  assert.throws(
    () => selectRenderer(manifestFor('marketing-site'), { renderers: { ...renderers, projectTypeDefaults: { 'marketing-site': 'invented' } } }),
    /Unknown renderer: invented/,
  );
});

test('every renderer is implemented by exactly one ready template that agrees it implements it', () => {
  const claimed = new Map();
  for (const [rendererId, renderer] of Object.entries(renderers.renderers)) {
    const entry = catalog.templates.templates[renderer.template];
    assert.ok(entry, `renderer ${rendererId} names an unregistered template`);
    assert.equal(entry.status, 'ready');
    assert.equal(entry.renderer, rendererId, `template ${renderer.template} must declare the renderer that selects it`);
    assert.equal(claimed.has(renderer.template), false, `template ${renderer.template} is claimed by two renderers`);
    claimed.set(renderer.template, rendererId);
  }
});

test('a capability with no implementation for the selected renderer is refused, not substituted', () => {
  // `uploads` is a React feature with no static implementation. A content site
  // that enables it is moved to the application renderer by the override; one
  // that reaches the static renderer some other way must fail loudly.
  const forced = {
    ...catalog,
    renderers: { ...catalog.renderers, capabilityOverrides: [] },
  };
  assert.throws(
    () => buildGenerationPlan(manifestFor('content-site', { uploads: true }), { catalog: forced }),
    /uploads has no implementation for the static-content renderer/,
  );
});

test('a renderer variant replaces only what it states, and inherits the rest', () => {
  const contributor = {
    id: 'example',
    entry: 'src/features/example/index.tsx',
    filesRoot: 'files',
    files: ['src/features/example/index.tsx'],
    package: { dependencies: { react: '^19.0.0' } },
    requires: ['other'],
    renderers: {
      'static-content': { filesRoot: 'renderers/static-content/files', entry: 'src/features/example/index.ts', files: ['src/features/example/index.ts'] },
    },
  };
  const base = resolveRendererVariant(contributor, 'application');
  assert.equal(base.entry, 'src/features/example/index.tsx');
  assert.equal(base.filesRoot, 'files');
  assert.equal(base.rendererVariant, null);
  assert.equal(base.renderers, undefined, 'a resolved contributor must not still carry every other implementation');

  const staticContent = resolveRendererVariant(contributor, 'static-content');
  assert.equal(staticContent.entry, 'src/features/example/index.ts');
  assert.equal(staticContent.filesRoot, 'renderers/static-content/files');
  assert.equal(staticContent.rendererVariant, 'static-content');
  // Inherited, because the variant said nothing about them.
  assert.deepEqual(staticContent.requires, ['other']);
  assert.deepEqual(staticContent.package, { dependencies: { react: '^19.0.0' } });
});

test('the generation plan records which renderer built a project and why', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-renderer-'));
  try {
    const plan = buildGenerationPlan(manifestFor('marketing-site', { seo: true }), { catalog });
    assert.equal(plan.renderer.rendererId, 'static-content');
    assert.equal(plan.template.id, 'astro-static-content');
    assert.equal(plan.renderer.renderer.outputMode, 'prerendered');
    assert.ok(plan.renderer.reason.length > 0);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
