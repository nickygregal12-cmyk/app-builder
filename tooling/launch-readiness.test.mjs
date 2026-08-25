import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import { auditLaunchReadiness, deriveJourneys, deriveStateMatrix } from './lib/launch-readiness.mjs';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const rules = readJson('config/launch-readiness-rules.json');
const roles = readJson('config/agent-roles.json').roles;
const editCategories = readJson('schemas/genuine-business-acceptance.schema.json')
  .properties.manualEdits.properties.entries.items.properties.category.enum;

function composition(overrides = {}) {
  return {
    schemaVersion: 1,
    projectType: 'marketing-site',
    compositionHash: 'a'.repeat(64),
    input: { manifestVersion: 2, knowledgePackHash: null },
    pages: [
      {
        id: 'home', path: '/', title: 'Home', purpose: 'Introduce the business',
        navigation: { label: 'Home', order: 0, visible: true },
        primaryAction: { label: 'Contact', href: '/contact' }, sectionIds: ['hero'],
      },
      {
        id: 'contact', path: '/contact', title: 'Contact', purpose: 'Capture enquiries',
        navigation: { label: 'Contact', order: 1, visible: true },
        primaryAction: null, sectionIds: ['form'],
      },
      { id: 'nf', path: '/404', title: 'Not found', purpose: 'Recover from a bad link',
        navigation: { label: 'Not found', order: 9, visible: false }, primaryAction: null, sectionIds: [] },
    ],
    sections: [
      { id: 'hero', type: 'hero', purpose: 'Introduce', variant: 'primary', assetIds: ['logo'], actions: [],
        bindings: [{ key: 'title', value: 'North Star Studio', origin: 'source', sourceIds: ['s1'], factIds: ['f1'], entityIds: [], generated: false }] },
      { id: 'form', type: 'enquiry-form', purpose: 'Capture', variant: 'primary', assetIds: [], actions: [],
        bindings: [{ key: 'heading', value: 'Get in touch', origin: 'default', sourceIds: [], factIds: [], entityIds: [], generated: false }] },
    ],
    warnings: [],
    ...overrides,
  };
}

const audit = (overrides) => auditLaunchReadiness({ composition: composition(overrides), rules });
const checks = (report) => report.findings.map((f) => f.check);

test('every rule names a real role and a real Phase 3.8E edit category', () => {
  for (const [id, rule] of Object.entries(rules.checks)) {
    assert.ok(roles[rule.owningRole], `rule ${id} names unknown role ${rule.owningRole}`);
    assert.ok(editCategories.includes(rule.category), `rule ${id} uses a category 3.8E cannot record`);
    assert.ok(rules.severityOrder.includes(rule.severity), `rule ${id} has unknown severity`);
    assert.ok(rule.guidance?.length > 0, `rule ${id} must say what to do about it`);
  }
});

test('a healthy composition is launchable and predicts no edits', () => {
  const report = audit();
  assert.deepEqual(checks(report), []);
  assert.equal(report.launchable, true);
  assert.equal(report.predictedManualEdits, 0);
});

test('the report validates against the LaunchReadinessReport schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson('schemas/launch-readiness-report.schema.json'));
  assert.ok(validate(audit()), JSON.stringify(validate.errors));
  const broken = audit({ warnings: ['missing-contact-details', 'unresolved-capability:booking'] });
  assert.ok(validate(broken), JSON.stringify(validate.errors));
});

test('an empty binding is a blocker, because the section renders a hole', () => {
  const base = composition();
  base.sections[0].bindings[0].value = '   ';
  const report = auditLaunchReadiness({ composition: base, rules });
  assert.ok(checks(report).includes('unresolved-binding'));
  assert.equal(report.launchable, false);
});

test('placeholder copy is caught before it ships', () => {
  const base = composition();
  base.sections[0].bindings[0].value = 'Your Company — coming soon';
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('placeholder-copy'));
});

test('a generated claim in a claim-bearing section needs a source', () => {
  const base = composition();
  base.sections.push({
    id: 'proof', type: 'proof', purpose: 'Prove', variant: 'primary', assetIds: ['a'], actions: [],
    bindings: [{ key: 'stat', value: 'Trusted by 400 businesses', origin: 'generated', sourceIds: [], factIds: [], entityIds: [], generated: true }],
  });
  base.pages[0].sectionIds.push('proof');
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('generated-claim-without-source'));
});

test('a hero with no imagery is flagged, and one with imagery is not', () => {
  const base = composition();
  base.sections[0].assetIds = [];
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('section-expects-imagery'));
  assert.ok(!checks(audit()).includes('section-expects-imagery'));
});

test('an action pointing at a route no page serves is a blocker', () => {
  const base = composition();
  base.pages[0].primaryAction = { label: 'Book', href: '/booking' };
  const report = auditLaunchReadiness({ composition: base, rules });
  assert.ok(checks(report).includes('action-target-missing'));
  assert.equal(report.launchable, false);
});

test('external links are not this audit’s question', () => {
  const base = composition();
  base.sections[0].actions = [{ label: 'Instagram', href: 'https://example.org/profile' }];
  assert.ok(!checks(auditLaunchReadiness({ composition: base, rules })).includes('action-target-missing'));
});

test('navigation visibility is read from the real PageSpec field', () => {
  // Reading the wrong field turns every navigable page into a false orphan.
  assert.ok(!checks(audit()).includes('orphan-page'), 'visible pages are not orphans');
  const base = composition();
  base.pages[1].navigation.visible = false;
  base.pages[0].primaryAction = null;
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('orphan-page'));
});

test('a site with no way to convert a visitor is a blocker', () => {
  const base = composition();
  base.pages[0].primaryAction = null;
  base.sections[1].type = 'rich-text';
  const report = auditLaunchReadiness({ composition: base, rules });
  assert.ok(checks(report).includes('no-conversion-path'));
  assert.equal(report.launchable, false);
});

test('a missing not-found route is reported', () => {
  const base = composition();
  base.pages = base.pages.filter((page) => page.path !== '/404');
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('missing-not-found-route'));
});

test('composer warnings become owned, categorised findings', () => {
  const report = audit({ warnings: ['missing-contact-details', 'no-publishable-imagery', 'unresolved-capability:booking', 'custom-capability:crm'] });
  const found = checks(report);
  for (const check of ['missing-contact-details', 'no-publishable-imagery', 'unresolved-capability', 'custom-capability-pending']) {
    assert.ok(found.includes(check), `expected ${check}`);
  }
  assert.equal(report.launchable, false, 'an unresolved capability blocks launch');
});

test('missing evidence is counted separately from a predicted edit', () => {
  // A high-risk state with no fixture is a gap in the factory's proof, not an edit a person makes
  // to the site. Merging them would make the 3.8E prediction untrustworthy.
  const report = audit();
  assert.equal(report.predictedManualEdits, 0);
  assert.ok(report.evidenceGaps.length > 0, 'a form surface has states nothing yet proves');
  assert.ok(report.evidenceGaps.every((gap) => ['state-evidence-missing', 'journey-step-unproven'].includes(gap.check)));
  assert.equal(report.summary.evidenceGaps, report.evidenceGaps.length);
});

test('the derived state matrix stays small and ranked rather than combinatorial', () => {
  const surfaces = deriveStateMatrix(composition());
  const form = surfaces.find((surface) => surface.page === '/contact');
  assert.ok(form.axes.includes('write'), 'a capture surface exposes write states');
  assert.ok(form.states.some((state) => state.state === 'failed' && state.risk === 'high'));
  const notFound = surfaces.find((surface) => surface.page === '/404');
  assert.ok(!notFound.axes.includes('write'), 'a page with no capture surface has no write axis');
  for (const surface of surfaces) {
    assert.ok(surface.states.length <= 12, `${surface.page} matrix is growing combinatorial`);
  }
});

test('journeys are derived from composed output and mark what composition cannot prove', () => {
  const journeys = deriveJourneys(composition());
  assert.equal(journeys.length, 1, 'one page declares a primary action');
  const journey = journeys[0];
  assert.equal(journey.entry, '/');
  const byStep = Object.fromEntries(journey.steps.map((step) => [step.step, step.status]));
  assert.equal(byStep.discovery, 'proven');
  assert.equal(byStep.destination, 'proven');
  assert.equal(byStep.capture, 'proven');
  assert.equal(byStep.validation, 'needs-executable-evidence');
  assert.equal(byStep.failure, 'needs-executable-evidence');
  for (const step of journey.steps) {
    assert.ok(step.detail.length > 0, 'every step explains its own status');
  }
});

test('a journey whose destination has no capture surface is reported unproven', () => {
  const base = composition();
  base.sections[1].type = 'rich-text';
  const journey = deriveJourneys(base)[0];
  const capture = journey.steps.find((step) => step.step === 'capture');
  assert.equal(capture.status, 'unproven');
  assert.match(capture.detail, /No capture surface/);
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('journey-step-unproven'));
});

test('a step detail never contradicts its own status', () => {
  const base = composition();
  base.pages[0].navigation.visible = false;
  const journey = deriveJourneys(base)[0];
  const discovery = journey.steps.find((step) => step.step === 'discovery');
  assert.equal(discovery.status, 'proven', 'the home path is always discoverable');
  base.pages[0].path = '/landing';
  base.pages[0].primaryAction = { label: 'Contact', href: '/contact' };
  const hidden = deriveJourneys(base)[0].steps.find((step) => step.step === 'discovery');
  assert.equal(hidden.status, 'unproven');
  assert.match(hidden.detail, /not in navigation/);
});

test('the audit runs on real canonical generated output and stays within its recorded ceiling', () => {
  // The canonical projects are generated by `npm run generate:acceptance`. When they are present
  // this asserts the real thing, not a fixture.
  const ceilings = readJson('config/factory-benchmarks.json').launchReadiness?.ceilings ?? {};
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson('schemas/launch-readiness-report.schema.json'));
  let audited = 0;
  for (const [type, ceiling] of Object.entries(ceilings)) {
    const file = path.join(root, `.tmp/generated-acceptance-${type}/.app-builder/composition.json`);
    if (!fs.existsSync(file)) continue;
    const report = auditLaunchReadiness({ composition: JSON.parse(fs.readFileSync(file, 'utf8')), rules });
    assert.ok(validate(report), `${type}: ${JSON.stringify(validate.errors)}`);
    assert.ok(
      report.predictedManualEdits <= ceiling,
      `${type} predicts ${report.predictedManualEdits} edits, above its ceiling of ${ceiling}`,
    );
    audited += 1;
  }
  assert.ok(audited > 0 || Object.keys(ceilings).length === 0, 'canonical output was present but nothing was audited');
});

test('every canonical ceiling stays under the Phase 3.8E budget', () => {
  const launch = readJson('config/factory-benchmarks.json').launchReadiness;
  assert.ok(launch, 'benchmarks must record launch-readiness ceilings');
  for (const [type, ceiling] of Object.entries(launch.ceilings)) {
    assert.ok(
      ceiling < launch.targetMaximum,
      `${type} ceiling ${ceiling} is not below the ${launch.targetMaximum} edit target`,
    );
  }
});
