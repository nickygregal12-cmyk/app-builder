import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeProject } from '../packages/composition/src/index.js';
import { auditLaunchReadiness } from './lib/launch-readiness.mjs';

function marketingManifest(overrides = {}) {
  return {
    schemaVersion: 2,
    project: { name:'North Star Roofing', slug:'north-star-roofing', type:'marketing-site', primaryGoal:'Generate qualified roofing enquiries' },
    audience: { summary:'Homeowners in Glasgow', roles:[] },
    journeys: ['Understand services','Request a quote'],
    majorSurfaces: ['Home','Services','About','Contact'],
    entities: [],
    company: {
      identity:{ name:'North Star Roofing', description:'Residential roofing and repair company.' },
      services:['Roof repairs','New roofs'], locations:['Glasgow'], contactDetails:{ email:'hello@example.com' }, trustSignals:[], conversionGoals:['Request a quote']
    },
    constraints: { customCapabilities:[], excludedCapabilities:[], unresolvedCapabilities:[] },
    modules:{ seo:true, 'lead-generation':true },
    ...overrides,
  };
}

function knowledgePack() {
  return {
    packHash:'pack-123',
    facts:[
      { id:'fact-name', path:'identity.name', value:'North Star Roofing Ltd', sourceId:'source-json', provenance:'user-supplied', confidence:1, verification:'user-provided', evidence:[{sourceId:'source-json'}] },
      { id:'fact-description', path:'identity.description', value:'Roofing contractor serving residential customers.', sourceId:'source-json', provenance:'user-supplied', confidence:1, verification:'user-provided', evidence:[{sourceId:'source-json'}] },
      { id:'fact-email', path:'contact.email', value:'team@northstar.example', sourceId:'source-json', provenance:'user-supplied', confidence:1, verification:'user-provided', evidence:[{sourceId:'source-json'}] },
      { id:'fact-area', path:'serviceAreas', value:'Glasgow', sourceId:'source-json', provenance:'user-supplied', confidence:1, verification:'user-provided', evidence:[{sourceId:'source-json'}] },
    ],
    companyProfile:{
      identity:{ name:{value:'North Star Roofing Ltd',factId:'fact-name'}, legalName:null, description:{value:'Roofing contractor serving residential customers.',factId:'fact-description'} },
      contact:{ email:{value:'team@northstar.example',factId:'fact-email'}, phone:null, website:null, address:null },
      serviceAreas:[{value:'Glasgow',factId:'fact-area',verification:'user-provided'}],
      services:[{id:'service-1',name:'Emergency roof repairs',sourceId:'source-json',provenance:'user-supplied',verification:'user-provided'}],
      people:[], projects:[], testimonials:[{id:'testimonial-1',quote:'Prompt and tidy.',sourceId:'source-json',provenance:'user-supplied',verification:'user-provided'}], accreditations:[]
    },
    content:[],
  };
}

test('marketing composition creates real pages and binds knowledge-pack provenance', () => {
  const composition = composeProject({ manifest:marketingManifest(), knowledgePack:knowledgePack() });
  assert.deepEqual(composition.pages.map((page) => page.path), ['/', '/services', '/about', '/contact', '/404']);
  assert.ok(composition.pages.every((page) => page.sectionIds.length >= 1));
  const hero = composition.sections.find((section) => section.id === 'page-home-hero');
  const title = hero.bindings.find((entry) => entry.key === 'title');
  const body = hero.bindings.find((entry) => entry.key === 'body');
  assert.equal(title.origin, 'knowledge-fact');
  assert.deepEqual(title.factIds, ['fact-name']);
  assert.deepEqual(title.sourceIds, ['source-json']);
  assert.equal(title.generated, false);
  assert.equal(body.origin, 'knowledge-fact');
  const services = composition.sections.find((section) => section.id === 'page-home-services');
  const items = services.bindings.find((entry) => entry.key === 'items');
  assert.equal(items.origin, 'knowledge-entity');
  assert.deepEqual(items.entityIds, ['service-1']);
  assert.equal(composition.warnings.includes('knowledge-pack-not-provided'), false);
});

test('manifest data is used without pretending it came from source intelligence', () => {
  const composition = composeProject({ manifest:marketingManifest() });
  const services = composition.sections.find((section) => section.id === 'page-home-services');
  const items = services.bindings.find((entry) => entry.key === 'items');
  assert.equal(items.origin, 'manifest');
  assert.equal(items.generated, false);
  assert.ok(composition.warnings.includes('knowledge-pack-not-provided'));
});

test('deterministic defaults are explicitly marked generated', () => {
  const composition = composeProject({ manifest:marketingManifest({ company:{ identity:{name:'North Star Roofing'}, services:[], locations:[], contactDetails:{}, trustSignals:[], conversionGoals:[] } }) });
  const defaults = composition.sections.flatMap((section) => section.bindings).filter((entry) => entry.origin === 'deterministic-default');
  assert.ok(defaults.length > 0, 'the composer still produces deterministic defaults');
  assert.equal(defaults.every((entry) => entry.generated === true), true, 'every deterministic default is marked generated');
  assert.ok(composition.warnings.includes('missing-services'));
  assert.ok(composition.warnings.includes('missing-contact-details'));
});

test('a secondary page heading is not padded out with filler copy', () => {
  const composition = composeProject({ manifest:marketingManifest() });
  const secondaryHero = composition.sections.find((section) => section.id === 'page-services-hero');
  assert.equal(secondaryHero.bindings.some((entry) => entry.key === 'body'), false, '"Services for X." says nothing the heading has not');
});

test('no page prints the same copy twice', () => {
  const composition = composeProject({ manifest: marketingManifest() });
  // The About surface used to bind the company description into its hero and
  // again into the rich-text section directly beneath it. Two independent
  // reviews read that as repeated registration text and a padded, thin page.
  // Stated as an invariant rather than as a fact about About, because any
  // future surface that owns a section and a hero can make the same mistake.
  for (const page of composition.pages) {
    const bodies = page.sectionIds
      .map((id) => composition.sections.find((section) => section.id === id))
      .flatMap((section) => section.bindings.filter((entry) => entry.key === 'body'))
      .map((entry) => JSON.stringify(entry.value));
    const seen = new Set(bodies);
    assert.equal(seen.size, bodies.length, `${page.id} repeats a body: ${bodies.find((body, index) => bodies.indexOf(body) !== index)}`);
  }
});

test('the owner\'s primary goal is never published as visitor-facing copy', () => {
  const manifest = marketingManifest();
  const composition = composeProject({ manifest });
  assert.ok(manifest.project.primaryGoal.length > 0);
  const published = JSON.stringify(composition.sections);
  assert.equal(published.includes(manifest.project.primaryGoal), false, 'primaryGoal is an internal objective, not website copy');
});

test('composition is byte-stable in meaning for identical inputs', () => {
  const first = composeProject({ manifest:marketingManifest(), knowledgePack:knowledgePack() });
  const second = composeProject({ manifest:marketingManifest(), knowledgePack:knowledgePack() });
  assert.deepEqual(first, second);
  assert.match(first.compositionHash, /^[a-f0-9]{64}$/);
});

test('v1 manifests still receive project-type composition defaults as a compatibility path', () => {
  const projectTypes = ['marketing-site','b2b-saas','consumer-app','internal-tool','content-site','ai-app'];
  for (const type of projectTypes) {
    const composition = composeProject({ manifest:{schemaVersion:1,project:{name:`Test ${type}`,slug:`test-${type}`,type,primaryGoal:'Ship V1'},modules:{}} });
    assert.ok(composition.pages.length >= 1, type);
    assert.ok(composition.pages.some((page) => page.path === '/'), `${type} must always publish an entry page`);
    assert.ok(composition.sections.length >= composition.pages.length, type);
    assert.ok(composition.warnings.includes('manifest-v2-not-provided'), type);
    // A surface the factory proposed for itself and could not fill is not published, but it is
    // never dropped silently: the operator has to be able to see what the factory wanted and why
    // it could not build it.
    const published = new Set(composition.pages.map((page) => page.title));
    for (const warning of composition.warnings.filter((item) => item.startsWith('unfillable-surface:'))) {
      assert.ok(!published.has(warning.slice('unfillable-surface:'.length)), `${type} published a surface it reported as unfillable`);
    }
  }
});

test('canonical B2B admin is composed onto a real settings surface', () => {
  const composition = composeProject({ manifest: {
    schemaVersion: 2,
    project: { name: 'Admin consumer', slug: 'admin-consumer', type: 'b2b-saas', primaryGoal: 'Operate safely' },
    modules: { admin: true },
  } });
  const settings = composition.pages.find((page) => page.path === '/settings');
  assert.ok(settings, 'the canonical B2B settings surface must exist');
  const admin = composition.sections.find((section) => section.type === 'administration');
  assert.ok(admin, 'admin must be more than an installed file');
  assert.ok(settings.sectionIds.includes(admin.id), 'the generated runtime must render the admin-owned section');
});

test('a surface the factory proposed and cannot fill is withheld, not shipped as a dead end', () => {
  const composition = composeProject({ manifest:{schemaVersion:2,project:{name:'Thin Content Co',slug:'thin',type:'content-site',primaryGoal:'Publish'},modules:{}} });
  const dropped = composition.warnings.filter((item) => item.startsWith('unfillable-surface:'));
  assert.ok(dropped.length > 0, 'a content site with no sources cannot fill its content surfaces');
  for (const page of composition.pages) {
    const sections = composition.sections.filter((section) => page.sectionIds.includes(section.id));
    const chrome = sections.every((section) => ['hero','cta'].includes(section.type));
    const heroSpeaks = sections.some((section) => section.type === 'hero'
      && section.bindings.some((binding) => binding.key !== 'title' && binding.value));
    assert.ok(page.path === '/' || !chrome || heroSpeaks, `${page.path} shipped as a dead end`);
  }
});

test('a surface the operator declared is published even when the factory cannot fill it', () => {
  const composition = composeProject({ manifest:{schemaVersion:2,project:{name:'Declared Co',slug:'declared',type:'marketing-site',primaryGoal:'Win work'},majorSurfaces:['Home','Projects','Careers'],modules:{}} });
  assert.deepEqual(composition.pages.map((page) => page.path), ['/','/projects','/careers','/404'],
    'operator intent outranks the factory’s own judgement about what it can fill');
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('unfillable-surface:')), []);

  // Published is not the same as unreported. MGB Decor declared "Our Work", the
  // run had no publishable imagery and no project material, and a decorating
  // business shipped an empty proof page into its own navigation and sitemap
  // with nothing attached to say so.
  assert.deepEqual(
    composition.warnings.filter((item) => item.startsWith('empty-declared-surface:')),
    ['empty-declared-surface:Projects', 'empty-declared-surface:Careers'],
  );
});

test('a supplied service name is quoted in generated prose, never recased', () => {
  const composition = composeProject({ manifest: marketingManifest({
    company: { identity: { name: 'MGB Decor' }, services: ['Interior painting and decorating', 'Ames taping'], locations: ['Glasgow'], contactDetails: {}, trustSignals: [], conversionGoals: ['quote request'] },
  }) });
  const prose = composition.sections.flatMap((item) => item.bindings).map((item) => item.value).filter((item) => typeof item === 'string');
  // The summary sentence lowercased everything after its first character, which
  // published MGB Decor's "Ames taping" as "ames taping". A service name is a
  // supplied fact and a tidier sentence is not a reason to rewrite one.
  assert.equal(prose.some((item) => item.includes('ames taping')), false, 'a service name must not be recased');
  assert.ok(prose.some((item) => item.includes('Ames taping')), 'the supplied service name must survive');
});

test('custom and unresolved capability intent survives as composition warnings', () => {
  const manifest = marketingManifest({ constraints:{ customCapabilities:['billing'], excludedCapabilities:[], unresolvedCapabilities:['search'] } });
  const composition = composeProject({ manifest });
  assert.ok(composition.warnings.includes('custom-capability:billing'));
  assert.ok(composition.warnings.includes('unresolved-capability:search'));
});

test('declared trust signals are an inventory, never published as proof', () => {
  // "What proof can we use?" is a closed intake enum. Rendering it produced a
  // proof card reading "case studies" on the nbm build — configuration shown as
  // content, and an unsupported claim in the section that exists for claims.
  const composition = composeProject({ manifest: marketingManifest({
    company: { identity: { name: 'Northbridge Surveying' }, services: ['Cost consultancy'], locations: ['Glasgow'], contactDetails: { phone: '0141 555 0101' }, trustSignals: ['case studies', 'awards'], conversionGoals: ['call'] },
  }) });
  const rendered = JSON.stringify(composition.sections);
  assert.ok(!rendered.includes('case studies'), 'a proof kind must not be rendered as the proof');
  assert.ok(!rendered.includes('awards'));
  assert.ok(!composition.sections.some((section) => section.type === 'proof-grid'),
    'a proof section with nothing to prove is not composed');
  // The declaration is not discarded: it is why the gap is reportable.
  assert.ok(composition.warnings.includes('declared-proof-missing:case studies'));
  assert.ok(composition.warnings.includes('declared-proof-missing:awards'));
});

test('proof the sources actually carry is published and raises no gap', () => {
  const pack = knowledgePack();
  pack.companyProfile.testimonials = [{ id: 't1', quote: 'Clear and reliable', customer: 'J Smith', sourceId: 's1', provenance: 'user-supplied', verification: 'user-provided' }];
  pack.companyProfile.projects = [{ id: 'p1', name: 'Riverside Refurbishment', sourceId: 's1', provenance: 'user-supplied', verification: 'user-provided' }];
  const composition = composeProject({
    manifest: marketingManifest({ company: { identity: { name: 'Northbridge Surveying' }, services: ['Cost consultancy'], locations: ['Glasgow'], contactDetails: { phone: '0141 555 0101' }, trustSignals: ['testimonials', 'case studies'], conversionGoals: ['call'] } }),
    knowledgePack: pack,
  });
  assert.ok(composition.sections.some((section) => section.type === 'proof-grid'));
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('declared-proof-missing:')), []);
});

test('"none" is an answer, not a missing proof gap', () => {
  const composition = composeProject({ manifest: marketingManifest({
    company: { identity: { name: 'Northbridge Surveying' }, services: ['Cost consultancy'], locations: ['Glasgow'], contactDetails: { phone: '0141 555 0101' }, trustSignals: ['none'], conversionGoals: ['call'] },
  }) });
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('declared-proof-missing:')), []);
});

test('the closing call to action does not repeat the same sentence on every page', () => {
  const composition = composeProject({ manifest: marketingManifest({
    majorSurfaces: ['Home', 'Services', 'About'],
    company: { identity: { name: 'Northbridge Surveying' }, services: ['Cost consultancy', 'Project management'], locations: ['Glasgow'], contactDetails: { phone: '0141 555 0101' }, trustSignals: [], conversionGoals: ['call'] },
  }) });
  const bodies = composition.sections
    .filter((section) => section.type === 'cta')
    .map((section) => section.bindings.find((binding) => binding.key === 'body')?.value)
    .filter(Boolean);
  assert.equal(bodies.length, 1, 'only the entry page carries the summary sentence');
  assert.ok(composition.sections.filter((section) => section.type === 'cta').length > 1,
    'secondary pages still offer the action');
});

test('every generated site has somewhere for a bad link to land', () => {
  for (const type of ['marketing-site','b2b-saas','consumer-app','internal-tool','content-site','ai-app']) {
    const composition = composeProject({ manifest:{schemaVersion:2,project:{name:`Test ${type}`,slug:`test-${type}`,type,primaryGoal:'Ship V1'},modules:{}} });
    const notFound = composition.pages.find((page) => page.path === '/404');
    assert.ok(notFound, `${type} composes no not-found route`);
    assert.equal(notFound.navigation.visible, false, 'a recovery surface is not a navigation item');
    assert.deepEqual(notFound.primaryAction, { label: 'Back to home', href: '/' });
    const sections = composition.sections.filter((section) => notFound.sectionIds.includes(section.id));
    assert.ok(sections.length > 0);
    // It is reached by accident, so it must claim nothing about the business.
    for (const section of sections) {
      for (const binding of section.bindings) {
        assert.equal(binding.origin, 'deterministic-default',
          'the recovery surface must not assert anything a source has to back');
      }
    }
  }
});

test('the not-found route is not audited as a journey entry or a missing photograph', () => {
  const rules = JSON.parse(fs.readFileSync('config/launch-readiness-rules.json', 'utf8'));
  const composition = composeProject({ manifest: marketingManifest(), knowledgePack: knowledgePack() });
  const report = auditLaunchReadiness({ composition, rules });
  assert.ok(!report.findings.some((item) => item.check === 'missing-not-found-route'));
  assert.ok(!report.findings.some((item) => item.where === 'page-not-found-hero'),
    'a recovery surface does not need a photograph');
  assert.ok(!report.journeys.some((journey) => journey.entry === '/404'),
    'a 404 is where a journey goes wrong, not where one starts');
});

// ---------------------------------------------------------------------------
// Declared conversion goals
//
// The defect these cover is recorded in config/factory-status.json: composition
// resolved one action for the whole site and returned on the first goal that
// matched, so a pack declaring call, email and contact form shipped one
// identical Call button everywhere and lost the other two without saying so.
// Both independent nbm reviews named the symptom. The rule being asserted is
// the same one `declaredProofGap` already enforces for proof — a declared
// requirement is satisfied, or reported as unsatisfied, and never dropped.
// ---------------------------------------------------------------------------

/** Every action anywhere in the product, wherever composition placed it. */
function placedChannels(composition) {
  const hrefs = [
    ...composition.pages.flatMap((page) => (page.primaryAction ? [page.primaryAction.href] : [])),
    ...composition.sections.flatMap((section) => section.actions.map((action) => action.href)),
  ];
  return new Set(hrefs.map((href) => (href.startsWith('tel:') ? 'call' : href.startsWith('mailto:') ? 'email' : 'route')));
}

test('every declared conversion goal the sources can back reaches the product', () => {
  const manifest = marketingManifest({
    company: {
      ...marketingManifest().company,
      contactDetails: { phone: '0141 333 1836', email: 'hello@example.com' },
      conversionGoals: ['call', 'email', 'contact form'],
    },
  });
  const composition = composeProject({ manifest });

  // The planted failure. Before the fix this set was exactly {'call'}: the first
  // matching goal won and the other two were discarded in silence.
  assert.deepEqual([...placedChannels(composition)].sort(), ['call', 'email', 'route'],
    'a declared conversion goal that can be backed must reach the product');

  // And nothing was quietly reported as a gap instead of being placed.
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('declared-conversion-unsupported:')), []);
});

test('a declared conversion goal the sources cannot back is reported, not dropped', () => {
  // nbm's real shape: call, email and contact form declared, and no approved
  // email address anywhere in the pack.
  const manifest = marketingManifest({
    company: {
      ...marketingManifest().company,
      contactDetails: { phone: '0141 333 1836' },
      conversionGoals: ['call', 'email', 'contact form'],
    },
  });
  const composition = composeProject({ manifest });

  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('declared-conversion-unsupported:')),
    ['declared-conversion-unsupported:email']);
  // The goal is missing because the fact is missing, so nothing may invent one.
  assert.ok(!composition.sections.some((section) => section.actions.some((action) => action.href.startsWith('mailto:'))),
    'an unsupported email goal must never be satisfied with an invented address');
  // The two that are supported still ship.
  assert.deepEqual([...placedChannels(composition)].sort(), ['call', 'route']);

  const rules = JSON.parse(fs.readFileSync('config/launch-readiness-rules.json', 'utf8'));
  const report = auditLaunchReadiness({ composition, rules });
  const finding = report.findings.find((item) => item.check === 'declared-conversion-unsupported');
  assert.ok(finding, 'the launch audit reports the gap as an owned finding, not an unrecognised warning string');
  assert.equal(finding.severity, 'major');
});

test('conversion channels are placed by context rather than printed on every section', () => {
  const manifest = marketingManifest({
    company: {
      ...marketingManifest().company,
      contactDetails: { phone: '0141 333 1836', email: 'hello@example.com' },
      conversionGoals: ['call', 'email', 'contact form'],
    },
  });
  const composition = composeProject({ manifest });
  const section = (id) => composition.sections.find((item) => item.id === id);

  // Hero: one appropriate primary action.
  assert.equal(section('page-home-hero').actions.length, 1);
  // Closing CTA: the primary plus one genuinely different route, never a wall.
  assert.equal(section('page-home-cta').actions.length, 2);
  assert.ok(new Set(section('page-home-cta').actions.map((action) => action.href)).size === 2);
  // The contact route is where somebody goes to choose a channel, so it offers
  // every supported one.
  assert.equal(section('page-contact-hero').actions.length, 2);

  // No action anywhere links to the page it is already on.
  for (const page of composition.pages) {
    for (const id of page.sectionIds) {
      for (const action of section(id).actions) {
        assert.notEqual(action.href, page.path, `${id} links to the page it is on`);
      }
    }
  }
});

test('a phone action carries the number a visitor is about to ring', () => {
  const manifest = marketingManifest({
    company: { ...marketingManifest().company, contactDetails: { phone: '0141 333 1836' }, conversionGoals: ['call'] },
  });
  const composition = composeProject({ manifest });
  assert.deepEqual(composition.pages[0].primaryAction, { label: 'Call 0141 333 1836', href: 'tel:01413331836' });
});

test('a manifest that declares no conversion goal still gets one route to the business', () => {
  const manifest = marketingManifest({
    company: { ...marketingManifest().company, contactDetails: { email: 'hello@example.com' }, conversionGoals: [] },
  });
  const composition = composeProject({ manifest });
  // Unchanged fallback: the contact surface first, then email, then phone.
  assert.deepEqual(composition.pages[0].primaryAction, { label: 'Contact', href: '/contact' });
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('declared-conversion-unsupported:')), []);
});

/**
 * Surfaces a business declares, and the truth that should answer them.
 *
 * The defect these cover: routing used to test the surface's name against a
 * chain of conditions, and a name outside that vocabulary fell through to the
 * application defaults — journeys and entities, both empty on a marketing site.
 * A studio with five source-backed people declared "Studio" and shipped a
 * heading with nothing under it. The material was ingested, survived into the
 * pack, and had nowhere to be asked for.
 */

function packWith(profile) {
  return { schemaVersion: 1, packHash: 'p'.repeat(64), facts: [], companyProfile: profile, assets: [], sources: [] };
}

const PEOPLE = [
  { id: 'e1', sourceId: 's1', name: 'Nella Ardwell', role: 'Founding director' },
  { id: 'e2', sourceId: 's1', name: 'Tomas Roe', role: 'Founding director' },
];

function surfaceManifest(surfaces) {
  return { schemaVersion: 2, project: { name: 'Declared Co', slug: 'declared', type: 'marketing-site', primaryGoal: 'Win work' }, majorSurfaces: ['Home', ...surfaces], modules: {} };
}

function sectionsOn(composition, path) {
  const page = composition.pages.find((entry) => entry.path === path);
  return composition.sections.filter((item) => page.sectionIds.includes(item.id)).map((item) => item.type);
}

test('a people surface is filled whatever the business calls it', () => {
  // Studio, Practice and Firm are the same surface under three house styles, and
  // a business does not owe the factory the word "About".
  for (const name of ['Studio', 'About', 'Our team', 'People', 'The practice', 'Our firm']) {
    const composition = composeProject({ manifest: surfaceManifest([name]), knowledgePack: packWith({ people: PEOPLE }) });
    const types = sectionsOn(composition, `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    assert.ok(types.includes('people-grid'), `${name} did not reach the people it had: ${types.join(', ')}`);
    assert.deepEqual(composition.warnings.filter((item) => item.startsWith('empty-declared-surface:')), [],
      `${name} composed empty despite source-backed people`);
  }
});

test('an offering surface is filled whatever the business calls it', () => {
  const services = [{ id: 'e1', sourceId: 's1', name: 'Refurbishment and extension' }, { id: 'e2', sourceId: 's1', name: 'Adaptive reuse' }];
  for (const name of ['Expertise', 'Services', 'Capabilities', 'What we do', 'Disciplines']) {
    const composition = composeProject({ manifest: surfaceManifest([name]), knowledgePack: packWith({ services }) });
    const types = sectionsOn(composition, `/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    assert.ok(types.includes('item-grid'), `${name} did not reach the services it had: ${types.join(', ')}`);
  }
});

test('a declared surface with no compatible truth stays empty and says so', () => {
  // MGB Decor's case, and it must not be "fixed". The business declared Our Work
  // and supplied no project material and no publishable imagery. Nothing could
  // fill that page, and inventing projects to satisfy the warning would be the
  // worst possible outcome.
  const composition = composeProject({ manifest: surfaceManifest(['Our Work']), knowledgePack: packWith({ services: [{ id: 'e1', sourceId: 's1', name: 'Interior painting' }] }) });
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('empty-declared-surface:')), ['empty-declared-surface:Our Work']);
  // Recognised, and genuinely unanswerable. Not a vocabulary failure.
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('unrecognised-surface-purpose:')), []);
});

test('a surface the composer has no purpose for is reported as such, not as thin input', () => {
  // The two empty cases are different problems with different owners, and
  // reporting both as "empty" is how the first one survived: it read as thin
  // input, which is the explanation the benchmark exists to remove.
  const composition = composeProject({ manifest: surfaceManifest(['Approach']), knowledgePack: packWith({ people: PEOPLE }) });
  assert.ok(composition.warnings.includes('unrecognised-surface-purpose:Approach'));
  assert.ok(composition.warnings.includes('empty-declared-surface:Approach'));
});

test('matching a surface name never invents content', () => {
  // Every builder a purpose calls returns null without its truth, so recognising
  // a name can only ever surface material the sources actually carry.
  const composition = composeProject({ manifest: surfaceManifest(['Studio', 'Expertise']), knowledgePack: packWith({}) });
  for (const path of ['/studio', '/expertise']) {
    const types = sectionsOn(composition, path);
    assert.deepEqual(types.filter((type) => !['hero', 'cta'].includes(type)), [],
      `${path} bound content from a pack that had none`);
  }
  assert.deepEqual(
    composition.warnings.filter((item) => item.startsWith('empty-declared-surface:')).sort(),
    ['empty-declared-surface:Expertise', 'empty-declared-surface:Studio'],
  );
});

test('a firm\'s "Practice areas" is still where it works, not who it is', () => {
  // `practice` had to join the people vocabulary for "The practice" to route, and
  // the obvious collision is a law firm's practice areas. Coverage is tested
  // first for exactly this reason.
  const composition = composeProject({
    manifest: surfaceManifest(['Practice areas']),
    knowledgePack: packWith({ serviceAreas: [{ value: 'Bristol', factId: null }], people: PEOPLE }),
  });
  assert.ok(sectionsOn(composition, '/practice-areas').includes('location-list'));
});
