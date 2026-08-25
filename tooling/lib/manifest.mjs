import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const manifestSchema = JSON.parse(fs.readFileSync(new URL('../../schemas/project-manifest.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateProjectManifest = ajv.compile(manifestSchema);

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function instancePath(error) {
  return String(error.instancePath ?? '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.');
}

function formatValidationError(error) {
  const location = instancePath(error);
  if (error.keyword === 'required') {
    const missing = String(error.params?.missingProperty ?? 'field');
    return `${location ? `${location}.` : ''}${missing} is required`;
  }
  if (error.keyword === 'pattern' && location === 'project.slug') return 'project.slug must be kebab-case';
  if (error.keyword === 'pattern') return `${location || 'value'} must contain non-whitespace text`;
  if (error.keyword === 'enum') return `${location || 'value'} is unsupported`;
  if (error.keyword === 'type') return `${location || 'value'} must be ${String(error.params?.type ?? 'the expected type')}`;
  if (error.keyword === 'minimum') return `${location || 'value'} must be >= ${String(error.params?.limit)}`;
  if (error.keyword === 'minItems') return `${location || 'value'} must contain at least ${String(error.params?.limit)} item(s)`;
  if (error.keyword === 'additionalProperties') {
    const property = String(error.params?.additionalProperty ?? 'property');
    return `${location ? `${location}.` : ''}${property} is not allowed`;
  }
  return `${location || 'manifest'} ${error.message ?? 'is invalid'}`;
}

export function validateManifest(manifest) {
  if (validateProjectManifest(manifest)) return [];
  return [...new Set((validateProjectManifest.errors ?? []).map(formatValidationError))];
}
