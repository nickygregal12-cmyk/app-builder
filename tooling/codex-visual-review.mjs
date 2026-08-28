#!/usr/bin/env node
/**
 * Issue independent visual verdicts over a review packet, using Codex.
 *
 * This is the operator's half of the Phase 4D gate. The factory produces the
 * candidates and photographs them; it may not then decide they are good. What
 * has been missing is a reviewer from a different vendor, and this is the
 * command that runs one.
 *
 * It reads the portable packet — either the one a local
 * `npm run acceptance:visual-candidates` left at
 * `.app-builder/visual-review/packet`, or an unzipped `nbm-visual-review-*`
 * artifact from the hosted evidence workflow, which is the same directory — and
 * writes a verdicts file the acceptance run already knows how to consume:
 *
 *   npm run review:codex -- --packet .app-builder/visual-review/packet --authorise
 *   npm run acceptance:visual-candidates -- --verdicts .app-builder/visual-review/verdicts.json
 *
 * `--authorise` is required and has no default. This spends the operator's
 * Codex credits against a third-party service, and deny-by-default is the house
 * rule for anything that does.
 *
 * It writes reviews and never a promotion. One candidate passing is not the
 * same as it being the one to ship; choosing between two passes is a decision
 * about the business, and it stays with the person.
 */

import fs from 'node:fs';
import path from 'node:path';
import { reviewPacketCandidates } from './lib/codex-visual-reviewer.mjs';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const packetDir = path.resolve(argument('--packet', '.app-builder/visual-review/packet'));
const outFile = path.resolve(argument('--out', path.join(packetDir, '..', 'verdicts.json')));
const authorised = process.argv.includes('--authorise');

if (!authorised) {
  console.error('Refusing to run without --authorise.');
  console.error('');
  console.error('This calls Codex, which is a third-party provider and costs real credits. Nothing in this repository');
  console.error('turns that on by default, and a reviewer that ran because a flag was left alone is not a decision.');
  console.error('');
  console.error(`  npm run review:codex -- --packet ${path.relative(process.cwd(), packetDir)} --authorise`);
  process.exit(2);
}

const result = reviewPacketCandidates({ packetDir, authorised: true });

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);

for (const review of result.reviews) {
  const scores = review.criterionScores.map((entry) => `${entry.criterion} ${entry.score}`).join(', ');
  console.log(`${review.candidateId}: ${review.verdict.toUpperCase()} by ${review.reviewedBy.vendor}/${review.reviewedBy.model}`);
  if (scores) console.log(`  ${scores}`);
  for (const unproven of review.unprovenCriteria) console.log(`  UNPROVEN ${unproven.criterion} — ${unproven.detail}`);
  if (review.blockingConcerns.length) console.log(`  blocking: ${review.blockingConcerns.join('; ')}`);
}
for (const skipped of result.skipped) console.log(`${skipped.candidateId}: skipped (${skipped.reason})`);

console.log('');
console.log(`Verdicts: ${path.relative(process.cwd(), outFile)}`);
console.log('These are reviews only. Nothing is promoted: add a `promote` entry naming the candidate you want shipped,');
console.log('then replay it through `npm run acceptance:visual-candidates -- --verdicts <file>`.');
