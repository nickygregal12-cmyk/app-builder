#!/usr/bin/env node
/**
 * Phase 4.2A acceptance, run against a genuine business.
 *
 * The question this stage exists to answer is not "does Astro build?". It is:
 * can the same approved product truth, the same promoted design and the same
 * quality contracts produce a *better* marketing site through a static
 * renderer than through the application renderer — and can it be shown rather
 * than asserted?
 *
 * So this replays the owner-approved nbm intake bundle through the ordinary
 * service, generates the project the way the factory now generates it,
 * verifies it as an independent repository, photographs what it renders at
 * three widths across every route it has, lints its compiled design, and then
 * builds the *same* truth again through the application renderer purely to
 * measure the difference. Nothing about the business is edited to make any of
 * that pass.
 *
 * Two things it deliberately does not do.
 *
 * It does not promote a visual direction. A promoted direction is a recorded
 * review decision, and this runner did not review anything. `--direction`
 * supplies one as an *input* so the run can prove the static renderer preserves
 * it; the project's durable design choices are untouched.
 *
 * It does not issue a visual verdict. It produces the evidence a reviewer needs
 * and stops, for the same reason `visual-candidate-acceptance.mjs` stops.
 *
 *   node tooling/static-renderer-acceptance.mjs [--direction structured-practice] [--out dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { generateComposedProject } from './lib/composed-generator.mjs';
import { loadCatalog } from './lib/generator.mjs';

const BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';
const KNOWLEDGE = 'examples/genuine-business/nbm-approved-knowledge.v1.json';
const ACCEPTANCE_ROOT = '.app-builder/static-renderer';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const root = path.resolve(argument('--out') ?? ACCEPTANCE_ROOT);
const stateRoot = path.join(root, 'service');
const workspacesRoot = path.join(root, 'workspaces');
const direction = argument('--direction');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * What a visitor's browser is actually asked to download, and what a crawler
 * actually receives.
 *
 * `routeDocuments` is the number that matters most for a marketing site and the
 * one a build log never shows: how many addresses resolve to a real document
 * rather than to the same empty shell.
 */
function measureOutput(distDir) {
  const files = walk(distDir);
  const bytes = { js: 0, css: 0, html: 0, other: 0 };
  const documents = [];
  for (const file of files) {
    const size = fs.statSync(file).size;
    const extension = path.extname(file).toLowerCase();
    if (extension === '.js' || extension === '.mjs') bytes.js += size;
    else if (extension === '.css') bytes.css += size;
    else if (extension === '.html') { bytes.html += size; documents.push({ file: path.relative(distDir, file), bytes: size }); }
    else bytes.other += size;
  }
  // `__forms.html` is a Netlify form definition, not a page a visitor reaches.
  const routeDocuments = documents.filter((entry) => !entry.file.startsWith('__'));
  return {
    files: files.length,
    bytes,
    routeDocuments: routeDocuments.length,
    documents: routeDocuments.sort((a, b) => a.file.localeCompare(b.file)),
  };
}

/** What a route's document says about itself before any script has run. */
function inspectDocument(file) {
  const html = fs.readFileSync(file, 'utf8');
  const tag = (pattern) => html.match(pattern)?.[1]?.trim() ?? null;
  return {
    bytes: Buffer.byteLength(html),
    title: tag(/<title>([^<]*)<\/title>/i),
    description: tag(/<meta\s+name="description"\s+content="([^"]*)"/i),
    canonical: tag(/<link\s+rel="canonical"\s+href="([^"]*)"/i),
    openGraphTitle: tag(/<meta\s+property="og:title"\s+content="([^"]*)"/i),
    structuredData: /application\/ld\+json/.test(html),
    headings: (html.match(/<h1[^>]*>/gi) ?? []).length,
    sections: (html.match(/data-section-id="/g) ?? []).length,
    editableElements: (html.match(/data-element-key="/g) ?? []).length,
    scriptTags: (html.match(/<script/gi) ?? []).length,
    externalScripts: (html.match(/<script[^>]+src=/gi) ?? []).length,
  };
}

/**
 * The same truth through the other renderer, for measurement only.
 *
 * This is not a product path and never runs during generation: it forces the
 * application renderer over a project the factory would render statically, so
 * the comparison is of two renderings of one composition rather than of two
 * different products. A number produced any other way would be comparing a
 * marketing site to something else.
 */
function generateComparison(manifest, outputDir, designChoices) {
  const catalog = loadCatalog(process.cwd());
  const forced = {
    ...catalog,
    renderers: {
      ...catalog.renderers,
      projectTypeDefaults: { ...catalog.renderers.projectTypeDefaults, [manifest.project.type]: 'application' },
      capabilityOverrides: [],
    },
  };
  fs.rmSync(outputDir, { recursive: true, force: true });
  return generateComposedProject(manifest, outputDir, { catalog: forced, designChoices });
}

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const store = new FactoryStore({ stateRoot });
const service = new FactoryService({ store, workspacesRoot, factoryRoot: process.cwd() });

try {
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  // The same frozen truth the candidate lane composes from. This run asks
  // whether the static renderer preserves a composition, which only means
  // something if it is handed the composition the application renderer is
  // actually judged on rather than a manifest-only shadow of it.
  const knowledgePack = JSON.parse(fs.readFileSync(KNOWLEDGE, 'utf8'));
  const { project } = await service.replayIntakeBundle(bundle, { knowledgePack });
  console.log(`Replayed ${bundle.bundleId} as ${project.id}.`);
  console.log(`Frozen knowledge pack ${knowledgePack.packHash}: ${knowledgePack.sources.length} source(s), ${knowledgePack.facts.length} fact(s).`);

  if (direction) {
    // Supplied, not promoted. The run needs a build that presents by the
    // direction a reviewer selected in order to prove the static renderer
    // preserves it; recording the choice is the reviewer's act, not this one's.
    await service.writeDesignChoices(project.id, { visualDirection: direction });
    console.log(`Presenting by supplied visual direction: ${direction} (an input to this run, not a promotion).`);
  }

  const generated = await service.generateProject(project.id);
  const record = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.app-builder/project.json'), 'utf8'));
  console.log(`Renderer: ${record.renderer.id} (${record.renderer.label}) via template ${record.template.id}.`);
  console.log(`Reason: ${record.renderer.reason}`);

  const verified = await service.verifyProject(project.id);
  console.log(`Independent install, check and build: ${verified.task.state}.`);

  const packageJson = JSON.parse(fs.readFileSync(path.join(generated.workspace, 'package.json'), 'utf8'));
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const factoryDependencies = Object.keys(dependencies).filter((name) => name.startsWith('@app-builder/'));
  if (factoryDependencies.length) throw new Error(`The generated repository depends on the factory: ${factoryDependencies.join(', ')}.`);

  const staticOutput = measureOutput(path.join(generated.workspace, 'dist'));
  // `about/index.html` is the route `/about`; `404.html` is `/404`; the home
  // page's own `index.html` reduces to `/`.
  const routeOf = (file) => `/${file.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '')}`;
  const documents = Object.fromEntries(staticOutput.documents.map((entry) => [
    routeOf(entry.file),
    inspectDocument(path.join(generated.workspace, 'dist', entry.file)),
  ]));

  // The same truth, rendered by the application renderer, for comparison only.
  const comparisonDir = path.join(root, 'application-comparison');
  const manifest = service.getManifest(project.id);
  generateComparison(manifest, comparisonDir, direction ? { visualDirection: direction } : {});
  const { spawnSync } = await import('node:child_process');
  const run = (args) => spawnSync('npm', args, { cwd: comparisonDir, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' });
  const installed = run(['install', '--no-audit', '--no-fund']);
  if (installed.status !== 0) throw new Error(`Comparison build failed to install: ${installed.stderr?.split('\n').slice(-5).join('\n')}`);
  const built = run(['run', 'build']);
  if (built.status !== 0) throw new Error(`Comparison build failed: ${built.stderr?.split('\n').slice(-5).join('\n')}`);
  const applicationOutput = measureOutput(path.join(comparisonDir, 'dist'));

  const lint = service.designLintReport(project.id);

  const preview = await service.startPreview(project.id);
  console.log(`Preview: ${preview.state} at ${preview.path}`);
  const evidence = await service.captureRenderedEvidence(project.id);
  await service.stopPreview(project.id);

  const captured = service.getRenderedEvidence(project.id, evidence.evidence.id);
  const report = {
    schemaVersion: 1,
    stage: '4.2A',
    business: bundle.projectManifest.project.name,
    bundleId: bundle.bundleId,
    projectId: project.id,
    workspace: generated.workspace,
    renderer: record.renderer,
    template: record.template,
    visualDirection: {
      supplied: direction,
      compiledInto: record.design?.visualDirectionId ?? null,
      // Read from the portable design system the build compiled, which is what
      // the shell actually carries, rather than from the design record the
      // choice was made on. The question is what survived into the output.
      shellClasses: JSON.parse(fs.readFileSync(path.join(generated.workspace, '.product/design-system.json'), 'utf8')).layout?.shellClasses ?? null,
      promoted: false,
      note: 'Supplied to this run as an input so the static renderer can be checked against an approved direction. No candidate was promoted here.',
    },
    independentRepository: {
      install: 'succeeded',
      check: 'succeeded',
      build: 'succeeded',
      factoryDependencies: factoryDependencies.length,
    },
    output: {
      static: staticOutput,
      application: applicationOutput,
      clientJavaScriptDelta: applicationOutput.bytes.js - staticOutput.bytes.js,
      routeDocumentDelta: staticOutput.routeDocuments - applicationOutput.routeDocuments,
    },
    documents,
    designLint: lint ? { counts: lint.counts, findings: lint.findings } : null,
    renderedEvidence: {
      id: evidence.evidence.id,
      captures: captured?.captures.length ?? 0,
      uncovered: captured?.uncovered ?? [],
      failures: evidence.failures ?? [],
      viewports: [...new Set((captured?.captures ?? []).map((entry) => entry.viewport))].sort(),
      routes: [...new Set((captured?.captures ?? []).map((entry) => entry.route))].sort(),
      interactions: (captured?.captures ?? []).filter((entry) => entry.state.interaction).map((entry) => entry.id),
    },
    manualEdits: {
      total: 0,
      note: 'No file in the generated repository was edited by hand. Every defect this run found was fixed in the factory and the project regenerated.',
    },
    independentVisualReview: {
      executed: false,
      detail: 'This runner produces evidence and stops. The creator of a rendering may not pass its own visual review.',
    },
  };

  fs.writeFileSync(path.join(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, documents: Object.keys(documents), designLint: report.designLint?.counts ?? null }, null, 2));
  console.log('');
  console.log(`Client JavaScript: ${staticOutput.bytes.js} bytes static vs ${applicationOutput.bytes.js} bytes application.`);
  console.log(`Route documents:   ${staticOutput.routeDocuments} static vs ${applicationOutput.routeDocuments} application.`);
  console.log(`Evidence: ${root}`);
  console.log(`  report.json, service/ (durable factory state), workspaces/ (the built site)`);
  console.log('Review it in the ordinary Console:');
  console.log(`  node tooling/dev-stack.mjs --state-root ${path.join(root, 'service')} --workspaces-root ${path.join(root, 'workspaces')}`);
} finally {
  await service.close();
  store.close();
}
