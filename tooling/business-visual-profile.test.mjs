/**
 * Selection has to be able to tell two businesses apart.
 *
 * The hosted evidence for #225 showed what it costs when it cannot. nbm and MGB
 * are both `marketing-site` with no publishable photography, so both were
 * offered the same four directions, both had `immersive-lead` refused for the
 * same reason, and both received the identical remaining three in the identical
 * order. The screenshots show the same navigation, the same split hero, the same
 * ruled headings, the same numbered panels and the same footer carrying
 * different words.
 *
 * These tests hold the derived profile that distinguishes them, and hold the old
 * failure planted: if selection stops responding to the business, the ranking
 * assertions collapse to registry order and fail.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { deriveBusinessVisualProfile, scoreDirectionAgainstProfile } from './lib/business-visual-profile.mjs';
import { compileAssetReadiness } from './lib/asset-readiness.mjs';
import { loadVisualDirections, selectVisualDirections } from './lib/visual-direction.mjs';

const bundle = (slug) => JSON.parse(fs.readFileSync(`examples/genuine-business/${slug}-approved-intake.v1.json`, 'utf8'));
const registry = loadVisualDirections(process.cwd());
const typographic = () => compileAssetReadiness({ knowledgePack: null, assetDecisions: [] });

function profileFor(slug, composition = null) {
  return deriveBusinessVisualProfile({ manifest: bundle(slug).projectManifest, composition, assetReadiness: typographic() });
}

function selectionFor(slug, composition = null) {
  return selectVisualDirections({
    projectType: 'marketing-site',
    registry,
    assetReadiness: typographic(),
    composition,
    businessProfile: profileFor(slug, composition),
  });
}

test('the two genuine businesses derive materially different profiles', () => {
  const nbm = profileFor('nbm').values;
  const mgb = profileFor('mgb').values;

  // The signals that separate them, each from a structured approved field.
  assert.equal(nbm.serviceBreadth, 'focused', 'nbm declares four services');
  assert.equal(mgb.serviceBreadth, 'broad', 'mgb declares eight');
  assert.equal(nbm.showcaseIntent, 'information-led', 'nbm declares no work surface');
  assert.ok(mgb.showcaseIntent.startsWith('work-led'), 'mgb declares Our Work');
  assert.notEqual(nbm.contentDensity, mgb.contentDensity);

  // And the signals that legitimately agree. Two local services with no
  // photography and no approved trust evidence genuinely are alike in those
  // respects, and a profile that manufactured a difference here would be
  // inventing one.
  assert.equal(nbm.assetMode, 'typographic');
  assert.equal(mgb.assetMode, 'typographic');
  assert.equal(nbm.evidenceDepth, 'unevidenced');
  assert.equal(mgb.evidenceDepth, 'unevidenced');

  const differing = Object.keys(nbm).filter((key) => nbm[key] !== mgb[key]);
  assert.ok(differing.length >= 3, `two different businesses should differ on more than one signal; differed on ${differing.join(', ')}`);
});

test('every signal names the field it was read from and why', () => {
  for (const slug of ['nbm', 'mgb']) {
    for (const entry of profileFor(slug).signals) {
      // An opaque score cannot be argued with, and this feeds a design decision
      // a person is entitled to disagree with.
      assert.ok(entry.field.length > 0, `${slug}/${entry.id} must name its source field`);
      assert.ok(entry.because.length > 0, `${slug}/${entry.id} must explain itself`);
      assert.match(entry.because, /\S/);
    }
  }
});

test('the profile invents nothing: it reads approved fields and asserts no facts', () => {
  const manifest = bundle('mgb').projectManifest;
  const profile = deriveBusinessVisualProfile({ manifest, composition: null, assetReadiness: typographic() });
  const serialised = JSON.stringify(profile);

  // It must not carry business content into a presentation decision. A profile
  // that quoted services or contact details would become a second place those
  // facts live, and provenance would have nowhere to attach.
  for (const service of manifest.company.services) assert.doesNotMatch(serialised, new RegExp(service, 'i'), `${service} is a fact, not a design signal`);
  assert.doesNotMatch(serialised, /test@mgb\.com|123456789/, 'contact details are not design signals');
  assert.doesNotMatch(serialised, /SC690594/);

  // Every value is a member of a small closed design vocabulary rather than a
  // business or industry name, which is what stops it overfitting the corpus.
  for (const entry of profile.signals) assert.match(entry.value, /^[a-z][a-z-]*$/, `${entry.id} should be a design characteristic, not a name`);
});

test('selection ranks the same eligible directions differently for the two businesses', () => {
  const nbm = selectionFor('nbm');
  const mgb = selectionFor('mgb');

  // The planted regression. Before the profile these two were byte-identical.
  assert.notDeepEqual(
    nbm.eligible.map((direction) => direction.id),
    mgb.eligible.map((direction) => direction.id),
    'two materially different businesses must not receive an identical ordered direction set',
  );

  assert.equal(nbm.fit[0].directionId, 'editorial-authority', 'a focused, information-led practice leads with the editorial direction');
  assert.equal(mgb.fit[0].directionId, 'schedule-register', 'a broad, dense service catalogue leads with the register');
  assert.ok(nbm.fit[0].score > mgb.fit[0].score || nbm.fit[0].directionId !== mgb.fit[0].directionId);
});

test('every chosen direction records why it was chosen', () => {
  for (const slug of ['nbm', 'mgb']) {
    const { eligible, fit } = selectionFor(slug);
    assert.equal(fit.length, eligible.length);
    for (const entry of fit) {
      assert.ok(Number.isInteger(entry.score) && entry.score >= 0);
      assert.equal(entry.matched.length, entry.score, 'the score is the count of matched signals, so it can be checked rather than trusted');
    }
  }
});

/**
 * The measurement that specifies the next piece of work.
 *
 * MGB's third direction scores zero: it is eligible, it renders, and nothing
 * about this business argues for it. That is not a bug in the ranking — it is
 * the ranking reporting that the registry has no third answer for a broad,
 * conversion-led, imagery-poor catalogue, and a tie resolved on registry order
 * is what a set looks like when the shelf is empty.
 *
 * This asserts the ranking is honest about that rather than flattering it. When
 * a direction is added that genuinely serves this shape, this test should fail
 * and be updated with the better score, which is the point.
 */
test('a direction nothing argues for scores zero rather than being flattered', () => {
  const { fit } = selectionFor('mgb');
  const weakest = fit[fit.length - 1];
  assert.equal(weakest.score, 0);
  assert.deepEqual(weakest.matched, []);
  assert.ok(
    fit.filter((entry) => entry.score === 0).length >= 1,
    'the registry currently offers marketing sites three imagery-poor directions; a zero here is the shelf being empty, not the ranking failing',
  );
});

test('without a profile, selection behaves exactly as it did before', () => {
  const assetReadiness = typographic();
  const before = selectVisualDirections({ projectType: 'marketing-site', registry, assetReadiness });
  // Explicitly requested directions and synthetic fixtures depend on this.
  assert.ok(before.eligible.length >= 2);
  assert.equal(before.fit, undefined, 'no profile means no fit was computed, rather than a fit computed from nothing');
});

test('a direction that suits nothing still competes rather than being refused', () => {
  const profile = profileFor('mgb');
  const scored = scoreDirectionAgainstProfile(registry.directions['structured-practice'], profile);
  assert.equal(scored.score, 0);
  const { eligible, refused } = selectionFor('mgb');
  assert.ok(eligible.some((direction) => direction.id === 'structured-practice'), 'a poor fit is not a refusal; a set of three has to come from somewhere');
  assert.ok(!refused.some((entry) => entry.reason === 'lower-business-fit'), 'nothing was dropped for fit here, because only three were eligible');
});

/**
 * The failure mode this whole mechanism could quietly become.
 *
 * With two genuine businesses in the corpus, a selector that learned
 * `nbm -> editorial` and `mgb -> register` would pass every test above while
 * having understood nothing. It would also be invisible: the rankings would look
 * considered and the reasons would read plausibly.
 *
 * These are the tests that make that impossible to fake. Identity must not
 * reach the decision, and a real change in design need must.
 */

/** The same business, renamed. Nothing a designer would care about has moved. */
function renamed(slug, name) {
  const manifest = structuredClone(bundle(slug).projectManifest);
  manifest.project.name = name;
  manifest.project.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  manifest.company.identity.name = name;
  manifest.company.identity.legalName = `${name} Ltd`;
  return manifest;
}

function selectManifest(manifest, composition = null) {
  const assetReadiness = typographic();
  const businessProfile = deriveBusinessVisualProfile({ manifest, composition, assetReadiness });
  const selection = selectVisualDirections({ projectType: 'marketing-site', registry, assetReadiness, composition, businessProfile });
  return { profile: businessProfile, selection };
}

test('changing only the company name changes nothing about the selection', () => {
  for (const slug of ['nbm', 'mgb']) {
    const original = selectManifest(bundle(slug).projectManifest);
    const swapped = selectManifest(renamed(slug, 'Ordinary Trading Company'));

    assert.deepEqual(swapped.profile.values, original.profile.values, `${slug}: a rename must not move a single derived signal`);
    assert.deepEqual(
      swapped.selection.fit,
      original.selection.fit,
      `${slug}: a rename must not change the ranking, or the selector has learned the company rather than the business`,
    );
  }
});

test('two differently-named businesses with the same design needs get the same directions', () => {
  // The generalisation claim, stated as a test: design need decides, identity
  // does not. Two local services with the same shape should be treated alike
  // however they are called.
  const first = selectManifest(renamed('mgb', 'Northern Coatings'));
  const second = selectManifest(renamed('mgb', 'Southside Painters'));
  assert.deepEqual(first.profile.values, second.profile.values);
  assert.deepEqual(
    first.selection.eligible.map((direction) => direction.id),
    second.selection.eligible.map((direction) => direction.id),
  );
});

test('no company name appears anywhere in the derived profile', () => {
  for (const slug of ['nbm', 'mgb']) {
    const manifest = bundle(slug).projectManifest;
    const serialised = JSON.stringify(deriveBusinessVisualProfile({ manifest, composition: null, assetReadiness: typographic() }));
    for (const token of manifest.project.name.split(/\s+/).filter((word) => word.length > 3)) {
      assert.doesNotMatch(serialised, new RegExp(token, 'i'), `${token} must not reach a presentation decision`);
    }
  }
});

test('a meaningful change in design need does change the fit', () => {
  const base = selectManifest(bundle('nbm').projectManifest);

  // Perturb the shape rather than the identity: the same practice, if it grew
  // into a broad catalogue with a work surface to show.
  const grown = structuredClone(bundle('nbm').projectManifest);
  grown.company.services = [...grown.company.services, 'Contract Administration', 'Feasibility Studies', 'Dispute Resolution', 'Asset Capture'];
  grown.majorSurfaces = [...grown.majorSurfaces, 'Our Work'];
  const changed = selectManifest(grown);

  assert.equal(base.profile.values.serviceBreadth, 'focused');
  assert.equal(changed.profile.values.serviceBreadth, 'broad', 'eight services is a different design problem from four');
  assert.notEqual(changed.profile.values.showcaseIntent, base.profile.values.showcaseIntent);
  assert.notDeepEqual(
    changed.selection.fit.map((entry) => entry.directionId),
    base.selection.fit.map((entry) => entry.directionId),
    'a business that changed shape should be ranked differently, or the signals are decorative',
  );
});

test('the same business replayed twice selects identically', () => {
  for (const slug of ['nbm', 'mgb']) {
    const first = selectManifest(bundle(slug).projectManifest);
    const second = selectManifest(bundle(slug).projectManifest);
    assert.deepEqual(second.selection.fit, first.selection.fit, `${slug}: selection must be deterministic`);
    assert.deepEqual(second.profile, first.profile);
  }
});

test('a synthetic profile with no corpus lineage still ranks sensibly', () => {
  // Nothing here comes from either real business, which is the point: the rules
  // must work on a shape they have never seen rather than on two remembered
  // companies.
  const synthetic = {
    project: { name: 'Synthetic Fixture', type: 'marketing-site' },
    journeys: ['Read the argument', 'Get in touch'],
    majorSurfaces: ['Home', 'About', 'Contact'],
    company: { services: ['One service'], locations: [], trustSignals: ['Chartered member'], conversionGoals: ['contact form'] },
  };
  const { profile, selection } = selectManifest(synthetic);
  assert.equal(profile.values.serviceBreadth, 'focused');
  assert.equal(profile.values.evidenceDepth, 'evidenced');
  assert.equal(profile.values.showcaseIntent, 'information-led');
  assert.equal(profile.values.serviceReach, 'broad');
  // A focused, evidenced, information-led practice is what structured-practice
  // and editorial-authority are for; the register is not.
  assert.ok(['structured-practice', 'editorial-authority'].includes(selection.fit[0].directionId));
  assert.ok(selection.fit[0].score > 0, 'a clearly-shaped business should match something');
});

test('business fit never argues an invalid direction into existence', () => {
  // Ranking runs after refusal, and must stay there. An imagery-led business
  // whose imagery is not publishable still cannot have immersive-lead.
  const showcase = structuredClone(bundle('mgb').projectManifest);
  const { selection } = selectManifest(showcase);
  assert.ok(
    selection.refused.some((entry) => entry.directionId === 'immersive-lead' && entry.reason === 'imagery-not-available'),
    'no publishable imagery must still refuse an imagery-required direction, whatever the business fit says',
  );
  assert.ok(!selection.eligible.some((direction) => direction.id === 'immersive-lead'));
});
