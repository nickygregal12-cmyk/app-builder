#!/usr/bin/env node
/**
 * Stage Q8 — would a plausible weakening of the safety logic escape the tests?
 *
 * This runs against the named targets below and nothing else. Mutation testing across a monorepo is
 * a way to spend an afternoon proving that presentation code is well covered; the question worth
 * paying for is whether the modules that refuse things still refuse them when someone widens a
 * comparison or turns an `&&` into an `||`.
 *
 * It is not part of `npm run check`. Each mutation costs a full run of the target's tests, so this
 * is its own command and its own CI job, run against changes to the modules it guards.
 *
 * There is no score. A percentage says nothing about severity — eighteen survivors in argument
 * shuffling are fine and one survivor that widens a budget is a defect — so every survivor is
 * printed with its line and the weakening it represents, and the command fails if there is one the
 * registry has not accounted for.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { runMutationTesting } from './lib/mutation-harness.mjs';
import { MUTATION_TARGETS } from './lib/mutation-targets.mjs';


const root = process.cwd();
const requested = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const targets = requested.length > 0
  ? MUTATION_TARGETS.filter((target) => requested.includes(target.id))
  : MUTATION_TARGETS;

if (targets.length === 0) {
  console.error(`Unknown target. Known targets: ${MUTATION_TARGETS.map((target) => target.id).join(', ')}`);
  process.exit(1);
}

const reports = [];
for (const target of targets) {
  process.stdout.write(`\n${target.id} (${target.file})\n`);
  const report = runMutationTesting({
    root,
    target,
    onProgress: ({ detected, done, total, mutation }) => {
      if (!detected) process.stdout.write(`  SURVIVED  ${mutation.id}  ${mutation.original} -> ${mutation.replacement}  (${mutation.why})\n            ${mutation.source.slice(0, 120)}\n`);
      else if (done % 10 === 0 || done === total) process.stdout.write(`  ${done}/${total} killed so far\n`);
    },
  });
  reports.push(report);
  console.log(`  ${report.killed.length} killed, ${report.survived.length} survived, ${report.skipped.length} recorded equivalent, of ${report.total} mutations.`);
}

const evidence = {
  schemaVersion: 1,
  targets: reports.map((report) => ({
    file: report.target,
    mutations: report.total,
    killed: report.killed.length,
    survived: report.survived.map((mutation) => ({ id: mutation.id, line: mutation.line, operator: mutation.operator, source: mutation.source })),
    equivalent: report.skipped.map((mutation) => ({ id: mutation.id, why: mutation.why })),
  })),
};
fs.mkdirSync(path.join(root, '.app-builder/mutation-strength'), { recursive: true });
fs.writeFileSync(path.join(root, '.app-builder/mutation-strength/report.json'), `${JSON.stringify(evidence, null, 2)}\n`);

const survivors = reports.flatMap((report) => report.survived);
if (survivors.length > 0) {
  console.error(`\n${survivors.length} mutation(s) survived unaccounted for.`);
  console.error('Each is either a missing test — write it — or genuinely unable to change behaviour,');
  console.error('in which case record it in MUTATION_TARGETS[].equivalent with the reason it cannot.');
  process.exitCode = 1;
} else {
  const total = reports.reduce((sum, report) => sum + report.total, 0);
  console.log(`\nEvery unaccounted mutation across ${reports.length} target(s) was killed (${total} generated).`);
}
