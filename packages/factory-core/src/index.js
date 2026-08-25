export const FACTORY_ENGINE_VERSION = 2;

const DEPTH_RANK = { quick: 0, standard: 1, thorough: 2 };
const AMBIGUOUS_VALUES = new Set(['unknown', 'decide-for-me', 'decide for me', 'both/depends']);

export function slugify(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-project';
}

export function mergeQuestionnaires(base, specific) {
  const byId = new Map();
  for (const question of [...(base?.questions ?? []), ...(specific?.questions ?? [])]) byId.set(question.id, question);
  return [...byId.values()];
}

function matchesWhen(when, answers) {
  if (!when) return true;
  const value = answers?.[when.questionId];
  if ('equals' in when) return value === when.equals;
  if ('notEquals' in when) return value !== when.notEquals;
  if (Array.isArray(when.in)) return when.in.includes(value);
  if (Array.isArray(when.includes)) return Array.isArray(value) && when.includes.some((item) => value.includes(item));
  if ('truthy' in when) return when.truthy ? Boolean(value) : !value;
  return true;
}

export function isQuestionVisible(question, answers = {}) {
  if (!question.when) return true;
  const conditions = Array.isArray(question.when) ? question.when : [question.when];
  return conditions.every((condition) => matchesWhen(condition, answers));
}

export function questionsForMode(questions, mode, answers = {}) {
  const selectedRank = DEPTH_RANK[mode] ?? DEPTH_RANK.standard;
  return questions.filter((question) => {
    const depth = question.depth ?? (question.required ? 'quick' : 'standard');
    return (DEPTH_RANK[depth] ?? DEPTH_RANK.standard) <= selectedRank && isQuestionVisible(question, answers);
  });
}

export function applyQuestionDefaults(questions, answers = {}) {
  const next = { ...answers };
  for (const question of questions) {
    if (!isQuestionVisible(question, next)) continue;
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
  return questions
    .filter((question) => isQuestionVisible(question, answers) && question.required && !isAnswered(question, answers[question.id]))
    .map((question) => question.label);
}

export function createSourceReference(input = {}) {
  const kind = input.kind ?? 'other';
  const label = String(input.label ?? input.name ?? input.uri ?? 'Source').trim();
  return {
    id: input.id ?? `${kind}-${slugify(label)}-${String(input.size ?? '').slice(-6)}`.replace(/-+$/g, ''),
    kind,
    label,
    uri: input.uri || undefined,
    name: input.name || undefined,
    mimeType: input.mimeType || undefined,
    size: Number.isFinite(input.size) ? input.size : undefined,
    provenance: input.provenance ?? 'user-supplied',
    purpose: input.purpose || undefined,
    recordedAt: input.recordedAt ?? new Date().toISOString()
  };
}

export function createFeedbackEvent(type, detail = {}) {
  return {
    id: detail.id ?? `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    questionId: detail.questionId || undefined,
    detail: detail.detail || undefined,
    previousValue: detail.previousValue,
    nextValue: detail.nextValue,
    createdAt: detail.createdAt ?? new Date().toISOString()
  };
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function collectAcceptedDefaultEvidence(questions, answers, existingEvents = []) {
  const seen = new Set(existingEvents.filter((event) => event.type === 'accepted-default').map((event) => event.questionId));
  const events = [...existingEvents];
  for (const question of questions) {
    if (question.default === undefined || seen.has(question.id) || !isQuestionVisible(question, answers)) continue;
    if (sameValue(question.default, answers[question.id])) events.push(createFeedbackEvent('accepted-default', { questionId: question.id, detail: 'Default accepted unchanged.' }));
  }
  return events;
}

function isAmbiguous(value) {
  if (typeof value === 'string') return AMBIGUOUS_VALUES.has(value.trim().toLowerCase());
  if (Array.isArray(value)) return value.some((item) => typeof item === 'string' && AMBIGUOUS_VALUES.has(item.trim().toLowerCase()));
  return false;
}

export function buildAmbiguityFollowUpRequest({ questions, answers, maxQuestions = 3, maxTokens = 1200 }) {
  const candidates = questions
    .filter((question) => isQuestionVisible(question, answers))
    .filter((question) => ['blocking', 'high'].includes(question.impact ?? 'normal'))
    .filter((question) => isAmbiguous(answers[question.id]) || (question.followUpIfMissing === true && !isAnswered(question, answers[question.id])))
    .map((question) => ({
      id: `followup-${question.id}`,
      questionId: question.id,
      question: question.label,
      reason: !isAnswered(question, answers[question.id]) ? 'High-impact answer is missing.' : 'High-impact answer is explicitly ambiguous.',
      impact: question.impact ?? 'high'
    }));
  return {
    version: 1,
    required: candidates.length > 0,
    maxQuestions,
    aiAllowed: true,
    budget: { maxTokens, modelClass: 'economy' },
    candidates: candidates.slice(0, maxQuestions)
  };
}

export function createIntakeSession({ projectType, mode = 'standard', questionnaireVersion = '1.2.0', questions, seedAnswers = {}, sourceReferences = [], feedback = [] }) {
  const answers = applyQuestionDefaults(questions, { project_type: projectType, ...seedAnswers });
  const visible = questionsForMode(questions, mode, answers);
  return {
    schemaVersion: 1,
    questionnaireVersion,
    projectType,
    mode,
    status: 'in-progress',
    answers,
    sourceReferences: sourceReferences.map(createSourceReference),
    feedback,
    ambiguityFollowUp: buildAmbiguityFollowUpRequest({ questions: visible, answers }),
    unresolvedHighImpactQuestions: getUnresolvedHighImpactQuestions(visible, answers),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function serializeIntakeBundle({ session, buildContract, projectManifest }) {
  return JSON.stringify({
    bundleVersion: 1,
    exportedAt: new Date().toISOString(),
    session,
    buildContract,
    projectManifest
  }, null, 2);
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

export function buildProjectManifest({ projectType, answers, projectTypesConfig, sourceReferences = [] }) {
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
    inputs: {
      inventory: answers.existing_inputs ?? [],
      existingWebsite: answers.existing_site || undefined,
      sources: sourceReferences.map(createSourceReference)
    },
    outOfScope: Array.isArray(answers.out_of_scope) ? answers.out_of_scope : []
  };
}

export function buildBuildContract({ projectType, answers, questions, projectTypesConfig, sourceReferences = [] }) {
  const visible = questions.filter((question) => isQuestionVisible(question, answers));
  const unresolved = getUnresolvedHighImpactQuestions(visible, answers);
  const mustHave = Array.isArray(answers.must_have) ? answers.must_have : [];
  const followUp = buildAmbiguityFollowUpRequest({ questions: visible, answers });
  return {
    version: 2,
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
    ambiguityFollowUp: followUp,
    sourceInputs: sourceReferences.map(createSourceReference),
    designDirection: answers.design_control ?? 'sensible-defaults'
  };
}

export function approveBuildContract(contract) {
  if ((contract.unresolvedHighImpactQuestions ?? []).length > 0) throw new Error('Build Contract cannot be approved while high-impact questions remain unresolved.');
  return { ...contract, status: 'approved', approvedAt: new Date().toISOString() };
}
