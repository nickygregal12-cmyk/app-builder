import test from 'node:test';
import assert from 'node:assert/strict';
import { composeProject } from '../packages/composition/src/index.js';

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
  assert.deepEqual(composition.pages.map((page) => page.path), ['/', '/services', '/about', '/contact']);
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
  assert.deepEqual(composition.pages.map((page) => page.path), ['/','/projects','/careers'],
    'operator intent outranks the factory’s own judgement about what it can fill');
  assert.deepEqual(composition.warnings.filter((item) => item.startsWith('unfillable-surface:')), []);
});

test('custom and unresolved capability intent survives as composition warnings', () => {
  const manifest = marketingManifest({ constraints:{ customCapabilities:['billing'], excludedCapabilities:[], unresolvedCapabilities:['search'] } });
  const composition = composeProject({ manifest });
  assert.ok(composition.warnings.includes('custom-capability:billing'));
  assert.ok(composition.warnings.includes('unresolved-capability:search'));
});
