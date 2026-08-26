export const FACTORY_ENGINE_VERSION = 4;

const DEPTH_RANK = { quick: 0, standard: 1, thorough: 2 };
const AMBIGUOUS_VALUES = new Set(['unknown', 'decide-for-me', 'decide for me', 'both/depends']);
const SURFACE_DEFAULTS = {
  'marketing-site': ['Home', 'Services', 'About', 'Contact'],
  'b2b-saas': ['Sign in', 'Dashboard', 'Workspace', 'Settings'],
  'consumer-app': ['Onboarding', 'Home', 'Primary experience', 'Profile and settings'],
  'internal-tool': ['Sign in', 'Dashboard', 'Records', 'Administration'],
  'content-site': ['Home', 'Content index', 'Content detail', 'About'],
  'ai-app': ['Workspace', 'Input', 'Results', 'History and settings']
};

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

export function normalizeListAnswer(value) {
  const lines = Array.isArray(value) ? value.map((item) => String(item ?? '')) : String(value ?? '').split('\n');
  return lines.map((item) => item.trim()).filter(Boolean);
}

export function isAnswered(question, value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => String(item ?? '').trim().length > 0);
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
  const rightsStatus = input.rightsStatus || undefined;
  const assetStatus = input.assetStatus || undefined;
  if (assetStatus === 'approved' && rightsStatus !== 'approved-for-use') {
    throw new Error('Approved source assets require rightsStatus approved-for-use.');
  }
  if (input.publishUseAllowed === true && (rightsStatus !== 'approved-for-use' || assetStatus !== 'approved')) {
    throw new Error('Publishable source assets require approved-for-use rights and approved asset status.');
  }
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
    rightsStatus,
    assetStatus,
    sourceRole: input.sourceRole || undefined,
    sourceChannel: input.sourceChannel || undefined,
    instructionAuthority: 'none',
    publishUseAllowed: rightsStatus === 'approved-for-use' && assetStatus === 'approved',
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

export function createIntakeSession({ projectType, mode = 'standard', questionnaireVersion = '1.3.0', questions, seedAnswers = {}, sourceReferences = [], feedback = [] }) {
  const answers = applyQuestionDefaults(questions, { project_type: projectType, ...seedAnswers });
  const visible = questionsForMode(questions, mode, answers);
  return {
    schemaVersion: 2,
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

// An approved intake is a durable artifact, so anything hashed from it has to
// serialise the same way twice. Key order in a JSON object is incidental, and
// two runs that agree on every value must not disagree on a hash.
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

/**
 * Which answers the operator left at the questionnaire's default.
 *
 * A default is a decision the operator did not make, so a replay has to be able
 * to show it as one rather than presenting it as an answer they gave.
 */
export function collectAcceptedDefaults(questions, answers = {}) {
  const accepted = [];
  for (const question of questions) {
    if (question.default === undefined || !isQuestionVisible(question, answers)) continue;
    if (!sameValue(question.default, answers[question.id])) continue;
    accepted.push({ questionId: question.id, value: structuredClone(answers[question.id]), detail: 'Default accepted unchanged.' });
  }
  return accepted;
}

/**
 * Build the durable record of an approved intake.
 *
 * It carries approved intent only. Generated output is deliberately absent: a
 * replay reproduces the decisions, then the factory builds again from scratch.
 * Hashes are supplied by the caller, because the only component that mints a
 * durable bundle is the factory service and it owns the hash function.
 */
export function createApprovedIntakeBundle({
  bundleId,
  createdAt,
  provenance,
  projectType,
  mode,
  questionnaireVersion,
  questions,
  answers,
  sourceReferences = [],
  capabilityDecisions = {},
  feedback = [],
  buildContract,
  projectManifest,
  buildContractHash,
  projectManifestHash,
}) {
  if (buildContract?.status !== 'approved') throw new Error('An intake bundle records an approved Build Contract; this one is not approved.');
  const visible = questionsForMode(questions, mode, answers);
  return {
    schemaVersion: 1,
    bundleId,
    createdAt,
    provenance: { factoryEngineVersion: FACTORY_ENGINE_VERSION, ...provenance },
    questionnaire: {
      version: questionnaireVersion,
      projectType,
      mode,
      questionIds: visible.map((question) => question.id),
      requiredQuestionIds: visible.filter((question) => question.required).map((question) => question.id),
    },
    intake: {
      answers: structuredClone(answers),
      acceptedDefaults: collectAcceptedDefaults(visible, answers),
      capabilityDecisions: structuredClone(capabilityDecisions),
      sourceReferences: sourceReferences.map(createSourceReference),
      feedback: structuredClone(feedback),
    },
    buildContract,
    buildContractHash,
    projectManifest,
    projectManifestHash,
  };
}

/**
 * What changed underneath an approved intake since it was recorded.
 *
 * Replay must not quietly coerce an old bundle into a questionnaire that has
 * moved. `blocking` drift means the recorded intent can no longer be trusted to
 * mean what it meant; `notice` drift is worth showing the operator and is safe
 * to proceed through.
 */
export function detectIntakeBundleDrift(bundle, { questions, questionnaireVersion, projectTypesConfig }) {
  const drift = [];
  if (bundle?.schemaVersion !== 1) {
    drift.push({ code: 'bundle-schema-unsupported', severity: 'blocking', detail: `This factory replays approved-intake bundles at schemaVersion 1; the bundle declares ${JSON.stringify(bundle?.schemaVersion ?? null)}.` });
    return drift;
  }
  const { projectType, mode, version } = bundle.questionnaire;
  if (!projectTypesConfig?.projectTypes?.[projectType]) {
    drift.push({ code: 'project-type-unknown', severity: 'blocking', detail: `Project type ${projectType} is no longer a first-class type in this factory.` });
    return drift;
  }
  if (questionnaireVersion && version !== questionnaireVersion) {
    drift.push({ code: 'questionnaire-version-changed', severity: 'blocking', detail: `The bundle was approved against questionnaire ${version}; this factory asks ${questionnaireVersion}. Re-approve the intake rather than replaying answers to different questions.` });
  }
  const answers = bundle.intake.answers ?? {};
  const visible = questionsForMode(questions, mode, answers);
  const currentIds = new Set(visible.map((question) => question.id));
  for (const question of visible) {
    if (question.required && !isAnswered(question, answers[question.id])) {
      drift.push({ code: 'required-question-unanswered', severity: 'blocking', detail: `The questionnaire now requires "${question.label}", which this bundle has no answer for.` });
    }
  }
  for (const questionId of bundle.questionnaire.questionIds ?? []) {
    if (!currentIds.has(questionId)) {
      drift.push({ code: 'question-removed', severity: 'notice', detail: `Question ${questionId} no longer exists, so its recorded answer is inert.` });
    }
  }
  if (bundle.provenance?.factoryEngineVersion !== FACTORY_ENGINE_VERSION) {
    drift.push({ code: 'factory-engine-changed', severity: 'notice', detail: `The bundle was approved by factory engine ${bundle.provenance?.factoryEngineVersion}; this factory is version ${FACTORY_ENGINE_VERSION}, so the rebuilt contract may differ.` });
  }
  return drift;
}

/**
 * Rebuild an approved Build Contract and Manifest from a durable bundle.
 *
 * This goes through the same contract and manifest builders normal intake uses.
 * It reproduces approved intent; it never restores generated output, so the
 * caller still gets a fresh project with its own task, build, evidence and
 * checkpoint identity.
 */
export function replayApprovedIntakeBundle(bundle, { questions, questionnaireVersion, projectTypesConfig }) {
  const drift = detectIntakeBundleDrift(bundle, { questions, questionnaireVersion, projectTypesConfig });
  const blocking = drift.filter((entry) => entry.severity === 'blocking');
  if (blocking.length) throw new Error(`Approved intake cannot be replayed: ${blocking.map((entry) => entry.detail).join(' ')}`);

  const { projectType, mode } = bundle.questionnaire;
  const answers = structuredClone(bundle.intake.answers ?? {});
  const sourceReferences = (bundle.intake.sourceReferences ?? []).map(createSourceReference);
  const capabilityDecisions = structuredClone(bundle.intake.capabilityDecisions ?? {});
  const visible = questionsForMode(questions, mode, answers);
  const buildContract = approveBuildContract(buildBuildContract({ projectType, answers, questions: visible, projectTypesConfig, sourceReferences, capabilityDecisions }));
  const projectManifest = buildProjectManifest({ projectType, answers, projectTypesConfig, sourceReferences, capabilityDecisions });
  return {
    drift,
    buildContract,
    projectManifest,
    // What the operator is being asked to accept as reused, in the terms they
    // answered it in, rather than a hash they cannot read.
    reused: {
      bundleId: bundle.bundleId,
      approvedAt: bundle.createdAt,
      projectName: projectManifest.project.name,
      projectType,
      mode,
      questionnaireVersion: bundle.questionnaire.version,
      answeredQuestions: visible.filter((question) => isAnswered(question, answers[question.id])).length,
      totalQuestions: visible.length,
      acceptedDefaults: (bundle.intake.acceptedDefaults ?? []).map((entry) => entry.questionId),
      sourceReferences: sourceReferences.map((source) => ({ id: source.id, label: source.label, kind: source.kind, uri: source.uri ?? null, rightsStatus: source.rightsStatus ?? 'unknown' })),
      capabilityDecisions,
      approvedBuildContractHash: bundle.buildContractHash,
      approvedProjectManifestHash: bundle.projectManifestHash,
    },
  };
}

export function serializeIntakeBundle({ session, buildContract, projectManifest }) {
  return JSON.stringify({
    bundleVersion: 2,
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
  return [...modules].sort();
}

export function assessRequestedCapabilities(projectType, answers, projectTypesConfig, capabilityDecisions = {}) {
  const registry = projectTypesConfig.moduleRegistry?.modules ?? {};
  const requestedModules = deriveEnabledModules(projectType, answers, projectTypesConfig);
  const capabilities = requestedModules.map((module) => {
    const registryEntry = registry[module];
    const availability = registryEntry?.status ?? 'unknown';
    if (availability === 'ready') return { module, availability, decision: 'include' };
    const decision = capabilityDecisions[module] === 'exclude' || capabilityDecisions[module] === 'custom-work'
      ? capabilityDecisions[module]
      : 'unresolved';
    return { module, availability, decision };
  });
  return {
    requestedModules,
    capabilities,
    readyModules: capabilities.filter((item) => item.availability === 'ready').map((item) => item.module),
    customWorkModules: capabilities.filter((item) => item.decision === 'custom-work').map((item) => item.module),
    excludedModules: capabilities.filter((item) => item.decision === 'exclude').map((item) => item.module),
    unresolvedModules: capabilities.filter((item) => item.decision === 'unresolved').map((item) => item.module)
  };
}

function mapBudget(costPriority, aiCostPriority) {
  if (aiCostPriority === 'lowest-cost' || costPriority === 'lowest-sensible-cost') return { mode: 'economy', maxBuildCostGbp: 5 };
  if (aiCostPriority === 'highest-quality' || costPriority === 'performance-first') return { mode: 'quality', maxBuildCostGbp: 25 };
  return { mode: 'balanced', maxBuildCostGbp: 12 };
}

function defaultInfrastructure(projectType) {
  return { backend: ['marketing-site', 'content-site'].includes(projectType) ? 'none' : 'supabase', deployment: 'netlify' };
}

function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function asRecord(value) {
  return typeof value === 'object' && value && !Array.isArray(value) ? { ...value } : {};
}

export function deriveMajorSurfaces(projectType, answers = {}) {
  const explicit = asList(answers.major_surfaces ?? answers.major_pages);
  const defaults = SURFACE_DEFAULTS[projectType] ?? ['Home'];
  const surfaces = explicit.length ? [...explicit] : [...defaults];
  if (projectType === 'marketing-site' && asList(answers.locations).length > 0 && !surfaces.includes('Locations')) surfaces.push('Locations');
  if (answers.moderation === true && !surfaces.includes('Administration')) surfaces.push('Administration');
  return [...new Set(surfaces)];
}

function buildRequirementContext(answers, capabilityPlan) {
  return {
    audience: {
      summary: asString(answers.target_users),
      roles: asList(answers.roles)
    },
    journeys: asList(answers.must_have),
    majorSurfaces: deriveMajorSurfaces(asString(answers.project_type), answers),
    entities: asList(answers.core_entities),
    company: {
      identity: asRecord(answers.company_identity),
      services: asList(answers.services),
      locations: asList(answers.locations),
      contactDetails: asRecord(answers.contact_details),
      trustSignals: asList(answers.trust),
      conversionGoals: asList(answers.conversion)
    },
    constraints: {
      hard: asList(answers.hard_constraints),
      expectedScale: asString(answers.expected_scale),
      sensitivity: asString(answers.sensitivity),
      tenantModel: asString(answers.tenant_model),
      integrations: asList(answers.integrations),
      existingData: asList(answers.existing_data),
      uploadTypes: asList(answers.upload_types),
      customCapabilities: capabilityPlan.customWorkModules,
      excludedCapabilities: capabilityPlan.excludedModules,
      unresolvedCapabilities: capabilityPlan.unresolvedModules
    }
  };
}

export function buildProjectManifest({ projectType, answers, projectTypesConfig, sourceReferences = [], capabilityDecisions = {} }) {
  const name = String(answers.project_name ?? answers.company_identity?.name ?? 'New Project').trim();
  const capabilityPlan = assessRequestedCapabilities(projectType, answers, projectTypesConfig, capabilityDecisions);
  const knownModules = new Set(Object.keys(projectTypesConfig.moduleRegistry?.modules ?? {}));
  const modules = {};
  for (const moduleName of knownModules) modules[moduleName] = capabilityPlan.readyModules.includes(moduleName);
  for (const moduleName of capabilityPlan.readyModules) if (!(moduleName in modules)) modules[moduleName] = true;
  const context = buildRequirementContext({ ...answers, project_type: projectType }, capabilityPlan);
  return {
    schemaVersion: 2,
    project: { name, slug: slugify(name), type: projectType, primaryGoal: asString(answers.primary_goal) },
    audience: context.audience,
    journeys: context.journeys,
    majorSurfaces: context.majorSurfaces,
    entities: context.entities,
    company: context.company,
    constraints: context.constraints,
    modules,
    infrastructure: defaultInfrastructure(projectType),
    aiBudget: mapBudget(answers.cost_priority, answers.ai_cost_priority),
    brand: { designControl: answers.design_control ?? 'sensible-defaults' },
    inputs: {
      inventory: asList(answers.existing_inputs),
      existingWebsite: asString(answers.existing_site) || undefined,
      sources: sourceReferences.map(createSourceReference)
    },
    outOfScope: asList(answers.out_of_scope)
  };
}

export function buildBuildContract({ projectType, answers, questions, projectTypesConfig, sourceReferences = [], capabilityDecisions = {} }) {
  const visible = questions.filter((question) => isQuestionVisible(question, answers));
  const unresolved = getUnresolvedHighImpactQuestions(visible, answers);
  const capabilityPlan = assessRequestedCapabilities(projectType, answers, projectTypesConfig, capabilityDecisions);
  const mustHave = asList(answers.must_have);
  const followUp = buildAmbiguityFollowUpRequest({ questions: visible, answers });
  const infrastructure = defaultInfrastructure(projectType);
  const budget = mapBudget(answers.cost_priority, answers.ai_cost_priority);
  const context = buildRequirementContext({ ...answers, project_type: projectType }, capabilityPlan);
  const hasBlockers = unresolved.length > 0 || capabilityPlan.unresolvedModules.length > 0;
  return {
    version: 2,
    status: hasBlockers ? 'draft' : 'ready-for-review',
    project: {
      name: String(answers.project_name ?? answers.company_identity?.name ?? 'New Project').trim(),
      type: projectType,
      primaryGoal: asString(answers.primary_goal),
      targetUsers: context.audience.summary
    },
    audience: context.audience,
    entities: context.entities,
    company: context.company,
    constraints: context.constraints,
    coreJourneys: mustHave,
    majorSurfaces: context.majorSurfaces,
    requestedModules: capabilityPlan.requestedModules,
    enabledModules: capabilityPlan.readyModules,
    customWorkModules: capabilityPlan.customWorkModules,
    excludedModules: capabilityPlan.excludedModules,
    capabilityPlan: capabilityPlan.capabilities,
    infrastructure,
    brandDesignDirection: answers.design_control ?? 'sensible-defaults',
    designDirection: answers.design_control ?? 'sensible-defaults',
    sourceInputs: sourceReferences.map(createSourceReference),
    explicitlyExcluded: asList(answers.out_of_scope),
    acceptanceCriteria: mustHave.map((item) => `V1 supports: ${item}`),
    unresolvedHighImpactQuestions: unresolved,
    unresolvedCapabilityDecisions: capabilityPlan.unresolvedModules,
    ambiguityFollowUp: followUp,
    estimatedAiCostMode: budget
  };
}

export function approveBuildContract(contract) {
  if ((contract.unresolvedHighImpactQuestions ?? []).length > 0) throw new Error('Build Contract cannot be approved while high-impact questions remain unresolved.');
  if ((contract.unresolvedCapabilityDecisions ?? []).length > 0) throw new Error(`Build Contract cannot be approved until unavailable capabilities are resolved: ${contract.unresolvedCapabilityDecisions.join(', ')}.`);
  return { ...contract, status: 'approved', approvedAt: new Date().toISOString() };
}
