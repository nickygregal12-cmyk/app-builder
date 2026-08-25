import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';

function manifest(slug = 'service-test') {
  return {
    schemaVersion: 2,
    project: { name: 'Service Test', slug, type: 'marketing-site', primaryGoal: 'Prove service-backed deterministic generation.' },
    audience: { targetUsers: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Service Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { tenantModel: null, integrations: [], uploads: {}, existingData: [], expectedScale: null, sensitivity: null, hardConstraints: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

test('real generation persists task/event/checkpoint evidence and sqlite metrics', async () => {
  const dirs = roots('app-builder-service-ledger-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  try {
    const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot });
    const project = service.createProject({ id: 'project-service-test', manifest: manifest() });
    assert.equal(project.state, 'ready');

    const result = await service.generateProject(project.id);
    assert.equal(result.project.state, 'generated');
    assert.equal(result.task.state, 'succeeded');
    assert.ok(fs.existsSync(path.join(result.workspace, '.app-builder/composition.json')));
    assert.ok(fs.existsSync(path.join(result.workspace, '.app-builder/recipe-installations.json')));

    const tasks = service.listTasks(project.id);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].state, 'succeeded');
    const events = service.listEvents(project.id);
    assert.deepEqual(events.map((event) => event.type), ['build.started', 'composition.materialised', 'repository.generated', 'build.succeeded']);
    assert.deepEqual(service.listEvents(project.id, { afterSequence: events[1].sequence }).map((event) => event.type), ['repository.generated', 'build.succeeded']);
    const metrics = service.metrics(project.id);
    assert.equal(metrics.eventCount, 4);
    assert.equal(metrics.costGbp, 0);
    assert.equal(metrics.inputTokens, 0);
    assert.equal(metrics.outputTokens, 0);
    assert.ok(metrics.durationMs >= 0);
    assert.equal(service.latestCheckpoint(project.id)?.id, result.checkpoint.id);

    const ledgerLines = fs.readFileSync(store.ledgerPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(ledgerLines.length, events.length);
    assert.deepEqual(ledgerLines.map((event) => event.type), events.map((event) => event.type));
  } finally {
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('local HTTP facade exposes project generation and ledger queries without arbitrary workspace paths', async () => {
  const dirs = roots('app-builder-service-http-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot });
  const server = createFactoryHttpServer({ service });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/health`).then((response) => response.json());
    assert.equal(health.ok, true);

    const createdResponse = await fetch(`${base}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'project-http-test', manifest: manifest('http-test') }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.project.workspacePath, null);

    const generatedResponse = await fetch(`${base}/projects/project-http-test/generate`, { method: 'POST' });
    assert.equal(generatedResponse.status, 200);
    const generated = await generatedResponse.json();
    assert.equal(generated.project.state, 'generated');
    assert.ok(generated.project.workspacePath.startsWith(path.resolve(dirs.workspacesRoot) + path.sep));
    assert.equal(generated.composition.warnings.includes('knowledge-pack-not-provided'), true);

    const events = await fetch(`${base}/projects/project-http-test/events`).then((response) => response.json());
    assert.equal(events.events.at(-1).type, 'build.succeeded');
    const metrics = await fetch(`${base}/projects/project-http-test/metrics`).then((response) => response.json());
    assert.equal(metrics.metrics.eventCount, 4);
    const checkpoint = await fetch(`${base}/projects/project-http-test/checkpoint`).then((response) => response.json());
    assert.equal(checkpoint.checkpoint.projectId, 'project-http-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
