#!/usr/bin/env node
// Dry-run projection of the Factory role registry into OpenCode agent shape.
//
// It exists to answer one question — "could config/agent-roles.json later
// materialise into OpenCode primary/subagent definitions without creating two
// sources of truth?" — and to keep the answer deterministic rather than
// hand-written. It prints; it never writes opencode.json, and it never marks a
// role runtime-ready.
//
//   npm run agents:materialise
//   npm run agents:materialise -- --project-class marketing-site
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MCP_TOOL_BINDINGS } from '../apps/mcp/src/mcp-server.js';
import { REPOSITORY_ROOT, materialiseRoles } from './lib/opencode-runtime.mjs';

function parseArgs(argv) {
  const options = { projectClass: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project-class') options.projectClass = argv[++index];
    else if (arg === '--out') options.out = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
if (options.out && path.resolve(options.out) === path.join(REPOSITORY_ROOT, 'opencode.json')) {
  console.error('Refusing to write the projection into opencode.json: config/agent-roles.json remains the single source of truth.');
  process.exit(1);
}

const read = (relative) => JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));
const projection = materialiseRoles({
  roles: read('config/agent-roles.json'),
  pipelines: read('config/agent-pipelines.json'),
  policies: read('config/agent-policies.json'),
  bindings: MCP_TOOL_BINDINGS,
  projectClass: options.projectClass,
});

const report = JSON.stringify(projection, null, 2);
if (options.out) {
  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  fs.writeFileSync(path.resolve(options.out), `${report}\n`);
  console.error(`Dry-run projection written to ${options.out}. It is a representation, not a runtime configuration.`);
} else {
  console.log(report);
}
console.error(`Projected ${projection.roleCount} registry roles${options.projectClass ? ` for project class "${options.projectClass}"` : ''}. runtimeReady=false.`);
