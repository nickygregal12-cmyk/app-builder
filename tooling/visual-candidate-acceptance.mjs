#!/usr/bin/env node
/**
 * Phase 4D acceptance, run against a genuine business.
 *
 * Synthetic canonical apps cannot close this stage. The question 4D exists to
 * answer — can one approved product truth produce several genuinely different,
 * coherent, responsive visual answers? — is only meaningfully asked of a real
 * company's material, because a synthetic fixture can be shaped until it says
 * yes.
 *
 * This replays the owner-approved nbm intake bundle, generates candidates over
 * the one frozen truth, builds and photographs each of them, and stops at the
 * point where judgement is required.
 *
 * It stops there deliberately. The creator of a candidate may not promote it,
 * and no genuinely independent model runtime is enabled in this repository, so
 * the runner will not manufacture a verdict to make its own report look
 * complete. Supply `--verdicts <file>` with a reviewer's decisions and it will
 * record them and promote; supply nothing and it reports the promotion as
 * outstanding, which is the honest state.
 *
 * The run leaves an ordinary factory state behind at `.app-builder/visual-review`
 * rather than in a build temp directory, because the evidence exists to be
 * looked at by somebody who did not produce it. `npm run review:visual-candidates`
 * points the ordinary Builder Console at exactly that state, so reviewing is
 * opening a page rather than finding a screenshot in a workspace.
 *
 * The business is an argument rather than a constant. It was nbm's bundle and
 * nbm's knowledge pack hard-coded at the top of this file, which was honest
 * while there was one genuine business and became the reason a second one could
 * not be photographed. A second business is the whole point of the exercise —
 * one company's three candidates cannot show whether the factory makes
 * different-looking sites or makes one site in three colours — so the runner
 * takes a bundle and, where one exists, a frozen pack. Defaults are unchanged,
 * so `npm run acceptance:visual-candidates` is still the nbm run it always was.
 *
 * `--knowledge` is optional because a legitimate business may have nothing to
 * ingest. MGB's approved intake declares three social and register URLs supplied
 * as places to look and three assets whose bytes never arrived; there is no pack
 * to freeze, and inventing an empty one to look source-backed is exactly what
 * the truth guard exists to refuse.
 *
 *   node tooling/visual-candidate-acceptance.mjs [--bundle b.json] [--knowledge k.json]
 *                                                [--verdicts verdicts.json] [--out dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { designReferenceSummary } from '../apps/service/src/visual-references.js';
import { captureInventory, writeVisualReviewPacket } from './lib/visual-review-report.mjs';
import { classifyCandidateTruthReadiness } from './lib/candidate-truth-readiness.mjs';
import { assertPortableForReview, buildPortabilityRecord, summarisePortability } from './lib/candidate-portability.mjs';

// The default business, kept so the existing acceptance command means what it
// has always meant.
const DEFAULT_BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';
// The frozen half of the same truth. The bundle carries approved intent; this
// carries the material that intent was approved over, ingested once and
// committed so every candidate in a set - and every later rerun - is composed
// from identical bytes rather than from whatever the business published today.
const DEFAULT_KNOWLEDGE = 'examples/genuine-business/nbm-approved-knowledge.v1.json';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

/**
 * Which business, and what material it comes with.
 *
 * Passing `--bundle` without `--knowledge` means "this business has no ingested
 * material", not "I forgot the pack". Silently falling back to nbm's pack would
 * compose one company's candidates from another company's facts, so the default
 * pack only applies to the default bundle.
 */
function selectCase() {
  const bundlePath = argument('--bundle') ?? DEFAULT_BUNDLE;
  const explicitKnowledge = argument('--knowledge');
  const knowledgePath = explicitKnowledge ?? (bundlePath === DEFAULT_BUNDLE ? DEFAULT_KNOWLEDGE : null);
  if (knowledgePath && !fs.existsSync(knowledgePath)) throw new Error(`Knowledge pack not found: ${knowledgePath}`);
  if (!fs.existsSync(bundlePath)) throw new Error(`Approved intake bundle not found: ${bundlePath}`);
  return { bundlePath, knowledgePath };
}

/**
 * The runtime driving this run, declared rather than assumed.
 *
 * Whatever generates a candidate set is barred from promoting it, so this is
 * the fact the whole independence guarantee rests on. A default would be this
 * script guessing which model is at the keyboard, and a wrong guess here does
 * not fail loudly — it silently authorises the creator to approve itself.
 */
function runIdentity() {
  const vendor = process.env.APP_BUILDER_RUNTIME_VENDOR;
  const model = process.env.APP_BUILDER_RUNTIME_MODEL;
  if (!vendor || !model) {
    throw new Error(
      'Set APP_BUILDER_RUNTIME_VENDOR and APP_BUILDER_RUNTIME_MODEL to the runtime driving this run '
      + '(for example anthropic / claude-opus-5). Whatever generates these candidates cannot later promote '
      + 'them, so the run refuses to guess who it is.',
    );
  }
  return { role: 'visual-direction', vendor, model };
}

// Durable factory state, not build scratch. `.tmp` says "delete me", and a
// reviewer told the only copy of the evidence is under a temp directory is
// being told to hunt through build output. This is the same ordinary state
// layout the Console already serves, in a place named for what it holds.
const REVIEW_ROOT = '.app-builder/visual-review';
const root = path.resolve(argument('--out') ?? REVIEW_ROOT);
const stateRoot = path.join(root, 'service');
const workspacesRoot = path.join(root, 'workspaces');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed in ${cwd}: ${`${result.stderr ?? ''}${result.stdout ?? ''}`.trim().split('\n').slice(-8).join('\n')}`);
}

function sequenceOf(candidate) {
  return candidate.signature.sequence.map((page) => `${page.pageId}: ${page.presentation.join(' > ')}`);
}

fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const store = new FactoryStore({ stateRoot });
const service = new FactoryService({ store, workspacesRoot, factoryRoot: process.cwd() });

try {
  const { bundlePath, knowledgePath } = selectCase();
  const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
  const knowledgePack = knowledgePath ? JSON.parse(fs.readFileSync(knowledgePath, 'utf8')) : null;
  const { project } = await service.replayIntakeBundle(bundle, { knowledgePack });
  console.log(`Replayed ${bundle.bundleId} (${bundlePath}) as ${project.id}.`);

  // What this run's candidates are made of, said before anything is generated.
  // A reviewer opening the packet has to be able to tell ingested source-backed
  // truth from owner-approved intake with gaps, and cannot tell from a
  // screenshot.
  const truthReadiness = classifyCandidateTruthReadiness({
    sources: bundle.projectManifest.inputs?.sources ?? [],
    knowledgePack,
  });
  if (knowledgePack) console.log(`Frozen knowledge pack ${knowledgePack.packHash}: ${knowledgePack.sources.length} source(s), ${knowledgePack.facts.length} fact(s).`);
  else console.log('No knowledge pack: this business supplied no ingestable material.');
  console.log(`Truth basis: ${truthReadiness.status}`);
  for (const note of truthReadiness.truthBasis.notes) console.log(`  ${note}`);

  // The canonical build first. A candidate set is a choice over a project that
  // already has an answer, not a substitute for having one.
  const baseline = await service.generateProject(project.id);
  console.log(`Canonical build: ${baseline.workspace}`);

  // The runtime driving this run has to name itself, because naming itself is
  // what bars it from later promoting what it just produced. There is no
  // default: a guessed vendor here would be a guess about independence.
  const generated = await service.generateVisualCandidates(project.id, { createdBy: runIdentity() });
  console.log(`Candidate set ${generated.setId}: ${generated.candidates.map((entry) => entry.directionId).join(', ')}`);
  for (const refusal of generated.refusedDirections) console.log(`  refused ${refusal.directionId}: ${refusal.reason} — ${refusal.detail}`);
  if (!generated.diversity.distinct) throw new Error('The candidate set is not genuinely diverse, which should have been refused before generation.');

  const captured = await service.captureVisualCandidateEvidence(project.id);
  for (const candidate of captured.candidates) {
    const evidence = service.getRenderedEvidence(project.id, candidate.evidenceId);
    console.log(`  ${candidate.candidateId}: ${evidence.captures.length} captures, gate ${candidate.gate.status}${candidate.gate.mustAddress.length ? ` (must address ${candidate.gate.mustAddress.join(', ')})` : ''}`);
    const portability = candidate.portability;
    if (portability) {
      console.log(`    portable: ${portability.portable} — install ${portability.install.mode}, ${portability.artifact.fileCount} file(s), ${portability.artifact.documentCount} document(s), ${portability.artifact.totalBytes} byte(s), renderer ${portability.renderer.actual ?? 'undeclared'}`);
    }
  }

  // Said out loud before a reviewer is asked for anything. A set that reached
  // this line is one whose candidates are all real repositories.
  const setPortability = summarisePortability(captured.candidates.map((candidate) => candidate.portability).filter(Boolean));
  console.log(`Candidate portability: ${setPortability.portable}/${setPortability.total} portable (${setPortability.cleanInstalls} clean install(s), ${setPortability.totalArtifactBytes} byte(s) shipped).`);

  const packets = captured.candidates.map((candidate) => service.visualReviewPacket(project.id, candidate.candidateId));
  fs.writeFileSync(path.join(root, 'review-packets.json'), `${JSON.stringify(packets, null, 2)}\n`);

  // The portable half. `.app-builder/visual-review` is durable factory state and
  // still needs the factory to read it; this is one directory a second person
  // can be handed, archived, or uploaded as a CI artifact, and it opens in a
  // browser with nothing installed.
  const portable = writeVisualReviewPacket({
    outputDir: path.join(root, 'packet'),
    business: bundle.projectManifest.project.name,
    set: captured,
    criteria: packets[0]?.criteria ?? [],
    qualityGate: service.visualQualityGate(),
    designReferences: designReferenceSummary(service, project.id).references.map((reference) => ({
      label: reference.sourceRef.label,
      adopt: reference.adopt.map((trait) => trait.trait),
      avoid: reference.avoid.map((trait) => trait.trait),
      approval: reference.approval.state,
    })),
    readEvidence: (evidenceId) => service.getRenderedEvidence(project.id, evidenceId),
    readCapture: (evidenceId, captureId) => service.readRenderedCapture(project.id, evidenceId, captureId)?.bytes ?? null,
  });
  console.log(`Portable review packet: ${portable.root} (${portable.captureCount} capture(s))`);

  const verdictFile = argument('--verdicts');
  let decided = captured;
  let promotion = null;
  let promotedPortability = null;
  if (verdictFile) {
    const verdicts = JSON.parse(fs.readFileSync(verdictFile, 'utf8'));
    for (const verdict of verdicts.reviews ?? []) decided = await service.recordVisualCandidateReview(project.id, verdict.candidateId, verdict);
    if (verdicts.promote) {
      decided = await service.promoteVisualCandidate(project.id, verdicts.promote.candidateId, verdicts.promote);
      promotion = verdicts.promote;
      // The promoted direction is a durable design choice, so the project's own
      // next build renders it. This is where the promotion becomes the product.
      //
      // The same portability questions are asked of the promoted repository as
      // were asked of every candidate before the review, through the same module
      // rather than a second inline copy of the rules. The copy here was the
      // only place the factory-dependency check ran, which is why it used to run
      // after the decision it should have informed.
      const rebuilt = await service.generateProject(project.id);
      run('npm', ['install', '--no-audit', '--no-fund'], rebuilt.workspace);
      run('npm', ['run', 'check'], rebuilt.workspace);
      run('npm', ['run', 'build'], rebuilt.workspace);
      promotedPortability = buildPortabilityRecord({
        candidateId: verdicts.promote.candidateId,
        workspace: rebuilt.workspace,
        installMode: 'clean',
        steps: [{ command: 'npm run check', ok: true }, { command: 'npm run build', ok: true }],
      });
      assertPortableForReview([promotedPortability]);
      console.log(`Promoted ${verdicts.promote.candidateId}; rebuilt and verified at ${rebuilt.workspace}`);
      console.log(`  ${promotedPortability.artifact.fileCount} file(s), ${promotedPortability.artifact.documentCount} document(s), ${promotedPortability.artifact.totalBytes} byte(s); ${promotedPortability.factoryIndependence.detail}`);
    }
  }

  const report = {
    schemaVersion: 1,
    business: bundle.projectManifest.project.name,
    bundleId: bundle.bundleId,
    // The exact inputs, so a reviewer knows which business and which material
    // produced the screenshots they are judging.
    inputs: {
      bundlePath,
      bundleHash: bundle.projectManifestHash ?? null,
      knowledgePath,
      knowledgePackHash: knowledgePack?.packHash ?? null,
      knowledgeSourceCount: knowledgePack?.sources.length ?? 0,
      knowledgeFactCount: knowledgePack?.facts.length ?? 0,
    },
    // The truth basis, in the words that are true of it. This is the field that
    // stops owner-approved intake being read as externally verified fact.
    truthReadiness: {
      status: truthReadiness.status,
      notes: truthReadiness.truthBasis.notes,
      material: truthReadiness.material,
      referenceOnlyResearch: truthReadiness.referenceOnlyResearch,
      unavailableAssetInputs: truthReadiness.assetRightsWithoutBytes,
    },
    projectId: project.id,
    setId: decided.setId,
    frozenTruth: decided.frozenTruth,
    assetReadiness: decided.assetReadiness,
    // Warnings the composition raised over this truth. "No publishable imagery"
    // and "empty declared surface" are the honest prototype gaps, and a report
    // that omits them flatters the candidates.
    compositionWarnings: service.frozenProductTruth(project.id).composition.warnings,
    diversity: decided.diversity,
    refusedDirections: decided.refusedDirections,
    candidates: decided.candidates.map((candidate) => {
      const evidence = service.getRenderedEvidence(project.id, candidate.evidenceId);
      return {
        candidateId: candidate.candidateId,
        directionId: candidate.directionId,
        state: candidate.state,
        axes: candidate.signature.axes,
        sequence: sequenceOf(candidate),
        gate: candidate.gate,
        evidenceId: candidate.evidenceId,
        captures: evidence?.captures.length ?? 0,
        captureInventory: captureInventory(evidence),
        designLint: candidate.designLint?.counts ?? null,
        // What a reviewer would otherwise have to take on faith: that the
        // repository behind this screenshot installs, checks, builds, ships
        // something, and does not need the factory to run.
        portability: candidate.portability ?? null,
        review: candidate.review,
        outcome: candidate.outcome,
      };
    }),
    // The set-level answer, so the first thing a reviewer reads is whether the
    // set is worth reviewing at all.
    portability: {
      ...summarisePortability(decided.candidates.map((candidate) => candidate.portability).filter(Boolean)),
      promoted: promotedPortability,
    },
    promotedCandidateId: decided.promotedCandidateId,
    setOutcome: decided.setOutcome ?? 'undecided',
    qualityGate: service.visualQualityGate(),
    portableReviewPacket: { path: path.relative(process.cwd(), portable.root), files: portable.files.length, captures: portable.captureCount },
    // Recorded rather than implied. Phase 5 is where a genuinely independent
    // runtime could issue this verdict; nothing here pretends one did.
    independentVisualReview: {
      executed: Boolean(promotion),
      automatedCrossProviderJudgement: 'unexecuted',
      detail: promotion
        ? `Verdicts supplied by ${promotion.promotedBy} through --verdicts. No automated cross-provider critic ran; this is a recorded human decision over deterministic and browser evidence.`
        : 'No verdict was supplied, so no candidate was promoted. The creator of a candidate may not promote it, and no independent model runtime is enabled in this repository.',
    },
    outstanding: promotion ? [] : ['visual-review-verdict'],
  };
  fs.writeFileSync(path.join(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!promotion) console.log('\nNo verdict supplied: promotion remains outstanding, which is the honest state rather than a failure.');
  // Where the evidence is and how to look at it. A run that photographs two
  // candidates and then says nothing about how to see the photographs has done
  // the expensive half of the job.
  console.log('');
  console.log(`Evidence: ${root}`);
  console.log(`  report.json, review-packets.json, packet/ (portable — open packet/index.html anywhere), service/ (durable factory state), workspaces/ (built candidates)`);
  console.log('Review it in the ordinary Console:');
  console.log(`  npm run review:visual-candidates   # then open http://127.0.0.1:5173/builder and choose ${report.business}`);
} finally {
  await service.close();
  store.close();
}
