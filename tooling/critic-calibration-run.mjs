#!/usr/bin/env node
/**
 * Put a real Critic in front of CC2 and record what it says.
 *
 * Everything else in the calibration lane measures verdicts somebody already
 * has. This produces them: it renders each synthetic fixture, hands the images
 * to a different-vendor reviewer, and writes a verdicts file
 * `npm run calibration:score` reads.
 *
 * ## Blinding, and why it is not optional here
 *
 * The fixtures are named `cc-20-saas-slop.html` and `cc-25-restrained-strong.html`.
 * The Codex CLI is handed image *paths*, and a path is text the model reads. A
 * run over files named after their own answers would measure whether the model
 * can read a filename.
 *
 * So every artifact is copied into a scratch packet under a neutral name
 * (`artifact-07/view--desktop.png`), in an order derived from a recorded seed,
 * and the mapping back to item ids stays here rather than travelling with the
 * images. The packet directory is deliberately outside the repository: Codex
 * runs `--sandbox read-only`, which is read-only about *writing* and not about
 * reading, and a reviewer that wandered into `examples/critic-calibration/`
 * would find the corpus manifest with every planted defect written down.
 *
 * ## What it does not do
 *
 * It records verdicts. It does not decide whether the Critic passed — that is
 * `measureCalibration`, which compares them against what the corpus asserts, and
 * keeping the two apart means the thing producing the numbers is not also the
 * thing grading them.
 *
 *   node tooling/critic-calibration-run.mjs --authorise --seed <seed>
 *   node tooling/critic-calibration-run.mjs --authorise --seed s --only cc-24,cc-25
 *
 * `--authorise` is required and has no default. This spends the operator's
 * Codex credits against a third party, and deny-by-default is the house rule
 * for anything that does.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { loadCorpus } from './lib/critic-calibration.mjs';
import { buildPrompt, criterionCoverage, extractVerdictJson, normaliseVerdict, runCodexCli } from './lib/codex-visual-reviewer.mjs';
import { criteriaFor } from './lib/visual-rubric.mjs';
import { selectReference } from './lib/visual-benchmarks.mjs';

const ROOT = process.cwd();

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
};

/**
 * The widths the corpus is judged at.
 *
 * Two, and they are the two `responsive-recomposition` names: the phone and the
 * desktop it would have been narrowed from. A third width would cost a third of
 * the run and answer no question the rubric asks.
 */
const VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]);

/**
 * Every fixture is one page, and the packet says so.
 *
 * Not inferred from the captures — that would let a thin capture justify
 * itself. An `html-document` artifact is a single document by construction, and
 * this is the one place that fact is known.
 */
const HTML_DOCUMENT_ROUTES = 1;

/**
 * Render one fixture at both widths.
 *
 * Full-page rather than viewport-sized: a critic asked about pacing and rhythm
 * needs the whole scroll, and a fold-height screenshot answers a different
 * question. Playwright is imported lazily so the module loads on a machine
 * without browsers, which is most of CI.
 */
async function renderFixture(browser, file, outDir) {
  const captures = [];
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      // The corpus contains a fixture whose entrance animation would otherwise
      // be photographed mid-flight. Honouring reduced motion is what the
      // fixtures already do, and it makes the capture deterministic.
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(`file://${path.resolve(file)}`, { waitUntil: 'load' });
    await page.waitForTimeout(250);
    const name = `view--${viewport.name}.png`;
    await page.screenshot({ path: path.join(outDir, name), fullPage: true });
    await context.close();
    captures.push({ id: `${viewport.name}`, route: '/', viewport: viewport.name, state: {}, file: name, sha256: null });
  }
  return captures;
}

/**
 * The blinded running order.
 *
 * Derived from the seed exactly as `blindedOrder` does, so a disputed run can
 * be reproduced. Position is what names the directory; the item id never
 * reaches the packet.
 */
function blindedPlan(items, seed) {
  return [...items]
    .map((item) => ({ item, key: crypto.createHash('sha256').update(`${seed}::${item.id}`).digest('hex') }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ item }, index) => ({ position: index + 1, item }));
}

/**
 * Turn a recorded verdict into the shape the measurement reads.
 *
 * `meanScore` is the plain mean of the criteria that were scorable. It is not
 * the gate's `overallScore` — no ceilings, no benchmark cap — because the
 * question here is what the Critic *said*, and applying our own corrections
 * before grading it would grade our corrections.
 */
function toCalibrationVerdict(itemId, verdict) {
  const scores = verdict.criterionScores.map((entry) => Number(entry.score));
  return {
    itemId,
    meanScore: Number((scores.reduce((total, value) => total + value, 0) / scores.length).toFixed(3)),
    criterionScores: verdict.criterionScores,
    failingCriteria: verdict.failingCriteria,
    holisticTier: verdict.holisticTier ?? null,
    observations: verdict.observations ?? {},
    signatureMoment: verdict.signatureMoment ?? null,
    unprovenCriteria: verdict.unprovenCriteria.map((entry) => entry.criterion),
    reviewedBy: verdict.reviewedBy,
    rationale: verdict.rationale,
  };
}

async function main() {
  const seed = argument('--seed');
  if (!seed) {
    console.error('Usage: node tooling/critic-calibration-run.mjs --authorise --seed <seed>\nAn unseeded order cannot be reproduced, and a run nobody can re-examine is not evidence.');
    process.exit(2);
  }
  if (!process.argv.includes('--authorise')) {
    console.error(
      'This run calls a third-party provider and spends real credits. Pass --authorise from an operator decision.\n'
      + 'Deny-by-default is the house rule for anything that does, and nothing in the ordinary check lane passes it.',
    );
    process.exit(2);
  }

  const corpus = loadCorpus();
  const only = argument('--only');
  const wanted = only ? new Set(only.split(',').map((value) => value.trim())) : null;

  // Only the synthetic HTML fixtures are renderable. The ten genuine-business
  // anchors are references to verdicts already recorded under the v1 criteria,
  // and re-scoring them here would mean mixing a fresh Critic's numbers with old
  // ones inside a single stratum mean. They are reported as not scored, which is
  // what `itemsMissing` is for.
  const renderable = corpus.items.filter((item) => item.artifact?.kind === 'html-document' && (!wanted || wanted.has(item.id)));
  const skipped = corpus.items.filter((item) => item.artifact?.kind !== 'html-document').map((item) => item.id);

  const packetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-blinded-'));
  const plan = blindedPlan(renderable, seed);
  console.log(`Rendering ${plan.length} artifact(s) into ${packetRoot} under blinded names.\n`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();

  const criteria = criteriaFor({ projectType: 'marketing-site' });
  const verdicts = [];
  const failures = [];
  const mapping = [];

  try {
    for (const entry of plan) {
      const label = `artifact-${String(entry.position).padStart(2, '0')}`;
      const dir = path.join(packetRoot, label);
      fs.mkdirSync(dir, { recursive: true });
      const captures = await renderFixture(browser, path.join(ROOT, entry.item.artifact.ref), dir);
      mapping.push({ position: entry.position, label, itemId: entry.item.id, stratum: entry.item.qualityStratum });

      const coverage = criterionCoverage(criteria, captures, { artifactRouteCount: HTML_DOCUMENT_ROUTES });
      const candidate = {
        candidateId: label,
        // Nothing here names the fixture. `subject` is the fictional business,
        // which a reviewer would legitimately know; the stratum and the planted
        // defect never leave this process.
        directionLabel: 'as published',
        captures,
        artifactRouteCount: HTML_DOCUMENT_ROUTES,
        gate: { status: 'clear', blocking: [], mustAddress: [] },
      };
      const packet = {
        business: entry.item.subject.split('—')[0].trim(),
        criteria,
        artifactRouteCount: HTML_DOCUMENT_ROUTES,
        candidates: [candidate],
      };
      // Single-page documents for small businesses: no reference in the corpus
      // solves a problem resembling theirs, so no comparison is offered and the
      // verdict records UNASSESSED. That is the honest state, and forcing a
      // comparison against an irrelevant reference would produce noise.
      const benchmark = selectReference({ businessKind: null, anchors: [] });
      const prompt = buildPrompt({ packet, candidate, coverage, benchmark: benchmark.matched ? benchmark : null });

      process.stdout.write(`  ${label} … `);
      try {
        const output = runCodexCli({ prompt, images: captures.map((capture) => path.join(dir, capture.file)), cwd: dir });
        const raw = extractVerdictJson(output);
        const model = typeof raw?.model === 'string' && raw.model.trim() ? raw.model.trim() : 'codex-cli';
        const verdict = normaliseVerdict(raw, { candidate, coverage, model });
        const calibration = toCalibrationVerdict(entry.item.id, verdict);
        verdicts.push(calibration);
        console.log(`${calibration.meanScore}  ${calibration.holisticTier ?? '—'}`);
      } catch (error) {
        failures.push({ itemId: entry.item.id, label, error: error.message });
        console.log(`FAILED — ${error.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
  }

  const out = {
    schemaVersion: 1,
    authority: 'critic-calibration-run',
    corpus: corpus.corpus,
    seed,
    reviewer: { vendor: 'openai', runtime: 'codex-cli' },
    scoredWith: 'examples/critic-calibration/rubric.v2.md',
    // Kept so a disputed result can be re-examined, and kept OUT of the packet
    // so the reviewer never saw it.
    blindingMapping: mapping,
    notScored: skipped,
    notScoredReason: 'Genuine-business anchors reference verdicts recorded under the v1 criteria. Re-scoring them here would mix a fresh Critic\'s numbers with old ones inside one stratum mean.',
    failures,
    verdicts,
  };
  const file = argument('--out', '.app-builder/critic-calibration/cc2-run.json');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(out, null, 2)}\n`);

  console.log(`\n  scored   ${verdicts.length}/${plan.length}`);
  if (failures.length) console.log(`  failed   ${failures.map((entry) => entry.itemId).join(', ')}`);
  console.log(`  written  ${file}`);
  console.log(`\n  Blinded packet left at ${packetRoot} for inspection. Remove it when done.`);
  console.log(`  Next: npm run calibration:score -- --verdicts ${file}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
