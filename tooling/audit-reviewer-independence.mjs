#!/usr/bin/env node
/**
 * What the stored verdicts can prove about who judged them.
 *
 *   npm run audit:independence
 *
 * Principle 17 is enforced today by role: `assertReviewIndependence` refuses a
 * verdict from a role that created the artifact. That is right, and it is not
 * the whole rule, because one model can hold both roles and agree with itself
 * while every check passes.
 *
 * This reads every committed review verdict and asks the question at the level
 * of the thing that actually ran. The answer, today, is the same for all of
 * them: it cannot be established. Each verdict records `reviewedBy` with a
 * vendor and a model, and none records who authored the artifact, so there is
 * nothing for the reviewer to be independent *of*.
 *
 * The independence is real — `config/factory-status.json` records that an
 * OpenAI critic reviewed Anthropic-created candidates, and that is why the
 * outstanding verdict cannot be issued by Anthropic. But it lives in prose in a
 * status file rather than in the evidence, which means no gate can read it and
 * nobody auditing the evidence later can confirm it.
 *
 * This command exists to make that gap visible and countable rather than
 * something a person has to already know.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { assessIndependence, executorsFromVerdictSet } from './lib/reviewer-independence.mjs';

const ROOT = 'examples/genuine-business';
const requires = (process.argv.includes('--requires') ? process.argv[process.argv.indexOf('--requires') + 1] : null) ?? 'different-vendor';

const files = fs.readdirSync(ROOT).filter((name) => name.endsWith('verdicts.json')).sort();

console.log('== Reviewer independence over stored verdicts ==\n');
console.log(`  requirement: ${requires}\n`);

let assessed = 0;
let establishable = 0;
const reviewers = new Map();

for (const file of files) {
  const verdictSet = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  console.log(`  ${file}`);
  for (const review of verdictSet.reviews ?? []) {
    const { author, reviewer } = executorsFromVerdictSet(verdictSet, review);
    const result = assessIndependence({ author, reviewer, requires });
    assessed += 1;
    if (result.independent) establishable += 1;

    const identity = `${reviewer.vendor ?? '?'}/${reviewer.model ?? '?'} as ${reviewer.role ?? '?'}`;
    console.log(`    ${review.candidateId.padEnd(32)} reviewer ${identity.padEnd(28)} ${result.relation}`);
    const key = `${reviewer.vendor}/${reviewer.model}`;
    reviewers.set(key, (reviewers.get(key) ?? 0) + 1);
  }
}

console.log('\n== What the evidence establishes ==\n');
console.log(`  verdicts assessed                 ${assessed}`);
console.log(`  independence establishable        ${establishable}`);
console.log(`  reviewers seen                    ${[...reviewers.entries()].map(([key, count]) => `${key} x${count}`).join(', ')}`);

if (establishable < assessed) {
  console.log(`\n  ${assessed - establishable} verdict(s) record who reviewed and not who authored, so the relation between`);
  console.log('  them cannot be computed. This is not a claim that they were not independent:');
  console.log('  config/factory-status.json records that they were, in prose. It is a statement');
  console.log('  that the evidence does not carry it, so no gate can read it and no later');
  console.log('  auditor can confirm it without already knowing the answer.');
  console.log('\n  Closing it needs an author executor recorded alongside the reviewer at the');
  console.log('  point a verdict is created. That is a change to the verdict contract and to');
  console.log('  whatever mints one, and it is deliberately not made here.');
}

// Reporting a gap is this command's job. Exiting non-zero would make it a gate,
// and a gate that fails on every verdict in the repository on the day it lands
// is a gate nobody keeps.
