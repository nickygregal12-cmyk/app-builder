import test from 'node:test';
import assert from 'node:assert/strict';

import { composeProject } from '@app-builder/composition';
import { planSite, validateSitePlan, assertSitePlan, knownRefs } from '../packages/composition/src/site-plan.js';
import { validateContract } from '@app-builder/contracts';

/**
 * What pages exist, and why each deserves to exist separately.
 *
 * The decision used to be a literal keyed on project type — `marketing-site` meant Home, Services,
 * About, Contact — after which a page's purpose was recovered by matching a regular expression
 * against its own name. These tests are mostly about the things that must *not* happen now: no
 * route count is asserted anywhere, in either direction, because a test that says "rich truth
 * produces five pages" is the template arriving through the test suite.
 */

const fact = (id, path, value) => ({
  id, path, value, sourceId: 'src', provenance: 'user-supplied', confidence: 1, verification: 'user-provided', evidence: [],
});
const entity = (id, name) => ({ id, sourceId: 'src', provenance: 'user-supplied', verification: 'user-provided', name });

const packWith = (profile = {}, extraFacts = []) => ({
  schemaVersion: 1,
  facts: [fact('f-name', 'identity.name', 'Acme'), fact('f-desc', 'identity.description', 'We do a thing'), ...extraFacts],
  companyProfile: { identity: { name: 'Acme' }, ...profile },
});

const manifest = { schemaVersion: 1, project: { name: 'Acme', type: 'marketing-site' }, company: { conversionGoals: ['enquiry'] } };

const RICH = packWith({
  services: Array.from({ length: 6 }, (_, i) => entity(`svc-${i}`, `Service ${i}`)),
  projects: Array.from({ length: 4 }, (_, i) => entity(`prj-${i}`, `Project ${i}`)),
}, [fact('f-phone', 'contact.phone', '01234')]);

const THIN = packWith({}, [fact('f-phone', 'contact.phone', '01234')]);

/* ------------------------------------------------------------------ the truth boundary */

test('a route may reorganise approved truth and may not invent any', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  assert.deepEqual(validateSitePlan(plan, { knowledgePack: RICH }), []);

  const invented = structuredClone(plan);
  invented.routes[1].factRefs.push('fact-we-made-up');
  const findings = validateSitePlan(invented, { knowledgePack: RICH });
  assert.equal(findings.some((finding) => finding.code === 'unsupported-fact-reference'), true);
});

test('the reference space is both stores, because the things a business HAS are entities', () => {
  /*
   * A knowledge pack keeps identity and contact in `facts[]` and keeps services, projects, people
   * and testimonials as entities under `companyProfile`. A validator that only knew about `facts`
   * would accept a route claiming to be built on six services while referencing none of them.
   */
  const refs = knownRefs(RICH);
  assert.equal(refs.has('f-name'), true);
  assert.equal(refs.has('svc-0'), true);
  assert.equal(refs.has('prj-3'), true);
});

test('a section cannot bind truth its own route was not built on', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const broken = structuredClone(plan);
  broken.routes[1].narrative[1].factRefs.push('f-phone');
  assert.equal(
    validateSitePlan(broken, { knowledgePack: RICH }).some((finding) => finding.code === 'section-outside-route-truth'),
    true,
  );
});

/* ------------------------------------------------------------------ reason required */

test('a route justified by something true of any page is refused', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  for (const because of [
    'This page provides useful information about the company and its work.',
    'It builds trust with prospective customers who are evaluating suppliers.',
    'Every good website has one and it improves SEO for the relevant terms.',
  ]) {
    const generic = structuredClone(plan);
    generic.routes[1].existsBecause = because;
    const findings = validateSitePlan(generic, { knowledgePack: RICH });
    assert.equal(findings.some((finding) => finding.code === 'empty-justification'), true, `${because} should not justify a page`);
  }
});

test('two routes admitting exactly the same truth are one route rendered twice', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const cloned = structuredClone(plan);
  cloned.routes[2].factRefs = [...cloned.routes[1].factRefs];
  assert.equal(
    validateSitePlan(cloned, { knowledgePack: RICH }).some((finding) => finding.code === 'duplicate-route-truth'),
    true,
  );
});

test('a narrative that depends on something later is not an order', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const backwards = structuredClone(plan);
  const route = backwards.routes[1];
  route.narrative[0].requires = [route.narrative[1].job];
  assert.equal(
    validateSitePlan(backwards, { knowledgePack: RICH }).some((finding) => finding.code === 'narrative-out-of-order'),
    true,
  );
});

test('one page cannot do the same job twice', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const repeated = structuredClone(plan);
  const route = repeated.routes[1];
  route.narrative.push({ ...route.narrative[1], requires: [] });
  assert.equal(
    validateSitePlan(repeated, { knowledgePack: RICH }).some((finding) => finding.code === 'duplicate-section-job'),
    true,
  );
});

/* ------------------------------------------------------------------ no quota, either way */

test('thin truth is allowed to produce a small site, and says what it declined', () => {
  const plan = planSite({ manifest, knowledgePack: THIN });
  assert.deepEqual(validateSitePlan(plan, { knowledgePack: THIN }), []);

  // Deliberately not an assertion about how many routes. The assertion is that everything it did
  // not build, it refused on the record.
  assert.ok(plan.omitted.length > 0, 'a plan that builds less must say what it declined');
  for (const entry of plan.omitted) assert.ok(entry.because.length > 24, `${entry.candidate} was declined without a reason`);
  assert.equal(plan.routes.every((route) => route.factRefs.length >= 2), true, 'no route rests on nothing');
});

test('a business with nothing but its own name gets one route, and that is a valid plan', () => {
  const bare = { schemaVersion: 1, facts: [fact('f-name', 'identity.name', 'Acme'), fact('f-desc', 'identity.description', 'A thing')], companyProfile: {} };
  const plan = planSite({ manifest, knowledgePack: bare });
  assert.deepEqual(validateSitePlan(plan, { knowledgePack: bare }), []);
  assert.equal(plan.routes.length, 1, 'the honest answer for a business with two facts is one page');
  assert.equal(plan.routes[0].path, '/');
});

test('rich and thin truth do not produce the same structure', () => {
  /*
   * The negative assertion, and deliberately NOT "rich has N more routes than thin". A planner
   * that always produced more for more truth would be a quota with a sliding scale; what must be
   * true is only that the structure follows the truth rather than a template.
   */
  const rich = planSite({ manifest, knowledgePack: RICH });
  const thin = planSite({ manifest, knowledgePack: THIN });
  const shape = (plan) => plan.routes.map((route) => `${route.path}:${route.narrative.length}`).join(' ');
  assert.notEqual(shape(rich), shape(thin));
  assert.ok(thin.omitted.length > rich.omitted.length, 'the thinner business should be declining more, not building more');
});

test('nothing in the planner consults the project type', () => {
  const asOther = { ...manifest, project: { ...manifest.project, type: 'content-site' } };
  const a = planSite({ manifest, knowledgePack: RICH });
  const b = planSite({ manifest: asOther, knowledgePack: RICH });
  assert.deepEqual(
    a.routes.map((route) => route.path),
    b.routes.map((route) => route.path),
    'the same truth produced a different site because the manifest called the project something else',
  );
});

test('the same truth produces the same plan', () => {
  const a = planSite({ manifest, knowledgePack: RICH });
  const b = planSite({ manifest, knowledgePack: RICH });
  assert.equal(a.planHash, b.planHash);
});

/* ------------------------------------------------------------------ it is actually consumed */

test('composition builds the routes the plan decided, at the paths it chose', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const composition = composeProject({ manifest, knowledgePack: RICH, sitePlan: plan });

  const planned = plan.routes.map((route) => route.path).sort();
  const built = composition.pages.map((page) => page.path).filter((path) => path !== '/404').sort();
  assert.deepEqual(built, planned);

  // The page carries the plan's reason, not "Provide the X surface for Y".
  for (const route of plan.routes) {
    const page = composition.pages.find((entry) => entry.path === route.path);
    assert.equal(page.purpose, route.purpose);
  }
});

test('without a plan, composition does exactly what it did before', () => {
  /*
   * The rollback boundary, and it is total: no plan, no behaviour change. A capability that
   * cannot be turned off is not a slice.
   */
  const before = composeProject({ manifest, knowledgePack: RICH });
  const again = composeProject({ manifest, knowledgePack: RICH, sitePlan: null });
  // The hash is the assertion. It covers every page, every section and every binding, so an
  // identical hash is a stronger statement than any list of paths written out here.
  assert.equal(before.compositionHash, again.compositionHash);
  // And the untouched path is still the surface-name one, which is what it is being compared to.
  assert.deepEqual(before.pages.map((page) => page.path), ['/', '/services', '/about', '/404']);
});

test('an invalid plan is refused before it is composed, not after', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const broken = structuredClone(plan);
  broken.routes[1].factRefs.push('invented');
  assert.throws(() => composeProject({ manifest, knowledgePack: RICH, sitePlan: broken }), /Site plan is not valid/);
});

test('a section job composition cannot render is reported, not dropped', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  const odd = structuredClone(plan);
  odd.routes[1].narrative[1].binds = 'something-composition-has-no-presentation-for';
  const composition = composeProject({ manifest, knowledgePack: RICH, sitePlan: odd });
  assert.ok(
    composition.warnings.some((gap) => gap.startsWith('unrenderable-section-job:')),
    'a narrative missing its middle is not a shorter narrative',
  );
});

test('a plan validates against its published contract', () => {
  const plan = planSite({ manifest, knowledgePack: RICH });
  assert.deepEqual(validateContract('site-plan', plan), []);
  assert.equal(assertSitePlan(plan, { knowledgePack: RICH }), plan);
});
