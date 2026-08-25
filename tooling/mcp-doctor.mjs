#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';
import { MCP_TOOL_BINDINGS } from '../apps/mcp/src/mcp-server.js';

const root = process.cwd();
let failed = false;
const required = [
  'apps/mcp/package.json',
  'apps/mcp/src/factory-client.js',
  'apps/mcp/src/mcp-server.js',
  'apps/mcp/src/server.js',
  'tooling/mcp-adapter.test.mjs',
  'docs/MCP_ADAPTER.md',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing MCP adapter file: ${relative}`);
    failed = true;
  }
}

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/mcp/package.json'), 'utf8'));
  if (pkg.dependencies?.['@modelcontextprotocol/server'] !== '2.0.0' || pkg.dependencies?.zod !== '4.4.3') {
    console.error('MCP adapter must retain reviewed exact SDK/schema dependency versions.');
    failed = true;
  }

  const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!rootPackage.scripts?.mcp) {
    console.error('Root package must expose the MCP adapter command.');
    failed = true;
  }
  if (!String(rootPackage.scripts?.doctor ?? '').includes('mcp-doctor.mjs')) {
    console.error('Root doctor must include the MCP adapter boundary check.');
    failed = true;
  }

  const serviceNames = new Set(FACTORY_TOOLS.map((tool) => tool.name));
  for (const binding of MCP_TOOL_BINDINGS) {
    if (!serviceNames.has(binding.serviceTool)) {
      console.error(`MCP tool ${binding.name} is not backed by declared service tool ${binding.serviceTool}.`);
      failed = true;
    }
  }
  const exposed = MCP_TOOL_BINDINGS.map((binding) => `${binding.name} ${binding.serviceTool}`).join(' ');
  if (/deploy|database|secret.*write|shell|filesystem|production/.test(exposed)) {
    console.error('MCP adapter exposes a forbidden deployment/database/secret/shell/filesystem operation.');
    failed = true;
  }

  const client = fs.readFileSync(path.join(root, 'apps/mcp/src/factory-client.js'), 'utf8');
  if (!client.includes("['127.0.0.1', 'localhost', '::1']")) {
    console.error('MCP factory client must fail closed to loopback service origins.');
    failed = true;
  }
  if (/node:(?:fs|child_process)|exec\(|spawn\(/.test(client)) {
    console.error('MCP adapter must not gain filesystem or shell execution primitives.');
    failed = true;
  }

  const entry = fs.readFileSync(path.join(root, 'apps/mcp/src/server.js'), 'utf8');
  if (entry.includes('console.log(') || !entry.includes('serveStdio')) {
    console.error('MCP stdio entry must reserve stdout for protocol traffic and use serveStdio.');
    failed = true;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}

if (failed) process.exit(1);
console.log('MCP adapter doctor: stdio transport, loopback service boundary and safe service-backed tool surface are valid.');
