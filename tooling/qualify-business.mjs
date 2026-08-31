#!/usr/bin/env node
/**
 * Ask whether a business is ready to be a trial, before it becomes one.
 *
 *   npm run qualify:business -- --bundle examples/genuine-business/nbm-approved-intake.v1.json
 *   npm run qualify:business -- --bundle <file> --authority publication,assets,domain
 *
 * Two answers, not one. A **proof run** asks whether the factory can carry this
 * business through to something a person can judge; a **launch** asks whether
 * the result may go in front of the public. A business can be ready for the
 * first and not the second, and reporting one number would turn a successful
 * prototype into a failed trial.
 *
 * The gaps are classified by who has to act. Content somebody can collect, and
 * decisions only an owner can make, are different problems, and a checklist
 * that reported twelve blockers of unknown kind would be read as "not ready"
 * and put down.
 *
 * `--authority` records decisions the bundle cannot carry, because a decision
 * written into a content file would not be one. Passing it asserts that
 * somebody has actually made them.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { qualifyBusiness } from './lib/business-qualification.mjs';

const argument = (name, fallback = null) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
};

const bundlePath = argument('--bundle');
if (!bundlePath) {
  console.error('Usage: npm run qualify:business -- --bundle <approved-intake bundle> [--authority publication,assets,domain]');
  process.exit(2);
}

const held = new Set((argument('--authority') ?? '').split(',').map((entry) => entry.trim()).filter(Boolean));
const declared = {
  publicationAuthority: held.has('publication'),
  assetRights: held.has('assets'),
  domainOwnership: held.has('domain'),
};

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const result = qualifyBusiness(bundle, declared);

const ICON = { 'required-content': 'MISSING ', 'owner-authority': 'OWNER   ', 'optional-content': 'optional' };

console.log(`== Business qualification ==\n`);
console.log(`  business  ${result.business ?? '(unnamed)'}`);
console.log(`  bundle    ${path.relative(process.cwd(), bundlePath)}\n`);

console.log(`  proof run  ${result.tiers.proofRun.qualified ? 'QUALIFIED' : `blocked by ${result.tiers.proofRun.blockedBy.join(', ')}`}`);
console.log(`  launch     ${result.tiers.launch.qualified ? 'QUALIFIED' : `blocked by ${result.tiers.launch.blockedBy.join(', ')}`}\n`);

for (const kind of ['required-content', 'owner-authority', 'optional-content']) {
  for (const entry of result.gaps.filter((gap) => gap.kind === kind)) {
    console.log(`  ${ICON[kind]}  ${entry.subject}`);
    console.log(`            ${entry.detail}`);
  }
}

console.log(`\n  ${result.counts.requiredContent} fact(s) or file(s) to collect, ${result.counts.ownerAuthority} decision(s) only the owner can make, ${result.counts.optionalContent} thing(s) that would help.`);
for (const sentence of result.doesNotEstablish) console.log(`  Does not establish: ${sentence}`);

const out = argument('--out');
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n  written: ${out}`);
}

// A business that cannot support a proof run is the only exit-code failure.
// Being unready to launch is a normal, expected answer — it is the answer for
// most businesses most of the time, and treating it as an error would make the
// command useless for the case it exists to serve.
if (!result.tiers.proofRun.qualified) process.exitCode = 1;
