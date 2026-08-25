export type IntakeMode = 'quick' | 'standard' | 'thorough';
export type AnswerValue = string | boolean | string[] | Record<string, string> | undefined;
export type Answers = Record<string, AnswerValue>;
export interface WhenCondition { questionId: string; equals?: AnswerValue; notEquals?: AnswerValue; in?: AnswerValue[]; includes?: string[]; truthy?: boolean; }
export interface Question { id: string; label: string; type: string; required?: boolean; default?: AnswerValue; options?: string[]; depth?: IntakeMode; impact?: 'blocking' | 'high' | 'normal' | 'optional'; placeholder?: string; when?: WhenCondition | WhenCondition[]; followUpIfMissing?: boolean; }
export interface QuestionnaireDefinition { version: string; id: string; questions: Question[]; }
export interface ModuleRegistryEntry { description?: string; status?: 'draft' | 'ready' | 'planned' | 'deprecated' | string; defaultEnabled?: boolean; }
export interface ProjectTypesConfig { projectTypes: Record<string, { label?: string; defaultModules: string[]; questionnaire?: string }>; moduleRegistry?: { modules: Record<string, ModuleRegistryEntry> }; }
export type SourceKind = 'url' | 'logo' | 'image' | 'screenshot' | 'document' | 'spreadsheet' | 'database-api' | 'other';
export interface SourceReference { id: string; kind: SourceKind; label: string; uri?: string; name?: string; mimeType?: string; size?: number; provenance: 'user-supplied' | 'existing-site' | 'external-research' | 'generated'; purpose?: string; recordedAt: string; }
export type FeedbackType = 'missing-requirement' | 'corrected-answer' | 'unnecessary-question' | 'accepted-default' | 'architecture-rework';
export interface FeedbackEvent { id: string; type: FeedbackType; questionId?: string; detail?: string; previousValue?: AnswerValue; nextValue?: AnswerValue; createdAt: string; }
export interface FollowUpCandidate { id: string; questionId: string; question: string; reason: string; impact: string; }
export interface AmbiguityFollowUpRequest { version: number; required: boolean; maxQuestions: number; aiAllowed: boolean; budget: { maxTokens: number; modelClass: 'economy' }; candidates: FollowUpCandidate[]; }
export type CapabilityDecision = 'exclude' | 'custom-work';
export type CapabilityDecisions = Record<string, CapabilityDecision>;
export interface CapabilityAssessment { module: string; availability: string; decision: 'include' | 'exclude' | 'custom-work' | 'unresolved'; }
export interface CapabilityPlan { requestedModules: string[]; capabilities: CapabilityAssessment[]; readyModules: string[]; customWorkModules: string[]; excludedModules: string[]; unresolvedModules: string[]; }
export interface RequirementAudience { summary: string; roles: string[]; }
export interface CompanyRequirements { identity: Record<string, string>; services: string[]; locations: string[]; contactDetails: Record<string, string>; trustSignals: string[]; conversionGoals: string[]; }
export interface ProjectConstraints { hard: string[]; expectedScale: string; sensitivity: string; tenantModel: string; integrations: string[]; existingData: string[]; uploadTypes: string[]; customCapabilities: string[]; excludedCapabilities: string[]; unresolvedCapabilities: string[]; }
export interface BuildContract {
  version: 2;
  status: 'draft' | 'ready-for-review' | 'approved';
  project: { name: string; type: string; primaryGoal: string; targetUsers: string };
  audience: RequirementAudience;
  entities: string[];
  company: CompanyRequirements;
  constraints: ProjectConstraints;
  coreJourneys: string[];
  majorSurfaces: string[];
  requestedModules: string[];
  enabledModules: string[];
  customWorkModules: string[];
  excludedModules: string[];
  capabilityPlan: CapabilityAssessment[];
  infrastructure: { backend: string; deployment: string };
  brandDesignDirection: string;
  designDirection: string;
  sourceInputs: SourceReference[];
  explicitlyExcluded: string[];
  acceptanceCriteria: string[];
  unresolvedHighImpactQuestions: string[];
  unresolvedCapabilityDecisions: string[];
  ambiguityFollowUp: AmbiguityFollowUpRequest;
  estimatedAiCostMode: { mode: string; maxBuildCostGbp: number };
  approvedAt?: string;
}
export interface ProjectManifestV1 { schemaVersion: 1; project: { name: string; slug: string; type: string; primaryGoal: string }; modules: Record<string, boolean>; infrastructure: { backend: string; deployment: string }; aiBudget: { mode: string; maxBuildCostGbp: number }; brand: Record<string, unknown>; inputs: { inventory: string[]; existingWebsite?: string; sources: SourceReference[] }; outOfScope: string[]; }
export interface ProjectManifestV2 { schemaVersion: 2; project: { name: string; slug: string; type: string; primaryGoal: string }; audience: RequirementAudience; journeys: string[]; majorSurfaces: string[]; entities: string[]; company: CompanyRequirements; constraints: ProjectConstraints; modules: Record<string, boolean>; infrastructure: { backend: string; deployment: string }; aiBudget: { mode: string; maxBuildCostGbp: number }; brand: Record<string, unknown>; inputs: { inventory: string[]; existingWebsite?: string; sources: SourceReference[] }; outOfScope: string[]; }
export type ProjectManifest = ProjectManifestV1 | ProjectManifestV2;
export const FACTORY_ENGINE_VERSION: number;
export function slugify(value: unknown): string;
export function mergeQuestionnaires(base: QuestionnaireDefinition, specific: QuestionnaireDefinition): Question[];
export function isQuestionVisible(question: Question, answers?: Answers): boolean;
export function questionsForMode(questions: Question[], mode: IntakeMode, answers?: Answers): Question[];
export function applyQuestionDefaults(questions: Question[], answers?: Answers): Answers;
export function isAnswered(question: Question, value: AnswerValue): boolean;
export function getUnresolvedHighImpactQuestions(questions: Question[], answers: Answers): string[];
export function createSourceReference(input?: Partial<SourceReference> & { kind?: SourceKind; label?: string; name?: string; uri?: string; size?: number }): SourceReference;
export function createFeedbackEvent(type: FeedbackType, detail?: Partial<FeedbackEvent>): FeedbackEvent;
export function collectAcceptedDefaultEvidence(questions: Question[], answers: Answers, existingEvents?: FeedbackEvent[]): FeedbackEvent[];
export function buildAmbiguityFollowUpRequest(input: { questions: Question[]; answers: Answers; maxQuestions?: number; maxTokens?: number }): AmbiguityFollowUpRequest;
export function createIntakeSession(input: { projectType: string; mode?: IntakeMode; questionnaireVersion?: string; questions: Question[]; seedAnswers?: Answers; sourceReferences?: SourceReference[]; feedback?: FeedbackEvent[] }): Record<string, unknown>;
export function serializeIntakeBundle(input: { session: unknown; buildContract: unknown; projectManifest: unknown }): string;
export function deriveEnabledModules(projectType: string, answers: Answers, projectTypesConfig: ProjectTypesConfig): string[];
export function assessRequestedCapabilities(projectType: string, answers: Answers, projectTypesConfig: ProjectTypesConfig, capabilityDecisions?: CapabilityDecisions): CapabilityPlan;
export function deriveMajorSurfaces(projectType: string, answers?: Answers): string[];
export function buildProjectManifest(input: { projectType: string; answers: Answers; projectTypesConfig: ProjectTypesConfig; sourceReferences?: SourceReference[]; capabilityDecisions?: CapabilityDecisions }): ProjectManifestV2;
export function buildBuildContract(input: { projectType: string; answers: Answers; questions: Question[]; projectTypesConfig: ProjectTypesConfig; sourceReferences?: SourceReference[]; capabilityDecisions?: CapabilityDecisions }): BuildContract;
export function approveBuildContract(contract: BuildContract): BuildContract;
