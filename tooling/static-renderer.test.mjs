import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { loadCatalog } from './lib/generator.mjs';
import { compilePresentationRegistry, loadPresentationManifest } from './lib/presentation-registry.mjs';

const catalog = loadCatalog();
const SHARED = 'templates/shared/presentation';
const APPLICATION = JSON.parse(fs.readFileSync('templates/react-vite-neutral/template.json', 'utf8'));
const STATIC = JSON.parse(fs.readFileSync('templates/astro-static-content/template.json', 'utf8'));

function manifestFor(type = 'marketing-site', modules = { seo: true, 'lead-generation': true, analytics: true, observability: true }) {
  return {
    schemaVersion: 2,
    project: { name: 'Static renderer proof', slug: 'static-renderer-proof', type, primaryGoal: 'Prove the static renderer consumes the same product and design truth.' },
    audience: { targetUsers: 'Prospective clients', roles: [] },
    journeys: ['Read what the practice does and make contact'],
    majorSurfaces: [],
    entities: ['Service'],
    company: {
      identity: { legalName: 'Static Renderer Proof Ltd' },
      services: [{ name: 'Cost consultancy', description: 'What the practice does.' }],
      locations: [{ name: 'Glasgow' }],
      contactDetails: { phone: '0141 000 0000', email: 'hello@example.com' },
      trustSignals: [],
      conversionGoals: ['enquiry'],
    },
    modules,
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { accentColor: '#315b72', designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { tenantModel: null, integrations: [], uploads: {}, existingData: [], expectedScale: null, sensitivity: null, hardConstraints: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function generate(options = {}) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-static-')), 'project');
  const result = generateComposedProject(manifestFor(options.type), out, { catalog, designChoices: options.designChoices ?? {}, projectId: options.projectId ?? null });
  return { out, ...result, cleanup: () => fs.rmSync(path.dirname(out), { recursive: true, force: true }) };
}

const read = (out, relative) => fs.readFileSync(path.join(out, relative), 'utf8');

test('one presentation contract, two implementations of it', () => {
  // Not two design systems. Both templates declare the same component ids at
  // the same versions with the same binding roles and the same variants, so a
  // section's identity, its editable properties and the presentations a person
  // may choose between do not depend on which renderer built the project.
  assert.deepEqual(Object.keys(STATIC.presentation.components).sort(), Object.keys(APPLICATION.presentation.components).sort());
  for (const [sectionType, component] of Object.entries(APPLICATION.presentation.components)) {
    assert.deepEqual(STATIC.presentation.components[sectionType], component, `${sectionType} must be the same contract in both renderers`);
  }
  assert.deepEqual(STATIC.presentation.elementRoles, APPLICATION.presentation.elementRoles);
  assert.equal(STATIC.presentation.version, APPLICATION.presentation.version);

  // And the registry the factory compiles is the same registry, because it is
  // compiled from one manifest against each template.
  const manifest = loadPresentationManifest();
  const application = compilePresentationRegistry({ template: APPLICATION, manifest });
  const staticContent = compilePresentationRegistry({ template: STATIC, manifest });
  assert.deepEqual(
    Object.fromEntries(Object.entries(staticContent.components).map(([type, entry]) => [type, { ...entry, componentVersion: entry.componentVersion }])),
    Object.fromEntries(Object.entries(application.components).map(([type, entry]) => [type, { ...entry, componentVersion: entry.componentVersion }])),
  );
});

test('both renderers read one design system rather than a copy each', () => {
  // Every Phase 4C/4D decision reaches a page as a custom property or a class
  // name. Two stylesheets would be two design systems that merely tend to
  // agree, so both templates are given the same source.
  for (const template of [APPLICATION, STATIC]) {
    const shared = Object.fromEntries((template.sharedFiles ?? []).map((entry) => [entry.to, entry.from]));
    assert.equal(shared['src/design/tokens.css'], 'presentation/tokens.css', `${template.id} must read the shared tokens`);
    assert.equal(shared['src/styles.css'], 'presentation/styles.css', `${template.id} must read the shared stylesheet`);
  }
  assert.ok(fs.existsSync(`${SHARED}/tokens.css`));
  assert.ok(fs.existsSync(`${SHARED}/styles.css`));
  // No renderer keeps its own copy alongside the shared one.
  for (const stale of ['templates/react-vite-neutral/files/src/styles.css', 'templates/react-vite-neutral/files/src/design/tokens.css', 'templates/astro-static-content/files/src/styles.css', 'templates/astro-static-content/files/src/design/tokens.css']) {
    assert.equal(fs.existsSync(stale), false, `${stale} would be a second copy of the design system`);
  }
});

test('a generated static project is portable, is a repository, and is rendered statically', () => {
  const generated = generate();
  try {
    const record = JSON.parse(read(generated.out, '.app-builder/project.json'));
    assert.equal(record.renderer.id, 'static-content');
    assert.equal(record.renderer.outputMode, 'prerendered');
    assert.equal(record.template.id, 'astro-static-content');

    const packageJson = JSON.parse(read(generated.out, 'package.json'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    assert.equal(Object.keys(dependencies).some((name) => name.startsWith('@app-builder/')), false, 'a generated repository must not depend on the factory');
    assert.equal(Object.keys(dependencies).some((name) => name === 'react' || name === 'react-dom'), false, 'a static site must not carry a React runtime');
    assert.ok(dependencies.astro, 'the static renderer declares its own framework');
    for (const script of ['dev', 'build', 'preview', 'check']) assert.ok(packageJson.scripts[script], `a portable repository offers ${script}`);

    // An ordinary repository, which is also where every ignore-aware tool stops
    // walking up. Without it the project's own linter silently linted nothing.
    assert.equal(fs.existsSync(path.join(generated.out, '.git')), true);
  } finally {
    generated.cleanup();
  }
});

test('a static build renders every composed route as its own page, with no client application', () => {
  const generated = generate();
  try {
    // One route file per page rather than one document that discovers the site.
    const route = read(generated.out, 'src/pages/[...route].astro');
    assert.match(route, /getStaticPaths/);
    assert.ok(fs.existsSync(path.join(generated.out, 'src/pages/404.astro')), 'static hosts serve 404.html by convention');

    const config = read(generated.out, 'astro.config.mjs');
    assert.match(config, /output:\s*'static'/);
    assert.match(config, /prefetch:\s*false/);

    // No React island is installed by default, and nothing in the template
    // mounts an application.
    assert.equal(fs.existsSync(path.join(generated.out, 'src/main.tsx')), false);
    assert.equal(fs.existsSync(path.join(generated.out, 'src/App.tsx')), false);

    // Every script the layout ships is inline. A `<script>` Astro would bundle
    // becomes a module graph on a page that does not need one.
    const layout = read(generated.out, 'src/layouts/SiteLayout.astro');
    const scripts = layout.match(/<script[^>]*>/g) ?? [];
    assert.ok(scripts.length > 0);
    for (const tag of scripts) assert.match(tag, /is:inline/, `every script in the static layout must stay inline: ${tag}`);
  } finally {
    generated.cleanup();
  }
});

test('a promoted visual direction survives into the static shell', () => {
  const generated = generate({ designChoices: { visualDirection: 'structured-practice' } });
  try {
    const spec = JSON.parse(read(generated.out, '.product/design-system.json'));
    assert.equal(spec.visualDirection, 'structured-practice');
    // The structural dimensions and the whole ResponsiveCompositionPlan reach
    // the page as classes, and the layout is what puts them there.
    for (const expected of ['direction-structured-practice', 'grid-symmetric', 'headings-ruled', 'moment-figure-index', 'mobile-hero-copy-first', 'mobile-order-conversion-first', 'mobile-motion-as-desktop']) {
      assert.match(spec.layout.shellClasses, new RegExp(`\\b${expected}\\b`), `${expected} must be compiled onto the shell`);
    }
    assert.match(read(generated.out, 'src/layouts/SiteLayout.astro'), /shellClasses/);
    // Mobile density and the motion contract are values, so they compile to
    // tokens the shared stylesheet reads.
    assert.equal(spec.tokens['--mobile-section-space-scale'], '0.7');
    assert.equal(spec.tokens['--motion-duration-fast'], '120ms');
    assert.equal(spec.tokens['--layout-radius'], '0.625rem');
    // The hero strategy is the one decision the renderer expresses in the DOM.
    assert.match(read(generated.out, 'src/components/Section.astro'), /heroStrategy/);
  } finally {
    generated.cleanup();
  }
});

test('element identity is derived for a static build, and stays out of the published app', () => {
  const generated = generate({ projectId: 'project-static-identity' });
  try {
    const index = JSON.parse(read(generated.out, '.app-builder/element-identity.json'));
    assert.equal(index.templateId, 'astro-static-content');
    assert.ok(index.elements.length > 0);
    // The Builder addresses an element by section and element key; the static
    // components carry exactly those and nothing else.
    const section = read(generated.out, 'src/components/Section.astro');
    assert.match(section, /data-section-id/);
    assert.match(section, /data-element-key/);
    assert.match(read(generated.out, 'src/lib/composition.ts'), /data-binding-key/);
    // Factory-only provenance never becomes a module the app imports.
    assert.equal(fs.existsSync(path.join(generated.out, 'src/generated/element-identity.ts')), false);
  } finally {
    generated.cleanup();
  }
});

test('a static site is usable before any script runs', () => {
  const generated = generate();
  try {
    const layout = read(generated.out, 'src/layouts/SiteLayout.astro');
    // Navigation ships open and is collapsed by enhancement, rather than
    // shipping closed and depending on a script to reveal it.
    assert.match(layout, /data-open="true"/);
    assert.match(layout, /class="nav-toggle"[^>]*hidden/);
    // The disclosure control is hidden until enhanced. Both selectors are
    // required: the mobile rule that shows it ties on specificity.
    const styles = read(generated.out, 'src/styles.css');
    assert.match(styles, /\.site-header\.nav-disclosure \.nav-toggle\[hidden\]/);
    // The enquiry form is a form, not a component that becomes one.
    const form = read(generated.out, 'src/features/lead-generation/EnquiryForm.astro');
    assert.match(form, /<form[^>]+method="POST"/);
    assert.match(form, /<form[^>]+action="\/__forms\.html"/);
    assert.match(form, /We could not send your enquiry/);
    assert.match(form, /Thanks — your enquiry has been sent\./);
  } finally {
    generated.cleanup();
  }
});

test('page metadata is generated per route rather than written by a browser', () => {
  const generated = generate();
  try {
    const head = read(generated.out, 'src/features/seo/Head.astro');
    for (const tag of ['<title>', 'name="description"', 'property="og:title"', 'name="twitter:card"', 'rel="canonical"']) {
      assert.ok(head.includes(tag), `${tag} must be generated into the document`);
    }
    // Nothing is claimed about where the site lives unless it was told.
    assert.match(head, /PUBLIC_SITE_URL/);
    assert.match(head, /canonical &&/);
    // The sitemap lists the routes the composition has, not a single guess.
    const sitemap = read(generated.out, 'tooling/generate-sitemap.mjs');
    assert.match(sitemap, /composition\.json/);
    assert.match(sitemap, /404\|not-found/);
  } finally {
    generated.cleanup();
  }
});

test('hosting stays the deployment adapter\'s decision', () => {
  const generated = generate();
  try {
    const netlify = read(generated.out, 'netlify.toml');
    // The SPA catch-all is the application renderer's requirement. Keeping it
    // here would serve the home page's document under every address.
    assert.equal(/to = "\/index\.html"/.test(netlify), false, 'a per-route build must not rewrite every address to one document');
    assert.match(netlify, /publish = "dist"/);
    // And nothing under src/ knows what a host is, beyond the one address an
    // enquiry is posted to.
    for (const file of ['src/layouts/SiteLayout.astro', 'src/components/Section.astro', 'src/pages/[...route].astro']) {
      assert.equal(/netlify/i.test(read(generated.out, file)), false, `${file} must not encode a host`);
    }
  } finally {
    generated.cleanup();
  }
});

test('the application renderer is unchanged by any of this', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-application-')), 'project');
  try {
    const manifest = manifestFor('b2b-saas', { auth: true, analytics: true, observability: true, profiles: true });
    manifest.infrastructure.backend = 'supabase';
    const { plan } = generateComposedProject(manifest, out, { catalog });
    assert.equal(plan.renderer.rendererId, 'application');
    assert.equal(plan.template.id, 'react-vite-neutral');
    const packageJson = JSON.parse(read(out, 'package.json'));
    assert.ok(packageJson.dependencies.react, 'an application still ships its runtime');
    assert.equal(Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).includes('astro'), false, 'no application project gains Astro');
    assert.ok(fs.existsSync(path.join(out, 'src/App.tsx')));
    assert.match(read(out, 'src/generated/recipes.tsx'), /RecipeRuntime/);
    // The SPA fallback belongs to the renderer that needs it, and still has it.
    assert.match(read(out, 'netlify.toml'), /to = "\/index\.html"/);
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});
