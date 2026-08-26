import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource } from '../packages/content-intelligence/src/index.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';

/**
 * The candidate lifecycle as the service runs it.
 *
 * Deliberately no browser. Evidence capture needs one and is proved by the
 * genuine-business acceptance; everything here — what a set is made of, what it
 * refuses, what promotion does to the project and what it does to the
 * workspaces — is decided before a browser would open.
 */

function projectManifest(overrides = {}) {
  const manifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
  manifest.project.type = 'marketing-site';
  return { ...manifest, ...overrides };
}

/**
 * A real knowledge pack rather than a shaped literal.
 *
 * The service validates the pack contract, and rightly: a fixture that skips
 * normalisation would let a candidate be generated from a pack no ingestion
 * could produce. This goes through the ordinary path — approved company data,
 * and photographs with real bytes and real variants.
 */
async function knowledgePack({ photographs = 0, cacheDir, assetOutputDir } = {}) {
  const company = await normalizeSource({
    data: Buffer.from(JSON.stringify({
      company: {
        name: 'Kilbride Retrofit',
        legalName: 'Kilbride Retrofit Limited',
        description: 'Whole-house retrofit for period properties.',
        email: 'hello@example-business.test',
        phone: '0141 555 0101',
        serviceAreas: ['Glasgow', 'Renfrewshire'],
        services: [
          { name: 'Home survey', description: 'A whole-house assessment before any work starts.' },
          { name: 'Retrofit installation', description: 'Fabric-first improvements fitted by our own team.' },
        ],
      },
    })),
    name: 'company.json',
    label: 'Approved company data',
    kind: 'document',
    mimeType: 'application/json',
    provenance: 'user-supplied',
    purpose: 'approved company profile',
  }, { cacheDir });

  const sources = [company];
  for (let index = 0; index < photographs; index += 1) {
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 120 + index * 8, g: 130, b: 140 } } }).jpeg().toBuffer();
    sources.push(await normalizeSource({
      data: bytes,
      name: `project-${index}.jpg`,
      label: `Completed retrofit ${index + 1}`,
      kind: 'image',
      provenance: 'user-supplied',
      approvedForUse: true,
    }, { cacheDir, assetOutputDir, assetUriPrefix: 'assets' }));
  }
  return assertKnowledgePack(buildKnowledgePack(sources, { project: { name: 'Kilbride Retrofit', type: 'marketing-site' } }));
}

async function withService(name, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `app-builder-${name}-`));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), stateRoot: path.join(root, 'state') });
  const pack = (photographs) => knowledgePack({ photographs, cacheDir: path.join(root, 'cache'), assetOutputDir: path.join(root, 'assets') });
  try {
    await run({ service, store, root, pack });
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function bindingsOf(composition) {
  return Object.fromEntries(composition.sections.map((section) => [section.id, JSON.stringify(section.bindings)]));
}

test('a candidate set is several presentations of one truth, each a real repository', async () => {
  await withService('candidates', async ({ service, pack }) => {
    const project = service.createProject({ id: 'project-candidates', manifest: projectManifest(), knowledgePack: await pack(3) });
    await service.generateProject(project.id);

    const set = await service.generateVisualCandidates(project.id);
    assert.ok(set.candidates.length >= 2, 'one candidate is not a choice');
    assert.equal(set.diversity.distinct, true);
    assert.equal(set.promotedCandidateId, null);

    const baseline = service.frozenProductTruth(project.id).composition;
    const truth = bindingsOf(baseline);
    for (const candidate of set.candidates) {
      assert.ok(fs.existsSync(path.join(candidate.workspace, 'package.json')), `${candidate.candidateId} has no repository`);
      const composed = JSON.parse(fs.readFileSync(path.join(candidate.workspace, '.app-builder/composition.json'), 'utf8'));
      assert.deepEqual(bindingsOf(composed), truth, `${candidate.candidateId} says something the project did not`);
      const spec = JSON.parse(fs.readFileSync(path.join(candidate.workspace, '.product/design-system.json'), 'utf8'));
      assert.equal(spec.visualDirection, candidate.directionId);
      assert.equal(candidate.state, 'draft');
      assert.equal(candidate.gate.status, 'not-run', 'a candidate has no gate status before it has been linted');
    }

    // Every candidate is structurally distinct from every other.
    const shells = set.candidates.map((candidate) => JSON.parse(fs.readFileSync(path.join(candidate.workspace, '.product/design-system.json'), 'utf8')).layout.shellClasses);
    assert.equal(new Set(shells).size, shells.length);
  });
});

test('a second undecided set is refused, so a project never has two open choices', async () => {
  await withService('one-set', async ({ service, pack }) => {
    const project = service.createProject({ id: 'project-one-set', manifest: projectManifest(), knowledgePack: await pack(3) });
    await service.generateProject(project.id);
    await service.generateVisualCandidates(project.id);
    await assert.rejects(() => service.generateVisualCandidates(project.id), /already has an undecided candidate set/);
  });
});

test('a project with no publishable photography is offered directions that do not need any', async () => {
  await withService('no-imagery', async ({ service, pack }) => {
    const project = service.createProject({ id: 'project-no-imagery', manifest: projectManifest(), knowledgePack: await pack(0) });
    await service.generateProject(project.id);
    const set = await service.generateVisualCandidates(project.id);

    assert.equal(set.assetReadiness.strategy, 'typography-led');
    assert.equal(set.assetReadiness.supportsImageryLed, false);
    const refusal = set.refusedDirections.find((entry) => entry.directionId === 'immersive-lead');
    assert.equal(refusal?.reason, 'imagery-not-available');
    assert.equal(set.candidates.some((candidate) => candidate.directionId === 'immersive-lead'), false);
    assert.ok(set.candidates.length >= 2, 'refusing an imagery-led direction must still leave a real choice');
  });
});

test('the review packet separates what a rule settled from what needs judgement', async () => {
  await withService('packet', async ({ service, pack }) => {
    const project = service.createProject({ id: 'project-packet', manifest: projectManifest(), knowledgePack: await pack(3) });
    await service.generateProject(project.id);
    const set = await service.generateVisualCandidates(project.id);
    const packet = service.visualReviewPacket(project.id, set.candidates[0].candidateId);

    const settled = new Set(['accent-contrast', 'reduced-motion-required', 'repetitive-section-presentation', 'competing-primary-actions', 'uniform-page-rhythm']);
    for (const criterion of packet.criteria) assert.equal(settled.has(criterion.id), false, `${criterion.id} is something a rule already decides`);
    assert.ok(packet.criteria.some((criterion) => criterion.id === 'distinctiveness'));
    assert.ok(packet.criteria.some((criterion) => criterion.id === 'responsive-quality'));
    assert.ok(Array.isArray(packet.settledByRules));
    assert.ok(Array.isArray(packet.mustAddress));
    // The other candidates are named, so a critic compares rather than scores in isolation.
    assert.equal(packet.siblings.length, set.candidates.length - 1);
  });
});

test('promotion makes one candidate the project, and leaves no forks behind', async () => {
  await withService('promote', async ({ service, pack }) => {
    const project = service.createProject({ id: 'project-promote', manifest: projectManifest(), knowledgePack: await pack(3) });
    await service.generateProject(project.id);
    let set = await service.generateVisualCandidates(project.id);
    const workspaces = set.candidates.map((candidate) => candidate.workspace);
    const winner = set.candidates[1];

    // A candidate cannot be promoted before it has been reviewed.
    await assert.rejects(() => service.promoteVisualCandidate(project.id, winner.candidateId, { promotedBy: 'design-critic' }), /no passing visual review/);

    // Move each candidate through evidence and review the way capture would.
    set = service.writeVisualCandidateSet(project.id, {
      ...set,
      candidates: set.candidates.map((candidate) => ({
        ...candidate,
        state: 'deterministic-pass',
        gate: { status: 'clear', blocking: [], mustAddress: [] },
        designLint: { findings: [], counts: { violation: 0, warning: 0, recommendation: 0 }, clean: true },
        evidenceId: `evidence-${'0'.repeat(16)}`,
      })),
    });
    for (const candidate of set.candidates) {
      const wins = candidate.candidateId === winner.candidateId;
      const criteria = service.visualReviewPacket(project.id, candidate.candidateId).criteria;
      await service.recordVisualCandidateReview(project.id, candidate.candidateId, {
        verdict: wins ? 'pass' : 'rework',
        reviewedBy: 'design-critic',
        addressedRules: [],
        rationale: 'Reviewed against the scoped criteria.',
        // A verdict now carries a score against every criterion it was scoped,
        // because the professional bar has to have something to read.
        criterionScores: criteria.map((criterion) => ({ criterion: criterion.id, score: wins ? 9 : 7 })),
        failingCriteria: wins ? [] : ['distinctiveness'],
      });
    }

    const promoted = await service.promoteVisualCandidate(project.id, winner.candidateId, { promotedBy: 'design-critic', rationale: 'Reads as the practice it is for.' });
    assert.equal(promoted.promotedCandidateId, winner.candidateId);
    assert.equal(promoted.candidates.filter((candidate) => candidate.outcome === 'promoted').length, 1);
    assert.equal(promoted.candidates.filter((candidate) => candidate.outcome === 'pending').length, 0);

    // The decision survives as a durable design choice, and the project's own
    // next build renders it.
    assert.equal(service.readDesignChoices(project.id).choices.visualDirection, winner.directionId);
    const rebuilt = await service.generateProject(project.id);
    const spec = JSON.parse(fs.readFileSync(path.join(rebuilt.workspace, '.product/design-system.json'), 'utf8'));
    assert.equal(spec.visualDirection, winner.directionId);
    assert.equal(spec.artDirection.dimensions.heroStrategy, winner.artDirection.dimensions.heroStrategy);

    // No workspace survives the decision, the promoted one included.
    for (const workspace of workspaces) assert.equal(fs.existsSync(workspace), false, `${workspace} outlived the decision that closed it`);
    for (const candidate of promoted.candidates) assert.equal(candidate.workspace, null);
    // The evidence and the reasons do survive.
    assert.ok(promoted.candidates.every((candidate) => candidate.evidenceId));
    assert.ok(promoted.candidates.filter((candidate) => candidate.outcome === 'rejected').every((candidate) => candidate.rationale));

    // And a generated repository is still an ordinary one.
    const packageJson = JSON.parse(fs.readFileSync(path.join(rebuilt.workspace, 'package.json'), 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    assert.equal(Object.keys(dependencies).some((name) => name.startsWith('@app-builder/')), false);
  });
});

test('a promoted set records the decision in the project ledger', async () => {
  await withService('ledger', async ({ service, pack }) => {
    const project = service.createProject({ id: 'project-ledger', manifest: projectManifest(), knowledgePack: await pack(3) });
    await service.generateProject(project.id);
    const set = await service.generateVisualCandidates(project.id);
    const types = service.listEvents(project.id).map((event) => event.type);
    assert.ok(types.includes('visual.candidates.generated'));
    const event = service.listEvents(project.id).find((entry) => entry.type === 'visual.candidates.generated');
    assert.equal(event.payload.setId, set.setId);
    assert.equal(event.payload.baselineCompositionHash, set.frozenTruth.baselineCompositionHash);
  });
});
