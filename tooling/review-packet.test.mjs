import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource, normalizeWebsite } from '../packages/content-intelligence/src/index.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { collectReviewPacket, writeReviewPacket } from './lib/review-packet.mjs';
import { validateGenuineBusinessEvidence } from './lib/genuine-business-evidence.mjs';

// A crawl with no network: the packet has to prove a source was ingested, and
// that proof must come from the pack rather than from the test asserting it.
function fakeWeb(pages) {
  return {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async (input) => {
      const body = pages[new URL(String(input)).pathname];
      if (body === undefined) return new Response('Not found', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) } });
    },
  };
}

const SUPPLIED = Buffer.from(JSON.stringify({
  company: {
    name: 'Harbour Joinery', legalName: 'Harbour Joinery Limited', description: 'Bespoke joinery workshop.',
    email: 'hello@harbourjoinery.test', phone: '0141 555 0111', address: '2 Dock Street, Glasgow',
    serviceAreas: ['Glasgow'],
    services: [{ name: 'Fitted kitchens', description: 'Designed, made and fitted in one workshop.' }, { name: 'Staircases' }],
  },
}));

function manifestFor() {
  return {
    schemaVersion: 2,
    project: { name: 'Harbour Joinery', slug: 'harbour-joinery', type: 'marketing-site', primaryGoal: 'Win bespoke joinery enquiries' },
    audience: { summary: 'Homeowners and architects', roles: [] },
    journeys: ['Understand the workshop', 'Request a quote'],
    majorSurfaces: ['Home', 'Services', 'Contact'],
    entities: ['Enquiry'],
    company: { identity: {}, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: [] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { accentColor: '#2f4858', designControl: 'sensible-defaults' },
    inputs: { inventory: ['existing website', 'PDFs/docs'], existingWebsite: 'https://harbourjoinery.test/', sources: [] },
    constraints: { tenantModel: '', integrations: [], existingData: [], uploadTypes: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

async function ingestedProject(service, projectId, cacheDir) {
  const web = fakeWeb({
    '/': '<html><head><title>Harbour Joinery</title><meta name="description" content="Bespoke joinery"><link rel="canonical" href="https://harbourjoinery.test/"></head><body><h1>Bespoke joinery</h1><p>Call 0141 555 0111</p><a href="/services">Services</a></body></html>',
    '/services': '<html><head><title>Services | Harbour Joinery</title><link rel="canonical" href="https://harbourjoinery.test/services"></head><body><h1>Services</h1><p>Fitted kitchens and staircases.</p></body></html>',
  });
  const website = await normalizeWebsite('https://harbourjoinery.test/', { ...web, cacheDir, maxPages: 3 });
  const supplied = await normalizeSource({
    data: SUPPLIED, name: 'company.json', label: 'Approved company data', kind: 'document',
    mimeType: 'application/json', provenance: 'user-supplied', purpose: 'approved company profile', approvedForUse: true,
  }, { cacheDir });
  const pack = assertKnowledgePack(buildKnowledgePack([...website, supplied]));
  const project = service.createProject({ id: projectId, manifest: manifestFor(), knowledgePack: pack });
  // The same retention the service performs when the Console uploads a file.
  service.ingestion.retainOriginal(projectId, { data: SUPPLIED, name: 'company.json' });
  return { project, pack, supplied };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces'), cacheDir: path.join(root, 'cache') };
}

test('the review packet assembles everything the run can prove and nothing a person must judge', async () => {
  const dirs = roots('app-builder-review-packet-');
  const store = new FactoryStore(dirs);
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const { project } = await ingestedProject(service, 'project-harbour-joinery', dirs.cacheDir);
    const bundle = service.approveIntake({
      projectType: 'marketing-site',
      mode: 'quick',
      answers: {
        project_name: 'Harbour Joinery', primary_goal: 'Win bespoke joinery enquiries', target_users: 'Homeowners and architects',
        must_have: ['Understand the workshop', 'Request a quote'],
        company_identity: { name: 'Harbour Joinery', description: 'Bespoke joinery workshop.' },
        services: ['Fitted kitchens', 'Staircases'],
      },
    });
    store.upsertProject({ ...store.getProject(project.id), intakeBundle: bundle, updatedAt: new Date().toISOString() });
    await service.generateProject(project.id);
    for (const type of ['quality.install.succeeded', 'quality.check.succeeded', 'quality.build.succeeded', 'quality.succeeded']) {
      await service.recordOperationalEvent(project.id, type, { workspace: service.getProject(project.id).workspacePath }, { durationMs: 100 });
    }
    await service.recordOperationalEvent(project.id, 'preview.started', { path: `/preview/${project.id}/` });

    const outDir = path.join(dirs.root, 'packet');
    const packet = collectReviewPacket({ service, projectId: project.id, factoryCommit: '0'.repeat(40), outDir });
    writeReviewPacket(service, packet);

    // Every journey the ledger can prove, and deploy honestly not-applicable.
    assert.deepEqual(packet.evidence.journeys, {
      intake: 'passed', buildContract: 'passed', manifest: 'passed', ingest: 'passed',
      compose: 'passed', generate: 'passed', verify: 'passed', preview: 'passed', deploy: 'not-applicable',
    });

    // The source ledger is the knowledge pack's, so it cannot name a crawl that
    // did not happen.
    const website = packet.evidence.sources.find((source) => source.kind === 'website');
    assert.ok(website, 'the crawled site must appear as a website source');
    assert.match(website.sha256, /^[0-9a-f]{64}$/);
    // The hash is the pack's own record of the crawl, which is the check that
    // stopped a run naming a site the crawler never reached.
    const packHashes = new Set(service.getKnowledgePack(project.id).sources.map((source) => source.contentHash));
    for (const source of packet.evidence.sources) assert.equal(packHashes.has(source.sha256), true, source.id);
    const supplied = packet.evidence.sources.find((source) => source.kind === 'document');
    assert.equal(supplied.provenance, 'user-supplied');
    // Retained originals make the packet self-contained.
    assert.equal(supplied.uri.startsWith('sources/'), true);
    assert.equal(fs.readFileSync(path.join(outDir, supplied.uri)).equals(SUPPLIED), true);

    // Artifacts are copied and hashed beside the evidence, as the contract asks.
    for (const [name, artifact] of Object.entries(packet.evidence.artifacts)) {
      const target = path.join(outDir, artifact.path);
      assert.ok(fs.existsSync(target), `${name} must be written into the packet`);
    }
    assert.ok(fs.existsSync(path.join(outDir, 'generated-app/package.json')));
    // The machinery around a repository is not evidence.
    assert.equal(fs.existsSync(path.join(outDir, 'generated-app/node_modules')), false);

    // The packet refuses to be a review. The draft cannot validate.
    assert.equal(Object.hasOwn(packet.evidence, 'productReview'), false);
    assert.equal(Object.hasOwn(packet.evidence, 'manualEdits'), false);
    const draftErrors = validateGenuineBusinessEvidence(packet.evidence, { evidenceFile: path.join(outDir, 'evidence.draft.json') });
    assert.equal(draftErrors.some((error) => error.includes('productReview')), true);
    assert.equal(draftErrors.some((error) => error.includes('manualEdits')), true);

    // Once a person supplies the judgement, the machine half is complete: the
    // only complaints left are the ones that say this fixture is not a real
    // business, which is exactly what the gate is for.
    const completed = {
      ...packet.evidence,
      productReview: {
        launchable: true,
        reviewer: 'Acceptance reviewer',
        notes: 'Checked every claim against the approved company data, looked at all three routes on desktop and on a phone, and read the contact copy aloud. Nothing on the site asserts anything the sources do not support.',
        checks: { factualAccuracy: 'passed', brandFit: 'passed', visualQuality: 'passed', responsiveQuality: 'passed', accessibility: 'passed' },
      },
      manualEdits: { total: 1, targetMaximum: 20, entries: [{ category: 'content', description: 'Reworded the hero subheading.', meaningful: true }] },
    };
    const remaining = validateGenuineBusinessEvidence(completed, { evidenceFile: path.join(outDir, 'evidence.draft.json') });
    for (const error of remaining) {
      // Every remaining complaint is the gate refusing a synthetic host. The
      // `.test` TLD is not a public host, so the primary URL, the website
      // source and the pack cross-check all resolve to nothing — which is what
      // this gate is for. The cross-check itself is proved above, against the
      // pack's own hashes, so widening it here masks nothing.
      assert.match(error, /primaryUrl|public website source|primary website|is not a real public URL|does not match the ingested page/, `unexpected machine-side gap: ${error}`);
    }
    assert.equal(remaining.length > 0, true);

    // This run captured nothing, and the packet says so rather than implying a
    // review could judge what it rendered.
    assert.equal(packet.missing.some((entry) => /No rendered evidence/.test(entry)), true);

    // The reviewer gets something to read, and it does not pretend to judge.
    const review = fs.readFileSync(path.join(outDir, 'REVIEW.md'), 'utf8');
    assert.match(review, /Product review packet — Harbour Joinery/);
    assert.match(review, /the verdict is yours/);
    assert.match(review, /Factual accuracy/);
    assert.match(review, /productReview\.reviewer/);
    assert.equal(/launchable: true/.test(review), false);
  } finally {
    await service.close();
    store.close();
  }
});

test('a run that did not happen cannot produce a packet that says it did', async () => {
  const dirs = roots('app-builder-review-packet-empty-');
  const store = new FactoryStore(dirs);
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-unstarted', manifest: manifestFor() });
    const outDir = path.join(dirs.root, 'packet');
    const packet = collectReviewPacket({ service, projectId: project.id, factoryCommit: '0'.repeat(40), outDir });
    writeReviewPacket(service, packet);

    assert.equal(packet.evidence.journeys.ingest, undefined);
    assert.equal(packet.evidence.journeys.generate, undefined);
    assert.equal(packet.evidence.sources.length, 0);
    for (const expected of [/No knowledge pack/, /No composition/, /No approved intake bundle/, /No generated workspace/, /No rendered evidence/, /No website source was ingested/]) {
      assert.equal(packet.missing.some((entry) => expected.test(entry)), true, String(expected));
    }
    assert.equal(validateGenuineBusinessEvidence(packet.evidence, { evidenceFile: path.join(outDir, 'evidence.draft.json') }).length > 0, true);
    assert.match(fs.readFileSync(path.join(outDir, 'REVIEW.md'), 'utf8'), /This run cannot be validated yet/);
  } finally {
    await service.close();
    store.close();
  }
});

test('the reviewer gets the pictures, not a pointer at a running factory', async () => {
  const dirs = roots('app-builder-review-packet-captures-');
  const store = new FactoryStore(dirs);
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-captured', manifest: manifestFor() });
    // Capturing needs a browser; what is under test here is the packet, so the
    // two readers it uses stand in for one that already ran.
    const set = {
      id: 'evidence-abc', projectId: project.id, buildRef: 'build-1', compositionHash: 'hash', capturedAt: new Date().toISOString(),
      viewports: [{ name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1 }],
      captures: [{ id: 'capture-1', evidenceKind: 'visual', pageId: 'home', route: '/', viewport: 'desktop', state: { axis: 'viewport', state: 'desktop', risk: 'low', proves: 'How / renders at 1280px.' }, file: 'captures/home-desktop.png', contentHash: 'abc', byteSize: 3, elementRefs: [] }],
      uncovered: [{ route: '/', axis: 'data', state: 'empty', risk: 'low', reason: 'needs-a-deterministic-fixture' }],
      setHash: 'set-hash',
    };
    service.listRenderedEvidence = () => [set];
    service.readRenderedCapture = () => ({ capture: set.captures[0], bytes: Buffer.from('png') });

    const outDir = path.join(dirs.root, 'packet');
    const packet = collectReviewPacket({ service, projectId: project.id, factoryCommit: '0'.repeat(40), outDir });
    const written = writeReviewPacket(service, packet);

    assert.equal(written.renderedCaptures, 1);
    assert.equal(fs.readFileSync(path.join(outDir, 'rendered-evidence/evidence-abc/captures/home-desktop.png'), 'utf8'), 'png');
    const review = fs.readFileSync(path.join(outDir, 'REVIEW.md'), 'utf8');
    assert.match(review, /\[\/ · desktop · viewport\/desktop\]\(rendered-evidence\/evidence-abc\/captures\/home-desktop\.png\)/);
    // And what the pictures do not prove is named beside them.
    assert.match(review, /not\*\* proven by a picture/);
    assert.match(review, /needs-a-deterministic-fixture/);
  } finally {
    await service.close();
    store.close();
  }
});
