import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { assertKnowledgePack, buildKnowledgePack, normalizeSource } from '../packages/content-intelligence/src/index.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import {
  addDesignReference,
  designReferenceSummary,
  listDesignReferences,
  readDesignReferenceCapture,
  removeDesignReference,
  setDesignReferenceApproval,
  updateDesignReferenceIntent,
} from '../apps/service/src/visual-references.js';
import { observationsFrom } from './lib/visual-reference-capture.mjs';

/**
 * Design references as the service actually runs them.
 *
 * The browser is stubbed. Whether Chromium can measure a page is proved by
 * `npm run exercise:design-reference-capture`, which drives a real one; what is
 * proved here is everything that has to be true regardless of what the browser
 * saw — where a reference is stored, what it is refused, whether it can reach
 * the company's factual truth, and whether approving one changes a real
 * art-direction decision.
 */

function projectManifest() {
  const manifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
  manifest.project.type = 'marketing-site';
  return manifest;
}

async function knowledgePack({ cacheDir }) {
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
  return assertKnowledgePack(buildKnowledgePack([company], { project: { name: 'Kilbride Retrofit', type: 'marketing-site' } }));
}

async function withService(name, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `app-builder-${name}-`));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), stateRoot: path.join(root, 'state') });
  try {
    const project = service.createProject({ id: `project-${name}`, manifest: projectManifest(), knowledgePack: await knowledgePack({ cacheDir: path.join(root, 'cache') }) });
    await run({ service, store, root, project });
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function measurement(overrides = {}) {
  return {
    displaySize: 88,
    bodySize: 17,
    displayFamily: 'Reference Sans',
    bodyFamily: 'Reference Sans',
    headingCount: 5,
    ruledHeadings: 0,
    readingMeasure: 700,
    medianGap: 150,
    sectionCount: 6,
    grounds: 1,
    backgroundLuminance: 0.05,
    containerWidth: 1240,
    gridCount: 2,
    asymmetric: false,
    heroMediaRatio: 0,
    imageCount: 2,
    videoCount: 0,
    transitions: 120,
    animated: 9,
    navPosition: 'sticky',
    navItems: 5,
    navVisibleLinks: 5,
    navToggle: false,
    ...overrides,
  };
}

test('a public reference URL is captured and stored outside the company\'s factual truth', async () => {
  await withService('reference-store', async ({ service, project, root }) => {
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      label: 'Studio reference',
      preference: 'mixed',
      influence: 'strong',
      note: 'Love the big type and the whitespace. Not the dark palette.',
    }, {
      capture: {
        lookup: async () => [{ address: '93.184.216.34' }],
        launch: async () => browserStub(),
      },
    });

    assert.equal(reference.sourceRef.kind, 'url');
    assert.equal(reference.sourceRef.canonicalUrl, 'https://reference.example/studio');
    assert.equal(reference.instructionAuthority, 'none');
    assert.equal(reference.sourceRef.rightsStatus, 'reference-only');
    assert.equal(reference.sourceRef.publishUseAllowed, false);
    assert.equal(reference.approval.state, 'draft');

    // The reference lives beside the project's sources, not among them.
    const stored = path.join(root, 'state', 'sources', project.id, 'design-references', reference.referenceId, 'analysis.json');
    assert.ok(fs.existsSync(stored));

    // And it is nowhere in the knowledge pack, the manifest or the composition.
    const pack = JSON.stringify(service.getKnowledgePack(project.id));
    assert.equal(pack.includes('reference.example'), false);
    assert.equal(pack.includes(reference.referenceId), false);
    const manifest = JSON.stringify(service.getManifest(project.id));
    assert.equal(manifest.includes('reference.example'), false);
    const composition = JSON.stringify(service.getComposition(project.id));
    assert.equal(composition.includes('reference.example'), false);

    // A screenshot the browser took is readable back, addressed by the file the
    // analysis recorded rather than by anything a caller names.
    assert.ok(readDesignReferenceCapture(service, project.id, reference.referenceId, 'desktop.png'));
    assert.equal(readDesignReferenceCapture(service, project.id, reference.referenceId, '../analysis.json'), null);
  });
});

/** A Playwright-shaped stub that returns fixed measurements and fixed bytes. */
function browserStub(measurements = {}) {
  const bytes = Buffer.from('89504e470d0a1a0a', 'hex');
  return {
    newContext: async () => ({
      route: async () => {},
      newPage: async () => ({
        routeWebSocket: async () => {},
        goto: async () => ({ ok: () => true }),
        url: () => 'https://reference.example/studio',
        waitForTimeout: async () => {},
        screenshot: async () => bytes,
        evaluate: async () => measurement(measurements),
      }),
      close: async () => {},
    }),
    close: async () => {},
  };
}

test('a reference URL that is not the public internet never reaches a browser', async () => {
  await withService('reference-refuse', async ({ service, project }) => {
    for (const url of ['http://localhost:4310/projects', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'file:///etc/passwd']) {
      await assert.rejects(
        () => addDesignReference(service, project.id, { url }, {
          capture: {
            lookup: async () => [{ address: '93.184.216.34' }],
            launch: async () => {
              throw new Error(`A browser was launched for ${url}, which the boundary should have refused first.`);
            },
          },
        }),
      );
    }
    assert.deepEqual(listDesignReferences(service, project.id), []);
  });
});

test('an uploaded screenshot is accepted and rests on what the person said', async () => {
  await withService('reference-screenshot', async ({ service, project }) => {
    const bytes = await sharp({ create: { width: 1440, height: 900, channels: 3, background: { r: 20, g: 22, b: 26 } } }).png().toBuffer();
    const reference = await addDesignReference(service, project.id, {
      contentBase64: bytes.toString('base64'),
      mimeType: 'image/png',
      label: 'Moodboard',
      preference: 'like',
      influence: 'medium',
      note: 'Big type and generous spacing.',
    });
    assert.equal(reference.sourceRef.kind, 'screenshot');
    assert.equal(reference.capture, null);
    assert.equal(reference.createdFromEvidence, false);
    // The image's own dimensions are a real measurement of the supplied file
    // and are recorded; nothing pretends to have read typography out of pixels.
    assert.equal(reference.observed.imagery.find((entry) => entry.measure === 'supplied-image-width-px').value, 1440);
    assert.deepEqual(reference.interpreted, []);
    assert.deepEqual(reference.adopt.map((trait) => trait.trait).sort(), ['generous-whitespace', 'oversized-display-type']);
    assert.ok(reference.adopt.every((trait) => trait.source === 'user-stated'));
    assert.ok(readDesignReferenceCapture(service, project.id, reference.referenceId, 'reference.png'));
  });
});

test('a reference influences nothing until its traits are approved, and approving is reversible', async () => {
  await withService('reference-approval', async ({ service, project }) => {
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      preference: 'mixed',
      influence: 'strong',
      note: 'Love the big type and the whitespace. Not the dark palette.',
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub() } });

    assert.equal(service.designReferenceInfluence(project.id), null);

    const approved = await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'approved', approvedBy: 'owner' });
    assert.equal(approved.approval.state, 'approved');
    const influence = service.designReferenceInfluence(project.id);
    assert.ok(influence.influenced);
    assert.equal(influence.prefer.visualDistinctiveness, 'expressive');
    assert.equal(influence.prefer.density, 'relaxed');

    // The dark palette the person disliked is heard and honestly reported as
    // something the factory cannot act on.
    assert.ok(influence.unconsumed.some((entry) => entry.trait === 'dark-ground' && entry.intent === 'avoid'));

    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'disabled' });
    assert.equal(service.designReferenceInfluence(project.id), null);
  });
});

test('approving a reference changes a real art-direction decision, and removing it restores the baseline', async () => {
  await withService('reference-artdirection', async ({ service, project }) => {
    // The direction is a promoted design choice, so both builds present by the
    // same one and the only difference between them is the reference.
    await service.writeDesignChoices(project.id, { visualDirection: 'structured-practice' });
    const before = await service.generateProject(project.id);
    const baseline = JSON.parse(fs.readFileSync(path.join(before.workspace, '.product/design-system.json'), 'utf8'));
    assert.equal(baseline.artDirection.dimensions.visualDistinctiveness, 'balanced');
    assert.equal(baseline.artDirection.dimensions.motionIntensity, 'subtle');
    assert.equal(baseline.controls.density, 'comfortable');

    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      preference: 'like',
      influence: 'strong',
      useFor: ['typography', 'spacing', 'motion'],
      note: 'Big type, generous whitespace, and the motion is part of the effect.',
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub() } });
    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'approved', approvedBy: 'owner' });

    const influenced = await service.generateProject(project.id);
    const after = JSON.parse(fs.readFileSync(path.join(influenced.workspace, '.product/design-system.json'), 'utf8'));

    // Same project truth, same direction, different bounded art-direction
    // decision — which is the whole acceptance requirement for this lane.
    assert.equal(after.artDirection.dimensions.visualDistinctiveness, 'expressive');
    assert.equal(after.artDirection.dimensions.motionIntensity, 'expressive');
    assert.equal(after.controls.density, 'relaxed');
    assert.ok(after.artDirection.referenceAdjustments.some((entry) => entry.axis === 'visualDistinctiveness' && entry.reason === 'reference-prefers'));
    assert.deepEqual(after.artDirection.referenceIds, [reference.referenceId]);

    // The tokens the stylesheet reads moved with it, so this is a rendered
    // difference rather than a recorded intention.
    const tokens = fs.readFileSync(path.join(influenced.workspace, 'src/generated/brand.css'), 'utf8');
    assert.match(tokens, /--hero-scale:\s*1\.65/);
    assert.notEqual(
      tokens.match(/--section-space:[^;]+/)[0],
      fs.readFileSync(path.join(before.workspace, 'src/generated/brand.css'), 'utf8').match(/--section-space:[^;]+/)[0],
    );

    await removeDesignReference(service, project.id, reference.referenceId);
    const restored = await service.generateProject(project.id);
    const back = JSON.parse(fs.readFileSync(path.join(restored.workspace, '.product/design-system.json'), 'utf8'));
    assert.equal(back.artDirection.dimensions.visualDistinctiveness, 'balanced');
    assert.equal(back.artDirection.dimensions.motionIntensity, 'subtle');
    assert.equal(back.controls.density, 'comfortable');
    assert.equal(back.artDirection.referenceAdjustments, undefined);
  });
});

test('an avoided structural trait refuses a direction rather than generating one nobody wanted', async () => {
  await withService('reference-refusal', async ({ service, project }) => {
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/quiet',
      preference: 'like',
      influence: 'strong',
      disliked: ['indexed-rows'],
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub() } });
    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'approved', approvedBy: 'owner' });

    // This project has no publishable photography, so the imagery-led direction
    // was already refused. Refusing the indexed-rows direction as well leaves
    // one, and one is not a choice — so the set is refused, and the refusal
    // names the reference that caused it rather than reporting a shortage of
    // directions the operator cannot explain.
    await assert.rejects(
      () => service.generateVisualCandidates(project.id),
      (error) => {
        assert.match(error.message, /editorial-authority \(reference-avoids-trait/);
        assert.match(error.message, /design reference/i);
        return true;
      },
    );

    // Withdraw the refusal and the same project produces a set again, with the
    // reference still recorded against every candidate it informed.
    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'disabled' });
    const set = await service.generateVisualCandidates(project.id);
    assert.ok(set.candidates.length >= 2);
    assert.ok(!set.refusedDirections.some((entry) => entry.reason === 'reference-avoids-trait'));
  });
});

test('editing what a reference is for re-resolves its traits and returns it to draft', async () => {
  await withService('reference-edit', async ({ service, project }) => {
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      preference: 'like',
      influence: 'medium',
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub() } });
    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'approved', approvedBy: 'owner' });
    assert.ok(service.designReferenceInfluence(project.id).influenced);

    const narrowed = await updateDesignReferenceIntent(service, project.id, reference.referenceId, { useFor: ['spacing'] });
    assert.equal(narrowed.approval.state, 'draft');
    assert.deepEqual([...new Set(narrowed.adopt.map((trait) => trait.useFor))], ['spacing']);
    // The measurements did not move; only what the person wants from them did.
    assert.deepEqual(narrowed.observed, reference.observed);
    assert.equal(service.designReferenceInfluence(project.id), null);
  });
});

test('the panel state names the vocabulary rather than leaving the Console to hard-code it', async () => {
  await withService('reference-summary', async ({ service, project }) => {
    const summary = designReferenceSummary(service, project.id);
    assert.deepEqual(summary.references, []);
    assert.equal(summary.influence.influenced, false);
    assert.ok(summary.catalogue.length > 10);
    assert.ok(summary.useFor.includes('typography'));
    assert.ok(summary.limits.maxReferencesPerProject >= 1);
    for (const entry of summary.catalogue) {
      assert.ok(entry.label);
      assert.ok(entry.consumer || entry.consumerAbsentReason);
    }
  });
});

test('nothing a reference measured reaches the generated repository', async () => {
  await withService('reference-no-copy', async ({ service, project }) => {
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      label: 'Studio reference',
      preference: 'like',
      influence: 'strong',
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub() } });
    await setDesignReferenceApproval(service, project.id, reference.referenceId, { state: 'approved', approvedBy: 'owner' });
    const built = await service.generateProject(project.id);

    const files = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(full);
      }
    };
    walk(built.workspace);

    // Neither the reference's address nor its label nor the family it happened
    // to be set in appears anywhere in the repository that was produced.
    for (const file of files) {
      assert.equal(path.basename(file).includes('desktop.png'), false, `${file} looks like a copied reference capture`);
      if (/\.(png|jpe?g|webp|ico|woff2?)$/i.test(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(content.includes('reference.example'), false, `${file} carries the reference's address`);
      assert.equal(content.includes('Studio reference'), false, `${file} carries the reference's label`);
      assert.equal(content.includes('Reference Sans'), false, `${file} carries the reference's font family`);
    }
  });
});

test('observations survive a round trip through the durable record unchanged', async () => {
  await withService('reference-durable', async ({ service, project }) => {
    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      preference: 'like',
      influence: 'medium',
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch: async () => browserStub() } });
    const expected = observationsFrom({ desktop: measurement(), mobile: measurement() });
    assert.equal(
      reference.observed.typography.find((entry) => entry.measure === 'display-font-size-px').value,
      expected.typography.find((entry) => entry.measure === 'display-font-size-px').value,
    );
    const reread = listDesignReferences(service, project.id)[0];
    assert.deepEqual(reread.observed, reference.observed);
    assert.deepEqual(reread.adopt, reference.adopt);
    assert.deepEqual(reread.avoid, reference.avoid);
  });
});

test('a reference page that tries to reach an internal address is refused, and the attempt is recorded', async () => {
  await withService('reference-egress', async ({ service, project }) => {
    // A public page whose subresources point at the factory's own network. The
    // guard runs inside the capture, so this exercises the real route handler
    // rather than a description of it.
    const attempted = [
      { url: 'http://169.254.169.254/latest/meta-data/', resourceType: 'fetch' },
      { url: 'http://127.0.0.1:4310/projects', resourceType: 'xhr' },
      { url: 'http://10.0.0.5/internal.png', resourceType: 'image' },
      { url: 'https://cdn.reference.example/hero.jpg', resourceType: 'image' },
    ];
    const outcomes = [];
    const launch = async () => ({
      newContext: async () => {
        let route = null;
        return {
          route: async (_pattern, handler) => { route = handler; },
          newPage: async () => ({
            routeWebSocket: async () => {},
            goto: async () => {
              for (const request of attempted) {
                await route(
                  { continue: async () => outcomes.push(`allow ${request.url}`), abort: async () => outcomes.push(`block ${request.url}`) },
                  { url: () => request.url, resourceType: () => request.resourceType },
                );
              }
              return { ok: () => true };
            },
            url: () => 'https://reference.example/studio',
            waitForTimeout: async () => {},
            screenshot: async () => Buffer.from('89504e470d0a1a0a', 'hex'),
            evaluate: async () => measurement(),
          }),
          close: async () => {},
        };
      },
      close: async () => {},
    });

    const reference = await addDesignReference(service, project.id, {
      url: 'https://reference.example/studio',
      preference: 'like',
      influence: 'medium',
    }, { capture: { lookup: async () => [{ address: '93.184.216.34' }], launch } });

    // The three internal destinations were refused; the ordinary public one was
    // not. A boundary that blocked everything would be indistinguishable from a
    // browser with no network.
    assert.equal(outcomes.filter((entry) => entry.startsWith('block')).length, 6);
    assert.equal(outcomes.filter((entry) => entry === 'allow https://cdn.reference.example/hero.jpg').length, 2);

    const blocked = reference.capture.blockedRequests;
    assert.equal(blocked.length, 3, 'each refused host and resource type is recorded once');
    assert.deepEqual(blocked.map((entry) => entry.host).sort(), ['10.0.0.5', '127.0.0.1', '169.254.169.254']);
    assert.deepEqual(blocked.map((entry) => entry.resourceType).sort(), ['fetch', 'image', 'xhr']);

    // And the durable record carries it, so the refusal is reviewable rather
    // than a line in a log nobody kept.
    const stored = listDesignReferences(service, project.id)[0];
    assert.deepEqual(stored.capture.blockedRequests, blocked);
    const event = service.listEvents(project.id).find((entry) => entry.type === 'design.reference.added');
    assert.ok(event.payload.blockedRequests.includes('fetch:169.254.169.254'));
  });
});
