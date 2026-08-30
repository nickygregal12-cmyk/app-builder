/**
 * The candidate lane must judge the product the factory would really build.
 *
 * Every Phase 4D candidate that has been independently scored was composed with
 * `knowledgePack = null`: the lane replayed an approved intake and went straight
 * to generation, so composition fell back to bare manifest values while the
 * business's own approved sources sat unread. Two reviews then called the output
 * thin. These tests hold the corrected contract and, more importantly, hold the
 * old failure planted so it cannot come back quietly.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { classifyCandidateTruthReadiness } from './lib/candidate-truth-readiness.mjs';
import { compileAssetReadiness } from './lib/asset-readiness.mjs';

const BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';
const KNOWLEDGE = 'examples/genuine-business/nbm-approved-knowledge.v1.json';
const MGB_BUNDLE = 'examples/genuine-business/mgb-approved-intake.v1.json';
const CREATOR = { role: 'visual-direction', vendor: 'anthropic', model: 'claude-opus-5' };

const readBundle = () => JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
const readPack = () => JSON.parse(fs.readFileSync(KNOWLEDGE, 'utf8'));

async function withService(name, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `app-builder-${name}-`));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), stateRoot: path.join(root, 'state') });
  try {
    await run({ service, store, root });
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function servicesSection(composition) {
  return composition.sections.find((section) => section.id === 'page-home-services');
}

function binding(section, key) {
  return section.bindings.find((entry) => entry.key === key);
}

test('the frozen knowledge pack matches its own recorded identity', () => {
  const pack = readPack();
  // A frozen artefact whose hash does not describe its bytes is not frozen, and
  // every candidate identity downstream would inherit the lie.
  const withoutHash = { ...pack };
  delete withoutHash.packHash;
  const computed = createHash('sha256').update(JSON.stringify(withoutHash)).digest('hex');
  assert.equal(computed, pack.packHash);
  assert.ok(pack.sources.length > 0, 'a frozen pack with no sources would prove nothing');
  assert.ok(pack.facts.length > 0, 'a frozen pack with no facts would compose no differently to none at all');
});

test('a reference-only source contributes facts but never its page body', () => {
  const pack = readPack();
  const referenceOnly = pack.sources.filter((source) => source.publishUseAllowed === false);
  assert.ok(referenceOnly.length > 0, 'nbm declares its public site reference-only; the fixture should still contain it');
  const referenceIds = new Set(referenceOnly.map((source) => source.id));

  // Public visibility is not a republication right, and this repository is
  // public. The crawl corroborates facts; it does not get to ship prose.
  const bodies = pack.content.filter((record) => referenceIds.has(record.sourceId));
  assert.deepEqual(bodies, [], 'reference-only page bodies must not be stored in the frozen pack');

  const facts = pack.facts.filter((fact) => referenceIds.has(fact.sourceId));
  assert.ok(facts.length > 0, 'the reference-only sources should still yield corroborated facts');
  for (const fact of facts) {
    assert.ok(fact.sourceId, 'every retained fact keeps the source it came from');
    assert.ok(fact.provenance, 'every retained fact keeps its provenance');
  }
});

test('replaying an approved intake with its frozen pack composes source-backed content', async () => {
  await withService('source-backed', async ({ service }) => {
    const pack = readPack();
    const { project } = await service.replayIntakeBundle(readBundle(), { knowledgePack: pack });
    const { composition, frozenTruth } = service.frozenProductTruth(project.id);

    // Identity first: a candidate set is only comparable if it records which
    // truth it was composed from.
    assert.equal(frozenTruth.knowledgeSource, 'ingested-knowledge-pack');
    assert.equal(frozenTruth.knowledgePackHash, pack.packHash);
    assert.ok(!composition.warnings.includes('knowledge-pack-not-provided'));

    // Then the content the reviews actually complained about.
    const services = servicesSection(composition);
    const items = binding(services, 'items');
    assert.equal(items.origin, 'knowledge-entity', 'services should come from ingested material, not bare manifest names');
    assert.equal(services.variant, 'cards');
    assert.ok(items.entityIds.length > 0, 'each service should be attributable to a knowledge entity');
    for (const item of items.value) {
      assert.ok(item.description, `service ${item.name} should carry an approved description`);
    }

    // The third declared conversion goal stops being unsupported once the
    // sources are read.
    assert.ok(!composition.warnings.includes('declared-conversion-unsupported:email'));
    assert.match(JSON.stringify(composition), /info@nbm\.bz/);
  });
});

test('the same run without the pack is refused, because a reviewer would judge an incomplete truth', async () => {
  await withService('starved', async ({ service }) => {
    // The planted regression: exactly what the lane used to do.
    const { project } = await service.replayIntakeBundle(readBundle());
    const { composition, frozenTruth } = service.frozenProductTruth(project.id);

    // The starved state reproduces before the guard is consulted, so this test
    // fails loudly if the defect stops being reachable rather than passing by
    // accident.
    assert.equal(frozenTruth.knowledgeSource, 'approved-manifest-only');
    assert.equal(frozenTruth.knowledgePackHash, null);
    assert.ok(composition.warnings.includes('knowledge-pack-not-provided'));

    const declared = readBundle().projectManifest.inputs.sources;
    assert.ok(declared.length > 0, 'the guard is only meaningful when the business declared real sources');

    await assert.rejects(
      () => service.generateVisualCandidates(project.id, { createdBy: CREATOR }),
      (error) => {
        // It must fail for the intended reason, not on a later browser run, a
        // missing field or an unrelated schema error.
        assert.match(error.message, /declares \d+ approved source\(s\)/);
        assert.match(error.message, /knowledge-pack-not-provided/);
        assert.match(error.message, /incomplete product truth/);
        // The refusal names the source that went unread. It counts material
        // sources rather than declared ones, which is the correction: nbm
        // declares two, and only the workbook is content anyone could read.
        assert.match(error.message, /nbm-approved-workbook/);
        assert.doesNotMatch(error.message, /nbm-public-website/, 'a reference-only research location is not what starved this truth');
        return true;
      },
    );
  });
});

/**
 * The correction, and the case that forced it.
 *
 * MGB declares six sources and none of them is material. Under the count
 * predicate the only way past the guard was to freeze an empty knowledge pack —
 * an artefact that adds no truth and exists solely to satisfy the shape of a
 * check. These tests hold the semantic distinction instead, and hold the sham
 * pack planted so it cannot become the way through.
 */
test('a business whose only sources are research locations and unsupplied assets may generate candidates', async () => {
  await withService('mgb-approved-intake', async ({ service }) => {
    const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
    const { project } = await service.replayIntakeBundle(bundle);
    const { frozenTruth } = service.frozenProductTruth(project.id);

    // The starved-looking state is real and is not what is being waved through:
    // there genuinely is no pack, because there was never anything to ingest.
    assert.equal(frozenTruth.knowledgeSource, 'approved-manifest-only');
    assert.equal(frozenTruth.knowledgePackHash, null);

    const readiness = classifyCandidateTruthReadiness({ sources: bundle.projectManifest.inputs.sources });
    assert.equal(readiness.status, 'approved-intake-truth-with-source-gaps');
    assert.ok(readiness.readyForCandidates);
    assert.deepEqual(readiness.material, [], 'not one of mgb\'s six sources is content the run failed to read');
    assert.deepEqual(readiness.referenceOnlyResearch, ['mgb-facebook', 'mgb-instagram', 'mgb-companies-house-psc']);
    assert.deepEqual(readiness.assetRightsWithoutBytes, ['mgb-logo', 'mgb-project-photo-1', 'mgb-project-photo-2']);

    // And the run reaches generation without being handed a fake pack.
    const set = await service.generateVisualCandidates(project.id, { createdBy: CREATOR });
    assert.equal(set.truthReadiness.status, 'approved-intake-truth-with-source-gaps');
    assert.deepEqual(set.truthReadiness.assetRightsWithoutBytes, ['mgb-logo', 'mgb-project-photo-1', 'mgb-project-photo-2']);
  });
});

test('the candidate set never reports approved intake as externally verified truth', () => {
  const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
  const readiness = classifyCandidateTruthReadiness({ sources: bundle.projectManifest.inputs.sources });
  const notes = readiness.truthBasis.notes.join(' ');

  // The whole risk of allowing this run is that its candidates get read as
  // though somebody checked the facts. Nobody did.
  assert.match(notes, /owner-approved intake, not externally verified fact/);
  assert.match(notes, /No knowledge pack was ingested/);
  assert.match(notes, /supplied for research only/);
  assert.match(notes, /no supplied bytes/);
});

test('a public profile the owner listed never becomes an ingested fact', () => {
  const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
  const readiness = classifyCandidateTruthReadiness({ sources: bundle.projectManifest.inputs.sources });
  for (const id of ['mgb-facebook', 'mgb-instagram', 'mgb-companies-house-psc']) {
    const entry = readiness.classified.find((source) => source.id === id);
    assert.equal(entry.state, 'reference-only-research');
    assert.equal(entry.publishUseAllowed, false, 'public visibility is not a republication right');
    assert.ok(!readiness.material.includes(id), 'a place to look must never become required content');
  }
});

test('rights over a file the owner never sent stay an asset gap, not a publishable asset', () => {
  const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
  const readiness = classifyCandidateTruthReadiness({ sources: bundle.projectManifest.inputs.sources });
  for (const id of ['mgb-logo', 'mgb-project-photo-1', 'mgb-project-photo-2']) {
    const entry = readiness.classified.find((source) => source.id === id);
    assert.equal(entry.rightsStatus, 'approved-for-use', 'the owner did approve prototype use');
    assert.equal(entry.state, 'asset-right-without-bytes', 'and the bytes still never arrived');
    assert.equal(entry.publishUseAllowed, false, 'so nothing derived from it is publishable');
  }
  // Asset readiness has to reach the same conclusion, or a direction could be
  // chosen for photographs that do not exist.
  const strategy = compileAssetReadiness({ knowledgePack: null, assetDecisions: [] });
  assert.equal(strategy.supportsImageryLed, false);
  assert.equal(strategy.strategy, 'typography-led');
});

test('an empty knowledge pack does not buy a way past the guard', async () => {
  await withService('sham-pack', async ({ service }) => {
    const pack = readPack();
    // The obvious way around a source-backed check: hand over a pack that is
    // shaped like evidence and contains none. It sets knowledgeSource to
    // 'ingested-knowledge-pack', which is exactly what the old predicate read.
    const sham = { ...pack, sources: [], facts: [], content: [], chunks: [] };
    const { project } = await service.replayIntakeBundle(readBundle(), { knowledgePack: sham });
    const { frozenTruth } = service.frozenProductTruth(project.id);
    assert.equal(frozenTruth.knowledgeSource, 'ingested-knowledge-pack', 'the sham reproduces: the old guard would have been satisfied here');

    await assert.rejects(
      () => service.generateVisualCandidates(project.id, { createdBy: CREATOR }),
      (error) => {
        assert.match(error.message, /incomplete product truth/);
        assert.match(error.message, /nbm-approved-workbook/);
        return true;
      },
    );
  });
});

test('a pack that lists a source but carries nothing from it is still an unread source', () => {
  const pack = readPack();
  // Subtler than an empty pack, and the reason coverage is measured by what a
  // source contributed rather than by whether it is named.
  const listedOnly = { ...pack, facts: [], content: [], chunks: [] };
  const readiness = classifyCandidateTruthReadiness({
    sources: readBundle().projectManifest.inputs.sources,
    knowledgePack: listedOnly,
  });
  assert.equal(readiness.status, 'material-source-unread');
  assert.equal(readiness.readyForCandidates, false);
  assert.match(readiness.truthBasis.notes.join(' '), /contributed no fact, content or chunk/);
});

test('a future intake that declares material and ignores it is refused', async () => {
  await withService('material-ignored', async ({ service }) => {
    const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
    // Exactly the shape the guard exists for, on a business that is otherwise
    // allowed: one owner-approved document, carrying content, never read.
    bundle.projectManifest.inputs.sources.push({
      id: 'mgb-brochure',
      kind: 'document',
      label: 'MGB services brochure',
      name: 'mgb-brochure.pdf',
      provenance: 'user-supplied',
      purpose: 'Owner-supplied brochure describing the services and the work.',
      rightsStatus: 'approved-for-use',
      sourceRole: 'content',
      sourceChannel: 'upload',
      instructionAuthority: 'none',
      publishUseAllowed: false,
      recordedAt: '2026-08-30T00:00:00.000Z',
    });

    const readiness = classifyCandidateTruthReadiness({ sources: bundle.projectManifest.inputs.sources });
    assert.deepEqual(readiness.material, ['mgb-brochure'], 'the brochure is material; the profiles and the photographs still are not');
    assert.equal(readiness.readyForCandidates, false);

    // Created from the manifest rather than replayed, because a replay rebuilds
    // the manifest from the questionnaire and would drop the added source
    // before the guard ever saw it.
    const project = service.createProject({ manifest: bundle.projectManifest });
    await assert.rejects(
      () => service.generateVisualCandidates(project.id, { createdBy: CREATOR }),
      (error) => {
        assert.match(error.message, /incomplete product truth/);
        assert.match(error.message, /mgb-brochure/);
        assert.doesNotMatch(error.message, /mgb-facebook/);
        assert.doesNotMatch(error.message, /mgb-logo/);
        return true;
      },
    );
  });
});

test('mgb prototype contact details stay visible as placeholders', () => {
  const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
  const serialised = JSON.stringify(bundle);
  // The prototype carries a fake number and a fake address on purpose. They are
  // allowed to be there and are not allowed to become quiet production data, so
  // the fixture is pinned rather than trusted.
  assert.match(serialised, /123456789/);
  assert.match(serialised, /test@mgb\.com/);
});

test('a project that declares no sources is left alone', async () => {
  await withService('synthetic', async ({ service }) => {
    const manifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
    manifest.project.type = 'marketing-site';
    // A synthetic fixture legitimately has nothing to ingest. The guard is
    // scoped to businesses that supplied material, so this must not be caught.
    delete manifest.inputs;
    const project = service.createProject({ manifest });
    const { frozenTruth } = service.frozenProductTruth(project.id);
    assert.equal(frozenTruth.knowledgeSource, 'approved-manifest-only');

    // Reaching direction selection at all proves the guard did not fire; what
    // happens after it is this fixture's own business.
    await assert.doesNotReject(async () => {
      try {
        await service.generateVisualCandidates(project.id, { createdBy: CREATOR });
      } catch (error) {
        assert.doesNotMatch(error.message, /incomplete product truth/);
      }
    });
  });
});
