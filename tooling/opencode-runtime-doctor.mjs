#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { MCP_TOOL_BINDINGS } from '../apps/mcp/src/mcp-server.js';
import {
  MCP_SERVER_NAME,
  OPENCODE_CONFIG_PATH,
  REPOSITORY_ROOT,
  VALIDATED_OPENCODE_VERSION,
  checkOpenCodeConfig,
  excludedCapabilitiesFor,
  readOpenCodeConfig,
} from './lib/opencode-runtime.mjs';

let failed = false;
const fail = (message) => { console.error(message); failed = true; };

if (!fs.existsSync(OPENCODE_CONFIG_PATH)) {
  fail('Missing opencode.json: the OpenCode -> MCP -> Factory lane has no declared entry point.');
} else {
  let config = null;
  try {
    config = readOpenCodeConfig();
  } catch (error) {
    fail(`opencode.json is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (config) {
    for (const problem of checkOpenCodeConfig(config)) fail(`opencode.json: ${problem.message}`);
  }
}

// The lane must not grow a Factory operation that the MCP adapter is supposed
// to exclude. The adapter test already proves each binding is service-backed;
// this proves the agent-facing names carry no excluded capability.
for (const binding of MCP_TOOL_BINDINGS) {
  const excluded = excludedCapabilitiesFor(binding.name);
  if (excluded.length) {
    fail(`MCP tool ${binding.name} matches excluded capability ${excluded.join(', ')}.`);
  }
}

// The Hetzner runbook and runtime authority must keep naming the version this
// configuration was validated against, so a silent upgrade is visible in review.
for (const relative of ['docs/AGENT_RUNTIME.md', 'docs/MCP_ADAPTER.md', 'ops/hetzner/README.md']) {
  const file = path.join(REPOSITORY_ROOT, relative);
  if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes(VALIDATED_OPENCODE_VERSION)) {
    fail(`${relative} must record the validated OpenCode version ${VALIDATED_OPENCODE_VERSION}.`);
  }
}

const rootPackage = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
for (const script of ['mcp', 'opencode:smoke', 'agents:materialise']) {
  if (!rootPackage.scripts?.[script]) fail(`Root package must expose the "${script}" script.`);
}

if (failed) process.exit(1);
console.log(`OpenCode runtime doctor: one loopback "${MCP_SERVER_NAME}" MCP server on the existing adapter, no credentials, no agents, no loops (OpenCode ${VALIDATED_OPENCODE_VERSION}).`);
