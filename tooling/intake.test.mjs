import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { approveBuildContract, applyQuestionDefaults, buildBuildContract, buildProjectManifest, deriveEnabledModules, mergeQuestionnaires, questionsForMode } from '../packages/factory-core/src/index.js';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const base = read('questionnaires/v1/base.json');
const projectTypes = read('config/project-types.json');
const modules = read('config/modules.json');
const config = { ...projectTypes, moduleRegistry: modules };
const examples = {
  'marketing-site': { company_identity: { name: 'North Star Roofing', description: 'Roofing company' }, services: ['Roof repairs'] },
  'b2b-saas': { core_entities: ['Projects', 'Documents'] },
  'consumer-app': {},
  'internal-tool': { internal_users: ['Operations'], core_entities: ['Tasks'] },
  'content-site': { content_types: ['Articles'] },
  'ai-app': { ai_jobs: ['Summarise documents'] }
};

for (const [projectType, typeConfig] of Object.entries(projectTypes.projectTypes)) {
  test(`${projectType} supports quick, standard and thorough intake`, () => {
    const specific = read(`questionnaires/v1/${typeConfig.questionnaire}.json`);
    const merged = mergeQuestionnaires(base, specific);
    const quick = questionsForMode(merged, 'quick');
    const standard = questionsForMode(merged, 'standard');
    const thorough = questionsForMode(merged, 'thorough');
    assert.ok(quick.length > 0);
    assert.ok(standard.length >= quick.length);
    assert.ok(thorough.length >= standard.length);
  });

  test(`${projectType} produces deterministic contract and manifest`, () => {
    const specific = read(`questionnaires/v1/${typeConfig.questionnaire}.json`);
    const questions = questionsForMode(mergeQuestionnaires(base, specific), 'quick');
    const answers = applyQuestionDefaults(questions, { project_type: projectType, project_name: `Test ${projectType}`, primary_goal: 'Ship a useful V1', target_users: 'Test users', must_have: ['Complete the core workflow'], ...examples[projectType] });
    const contract = buildBuildContract({ projectType, answers, questions, projectTypesConfig: config });
    assert.deepEqual(contract.unresolvedHighImpactQuestions, []);
    assert.equal(contract.status, 'ready-for-review');
    assert.equal(approveBuildContract(contract).status, 'approved');
    const manifest = buildProjectManifest({ projectType, answers, projectTypesConfig: config });
    assert.equal(manifest.project.type, projectType);
    assert.equal(manifest.project.slug, `test-${projectType}`);
  });
}

test('B2B answers turn optional modules on deterministically', () => {
  const enabled = deriveEnabledModules('b2b-saas', { tenant_model: 'organisation', uploads: true, billing: true, integrations: ['CRM'] }, config);
  for (const expected of ['organisations', 'uploads', 'billing', 'integrations']) assert.ok(enabled.includes(expected), `expected ${expected}`);
});

test('consumer accounts can be explicitly disabled', () => {
  const enabled = deriveEnabledModules('consumer-app', { account_required: false }, config);
  assert.ok(!enabled.includes('auth'));
  assert.ok(!enabled.includes('profiles'));
});
