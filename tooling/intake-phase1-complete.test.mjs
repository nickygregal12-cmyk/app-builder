import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyQuestionDefaults, buildAmbiguityFollowUpRequest, buildBuildContract, buildProjectManifest,
  collectAcceptedDefaultEvidence, createFeedbackEvent, createSourceReference, isQuestionVisible,
  questionsForMode, serializeIntakeBundle
} from '../packages/factory-core/src/index.js';

const config = {
  projectTypes: { 'b2b-saas': { defaultModules: ['auth','profiles'] }, 'marketing-site': { defaultModules: ['seo'] } },
  moduleRegistry: { modules: { auth:{}, profiles:{}, organisations:{}, uploads:{}, billing:{}, integrations:{}, seo:{} } }
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

test('contract and manifest carry structured sources', () => {
  const questions = [{id:'project_name',label:'Name',type:'text',required:true},{id:'primary_goal',label:'Goal',type:'text',required:true},{id:'target_users',label:'Users',type:'text',required:true},{id:'must_have',label:'Must',type:'list',required:true}];
  const answers = {project_name:'Example',primary_goal:'Ship',target_users:'Teams',must_have:['Upload'],uploads:true};
  const sources = [createSourceReference({kind:'url',label:'Existing site',uri:'https://example.com'})];
  const contract = buildBuildContract({projectType:'b2b-saas',answers,questions,projectTypesConfig:config,sourceReferences:sources});
  const manifest = buildProjectManifest({projectType:'b2b-saas',answers,projectTypesConfig:config,sourceReferences:sources});
  assert.equal(contract.sourceInputs[0].uri, 'https://example.com');
  assert.equal(manifest.inputs.sources[0].uri, 'https://example.com');
});

test('intake bundle serialises approved artifacts for persistence/export', () => {
  const feedback = [createFeedbackEvent('missing-requirement', {detail:'Need VAT handling'})];
  const text = serializeIntakeBundle({ session:{feedback}, buildContract:{status:'approved'}, projectManifest:{schemaVersion:1} });
  const parsed = JSON.parse(text);
  assert.equal(parsed.session.feedback[0].type, 'missing-requirement');
  assert.equal(parsed.buildContract.status, 'approved');
});
