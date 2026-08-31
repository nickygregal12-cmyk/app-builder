/**
 * The visual-excellence corpus, held to what it claims to be.
 *
 * Two failures this file exists to make impossible.
 *
 * The first is invented material leaking. This corpus contains testimonials,
 * awards, projects and named people that do not exist. A benchmark bundle that
 * lost its `benchmark` declaration, or a source that stopped saying
 * `provenance: generated`, would be indistinguishable from a real company's
 * approved input — and the material inside it would then be read as a claim
 * about a real practice.
 *
 * The second is a compromised baseline. The whole value of an ideal-input
 * benchmark is that its input is ideal. A run photographed before the
 * photographs exist answers a different question and then sits in the record
 * under this one's name, so the readiness gate has to refuse and has to keep
 * refusing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { assessBenchmarkAssetReadiness } from './lib/benchmark-asset-readiness.mjs';
import { classifyCandidateTruthReadiness } from './lib/candidate-truth-readiness.mjs';
import { validateContract } from '../packages/contracts/src/index.js';

const ROOT = 'examples/visual-excellence';
const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const BUNDLE = read('ardwell-roe-approved-intake.v1.json');
const PACK = read('ardwell-roe-approved-knowledge.v1.json');
const PLAN = read('ardwell-roe-asset-plan.v1.json');

test('a benchmark bundle says it is fictional, in the artifact rather than beside it', () => {
  const benchmark = BUNDLE.provenance?.benchmark;
  assert.ok(benchmark, 'the declaration must travel with the bundle, or a replay elsewhere looks like a real company');
  assert.equal(benchmark.businessReality, 'fictional');
  assert.equal(benchmark.truthPurpose, 'visual-excellence-benchmark');
  assert.equal(benchmark.publicationAllowed, 'benchmark-only');
  assert.equal(benchmark.externalVerification, 'not-applicable');
  assert.equal(benchmark.corpus, 'visual-excellence');
});

test('no genuine-business input may carry a benchmark declaration, and no benchmark input may omit one', () => {
  for (const file of fs.readdirSync('examples/genuine-business').filter((name) => name.endsWith('-approved-intake.v1.json'))) {
    const bundle = JSON.parse(fs.readFileSync(path.join('examples/genuine-business', file), 'utf8'));
    assert.equal(bundle.provenance?.benchmark, undefined, `${file} is a real business and must not carry invented-truth provenance`);
  }
  for (const file of fs.readdirSync(ROOT).filter((name) => name.endsWith('-approved-intake.v1.json'))) {
    const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    assert.equal(bundle.provenance?.benchmark?.businessReality, 'fictional', `${file} is in the benchmark corpus and must say so`);
  }
});

test('every benchmark source is generated, and none pretends to have been found', () => {
  for (const source of BUNDLE.projectManifest.inputs.sources) {
    assert.equal(source.provenance, 'generated', `${source.id} claims provenance ${source.provenance}; nothing here was crawled, uploaded or looked up`);
    assert.equal(source.instructionAuthority, 'none');
  }
  for (const record of [...PACK.facts, ...PACK.content, ...PACK.chunks]) {
    assert.equal(record.provenance, 'generated', 'a benchmark pack record claims non-generated provenance');
  }
});

test('a benchmark fact is never recorded as externally verified', () => {
  // `verified` would mean something checked it. Nothing could have: there is no
  // register, no site and no third party. `user-provided` is the true state.
  for (const fact of PACK.facts) {
    assert.equal(fact.verification, 'user-provided', `fact ${fact.id} claims verification ${fact.verification}`);
  }
});

test('the benchmark cannot reach anybody', () => {
  // Enforced by the internet and the numbering plan rather than by a promise:
  // `.invalid` is reserved by RFC 2606 and resolves nowhere, and 0117 496 0xxx
  // is inside the block Ofcom reserves for drama and never allocates.
  const contact = BUNDLE.projectManifest.company.contactDetails;
  assert.match(contact.email, /@[^@]*\.invalid$/, 'a benchmark email must be unroutable');
  assert.match(contact.website ?? 'https://x.invalid/', /\.invalid\/?$/, 'a benchmark website must not resolve');
  assert.match(contact.phone, /^0117 496 0\d{3}$/, 'a benchmark telephone number must come from the reserved drama range');
});

test('the source pack is rich enough to be the input this benchmark claims to be', () => {
  // The floor is not arbitrary: it is the point below which "the input was
  // thin" becomes available again as an explanation for a weak result, which
  // is the confound this corpus exists to remove.
  const profile = PACK.companyProfile;
  assert.ok(profile.projects.length >= 4, `only ${profile.projects.length} projects`);
  assert.ok(profile.people.length >= 3, `only ${profile.people.length} people`);
  assert.ok(profile.testimonials.length >= 3, `only ${profile.testimonials.length} testimonials`);
  assert.ok(profile.accreditations.length >= 3, `only ${profile.accreditations.length} awards`);
  assert.ok(profile.services.length >= 6, `only ${profile.services.length} services`);
  // Each project must carry narrative, not just a name — that is the difference
  // between a portfolio and a list, and it is what the composer is being tested on.
  for (const project of profile.projects) {
    for (const field of ['description', 'challenge', 'response', 'materials', 'outcome']) {
      assert.ok(String(project[field] ?? '').length > 80, `project ${project.name} has no substantial ${field}`);
    }
  }
});

test('both benchmark artifacts regenerate byte-for-byte', () => {
  const packWithoutHash = { ...PACK };
  delete packWithoutHash.packHash;
  assert.equal(createHash('sha256').update(JSON.stringify(packWithoutHash)).digest('hex'), PACK.packHash,
    'the frozen pack hash does not describe its own contents');
  assert.equal(BUNDLE.bundleId, 'intake-ardwell-roe-visual-ceiling-v1');
  assert.equal(BUNDLE.createdAt, '2026-08-31T00:00:00.000Z', 'a committed baseline must not float on the clock');
});

test('the benchmark input is an ordinary contract instance, not a benchmark-shaped variant', () => {
  // The point of the benchmark is to run the *ordinary* factory over it. If the
  // input needed a relaxed contract to be accepted, the run would be measuring a
  // special path and the number would not transfer to a real business.
  assert.deepEqual(validateContract('approved-intake-bundle', BUNDLE), []);
  assert.deepEqual(validateContract('knowledge-pack', PACK), []);
});

test('the asset plan and the generation recipes describe the same set', () => {
  // Two hand-authored files, one specification. They agreed when written; the
  // failure mode is an asset added to one and forgotten in the other, which
  // surfaces much later as a brief nobody can produce or a file nobody wanted.
  const recipes = fs.readFileSync(path.join(ROOT, 'ardwell-roe-asset-recipes.v1.md'), 'utf8');
  const briefed = new Set([...recipes.matchAll(/^### `([^`]+)`/gm)].map((match) => match[1]));
  const planned = new Set(PLAN.assets.map((asset) => asset.assetId));
  assert.deepEqual([...planned].filter((id) => !briefed.has(id)), [],
    'a planned asset has no generation brief, so nobody could produce its bytes');
  assert.deepEqual([...briefed].filter((id) => !planned.has(id)), [],
    'a generation brief describes an asset the plan does not want');
});

test('the truth is strong enough to mint candidates', () => {
  const readiness = classifyCandidateTruthReadiness({
    sources: BUNDLE.projectManifest.inputs.sources,
    knowledgePack: PACK,
  });
  assert.equal(readiness.status, 'ingested-knowledge-pack');
  assert.equal(readiness.readyForCandidates, true);
  assert.deepEqual(readiness.unread, [], 'a declared material source went unread');
});

test('an asset plan is a plan, and never claims a file it does not have', () => {
  assert.equal(PLAN.businessReality, 'fictional');
  assert.ok(PLAN.assets.length >= 20, 'the plan must be rich enough to remove asset scarcity as a confound');
  for (const asset of PLAN.assets) {
    assert.ok(asset.assetId && asset.role && asset.subject, `asset ${asset.assetId} is underspecified`);
    assert.equal(asset.publicationAllowed, 'benchmark-only');
    assert.equal(asset.synthetic, true);
    assert.ok(['absent', 'present'].includes(asset.bytes), `asset ${asset.assetId} has an unknown byte state`);
  }
  // No provider may be named anywhere in the corpus. Which governed source
  // produces the bytes is an owner decision and must never become a contract.
  const corpusText = fs.readdirSync(ROOT).map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
  assert.doesNotMatch(corpusText, /higgsfield|midjourney|dall-?e|stable ?diffusion|firefly/i,
    'the benchmark must require governed synthetic bytes, not a named provider');
});

test('the readiness gate refuses to call an image-poor run an ideal-input baseline', () => {
  const present = PACK.assets.map((asset) => asset.id);
  const readiness = assessBenchmarkAssetReadiness({ plan: PLAN, presentAssetIds: present });
  assert.equal(readiness.ready, false, 'no bytes have been ingested, so nothing may be frozen');
  assert.equal(readiness.baselineFreezable, false);
  assert.equal(readiness.runLabel, 'asset-incomplete-development-run');
  assert.ok(readiness.missingRequired.length > 0, 'the refusal must name what is missing');
  assert.match(readiness.reason, /measures the asset gap/);
});

test('the gate passes once the floor is met, and only then', () => {
  const required = PLAN.assets.filter((asset) => asset.required).map((asset) => asset.assetId);
  const justRequired = assessBenchmarkAssetReadiness({ plan: PLAN, presentAssetIds: required });
  assert.equal(justRequired.ready, true, `the floor should be reachable: ${justRequired.shortfalls.join(' ')}`);
  assert.equal(justRequired.runLabel, 'ideal-input-visual-ceiling-baseline');

  // One asset short is still short. A floor that rounds up is not a floor.
  const oneShort = assessBenchmarkAssetReadiness({ plan: PLAN, presentAssetIds: required.slice(1) });
  assert.equal(oneShort.ready, false);
  assert.deepEqual(oneShort.missingRequired, [required[0]]);
});

test('the gate is generic, and knows nothing about this business', () => {
  const source = fs.readFileSync('tooling/lib/benchmark-asset-readiness.mjs', 'utf8');
  assert.doesNotMatch(source, /ardwell|roe|nbm|mgb/i, 'the readiness gate must not know a case by name');
});
