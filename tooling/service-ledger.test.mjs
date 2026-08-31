import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { buildOutputManifest, lockDigest, sourceDigest } from './lib/build-identity.mjs';

function manifest(slug = 'service-test') {
  return {
    schemaVersion: 2,
    project: { name: 'Service Test', slug, type: 'marketing-site', primaryGoal: 'Prove service-backed deterministic generation.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Service Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: {
      hard: [],
      expectedScale: 'under-1000',
      sensitivity: 'normal-business-data',
      tenantModel: '',
      integrations: [],
      existingData: [],
      uploadTypes: [],
      customCapabilities: [],
      excludedCapabilities: [],
      unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

test('real service lifecycle persists generation verification preview and metrics', async () => {
  const dirs = roots('app-builder-service-ledger-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot });
  try {
    const project = service.createProject({ id: 'project-service-test', manifest: manifest() });
    assert.equal(project.state, 'ready');

    const result = await service.generateProject(project.id);
    assert.equal(result.project.state, 'generated');
    assert.equal(result.task.state, 'succeeded');
    assert.ok(fs.existsSync(path.join(result.workspace, '.app-builder/composition.json')));
    assert.ok(fs.existsSync(path.join(result.workspace, '.app-builder/recipe-installations.json')));
    assert.equal(service.getManifest(project.id).project.slug, 'service-test');
    assert.equal(service.getKnowledgePack(project.id), null);
    assert.equal(service.getComposition(project.id).compositionHash, result.composition.compositionHash);

    const verified = await service.verifyProject(project.id);
    assert.equal(verified.project.state, 'verified');
    assert.equal(verified.task.state, 'succeeded');
    assert.ok(fs.existsSync(path.join(result.workspace, 'dist')));

    // Verification installed from a lockfile it resolved, and wrote down what
    // it built. Without these four, `verified` is only "a build once ran".
    assert.ok(fs.existsSync(path.join(result.workspace, 'package-lock.json')), 'verification resolves the generated project a lockfile');
    const identity = verified.project.buildIdentity ?? service.getProject(project.id).buildIdentity;
    assert.equal(identity.sourceDigest, sourceDigest(result.workspace));
    assert.equal(identity.lockDigest, lockDigest(result.workspace));
    assert.equal(identity.outputDigest, buildOutputManifest(path.join(result.workspace, 'dist')).digest);
    assert.equal(identity.toolchain.node, process.versions.node);
    assert.ok(identity.outputFiles > 0);

    const recordedManifest = JSON.parse(fs.readFileSync(path.join(result.workspace, '.app-builder/output-manifest.json'), 'utf8'));
    assert.equal(recordedManifest.digest, identity.outputDigest);
    assert.equal(recordedManifest.files.length, identity.outputFiles);

    const preview = await service.startPreview(project.id);
    assert.equal(preview.state, 'running');
    // The operator-facing preview state is a path through the Console boundary.
    // A host or a port here would be a remote operator's broken preview.
    assert.equal(preview.path, `/preview/${project.id}/`);
    assert.equal(Object.hasOwn(preview, 'url'), false);
    assert.equal(Object.hasOwn(preview, 'port'), false);
    assert.equal(JSON.stringify(preview).includes('127.0.0.1'), false);

    // The loopback destination stays inside the factory, and the generated app
    // really is served under the base path the operator's browser will use.
    const target = service.previewTarget(project.id);
    assert.equal(target.basePath, preview.path);
    assert.match(target.url, /^http:\/\/127\.0\.0\.1:\d+\/preview\/project-service-test\/$/);
    const previewResponse = await fetch(target.url);
    assert.equal(previewResponse.ok, true);
    const previewHtml = await previewResponse.text();
    // The preview must genuinely be this build served under the Console's base
    // path. Which entry point that involves is the renderer's business — this
    // project type is rendered statically, so there is no module to boot — so
    // what is asserted is what is true of any renderer: a real document, and
    // every in-site address resolved inside the mount.
    assert.match(previewHtml, /<main[^>]*class="app-shell"/);
    assert.match(previewHtml, new RegExp(`href="${preview.path}"`));
    assert.equal(previewHtml.includes('href="/"'), false, 'an address outside the mount would break a remote preview');
    assert.equal(service.previewStatus(project.id).state, 'running');

    const stopped = await service.stopPreview(project.id);
    assert.equal(stopped.state, 'stopped');
    assert.equal(stopped.path, null);
    assert.equal(service.previewTarget(project.id), null);

    const tasks = service.listTasks(project.id);
    assert.equal(tasks.length, 2);
    assert.equal(tasks.every((task) => task.state === 'succeeded'), true);
    const events = service.listEvents(project.id);
    assert.deepEqual(events.map((event) => event.type), [
      'build.started',
      'composition.materialised',
      'repository.generated',
      'build.succeeded',
      'quality.started',
      'quality.lock.resolved',
      'quality.install.succeeded',
      'quality.check.succeeded',
      'quality.build.succeeded',
      'quality.identity.recorded',
      'quality.succeeded',
      'preview.started',
      'preview.stopped',
    ]);
    assert.deepEqual(service.listEvents(project.id, { afterSequence: events[10].sequence }).map((event) => event.type), ['preview.started', 'preview.stopped']);
    const metrics = service.metrics(project.id);
    assert.equal(metrics.eventCount, 13);
    assert.equal(metrics.costGbp, 0);
    assert.equal(metrics.inputTokens, 0);
    assert.equal(metrics.outputTokens, 0);
    assert.ok(metrics.durationMs >= 0);
    assert.equal(service.latestCheckpoint(project.id)?.id, verified.checkpoint.id);

    const ledgerLines = fs.readFileSync(store.ledgerPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(ledgerLines.length, events.length);
    assert.deepEqual(ledgerLines.map((event) => event.type), events.map((event) => event.type));
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('local HTTP facade exposes bounded project state and never returns integration secret values', async () => {
  const dirs = roots('app-builder-service-http-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, env: { NETLIFY_AUTH_TOKEN: 'never-return-this-value' } });
  const server = createFactoryHttpServer({ service });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${base}/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    assert.equal(health.version, 2);
    const tools = await fetch(`${base}/tools`).then((response) => response.json());
    assert.ok(tools.tools.some((tool) => tool.name === 'project.preview.start'));
    assert.equal(tools.tools.some((tool) => tool.approvalRequired && tool.name.includes('deploy')), false);
    const integrationsText = await fetch(`${base}/integrations`).then((response) => response.text());
    assert.equal(integrationsText.includes('never-return-this-value'), false);
    const integrations = JSON.parse(integrationsText).integrations;
    assert.equal(integrations.find((item) => item.id === 'netlify').configured, true);
    assert.equal(integrations.find((item) => item.id === 'openai').configured, false);

    const createdResponse = await fetch(`${base}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'project-http-test', manifest: manifest('http-test') }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.project.workspacePath, null);

    const manifestResponse = await fetch(`${base}/projects/project-http-test/manifest`).then((response) => response.json());
    assert.equal(manifestResponse.manifest.project.slug, 'http-test');
    const knowledgeResponse = await fetch(`${base}/projects/project-http-test/knowledge-pack`).then((response) => response.json());
    assert.equal(knowledgeResponse.knowledgePack, null);
    const previewBefore = await fetch(`${base}/projects/project-http-test/preview`).then((response) => response.json());
    assert.equal(previewBefore.preview.state, 'stopped');

    const generatedResponse = await fetch(`${base}/projects/project-http-test/generate`, { method: 'POST' });
    assert.equal(generatedResponse.status, 200);
    const generated = await generatedResponse.json();
    assert.equal(generated.project.state, 'generated');
    assert.ok(generated.project.workspacePath.startsWith(path.resolve(dirs.workspacesRoot) + path.sep));
    assert.equal(generated.composition.warnings.includes('knowledge-pack-not-provided'), true);

    const composition = await fetch(`${base}/projects/project-http-test/composition`).then((response) => response.json());
    assert.ok(composition.composition.pages.length > 0);
    const events = await fetch(`${base}/projects/project-http-test/events`).then((response) => response.json());
    assert.equal(events.events.at(-1).type, 'build.succeeded');
    const metrics = await fetch(`${base}/projects/project-http-test/metrics`).then((response) => response.json());
    assert.equal(metrics.metrics.eventCount, 4);
    const checkpoint = await fetch(`${base}/projects/project-http-test/checkpoint`).then((response) => response.json());
    assert.equal(checkpoint.checkpoint.projectId, 'project-http-test');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
