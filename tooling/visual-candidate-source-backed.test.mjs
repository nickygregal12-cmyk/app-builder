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

const BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';
const KNOWLEDGE = 'examples/genuine-business/nbm-approved-knowledge.v1.json';
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
        assert.ok(error.message.includes(String(declared.length)), 'the refusal names how many sources went unread');
        return true;
      },
    );
  });
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
