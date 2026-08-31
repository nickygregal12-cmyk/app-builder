#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { scoreBenchmark } from '../packages/control-plane/src/index.js';
import { lintScopeIsReal, testsWereExecuted } from './lib/generated-gate-vacuity.mjs';
import { assertLockUnmoved, buildOutputManifest, resolveLockfile, sourceDigest } from './lib/build-identity.mjs';
import { describeToolchain } from './lib/toolchain.mjs';

const config = JSON.parse(fs.readFileSync('config/factory-benchmarks.json', 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const weights = config.profiles?.deterministicBuild ?? { generate: 1, install: 1, check: 2, build: 2, portable: 2, upgradeInventory: 1 };
const canonical = config.requiredProjectTypes.map((type) => {
  const item = config.cases.find((entry) => entry.projectType === type && entry.canonical !== false);
  if (!item) throw new Error(`No canonical benchmark case for ${type}.`);
  return item;
});

function runNpm(cwd, args, { capture = false } = {}) {
  const started = Date.now();
  const result = spawnSync(npm, args, { cwd, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', env: process.env });
  if (capture) process.stdout.write(result.stdout ?? '');
  return {
    ok: result.status === 0,
    durationMs: Date.now() - started,
    status: result.status,
    output: capture ? `${result.stdout ?? ''}${result.stderr ?? ''}` : '',
  };
}

const report = {
  schemaVersion: 1,
  benchmarkVersion: config.version,
  profile: 'deterministicBuild',
  generatedAt: new Date().toISOString(),
  aiCostGbp: 0,
  interventions: 0,
  // Recorded so a second runner's report is comparable to this one. Two runs
  // that agree on source and lock and disagree on output are the finding this
  // benchmark previously could not have made.
  toolchain: describeToolchain(),
  cases: [],
};

let failed = false;
for (const definition of canonical) {
  const directory = path.resolve(`.tmp/generated-acceptance-${definition.projectType}`);
  const gates = {
    generate: fs.existsSync(directory),
    install: false,
    check: false,
    build: false,
    portable: false,
    upgradeInventory: false,
    // A green `check` is not evidence that the check did anything. These two ask the question the
    // generated-app lint defect answered the hard way: could this gate pass while exercising
    // nothing?
    testsExecuted: false,
    lintScope: false,
  };
  let durationMs = 0;

  if (gates.generate) {
    const packagePath = path.join(directory, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const dependencyNames = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    gates.portable = !dependencyNames.some((name) => name.startsWith('@app-builder/'));
    const installationPath = path.join(directory, '.app-builder/recipe-installations.json');
    if (fs.existsSync(installationPath)) {
      const inventory = JSON.parse(fs.readFileSync(installationPath, 'utf8'));
      gates.upgradeInventory = Array.isArray(inventory.installed) && Array.isArray(inventory.unresolved) && inventory.unresolved.length === 0;
    }

    // Resolve the graph, then install *from* it, then confirm it did not move.
    // `npm install` did all three implicitly and proved none of them: it
    // re-resolves from ranges every time, so a green benchmark said the
    // generated project installs, never that it installs the same thing twice.
    let identity = null;
    let install = { ok: false, durationMs: 0 };
    try {
      const lock = resolveLockfile(directory);
      durationMs += lock.durationMs;
      install = runNpm(directory, ['ci', '--no-audit', '--no-fund']);
      durationMs += install.durationMs;
      if (install.ok) {
        assertLockUnmoved(directory, lock.digest);
        identity = { sourceDigest: sourceDigest(directory), lockDigest: lock.digest };
      }
    } catch (error) {
      install = { ...install, ok: false };
      console.log(`  install: ${error instanceof Error ? error.message : String(error)}`);
    }
    gates.install = install.ok && identity !== null;
    const lintScope = lintScopeIsReal(directory, pkg.scripts?.lint);
    gates.lintScope = lintScope.ok;
    if (!lintScope.ok) console.log(`  lint scope: ${lintScope.reason}`);

    if (install.ok) {
      const check = runNpm(directory, ['run', 'check']);
      durationMs += check.durationMs;
      gates.check = check.ok;

      // Run the project's own tests again, this time reading what they reported. `node --test`
      // against a glob that matches nothing exits 0, so the exit status of `check` cannot tell a
      // passing suite from an absent one.
      const tests = runNpm(directory, ['test'], { capture: true });
      durationMs += tests.durationMs;
      const executed = testsWereExecuted(tests.output);
      gates.testsExecuted = tests.ok && executed.ok;
      if (!gates.testsExecuted) console.log(`  tests: ${executed.reason ?? `the test script exited ${tests.status}`}`);

      const build = runNpm(directory, ['run', 'build']);
      durationMs += build.durationMs;
      gates.build = build.ok;

      // The digest of what was built, not the exit code of the thing that built
      // it. A second runner comparing reports can tell whether one source tree
      // and one lockfile produced one artifact.
      if (build.ok && identity) {
        try {
          identity.outputDigest = buildOutputManifest(path.join(directory, 'dist')).digest;
        } catch (error) {
          console.log(`  output: ${error instanceof Error ? error.message : String(error)}`);
          gates.build = false;
        }
      }
    }
  }

  const result = scoreBenchmark({ gates, costGbp: 0, durationMs, interventions: 0 }, weights);
  report.cases.push({ id: definition.id, projectType: definition.projectType, gates, identity, ...result });
  if (!result.passed) failed = true;
  console.log(`${definition.id}: ${result.score}%${result.passed ? ' PASS' : ` FAIL (${result.failedGates.join(', ')})`}`);
}

report.summary = {
  passed: report.cases.filter((item) => item.passed).length,
  failed: report.cases.filter((item) => !item.passed).length,
  total: report.cases.length,
  averageScore: Number((report.cases.reduce((sum, item) => sum + item.score, 0) / report.cases.length).toFixed(2)),
  totalDurationMs: report.cases.reduce((sum, item) => sum + item.durationMs, 0),
  aiCostGbp: 0,
  interventions: 0,
};

fs.mkdirSync('.tmp', { recursive: true });
fs.writeFileSync('.tmp/factory-benchmark-report.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Factory deterministic-build benchmark: ${report.summary.passed}/${report.summary.total} passed, average ${report.summary.averageScore}%.`);
if (failed) process.exit(1);
