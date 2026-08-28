#!/usr/bin/env node
/**
 * Does the document a generated application actually SHIPS carry its own
 * metadata?
 *
 * `tooling/document-head.test.mjs` reads the generated repository's source
 * `index.html`, which is cheap, deterministic and runs on every pull request.
 * It is also, on its own, an argument rather than a measurement: a build step
 * that rewrote the head would make it true and irrelevant. This command settles
 * that by installing and building the generated repository as an ordinary
 * project and reading `dist` — the bytes a crawler receives.
 *
 *   npm run acceptance:document-metadata
 *   npm run acceptance:document-metadata -- --keep    # leave the workspace
 *
 * It builds THREE projects, because one build can only show one state:
 *
 *   known      a project that declares its site URL. Title, description, Open
 *              Graph, canonical and og:url must all be in the built document.
 *   partial    the same project with no site URL. Everything above except the
 *              canonical and og:url, which must be absent rather than invented.
 *   planted    the defect itself, reintroduced by putting the scaffold
 *              placeholder back after generation. The scanner must refuse it,
 *              and it must refuse it for the stated reason.
 *
 * The planted case is the one that makes the other two mean anything. Without
 * it this command proves a build passes a check; with it, it proves the check
 * can fail.
 *
 * What it deliberately does not claim: nothing here fixes per-route
 * crawlability. The application renderer serves one document for every
 * client-side route and the report says so, every run, as a recorded limit.
 * docs/RENDERER_SELECTION.md is where that decision lives.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { generateComposedProject } from './lib/composed-generator.mjs';
import { readBuiltDocuments, readDocument, scanSeoAeo } from './lib/seo-aeo.mjs';

const KEEP = process.argv.includes('--keep');
const FACTORY_ROOT = process.cwd();

const BASE = {
  name: 'Northwind Freight',
  slug: 'northwind-freight',
  type: 'b2b-saas',
  primaryGoal: 'Track shipments and settle carrier invoices in one place.',
};
const SITE_URL = 'https://northwind.example';

function manifest(project) {
  return {
    schemaVersion: 1,
    project,
    modules: { seo: true },
    infrastructure: { backend: 'none', deployment: 'none' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 1 },
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}:\n${(result.stderr || result.stdout || '').split('\n').slice(-12).join('\n')}`);
  }
  return result;
}

/** Generate, optionally sabotage, install, build, and read what shipped. */
function buildCase({ id, project, sabotage = null, root }) {
  const workspace = path.join(root, id);
  const { composition } = generateComposedProject(manifest(project), workspace, { factoryRoot: FACTORY_ROOT });
  const documentPath = path.join(workspace, 'index.html');
  const source = fs.readFileSync(documentPath, 'utf8');
  if (sabotage) fs.writeFileSync(documentPath, sabotage(source));

  run('npm', ['install', '--no-audit', '--no-fund'], workspace);
  run('npm', ['run', 'build'], workspace);

  const documents = readBuiltDocuments(path.join(workspace, 'dist'));
  const report = scanSeoAeo({
    documents,
    // One document, one declared route: this command is measuring the head, and
    // route crawlability is a separate recorded finding rather than noise here.
    routesDeclared: documents.length,
    siteUrl: project.siteUrl ?? null,
  });
  return { id, workspace, documents, report, routesDeclared: composition.pages?.length ?? 0, built: documents[0] ? readDocument(documents[0].html) : null };
}

function show(result) {
  const { built, report } = result;
  console.log(`\n-- ${result.id} --`);
  console.log(`  documents in dist: ${result.documents.map((entry) => entry.path).join(', ') || 'none'}`);
  console.log(`  title:             ${built?.title ?? '(none)'}`);
  console.log(`  description:       ${built?.description ?? '(none)'}`);
  console.log(`  og:title:          ${built?.ogTitle ?? '(none)'}`);
  console.log(`  canonical:         ${built?.canonical ? 'present' : 'absent'}`);
  console.log(`  lang:              ${built?.language ?? '(none)'}`);
  console.log(`  clean:             ${report.clean}`);
  for (const finding of report.findings) console.log(`    ${finding.severity.padEnd(9)} ${finding.check} — ${finding.detail}`);
}

const failures = [];
function expect(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * Blockers this command is NOT claiming to fix, and will not pretend away.
 *
 * A client application's body is `<div id="root"></div>` until React runs, so
 * the served document states no top-level heading. That is a true finding about
 * a real limit of the renderer, and writing metadata into the head does not
 * change it: an `h1` planted in the scaffold would be presentation the generator
 * invented rather than content the composer placed.
 *
 * It is listed here rather than filtered silently, and the cases below assert
 * that NOTHING ELSE blocks. A new blocker appearing in an application build is
 * a regression this command must catch, which it cannot do if it only checks
 * for the absence of the two findings it happens to care about.
 */
const KNOWN_RENDERER_LIMITS = new Set(['document-heading-missing']);

function unexpectedBlockers(report) {
  return report.findings
    .filter((entry) => entry.severity === 'blocker' && !KNOWN_RENDERER_LIMITS.has(entry.check))
    .map((entry) => entry.check);
}

const root = KEEP ? fs.mkdtempSync(path.join(process.cwd(), '.tmp-document-metadata-')) : fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-document-metadata-'));

console.log('== Document metadata, measured on built output ==\n');
console.log(`Workspace root: ${root}`);

try {
  const known = buildCase({ id: 'known', project: { ...BASE, siteUrl: SITE_URL }, root });
  const partial = buildCase({ id: 'partial', project: BASE, root });
  const planted = buildCase({
    id: 'planted',
    project: BASE,
    root,
    // The exact defect, put back: the scaffold head the template ships before
    // the generator writes through it.
    sabotage: (source) => source.replace(/<!-- app-builder:document-head -->[\s\S]*?<!-- \/app-builder:document-head -->/, '<title>Generated application</title>'),
  });

  for (const result of [known, partial, planted]) show(result);

  // --- Positive -------------------------------------------------------------
  expect(known.built?.title === BASE.name, `known: built title is "${known.built?.title}", expected "${BASE.name}"`);
  expect(known.built?.description === BASE.primaryGoal, 'known: the built document carries the project\'s own description');
  expect(known.built?.ogTitle === BASE.name, 'known: the built document carries og:title');
  expect(known.built?.canonical === true, 'known: a declared site URL must reach the built document as a canonical link');
  expect(known.documents[0]?.html.includes(`${SITE_URL}/`), 'known: og:url must carry the declared site URL');
  expect(unexpectedBlockers(known.report).length === 0, `known: unexpected blocker(s) ${unexpectedBlockers(known.report).join(', ')}`);

  // --- Partial --------------------------------------------------------------
  expect(partial.built?.title === BASE.name, 'partial: a project without a site URL still names itself');
  expect(partial.built?.description === BASE.primaryGoal, 'partial: a project without a site URL still describes itself');
  expect(partial.built?.canonical === false, 'partial: an undeclared canonical address must not be invented');
  expect(!partial.documents[0]?.html.includes('og:url'), 'partial: no og:url without a declared site URL');
  expect(partial.report.findings.some((f) => f.check === 'canonical-unavailable'), 'partial: the withheld canonical is recorded as an advisory limit');
  expect(
    partial.report.findings.find((f) => f.check === 'canonical-unavailable')?.severity === 'advisory',
    'partial: withholding what is unknown is honest behaviour and must never be scored as a defect',
  );
  expect(unexpectedBlockers(partial.report).length === 0, `partial: unexpected blocker(s) ${unexpectedBlockers(partial.report).join(', ')}`);

  // --- Negative -------------------------------------------------------------
  const plantedChecks = planted.report.findings.map((entry) => entry.check);
  expect(planted.built?.title === 'Generated application', `planted: expected the scaffold title to survive the build, got "${planted.built?.title}"`);
  expect(plantedChecks.includes('document-title-placeholder'), 'planted: the scanner must refuse a scaffold placeholder in built output');
  expect(plantedChecks.includes('document-description-missing'), 'planted: the scanner must refuse a built document with no description');
  expect(planted.report.clean === false, 'planted: the defect must fail');
  // The difference between the planted build and the honest one is the whole
  // measurement. Both carry the renderer's known limits; only the planted build
  // carries the defect, and it must be exactly the defect that was planted.
  expect(
    unexpectedBlockers(planted.report).sort().join(',') === 'document-description-missing,document-title-placeholder',
    `planted: expected exactly the planted defect, got ${unexpectedBlockers(planted.report).join(', ') || 'nothing'}`,
  );

  // --- Isolation ------------------------------------------------------------
  expect(!partial.documents[0]?.html.includes(SITE_URL), 'isolation: the project without a URL must not carry the other project\'s');

  // --- The limit this does not fix ------------------------------------------
  const documents = known.documents.length;
  console.log('\n-- recorded limit: the served document states no heading --');
  console.log(`  Every application build above reports ${[...KNOWN_RENDERER_LIMITS].join(', ')}, and correctly so:`);
  console.log('  the body is <div id="root"></div> until React runs, so an answer engine reading what');
  console.log('  ships finds no stated claim. Head substitution cannot fix that; the renderer decides it.');

  console.log('\n-- recorded limit: route crawlability is NOT fixed by this --');
  console.log(`  The composition declares ${known.routesDeclared} route(s); the build serves ${documents} HTML document(s).`);
  console.log(`  ${Math.max(0, known.routesDeclared - documents)} route(s) therefore have no document head of their own, whatever the head above says.`);
  console.log('  Per-route crawlable metadata is a renderer property, not a head-substitution property.');
  console.log('  Public content sites select the static/content renderer, which emits a document per');
  console.log('  route. See docs/RENDERER_SELECTION.md for when each renderer is the correct one.');
  expect(documents === 1, `the application renderer is expected to emit exactly one document; it emitted ${documents}`);

  // Proved rather than asserted: run the same build through the scanner with
  // the routes the composition actually declares, and the route finding appears.
  if (known.routesDeclared > 1) {
    const honest = scanSeoAeo({ documents: known.documents, routesDeclared: known.routesDeclared, siteUrl: SITE_URL });
    expect(
      honest.findings.some((entry) => entry.check === 'route-metadata-not-crawlable'),
      'the route-crawlability limit must be a measured finding, not a sentence in a report',
    );
  }

  console.log('\n== Result ==\n');
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('PASS  Built documents carry project metadata; unknown fields are withheld; the planted defect is refused.');
  }
} finally {
  if (KEEP) console.log(`\nWorkspaces kept at ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
}
