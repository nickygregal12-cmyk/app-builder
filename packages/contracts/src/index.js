import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

// `/schemas` is the runtime validation authority for every declared contract
// family. Consumers validate here rather than re-implementing enums and
// required-field rules, so a schema change cannot leave a second handwritten
// validator behind.

const registryUrl = new URL('../../../config/contract-families.json', import.meta.url);
const schemaDirectory = new URL('../../../schemas/', import.meta.url);

const registry = JSON.parse(fs.readFileSync(registryUrl, 'utf8'));

function readSchema(name) {
  return JSON.parse(fs.readFileSync(new URL(name, schemaDirectory), 'utf8'));
}

// strictRequired is disabled because several contracts intentionally require a
// property without pinning its shape yet. That is a schema-authoring warning
// rather than an instance-validation rule, so it does not weaken validation.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });

export const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

// Sibling schemas are referenced by bare filename, so every 2020-12 schema in
// the directory is registered under that identifier before any family
// compiles. Schemas on an older dialect are declared as pending families and
// keep their own validator until they are migrated.
for (const name of fs.readdirSync(schemaDirectory).filter((entry) => entry.endsWith('.schema.json'))) {
  const schema = readSchema(name);
  if (schema.$schema !== SCHEMA_DIALECT) continue;
  ajv.addSchema(schema, name);
}

export const CONTRACT_FAMILIES = Object.freeze(registry.families.map((family) => Object.freeze({
  id: family.id,
  schema: family.schema,
  typeName: family.typeName,
  boundary: family.boundary,
})));

function requireFamily(familyId) {
  const family = CONTRACT_FAMILIES.find((entry) => entry.id === familyId);
  if (!family) throw new Error(`Unknown contract family: ${familyId}`);
  return family;
}

const validators = new Map(CONTRACT_FAMILIES.map((family) => [family.id, ajv.getSchema(family.schema)]));

export function contractSchema(familyId) {
  return readSchema(requireFamily(familyId).schema);
}

function instancePath(error) {
  return String(error.instancePath ?? '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.');
}

export function formatContractError(error, subject = 'value') {
  const location = instancePath(error);
  if (error.keyword === 'required') {
    const missing = String(error.params?.missingProperty ?? 'field');
    return `${location ? `${location}.` : ''}${missing} is required`;
  }
  if (error.keyword === 'pattern' && location.endsWith('slug')) return `${location} must be kebab-case`;
  // `digest` as well as `hash`: the identity work named its fields
  // `sourceDigest`, `lockDigest` and `outputDigest`, and without this a
  // truncated digest was reported as "must contain non-whitespace text" — which
  // is not merely unhelpful but false, since the value it rejected was text.
  if (error.keyword === 'pattern' && /hash|digest/i.test(location)) return `${location} must be a SHA-256 hex digest`;
  if (error.keyword === 'pattern') return `${location || 'value'} must contain non-whitespace text`;
  if (error.keyword === 'enum' || error.keyword === 'const') return `${location || 'value'} is unsupported`;
  if (error.keyword === 'type') return `${location || 'value'} must be ${String(error.params?.type ?? 'the expected type')}`;
  if (error.keyword === 'minimum') return `${location || 'value'} must be >= ${String(error.params?.limit)}`;
  if (error.keyword === 'maximum') return `${location || 'value'} must be <= ${String(error.params?.limit)}`;
  if (error.keyword === 'minItems') return `${location || 'value'} must contain at least ${String(error.params?.limit)} item(s)`;
  if (error.keyword === 'minLength') return `${location || 'value'} must not be empty`;
  if (error.keyword === 'additionalProperties') {
    const property = String(error.params?.additionalProperty ?? 'property');
    return `${location ? `${location}.` : ''}${property} is not allowed`;
  }
  return `${location || subject} ${error.message ?? 'is invalid'}`;
}

/**
 * Structural validation only. Buildability, referential integrity and policy
 * decisions remain the caller's responsibility.
 */
export function validateContract(familyId, value) {
  const validator = validators.get(familyId);
  if (!validator) throw new Error(`Unknown contract family: ${familyId}`);
  if (validator(value)) return [];
  return [...new Set((validator.errors ?? []).map((error) => formatContractError(error, familyId)))];
}

export function assertContract(familyId, value) {
  const errors = validateContract(familyId, value);
  if (errors.length) throw new Error(`Invalid ${familyId}: ${errors.join('; ')}`);
  return value;
}
