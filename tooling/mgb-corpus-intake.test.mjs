/**
 * The MGB Decor corpus input, and the promotions it must never make.
 *
 * MGB is the second genuine-business case and the first one run as an explicit
 * prototype: the owner supplied enough real fact to build and judge a site, and
 * did not supply production contact details, review evidence, project
 * histories, asset bytes or a domain. That mixture is the point. A prototype
 * input is only safe if the difference between an owner-supplied fact, a public
 * reference location and a clearly labelled placeholder survives every replay.
 *
 * Each test below is one silent promotion this bundle must stay incapable of.
 * They are deliberately written against the committed artifact rather than
 * against a fixture, because the artifact is what a rerun replays.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract } from '../packages/contracts/src/index.js';
import { replayApprovedIntake } from '../apps/service/src/approved-intake.js';

const MGB_BUNDLE = 'examples/genuine-business/mgb-approved-intake.v1.json';
const bundle = JSON.parse(fs.readFileSync(MGB_BUNDLE, 'utf8'));
const sources = bundle.intake.sourceReferences;
const sourceById = (id) => sources.find((source) => source.id === id);

/** Every string anywhere in the bundle, so a claim cannot hide in a field this test did not think to name. */
function everyString(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const item of value) everyString(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) everyString(item, out);
  return out;
}

/**
 * The part of the bundle that becomes published product truth.
 *
 * Exclusions, hard constraints, source purposes and intake feedback all discuss
 * claims in order to forbid them, so scanning the whole artifact for a word
 * would fail on its own honesty. Composition reads the Manifest's project,
 * audience, journeys, surfaces, entities, company and brand; that is what a
 * claim has to stay out of.
 */
const { project, audience, journeys, majorSurfaces, entities, company, brand } = bundle.projectManifest;
const publishedText = everyString({ project, audience, journeys, majorSurfaces, entities, company, brand }).join('\n').toLowerCase();

test('the committed MGB corpus input validates, replays and is exactly what its builder produces', () => {
  assert.deepEqual(validateContract('approved-intake-bundle', bundle), []);
  assert.equal(bundle.provenance.producedBy, 'operator-authored');
  // Nothing was lost here, so this bundle must not borrow NBM's excuse.
  assert.equal(bundle.provenance.replacesUnrecoverableIntake, undefined);
  assert.match(bundle.provenance.note, /prototype/i);

  const replayed = replayApprovedIntake(bundle);
  assert.deepEqual(replayed.drift, [], 'the committed baseline must replay against the current questionnaire');
  assert.equal(replayed.rebuiltContractHash, bundle.buildContractHash);
  assert.equal(replayed.rebuiltManifestHash, bundle.projectManifestHash);

  // A committed corpus input that cannot be regenerated is a fixture nobody can
  // check. Rebuild it and require the same bytes.
  const rebuilt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-mgb-intake-')), 'rebuilt.json');
  const result = spawnSync(process.execPath, ['examples/genuine-business/build-mgb-intake-bundle.mjs', rebuilt], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(rebuilt, 'utf8'), fs.readFileSync(MGB_BUNDLE, 'utf8'));
});

test('the owner facts that were supplied survive replay intact', () => {
  const { projectManifest: manifest } = replayApprovedIntake(bundle);
  assert.equal(manifest.project.name, 'MGB Decor');
  assert.equal(manifest.company.identity.legalName, 'MGB Decor Ltd');
  assert.deepEqual(manifest.company.services, [
    'Interior painting and decorating',
    'Exterior painting and decorating',
    'Wallpapering',
    'Wallpaper removal',
    'Commercial decorating',
    'New-build decorating',
    'Property refurbishment',
    'Ames taping',
  ]);
  assert.deepEqual(manifest.company.locations, ['Glasgow', 'West of Scotland']);
  assert.match(manifest.project.primaryGoal, /quote and WhatsApp enquiries/);
});

test('a public social profile is a place to look, never permission to publish', () => {
  for (const id of ['mgb-facebook', 'mgb-instagram', 'mgb-companies-house-psc']) {
    const source = sourceById(id);
    assert.ok(source, id);
    assert.equal(source.rightsStatus, 'reference-only', `${id} rights`);
    assert.equal(source.publishUseAllowed, false, `${id} publish`);
    // `approved` is the only assetStatus that carries publication weight, and a
    // reference-only source can never reach it.
    assert.notEqual(source.assetStatus, 'approved', `${id} asset status`);
  }
  // The exact owner-supplied identifiers, not rediscovered ones.
  assert.equal(sourceById('mgb-facebook').uri, 'https://www.facebook.com/mgbdecor2020/?locale=en_GB');
  assert.equal(sourceById('mgb-instagram').uri, 'https://www.instagram.com/mgbdecor2020/');
});

test('a rights declaration without bytes never looks like an ingested asset', () => {
  const declared = ['mgb-logo', 'mgb-project-photo-1', 'mgb-project-photo-2'];
  for (const id of declared) {
    const source = sourceById(id);
    assert.ok(source, id);
    // The rights decision is real and is kept.
    assert.equal(source.rightsStatus, 'approved-for-use', `${id} rights`);
    // Nothing was ingested, so nothing may read as ingested.
    assert.equal(source.assetStatus, undefined, `${id} must not be an approved asset`);
    assert.equal(source.publishUseAllowed, false, `${id} publish`);
    assert.equal(source.uri, undefined, `${id} has no retrievable location`);
    assert.equal(source.size, undefined, `${id} has no byte count`);
    assert.match(source.purpose, /outstanding|never handed over/i, `${id} says the bytes are missing`);
  }

  // No invented hashes. The only SHA-256s in the bundle are the two artifact
  // hashes the contract requires; an asset digest would show up here.
  const hashes = new Set((JSON.stringify(bundle).match(/\b[0-9a-f]{64}\b/g) ?? []));
  assert.deepEqual([...hashes].sort(), [bundle.buildContractHash, bundle.projectManifestHash].sort());
});

test('a prototype placeholder never becomes a verified business fact', () => {
  const { projectManifest: manifest } = replayApprovedIntake(bundle);
  // The placeholders are present, because the quote and contact journeys have
  // to be buildable and reviewable.
  assert.equal(manifest.company.contactDetails.phone, '123456789');
  assert.equal(manifest.company.contactDetails.email, 'test@mgb.com');
  // And the bundle says out loud that they are placeholders, in the two places
  // a later run reads: the constraints the build must honour, and the intake
  // feedback that records what the questionnaire could not express.
  assert.ok(
    bundle.intake.answers.hard_constraints.some((item) => /placeholder/i.test(item) && /never be recorded as verified/i.test(item)),
    'a hard constraint must name the placeholders',
  );
  const placeholderFeedback = bundle.intake.feedback.find((item) => item.questionId === 'contact_details');
  assert.equal(placeholderFeedback.type, 'missing-requirement');
  assert.match(placeholderFeedback.detail, /placeholder/i);
});

test('owner-supplied business history never becomes a register fact', () => {
  const description = bundle.intake.answers.company_identity.description;
  // The owner's history is carried.
  assert.match(description, /founded in 2020/i);
  // The company number is carried as something the owner supplied.
  assert.match(description, /owner-supplied company number: SC690594/i);
  // Nothing in the whole bundle asserts incorporation, registration or a
  // register status, because the Companies House source was never ingested.
  for (const forbidden of ['incorporated', 'incorporation', 'registered office', 'registered in scotland', 'ltd since']) {
    assert.equal(publishedText.includes(forbidden), false, `published truth must not assert "${forbidden}"`);
  }
  assert.equal(sourceById('mgb-companies-house-psc').rightsStatus, 'reference-only');
});

test('an unsupplied qualification never becomes a published claim', () => {
  const { projectManifest: manifest } = replayApprovedIntake(bundle);
  // NBM's precedent and trial finding F23: intake trust answers were once
  // published as the company's own evidence, so nothing goes here that no
  // approved source supports.
  assert.deepEqual(manifest.company.trustSignals, []);
  assert.equal(bundle.intake.answers.trust, undefined, '`trust` is deliberately unanswered');

  // The claims a generic local-trades template would invent are excluded by
  // name rather than merely left out.
  const excluded = manifest.outOfScope.join(' ').toLowerCase();
  for (const claim of ['awards', 'ratings', 'review counts', 'customer counts', 'workmanship guarantees', 'accreditations', 'qualifications', 'trade memberships']) {
    assert.ok(excluded.includes(claim), `out of scope must name ${claim}`);
  }
  // The owner's own wording, not a number nobody supplied.
  assert.match(bundle.intake.answers.company_identity.description, /experienced decorating team/i);
  assert.equal(/\d+\s*\+?\s*years/i.test(publishedText), false, 'no years-of-experience claim may appear');
});

test('prototype project material never becomes a source-backed customer fact', () => {
  const { projectManifest: manifest } = replayApprovedIntake(bundle);
  const excluded = manifest.outOfScope.join(' ').toLowerCase();
  assert.ok(excluded.includes('named clients'), 'named clients are excluded');
  assert.ok(excluded.includes('customer reviews or testimonials'), 'reviews are excluded');
  // No source in the bundle is generated material dressed as supplied material.
  for (const source of sources) {
    assert.notEqual(source.provenance, 'generated', `${source.id} must not be generated material`);
  }
  // Every approved-for-use source is owner-supplied. Nothing earns publication
  // rights by being reachable.
  for (const source of sources.filter((item) => item.rightsStatus === 'approved-for-use')) {
    assert.equal(source.provenance, 'user-supplied', `${source.id} provenance`);
  }
});

test('a preferred domain is not an owned domain', () => {
  const { projectManifest: manifest } = replayApprovedIntake(bundle);
  // `siteUrl` is what makes the build assert a canonical link, an og:url and a
  // WebSite object. Nobody has established that mgbdecor.com is available,
  // owned or configured, so the build asserts no address at all.
  assert.equal(manifest.project.siteUrl, undefined);
  assert.equal(bundle.intake.answers.existing_site, undefined);
  // The preference is recorded exactly once, as a preference.
  const domainFeedback = bundle.intake.feedback.filter((item) => /mgbdecor\.com/i.test(item.detail ?? ''));
  assert.equal(domainFeedback.length, 1);
  assert.equal(domainFeedback[0].type, 'missing-requirement');
  assert.match(domainFeedback[0].detail, /preference|prefers/i);
});

test('a requirement this factory cannot meet is preserved, not deleted and not faked', () => {
  const byId = new Map(bundle.intake.feedback.map((item) => [item.id, item]));
  // Each of these is a real thing MGB asked for that the current factory does
  // not do. Losing one silently is the failure this test exists to prevent.
  for (const id of [
    'mgb-feedback-whatsapp-conversion',
    'mgb-feedback-insurance-trust',
    'mgb-feedback-social-profiles',
    'mgb-feedback-quote-photo-upload',
    'mgb-feedback-asset-bytes-outstanding',
  ]) {
    const entry = byId.get(id);
    assert.ok(entry, `${id} must be recorded`);
    assert.equal(entry.type, 'missing-requirement');
    assert.ok((entry.detail ?? '').length > 80, `${id} must say what was missing`);
  }

  // Photo upload is unmet, not excluded by the owner and not silently enabled:
  // `uploads` would move a marketing site onto the application renderer.
  assert.equal(bundle.intake.answers.uploads, undefined);
  assert.equal(bundle.projectManifest.modules.uploads, false);
  assert.equal(bundle.buildContract.requestedModules.includes('uploads'), false);

  // WhatsApp is the owner's named secondary route and survives as a conversion
  // goal even though the questionnaire has no word for it.
  assert.ok(bundle.projectManifest.company.conversionGoals.includes('quote request'));
  assert.ok(bundle.projectManifest.company.conversionGoals.includes('other'));
});
