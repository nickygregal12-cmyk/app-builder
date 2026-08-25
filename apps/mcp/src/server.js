#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createAppBuilderMcpServer } from './mcp-server.js';

const handle = serveStdio(() => createAppBuilderMcpServer());
console.error('App Builder MCP adapter listening on stdio.');

async function shutdown() {
  try {
    await handle.close();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
