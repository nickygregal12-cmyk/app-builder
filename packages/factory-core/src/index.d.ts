export type IntakeMode = 'quick' | 'standard' | 'thorough';
export type AnswerValue = string | boolean | string[] | Record<string, string> | undefined;
export type Answers = Record<string, AnswerValue>;
export interface Question { id: string; label: string; type: string; required?: boolean; default?: AnswerValue; options?: string[]; depth?: IntakeMode; impact?: 'blocking' | 'high' | 'normal' | 'optional'; placeholder?: string; }
export interface QuestionnaireDefinition { version: string; id: string; questions: Question[]; }
export interface ProjectTypesConfig { projectTypes: Record<string, { label: string; defaultModules: string[]; questionnaire: string }>; moduleRegistry?: { modules: Record<string, unknown> }; }
export const FACTORY_ENGINE_VERSION: number;
export function slugify(value: unknown): string;
export function mergeQuestionnaires(base: QuestionnaireDefinition, specific: QuestionnaireDefinition): Question[];
export function questionsForMode(questions: Question[], mode: IntakeMode): Question[];
export function applyQuestionDefaults(questions: Question[], answers?: Answers): Answers;
export function isAnswered(question: Question, value: AnswerValue): boolean;
export function getUnresolvedHighImpactQuestions(questions: Question[], answers: Answers): string[];
export function createIntakeSession(input: { projectType: string; mode?: IntakeMode; questionnaireVersion?: string; questions: Question[]; seedAnswers?: Answers }): Record<string, unknown>;
export function deriveEnabledModules(projectType: string, answers: Answers, projectTypesConfig: ProjectTypesConfig): string[];
export function buildProjectManifest(input: { projectType: string; answers: Answers; projectTypesConfig: ProjectTypesConfig }): Record<string, unknown>;
export function buildBuildContract(input: { projectType: string; answers: Answers; questions: Question[]; projectTypesConfig: ProjectTypesConfig }): Record<string, any>;
export function approveBuildContract(contract: Record<string, any>): Record<string, any>;
