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
 *   node tooling/visual-candidate-acceptance.mjs [--verdicts verdicts.json] [--out dir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { captureInventory } from './lib/visual-review-report.mjs';

const BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
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
  const bundle = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const { project } = await service.replayIntakeBundle(bundle);
  console.log(`Replayed ${bundle.bundleId} as ${project.id}.`);

  // The canonical build first. A candidate set is a choice over a project that
  // already has an answer, not a substitute for having one.
  const baseline = await service.generateProject(project.id);
  console.log(`Canonical build: ${baseline.workspace}`);

  const generated = await service.generateVisualCandidates(project.id, { createdBy: 'visual-direction' });
  console.log(`Candidate set ${generated.setId}: ${generated.candidates.map((entry) => entry.directionId).join(', ')}`);
  for (const refusal of generated.refusedDirections) console.log(`  refused ${refusal.directionId}: ${refusal.reason} — ${refusal.detail}`);
  if (!generated.diversity.distinct) throw new Error('The candidate set is not genuinely diverse, which should have been refused before generation.');

  const captured = await service.captureVisualCandidateEvidence(project.id);
  for (const candidate of captured.candidates) {
    const evidence = service.getRenderedEvidence(project.id, candidate.evidenceId);
    console.log(`  ${candidate.candidateId}: ${evidence.captures.length} captures, gate ${candidate.gate.status}${candidate.gate.mustAddress.length ? ` (must address ${candidate.gate.mustAddress.join(', ')})` : ''}`);
  }

  const packets = captured.candidates.map((candidate) => service.visualReviewPacket(project.id, candidate.candidateId));
  fs.writeFileSync(path.join(root, 'review-packets.json'), `${JSON.stringify(packets, null, 2)}\n`);

  const verdictFile = argument('--verdicts');
  let decided = captured;
  let promotion = null;
  if (verdictFile) {
    const verdicts = JSON.parse(fs.readFileSync(verdictFile, 'utf8'));
    for (const verdict of verdicts.reviews ?? []) decided = await service.recordVisualCandidateReview(project.id, verdict.candidateId, verdict);
    if (verdicts.promote) {
      decided = await service.promoteVisualCandidate(project.id, verdicts.promote.candidateId, verdicts.promote);
      promotion = verdicts.promote;
      // The promoted direction is a durable design choice, so the project's own
      // next build renders it. This is where the promotion becomes the product.
      const rebuilt = await service.generateProject(project.id);
      run('npm', ['install', '--no-audit', '--no-fund'], rebuilt.workspace);
      run('npm', ['run', 'check'], rebuilt.workspace);
      run('npm', ['run', 'build'], rebuilt.workspace);
      const packageJson = JSON.parse(fs.readFileSync(path.join(rebuilt.workspace, 'package.json'), 'utf8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (Object.keys(dependencies).some((name) => name.startsWith('@app-builder/'))) {
        throw new Error('The promoted repository depends on the factory. A generated project must stay an ordinary repository.');
      }
      console.log(`Promoted ${verdicts.promote.candidateId}; rebuilt and verified at ${rebuilt.workspace}`);
    }
  }

  const report = {
    schemaVersion: 1,
    business: bundle.projectManifest.project.name,
    bundleId: bundle.bundleId,
    projectId: project.id,
    setId: decided.setId,
    frozenTruth: decided.frozenTruth,
    assetReadiness: decided.assetReadiness,
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
        review: candidate.review,
        outcome: candidate.outcome,
      };
    }),
    promotedCandidateId: decided.promotedCandidateId,
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
  console.log(`  report.json, review-packets.json, service/ (durable factory state), workspaces/ (built candidates)`);
  console.log('Review it in the ordinary Console:');
  console.log(`  npm run review:visual-candidates   # then open http://127.0.0.1:5173/builder and choose ${report.business}`);
} finally {
  await service.close();
  store.close();
}
