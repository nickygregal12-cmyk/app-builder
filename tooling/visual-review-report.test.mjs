import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureInventory, writeVisualReviewPacket } from './lib/visual-review-report.mjs';

test('capture inventory preserves the evidence a remote reviewer needs', () => {
  const evidence = {
    captures: [
      {
        id: 'home-mobile',
        pageId: 'home',
        route: '/',
        viewport: 'mobile',
        state: { axis: 'viewport', state: 'default', risk: 'low', interaction: null, proves: 'The mobile home composition.' },
        file: 'captures/home-mobile.png',
        contentHash: 'a'.repeat(64),
        byteSize: 1234,
        elementRefs: ['page-home--hero'],
      },
      {
        id: 'contact-failed-enquiry-mobile',
        pageId: 'contact',
        route: '/contact',
        viewport: 'mobile',
        state: { axis: 'form-submission', state: 'failed-enquiry', risk: 'high', interaction: 'submit-invalid-enquiry', proves: 'The failed enquiry state is visibly usable.' },
        file: 'captures/contact-failed-enquiry-mobile.png',
        contentHash: 'b'.repeat(64),
        byteSize: 2345,
        elementRefs: ['page-contact--lead-form'],
      },
    ],
  };

  const inventory = captureInventory(evidence);
  assert.equal(inventory.length, 2);
  assert.deepEqual(inventory[1], evidence.captures[1]);
  assert.notEqual(inventory[1], evidence.captures[1], 'the report receives a detached summary rather than a live evidence object');
  assert.notEqual(inventory[1].state, evidence.captures[1].state);
  assert.notEqual(inventory[1].elementRefs, evidence.captures[1].elementRefs);
  assert.equal(inventory.some((entry) => entry.state.axis !== 'viewport'), true, 'interaction-state captures must not disappear from the portable report');
});

test('capture inventory is empty when no rendered evidence exists', () => {
  assert.deepEqual(captureInventory(null), []);
  assert.deepEqual(captureInventory({ captures: [] }), []);
});

/**
 * The packet a second person can be handed.
 *
 * The nbm review could be done on the machine that produced it and nowhere
 * else. These hold the fix: everything the reviewer needs is copied into one
 * directory, the index opens with no service running, and a capture the packet
 * names is a capture the packet actually contains.
 */
function candidateSet(overrides = {}) {
  return {
    schemaVersion: 1,
    setId: `candidates-${'a'.repeat(16)}`,
    projectId: 'project-a',
    createdAt: '2026-08-26T10:00:00.000Z',
    setOutcome: 'undecided',
    decision: null,
    frozenTruth: {
      projectType: 'marketing-site',
      manifestVersion: 2,
      manifestHash: 'c'.repeat(64),
      knowledgePackHash: null,
      knowledgeSource: 'approved-manifest-only',
      baselineCompositionHash: 'd'.repeat(64),
    },
    assetReadiness: { strategy: 'typography-led', supportsImageryLed: false, strategyReason: 'No publishable photography.' },
    diversity: { distinct: true, minimumDifferingPlanes: 2, duplicates: [] },
    refusedDirections: [{ directionId: 'immersive-lead', reason: 'imagery-not-available', detail: 'No publishable photograph.' }],
    reworkPlans: [],
    promotedCandidateId: null,
    candidates: [
      {
        candidateId: 'candidate-structured-practice',
        directionId: 'structured-practice',
        directionLabel: 'Structured practice',
        state: 'deterministic-pass',
        outcome: 'pending',
        compositionHash: 'd'.repeat(64),
        signature: { axes: { heroStrategy: 'split', gridFamily: 'symmetric' }, sequence: [] },
        artDirection: { dimensions: {}, responsive: { mobileHero: 'copy-first' } },
        gate: { status: 'clear', blocking: [], mustAddress: [] },
        designLint: { findings: [] },
        review: null,
        evidenceId: 'evidence-1',
        referenceAnalysisIds: [],
      },
      {
        candidateId: 'candidate-editorial-authority',
        directionId: 'editorial-authority',
        directionLabel: 'Editorial authority',
        state: 'deterministic-pass',
        outcome: 'pending',
        compositionHash: 'd'.repeat(64),
        signature: { axes: { heroStrategy: 'editorial', gridFamily: 'editorial-rows' }, sequence: [] },
        artDirection: { dimensions: {}, responsive: { mobileHero: 'copy-only' } },
        gate: { status: 'review-required', blocking: [], mustAddress: ['repetitive-section-presentation'] },
        designLint: { findings: [{ rule: 'repetitive-section-presentation', severity: 'warning', detail: 'Three service cards in a row.' }] },
        review: { verdict: 'rework', reviewedBy: 'design-critic', overallScore: 7.1, rationale: 'Competent, not distinctive.' },
        evidenceId: 'evidence-2',
        referenceAnalysisIds: ['reference-aaaaaaaaaaaaaaaa'],
      },
    ],
    ...overrides,
  };
}

const EVIDENCE = {
  'evidence-1': { captures: [
    { id: 'home-desktop', pageId: 'home', route: '/', viewport: 'desktop', state: { axis: 'viewport', state: 'default', risk: 'low', interaction: null, proves: 'Home.' }, file: 'captures/home-desktop.png', contentHash: 'e'.repeat(64), byteSize: 10, elementRefs: [] },
  ] },
  'evidence-2': { captures: [
    { id: 'home-desktop', pageId: 'home', route: '/', viewport: 'desktop', state: { axis: 'viewport', state: 'default', risk: 'low', interaction: null, proves: 'Home.' }, file: 'captures/home-desktop.png', contentHash: 'f'.repeat(64), byteSize: 10, elementRefs: [] },
    { id: 'contact-failed', pageId: 'contact', route: '/contact', viewport: 'mobile', state: { axis: 'form-submission', state: 'failed-enquiry', risk: 'high', interaction: 'enquiry-submit-failed', proves: 'A failed enquiry stays usable.' }, file: 'captures/contact-failed.png', contentHash: '0'.repeat(64), byteSize: 10, elementRefs: [] },
  ] },
};

function writePacket(root, overrides = {}) {
  return writeVisualReviewPacket({
    outputDir: path.join(root, 'packet'),
    business: 'Kilbride Retrofit',
    set: candidateSet(),
    criteria: [{ id: 'distinctiveness', question: 'Does this look like a considered site for this business?' }],
    qualityGate: { minimumScore: 8.5, minimumCriterionScore: 6.5, reworkIterationBudget: 2 },
    designReferences: [{ label: 'A practice site the owner likes', adopt: ['oversized-display-type'], avoid: ['dark-ground'], approval: 'approved' }],
    readEvidence: (id) => EVIDENCE[id] ?? null,
    readCapture: () => Buffer.from('89504e470d0a1a0a', 'hex'),
    ...overrides,
  });
}

test('a portable packet carries everything a reviewer needs, and no hidden state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-packet-'));
  try {
    const result = writePacket(root);
    assert.equal(result.captureCount, 3);
    for (const file of result.files) {
      assert.ok(fs.existsSync(path.join(result.root, file)), `${file} is named by the packet and is not in it`);
    }

    const packet = JSON.parse(fs.readFileSync(path.join(result.root, 'review.json'), 'utf8'));
    // The frozen truth, including the manifest identity that used to be the
    // only thing a null knowledge-pack hash left a reviewer with.
    assert.equal(packet.frozenTruth.manifestHash, 'c'.repeat(64));
    assert.equal(packet.frozenTruth.knowledgeSource, 'approved-manifest-only');
    assert.equal(packet.qualityGate.minimumScore, 8.5);
    assert.deepEqual(packet.criteria.map((entry) => entry.id), ['distinctiveness']);
    assert.equal(packet.refusedDirections.length, 1);
    assert.equal(packet.designReferences[0].avoid[0], 'dark-ground');
    // The interaction-state capture travels with the resting one.
    const editorial = packet.candidates.find((entry) => entry.candidateId === 'candidate-editorial-authority');
    assert.equal(editorial.captures.length, 2);
    assert.ok(editorial.captures.some((capture) => capture.state.interaction === 'enquiry-submit-failed'));
    assert.equal(editorial.review.overallScore, 7.1);
    assert.equal(editorial.designLint[0].rule, 'repetitive-section-presentation');

    const index = fs.readFileSync(path.join(result.root, 'index.html'), 'utf8');
    assert.match(index, /Kilbride Retrofit/);
    assert.match(index, /Structured practice/);
    assert.match(index, /8\.5 overall/);
    // Every image the index shows is a relative path inside the packet, so it
    // opens from a file:// URL with no server and no factory.
    const sources = [...index.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(sources.length, 3);
    for (const source of sources) {
      assert.equal(source.startsWith('/') || source.includes('://'), false, `${source} is not a relative path inside the packet`);
      assert.ok(fs.existsSync(path.join(result.root, source)));
    }
    assert.equal(index.includes('<script'), false, 'the index must render with no script');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * The whole capture has to be reachable, not just its first screenful.
 *
 * The grid crops each thumbnail to the top of the page, which is right for
 * comparing candidates side by side and wrong as the only way to see one. On
 * the first real nbm run every one of the 36 captures was a full-page render
 * between 1,600px and 3,090px tall shown through a 420px window: none was
 * fully visible, the median showed about a third, and the worst showed 13.9%.
 * A reviewer scoring `responsive-quality` — "is the mobile rendering a designed
 * composition, or the desktop one with fewer columns?" — cannot answer that
 * from the top of the page, so the packet was asking for a judgement it did
 * not show the evidence for.
 *
 * The fix is a link, not a script: the packet must still open from a file://
 * URL on a machine that has never heard of this repository.
 */
test('every capture in the packet is reachable at full size without a script', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-packet-full-'));
  try {
    const result = writePacket(root);
    const index = fs.readFileSync(path.join(result.root, 'index.html'), 'utf8');

    const shown = [...index.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]);
    const linked = [...index.matchAll(/<a href="(captures\/[^"]+)"/g)].map((match) => match[1]);
    assert.equal(shown.length, result.captureCount);
    assert.deepEqual(
      [...linked].sort(),
      [...shown].sort(),
      'every capture the packet shows cropped must also be openable whole',
    );

    // The link is to the capture inside the packet, so it resolves offline.
    for (const target of linked) {
      assert.equal(target.startsWith('/') || target.includes('://'), false, `${target} is not a relative path inside the packet`);
      assert.ok(fs.existsSync(path.join(result.root, target)), `${target} is linked and is not in the packet`);
    }

    // Reachability must not have been bought with a script the packet cannot run.
    assert.equal(index.includes('<script'), false, 'the index must still render with no script');
    // And the reviewer has to be told the thumbnail is a crop, or they will
    // read a cropped page as the whole page.
    assert.match(index, /Select one to open that capture whole/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a packet with no captures promises none', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-packet-none-'));
  try {
    const result = writePacket(root, { readCapture: () => null });
    const index = fs.readFileSync(path.join(result.root, 'index.html'), 'utf8');
    assert.equal(result.captureCount, 0);
    assert.equal(index.includes('<a href="captures/'), false, 'a packet with no captures must link to none');
    assert.equal(index.includes('<p class="crop-note">'), false, 'a packet with no captures must not explain a crop it never shows');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a capture the packet cannot copy is not named by it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-packet-missing-'));
  try {
    const result = writePacket(root, { readCapture: () => null });
    assert.equal(result.captureCount, 0);
    const index = fs.readFileSync(path.join(result.root, 'index.html'), 'utf8');
    assert.equal(index.includes('<img'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a fictional benchmark says so before it says anything else', () => {
  // The material in a benchmark packet — testimonials, awards, projects, named
  // people — is indistinguishable from a real practice's once it is in a
  // screenshot. A reviewer handed it unlabelled has every reason to read it as
  // claims about a real company, and might check an award or weigh a
  // testimonial that was invented to fill a slot.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-packet-benchmark-'));
  try {
    const result = writePacket(root, {
      business: 'Ardwell & Roe',
      truthBasis: {
        businessReality: 'fictional',
        truthPurpose: 'visual-excellence-benchmark',
        publicationAllowed: 'benchmark-only',
        externalVerification: 'not-applicable',
        corpus: 'visual-excellence',
      },
    });

    const packet = JSON.parse(fs.readFileSync(path.join(result.root, 'review.json'), 'utf8'));
    assert.equal(packet.truthBasis.businessReality, 'fictional');

    const html = fs.readFileSync(path.join(result.root, 'index.html'), 'utf8');
    assert.match(html, /Fictional benchmark business/i);
    assert.match(html, /ideal-input visual-ceiling test/i);
    assert.match(html, /None of it is a claim about a real company/i);
    // Before the business name, not somewhere further down a long page.
    assert.ok(html.indexOf('truth-basis') < html.indexOf('<h1>'), 'the label must precede the business it qualifies');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a real business carries no such banner, which is what makes the banner mean something', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-packet-genuine-'));
  try {
    const result = writePacket(root);
    const packet = JSON.parse(fs.readFileSync(path.join(result.root, 'review.json'), 'utf8'));
    assert.equal(packet.truthBasis, null, 'absence is the ordinary case rather than a missing field');
    const html = fs.readFileSync(path.join(result.root, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /Fictional benchmark business/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
