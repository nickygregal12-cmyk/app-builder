import assert from 'node:assert/strict';
import test from 'node:test';
import { FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';
import { FactoryServiceClient } from '../apps/mcp/src/factory-client.js';
import { createAppBuilderMcpServer, MCP_TOOL_BINDINGS } from '../apps/mcp/src/mcp-server.js';

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('MCP surface is a bounded subset of the declared factory service tool contract', () => {
  const serviceTools = new Set(FACTORY_TOOLS.map((tool) => tool.name));
  assert.equal(serviceTools.has('project.create'), true);
  for (const binding of MCP_TOOL_BINDINGS) assert.equal(serviceTools.has(binding.serviceTool), true, binding.serviceTool);

  const exposed = MCP_TOOL_BINDINGS.map((binding) => `${binding.name} ${binding.serviceTool}`).join(' ');
  for (const forbidden of ['deploy', 'database', 'secret', 'shell', 'filesystem']) {
    assert.equal(exposed.includes(forbidden), false, `MCP must not expose ${forbidden}`);
  }
  assert.equal(new Set(MCP_TOOL_BINDINGS.map((binding) => binding.name)).size, MCP_TOOL_BINDINGS.length);
});

test('MCP server can register the bounded tool surface without contacting the service', () => {
  const never = () => { throw new Error('tool handler should not run during registration'); };
  const client = new Proxy({}, { get: () => never });
  const server = createAppBuilderMcpServer({ client });
  assert.ok(server);
});

test('factory client only accepts loopback service origins', () => {
  for (const baseUrl of ['https://example.com', 'http://10.0.0.2:4310', 'http://127.0.0.1:4310/extra', 'file:///tmp/service']) {
    assert.throws(() => new FactoryServiceClient({ baseUrl, fetchImpl: async () => jsonResponse({}) }));
  }
  assert.doesNotThrow(() => new FactoryServiceClient({ baseUrl: 'http://127.0.0.1:4310', fetchImpl: async () => jsonResponse({}) }));
  assert.doesNotThrow(() => new FactoryServiceClient({ baseUrl: 'http://localhost:4310', fetchImpl: async () => jsonResponse({}) }));
});

test('factory client maps only typed project operations onto fixed service paths', async () => {
  const calls = [];
  const client = new FactoryServiceClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
      return jsonResponse({ ok: true });
    },
  });

  await client.listProjects();
  await client.createProject({ id: 'project-mcp-test', manifest: { schemaVersion: 2 } });
  await client.readManifest('project-mcp-test');
  await client.readEvents('project-mcp-test', { after: 7 });
  await client.startPreview('project-mcp-test');

  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname + new URL(call.url).search]), [
    ['GET', '/projects'],
    ['POST', '/projects'],
    ['GET', '/projects/project-mcp-test/manifest'],
    ['GET', '/projects/project-mcp-test/events?after=7'],
    ['POST', '/projects/project-mcp-test/preview/start'],
  ]);
  assert.deepEqual(calls[1].body, { manifest: { schemaVersion: 2 }, knowledgePack: null, id: 'project-mcp-test' });
});

test('factory client rejects unbounded project identifiers and event cursors before fetch', async () => {
  let calls = 0;
  const client = new FactoryServiceClient({ fetchImpl: async () => { calls += 1; return jsonResponse({}); } });
  await assert.rejects(() => client.readProject('../escape'));
  await assert.rejects(() => client.readProject('project/child'));
  await assert.rejects(() => client.readEvents('project-safe', { after: -1 }));
  assert.equal(calls, 0);
});

test('factory service errors become bounded client errors without leaking non-JSON bodies', async () => {
  const serviceError = new FactoryServiceClient({ fetchImpl: async () => jsonResponse({ error: 'unknown-project' }, 404) });
  await assert.rejects(() => serviceError.readProject('missing-project'), /unknown-project/);

  const nonJson = new FactoryServiceClient({ fetchImpl: async () => new Response('<html>failure</html>', { status: 500 }) });
  await assert.rejects(() => nonJson.listProjects(), /non-JSON HTTP 500/);
});
