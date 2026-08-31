/**
 * Qualification, checked against the two businesses this repository actually has.
 *
 * The most useful test here is the one that would have caught the checker's own
 * first bug: it read `audience.targetUsers`, a field that exists in the
 * generated acceptance fixtures and not in `schemas/project-manifest.schema.json`,
 * and reported the accepted nbm run as unqualified for a proof run it had
 * already passed. A checklist that is wrong about a case somebody has already
 * cleared will be ignored on the case it is right about.
 *
 * The second most useful is the pair of negative tests on placeholder
 * detection. Telling somebody their real phone number looks fake is the
 * expensive direction to be wrong in.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { qualifyBusiness, suspectEmail, suspectPhone } from './lib/business-qualification.mjs';

const NBM = JSON.parse(fs.readFileSync('examples/genuine-business/nbm-approved-intake.v1.json', 'utf8'));
const MGB = JSON.parse(fs.readFileSync('examples/genuine-business/mgb-approved-intake.v1.json', 'utf8'));

// --- The two real businesses ----------------------------------------------------------

test('the accepted nbm intake qualifies for a proof run', () => {
  const result = qualifyBusiness(NBM);
  assert.equal(result.tiers.proofRun.qualified, true, `blocked by ${result.tiers.proofRun.blockedBy.join(', ')}`);
  assert.equal(result.business, 'nbm Construction Cost Consultants');
});

test('nbm is not launch-qualified, and every reason is a decision rather than a defect', () => {
  const result = qualifyBusiness(NBM);
  assert.equal(result.tiers.launch.qualified, false);
  // Nothing to collect and nothing broken: three things somebody has to decide.
  assert.equal(result.counts.requiredContent, 0);
  assert.deepEqual(result.tiers.launch.blockedBy, ['authority to publish', 'asset rights', 'domain ownership']);
});

test('nbm real contact details are not mistaken for placeholders', () => {
  const result = qualifyBusiness(NBM);
  const suspected = result.gaps.filter((gap) => gap.subject.startsWith('production '));
  assert.deepEqual(suspected, [], 'a real Glasgow phone number was reported as a placeholder');
});

test('the MGB prototype intake is proof-qualified and launch-blocked on its placeholder contact', () => {
  const result = qualifyBusiness(MGB);

  assert.equal(result.tiers.proofRun.qualified, true, `blocked by ${result.tiers.proofRun.blockedBy.join(', ')}`);
  assert.equal(result.tiers.launch.qualified, false);
  assert.ok(result.tiers.launch.blockedBy.includes('production email'));
  assert.ok(result.tiers.launch.blockedBy.includes('production phone'));

  // This is the finding config/factory-status.json already records in prose —
  // "for launch rather than proof: production contact details … and domain
  // ownership" — derived from the bundle rather than written down by hand.
  const email = result.gaps.find((gap) => gap.subject === 'production email');
  assert.match(email.detail, /test@mgb\.com/);
  assert.equal(email.kind, 'owner-authority');
});

// --- Placeholders are caught, and real details are not -----------------------------------

test('placeholder emails are caught by a named rule', () => {
  assert.match(suspectEmail('test@mgb.com'), /local part is "test"/);
  assert.match(suspectEmail('hello@example.com'), /reserved or non-routable/);
  assert.match(suspectEmail('info@studio.invalid'), /reserved or non-routable/);
  assert.match(suspectEmail('noreply@anywhere.co.uk'), /local part/);
});

test('ordinary business emails are left alone', () => {
  for (const email of ['enquiries@nbm.bz', 'gary@mgbdecor.co.uk', 'studio@fenwickhale.com', 'mail@test-valley-joinery.co.uk']) {
    assert.equal(suspectEmail(email), null, `${email} was reported as a placeholder`);
  }
});

test('typed phone numbers are caught and dialled ones are not', () => {
  assert.match(suspectPhone('123456789'), /run in sequence/);
  assert.match(suspectPhone('000 000 0000'), /every digit is "0"/);
  assert.match(suspectPhone('1234'), /only 4 digits/);
  assert.equal(suspectPhone('987654321'), 'the digits run in sequence');

  for (const phone of ['0141 333 1836', '+44 7700 900123', '01524 000913', '(0117) 946 2200']) {
    assert.equal(suspectPhone(phone), null, `${phone} was reported as a placeholder`);
  }
});

test('an absent contact field is not a suspected placeholder', () => {
  assert.equal(suspectEmail(''), null);
  assert.equal(suspectPhone(null), null);
});

// --- Classification -----------------------------------------------------------------------

test('optional gaps never block either tier', () => {
  for (const bundle of [NBM, MGB]) {
    for (const gap of qualifyBusiness(bundle).gaps.filter((entry) => entry.kind === 'optional-content')) {
      assert.deepEqual(gap.blocks, [], `${gap.subject} is optional and blocks something`);
    }
  }
});

test('declaring the owner decisions closes exactly those gaps and nothing else', () => {
  const before = qualifyBusiness(NBM);
  const after = qualifyBusiness(NBM, { publicationAuthority: true, assetRights: true, domainOwnership: true });

  assert.equal(before.tiers.launch.qualified, false);
  assert.equal(after.tiers.launch.qualified, true);
  // The optional gap survives, because a decision is not content.
  assert.equal(after.counts.optionalContent, before.counts.optionalContent);
});

test('declaring authority does not launch-qualify a business whose contact is a placeholder', () => {
  const result = qualifyBusiness(MGB, { publicationAuthority: true, assetRights: true, domainOwnership: true });
  assert.equal(result.tiers.launch.qualified, false);
  assert.deepEqual(result.tiers.launch.blockedBy, ['production email', 'production phone']);
});

test('an unresolved legal or truth blocker stops even a proof run', () => {
  const result = qualifyBusiness(NBM, { legalOrTruthBlockers: ['The claimed accreditation could not be confirmed with the issuing body.'] });
  assert.equal(result.tiers.proofRun.qualified, false);
  assert.ok(result.gaps.some((gap) => gap.kind === 'owner-authority' && gap.detail.includes('issuing body')));
});

// --- Refusals ---------------------------------------------------------------------------------

test('a bundle with no manifest qualifies for nothing and says why', () => {
  const result = qualifyBusiness({ bundleId: 'empty' });
  assert.equal(result.tiers.proofRun.qualified, false);
  assert.equal(result.tiers.launch.qualified, false);
  assert.match(result.gaps[0].detail, /no project manifest/);
});

test('a business with nothing to build three routes from is refused', () => {
  const thin = JSON.parse(JSON.stringify(NBM));
  thin.projectManifest.company.services = ['One service'];
  thin.projectManifest.company.locations = [];
  thin.projectManifest.company.trustSignals = [];

  const result = qualifyBusiness(thin);
  assert.equal(result.tiers.proofRun.qualified, false);
  assert.ok(result.tiers.proofRun.blockedBy.includes('material for three purposeful routes'));
});

test('a business with no governed source is refused, because every fact would be unprovenanced', () => {
  const unsourced = JSON.parse(JSON.stringify(NBM));
  unsourced.projectManifest.inputs = {};

  const result = qualifyBusiness(unsourced);
  assert.equal(result.tiers.proofRun.qualified, false);
  assert.ok(result.tiers.proofRun.blockedBy.includes('governed source material'));
});

test('a qualification states what it does not establish', () => {
  const result = qualifyBusiness(NBM);
  assert.ok(result.doesNotEstablish.some((sentence) => sentence.includes('are true')));
  assert.ok(result.doesNotEstablish.some((sentence) => sentence.includes('will be any good')));
});
