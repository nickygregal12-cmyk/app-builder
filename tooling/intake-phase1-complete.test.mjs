import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyQuestionDefaults, approveBuildContract, assessRequestedCapabilities, buildAmbiguityFollowUpRequest,
  buildBuildContract, buildProjectManifest, collectAcceptedDefaultEvidence, createFeedbackEvent,
  createSourceReference, deriveMajorSurfaces, isQuestionVisible, questionsForMode, serializeIntakeBundle
} from '../packages/factory-core/src/index.js';

const config = {
  projectTypes: {
    'b2b-saas': { defaultModules: ['auth','profiles'] },
    'marketing-site': { defaultModules: ['seo'] }
  },
  moduleRegistry: { modules: {
    auth:{status:'ready'}, profiles:{status:'ready'}, organisations:{status:'ready'}, uploads:{status:'ready'},
    billing:{status:'planned'}, integrations:{status:'planned'}, seo:{status:'ready'}
  } }
};

const conditional = [
  { id:'uploads', label:'Uploads?', type:'boolean', depth:'quick', default:false },
  { id:'upload_types', label:'Which files?', type:'list', depth:'quick', impact:'high', when:{ questionId:'uploads', equals:true } }
];

test('conditional questions are hidden until their condition matches', () => {
  assert.equal(isQuestionVisible(conditional[1], { uploads:false }), false);
  assert.equal(questionsForMode(conditional, 'quick', { uploads:false }).length, 1);
  assert.equal(questionsForMode(conditional, 'quick', { uploads:true }).length, 2);
});

test('defaults are not applied to hidden questions', () => {
  const questions = [{ id:'child', label:'Child', type:'text', default:'x', when:{questionId:'parent', equals:true} }];
  assert.equal(applyQuestionDefaults(questions, { parent:false }).child, undefined);
});

test('source references normalise metadata without file bytes', () => {
  const source = createSourceReference({ kind:'document', name:'brochure.pdf', mimeType:'application/pdf', size:1234 });
  assert.equal(source.name, 'brochure.pdf');
  assert.equal(source.provenance, 'user-supplied');
  assert.equal('content' in source, false);
});

test('high-impact ambiguity creates bounded follow-up candidates', () => {
  const request = buildAmbiguityFollowUpRequest({ questions:[{id:'tenant_model',label:'Who owns data?',type:'text',impact:'high'}], answers:{tenant_model:'decide-for-me'} });
  assert.equal(request.required, true);
  assert.equal(request.candidates.length, 1);
  assert.ok(request.budget.maxTokens <= 1200);
});

test('accepted defaults are captured as evidence once', () => {
  const q = [{ id:'billing', label:'Billing?', type:'boolean', default:false }];
  const first = collectAcceptedDefaultEvidence(q, {billing:false}, []);
  const second = collectAcceptedDefaultEvidence(q, {billing:false}, first);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].type, 'accepted-default');
});

test('feedback event supports correction and learning records', () => {
  const event = createFeedbackEvent('corrected-answer', { questionId:'billing', previousValue:false, nextValue:true });
  assert.equal(event.type, 'corrected-answer');
  assert.equal(event.questionId, 'billing');
});

test('manifest v2 preserves structured requirements and sources instead of dropping intake detail', () => {
  const questions = [
    {id:'project_name',label:'Name',type:'text',required:true},
    {id:'primary_goal',label:'Goal',type:'text',required:true},
    {id:'target_users',label:'Users',type:'text',required:true},
    {id:'must_have',label:'Must',type:'list',required:true}
  ];
  const answers = {
    project_name:'Example', primary_goal:'Ship', target_users:'QS teams', must_have:['Upload tenders','Compare bids'],
    core_entities:['Tender','Bid'], roles:['owner','member'], integrations:['Accounting API'], tenant_model:'organisation',
    uploads:true, upload_types:['PDF','XLSX'], hard_constraints:['UK hosting preferred']
  };
  const sources = [createSourceReference({kind:'url',label:'Existing site',uri:'https://example.com'})];
  const contract = buildBuildContract({projectType:'b2b-saas',answers,questions,projectTypesConfig:config,sourceReferences:sources,capabilityDecisions:{integrations:'custom-work'}});
  const manifest = buildProjectManifest({projectType:'b2b-saas',answers,projectTypesConfig:config,sourceReferences:sources,capabilityDecisions:{integrations:'custom-work'}});
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.audience.summary, 'QS teams');
  assert.deepEqual(manifest.journeys, ['Upload tenders','Compare bids']);
  assert.deepEqual(manifest.entities, ['Tender','Bid']);
  assert.deepEqual(manifest.audience.roles, ['owner','member']);
  assert.deepEqual(manifest.constraints.integrations, ['Accounting API']);
  assert.deepEqual(manifest.constraints.uploadTypes, ['PDF','XLSX']);
  assert.deepEqual(manifest.constraints.customCapabilities, ['integrations']);
  assert.equal(manifest.modules.integrations, false);
  assert.equal(manifest.inputs.sources[0].uri, 'https://example.com');
  assert.deepEqual(contract.entities, ['Tender','Bid']);
  assert.equal(contract.sourceInputs[0].uri, 'https://example.com');
});

test('major surfaces are deterministic by project type and can be explicitly overridden', () => {
  assert.deepEqual(deriveMajorSurfaces('marketing-site', {}), ['Home','Services','About','Contact']);
  assert.deepEqual(deriveMajorSurfaces('marketing-site', {major_surfaces:['Home','Emergency repairs']}), ['Home','Emergency repairs']);
  assert.deepEqual(deriveMajorSurfaces('marketing-site', {locations:['Glasgow']}), ['Home','Services','About','Contact','Locations']);
});

test('unavailable requested modules are approval decisions, not enabled deterministic recipes', () => {
  const plan = assessRequestedCapabilities('b2b-saas', {billing:true,integrations:['CRM']}, config);
  assert.deepEqual(plan.readyModules, ['auth','profiles']);
  assert.deepEqual(plan.unresolvedModules.sort(), ['billing','integrations']);
  const custom = assessRequestedCapabilities('b2b-saas', {billing:true,integrations:['CRM']}, config, {billing:'exclude',integrations:'custom-work'});
  assert.deepEqual(custom.excludedModules, ['billing']);
  assert.deepEqual(custom.customWorkModules, ['integrations']);
  assert.equal(custom.readyModules.includes('billing'), false);
});

test('approval fails closed until every unavailable requested capability has an explicit decision', () => {
  const questions = [
    {id:'project_name',label:'Name',type:'text',required:true},
    {id:'primary_goal',label:'Goal',type:'text',required:true},
    {id:'target_users',label:'Users',type:'text',required:true},
    {id:'must_have',label:'Must',type:'list',required:true}
  ];
  const answers = {project_name:'Paid app',primary_goal:'Sell access',target_users:'Teams',must_have:['Subscribe'],billing:true};
  const blocked = buildBuildContract({projectType:'b2b-saas',answers,questions,projectTypesConfig:config});
  assert.equal(blocked.status, 'draft');
  assert.deepEqual(blocked.unresolvedCapabilityDecisions, ['billing']);
  assert.throws(() => approveBuildContract(blocked), /unavailable capabilities/);
  const resolved = buildBuildContract({projectType:'b2b-saas',answers,questions,projectTypesConfig:config,capabilityDecisions:{billing:'custom-work'}});
  assert.equal(resolved.status, 'ready-for-review');
  assert.deepEqual(resolved.enabledModules, ['auth','profiles']);
  assert.deepEqual(resolved.customWorkModules, ['billing']);
  assert.equal(approveBuildContract(resolved).status, 'approved');
});

test('intake bundle serialises v2 approved artifacts for persistence and export', () => {
  const feedback = [createFeedbackEvent('missing-requirement', {detail:'Need VAT handling'})];
  const text = serializeIntakeBundle({ session:{feedback}, buildContract:{status:'approved'}, projectManifest:{schemaVersion:2} });
  const parsed = JSON.parse(text);
  assert.equal(parsed.bundleVersion, 2);
  assert.equal(parsed.session.feedback[0].type, 'missing-requirement');
  assert.equal(parsed.buildContract.status, 'approved');
  assert.equal(parsed.projectManifest.schemaVersion, 2);
});
