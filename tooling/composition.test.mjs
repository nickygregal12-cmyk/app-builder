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
  const nonHomeHero = composition.sections.find((section) => section.id === 'page-services-hero');
  const body = nonHomeHero.bindings.find((entry) => entry.key === 'body');
  assert.equal(body.origin, 'deterministic-default');
  assert.equal(body.generated, true);
  assert.ok(composition.warnings.includes('missing-services'));
  assert.ok(composition.warnings.includes('missing-contact-details'));
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
    assert.ok(composition.pages.length >= 4, type);
    assert.ok(composition.sections.length >= composition.pages.length, type);
    assert.ok(composition.warnings.includes('manifest-v2-not-provided'), type);
  }
});

test('custom and unresolved capability intent survives as composition warnings', () => {
  const manifest = marketingManifest({ constraints:{ customCapabilities:['billing'], excludedCapabilities:[], unresolvedCapabilities:['search'] } });
  const composition = composeProject({ manifest });
  assert.ok(composition.warnings.includes('custom-capability:billing'));
  assert.ok(composition.warnings.includes('unresolved-capability:search'));
});
