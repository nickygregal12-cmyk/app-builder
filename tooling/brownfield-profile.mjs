#!/usr/bin/env node
/**
 * Read an existing repository and say what it is. Change nothing.
 *
 *   npm run brownfield:profile -- --repo /path/to/repo
 *   npm run brownfield:profile -- --repo /path/to/repo --out .app-builder/brownfield
 *   npm run brownfield:profile -- --repo /path/to/repo --baseline
 *
 * `--baseline` additionally writes a Brownfield Baseline: the repository's exact
 * revision, the profile's hash, and the small set of facts a later change has to
 * be compared against. It is not a copy of the repository and it is not a second
 * git history — it is the answer to "before this ChangeSet, what was true here?".
 *
 * The profile is written OUTSIDE the profiled repository, always. Writing a
 * report into the repository being read would be the first mutation, and the
 * whole point of this pass is that there are none.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { profileRepositoryTree, unprovenFields } from './lib/brownfield-profile.mjs';
import { deriveBaseline } from './lib/brownfield-baseline.mjs';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const repositoryPath = argument('--repo');
if (!repositoryPath) {
  console.error('Usage: npm run brownfield:profile -- --repo <path> [--out <dir>] [--baseline]');
  process.exit(2);
}
const root = path.resolve(repositoryPath);
if (!fs.existsSync(root)) {
  console.error(`No repository at ${root}.`);
  process.exit(2);
}

const outDir = path.resolve(argument('--out', '.app-builder/brownfield'));
// Refuse to write anywhere inside the repository being profiled. This is the
// read-only promise as a check rather than as a sentence in a comment.
if (outDir === root || outDir.startsWith(`${root}${path.sep}`)) {
  console.error(`Refusing to write a profile into ${root}: this pass reads the repository and never writes to it. Choose an --out outside it.`);
  process.exit(2);
}

const profile = profileRepositoryTree(root);
const unproven = unprovenFields(profile);

fs.mkdirSync(outDir, { recursive: true });
const profileFile = path.join(outDir, `${profile.subject.name}.profile.json`);
fs.writeFileSync(profileFile, `${JSON.stringify(profile, null, 2)}\n`);

const value = (finding) => (finding.status === 'demonstrated' || finding.status === 'inferred' ? finding.value : `(${finding.status})`);
const line = (label, finding) => {
  const mark = finding.status === 'demonstrated' ? ' ' : finding.status === 'inferred' ? '~' : '?';
  const shown = typeof value(finding) === 'object' ? JSON.stringify(value(finding)).slice(0, 90) : String(value(finding)).slice(0, 90);
  console.log(`  ${mark} ${label.padEnd(24)} ${shown}`);
};

console.log('== Brownfield profile ==\n');
console.log(`Repository: ${profile.subject.path}`);
console.log(`Revision:   ${value(profile.repository.commit)}`);
console.log(`Branch:     ${value(profile.repository.branch)}`);
console.log(`Clean:      ${value(profile.repository.clean)}`);
console.log(`Files read: ${profile.coverage.filesExamined}${profile.coverage.truncated ? ' (TRUNCATED — this is a partial profile)' : ''}`);
console.log(`Hash:       ${profile.profileHash.slice(0, 24)}…\n`);

console.log('Stack');
line('framework', profile.stack.framework);
line('language', profile.stack.language);
line('package manager', profile.workspace.packageManager);
line('monorepo', profile.workspace.monorepo);
line('build', profile.stack.commands.build);
line('test', profile.stack.commands.test);

console.log('\nArchitecture');
line('applications', profile.architecture.applications);
line('libraries', profile.architecture.libraries);
line('route locations', profile.architecture.routeLocations);
line('server boundaries', profile.architecture.serverBoundaries);

console.log('\nData and backend');
line('provider', profile.data.provider);
line('migrations', profile.data.migrations);
line('security policies', profile.data.securityPolicies);
line('auth', profile.data.auth);

console.log('\nTesting');
line('unit', profile.testing.unit);
line('e2e', profile.testing.e2e);
line('database', profile.testing.database);
line('browser tooling', profile.testing.browserTooling);
line('accessibility', profile.testing.accessibilityTooling);
line('CI', profile.testing.continuousIntegration);

console.log('\nDeployment');
line('platform', profile.deployment.platform);

console.log('\nDesign system (shallow)');
line('token files', profile.designSystem.tokenFiles);
line('component dirs', profile.designSystem.componentDirectories);
line('UI packages', profile.designSystem.uiPackages);

console.log(`\nNot established (${unproven.length} field(s)) — the honest half:\n`);
for (const entry of unproven) console.log(`  ${entry.status === 'inferred' ? '~' : '?'} ${entry.field}: ${entry.detail ?? ''}`.slice(0, 160));

console.log('\nDeliberately not attempted:\n');
for (const entry of profile.notAttempted) console.log(`  · ${entry.question}\n      ${entry.reason}`);

console.log(`\nProfile: ${path.relative(process.cwd(), profileFile)}`);

if (process.argv.includes('--baseline')) {
  const baseline = deriveBaseline(profile);
  const baselineFile = path.join(outDir, `${profile.subject.name}.baseline.json`);
  fs.writeFileSync(baselineFile, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Baseline: ${path.relative(process.cwd(), baselineFile)}`);
  if (baseline.usable) {
    console.log(`\nBaseline is usable: revision ${baseline.revision.slice(0, 12)} is a fixed point a later change can be compared against.`);
  } else {
    console.log('\nBaseline is NOT usable:');
    for (const reason of baseline.refusals) console.log(`  - ${reason}`);
  }
}

// Nothing here decides anything. A profile is understanding, and mutation is a
// separate slice that has to earn its own acceptance.
console.log('\nNo classification was made and nothing was changed. This pass reads.');
