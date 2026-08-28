#!/usr/bin/env node
/**
 * Point the brownfield profiler at a real, mature repository and prove two
 * things about the run: that it understood something, and that it changed
 * nothing.
 *
 *   npm run acceptance:brownfield -- --repo /path/to/a/real/repository
 *
 * The fixture tests in `tooling/brownfield-profile.test.mjs` prove the same
 * properties on a repository this project built, which is exactly the weakness
 * a fixture always has: it contains what the profiler was written to find. A
 * mature repository nobody shaped for this is where a profile either says
 * something real or is revealed as a list of guesses.
 *
 * The read-only proof is a byte-and-mtime fingerprint of the working tree AND
 * of `.git`, taken before and after. `.git` is included deliberately: the
 * easiest accidental mutation in a read-only tool is `git status` refreshing
 * the index, and a check that only watched tracked files would miss it.
 *
 * Every profile is written outside the profiled repository. The CLI refuses an
 * `--out` inside it, and this passes one that is plainly elsewhere.
 */

import crypto from 'node:crypto';
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
  console.error('Usage: npm run acceptance:brownfield -- --repo <path to a real repository> [--out <dir>]');
  process.exit(2);
}
const root = path.resolve(repositoryPath);
const outDir = path.resolve(argument('--out', '.app-builder/brownfield'));
if (outDir === root || outDir.startsWith(`${root}${path.sep}`)) {
  console.error(`Refusing to write into ${root}. The acceptance must not be the first mutation.`);
  process.exit(2);
}

/**
 * Every path, size and mtime under a root.
 *
 * Sizes and modification times rather than contents, because this runs over
 * repositories with tens of thousands of files and hashing every byte of a
 * mature checkout costs more than the profile does. A write changes at least
 * one of the three.
 */
function fingerprint(dir, { skipTopLevel = new Set() } = {}) {
  const lines = [];
  const walk = (current, top) => {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (top && skipTopLevel.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) { lines.push(`L ${path.relative(dir, full)}`); continue; }
      if (entry.isDirectory()) { lines.push(`D ${path.relative(dir, full)}`); walk(full, false); continue; }
      if (!entry.isFile()) continue;
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      lines.push(`F ${path.relative(dir, full)} ${stat.size} ${stat.mtimeMs}`);
    }
  };
  walk(dir, true);
  return { hash: crypto.createHash('sha256').update(lines.join('\n')).digest('hex'), entries: lines.length };
}

/** `.git` is a directory in a clone and a file in a worktree. Both are watched. */
function gitFingerprint() {
  const gitPath = path.join(root, '.git');
  try {
    const stat = fs.statSync(gitPath);
    if (stat.isFile()) return { hash: crypto.createHash('sha256').update(fs.readFileSync(gitPath)).digest('hex'), entries: 1 };
    return fingerprint(gitPath);
  } catch {
    return { hash: 'absent', entries: 0 };
  }
}

console.log('== Brownfield read-only acceptance ==\n');
console.log(`Repository: ${root}`);

// `node_modules` is skipped in the tree fingerprint for cost, not for honesty:
// the profiler never descends into it, so it is not a place a mutation could
// come from, and hashing a mature one would dominate the run.
const before = fingerprint(root, { skipTopLevel: new Set(['node_modules']) });
const gitBefore = gitFingerprint();
console.log(`Watching:   ${before.entries} tree entries, ${gitBefore.entries} git entries\n`);

const started = Date.now();
const profile = profileRepositoryTree(root);
const elapsed = Date.now() - started;

const after = fingerprint(root, { skipTopLevel: new Set(['node_modules']) });
const gitAfter = gitFingerprint();

fs.mkdirSync(outDir, { recursive: true });
const baseline = deriveBaseline(profile);
fs.writeFileSync(path.join(outDir, `${profile.subject.name}.profile.json`), `${JSON.stringify(profile, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, `${profile.subject.name}.baseline.json`), `${JSON.stringify(baseline, null, 2)}\n`);

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

// --- Read-only ------------------------------------------------------------------
expect(after.hash === before.hash, 'The working tree changed. The profiler wrote to a repository it was asked to read.');
expect(gitAfter.hash === gitBefore.hash, 'Git metadata changed. Something refreshed an index or took a lock in a repository the profiler promised only to read.');

// --- It understood something ------------------------------------------------------
const established = ['stack.framework', 'stack.language', 'workspace.packageManager', 'repository.commit'];
const value = (trail) => trail.split('.').reduce((node, key) => node?.[key], profile);
for (const field of established) {
  expect(value(field)?.status === 'demonstrated', `${field} is ${value(field)?.status ?? 'absent'}. A mature repository should state at least this much about itself, and a profile that cannot read it is not yet useful.`);
}
expect(profile.coverage.truncated === false, `The walk truncated at ${profile.coverage.limits.maxFiles} files, so this is a partial profile of a repository the acceptance treats as whole.`);
expect(profile.coverage.filesExamined > 100, `Only ${profile.coverage.filesExamined} files were examined; that is not a mature repository.`);

// --- It withheld what it could not establish -----------------------------------------
const unproven = unprovenFields(profile);
expect(unproven.length > 0, 'A profile of a real repository that established everything has stopped distinguishing what it read from what it recognised.');
expect(
  !JSON.stringify(profile).includes('"classification"'),
  'The profile carries a classification. Understanding comes before diagnosis, and diagnosing from a first read is how "replace" comes to mean "the factory prefers a different framework".',
);

// --- Reporting ----------------------------------------------------------------------
const show = (label, finding) => {
  const mark = finding?.status === 'demonstrated' ? ' ' : finding?.status === 'inferred' ? '~' : '?';
  const shown = finding?.status === 'demonstrated' || finding?.status === 'inferred'
    ? (typeof finding.value === 'object' ? JSON.stringify(finding.value).slice(0, 100) : String(finding.value))
    : `(${finding?.status}) ${finding?.reason ?? ''}`.slice(0, 100);
  console.log(`  ${mark} ${label.padEnd(22)} ${shown}`);
};

console.log('Repository');
show('revision', profile.repository.commit);
show('branch', profile.repository.branch);
show('remote', profile.repository.remote);
show('clean', profile.repository.clean);
show('files', profile.repository.fileCount);

console.log('\nStack');
show('framework', profile.stack.framework);
show('language', profile.stack.language);
show('package manager', profile.workspace.packageManager);
show('monorepo', profile.workspace.monorepo);
show('build', profile.stack.commands.build);
show('test', profile.stack.commands.test);
show('typecheck', profile.stack.commands.typecheck);
show('major packages', profile.stack.majorPackages);

console.log('\nArchitecture');
show('applications', profile.architecture.applications);
show('libraries', profile.architecture.libraries);
show('route locations', profile.architecture.routeLocations);
show('server boundaries', profile.architecture.serverBoundaries);

console.log('\nData and backend');
show('provider', profile.data.provider);
show('migrations', profile.data.migrations);
show('security policies', profile.data.securityPolicies);
show('auth', profile.data.auth);
show('environment', profile.data.environmentReferences);

console.log('\nTesting');
show('unit', profile.testing.unit);
show('e2e', profile.testing.e2e);
show('database', profile.testing.database);
show('browser', profile.testing.browserTooling);
show('accessibility', profile.testing.accessibilityTooling);
show('CI', profile.testing.continuousIntegration);

console.log('\nDeployment');
show('platform', profile.deployment.platform);

console.log('\nDesign system (shallow)');
show('token files', profile.designSystem.tokenFiles);
show('component dirs', profile.designSystem.componentDirectories);
show('UI packages', profile.designSystem.uiPackages);
show('assimilation', profile.designSystem.assimilation);

console.log(`\nNot established (${unproven.length}):`);
for (const entry of unproven) console.log(`  ${entry.status === 'inferred' ? '~' : '?'} ${entry.field}`);

console.log('\nBaseline');
console.log(`  revision:   ${baseline.revision ?? '(none)'}`);
console.log(`  usable:     ${baseline.usable}`);
for (const reason of baseline.refusals) console.log(`    - ${reason}`);
console.log(`  protects:   ${baseline.protects.length} statement(s)`);
console.log(`  does NOT:   ${baseline.doesNotProtect.length} statement(s)`);

console.log('\nMutations');
console.log(`  working tree: ${after.hash === before.hash ? 'UNCHANGED' : 'CHANGED'} (${before.entries} entries watched)`);
console.log(`  git metadata: ${gitAfter.hash === gitBefore.hash ? 'UNCHANGED' : 'CHANGED'} (${gitBefore.entries} entries watched)`);
console.log(`  profile read ${profile.coverage.filesExamined} files in ${elapsed}ms`);

console.log('\n== Result ==\n');
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PASS  A real repository was profiled, its unknowns were withheld, and nothing in it changed.');
}
console.log(`\nProfile:  ${path.relative(process.cwd(), path.join(outDir, `${profile.subject.name}.profile.json`))}`);
console.log(`Baseline: ${path.relative(process.cwd(), path.join(outDir, `${profile.subject.name}.baseline.json`))}`);
