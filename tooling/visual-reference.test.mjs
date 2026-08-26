import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertReferenceIsNotContent,
  buildReferenceAnalysis,
  interpretObservations,
  loadReferenceTraits,
  readReferenceNote,
  referenceTraitCatalogue,
  resolveReferenceInfluence,
} from './lib/visual-reference.mjs';
import { assertSafeReferenceUrl, observationsFrom } from './lib/visual-reference-capture.mjs';

const traits = loadReferenceTraits(process.cwd());

function measurement(overrides = {}) {
  return {
    displaySize: 84,
    bodySize: 17,
    displayFamily: 'Söhne',
    bodyFamily: 'Söhne',
    headingCount: 6,
    ruledHeadings: 4,
    readingMeasure: 610,
    medianGap: 140,
    sectionCount: 7,
    grounds: 3,
    backgroundLuminance: 0.94,
    containerWidth: 1240,
    gridCount: 3,
    asymmetric: true,
    heroMediaRatio: 0,
    imageCount: 4,
    videoCount: 0,
    transitions: 90,
    animated: 6,
    navPosition: 'sticky',
    navItems: 5,
    navVisibleLinks: 5,
    navToggle: false,
    ...overrides,
  };
}

const observed = observationsFrom({
  desktop: measurement(),
  mobile: measurement({ medianGap: 64, navVisibleLinks: 0, navToggle: true, readingMeasure: 320 }),
});

test('every trait the vocabulary offers declares a consumer or says why it has none', () => {
  for (const entry of referenceTraitCatalogue(traits)) {
    if (entry.consumer) continue;
    assert.ok(entry.consumerAbsentReason, `${entry.trait} has no consumer and no reason. A preference the factory cannot act on has to say so.`);
  }
});

test('observations become traits, and every trait names the measurement behind it', () => {
  const interpreted = interpretObservations(observed);
  const found = new Map(interpreted.map((entry) => [entry.trait, entry]));
  assert.ok(found.has('oversized-display-type'));
  assert.ok(found.has('generous-whitespace'));
  assert.ok(found.has('typographic-opening'));
  assert.ok(found.has('asymmetric-composition'));
  assert.ok(found.has('ruled-section-headings'));
  assert.ok(found.has('alternating-section-ground'));
  assert.ok(found.has('expressive-motion'));
  assert.ok(found.has('sticky-navigation'));
  assert.ok(found.has('mobile-simplification'));
  assert.equal(found.get('oversized-display-type').confidence, 'high');
  for (const entry of interpreted) assert.ok(entry.fromObservations.length >= 1, `${entry.trait} has no observation behind it.`);
});

test('a measurement the capture never produced supports no trait', () => {
  const withoutTypography = { ...observed, typography: [], responsive: [] };
  const interpreted = interpretObservations(withoutTypography).map((entry) => entry.trait);
  assert.ok(!interpreted.includes('oversized-display-type'));
  assert.ok(!interpreted.includes('mobile-simplification'));
});

test('a note is read against the vocabulary, with the phrase that was matched', () => {
  const readings = readReferenceNote('I love the big type and the whitespace, but not the dark palette.', traits);
  const byTrait = new Map(readings.map((entry) => [entry.trait, entry]));
  assert.equal(byTrait.get('oversized-display-type').polarity, 'like');
  assert.equal(byTrait.get('generous-whitespace').polarity, 'like');
  assert.equal(byTrait.get('dark-ground').polarity, 'dislike');
  assert.equal(byTrait.get('dark-ground').phrase, 'dark palette');
});

test('observed facts and stated preference stay separate, and both reach adopt/avoid', () => {
  const analysis = buildReferenceAnalysis({
    projectId: 'project-a',
    sourceRef: { kind: 'url', label: 'Reference', requestedUrl: 'https://example.com/', canonicalUrl: 'https://example.com/' },
    observed,
    userIntent: { preference: 'mixed', influence: 'strong', note: 'Love the big type. Not the dark palette.' },
    traitRegistry: traits,
    createdAt: '2026-08-26T10:00:00.000Z',
  });

  // The measurement survives untouched beside the sentence that was typed.
  assert.equal(analysis.observed.typography.find((entry) => entry.measure === 'display-font-size-px').value, 84);
  assert.equal(analysis.userIntent.note, 'Love the big type. Not the dark palette.');
  assert.ok(analysis.interpreted.some((entry) => entry.trait === 'oversized-display-type'));

  const adopted = new Map(analysis.adopt.map((trait) => [trait.trait, trait]));
  const avoided = new Map(analysis.avoid.map((trait) => [trait.trait, trait]));
  // Measured and said: recorded as both, and confident because they agree.
  assert.equal(adopted.get('oversized-display-type').source, 'observed-and-user-stated');
  assert.equal(adopted.get('oversized-display-type').confidence, 'high');
  // Measured only.
  assert.equal(adopted.get('generous-whitespace').source, 'observed');
  // Said only, about something the page did not show.
  assert.equal(avoided.get('dark-ground').source, 'user-stated');
  assert.equal(analysis.createdFromEvidence, true);
});

test('a disliked trait is never adopted, however strongly it was measured', () => {
  const analysis = buildReferenceAnalysis({
    projectId: 'project-a',
    sourceRef: { kind: 'url', label: 'Reference', requestedUrl: 'https://example.com/', canonicalUrl: 'https://example.com/' },
    observed,
    userIntent: { preference: 'mixed', influence: 'medium', disliked: ['oversized-display-type'] },
    traitRegistry: traits,
    createdAt: '2026-08-26T10:00:00.000Z',
  });
  assert.ok(!analysis.adopt.some((trait) => trait.trait === 'oversized-display-type'));
  assert.equal(analysis.avoid.find((trait) => trait.trait === 'oversized-display-type').source, 'observed-and-user-stated');
});

test('useFor narrows a reference to the part of the design it was supplied for', () => {
  const analysis = buildReferenceAnalysis({
    projectId: 'project-a',
    sourceRef: { kind: 'url', label: 'Reference', requestedUrl: 'https://example.com/', canonicalUrl: 'https://example.com/' },
    observed,
    userIntent: { preference: 'like', influence: 'medium', useFor: ['typography'] },
    traitRegistry: traits,
    createdAt: '2026-08-26T10:00:00.000Z',
  });
  const useFors = new Set(analysis.adopt.map((trait) => trait.useFor));
  assert.deepEqual([...useFors], ['typography']);
  assert.ok(analysis.adopt.some((trait) => trait.trait === 'oversized-display-type'));
  assert.ok(!analysis.adopt.some((trait) => trait.trait === 'expressive-motion'));
});

test('a reference supplied as a dislike turns what it showed into what to avoid', () => {
  const analysis = buildReferenceAnalysis({
    projectId: 'project-a',
    sourceRef: { kind: 'url', label: 'Reference', requestedUrl: 'https://example.com/', canonicalUrl: 'https://example.com/' },
    observed,
    userIntent: { preference: 'dislike', influence: 'medium', useFor: ['motion'] },
    traitRegistry: traits,
    createdAt: '2026-08-26T10:00:00.000Z',
  });
  assert.deepEqual(analysis.adopt, []);
  assert.ok(analysis.avoid.some((trait) => trait.trait === 'expressive-motion'));
});

test('a reference nobody could measure is marked as described rather than observed', () => {
  const analysis = buildReferenceAnalysis({
    projectId: 'project-a',
    sourceRef: { kind: 'screenshot', label: 'Moodboard', fileName: 'reference.png', mimeType: 'image/png', byteSize: 4096 },
    observed: null,
    userIntent: { preference: 'like', influence: 'medium', note: 'Big type, lots of whitespace.' },
    traitRegistry: traits,
    createdAt: '2026-08-26T10:00:00.000Z',
  });
  assert.equal(analysis.createdFromEvidence, false);
  assert.equal(analysis.confidence, 'medium');
  assert.deepEqual(analysis.adopt.map((trait) => trait.source), ['user-stated', 'user-stated']);
});

test('a reference is source data and never company truth', () => {
  const analysis = buildReferenceAnalysis({
    projectId: 'project-a',
    sourceRef: { kind: 'url', label: 'Reference', requestedUrl: 'https://example.com/', canonicalUrl: 'https://example.com/' },
    observed,
    userIntent: { preference: 'like', influence: 'medium' },
    traitRegistry: traits,
    createdAt: '2026-08-26T10:00:00.000Z',
  });
  assert.equal(analysis.instructionAuthority, 'none');
  assert.equal(analysis.sourceRef.instructionAuthority, 'none');
  assert.equal(analysis.sourceRef.rightsStatus, 'reference-only');
  assert.equal(analysis.sourceRef.publishUseAllowed, false);
});

test('source markup, copy and assets are refused rather than recorded', () => {
  const base = {
    instructionAuthority: 'none',
    sourceRef: { instructionAuthority: 'none', rightsStatus: 'reference-only', publishUseAllowed: false },
    adopt: [],
    avoid: [],
    observed: { typography: [], layout: [], spacing: [], colour: [], imagery: [], motion: [], navigation: [], responsive: [] },
  };
  const withObservation = (observation) => ({ ...base, observed: { ...base.observed, typography: [observation] } });

  assert.throws(
    () => assertReferenceIsNotContent(withObservation({ id: 'x', measure: 'markup', value: '<h1 class="hero">Award-winning studio</h1>' })),
    /markup or a style rule/,
  );
  assert.throws(
    () => assertReferenceIsNotContent(withObservation({ id: 'x', measure: 'stylesheet', value: '.hero { font-size: 84px; }' })),
    /markup or a style rule/,
  );
  assert.throws(
    () => assertReferenceIsNotContent(withObservation({ id: 'x', measure: 'lead-image', value: 'https://example.com/studio-hero.jpg' })),
    /source asset/,
  );
  assert.throws(
    () => assertReferenceIsNotContent(withObservation({ id: 'x', measure: 'copy', value: 'W'.repeat(200) })),
    /not the source's words/,
  );
  assert.throws(
    () => assertReferenceIsNotContent({ ...base, sourceRef: { ...base.sourceRef, rightsStatus: 'approved-for-use' } }),
    /grants observation, never republication/,
  );
  assert.throws(
    () => assertReferenceIsNotContent({ ...base, instructionAuthority: 'user' }),
    /instructionAuthority must be none/,
  );
});

test('a trait outside the closed vocabulary cannot be stated', () => {
  assert.throws(
    () => buildReferenceAnalysis({
      projectId: 'project-a',
      sourceRef: { kind: 'url', label: 'Reference', requestedUrl: 'https://example.com/', canonicalUrl: 'https://example.com/' },
      observed: null,
      userIntent: { preference: 'like', influence: 'medium', liked: ['copy-their-hero-exactly'] },
      traitRegistry: traits,
      createdAt: '2026-08-26T10:00:00.000Z',
    }),
    /vocabulary is closed/,
  );
});

function approved(overrides) {
  return {
    referenceId: `reference-${'a'.repeat(16)}`,
    approval: { state: 'approved' },
    userIntent: { influence: 'medium' },
    adopt: [],
    avoid: [],
    ...overrides,
  };
}

function trait(name, { prefer = {}, refuse = {}, confidence = 'medium', consumer = 'axis' } = {}) {
  return { trait: name, useFor: 'layout', source: 'observed', confidence, consumer, consumerAbsentReason: null, prefer, refuse };
}

test('only approved references influence anything', () => {
  const influence = resolveReferenceInfluence([
    { ...approved({ adopt: [trait('oversized-display-type', { prefer: { visualDistinctiveness: 'expressive' } })] }), approval: { state: 'draft' } },
  ]);
  assert.equal(influence.influenced, false);
  assert.deepEqual(influence.prefer, {});
});

test('compatible references combine rather than compete', () => {
  const influence = resolveReferenceInfluence([
    approved({ referenceId: 'reference-aaaaaaaaaaaaaaaa', adopt: [trait('oversized-display-type', { prefer: { visualDistinctiveness: 'expressive' } })] }),
    approved({ referenceId: 'reference-bbbbbbbbbbbbbbbb', adopt: [trait('expressive-motion', { prefer: { motionIntensity: 'expressive' } })] }),
  ]);
  assert.deepEqual(influence.prefer, { visualDistinctiveness: 'expressive', motionIntensity: 'expressive' });
  assert.deepEqual(influence.conflicts, []);
});

test('a stronger influence settles a disagreement about one axis and leaves the others alone', () => {
  const influence = resolveReferenceInfluence([
    approved({
      referenceId: 'reference-aaaaaaaaaaaaaaaa',
      userIntent: { influence: 'medium' },
      adopt: [trait('restrained-motion', { prefer: { motionIntensity: 'subtle' } }), trait('narrow-reading-measure', { prefer: { maxWidth: '68rem' } })],
    }),
    approved({
      referenceId: 'reference-bbbbbbbbbbbbbbbb',
      userIntent: { influence: 'strong' },
      adopt: [trait('expressive-motion', { prefer: { motionIntensity: 'expressive' } })],
    }),
  ]);
  assert.equal(influence.prefer.motionIntensity, 'expressive');
  assert.equal(influence.prefer.maxWidth, '68rem');
  assert.equal(influence.conflicts.length, 1);
  assert.equal(influence.conflicts[0].resolution, 'resolved');
  assert.equal(influence.conflicts[0].axis, 'motionIntensity');
});

test('an even disagreement is surfaced rather than averaged into mush', () => {
  const influence = resolveReferenceInfluence([
    approved({ referenceId: 'reference-aaaaaaaaaaaaaaaa', adopt: [trait('restrained-motion', { prefer: { motionIntensity: 'subtle' } })] }),
    approved({ referenceId: 'reference-bbbbbbbbbbbbbbbb', adopt: [trait('expressive-motion', { prefer: { motionIntensity: 'expressive' } })] }),
  ]);
  assert.equal(influence.prefer.motionIntensity, undefined);
  assert.equal(influence.conflicts[0].resolution, 'unresolved');
  assert.match(influence.conflicts[0].detail, /choose one/);
});

test('one reference refusing a value outranks another preferring it', () => {
  const influence = resolveReferenceInfluence([
    approved({ referenceId: 'reference-aaaaaaaaaaaaaaaa', avoid: [trait('imagery-led-opening', { refuse: { heroStrategy: ['immersive'] } })] }),
    approved({ referenceId: 'reference-bbbbbbbbbbbbbbbb', adopt: [trait('imagery-led-opening', { prefer: { heroStrategy: 'immersive' } })] }),
  ]);
  assert.deepEqual(influence.refuse.heroStrategy, ['immersive']);
  assert.equal(influence.prefer.heroStrategy, undefined);
  assert.equal(influence.conflicts[0].kind, 'preference-refused');
});

test('a preference the factory cannot act on is reported, not silently applied', () => {
  const influence = resolveReferenceInfluence([
    approved({
      referenceId: 'reference-aaaaaaaaaaaaaaaa',
      avoid: [{ ...trait('dark-ground'), consumer: null, consumerAbsentReason: 'Every direction composes on a light ground.' }],
    }),
  ]);
  assert.equal(influence.influenced, false);
  assert.deepEqual(influence.unconsumed, [{
    referenceId: 'reference-aaaaaaaaaaaaaaaa',
    trait: 'dark-ground',
    intent: 'avoid',
    reason: 'Every direction composes on a light ground.',
  }]);
});

test('a reference URL that is not the public internet is refused before a browser opens', async () => {
  const lookup = async () => [{ address: '93.184.216.34' }];
  await assert.rejects(() => assertSafeReferenceUrl('http://localhost:4310/projects', { lookup }), /loopback/);
  await assert.rejects(() => assertSafeReferenceUrl('http://127.0.0.1/', { lookup }), /loopback/);
  await assert.rejects(() => assertSafeReferenceUrl('http://127.1/', { lookup }), /loopback/);
  await assert.rejects(() => assertSafeReferenceUrl('http://2130706433/', { lookup }), /loopback/);
  await assert.rejects(() => assertSafeReferenceUrl('http://[::1]/', { lookup }), /loopback/);
  await assert.rejects(() => assertSafeReferenceUrl('http://10.0.0.5/', { lookup }), /private/);
  await assert.rejects(() => assertSafeReferenceUrl('http://192.168.1.1/', { lookup }), /private/);
  await assert.rejects(() => assertSafeReferenceUrl('http://169.254.169.254/latest/meta-data/', { lookup }), /metadata/);
  await assert.rejects(() => assertSafeReferenceUrl('file:///etc/passwd', { lookup }), /http or https/);
  await assert.rejects(() => assertSafeReferenceUrl('data:text/html,<h1>hi</h1>', { lookup }), /http or https/);
  await assert.rejects(() => assertSafeReferenceUrl('https://user:secret@example.com/', { lookup }), /must not carry credentials/);
});

test('a public name that resolves somewhere private is refused at the resolution', async () => {
  const lookup = async () => [{ address: '127.0.0.1' }];
  await assert.rejects(() => assertSafeReferenceUrl('https://reference.example/', { lookup }), /resolves to 127\.0\.0\.1/);
});

test('the factory host\'s own public address is not a reference destination', async () => {
  const lookup = async () => [{ address: '203.0.113.10' }];
  await assert.rejects(
    () => assertSafeReferenceUrl('https://reference.example/', { lookup, hostAddresses: ['203.0.113.10'] }),
    /host-address/,
  );
});

test('a genuinely public reference URL is accepted', async () => {
  const lookup = async () => [{ address: '93.184.216.34' }];
  const url = await assertSafeReferenceUrl('https://reference.example/work', { lookup });
  assert.equal(url.href, 'https://reference.example/work');
});
