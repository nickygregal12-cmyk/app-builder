import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { capabilitiesForRole } from '@app-builder/control-plane/capabilities';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const OPENCODE_CONFIG_PATH = path.join(REPOSITORY_ROOT, 'opencode.json');

// The Hetzner runtime records OpenCode 1.18.14 (docs/AGENT_RUNTIME.md,
// ops/hetzner/README.md). The configuration contract below was validated
// against that binary; a different major line resolves configuration
// differently and must be re-validated before it becomes the runtime.
export const VALIDATED_OPENCODE_VERSION = '1.18.14';
export const VALIDATED_OPENCODE_MAJOR = 1;

// One MCP server, named once, launching the existing stdio adapter. A second
// server or a second command would mean a second Factory tool registry.
export const MCP_SERVER_NAME = 'app-builder';
export const MCP_SERVER_COMMAND = Object.freeze(['npm', 'run', 'mcp']);
export const SERVICE_URL_ENV = 'APP_BUILDER_SERVICE_URL';
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '::1']);

// OpenCode 1.x silently drops MCP keys it does not recognise instead of
// failing: a `type: "stdio"` / string-`command` entry copied from later
// syntax resolves to `{ enabled: true }` with no command and no error, so the
// agent quietly loses the Factory lane. These checks exist because that
// failure is invisible at run time.
export const UNSUPPORTED_MCP_TYPES = Object.freeze(['stdio', 'http', 'sse']);

// Capability classes the MCP lane must never carry. `docs/MCP_ADAPTER.md`
// states the exclusions in prose; this is the executable form.
export const EXCLUDED_CAPABILITIES = Object.freeze([
  { id: 'raw-secret-read', pattern: /secret|credential|token|api[-_]?key|password|env(ironment)?[-_]?read/i },
  { id: 'arbitrary-filesystem-path', pattern: /(^|[-_])(file|path|fs|filesystem|directory|dir)([-_]|$)|read[-_]?file|write[-_]?file/i },
  { id: 'arbitrary-shell', pattern: /shell|bash|exec|command|spawn|terminal|process[-_]?run/i },
  { id: 'unrestricted-http-fetch', pattern: /fetch|curl|http[-_]?request|proxy|browse|web[-_]?search/i },
  { id: 'production-deployment', pattern: /deploy|publish|release|production/i },
  { id: 'production-database-write', pattern: /database|db[-_]|sql|migrat|schema[-_]?apply/i },
]);

export function readOpenCodeConfig(file = OPENCODE_CONFIG_PATH) {
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

function isLoopbackServiceUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  if (!LOOPBACK_HOSTS.includes(host)) return false;
  return url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
}

/**
 * Deterministic contract for the project OpenCode configuration.
 *
 * It is deliberately restrictive: this lane exists to prove a bounded path, so
 * anything that would widen it (a second MCP server, a non-loopback service
 * origin, provider credentials, materialised agents, a scheduled loop) is a
 * failure rather than a warning.
 */
export function checkOpenCodeConfig(config) {
  const problems = [];
  const fail = (id, message) => problems.push({ id, message });

  if (config?.$schema !== 'https://opencode.ai/config.json') {
    fail('schema', 'opencode.json must declare the OpenCode config $schema so editors and reviewers see the accepted shape.');
  }

  const servers = config?.mcp;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    fail('mcp-missing', 'opencode.json must declare an mcp block.');
    return problems;
  }

  const names = Object.keys(servers);
  if (names.length !== 1 || names[0] !== MCP_SERVER_NAME) {
    fail('mcp-single-server', `opencode.json must declare exactly one MCP server named "${MCP_SERVER_NAME}"; a second server would duplicate the Factory tool registry.`);
  }

  for (const [name, server] of Object.entries(servers)) {
    if (!server || typeof server !== 'object') {
      fail('mcp-shape', `MCP server "${name}" must be an object.`);
      continue;
    }
    if (UNSUPPORTED_MCP_TYPES.includes(server.type)) {
      fail('mcp-unsupported-type', `MCP server "${name}" uses type "${server.type}", which OpenCode ${VALIDATED_OPENCODE_MAJOR}.x silently discards along with its command. Use type "local".`);
    } else if (server.type !== 'local') {
      fail('mcp-type', `MCP server "${name}" must use type "local" so OpenCode launches the existing stdio adapter.`);
    }
    if (!Array.isArray(server.command)) {
      fail('mcp-command-shape', `MCP server "${name}" must declare command as an array; OpenCode ${VALIDATED_OPENCODE_MAJOR}.x silently discards a string command.`);
    } else if (server.command.join(' ') !== MCP_SERVER_COMMAND.join(' ')) {
      fail('mcp-command', `MCP server "${name}" must launch the existing adapter with ${JSON.stringify(MCP_SERVER_COMMAND)}; do not introduce a second MCP entry point.`);
    }
    if (server.enabled !== true) {
      fail('mcp-enabled', `MCP server "${name}" must be explicitly enabled.`);
    }
    const serviceUrl = server.environment?.[SERVICE_URL_ENV];
    if (typeof serviceUrl !== 'string' || !isLoopbackServiceUrl(serviceUrl)) {
      fail('mcp-service-origin', `MCP server "${name}" must pin ${SERVICE_URL_ENV} to a loopback Factory origin.`);
    }
    const environment = server.environment ?? {};
    for (const key of Object.keys(environment)) {
      if (key !== SERVICE_URL_ENV) {
        fail('mcp-environment', `MCP server "${name}" must not inject "${key}"; the adapter needs only ${SERVICE_URL_ENV}.`);
      }
    }
  }

  for (const capability of ['bash', 'edit', 'webfetch']) {
    if (config?.permission?.[capability] !== 'deny') {
      fail('permission', `permission.${capability} must be "deny" so the MCP adapter stays the only Factory path this configuration offers.`);
    }
  }

  if (config?.autoupdate !== false) {
    fail('autoupdate', 'autoupdate must be false so the validated OpenCode version cannot change underneath the proven lane.');
  }
  if (config?.share !== 'disabled') {
    fail('share', 'share must be "disabled" so no session leaves the host.');
  }

  // Roles are registered in config/agent-roles.json. Materialising them into
  // OpenCode agent definitions here would create a second source of truth.
  for (const key of ['agent', 'mode', 'subagent']) {
    if (config?.[key] && Object.keys(config[key]).length > 0) {
      fail('no-agents', `opencode.json must not define ${key} entries; specialist roles remain owned by config/agent-roles.json.`);
    }
  }

  // Provider credentials and unattended loops remain out of scope.
  for (const key of ['provider', 'model', 'small_model', 'apiKey', 'api_key', 'schedule', 'cron', 'daemon']) {
    if (config?.[key] !== undefined) {
      fail('no-credentials-or-loops', `opencode.json must not set "${key}"; provider credentials and scheduled loops are a later gated decision.`);
    }
  }

  return problems;
}

/**
 * Classify an agent-facing tool name against the excluded capability set.
 * Returns the excluded capability ids the name matches.
 */
export function excludedCapabilitiesFor(name) {
  return EXCLUDED_CAPABILITIES.filter((capability) => capability.pattern.test(name)).map((capability) => capability.id);
}

/**
 * Minimal MCP stdio client.
 *
 * The point of this lane is that an agent reaches the Factory through the MCP
 * adapter rather than through the internal HTTP surface, so the smoke test
 * speaks the protocol to the very process opencode.json launches instead of
 * calling the service client directly.
 */
export class McpStdioClient {
  constructor({ command, environment = {}, cwd = REPOSITORY_ROOT, timeoutMs = 120_000 } = {}) {
    if (!Array.isArray(command) || command.length === 0) throw new Error('command must be a non-empty array.');
    this.command = command;
    this.environment = environment;
    this.cwd = cwd;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.stderr = '';
    this.child = null;
    this.exit = null;
  }

  start() {
    const [bin, ...args] = this.command;
    this.child = spawn(bin, args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.environment },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.exit = new Promise((resolve) => {
      this.child.on('exit', (code, signal) => resolve({ code, signal }));
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.#consume(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; });
    this.child.on('error', (error) => this.#rejectAll(error));
    this.child.on('exit', () => this.#rejectAll(new Error(`MCP adapter exited. stderr: ${this.stderr.trim()}`)));
    return this;
  }

  #consume(chunk) {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.#dispatch(line);
      index = this.buffer.indexOf('\n');
    }
  }

  #dispatch(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id === undefined || !this.pending.has(message.id)) return;
    const { resolve, reject, timer } = this.pending.get(message.id);
    this.pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(`${message.error.message ?? 'MCP error'} (${message.error.code ?? 'no code'})`));
    else resolve(message.result);
  }

  #rejectAll(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request ${method} timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'app-builder-opencode-lane-smoke', version: '1' },
    });
    this.notify('notifications/initialized', {});
    return result;
  }

  async listTools() {
    const result = await this.request('tools/list', {});
    return result.tools ?? [];
  }

  /** Returns { ok, value, message } — a tool-level error is data, not a throw. */
  async callTool(name, args = {}) {
    let result;
    try {
      result = await this.request('tools/call', { name, arguments: args });
    } catch (error) {
      return { ok: false, value: null, message: error instanceof Error ? error.message : String(error) };
    }
    const text = (result?.content ?? []).filter((part) => part.type === 'text').map((part) => part.text).join('\n');
    if (result?.isError) return { ok: false, value: null, message: text };
    return { ok: true, value: result?.structuredContent ?? text, message: null };
  }

  async close() {
    if (!this.child) return null;
    this.child.stdin.end();
    this.child.kill('SIGTERM');
    return this.exit;
  }
}

/**
 * Deterministic projection of the Factory role registry into the shape
 * OpenCode agent definitions would take.
 *
 * This is a dry run on purpose. `config/agent-roles.json` stays the only
 * source of truth: nothing here is written into opencode.json, and a role that
 * the registry has not promoted cannot become runtime-ready through this
 * projection.
 */
const POLICY_TOOL_MAP = Object.freeze({
  'repo.read': ['read', 'grep', 'glob', 'list'],
  'repo.write': ['edit', 'write', 'patch'],
  'process.test': ['bash'],
  'process.build': ['bash'],
  'network.public': ['webfetch'],
});

function toolStateForRole(policy) {
  // Deny-by-default: a tool is enabled only when the role's policy allows the
  // action outright. An approval-gated action is not an enabled tool.
  const tools = { bash: false, edit: false, write: false, patch: false, webfetch: false, websearch: false, read: false, grep: false, glob: false, list: false, task: false };
  const approvalRequired = new Set(policy?.approvalRequired ?? []);
  for (const action of policy?.allow ?? []) {
    if (approvalRequired.has(action)) continue;
    for (const tool of POLICY_TOOL_MAP[action] ?? []) tools[tool] = true;
  }
  return tools;
}

function mcpToolsForRole({ role, policy, bindings, capabilities }) {
  // A role's Factory reach is its *operation-level* capability set, not the
  // mutating/non-mutating halves of the tool surface.
  //
  // The rule this replaced asked only whether the role owned any mutation
  // scope, so a role scoped to write frontend files projected generate,
  // overrides-write, ingestion and preview control alike (issue #55). The
  // registry now says which policy actions and which mutation scopes each
  // operation actually needs, and `capabilitiesForRole` is the same function
  // the trusted broker's grant minting uses — one projection, one rule.
  const { granted } = capabilitiesForRole({ role, policy, registry: capabilities });
  const byOperation = new Map(bindings.map((binding) => [binding.serviceTool, binding]));
  const gated = new Set((capabilities.capabilities ?? []).filter((entry) => entry.approvalRequired).map((entry) => entry.id));

  const tools = [];
  const approvalGated = [];
  for (const capabilityId of granted) {
    const binding = byOperation.get(capabilityId);
    if (!binding) continue;
    // An approval-gated capability is not an enabled tool. It is listed
    // separately so the projection cannot read as though the role may invoke
    // it unattended, which is the same rule `toolStateForRole` applies to
    // approval-gated policy actions.
    (gated.has(capabilityId) ? approvalGated : tools).push(`${MCP_SERVER_NAME}_${binding.name}`);
  }
  return { mcpTools: tools.sort(), approvalGatedMcpTools: approvalGated.sort() };
}

export function materialiseRoles({ roles, pipelines, policies, bindings, capabilities, projectClass = null }) {
  if (!capabilities?.capabilities) {
    throw new Error('materialiseRoles needs config/agent-capabilities.json: a role\'s Factory reach is an operation-level capability set, not a mutating/non-mutating split.');
  }
  const registryRoles = roles?.roles ?? {};
  const pipeline = projectClass ? pipelines?.pipelines?.[projectClass] : null;
  if (projectClass && !pipeline) {
    throw new Error(`Unknown project class "${projectClass}". Known classes: ${Object.keys(pipelines?.pipelines ?? {}).join(', ') || 'none'}`);
  }

  // A pipeline selects creators and the independent reviewers that promote
  // their work; `human` is a reserved reviewer and never an agent.
  const reserved = new Set(roles?.reservedReviewers ?? []);
  const selected = pipeline
    ? [...new Set((pipeline.stages ?? []).flatMap((stage) => [stage.role, stage.reviewer]).filter((id) => id && !reserved.has(id)))]
    : Object.keys(registryRoles);

  const agents = {};
  const unresolved = [];
  for (const id of selected.sort()) {
    const role = registryRoles[id];
    if (!role) {
      unresolved.push(id);
      continue;
    }
    const policy = policies?.policies?.[role.policyId] ?? null;
    agents[id] = {
      description: role.purpose,
      // Registry roles are specialists, never the session's primary agent: a
      // primary would have to be invented here, and invention is the thing
      // this projection exists to avoid.
      mode: 'subagent',
      tools: toolStateForRole(policy),
      ...mcpToolsForRole({ role, policy, bindings, capabilities }),
      source: {
        registry: 'config/agent-roles.json',
        roleId: role.id,
        policyId: role.policyId,
        routeId: role.routeId,
        contextCeilingTokens: role.contextCeilingTokens,
        reviewedBy: role.reviewedBy,
        registryStatus: role.status,
      },
      runtimeReady: false,
      blockedBy: [
        role.status === 'available' ? null : `role status is "${role.status}" in config/agent-roles.json`,
        'no execution sandbox yet isolates a task from the internal Factory HTTP listener (issue #55)',
        'no AgentRuntimeAdapter, provider credentials or per-role session lifecycle exist yet',
      ].filter(Boolean),
    };
  }

  return {
    $dryRun: true,
    generatedFrom: ['config/agent-roles.json', 'config/agent-pipelines.json', 'config/agent-policies.json', 'config/agent-capabilities.json'],
    warning: 'Representation only. Do not write these definitions into opencode.json; the Factory role registry stays the single source of truth.',
    projectClass,
    validatedOpenCodeVersion: VALIDATED_OPENCODE_VERSION,
    runtimeReady: false,
    roleCount: Object.keys(agents).length,
    unresolvedRoles: unresolved,
    agent: agents,
  };
}
