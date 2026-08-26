import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource } from '../packages/content-intelligence/src/index.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { addDesignReference, setDesignReferenceApproval } from '../apps/service/src/visual-references.js';

/**
 * Two projects that cannot both be satisfied by one default.
 *
 * Proving the reference path against a single business is not proof. One
 * project can be made to agree with whatever the factory already did, and a
 * fixture shaped until it says yes tells nobody anything. So this runs two
 * businesses whose owners want opposite things — a practice that wants the
 * writing to carry a still page, and a restaurant that wants the photographs to
 * lead and the page to move — over the same factory, and asserts that the art
 * direction they end up with differs on the axes the fixture names.
 *
 * If a change made both projects agree, this fails. That is the point of it.
 */

const FIXTURE = JSON.parse(fs.readFileSync('examples/design-references/two-projects.json', 'utf8'));

function projectManifest(entry) {
  const manifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
  manifest.project = { ...manifest.project, name: entry.name, slug: entry.id, type: entry.projectType };
  return manifest;
}

async function knowledgePack(entry, { cacheDir, assetOutputDir }) {
  const sources = [await normalizeSource({
    data: Buffer.from(JSON.stringify({ company: entry.company })),
    name: 'company.json',
    label: 'Approved company data',
    kind: 'document',
    mimeType: 'application/json',
    provenance: 'user-supplied',
    purpose: 'approved company profile',
  }, { cacheDir })];
  for (let index = 0; index < entry.photographs; index += 1) {
    const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 90 + index * 14, g: 104, b: 118 } } }).jpeg().toBuffer();
    sources.push(await normalizeSource({
      data: bytes,
      name: `room-${index}.jpg`,
      label: `The dining room, ${index + 1}`,
      kind: 'image',
      provenance: 'user-supplied',
      approvedForUse: true,
    }, { cacheDir, assetOutputDir, assetUriPrefix: 'assets' }));
  }
  return assertKnowledgePack(buildKnowledgePack(sources, { project: { name: entry.name, type: entry.projectType } }));
}

/** A browser stub that returns exactly the fixture's own measurements. */
function browserStub(measurements) {
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  let call = 0;
  return {
    newContext: async () => ({
      route: async () => {},
      newPage: async () => {
        const viewport = call === 0 ? 'desktop' : 'mobile';
        call += 1;
        return {
          goto: async () => ({ ok: () => true }),
          url: () => 'https://reference.example/liked',
          waitForTimeout: async () => {},
          screenshot: async () => bytes,
          evaluate: async () => measurements[viewport],
        };
      },
      close: async () => {},
    }),
    close: async () => {},
  };
}

async function buildWithReference(root, entry) {
  const store = new FactoryStore({ stateRoot: path.join(root, entry.id, 'state') });
  const service = new FactoryService({
    store,
    workspacesRoot: path.join(root, entry.id, 'workspaces'),
    stateRoot: path.join(root, entry.id, 'state'),
  });
  try {
    const project = service.createProject({
      id: `project-${entry.id}`,
      manifest: projectManifest(entry),
      knowledgePack: await knowledgePack(entry, { cacheDir: path.join(root, 'cache'), assetOutputDir: path.join(root, entry.id, 'assets') }),
    });
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/liked',
      label: entry.reference.label,
      preference: entry.reference.preference,
      influence: entry.reference.influence,
      useFor: entry.reference.useFor,
      note: entry.reference.note,
    }, {
      capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub(entry.reference.measurements) },
    });
    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'approved', approvedBy: 'owner' });

    // Both projects present by the same registry direction, so nothing but the
    // reference can account for a difference between them.
    await service.writeDesignChoices(project.id, { visualDirection: 'structured-practice' });
    const built = await service.generateProject(project.id);
    const spec = JSON.parse(fs.readFileSync(path.join(built.workspace, '.product/design-system.json'), 'utf8'));
    return { reference, spec, tokens: fs.readFileSync(path.join(built.workspace, 'src/generated/brand.css'), 'utf8') };
  } finally {
    await service.close();
    store.close();
  }
}

test('two projects that want opposite things do not get the same art direction', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-reference-fixtures-'));
  try {
    const results = {};
    for (const entry of FIXTURE.projects) results[entry.id] = await buildWithReference(root, entry);

    for (const entry of FIXTURE.projects) {
      const { spec } = results[entry.id];
      const actual = {
        visualDistinctiveness: spec.artDirection.dimensions.visualDistinctiveness,
        motionIntensity: spec.artDirection.dimensions.motionIntensity,
        layoutVariance: spec.artDirection.dimensions.layoutVariance,
        density: spec.controls.density,
      };
      assert.deepEqual(actual, entry.expect, `${entry.name} did not end up with the art direction its owner asked for`);
      // A reference steers the one plan; it does not overrule what a direction
      // refuses. Where restraint cut a preference back, the cut is recorded.
      for (const clamp of entry.expectClamped ?? []) {
        const recorded = spec.artDirection.clamped.find((cut) => cut.dimension === clamp.dimension);
        assert.ok(recorded, `${entry.name} should record that restraint cut ${clamp.dimension} back`);
        assert.equal(recorded.declared, clamp.declared);
        assert.equal(recorded.applied, clamp.applied);
      }
    }

    // The fixture's whole reason for existing: the same default cannot serve
    // both, and the axes it names have to be genuinely different values.
    for (const axis of FIXTURE.mustDifferOn) {
      const values = FIXTURE.projects.map((entry) => entry.expect[axis]);
      const actual = FIXTURE.projects.map((entry) => {
        const { spec } = results[entry.id];
        return axis === 'density' ? spec.controls.density : spec.artDirection.dimensions[axis];
      });
      assert.notEqual(actual[0], actual[1], `Both projects ended up with ${axis} ${actual[0]}, so the reference made no difference on it`);
      assert.deepEqual(actual, values);
    }

    // And the difference reaches the stylesheet, not only the record of it.
    const [practice, rooms] = FIXTURE.projects.map((entry) => results[entry.id].tokens);
    for (const property of ['--section-space', '--motion-duration-slow', '--section-alt-ground']) {
      const of = (css) => css.match(new RegExp(`${property}:[^;]+`))?.[0] ?? null;
      assert.notEqual(of(practice), of(rooms), `${property} is identical in both builds`);
    }

    // Neither reference contaminated the other's business, and neither became a
    // fact about the company it was supplied to.
    for (const entry of FIXTURE.projects) {
      const { reference } = results[entry.id];
      assert.equal(reference.instructionAuthority, 'none');
      assert.equal(reference.sourceRef.publishUseAllowed, false);
      const other = FIXTURE.projects.find((candidate) => candidate.id !== entry.id);
      assert.equal(JSON.stringify(results[entry.id].spec).includes(other.company.name), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
