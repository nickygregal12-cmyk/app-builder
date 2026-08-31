#!/usr/bin/env node
/**
 * The calibration corpus: what is in it, and how a Critic did against it.
 *
 *   npm run calibration:corpus                     # composition and gaps
 *   npm run calibration:blind -- --seed autumn-1   # blinded order for reviewers
 *   npm run calibration:score -- --verdicts f.json # measure a Critic's answers
 *
 * It promotes nothing and reviews nothing. `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`
 * owns what a verdict may do; this only says whether the verdicts were any good.
 *
 * The corpus is evaluation material, not evidence about the factory's output.
 * Twelve of its artifacts were written to contain the defect they are graded on
 * and are fictional businesses; the other ten are real reviewed candidates and
 * are referenced rather than copied. Nothing here may be cited as a measurement
 * of what App Builder produces.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { blindedOrder, loadCorpus, measureCalibration, passesBar } from './lib/critic-calibration.mjs';

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
};

const corpus = loadCorpus();
const mode = process.argv.includes('--blind') ? 'blind' : argument('--verdicts') ? 'score' : 'corpus';

if (mode === 'corpus') {
  const byStratum = new Map();
  for (const item of corpus.items) {
    if (!byStratum.has(item.stratum)) byStratum.set(item.stratum, []);
    byStratum.get(item.stratum).push(item);
  }

  console.log(`== Critic calibration corpus ${corpus.corpus} ==\n`);
  console.log(`${corpus.items.length} items, bar ${corpus.bar.minimumScore} mean and ${corpus.bar.minimumCriterionScore} floor.\n`);
  for (const [stratum, items] of [...byStratum].sort()) {
    const held = items.filter((item) => item.heldOut).length;
    console.log(`  ${stratum.padEnd(30)} ${String(items.length).padStart(2)}  ${items[0].provenance}${held ? `  (${held} held out)` : ''}`);
  }

  const damaged = corpus.items.filter((item) => item.expectedOutcome === 'planted-defect');
  console.log(`\n  planted defect or reviewed below bar: ${damaged.length}`);
  console.log(`  no planted defect:                    ${corpus.items.length - damaged.length}`);
  console.log(`  held out:                             ${corpus.items.filter((item) => item.heldOut).length}`);

  // Said every run, because a corpus is the easiest artifact in a repository to
  // start citing as a result.
  console.log('\n  Human scores: none. A qualified blinded panel is an owner action, so no');
  console.log('  adjudicated score exists and agreement with one cannot be reported.');
  console.log('  Separation between damaged and undamaged artifacts can be, and is what');
  console.log('  npm run calibration:score measures.');
}

if (mode === 'blind') {
  const seed = argument('--seed');
  if (!seed) {
    console.error('Usage: npm run calibration:blind -- --seed <seed>\nAn unseeded order cannot be reproduced, and a review nobody can re-examine is not evidence.');
    process.exit(2);
  }
  const order = blindedOrder(corpus.items, seed);
  console.log(`== Blinded order, seed ${seed} ==\n`);
  for (const entry of order) console.log(`  ${String(entry.position).padStart(2)}  ${entry.artifact.ref}${entry.artifact.candidateId ? ` · ${entry.artifact.candidateId}` : ''}`);
  console.log('\n  Item ids are deliberately absent. The mapping is in corpus.v1.json and');
  console.log('  should stay with whoever adjudicates rather than with whoever scores.');
}

if (mode === 'score') {
  const file = argument('--verdicts');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const verdicts = Array.isArray(parsed) ? parsed : parsed.verdicts ?? [];
  const measurement = measureCalibration({ corpus, verdicts });

  console.log(`== Critic calibration against ${corpus.corpus} ==\n`);
  console.log(`  scored        ${measurement.itemsScored}/${measurement.itemsConsidered}`);
  if (measurement.itemsMissing.length) console.log(`  not scored    ${measurement.itemsMissing.join(', ')} — reported, not counted as approval`);
  console.log(`  false passes  ${measurement.falsePasses.length}${measurement.falsePassRate === null ? '' : ` (${(measurement.falsePassRate * 100).toFixed(1)}%)`}`);
  for (const entry of measurement.falsePasses) {
    console.log(`     ${entry.itemId} [${entry.stratum}] scored ${entry.meanScore} — ${entry.defect}`);
  }
  console.log(`  separation    ${measurement.separation ?? 'not computable'}  (undamaged ${measurement.undamagedMean ?? '—'} vs damaged ${measurement.damagedMean ?? '—'})`);
  if (measurement.discriminates === false) {
    console.log('     A Critic that does not separate the two groups is not calibrated, whatever its false-pass rate.');
  }
  for (const entry of measurement.misdiagnosed) {
    console.log(`  wrong reason  ${entry.itemId}: failed on [${entry.named.join(', ') || 'nothing named'}], defect sits in [${entry.expected.join(', ')}]`);
  }
  console.log(`  human agreement: ${measurement.humanAgreement ?? 'unavailable'} — ${measurement.humanAgreementUnavailable}`);

  const out = argument('--out');
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), `${JSON.stringify(measurement, null, 2)}\n`);
    console.log(`\n  written: ${out}`);
  }

  // A false pass is the failure this corpus exists to catch, so it exits
  // non-zero. Poor separation is reported and does not exit non-zero, because a
  // Critic can be badly calibrated in ways that are worth seeing rather than
  // worth blocking on — and nothing here gates anything yet.
  if (measurement.falsePasses.length) process.exitCode = 1;
}

export { passesBar };
