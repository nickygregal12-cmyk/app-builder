/**
 * Adversarial coverage for the runtime-to-Factory capability boundary (#55).
 *
 * These tests assume the caller is hostile: it knows the Factory's routes, its
 * operation names and its port, and it is actively trying to gain an operation
 * it was not granted. "Normal usage works" is therefore not the acceptance
 * here — every test below is either a refusal that must hold, or the one
 * allowed path that must still work so the boundary is usable rather than
 * merely closed.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DENY_REASONS,
  GrantNonceRegistry,
  MAX_GRANT_TTL_SECONDS,
  authoriseAgentOperation,
  canonicalGrantPayload,
  capabilitiesForRole,
  createCapabilityGrant,
  indexCapabilityRegistry,
  verifyCapabilityGrant,
} from '@app-builder/control-plane/capabilities';

import { FACTORY_TOOLS } from '../apps/service/src/tool-contract.js';
import { MCP_TOOL_BINDINGS } from '../apps/mcp/src/mcp-server.js';
import { BROKER_ENDPOINT, BROKER_OPERATIONS, GRANT_HEADER, assertBrokerCoversRegistry, createAgentBroker } from '../apps/service/src/agent-broker.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (relative) => JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));

const REGISTRY = read('config/agent-capabilities.json');
const POLICIES = read('config/agent-policies.json');
const ROLES = read('config/agent-roles.json');
const INDEX = indexCapabilityRegistry(REGISTRY);
const SECRET = 'a'.repeat(48);

function grantFor(overrides = {}, secret = SECRET, now = new Date()) {
  return createCapabilityGrant(
    {
      attemptId: `attempt-${Math.random().toString(36).slice(2)}`,
      taskId: 'task-1',
      projectId: 'project-boundary',
      roleId: 'frontend-implementation',
      policyId: 'implementation',
      environment: 'development',
      capabilities: ['project.read'],
      mutationScopes: [],
      ...overrides,
    },
    secret,
    now,
  );
}

// ---------------------------------------------------------------------------
// Registry consistency. A registry that drifts from the operations that really
// exist is not an allow-list, it is a wish.
// ---------------------------------------------------------------------------

test('every declared capability names a real Factory operation and is never laxer than the service contract', () => {
  const contract = new Map(FACTORY_TOOLS.map((tool) => [tool.name, tool]));
  for (const capability of INDEX.capabilities.values()) {
    const tool = contract.get(capability.operation);
    assert.ok(tool, `capability ${capability.id} names an operation the service contract does not have`);
    assert.equal(capability.mutating, tool.mutating, `${capability.id} disagrees with the contract about mutation`);
    if (tool.approvalRequired) {
      assert.equal(capability.approvalRequired, true, `${capability.id} weakens the contract's approval requirement`);
    }
    assert.equal(capability.id, capability.operation, 'a capability id and its operation must be one name, not two');
  }
});

test('every Factory operation is either an agent capability or explicitly internal-only', () => {
  for (const tool of FACTORY_TOOLS) {
    const agentReachable = INDEX.byOperation.has(tool.name);
    const internal = INDEX.internalOnly.has(tool.name);
    assert.ok(agentReachable || internal, `${tool.name} is neither granted nor declared internal-only; deny-by-default has a hole`);
    assert.ok(!(agentReachable && internal), `${tool.name} is declared both ways`);
  }
});

test('source governance is declared internal-only, not merely absent from MCP', () => {
  assert.ok(INDEX.internalOnly.has('project.source.governance.update'));
  assert.ok(!INDEX.byOperation.has('project.source.governance.update'));
});

test('the broker dispatch map and the capability registry describe the same operations', () => {
  assert.doesNotThrow(() => assertBrokerCoversRegistry(REGISTRY));
  assert.deepEqual(Object.keys(BROKER_OPERATIONS).sort(), [...INDEX.byOperation.keys()].sort());
});

test('a broker that could dispatch an internal-only operation fails construction', () => {
  const widened = { ...REGISTRY, internalOnlyOperations: [{ operation: 'project.read', reason: 'contrived' }], capabilities: REGISTRY.capabilities.filter((entry) => entry.id !== 'project.read') };
  assert.throws(() => assertBrokerCoversRegistry(widened), /internal-only/);
});

test('every internal-only route declaration names a route the service really serves', () => {
  // The audit finding behind #55 warns against declarations nothing consumes.
  // Each internal-only entry therefore carries the literal fragment of http.js
  // that serves it, and is checked against the source rather than believed.
  const source = fs.readFileSync(path.join(REPOSITORY_ROOT, 'apps/service/src/http.js'), 'utf8');
  assert.ok((REGISTRY.internalOnlyRoutes ?? []).length > 0);
  for (const route of REGISTRY.internalOnlyRoutes) {
    assert.ok(route.marker, `${route.method} ${route.path} declares no consumer marker`);
    assert.ok(source.includes(route.marker), `${route.method} ${route.path} claims a route apps/service/src/http.js does not serve`);
    assert.ok(!INDEX.byOperation.has(route.path), 'an internal-only route must not also be an agent operation');
  }
});

test('every MCP tool binding is backed by a registered agent capability', () => {
  for (const binding of MCP_TOOL_BINDINGS) {
    assert.ok(INDEX.byOperation.has(binding.serviceTool), `MCP tool ${binding.name} exposes ${binding.serviceTool}, which is not an agent capability`);
  }
});

// ---------------------------------------------------------------------------
// Operation-level role projection. The defect #55's review comment recorded is
// that any mutation scope granted every mutating operation.
// ---------------------------------------------------------------------------

test('owning one mutation scope does not grant every mutating operation', () => {
  const role = { id: 'scoped', policyId: 'implementation', mutationScopes: ['src/**'] };
  const { granted, withheld } = capabilitiesForRole({ role, policy: POLICIES.policies.implementation, registry: INDEX });
  assert.ok(granted.includes('project.overrides.write'), 'a role that owns src/** may write content overrides');
  assert.ok(!granted.includes('project.generate'), 'generation also rewrites public/**, which this role does not own');
  const reason = withheld.find((entry) => entry.capability === 'project.generate');
  assert.deepEqual(reason.missingMutationScopes, ['public/**']);
});

test('a role with no mutation scope receives no scope-bearing mutation', () => {
  const role = { id: 'reviewer', policyId: 'review', mutationScopes: [] };
  const { granted } = capabilitiesForRole({ role, policy: POLICIES.policies.review, registry: INDEX });
  for (const capability of INDEX.capabilities.values()) {
    if (capability.requiredMutationScopes.length > 0) {
      assert.ok(!granted.includes(capability.id), `${capability.id} needs a mutation scope this role does not own`);
    }
  }
});

test('a specification role receives reads only', () => {
  const role = { id: 'spec', policyId: 'specification', mutationScopes: [] };
  const { granted } = capabilitiesForRole({ role, policy: POLICIES.policies.specification, registry: INDEX });
  for (const id of granted) assert.equal(INDEX.capabilities.get(id).mutating, false, `${id} is a mutation a specification role must not hold`);
});

test('an approval-gated policy action is not an outright capability', () => {
  // `implementation` gates secret.read_scoped and deploy.preview. Nothing in the
  // registry depends on those, so the check that matters is the rule itself:
  // a capability whose required action is only approval-gated is withheld.
  const registry = indexCapabilityRegistry({
    capabilities: [{ id: 'x.op', operation: 'x.op', mutating: true, approvalRequired: false, requiredPolicyActions: ['deploy.preview'], requiredMutationScopes: [], environments: ['development'] }],
  });
  const { granted, withheld } = capabilitiesForRole({ role: { id: 'impl', mutationScopes: [] }, policy: POLICIES.policies.implementation, registry });
  assert.deepEqual(granted, []);
  assert.deepEqual(withheld[0].missingPolicyActions, ['deploy.preview']);
});

test('every registry role projects a capability set its policy actually supports', () => {
  for (const role of Object.values(ROLES.roles)) {
    const policy = POLICIES.policies[role.policyId];
    assert.ok(policy, `role ${role.id} names an unregistered policy ${role.policyId}`);
    const { granted } = capabilitiesForRole({ role, policy, registry: INDEX });
    for (const id of granted) {
      const capability = INDEX.capabilities.get(id);
      for (const action of capability.requiredPolicyActions) {
        assert.ok(policy.allow.includes(action), `${role.id} was granted ${id} without policy action ${action}`);
        assert.ok(!policy.deny.includes(action), `${role.id} was granted ${id} despite ${action} being denied`);
      }
      for (const scope of capability.requiredMutationScopes) {
        assert.ok((role.mutationScopes ?? []).includes(scope), `${role.id} was granted ${id} without owning ${scope}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Grant identity. A task must not be able to mint, edit, retarget or outlive
// its own authority.
// ---------------------------------------------------------------------------

test('a valid grant verifies and carries its scope', () => {
  const { grant, token } = grantFor();
  const decoded = verifyCapabilityGrant(token, { secret: SECRET });
  assert.equal(decoded.attemptId, grant.attemptId);
  assert.equal(decoded.projectId, 'project-boundary');
  assert.deepEqual(decoded.capabilities, ['project.read']);
});

test('a tampered payload does not verify', () => {
  const { grant, token } = grantFor();
  const widened = { ...grant, capabilities: ['project.read', 'project.generate'] };
  const forged = `${Buffer.from(canonicalGrantPayload(widened)).toString('base64url')}.${token.split('.').pop()}`;
  assert.throws(() => verifyCapabilityGrant(forged, { secret: SECRET }), (error) => error.reason === 'grant-signature-invalid');
});

test('re-ordering payload keys neither breaks a real grant nor rescues an edited one', () => {
  const { grant, token } = grantFor();
  const signature = token.split('.').pop();
  const shuffled = Object.fromEntries(Object.entries(grant).reverse());
  const reordered = `${Buffer.from(JSON.stringify(shuffled)).toString('base64url')}.${signature}`;
  assert.equal(verifyCapabilityGrant(reordered, { secret: SECRET }).attemptId, grant.attemptId);

  const edited = `${Buffer.from(JSON.stringify({ ...shuffled, projectId: 'other-project' })).toString('base64url')}.${signature}`;
  assert.throws(() => verifyCapabilityGrant(edited, { secret: SECRET }), (error) => error.reason === 'grant-signature-invalid');
});

test('a grant signed with another key does not verify', () => {
  const { token } = grantFor({}, 'b'.repeat(48));
  assert.throws(() => verifyCapabilityGrant(token, { secret: SECRET }), (error) => error.reason === 'grant-signature-invalid');
});

test('an expired grant fails closed', () => {
  const issued = new Date('2026-01-01T00:00:00.000Z');
  const { token } = grantFor({ ttlSeconds: 60 }, SECRET, issued);
  assert.throws(() => verifyCapabilityGrant(token, { secret: SECRET, now: new Date('2026-01-01T00:02:00.000Z') }), (error) => error.reason === 'grant-expired');
});

test('a grant presented before its window fails closed', () => {
  const issued = new Date('2026-01-01T00:00:00.000Z');
  const { token } = grantFor({ notBefore: '2026-01-01T01:00:00.000Z' }, SECRET, issued);
  assert.throws(() => verifyCapabilityGrant(token, { secret: SECRET, now: issued }), (error) => error.reason === 'grant-not-yet-valid');
});

test('a malformed or absent token fails closed', () => {
  for (const token of [undefined, null, '', 'not-a-token', 'a.b', `${Buffer.from('[]').toString('base64url')}.x`]) {
    assert.throws(() => verifyCapabilityGrant(token, { secret: SECRET }), (error) => ['grant-malformed', 'grant-signature-invalid'].includes(error.reason), `token ${String(token)} must be refused`);
  }
});

test('a short signing secret is refused rather than accepted as a weak key', () => {
  assert.throws(() => createCapabilityGrant({ attemptId: 'a', taskId: 't', projectId: 'p', roleId: 'r', policyId: 'implementation', capabilities: [] }, 'short'), /at least 32 bytes/);
});

test('a grant cannot be minted with an unbounded lifetime', () => {
  assert.throws(() => grantFor({ ttlSeconds: MAX_GRANT_TTL_SECONDS + 1 }), /ttlSeconds/);
});

test('replaying a nonce with a different grant is refused', () => {
  const registry = new GrantNonceRegistry();
  const first = grantFor({ nonce: 'shared-nonce' }).grant;
  const second = grantFor({ nonce: 'shared-nonce', capabilities: ['project.read', 'project.list'] }).grant;
  registry.register(first);
  assert.doesNotThrow(() => registry.register(first), 'the same grant may be presented more than once within its window');
  assert.throws(() => registry.register(second), (error) => error.reason === 'grant-replayed');
});

// ---------------------------------------------------------------------------
// Authorisation. Deny-by-default, with a named reason for every refusal.
// ---------------------------------------------------------------------------

function decide(overrides, request) {
  const { grant } = grantFor(overrides);
  return authoriseAgentOperation({ grant, registry: INDEX, ...request });
}

test('an internal-only operation is refused by name, not merely unrouted', () => {
  const decision = decide({ capabilities: ['project.source.governance.update'] }, { operation: 'project.source.governance.update' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'operation-not-agent-accessible');
});

test('an unknown or creatively spelled operation is refused', () => {
  for (const operation of [
    '',
    'project.deploy',
    'project.read ',
    '../projects',
    'project%2Eread',
    '/projects/project-boundary/sources/s1/governance',
    'http://127.0.0.1:4310/projects/project-boundary',
    'PROJECT.READ',
  ]) {
    const decision = decide({ capabilities: ['project.read'] }, { operation });
    assert.equal(decision.allowed, false, `${operation} must not resolve to an operation`);
    assert.equal(decision.reason, 'unknown-operation');
  }
});

test('a capability absent from the grant is refused even when the role could hold it', () => {
  const decision = decide({ capabilities: ['project.read'] }, { operation: 'project.generate' });
  assert.equal(decision.reason, 'capability-not-granted');
});

test('a granted capability without its mutation scope is refused', () => {
  const decision = decide({ capabilities: ['project.overrides.write'], mutationScopes: [] }, { operation: 'project.overrides.write' });
  assert.equal(decision.reason, 'capability-not-granted');
  assert.match(decision.detail, /src\/\*\*/);
});

test('a grant cannot be pointed at another project', () => {
  const decision = decide({ capabilities: ['project.read'] }, { operation: 'project.read', projectId: 'someone-elses-project' });
  assert.equal(decision.reason, 'grant-project-mismatch');
});

test('a grant cannot be used in another environment', () => {
  assert.equal(decide({ capabilities: ['project.read'] }, { operation: 'project.read', environment: 'production' }).reason, 'grant-environment-mismatch');
  assert.equal(decide({ capabilities: ['project.generate'], mutationScopes: ['src/**', 'public/**'], environment: 'production' }, { operation: 'project.generate' }).reason, 'environment-not-permitted');
});

test('an approval-required operation without an approval is refused before dispatch', () => {
  const decision = decide({ capabilities: ['project.sources.ingest'] }, { operation: 'project.sources.ingest' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'approval-required');
});

test('an approval for a different project or a lapsed approval is refused', () => {
  const approval = { approvalId: 'approval-1', operation: 'project.sources.ingest', grantedBy: 'human' };
  const wrongProject = decide(
    { capabilities: ['project.sources.ingest'], approvals: [{ ...approval, projectId: 'another-project', expiresAt: '2999-01-01T00:00:00.000Z' }] },
    { operation: 'project.sources.ingest' },
  );
  assert.equal(wrongProject.reason, 'approval-mismatch');

  const lapsed = decide(
    { capabilities: ['project.sources.ingest'], approvals: [{ ...approval, projectId: 'project-boundary', expiresAt: '2020-01-01T00:00:00.000Z' }] },
    { operation: 'project.sources.ingest' },
  );
  assert.equal(lapsed.reason, 'approval-expired');
});

test('a valid approval permits exactly the approved operation', () => {
  const approvals = [{ approvalId: 'approval-1', operation: 'project.sources.ingest', projectId: 'project-boundary', grantedBy: 'human', expiresAt: '2999-01-01T00:00:00.000Z' }];
  const allowed = decide({ capabilities: ['project.sources.ingest', 'project.generate'], mutationScopes: ['src/**', 'public/**'], approvals }, { operation: 'project.sources.ingest' });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.approvalId, 'approval-1');

  // The approval is for one operation. It does not become a general licence.
  const adjacent = decide({ capabilities: ['project.sources.ingest'], approvals }, { operation: 'project.source.governance.update' });
  assert.equal(adjacent.reason, 'operation-not-agent-accessible');
});

test('the attempt operation budget is a hard stop', () => {
  const { grant } = grantFor({ capabilities: ['project.read'], maxOperations: 2 });
  assert.equal(authoriseAgentOperation({ grant, registry: INDEX, operation: 'project.read', operationsSpent: 1 }).allowed, true);
  assert.equal(authoriseAgentOperation({ grant, registry: INDEX, operation: 'project.read', operationsSpent: 2 }).reason, 'budget-exhausted');
});

test('an expired grant is refused at dispatch as well as at verification', () => {
  const { grant } = grantFor({ capabilities: ['project.read'], ttlSeconds: 60 }, SECRET, new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(authoriseAgentOperation({ grant, registry: INDEX, operation: 'project.read', now: new Date('2026-01-01T02:00:00.000Z') }).reason, 'grant-expired');
});

test('every refusal names a registered reason', () => {
  const cases = [
    decide({ capabilities: [] }, { operation: 'project.read' }),
    decide({ capabilities: ['project.read'] }, { operation: 'nope' }),
    decide({ capabilities: ['project.read'] }, { operation: 'project.source.governance.update' }),
    decide({ capabilities: ['project.read'] }, { operation: 'project.read', projectId: 'x' }),
    decide({ capabilities: ['project.sources.ingest'] }, { operation: 'project.sources.ingest' }),
  ];
  for (const decision of cases) {
    assert.equal(decision.allowed, false);
    assert.ok(DENY_REASONS.includes(decision.reason), `${decision.reason} is not a registered deny reason`);
  }
});

// ---------------------------------------------------------------------------
// The broker itself, over a real Unix socket with a real Factory service.
// ---------------------------------------------------------------------------

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Boundary Test', slug, type: 'marketing-site', primaryGoal: 'Prove the agent capability boundary.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Boundary Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

/** Speak to the broker the way a sandboxed worker would: socket, no host, no port. */
function brokerRequest(socketPath, { token, body, endpoint = BROKER_ENDPOINT, method = 'POST' } = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) };
    if (token !== undefined) headers[GRANT_HEADER] = token;
    const request = http.request({ socketPath, path: endpoint, method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

async function withBroker(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-capability-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  const broker = createAgentBroker({ service, registry: REGISTRY, secret: SECRET });
  const socketPath = await broker.listen(path.join(root, 'broker.sock'));
  try {
    return await run({ service, store, broker, socketPath, root });
  } finally {
    await broker.close();
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('the broker serves one endpoint and no route surface at all', async () => {
  await withBroker(async ({ socketPath }) => {
    const { token } = grantFor({ capabilities: ['project.read'] });
    for (const [method, endpoint] of [
      ['GET', '/'],
      ['GET', '/projects'],
      ['POST', '/projects/project-boundary/sources/s1/governance'],
      ['GET', '/health'],
      ['GET', '/tools'],
      ['POST', '/operation/../projects'],
      ['POST', '/operation?operation=project.read'],
    ]) {
      const response = await brokerRequest(socketPath, { token, body: {}, endpoint, method });
      assert.equal(response.status, 404, `${method} ${endpoint} must not be routed`);
      assert.equal(response.body.error, 'broker-single-endpoint');
    }
  });
});

test('the broker refuses an unauthenticated or forged caller', async () => {
  await withBroker(async ({ socketPath }) => {
    const none = await brokerRequest(socketPath, { body: { operation: 'project.list' } });
    assert.equal(none.status, 403);
    assert.equal(none.body.reason, 'grant-malformed');

    const foreign = grantFor({ capabilities: ['project.list', 'project.generate'] }, 'z'.repeat(48)).token;
    const forged = await brokerRequest(socketPath, { token: foreign, body: { operation: 'project.list' } });
    assert.equal(forged.status, 403);
    assert.equal(forged.body.reason, 'grant-signature-invalid');
  });
});

test('an allowed read reaches the Factory and lands in the durable ledger', async () => {
  await withBroker(async ({ service, socketPath }) => {
    const project = service.createProject({ id: 'project-boundary', manifest: manifest('boundary-allowed') });
    const { token } = grantFor({ capabilities: ['project.read', 'project.manifest.read'] });

    const response = await brokerRequest(socketPath, { token, body: { operation: 'project.read', projectId: project.id } });
    assert.equal(response.status, 200);
    assert.equal(response.body.result.project.id, project.id);
    assert.ok(response.body.decisionId);

    const manifestResponse = await brokerRequest(socketPath, { token, body: { operation: 'project.manifest.read', projectId: project.id } });
    assert.equal(manifestResponse.body.result.manifest.project.slug, 'boundary-allowed');

    const events = service.listEvents(project.id, { afterSequence: 0 });
    const allowed = events.filter((event) => event.type === 'agent.operation.allowed');
    assert.equal(allowed.length, 2, 'both dispatches must be recorded');
    assert.equal(allowed[0].payload.operation, 'project.read');
    assert.equal(allowed[0].payload.roleId, 'frontend-implementation');
    assert.equal(allowed[0].payload.attemptId.startsWith('attempt-'), true);
  });
});

test('an internal-only operation is unreachable through the broker and the refusal is durable', async () => {
  await withBroker(async ({ service, socketPath }) => {
    const project = service.createProject({ id: 'project-boundary', manifest: manifest('boundary-internal') });
    // The most privileged grant this system can mint still cannot ask for it.
    const { token } = grantFor({
      capabilities: [...INDEX.byOperation.keys(), 'project.source.governance.update'],
      mutationScopes: ['src/**', 'public/**'],
      approvals: [{ approvalId: 'a', operation: 'project.source.governance.update', projectId: 'project-boundary', grantedBy: 'human', expiresAt: '2999-01-01T00:00:00.000Z' }],
    });

    const response = await brokerRequest(socketPath, { token, body: { operation: 'project.source.governance.update', projectId: project.id, arguments: { sourceId: 's1', decision: { trust: 'factory-trusted' } } } });
    assert.equal(response.status, 403);
    assert.equal(response.body.reason, 'operation-not-agent-accessible');

    const denied = service.listEvents(project.id, { afterSequence: 0 }).filter((event) => event.type === 'agent.operation.denied');
    assert.equal(denied.length, 1);
    assert.equal(denied[0].payload.reason, 'operation-not-agent-accessible');
    assert.equal(denied[0].payload.operation, 'project.source.governance.update');
  });
});

test('a bounded mutation succeeds under a narrow grant while the adjacent mutation stays forbidden', async () => {
  await withBroker(async ({ service, socketPath }) => {
    const project = service.createProject({ id: 'project-boundary', manifest: manifest('boundary-mutation') });
    // Exactly what a role scoped to src/** would receive: overrides, not generation.
    const { token } = grantFor({ capabilities: ['project.overrides.read', 'project.overrides.write', 'project.generate'], mutationScopes: ['src/**'] });

    const write = await brokerRequest(socketPath, { token, body: { operation: 'project.overrides.write', projectId: project.id, arguments: { overrides: [] } } });
    assert.equal(write.status, 200, JSON.stringify(write.body));

    const readBack = await brokerRequest(socketPath, { token, body: { operation: 'project.overrides.read', projectId: project.id } });
    assert.equal(readBack.status, 200);

    const generate = await brokerRequest(socketPath, { token, body: { operation: 'project.generate', projectId: project.id } });
    assert.equal(generate.status, 403);
    assert.equal(generate.body.reason, 'capability-not-granted');
  });
});

test('a grant for one project cannot be turned on another', async () => {
  await withBroker(async ({ service, socketPath }) => {
    service.createProject({ id: 'project-boundary', manifest: manifest('boundary-own') });
    const other = service.createProject({ id: 'project-other', manifest: manifest('boundary-other') });
    const { token } = grantFor({ capabilities: ['project.read'] });

    const response = await brokerRequest(socketPath, { token, body: { operation: 'project.read', projectId: other.id } });
    assert.equal(response.status, 403);
    assert.equal(response.body.reason, 'grant-project-mismatch');
  });
});

test('the broker returns Factory results and never a credential', async () => {
  await withBroker(async ({ service, socketPath }) => {
    service.createProject({ id: 'project-boundary', manifest: manifest('boundary-secrets') });
    const { token } = grantFor({ capabilities: ['integration.status.read'] });
    const response = await brokerRequest(socketPath, { token, body: { operation: 'integration.status.read' } });
    assert.equal(response.status, 200);
    const serialised = JSON.stringify(response.body);
    assert.ok(!serialised.includes(SECRET), 'the signing secret must never reach a caller');
    for (const integration of response.body.result.integrations) {
      assert.ok(!('value' in integration) && !('secret' in integration) && !('token' in integration), `integration status leaked a value: ${JSON.stringify(integration)}`);
    }
  });
});

test('the broker socket is owner-only and is not a network listener', async () => {
  await withBroker(async ({ socketPath, broker }) => {
    const stats = fs.statSync(socketPath);
    assert.equal(stats.mode & 0o777, 0o600, 'the broker socket must not be world-reachable');
    assert.equal(typeof broker.server.address(), 'string', 'the broker must bind a socket path, never a host and port');
  });
});

test('the granular projection is never wider than the coarse rule it replaced', () => {
  // The rule this work replaced was: a role with any mutation scope receives
  // every mutating operation; a role with none receives none. It over-granted
  // badly, but for read-only roles it was strict. Making the projection
  // operation-level must only narrow the result, never widen it for any role.
  for (const role of Object.values(ROLES.roles)) {
    const policy = POLICIES.policies[role.policyId];
    const mayMutate = (role.mutationScopes ?? []).length > 0;
    const { granted } = capabilitiesForRole({ role, policy, registry: INDEX });
    for (const id of granted) {
      const capability = INDEX.capabilities.get(id);
      assert.ok(mayMutate || !capability.mutating, `${role.id} gained mutating ${id} that the previous rule withheld`);
    }
  }
});
