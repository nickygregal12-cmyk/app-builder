import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';
import { parseSourceRequests } from '../apps/service/src/ingestion.js';
import { deriveSourceGovernance } from '../packages/content-intelligence/src/index.js';

function manifest(slug = 'ingest-test') {
  return {
    schemaVersion: 2,
    project: { name: 'Ingest Test', slug, type: 'marketing-site', primaryGoal: 'Prove service-owned source ingestion.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Ingest Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
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

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

function base64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

const brochure = [
  '# Kelvin Joinery',
  '',
  'Kelvin Joinery is a family joinery workshop in Glasgow.',
  '',
  'Email: hello@kelvinjoinery.example',
  'Phone: 0141 555 0100',
  '',
  'Services: kitchen fitting, staircases, sash window repair.',
].join('\n');

test('service ingestion normalises supplied files into the project knowledge pack', async () => {
  const dirs = roots('app-builder-ingest-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-ingest', manifest: manifest() });
    assert.equal(service.getKnowledgePack(project.id), null);

    const result = await service.ingestSources(project.id, parseSourceRequests([
      { name: 'brochure.md', mimeType: 'text/markdown', contentBase64: base64(brochure), purpose: 'Company brochure', approvedForUse: true },
    ]));

    assert.equal(result.task.state, 'succeeded');
    assert.equal(result.knowledge.sources.length, 1);
    assert.ok(result.knowledge.factCount > 0, 'a real document should produce source-backed facts');
    assert.equal(result.project.knowledgePackHash, result.knowledge.packHash);

    const [source] = result.knowledge.sources;
    assert.equal(source.provenance, 'user-supplied');
    assert.equal(source.rightsStatus, 'approved-for-use');
    assert.equal(source.assetStatus, 'approved');
    assert.equal(source.publishUseAllowed, true);
    assert.equal(source.instructionAuthority, 'none', 'imported content never carries instruction authority');

    const pack = service.getKnowledgePack(project.id);
    assert.equal(pack.packHash, result.knowledge.packHash);
    assert.ok(pack.facts.every((fact) => pack.sources.some((entry) => entry.id === fact.sourceId)));

    assert.deepEqual(service.listEvents(project.id).map((event) => event.type), ['sources.ingestion.started', 'sources.ingested']);
    assert.match(service.latestCheckpoint(project.id).nextAction, /generate the project/i);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('ingestion is additive and identical bytes are not ingested twice', async () => {
  const dirs = roots('app-builder-ingest-additive-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-additive', manifest: manifest('additive') });
    await service.ingestSources(project.id, parseSourceRequests([
      { name: 'brochure.md', mimeType: 'text/markdown', contentBase64: base64(brochure), approvedForUse: true },
    ]));
    const second = await service.ingestSources(project.id, parseSourceRequests([
      { name: 'brochure.md', mimeType: 'text/markdown', contentBase64: base64(brochure), approvedForUse: true },
      { name: 'services.md', mimeType: 'text/markdown', contentBase64: base64('# Services\n\nSash window repair across the west end.'), approvedForUse: true },
    ]));
    assert.equal(second.knowledge.sources.length, 2, 'earlier material survives and duplicates collapse');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('ingested knowledge reaches generation, and later material reaches a fresh build', async () => {
  const dirs = roots('app-builder-ingest-generate-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-ingest-generate', manifest: manifest('ingest-generate') });
    await service.ingestSources(project.id, parseSourceRequests([
      { name: 'brochure.md', mimeType: 'text/markdown', contentBase64: base64(brochure), purpose: 'Company brochure', approvedForUse: true },
    ]));

    const generated = await service.generateProject(project.id);
    assert.equal(generated.project.state, 'generated');
    const composition = JSON.parse(fs.readFileSync(path.join(generated.workspace, '.app-builder/composition.json'), 'utf8'));
    assert.ok(composition.pages.length > 0);

    // The brochure's contact detail exists nowhere in the manifest, so finding
    // it in the composition proves ingested knowledge is a real generation
    // input rather than a stored artifact.
    const serialised = JSON.stringify(composition);
    assert.match(serialised, /hello@kelvinjoinery\.example/);

    // Material can still arrive after a build. It reaches the product through a
    // fresh build rather than by mutating the repository someone may already be
    // reviewing.
    await service.ingestSources(project.id, parseSourceRequests([
      { name: 'accreditations.md', mimeType: 'text/markdown', contentBase64: base64('# Accreditations\n\nEmail: certified@kelvinjoinery.example'), approvedForUse: true },
    ]));
    const rebuilt = await service.generateProject(project.id);
    assert.notEqual(rebuilt.workspace, generated.workspace, 'a rebuild never overwrites the previous build');
    assert.ok(fs.existsSync(generated.workspace), 'the previous build stays on disk for comparison');

    const checkpoints = service.listCheckpoints(project.id);
    assert.deepEqual(
      checkpoints.filter((checkpoint) => checkpoint.summary.startsWith('Build v')).map((checkpoint) => checkpoint.repoRef),
      [generated.workspace, rebuilt.workspace],
    );
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('the HTTP facade ingests declared sources and refuses filesystem paths', async () => {
  const dirs = roots('app-builder-ingest-http-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  const server = createFactoryHttpServer({ service });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await fetch(`${origin}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'project-http-ingest', manifest: manifest('http-ingest') }),
    });

    const tools = await fetch(`${origin}/tools`).then((response) => response.json());
    assert.ok(tools.tools.some((tool) => tool.name === 'project.sources.ingest' && tool.mutating));

    const ingested = await fetch(`${origin}/projects/project-http-ingest/sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sources: [{ name: 'brochure.md', mimeType: 'text/markdown', contentBase64: base64(brochure), approvedForUse: true }] }),
    }).then((response) => response.json());
    assert.equal(ingested.knowledge.sources.length, 1);

    const read = await fetch(`${origin}/projects/project-http-ingest/sources`).then((response) => response.json());
    assert.equal(read.knowledge.packHash, ingested.knowledge.packHash);

    for (const body of [
      { sources: [{ filePath: '/etc/passwd' }] },
      { sources: [{ uri: 'file:///etc/passwd' }] },
      { sources: [] },
      { sources: [{ name: 'x.md', contentBase64: base64('x'), rightsStatus: 'whatever' }] },
    ]) {
      const rejected = await fetch(`${origin}/projects/project-http-ingest/sources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(rejected.status, 400, `expected a client error for ${JSON.stringify(body)}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('remote ingestion cannot be pointed at private-network addresses and fails as a durable task', async () => {
  const dirs = roots('app-builder-ingest-site-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  const site = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<html><head><title>Kelvin Joinery</title></head><body><h1>Kelvin Joinery</h1><p>Glasgow joinery workshop.</p></body></html>');
  });
  try {
    await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
    const siteUrl = `http://127.0.0.1:${site.address().port}/`;
    const project = service.createProject({ id: 'project-site', manifest: manifest('site') });

    // A local server stands in for any private-network address. The
    // content-intelligence guard refuses it, and the refusal has to land as a
    // failed durable task rather than a silent no-op.
    await assert.rejects(() => service.ingestSources(project.id, parseSourceRequests([{ uri: siteUrl }])), /private|loopback|not allowed|blocked|unsafe/i);
    assert.equal(service.listTasks(project.id).at(-1).state, 'failed');
    assert.deepEqual(service.listEvents(project.id).map((event) => event.type), ['sources.ingestion.started', 'sources.ingestion.failed']);
  } finally {
    await new Promise((resolve) => site.close(resolve));
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('a public web page is reference-only until the operator declares reuse rights', () => {
  const page = { uri: 'https://kelvinjoinery.example/about', provenance: 'existing-site', purpose: 'existing-site page' };
  const observed = deriveSourceGovernance(page, 'url');
  assert.equal(observed.rightsStatus, 'reference-only');
  assert.equal(observed.assetStatus, 'do-not-use');
  assert.equal(observed.publishUseAllowed, false, 'publicly visible is not approved to republish');

  const declared = deriveSourceGovernance({ ...page, approvedForUse: true }, 'url');
  assert.equal(declared.rightsStatus, 'approved-for-use');
  assert.equal(declared.publishUseAllowed, true);
  assert.equal(declared.instructionAuthority, 'none');
});
