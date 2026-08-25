export const FACTORY_ENGINE_VERSION = 1;

const DEPTH_RANK = { quick: 0, standard: 1, thorough: 2 };

export function slugify(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project';
}

export function mergeQuestionnaires(base, specific) {
  const byId = new Map();
  for (const question of [...(base?.questions ?? []), ...(specific?.questions ?? [])]) byId.set(question.id, question);
  return [...byId.values()];
}

export function questionsForMode(questions, mode) {
  const selectedRank = DEPTH_RANK[mode] ?? DEPTH_RANK.standard;
  return questions.filter((question) => {
    const depth = question.depth ?? (question.required ? 'quick' : 'standard');
    return (DEPTH_RANK[depth] ?? DEPTH_RANK.standard) <= selectedRank;
  });
}

export function applyQuestionDefaults(questions, answers = {}) {
  const next = { ...answers };
  for (const question of questions) {
    if (next[question.id] === undefined && question.default !== undefined) next[question.id] = structuredClone(question.default);
  }
  return next;
}

export function isAnswered(question, value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some((item) => String(item ?? '').trim().length > 0);
  return true;
}

export function getUnresolvedHighImpactQuestions(questions, answers) {
  return questions.filter((question) => question.required && !isAnswered(question, answers[question.id])).map((question) => question.label);
}

export function createIntakeSession({ projectType, mode = 'standard', questionnaireVersion = '1.1.0', questions, seedAnswers = {} }) {
  const answers = applyQuestionDefaults(questions, { project_type: projectType, ...seedAnswers });
  return {
    schemaVersion: 1,
    questionnaireVersion,
    projectType,
    mode,
    status: 'in-progress',
    answers,
    unresolvedHighImpactQuestions: getUnresolvedHighImpactQuestions(questions, answers),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function deriveEnabledModules(projectType, answers, projectTypesConfig) {
  const defaults = projectTypesConfig.projectTypes?.[projectType]?.defaultModules ?? [];
  const modules = new Set(defaults);
  if (answers.account_required === false) { modules.delete('auth'); modules.delete('profiles'); }
  if (answers.tenant_model === 'organisation' || answers.tenant_model === 'both/depends') modules.add('organisations');
  if (answers.uploads === true || answers.user_content === true) modules.add('uploads');
  if (answers.billing === true || answers.monetisation === true) modules.add('billing');
  if (Array.isArray(answers.notifications) && answers.notifications.some((value) => value !== 'none')) modules.add('notifications');
  if (Array.isArray(answers.integrations) && answers.integrations.length > 0) modules.add('integrations');
  if (answers.audit_required === true) modules.add('audit-log');
  if (answers.offline === true) modules.add('pwa');
  if (answers.site_search === true) modules.add('search');
  if (answers.newsletter === true) { modules.add('email'); modules.add('lead-generation'); }
  if (answers.moderation === true) modules.add('admin');
  if (projectType === 'ai-app') modules.add('ai');
  return [...modules].sort();
}

function mapBudget(costPriority, aiCostPriority) {
  if (aiCostPriority === 'lowest-cost' || costPriority === 'lowest-sensible-cost') return { mode: 'economy', maxBuildCostGbp: 5 };
  if (aiCostPriority === 'highest-quality' || costPriority === 'performance-first') return { mode: 'quality', maxBuildCostGbp: 25 };
  return { mode: 'balanced', maxBuildCostGbp: 12 };
}

function defaultInfrastructure(projectType) {
  return { backend: ['marketing-site', 'content-site'].includes(projectType) ? 'none' : 'supabase', deployment: 'netlify' };
}

export function buildProjectManifest({ projectType, answers, projectTypesConfig }) {
  const name = String(answers.project_name ?? answers.company_identity?.name ?? 'New Project').trim();
  const enabledModules = deriveEnabledModules(projectType, answers, projectTypesConfig);
  const knownModules = new Set(Object.keys(projectTypesConfig.moduleRegistry?.modules ?? {}));
  const modules = {};
  for (const moduleName of knownModules) modules[moduleName] = enabledModules.includes(moduleName);
  for (const moduleName of enabledModules) if (!(moduleName in modules)) modules[moduleName] = true;
  return {
    schemaVersion: 1,
    project: { name, slug: slugify(name), type: projectType, primaryGoal: String(answers.primary_goal ?? '').trim() },
    modules,
    infrastructure: defaultInfrastructure(projectType),
    aiBudget: mapBudget(answers.cost_priority, answers.ai_cost_priority),
    brand: { designControl: answers.design_control ?? 'sensible-defaults' },
    inputs: { inventory: answers.existing_inputs ?? [], existingWebsite: answers.existing_site || undefined },
    outOfScope: Array.isArray(answers.out_of_scope) ? answers.out_of_scope : []
  };
}

export function buildBuildContract({ projectType, answers, questions, projectTypesConfig }) {
  const unresolved = getUnresolvedHighImpactQuestions(questions, answers);
  const mustHave = Array.isArray(answers.must_have) ? answers.must_have : [];
  return {
    version: 1,
    status: unresolved.length === 0 ? 'ready-for-review' : 'draft',
    project: {
      name: String(answers.project_name ?? answers.company_identity?.name ?? 'New Project').trim(),
      type: projectType,
      primaryGoal: String(answers.primary_goal ?? '').trim(),
      targetUsers: String(answers.target_users ?? '').trim()
    },
    coreJourneys: mustHave,
    enabledModules: deriveEnabledModules(projectType, answers, projectTypesConfig),
    explicitlyExcluded: Array.isArray(answers.out_of_scope) ? answers.out_of_scope : [],
    acceptanceCriteria: mustHave.map((item) => `V1 supports: ${item}`),
    unresolvedHighImpactQuestions: unresolved,
    sourceInputs: Array.isArray(answers.existing_inputs) ? answers.existing_inputs : [],
    designDirection: answers.design_control ?? 'sensible-defaults'
  };
}

export function approveBuildContract(contract) {
  if ((contract.unresolvedHighImpactQuestions ?? []).length > 0) throw new Error('Build Contract cannot be approved while high-impact questions remain unresolved.');
  return { ...contract, status: 'approved' };
}
