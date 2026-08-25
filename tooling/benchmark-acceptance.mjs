#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { scoreBenchmark } from '../packages/control-plane/src/index.js';

const config = JSON.parse(fs.readFileSync('config/factory-benchmarks.json', 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const weights = config.profiles?.deterministicBuild ?? { generate: 1, install: 1, check: 2, build: 2, portable: 2 };
const canonical = config.requiredProjectTypes.map((type) => {
  const item = config.cases.find((entry) => entry.projectType === type && entry.canonical !== false);
  if (!item) throw new Error(`No canonical benchmark case for ${type}.`);
  return item;
});

function runNpm(cwd, args) {
  const started = Date.now();
  const result = spawnSync(npm, args, { cwd, stdio: 'inherit', env: process.env });
  return { ok: result.status === 0, durationMs: Date.now() - started, status: result.status };
}

const report = {
  schemaVersion: 1,
  benchmarkVersion: config.version,
  profile: 'deterministicBuild',
  generatedAt: new Date().toISOString(),
  aiCostGbp: 0,
  interventions: 0,
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
  };
  let durationMs = 0;

  if (gates.generate) {
    const packagePath = path.join(directory, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const dependencyNames = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    gates.portable = !dependencyNames.some((name) => name.startsWith('@app-builder/'));

    const install = runNpm(directory, ['install', '--no-audit', '--no-fund']);
    durationMs += install.durationMs;
    gates.install = install.ok;
    if (install.ok) {
      const check = runNpm(directory, ['run', 'check']);
      durationMs += check.durationMs;
      gates.check = check.ok;
      const build = runNpm(directory, ['run', 'build']);
      durationMs += build.durationMs;
      gates.build = build.ok;
    }
  }

  const result = scoreBenchmark({ gates, costGbp: 0, durationMs, interventions: 0 }, weights);
  report.cases.push({ id: definition.id, projectType: definition.projectType, gates, ...result });
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
