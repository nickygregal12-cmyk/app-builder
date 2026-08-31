/**
 * One decision, taken the same way whichever door the request came through.
 *
 * The approved-build-plan path freezes an owner's approved inputs and can be
 * spent once. It guarded `project.generate`, and `project.generate` was also
 * reachable by posting to the HTTP service, by an MCP tool, by a broker
 * operation and by any in-process caller — so an owner could approve a
 * contract and the build that shipped could be one that never went near it.
 * Freezing inputs nobody has to use is not a control.
 *
 * Two properties are tested here, and they answer different questions.
 *
 * **Parity.** Once a contract is approved, `project.generate` is refused on
 * every route, and permitted only through the plan. The test drives the real
 * HTTP server, the real broker dispatch map and a direct in-process call — not
 * three mocks of one function — because the failure being prevented is exactly
 * that one of them is wired differently from the others.
 *
 * **No silent growth.** Every mutating operation is registered, every
 * registered operation is instrumented, and a broker operation or tool-contract
 * entry that mutates and is not registered fails the suite. That is the part
 * that keeps this closed once everyone has forgotten why it was opened: the
 * next mutating route somebody adds either registers itself or fails.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { BROKER_OPERATIONS } from '../apps/service/src/agent-broker.js';
import { factoryToolContract } from '../apps/service/src/tool-contract.js';
import {
  MUTATION_SURFACES,
  MutationRefused,
  currentSurface,
  mutatingOperation,
  readMutatingOperations,
  runOnSurface,
} from '../apps/service/src/mutation-decision.js';
import { approveProjectBuildPlan, executeApprovedProjectBuildPlan } from '../apps/service/src/approved-build-plan-service.js';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Parity Test', slug, type: 'marketing-site', primaryGoal: 'Prove one decision guards every route.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Parity Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: {
      hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '',
      integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

function factory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-parity-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  service.createProject({ id: 'project-1', manifest: manifest('parity-test') });
  return { root, store, service, async close() { await service.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

async function listening(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    async post(pathname, body = {}) {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    async close() { await new Promise((resolve) => server.close(resolve)); },
  };
}

function decisions(service, projectId) {
  return service.listEvents(projectId).filter((event) => event.type === 'mutation.decided' || event.type === 'mutation.refused');
}

test('the registry is well formed and every operation says what it does', () => {
  const { registry, operations } = readMutatingOperations();
  assert.ok(operations.size >= 25, `only ${operations.size} mutating operations are registered, which is fewer than the service has`);
  for (const operation of operations.values()) {
    assert.match(operation.id, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/, `${operation.id} is not a well-formed operation name`);
    assert.ok(operation.effect?.length > 20, `${operation.id} does not say what it does`);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(operation.risk), `${operation.id} has no risk class`);
    assert.ok(['workspace', 'preview', 'production'].includes(operation.environment), `${operation.id} has no environment`);
    assert.ok(operation.method, `${operation.id} does not name the function it guards`);
    // An operation that is decided but not recorded has to say why, or the gap
    // is indistinguishable from an oversight.
    if (operation.ledgerRecord === false) assert.ok(operation.ledgerRecordReason?.length > 20, `${operation.id} is not recorded and does not say why`);
  }
  assert.ok(registry.rules.length >= 5);
});

test('every registered operation is actually instrumented at the function it names', () => {
  // Source-level, because the alternative is driving twenty-nine operations
  // with full fixtures, and a registry entry pointing at an uninstrumented
  // function is exactly the gap this rule is for.
  const sources = new Map();
  const read = (relative) => {
    if (!sources.has(relative)) sources.set(relative, fs.readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8'));
    return sources.get(relative);
  };

  const uninstrumented = [];
  for (const operation of readMutatingOperations().operations.values()) {
    const file = operation.module ?? 'apps/service/src/factory-service.js';
    const text = read(file);
    // The *definition*, not the first mention: a call site earlier in the file
    // would make this rule read the wrong function and pass for the wrong
    // reason.
    // A module declares functions at column zero; the service declares methods
    // indented inside a class. Using one pattern for both is what makes a
    // two-space-indented *call* look like the next definition and truncate the
    // window to nothing.
    const [definition, boundary] = operation.module
      ? [`^(?:export )?(?:async )?function ${operation.method}\\(`, /^(?:export )?(?:async )?function \w+\(/m]
      : [`^  (?:async )?${operation.method}\\(`, /^  (?:async )?\w+\(/m];
    const found = new RegExp(definition, 'm').exec(text);
    if (!found) { uninstrumented.push(`${operation.id} names ${operation.method}, which ${file} does not define`); continue; }
    // Bounded by the next definition, so a neighbouring function's decision can
    // never be mistaken for this one's.
    const rest = text.slice(found.index + found[0].length);
    const next = boundary.exec(rest);
    const window = next ? rest.slice(0, next.index) : rest;
    const guarded = operation.ledgerRecord === false
      ? window.includes(`assertMutationRegistered('${operation.id}')`)
      : window.includes(`decideMutation('${operation.id}'`);
    if (!guarded) uninstrumented.push(`${operation.id} (${file}:${operation.method}) does not take its decision`);
  }
  assert.deepEqual(uninstrumented, [], 'a registered operation is not guarded by the decision it is registered for');
});

test('every mutating broker operation and tool-contract entry is registered', () => {
  const registered = readMutatingOperations().operations;
  const READ_ONLY = /(^|\.)(list|read|status)($|\.)|\.read$|^integration\.status\.read$|^project\.list$/;

  const brokerGaps = Object.keys(BROKER_OPERATIONS)
    .filter((name) => !READ_ONLY.test(name))
    .filter((name) => !registered.has(name));
  assert.deepEqual(brokerGaps, [], 'a broker operation mutates and is not registered, so nothing decides it');

  // The contract declares `mutating` itself, so this reads what it says rather
  // than guessing from the HTTP verb. Counting the subjects matters: a filter
  // over the wrong field name would examine nothing and pass, which is how this
  // rule was written the first time.
  const mutatingTools = factoryToolContract().tools.filter((tool) => tool.mutating === true);
  assert.ok(mutatingTools.length >= 8, `only ${mutatingTools.length} declared tools mutate, so this rule is checking almost nothing`);
  const toolGaps = mutatingTools.map((tool) => tool.name).filter((name) => !registered.has(name));
  assert.deepEqual(toolGaps, [], 'a declared tool mutates and is not registered, so nothing decides it');

  const brokerMutating = Object.keys(BROKER_OPERATIONS).filter((name) => !READ_ONLY.test(name));
  assert.ok(brokerMutating.length >= 5, `only ${brokerMutating.length} broker operations mutate, so this rule is checking almost nothing`);
});

test('an unregistered operation is refused rather than quietly permitted', async () => {
  const harness = factory();
  try {
    await assert.rejects(
      () => harness.service.decideMutation('project.something.nobody.registered', 'project-1'),
      (error) => error instanceof MutationRefused && error.refusal === 'unregistered-operation',
    );
    const refusals = decisions(harness.service, 'project-1').filter((event) => event.type === 'mutation.refused');
    assert.equal(refusals.at(-1).payload.refusal, 'unregistered-operation', 'a refusal is recorded as durably as a permission');
  } finally {
    await harness.close();
  }
});

test('the surface is the door the request came through, not a claim the request makes', async () => {
  assert.equal(currentSurface(), 'internal', 'an untagged call is internal, which is the least privileged reading');
  for (const surface of MUTATION_SURFACES) {
    assert.equal(await runOnSurface(surface, async () => currentSurface()), surface);
  }
  assert.throws(() => runOnSurface('owner', () => null), /Unknown mutation surface/);

  // Async work inside a surface keeps it, which is the whole reason this is
  // async-local rather than a field somebody sets and forgets to unset.
  const kept = await runOnSurface('broker', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return currentSurface();
  });
  assert.equal(kept, 'broker');
  assert.equal(currentSurface(), 'internal', 'the surface does not leak out of the call it was set for');
});

test('an ordinary workspace build is decided and recorded on whichever surface asked', async () => {
  const harness = factory();
  const http = await listening(createFactoryHttpServer({ service: harness.service }));
  try {
    // Before a contract is approved a workspace build is the operator's own
    // scratch, so it is permitted — and still recorded, with the surface.
    const viaHttp = await http.post('/projects/project-1/generate');
    assert.equal(viaHttp.status, 200);

    const recorded = decisions(harness.service, 'project-1').filter((event) => event.payload.operation === 'project.generate');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].type, 'mutation.decided');
    assert.equal(recorded[0].payload.surface, 'http', 'the decision records which door the request came through');
    assert.equal(recorded[0].payload.basis, 'workspace-policy-before-contract-approval');
  } finally {
    await http.close();
    await harness.close();
  }
});

test('once a contract is approved, generation is refused on every route and permitted only through the plan', async () => {
  const harness = factory();
  const { service } = harness;
  const http = await listening(createFactoryHttpServer({ service }));
  try {
    const plan = await approveProjectBuildPlan(service, 'project-1', {
      approvalId: 'approval-1', approvalMode: 'explicit-local-operator', confirmed: true,
    });
    assert.ok(plan.planHash);

    // 1. Direct HTTP — the Builder Console's only route into the service.
    const viaHttp = await http.post('/projects/project-1/generate');
    assert.equal(viaHttp.status, 403, `HTTP generate should be refused, got ${viaHttp.status}: ${JSON.stringify(viaHttp.body)}`);
    assert.match(viaHttp.body.message, /approved build plan/i);

    // 2. The broker — the only surface a sandboxed task can reach, and the one
    //    an MCP client reaches when it is not going through HTTP.
    await assert.rejects(
      () => runOnSurface('broker', () => BROKER_OPERATIONS['project.generate'](service, { projectId: 'project-1', args: {} })),
      (error) => error instanceof MutationRefused && error.refusal === 'authorization-missing',
    );

    // 3. An in-process caller — the one that has no transport to be stopped at,
    //    and the reason the decision lives in the service rather than a router.
    await assert.rejects(
      () => service.generateProject('project-1'),
      (error) => error instanceof MutationRefused && error.refusal === 'authorization-missing',
    );

    // Every refusal was recorded, and each one names the surface it refused.
    const refused = decisions(service, 'project-1').filter((event) => event.type === 'mutation.refused' && event.payload.operation === 'project.generate');
    assert.equal(refused.length, 3, 'every route was refused and every refusal was recorded');
    assert.deepEqual([...new Set(refused.map((event) => event.payload.surface))].sort(), ['broker', 'http', 'internal']);

    // And the governed path still works, saying which plan authorised it.
    const executed = await executeApprovedProjectBuildPlan(service, 'project-1', {
      planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-1',
    });
    assert.equal(executed.result.project.state, 'generated');

    const permitted = decisions(service, 'project-1').filter((event) => event.type === 'mutation.decided' && event.payload.operation === 'project.generate');
    assert.equal(permitted.length, 1);
    assert.equal(permitted[0].payload.basis, 'approved-build-plan');
    assert.equal(permitted[0].payload.authorizationId, plan.planId);
  } finally {
    await http.close();
    await harness.close();
  }
});

test('a spent plan does not become a second permission to generate', async () => {
  const harness = factory();
  const { service } = harness;
  try {
    const plan = await approveProjectBuildPlan(service, 'project-1', {
      approvalId: 'approval-1', approvalMode: 'explicit-local-operator', confirmed: true,
    });
    await executeApprovedProjectBuildPlan(service, 'project-1', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-1' });

    // The plan's own consume-once guarantee is unweakened by being decided
    // through the shared path.
    await assert.rejects(
      () => executeApprovedProjectBuildPlan(service, 'project-1', { planId: plan.planId, expectedPlanHash: plan.planHash, requestId: 'request-2' }),
      /already been claimed/,
    );
    // And a direct build is still refused afterwards, so a spent plan is not a
    // door somebody props open.
    await assert.rejects(
      () => service.generateProject('project-1'),
      (error) => error instanceof MutationRefused && error.refusal === 'authorization-missing',
    );
  } finally {
    await harness.close();
  }
});

test('operations that are not generation stay usable, and record their decision', async () => {
  const harness = factory();
  const { service } = harness;
  const http = await listening(createFactoryHttpServer({ service }));
  try {
    await approveProjectBuildPlan(service, 'project-1', { approvalId: 'approval-1', approvalMode: 'explicit-local-operator', confirmed: true });

    // Escalating generation must not quietly escalate everything around it: a
    // control that stops ordinary work is one somebody turns off.
    const design = await http.post('/projects/project-1/design', { choices: {} });
    assert.equal(design.status, 200, JSON.stringify(design.body));

    const recorded = decisions(service, 'project-1').filter((event) => event.payload.operation === 'project.design.write');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].type, 'mutation.decided');
    assert.equal(recorded[0].payload.basis, 'workspace-policy');
    assert.equal(recorded[0].payload.surface, 'http');
    assert.equal(mutatingOperation('project.design.write').risk, 'low');
  } finally {
    await http.close();
    await harness.close();
  }
});
