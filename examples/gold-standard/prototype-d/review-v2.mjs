/**
 * Run the repository's own v2 reviewer over a packet.
 *
 * Not a bespoke harness. This calls `reviewCandidate` from tooling/lib/codex-visual-reviewer.mjs,
 * which is the instrument the standard is defined by: anchored score bands, the bar withheld
 * from the reviewer, ceilings read from the reviewer's own observations, evidence coverage
 * computed from the captures, and a pairwise comparison against a benchmark chosen by the
 * shape of the business problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { reviewCandidate, readPacket } from '../../../tooling/lib/codex-visual-reviewer.mjs';

const dir = path.resolve(process.argv[2]);
const out = process.argv[3] ?? path.join(dir, 'verdict.json');
const packet = readPacket(dir);
const candidateId = packet.candidates[0].candidateId;

const verdict = reviewCandidate({ packet, packetDir: dir, candidateId, authorised: true });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(verdict, null, 1)}\n`);

const scores = verdict.criterionScores.map((c) => c.score);
const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
console.log(`verdict        ${verdict.verdict}`);
console.log(`holistic tier  ${verdict.holisticTier}`);
console.log(`mean           ${mean.toFixed(3)}`);
console.log(`floor          ${Math.min(...scores)}`);
console.log(`benchmark gap  ${verdict.benchmarkGap}`);
console.log(`evidence       ${verdict.evidenceCeiling.tier}, caps at ${verdict.evidenceCeiling.cap}`);
console.log(`unproven       ${verdict.unprovenCriteria.map((u) => u.criterion).join(', ') || 'none'}`);
console.log('');
for (const c of verdict.criterionScores) console.log(`  ${String(c.score).padStart(4)}  ${c.criterion}`);
console.log(`\nwritten ${out}`);
