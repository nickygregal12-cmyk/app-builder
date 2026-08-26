#!/usr/bin/env node
/**
 * Stage Q6 — the dead-code gate.
 *
 * Reports factory modules nothing can reach. The graph, and the four kinds of reference it
 * understands, live in `tooling/lib/module-graph.mjs`; this is the command around it.
 *
 * It is blocking rather than advisory because it was baselined first and the baseline was zero.
 * `docs/ENGINEERING_QUALITY_PROGRAMME.md` asks that no gate block before its output has been seen
 * against real repository content — that measurement is what earned this one its place in
 * `npm run check`, and it is why `--report` exists for the case where somebody wants the numbers
 * rather than the verdict.
 */

import path from 'node:path';
import process from 'node:process';
import { analyseModuleGraph } from './lib/module-graph.mjs';

const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd());
const reportOnly = process.argv.includes('--report');
const result = analyseModuleGraph({ root });

if (reportOnly) {
  console.log(`entries: ${result.entries.length}`);
  console.log(`modules: ${result.modules.length}`);
  console.log(`reachable: ${result.reachable.length}`);
}

if (result.orphans.length > 0) {
  console.error(`Unreachable factory modules (${result.orphans.length}):`);
  for (const orphan of result.orphans) console.error(`  ${orphan}`);
  console.error('\nEach of these is either dead and should be deleted, or alive through a reference');
  console.error('this checker cannot see — in which case teach it that kind of reference rather than');
  console.error('adding the file to an exception list.');
  process.exitCode = 1;
} else {
  console.log(`Orphan check: all ${result.modules.length} factory modules are reachable from ${result.entries.length} entry points.`);
}
