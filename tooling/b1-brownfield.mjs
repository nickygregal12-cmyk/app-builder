#!/usr/bin/env node
/**
 * Run the B1 corpus and prove the brownfield safety mechanics.
 *
 *   npm run benchmark:b1
 *
 * ## What this measures, and what it does not
 *
 * It measures the machinery: that a baseline names an exact revision and the
 * revision is the one the corpus froze, that profiling and observing a
 * repository changes nothing in it, that a Preservation Contract refuses
 * mutation when the evidence behind it is thin, that an Improvement Contract is
 * bounded by the scope and churn somebody declared, and that a proposal never
 * carries authority.
 *
 * It does not measure a model. No model produces the proposals here; they are
 * derived deterministically from the corpus so that a failing run means the
 * mechanics broke rather than that a model had a bad day. When live providers
 * arrive, a model-produced proposal is compared against the same held-out
 * grading, and the retrieval instrument in `brownfield-proposal.mjs` is what
 * that comparison reads. Until then this run reports no retrieval numbers,
 * because inventing them would be the first fabricated evidence in a path whose
 * entire purpose is not fabricating evidence.
 *
 * ## Evidence is gathered, never assumed
 *
 * The one thing that would quietly ruin this benchmark is a corpus that
 * *declares* its tests passed. Then every contract would find adequate evidence
 * and every task would report that mutation is safe, and the run would look
 * excellent while proving nothing.
 *
 * So observations come only from commands this runner actually executed in the
 * materialised repository. A command it cannot run without installing
 * dependencies is not run and not recorded, and the contract that needed it
 * refuses. That is why most of this corpus refuses: three tasks reach adequate
 * evidence and nine do not, and the nine are correct.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { profileRepositoryTree } from './lib/brownfield-profile.mjs';
import { deriveBaseline } from './lib/brownfield-baseline.mjs';
import { derivePreservationContract } from './lib/preservation-contract.mjs';
import { validateImprovementContract } from './lib/improvement-contract.mjs';
import { buildProposal } from './lib/brownfield-proposal.mjs';
import { discardRepository, loadCorpus, loadGrading, materialiseRepository, visiblePacket } from './lib/b1-corpus.mjs';
import { referenceImprovement } from './lib/b1-reference.mjs';

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
};
const outDir = path.resolve(argument('--out', '.app-builder/b1'));
const keep = process.argv.includes('--keep');

/** Every path, size and mtime under a root, so any write at all is visible. */
function fingerprint(root) {
  const lines = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { lines.push(`L ${path.relative(root, full)}`); continue; }
      if (entry.isDirectory()) { lines.push(`D ${path.relative(root, full)}`); walk(full); continue; }
      if (!entry.isFile()) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      lines.push(`F ${path.relative(root, full)} ${stat.size} ${stat.mtimeMs}`);
    }
  };
  walk(root);
  return { hash: crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), entries: lines.length };
}

/**
 * Run a declared check, if it can be run without changing the repository.
 *
 * The only commands executable here are ones that need nothing installed. A
 * script that runs `vitest`, `astro` or `playwright` requires `npm ci` first,
 * and installing into the subject repository would be a write — the first
 * mutation, performed by the tool that promised not to make any. So those
 * return `null` and the contract that wanted them refuses for lack of evidence.
 *
 * This is a real limit of the harness and it is reported as one. It is not a
 * statement that those products are untestable; it is a statement that this run
 * did not test them.
 */
function executeCheck(root, command) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const script = manifest.scripts?.[command.replace(/^npm (?:run )?/, '')] ?? null;
  if (!script) return { ran: false, reason: `No script named ${JSON.stringify(command)} exists in this repository.` };

  // `node --test` with an explicit file list is the one shape that runs against
  // a repository with no node_modules. The glob is expanded here rather than by
  // a shell, so nothing else in the script line is ever interpreted.
  const nodeTest = /^node --test (.+)$/.exec(script.trim());
  if (!nodeTest) {
    return { ran: false, reason: `Running ${JSON.stringify(script)} needs dependencies installed, and installing into the subject repository would be the first mutation. Not run.` };
  }

  const pattern = nodeTest[1].trim();
  const directory = pattern.split('/')[0];
  const files = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (/\.test\.m?js$/.test(entry.name)) files.push(path.relative(root, full));
    }
  };
  try { collect(path.join(root, directory)); } catch { return { ran: false, reason: `No ${directory} directory to run.` }; }
  if (!files.length) return { ran: false, reason: `No test files under ${directory}.` };

  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 60_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test' },
  });
  return { ran: true, outcome: result.status === 0 ? 'passed' : 'failed', files, detail: `node --test over ${files.length} file(s)` };
}

// --- Run ---------------------------------------------------------------------------

const corpus = loadCorpus();
const grading = loadGrading();
const gradingFor = (id) => grading.items.find((item) => item.id === id) ?? null;

console.log('== B1 brownfield corpus ==\n');
console.log(`${corpus.repositories.length} repositories, ${corpus.tasks.length} tasks, all synthetic.\n`);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const results = [];

for (const repository of corpus.repositories) {
  const tasks = corpus.tasks.filter((task) => task.repository === repository.id);
  const materialised = materialiseRepository(repository.id);

  console.log(`--- ${repository.id} ---`);

  // The freeze. A fixture whose bytes drifted lands on a different commit, and
  // this is where the run stops rather than quietly benchmarking a different
  // product against a baseline that no longer describes it.
  expect(
    materialised.revision === repository.revision,
    `${repository.id} materialised at ${materialised.revision} and the corpus froze ${repository.revision}. The fixture's bytes changed, so every task against it is now measured against a different product.`,
  );
  console.log(`  revision      ${materialised.revision}${materialised.revision === repository.revision ? ' (frozen, matches)' : ' (DRIFTED)'}`);

  const before = fingerprint(materialised.root);

  const profile = profileRepositoryTree(materialised.root);
  const baseline = deriveBaseline(profile);
  expect(baseline.usable, `${repository.id} produced an unusable baseline: ${baseline.refusals.join(' ')}`);
  console.log(`  baseline      usable=${baseline.usable}, ${baseline.shape.filesExamined} files, framework ${baseline.shape.framework ?? '(unproven)'}`);

  for (const rawTask of tasks) {
    // Everything below reads the visible packet, never the raw corpus entry.
    // The held-out grading lives in the same repository as the corpus, and the
    // only thing keeping it out of a run is that the run never reaches for it.
    const task = visiblePacket(rawTask);
    const declaration = task.declaration ?? {};

    // --- Observation ---------------------------------------------------------------
    const observations = [];
    const notRun = [];
    for (const command of declaration.testCommands ?? []) {
      const attempt = executeCheck(materialised.root, command);
      if (attempt.ran) {
        observations.push({ kind: 'executed-check', name: command, outcome: attempt.outcome, revision: materialised.revision, source: attempt.detail });
      } else {
        notRun.push({ command, reason: attempt.reason });
      }
    }
    // Journeys and data boundaries are deliberately not simulated. A rendered
    // journey needs a browser against a running product, and a data boundary
    // needs a database. Neither is available here, and writing them down as
    // though they were observed is the exact fabrication this path forbids.

    const preservation = derivePreservationContract({ baseline, declaration, observations, authorisation: null });
    const improvement = validateImprovementContract(referenceImprovement(task, materialised.revision), preservation);
    const proposal = buildProposal({
      baseline,
      preservation,
      improvement,
      diagnosis: {
        finding: task.statement,
        classification: null,
        evidenceUsed: observations.map((entry) => `${entry.kind}:${entry.name}=${entry.outcome}`),
        uncertain: (declaration.mustRemainUnknown ?? []).map((entry) => entry.subject ?? entry),
        proposedChange: task.intendedImprovement,
        affects: declaration.allowedScope ?? [],
        preservationRisks: preservation.doesNotProtect,
        verificationPlan: declaration.testCommands ?? [],
      },
      retrieval: null,
    });

    // --- The properties this benchmark exists to hold ------------------------------
    const expected = gradingFor(task.id)?.expectedProposalBlockers ?? [];
    const actual = proposal.recommendation.blockers.map((blocker) => blocker.kind).sort();

    expect(proposal.grantsMutation === false, `${task.id}: a proposal reported that it grants mutation.`);
    expect(proposal.recommendation.mutationShouldProceed === false, `${task.id}: mutation was recommended in a repository where nothing has been authorised.`);
    expect(
      JSON.stringify(actual) === JSON.stringify([...expected].sort()),
      `${task.id}: blockers were [${actual.join(', ')}] and the held-out grading expects [${[...expected].sort().join(', ')}].`,
    );
    // Unknown stays unknown, all the way into the artifact somebody reads.
    for (const unknown of declaration.mustRemainUnknown ?? []) {
      expect(
        proposal.diagnosis.uncertain.includes(unknown.subject),
        `${task.id}: "${unknown.subject}" was declared as something that must remain unknown and did not survive into the proposal.`,
      );
    }

    const adequate = preservation.mutation.evidenceAdequate;
    console.log(`  ${task.id.padEnd(7)} ${task.kind.padEnd(26)} evidence ${adequate ? 'adequate ' : 'INADEQUATE'}  mutation ${preservation.mutation.enabled ? 'ENABLED' : 'disabled'}  ${improvement.executable ? 'contract ok' : `contract refused (${improvement.refusals.length})`}`);
    for (const entry of notRun) console.log(`            not run: ${entry.command} — ${entry.reason}`);

    results.push({
      task: task.id,
      repository: repository.id,
      revision: materialised.revision,
      evidenceAdequate: adequate,
      mutationEnabled: preservation.mutation.enabled,
      blockers: actual,
      observationsAdmitted: preservation.evidence.admitted.length,
      observationsRejected: preservation.evidence.rejected.length,
      checksNotRun: notRun,
      coverage: preservation.coverage.map((entry) => ({ requirement: entry.requirement, name: entry.name, status: entry.status })),
      improvementRefusals: improvement.refusals,
      proposal,
    });
  }

  // --- Nothing was touched ---------------------------------------------------------
  //
  // Taken after every task, because the observation step actually executes code
  // inside the subject repository. Running a test suite is the most plausible
  // way this harness could write to something it promised only to read.
  const after = fingerprint(materialised.root);
  expect(after.hash === before.hash, `${repository.id} changed while it was being profiled and observed. A read-only benchmark wrote to its subject.`);
  console.log(`  read-only     ${after.hash === before.hash ? 'UNCHANGED' : 'CHANGED'} (${before.entries} entries watched)\n`);

  if (keep) console.log(`  kept at ${materialised.root}\n`);
  else discardRepository(materialised.root);
}

// --- Report -----------------------------------------------------------------------

fs.mkdirSync(outDir, { recursive: true });
const report = {
  schemaVersion: 1,
  authority: 'brownfield-b1-report',
  corpus: corpus.corpus,
  provenance: 'synthetic',
  measures: 'Brownfield safety mechanics. No model produced these proposals and no retrieval was measured.',
  tasks: results.length,
  evidenceAdequate: results.filter((entry) => entry.evidenceAdequate).length,
  mutationEnabled: results.filter((entry) => entry.mutationEnabled).length,
  results,
};
fs.writeFileSync(path.join(outDir, 'b1-report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('== Summary ==\n');
console.log(`  tasks                    ${results.length}`);
console.log(`  preservation evidence adequate   ${report.evidenceAdequate}`);
console.log(`  mutation enabled                 ${report.mutationEnabled}`);
console.log(`  retrieval measured               0 (no model retrieval has run against this corpus)`);
console.log(`\n  report: ${path.relative(process.cwd(), path.join(outDir, 'b1-report.json'))}`);

console.log('\n== Result ==\n');
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS  ${results.length} tasks across ${corpus.repositories.length} frozen repositories. Every subject was byte-identical afterwards, every proposal refused to grant mutation, and ${report.results.length - report.evidenceAdequate} tasks correctly refused for want of evidence.`);
}
