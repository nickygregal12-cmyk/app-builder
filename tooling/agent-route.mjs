#!/usr/bin/env node
/**
 * Deterministic task-routing CLI.
 *
 *   node tooling/agent-route.mjs "Signup does not work"
 *   node tooling/agent-route.mjs --bench
 *
 * It prints the first-orientation packet: matched routes, specialist roles, canonical authorities
 * and the bounded skill set. It is navigation infrastructure, not a decision authority, and it
 * makes no product, security, environment or release decision.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildRoutingPacket, evaluateBenchmarkCase } from '../packages/control-plane/src/routing.js';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const routing = readJson('config/agent-routing.json');
const skills = readJson('config/skill-registry.json').skills;

const args = process.argv.slice(2);

if (args.includes('--bench')) {
  const benchmarks = readJson('config/agent-routing-benchmarks.json');
  let failed = 0;
  for (const benchmarkCase of benchmarks.cases) {
    const { failures } = evaluateBenchmarkCase(benchmarkCase, { routing, skills });
    if (failures.length === 0) {
      console.log(`ok   ${benchmarkCase.id}`);
      continue;
    }
    failed += 1;
    console.error(`FAIL ${benchmarkCase.id}`);
    for (const failure of failures) console.error(`       ${failure}`);
  }
  if (failed > 0) {
    console.error(`\n${failed} routing benchmark case(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${benchmarks.cases.length} routing benchmark cases pass.`);
  process.exit(0);
}

const prompt = args.filter((arg) => !arg.startsWith('--')).join(' ').trim();
if (prompt === '') {
  console.error('Usage: node tooling/agent-route.mjs "THE TASK"   |   node tooling/agent-route.mjs --bench');
  process.exit(1);
}

console.log(JSON.stringify(buildRoutingPacket(prompt, { routing, skills }), null, 2));
