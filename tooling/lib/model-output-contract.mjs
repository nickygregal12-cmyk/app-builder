import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const APPROVED_CONTRACTS = Object.freeze({
  'schemas/review-verdict.schema.json': Object.freeze({
    name: 'app_builder_review_verdict',
    path: 'schemas/review-verdict.schema.json',
  }),
});

// This is deliberately an exact tuple allowlist rather than "all OpenAI-
// compatible providers". The wire format existing does not prove the selected
// provider/model supports strict JSON Schema. Add another tuple only after its
// current provider documentation and deterministic adapter tests prove it.
const STRICT_OUTPUT_PROFILES = Object.freeze(new Set([
  'groq|openai-compatible|openai/gpt-oss-120b',
]));

const PASSTHROUGH_KEYS = Object.freeze([
  'type',
  'enum',
  'description',
  'minimum',
  'maximum',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonType(value) {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function supportsStructuredOutputProfile({ providerId, adapterId, modelId } = {}) {
  return STRICT_OUTPUT_PROFILES.has(`${providerId ?? ''}|${adapterId ?? ''}|${modelId ?? ''}`);
}

/**
 * Project the canonical App Builder schema into the deliberately smaller JSON
 * Schema subset accepted by strict OpenAI-compatible structured-output lanes.
 *
 * This projection may be less expressive than the canonical schema, never more
 * authoritative. The canonical schema is still validated locally after the
 * provider returns. Provider constraints make malformed shape harder to emit;
 * local validation remains the source of truth for refinements such as
 * minLength, minItems and uniqueItems.
 */
export function toStrictProviderSchema(node) {
  if (Array.isArray(node)) return node.map((entry) => toStrictProviderSchema(entry));
  if (!node || typeof node !== 'object') return node;

  const projected = {};
  for (const key of PASSTHROUGH_KEYS) {
    if (node[key] !== undefined) projected[key] = clone(node[key]);
  }
  if (node.const !== undefined) {
    projected.enum = [clone(node.const)];
    if (projected.type === undefined) projected.type = jsonType(node.const);
  }
  if (Array.isArray(node.anyOf)) projected.anyOf = node.anyOf.map((entry) => toStrictProviderSchema(entry));
  if (node.items !== undefined) projected.items = toStrictProviderSchema(node.items);

  if (node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)) {
    projected.type = node.type ?? 'object';
    projected.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [key, toStrictProviderSchema(value)]),
    );
    // Groq strict mode requires every declared property to be required and
    // every object to be closed. Optional canonical fields remain nullable only
    // where the canonical schema already allows null; otherwise the model must
    // supply a canonical value and local AJV checks it again after return.
    projected.required = Object.keys(projected.properties);
    projected.additionalProperties = false;
  } else if (node.type === 'object') {
    projected.type = 'object';
    projected.additionalProperties = false;
  }

  return projected;
}

function bindTrustedScalar(schema, key, value) {
  if (value === undefined || value === null) return;
  const property = schema.properties?.[key];
  if (!property) throw new Error(`Trusted output binding ${key} is not declared by the approved contract.`);
  const kind = typeof value;
  if (!['string', 'number', 'boolean'].includes(kind)) {
    throw new Error(`Trusted output binding ${key} must be a scalar.`);
  }
  property.enum = [value];
}

/**
 * Resolve an artifact-contract identity on the trusted side.
 *
 * `artifactContract` is allowed to come from an untrusted sandbox because it is
 * treated only as an exact key into this closed map. It is never joined to the
 * filesystem. Adding another contract therefore requires a reviewed code
 * change rather than letting a task name an arbitrary path.
 */
export function resolveModelOutputContract(
  artifactContract,
  { root = REPOSITORY_ROOT, trustedBindings = {} } = {},
) {
  const identity = String(artifactContract ?? '').trim();
  const approved = APPROVED_CONTRACTS[identity];
  if (!approved) {
    throw new Error(`Model output contract ${identity || '(missing)'} is not approved for provider-side structured output.`);
  }

  const canonicalPath = path.join(root, approved.path);
  const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
  const schema = toStrictProviderSchema(canonical);

  for (const [key, value] of Object.entries(trustedBindings)) {
    bindTrustedScalar(schema, key, value);
  }

  return Object.freeze({
    name: approved.name,
    strict: true,
    artifactContract: identity,
    canonicalPath: approved.path,
    schema,
  });
}

export function approvedModelOutputContracts() {
  return Object.freeze(Object.keys(APPROVED_CONTRACTS));
}
