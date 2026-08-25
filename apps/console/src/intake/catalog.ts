import baseQuestionnaire from '../../../../questionnaires/v1/base.json';
import businessSite from '../../../../questionnaires/v1/business-site.json';
import b2bSaas from '../../../../questionnaires/v1/b2b-saas.json';
import consumerApp from '../../../../questionnaires/v1/consumer-app.json';
import internalTool from '../../../../questionnaires/v1/internal-tool.json';
import contentSite from '../../../../questionnaires/v1/content-site.json';
import aiApp from '../../../../questionnaires/v1/ai-app.json';
import projectTypes from '../../../../config/project-types.json';
import moduleRegistry from '../../../../config/modules.json';
import type { ProjectTypesConfig, QuestionnaireDefinition } from '@app-builder/factory-core';

export type ProjectType = keyof typeof projectTypes.projectTypes;

const questionnaires: Record<string, QuestionnaireDefinition> = {
  'business-site': businessSite as QuestionnaireDefinition,
  'b2b-saas': b2bSaas as QuestionnaireDefinition,
  'consumer-app': consumerApp as QuestionnaireDefinition,
  'internal-tool': internalTool as QuestionnaireDefinition,
  'content-site': contentSite as QuestionnaireDefinition,
  'ai-app': aiApp as QuestionnaireDefinition,
};

export const base = baseQuestionnaire as QuestionnaireDefinition;
export const projectTypeConfig = { ...projectTypes, moduleRegistry } as ProjectTypesConfig;
export const projectTypeEntries = Object.entries(projectTypes.projectTypes) as [ProjectType, (typeof projectTypes.projectTypes)[ProjectType]][];

export function questionnaireFor(projectType: ProjectType) {
  const id = projectTypes.projectTypes[projectType].questionnaire;
  const questionnaire = questionnaires[id];
  if (!questionnaire) throw new Error(`Missing questionnaire: ${id}`);
  return questionnaire;
}
