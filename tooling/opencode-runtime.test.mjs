import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { MCP_TOOL_BINDINGS } from '../apps/mcp/src/mcp-server.js';
import { FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';
import {
  EXCLUDED_CAPABILITIES,
  MCP_SERVER_COMMAND,
  MCP_SERVER_NAME,
  REPOSITORY_ROOT,
  SERVICE_URL_ENV,
  VALIDATED_OPENCODE_VERSION,
  checkOpenCodeConfig,
  excludedCapabilitiesFor,
  materialiseRoles,
  readOpenCodeConfig,
} from './lib/opencode-runtime.mjs';

const readConfig = (relative) => JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));
const problemIds = (config) => checkOpenCodeConfig(config).map((problem) => problem.id);

test('the committed OpenCode project configuration satisfies the bounded lane contract', () => {
  assert.deepEqual(checkOpenCodeConfig(readOpenCodeConfig()), []);
});

test('the configuration launches the existing MCP adapter rather than a second server', () => {
  const config = readOpenCodeConfig();
  assert.deepEqual(Object.keys(config.mcp), [MCP_SERVER_NAME]);
  assert.deepEqual(config.mcp[MCP_SERVER_NAME].command, [...MCP_SERVER_COMMAND]);
  const rootPackage = JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'));
  assert.equal(rootPackage.scripts.mcp, 'npm --workspace @app-builder/mcp start');
});

test('a second MCP server would duplicate the factory tool registry and is rejected', () => {
  const config = readOpenCodeConfig();
  config.mcp['app-builder-extra'] = structuredClone(config.mcp[MCP_SERVER_NAME]);
  assert.ok(problemIds(config).includes('mcp-single-server'));
});

// OpenCode 1.18.14 resolves an unrecognised MCP entry to `{ enabled: true }`
// and drops the command silently, so a config copied from later syntax fails
// invisibly at run time. The doctor has to be the thing that notices.
test('OpenCode 2 style MCP syntax is rejected rather than silently discarded', () => {
  const config = readOpenCodeConfig();
  config.mcp[MCP_SERVER_NAME] = { type: 'stdio', command: 'npm run mcp', enabled: true };
  const ids = problemIds(config);
  assert.ok(ids.includes('mcp-unsupported-type'));
  assert.ok(ids.includes('mcp-command-shape'));
});

test('the configuration cannot point the lane away from a loopback factory', () => {
  for (const serviceUrl of ['https://factory.example.com', 'http://10.0.0.4:4310', 'http://127.0.0.1:4310/internal', 'ftp://127.0.0.1']) {
    const config = readOpenCodeConfig();
    config.mcp[MCP_SERVER_NAME].environment[SERVICE_URL_ENV] = serviceUrl;
    assert.ok(problemIds(config).includes('mcp-service-origin'), serviceUrl);
  }
});

test('the configuration cannot smuggle extra environment into the adapter', () => {
  const config = readOpenCodeConfig();
  config.mcp[MCP_SERVER_NAME].environment.ANTHROPIC_API_KEY = 'x';
  assert.ok(problemIds(config).includes('mcp-environment'));
});

test('provider credentials, agent definitions and scheduled loops are configuration failures', () => {
  for (const [key, value] of Object.entries({
    provider: { anthropic: {} },
    model: 'anthropic/claude-sonnet-4-5',
    apiKey: 'secret',
    schedule: '0 * * * *',
  })) {
    const config = readOpenCodeConfig();
    config[key] = value;
    assert.ok(problemIds(config).includes('no-credentials-or-loops'), key);
  }

  const withAgents = readOpenCodeConfig();
  withAgents.agent = { 'security': { description: 'hand-written specialist' } };
  assert.ok(problemIds(withAgents).includes('no-agents'));
});

test('relaxing the client permissions that keep MCP the only factory path is a failure', () => {
  for (const capability of ['bash', 'edit', 'webfetch']) {
    const config = readOpenCodeConfig();
    config.permission[capability] = 'allow';
    assert.ok(problemIds(config).includes('permission'), capability);
  }
});

test('every exposed MCP tool name is free of the excluded capability classes', () => {
  for (const binding of MCP_TOOL_BINDINGS) {
    assert.deepEqual(excludedCapabilitiesFor(binding.name), [], binding.name);
  }
});

test('the excluded capability classifier recognises the operations the lane must never carry', () => {
  const samples = {
    'raw-secret-read': ['secrets_read', 'env_read', 'integration_api_key'],
    'arbitrary-filesystem-path': ['read_file', 'fs_read', 'workspace_path_read'],
    'arbitrary-shell': ['bash', 'shell_exec', 'run_command'],
    'unrestricted-http-fetch': ['http_fetch', 'webfetch', 'browse_url'],
    'production-deployment': ['deploy_production', 'release_publish'],
    'production-database-write': ['database_write', 'sql_execute', 'migrate_apply'],
  };
  for (const [id, names] of Object.entries(samples)) {
    for (const name of names) assert.ok(excludedCapabilitiesFor(name).includes(id), `${name} -> ${id}`);
  }
  assert.equal(EXCLUDED_CAPABILITIES.length, Object.keys(samples).length);
});

// The approval-gated source-governance route exists on the internal service
// surface and is deliberately absent from MCP. Issue #55 is the reason that
// absence is not yet enforcement: direct loopback HTTP still reaches it.
test('the internal approval-gated factory route stays off the agent-facing surface', () => {
  const governance = FACTORY_TOOLS.find((tool) => tool.name === 'project.source.governance.update');
  assert.ok(governance);
  assert.equal(governance.approvalRequired, true);
  assert.equal(MCP_TOOL_BINDINGS.some((binding) => binding.serviceTool === governance.name), false);
});

test('role materialisation projects the factory registry without becoming a second source of truth', () => {
  const projection = materialiseRoles({
    roles: readConfig('config/agent-roles.json'),
    pipelines: readConfig('config/agent-pipelines.json'),
    policies: readConfig('config/agent-policies.json'),
    bindings: MCP_TOOL_BINDINGS,
  });

  assert.equal(projection.$dryRun, true);
  assert.equal(projection.runtimeReady, false);
  assert.deepEqual(projection.unresolvedRoles, []);
  assert.equal(projection.validatedOpenCodeVersion, VALIDATED_OPENCODE_VERSION);
  assert.equal(projection.roleCount, Object.keys(readConfig('config/agent-roles.json').roles).length);

  for (const [id, agent] of Object.entries(projection.agent)) {
    assert.equal(agent.mode, 'subagent', id);
    assert.equal(agent.runtimeReady, false, id);
    assert.ok(agent.blockedBy.some((reason) => reason.includes('#55')), id);
    assert.equal(agent.source.registry, 'config/agent-roles.json', id);
    assert.equal(agent.source.roleId, id);
    for (const tool of agent.mcpTools) assert.ok(tool.startsWith(`${MCP_SERVER_NAME}_`), tool);
  }
});

test('a projected role without a mutation scope receives only non-mutating factory operations', () => {
  const roles = readConfig('config/agent-roles.json');
  const projection = materialiseRoles({
    roles,
    pipelines: readConfig('config/agent-pipelines.json'),
    policies: readConfig('config/agent-policies.json'),
    bindings: MCP_TOOL_BINDINGS,
  });
  const mutating = new Set(MCP_TOOL_BINDINGS.filter((binding) => binding.mutating).map((binding) => `${MCP_SERVER_NAME}_${binding.name}`));

  let readOnlyRoles = 0;
  for (const [id, agent] of Object.entries(projection.agent)) {
    if ((roles.roles[id].mutationScopes ?? []).length > 0) continue;
    readOnlyRoles += 1;
    assert.equal(agent.mcpTools.some((tool) => mutating.has(tool)), false, id);
    assert.equal(agent.tools.edit, false, id);
    assert.equal(agent.tools.write, false, id);
  }
  assert.ok(readOnlyRoles > 0);
});

test('a projected role never receives a tool for an approval-gated policy action', () => {
  const policies = readConfig('config/agent-policies.json');
  const projection = materialiseRoles({
    roles: readConfig('config/agent-roles.json'),
    pipelines: readConfig('config/agent-pipelines.json'),
    policies,
    bindings: MCP_TOOL_BINDINGS,
  });
  const roles = readConfig('config/agent-roles.json').roles;

  for (const [id, agent] of Object.entries(projection.agent)) {
    const policy = policies.policies[roles[id].policyId];
    if (!policy?.approvalRequired?.includes('deploy.preview')) continue;
    // deploy.preview and database.migrate_preview map to no OpenCode tool at
    // all; the assertion that matters is that approval-gated network access
    // never silently becomes an enabled fetch tool.
    if (policy.approvalRequired.includes('network.public')) assert.equal(agent.tools.webfetch, false, id);
  }
  for (const [id, agent] of Object.entries(projection.agent)) {
    const policy = policies.policies[roles[id].policyId];
    if (policy?.deny?.includes('network.public')) assert.equal(agent.tools.webfetch, false, id);
    if (policy?.deny?.includes('repo.write')) assert.equal(agent.tools.edit, false, id);
  }
});

test('materialisation can be scoped to a registered pipeline and rejects an unknown class', () => {
  const pipelines = readConfig('config/agent-pipelines.json');
  const inputs = {
    roles: readConfig('config/agent-roles.json'),
    pipelines,
    policies: readConfig('config/agent-policies.json'),
    bindings: MCP_TOOL_BINDINGS,
  };

  for (const projectClass of Object.keys(pipelines.pipelines)) {
    const projection = materialiseRoles({ ...inputs, projectClass });
    assert.ok(projection.roleCount > 0, projectClass);
    assert.deepEqual(projection.unresolvedRoles, [], projectClass);
    assert.equal(projection.agent.human, undefined, projectClass);
  }

  assert.throws(() => materialiseRoles({ ...inputs, projectClass: 'not-a-project-class' }), /Unknown project class/);
});
