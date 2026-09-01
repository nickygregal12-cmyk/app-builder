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
 * Its synthetic artifacts were written to contain the defect they are graded on
 * and are fictional businesses; the rest are real reviewed candidates and are
 * referenced rather than copied. Nothing here may be cited as a measurement of
 * what App Builder produces.
 *
 * ## What CC2 added, and the failure CC1 could not see
 *
 * CC1's headline number is separation: does the Critic score undamaged
 * artifacts above damaged ones? A Critic that scores the generic template 8.6
 * and the excellent fixture 9.9 separates by 1.3, passes handsomely, and has
 * just called a bootstrap-era theme strong professional work. The corpus built
 * to detect miscalibration was blind to the miscalibration the visual gate
 * actually has.
 *
 * So this now reports the top of the scale as plainly as it reports the bottom:
 * which strata the Critic ranked out of order, which named pairs it inverted,
 * and what it awarded 9 or above to. `cc-24` and `cc-25` are the pair worth
 * watching — same firm, same content, and the only variable is composition.
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
  console.log('\n== Quality strata ==\n');
  for (const stratum of corpus.qualityStrata ?? []) {
    const members = corpus.items.filter((item) => item.qualityStratum === stratum.id);
    console.log(`  ${String(stratum.rank)}. ${stratum.id.padEnd(28)} ${String(members.length).padStart(2)} item(s)`);
    if (!members.length) console.log(`      ${stratum.meaning}`);
  }
  console.log('\n  The two top strata are deliberately empty. Labelling our own fixture');
  console.log('  benchmark-class would make the top of the scale a measurement of our own');
  console.log('  opinion; examples/visual-benchmarks/references.v1.json anchors it instead.');

  console.log('\n== Ordering the Critic must reproduce ==\n');
  for (const assertion of corpus.orderingAssertions ?? []) {
    console.log(`  ${assertion.stronger}  >  ${assertion.weaker}`);
  }

  console.log('\n  Human scores: none. A qualified blinded panel is an owner action, so no');
  console.log('  adjudicated score exists and agreement with one cannot be reported.');
  console.log('  Separation, strata ordering and top-end inflation can all be measured');
  console.log('  without one, and are what npm run calibration:score reports.');
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
  console.log('\n  Item ids are deliberately absent. The mapping is in corpus.v2.json and');
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

  // The upper end, reported as plainly as the lower one. This is the half CC1
  // did not have, and the half the visual gate actually needed.
  console.log('\n  -- the top of the scale --');
  console.log(`  spread        ${measurement.scoreSpread ?? '—'} between the lowest and highest artifact`);
  if (measurement.ranksStrataCorrectly === false) {
    for (const inversion of measurement.strataInversions) console.log(`  strata        ${inversion.detail}`);
  } else if (measurement.ranksStrataCorrectly === true) {
    console.log('  strata        ranked in order');
  }
  for (const failure of measurement.orderingFailures) {
    console.log(`  INVERTED      ${failure.stronger} (${failure.strongerScore}) did not beat ${failure.weaker} (${failure.weakerScore})`);
    console.log(`                ${failure.why}`);
  }
  console.log(`  9+ awarded to ${measurement.topEndAwards.length} item(s)`);
  for (const entry of measurement.unearnedTopEnd) {
    console.log(`  INFLATED      ${entry.itemId} [${entry.stratum}] scored ${entry.meanScore}. A generic or broken artifact called exceptional is a miscalibration, whatever the false-pass rate says.`);
  }

  console.log(`\n  human agreement: ${measurement.humanAgreement ?? 'unavailable'} — ${measurement.humanAgreementUnavailable}`);

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
  //
  // Top-end inflation exits non-zero for the same reason: a Critic that calls a
  // polished generic site exceptional is as unusable as one that passes a
  // broken one, and it was previously invisible.
  if (measurement.falsePasses.length || measurement.inflatesTopEnd) process.exitCode = 1;
}

export { passesBar };
