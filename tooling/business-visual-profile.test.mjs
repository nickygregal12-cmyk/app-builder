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
