import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import { SECTION_TYPES, actionTargetKind, auditLaunchReadiness, bindingIsEmpty, bindingText, deriveJourneys, deriveStateMatrix } from './lib/launch-readiness.mjs';

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
        bindings: [
          { key: 'title', value: 'North Star Studio', origin: 'source', sourceIds: ['s1'], factIds: ['f1'], entityIds: [], generated: false },
          { key: 'body', value: 'Independent product studio in Leeds.', origin: 'source', sourceIds: ['s1'], factIds: ['f1'], entityIds: [], generated: false },
        ] },
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
    id: 'proof', type: 'proof-grid', purpose: 'Prove', variant: 'primary', assetIds: ['a'], actions: [],
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
  const surfaces = deriveStateMatrix(composition(), rules);
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
  const journeys = deriveJourneys(composition(), rules);
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
  const journey = deriveJourneys(base, rules)[0];
  const capture = journey.steps.find((step) => step.step === 'capture');
  assert.equal(capture.status, 'unproven');
  assert.match(capture.detail, /No capture surface/);
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('journey-step-unproven'));
});

test('a step detail never contradicts its own status', () => {
  const base = composition();
  base.pages[0].navigation.visible = false;
  const journey = deriveJourneys(base, rules)[0];
  const discovery = journey.steps.find((step) => step.step === 'discovery');
  assert.equal(discovery.status, 'proven', 'the home path is always discoverable');
  base.pages[0].path = '/landing';
  base.pages[0].primaryAction = { label: 'Contact', href: '/contact' };
  const hidden = deriveJourneys(base, rules)[0].steps.find((step) => step.step === 'discovery');
  assert.equal(hidden.status, 'unproven');
  assert.match(hidden.detail, /not in navigation/);
});

test('the audit runs on real canonical generated output and stays within its recorded ceiling', (t) => {
  // The canonical projects are generated by `npm run generate:acceptance`, which runs after
  // `npm run check` in CI. This asserts the real thing when it is present and skips when it is not;
  // the enforcing gate lives in generate-acceptance itself, which CI does run.
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
  if (audited === 0) {
    t.skip('no canonical output on disk; run `npm run generate:acceptance` to audit it here too');
  }
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

// ---------------------------------------------------------------------------
// Regressions from the Phase 3.8E genuine-business run (nbm Construction Cost
// Consultants). Each of these was a real defect the run exposed: the audit
// predicted 29 manual edits, of which six blockers and fourteen majors were
// findings no edit could have fixed, while the two genuinely dead surfaces went
// unreported.
// ---------------------------------------------------------------------------

test('the audit’s section-type vocabulary is the composition contract, not a parallel list', () => {
  const schemaTypes = readJson('schemas/section-spec.schema.json').properties.type.enum;
  assert.deepEqual([...SECTION_TYPES].sort(), [...schemaTypes].sort(),
    'a role set naming a type the composer cannot emit silently disables the rule that reads it');
});

test('every configured section role names a real section type, and an unknown one fails closed', () => {
  for (const [role, types] of Object.entries(rules.sectionRoles)) {
    for (const type of types) {
      assert.ok(SECTION_TYPES.includes(type), `role ${role} names unknown section type ${type}`);
    }
  }
  const broken = { ...rules, sectionRoles: { ...rules.sectionRoles, claim: ['testimonial'] } };
  assert.throws(() => auditLaunchReadiness({ composition: composition(), rules: broken }),
    /unknown section type "testimonial"/);
  const missing = { ...rules, sectionRoles: { visual: ['hero'] } };
  assert.throws(() => auditLaunchReadiness({ composition: composition(), rules: missing }),
    /section roles must include/);
});

test('a list binding with real items is not an empty hole', () => {
  const base = composition();
  base.sections.push({
    id: 'services', type: 'item-grid', purpose: 'List services', variant: 'list', assetIds: [], actions: [],
    bindings: [{ key: 'items', value: [{ name: 'Cost consultancy' }, { name: "Employer's agent" }],
      origin: 'knowledge-entity', sourceIds: ['s1'], factIds: [], entityIds: ['e1'], generated: false }],
  });
  base.pages[0].sectionIds.push('services');
  const report = auditLaunchReadiness({ composition: base, rules });
  assert.ok(!checks(report).includes('unresolved-binding'),
    'a populated list must not be reported as an empty binding');
  assert.equal(report.launchable, true);
});

test('an empty list is still an empty hole', () => {
  const base = composition();
  base.sections.push({
    id: 'services', type: 'item-grid', purpose: 'List services', variant: 'list', assetIds: [], actions: [],
    bindings: [{ key: 'items', value: [], origin: 'knowledge-entity', sourceIds: [], factIds: [], entityIds: [], generated: false }],
  });
  base.pages[0].sectionIds.push('services');
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('unresolved-binding'));
});

test('placeholder copy hiding inside a list item is still caught', () => {
  const base = composition();
  base.sections.push({
    id: 'services', type: 'item-grid', purpose: 'List services', variant: 'list', assetIds: [], actions: [],
    bindings: [{ key: 'items', value: [{ name: 'Cost consultancy' }, { name: 'Coming soon' }],
      origin: 'knowledge-entity', sourceIds: ['s1'], factIds: [], entityIds: ['e1'], generated: false }],
  });
  base.pages[0].sectionIds.push('services');
  assert.ok(checks(auditLaunchReadiness({ composition: base, rules })).includes('placeholder-copy'));
});

test('binding text flattens what a visitor would read, and only real emptiness is empty', () => {
  assert.equal(bindingText([{ name: 'Glasgow' }, { name: 'Edinburgh' }]), 'Glasgow Edinburgh');
  assert.equal(bindingText({ name: 'Glasgow', region: '' }), 'Glasgow');
  assert.equal(bindingText(0), '0');
  for (const empty of ['', '   ', [], {}, null, undefined, [{ name: '' }]]) {
    assert.ok(bindingIsEmpty(empty), `${JSON.stringify(empty)} should read as empty`);
  }
  assert.ok(!bindingIsEmpty(['Glasgow']));
});

test('a phone or email primary action is a conversion, not a missing page', () => {
  const base = composition();
  base.pages[0].primaryAction = { label: 'Call', href: 'tel:01413331836' };
  const journey = deriveJourneys(base, rules).find((entry) => entry.entry === '/');
  const byStep = Object.fromEntries(journey.steps.map((step) => [step.step, step.status]));
  assert.equal(byStep.destination, 'proven');
  assert.equal(byStep.capture, 'proven');
  assert.ok(!('validation' in byStep), 'a dialler has no field validation to prove, ever');
  const report = auditLaunchReadiness({ composition: base, rules });
  assert.ok(!report.findings.some((item) => item.detail.includes('tel:01413331836')),
    'no edit could make a page serve tel:, so it must not be predicted as one');
  assert.ok(!report.evidenceGaps.some((gap) => gap.where.startsWith('home-to-tel:')));
});

test('an off-site primary action needs live evidence rather than being called broken', () => {
  const base = composition();
  base.pages[0].primaryAction = { label: 'Book', href: 'https://booking.example.org/nbm' };
  const journey = deriveJourneys(base, rules).find((entry) => entry.entry === '/');
  const destination = journey.steps.find((step) => step.step === 'destination');
  assert.equal(destination.status, 'needs-executable-evidence');
  const report = auditLaunchReadiness({ composition: base, rules });
  assert.ok(!checks(report).includes('journey-step-unproven'));
});

test('action target kinds are classified rather than assumed to be routes', () => {
  assert.equal(actionTargetKind('/contact'), 'route');
  assert.equal(actionTargetKind('tel:01413331836'), 'direct-contact');
  assert.equal(actionTargetKind('mailto:hello@nbm.example'), 'direct-contact');
  assert.equal(actionTargetKind('https://example.org'), 'external');
  assert.equal(actionTargetKind('//example.org'), 'external');
  assert.equal(actionTargetKind(''), 'missing');
});

test('a page holding only a title and a call to action is reported as a dead end', () => {
  const base = composition();
  base.pages.push({
    id: 'projects', path: '/projects', title: 'Projects', purpose: 'Show completed work',
    navigation: { label: 'Projects', order: 2, visible: true },
    primaryAction: { label: 'Call', href: 'tel:01413331836' }, sectionIds: ['projects-hero', 'projects-cta'],
  });
  base.sections.push(
    { id: 'projects-hero', type: 'hero', purpose: 'Title', variant: 'compact', assetIds: ['logo'], actions: [],
      bindings: [{ key: 'title', value: 'Projects', origin: 'manifest', sourceIds: [], factIds: [], entityIds: [], generated: false }] },
    { id: 'projects-cta', type: 'cta', purpose: 'Convert', variant: 'accent', assetIds: [], actions: [],
      bindings: [{ key: 'title', value: 'Get in touch', origin: 'default', sourceIds: [], factIds: [], entityIds: [], generated: false },
        { key: 'body', value: 'Talk to us about your project.', origin: 'default', sourceIds: [], factIds: [], entityIds: [], generated: false }] },
  );
  const report = auditLaunchReadiness({ composition: base, rules });
  const deadEnds = report.findings.filter((item) => item.check === 'content-less-page');
  assert.deepEqual(deadEnds.map((item) => item.where), ['/projects']);
});

test('a hero that says something real keeps its page off the dead-end list', () => {
  const base = composition();
  base.pages.push({
    id: 'careers', path: '/careers', title: 'Careers', purpose: 'Recruit',
    navigation: { label: 'Careers', order: 3, visible: true },
    primaryAction: null, sectionIds: ['careers-hero'],
  });
  base.sections.push({
    id: 'careers-hero', type: 'hero', purpose: 'Recruit', variant: 'compact', assetIds: ['logo'], actions: [],
    bindings: [
      { key: 'title', value: 'Careers', origin: 'manifest', sourceIds: [], factIds: [], entityIds: [], generated: false },
      { key: 'body', value: 'We are hiring chartered quantity surveyors in Glasgow.', origin: 'source', sourceIds: ['s1'], factIds: ['f1'], entityIds: [], generated: false },
    ],
  });
  assert.ok(!checks(auditLaunchReadiness({ composition: base, rules })).includes('content-less-page'));
});

test('only a section that actually writes creates write states to prove', () => {
  const base = composition();
  base.pages.push({
    id: 'about', path: '/about', title: 'About', purpose: 'Explain',
    navigation: { label: 'About', order: 4, visible: true }, primaryAction: null, sectionIds: ['about-cta'],
  });
  base.sections.push({ id: 'about-cta', type: 'cta', purpose: 'Convert', variant: 'accent', assetIds: [], actions: [],
    bindings: [{ key: 'title', value: 'Get in touch', origin: 'default', sourceIds: [], factIds: [], entityIds: [], generated: false }] });
  const about = deriveStateMatrix(base, rules).find((surface) => surface.page === '/about');
  assert.ok(!about.axes.includes('write'),
    'a call-to-action panel submits nothing, so it must not demand submitting/succeeded/failed evidence');
});

// ---------------------------------------------------------------------------
// Declared hard constraints
//
// answers.hard_constraints reached manifest.constraints.hard and stopped. The
// four constraints on the frozen nbm project survived intake, the Build
// Contract and the manifest, and nothing in the factory read one of them.
// These cover the consumer, and — more importantly — cover the cases where the
// honest answer is "nothing is enforcing this", because a ledger that can only
// report success is the silent drop again with better manners.
// ---------------------------------------------------------------------------

const topics = readJson('config/hard-constraint-topics.json');
const withConstraints = (hard, overrides = {}) => auditLaunchReadiness({
  composition: composition(overrides),
  rules,
  manifest: { schemaVersion: 2, constraints: { hard } },
  hardConstraintTopics: topics,
});

test('every declared hard constraint appears in the coverage ledger', () => {
  // The real nbm constraints, verbatim.
  const report = withConstraints([
    'No unsupported performance, client, award, accreditation or experience claims',
    'No republication of nbm website photographs, logo files or staff photographs',
    'Imagery must be genuinely relevant and rights-safe',
    'Mobile must feel designed rather than collapsed',
  ]);

  // The planted failure: before a consumer existed this was `undefined`.
  assert.equal(report.hardConstraints.length, 4, 'every declared constraint is accounted for');
  assert.deepEqual(report.summary.hardConstraints,
    { enforced: 1, breached: 0, 'needs-executable-evidence': 3, unenforced: 0, unclassified: 0 });

  // Each one names the check that binds it rather than being merely echoed.
  for (const entry of report.hardConstraints) {
    assert.ok(entry.topic, `"${entry.constraint}" classified as nothing`);
    assert.ok(entry.detail.length > 0);
  }
  const claims = report.hardConstraints.find((entry) => entry.topic === 'unsupported-claims');
  assert.deepEqual(claims.checks, ['generated-claim-without-source']);
  assert.equal(claims.verifiedBy, 'launch-readiness');
});

test('a hard constraint is breached when a check that binds it is reporting', () => {
  // A generated sentence that reads as a fact about the business, in a section
  // whose job is to prove things, is exactly what "no unsupported claims"
  // forbids — and the audit already detects it.
  const base = composition();
  base.sections.push({
    id: 'proof', type: 'proof-grid', purpose: 'Prove', variant: 'primary', assetIds: ['a'], actions: [],
    bindings: [{ key: 'stat', value: 'Trusted by 400 businesses', origin: 'generated', sourceIds: [], factIds: [], entityIds: [], generated: true }],
  });
  base.pages[0].sectionIds.push('proof');
  const report = auditLaunchReadiness({
    composition: base,
    rules,
    manifest: { schemaVersion: 2, constraints: { hard: ['No unsupported performance or client claims'] } },
    hardConstraintTopics: topics,
  });

  assert.ok(checks(report).includes('generated-claim-without-source'), 'the underlying check must fire for this test to mean anything');
  const entry = report.hardConstraints[0];
  assert.equal(entry.status, 'breached');
  const finding = report.findings.find((item) => item.check === 'hard-constraint-breached');
  assert.ok(finding, 'a breached hard constraint is a finding, not a note');
  assert.equal(finding.severity, 'blocker');
  // The operator's own words are quoted back, so the report says which
  // constraint is broken rather than only which check failed.
  assert.match(finding.detail, /No unsupported performance or client claims/);
  assert.equal(report.launchable, false);
});

test('a hard constraint nothing can check is reported, never assumed satisfied', () => {
  const report = withConstraints(['The site must be finished before the trade show in March']);
  assert.equal(report.hardConstraints[0].status, 'unclassified');
  assert.equal(report.hardConstraints[0].topic, null);
  const gap = report.evidenceGaps.find((item) => item.check === 'hard-constraint-unenforced');
  assert.ok(gap, 'an unenforceable constraint is surfaced as an evidence gap');
  // It is not a defect somebody edits the site to fix, so it must not inflate
  // the Phase 3.8E manual-edit prediction.
  assert.ok(!checks(report).includes('hard-constraint-unenforced'));
});

test('a constraint whose evidence belongs to another producer is routed, not marked clean', () => {
  const report = withConstraints(['Mobile must feel designed rather than collapsed']);
  const entry = report.hardConstraints[0];
  assert.equal(entry.status, 'needs-executable-evidence');
  assert.equal(entry.verifiedBy, 'generated-checks');
  assert.ok(!report.findings.some((item) => item.check === 'hard-constraint-breached'),
    'an audit that cannot see the evidence must not claim the constraint is broken either');
});

test('a missing topic registry reports no coverage rather than a clean bill of health', () => {
  const report = auditLaunchReadiness({
    composition: composition(),
    rules,
    manifest: { schemaVersion: 2, constraints: { hard: ['No unsupported claims'] } },
    hardConstraintTopics: null,
  });
  assert.deepEqual(report.hardConstraints, []);
  assert.deepEqual(report.summary.hardConstraints,
    { enforced: 0, breached: 0, 'needs-executable-evidence': 0, unenforced: 0, unclassified: 0 });
});

test('every topic names a producer the gate registry declares, or none at all', () => {
  const producers = new Set(Object.keys(readJson('config/gate-producers.json').producers));
  for (const topic of topics.topics) {
    const producer = topic.verifiedBy?.producer ?? null;
    if (producer === null) continue;
    assert.ok(producers.has(producer), `topic ${topic.id} names unknown producer ${producer}`);
  }
  // A topic that matches nothing on any real project is a rule nobody uses.
  for (const topic of topics.topics) {
    assert.ok(Array.isArray(topic.match) && topic.match.length > 0, `topic ${topic.id} matches nothing`);
  }
});
