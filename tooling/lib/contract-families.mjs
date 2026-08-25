import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
export const REGISTRY_PATH = new URL('config/contract-families.json', root);
export const SCHEMA_DIRECTORY = new URL('schemas/', root);
export const GENERATED_DIRECTORY = new URL('packages/contracts/generated/', root);

export function readContractRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

// Every schema must be either a generated contract family or an explicitly
// deferred one. Adding a schema therefore forces a migration decision instead
// of silently growing a second handwritten contract surface.
export function undeclaredSchemas(registry) {
  const declared = new Set([
    ...registry.families.map((family) => family.schema),
    ...registry.pending.map((entry) => entry.schema),
  ]);
  const present = fs.readdirSync(SCHEMA_DIRECTORY).filter((name) => name.endsWith('.schema.json'));
  return {
    undeclared: present.filter((name) => !declared.has(name)).sort(),
    missing: [...declared].filter((name) => !present.includes(name)).sort(),
  };
}

export function generatedFileName(family) {
  return `${family.id}.d.ts`;
}

export function generatedPath(family) {
  return path.join(GENERATED_DIRECTORY.pathname, generatedFileName(family));
}

// Hashing canonical JSON rather than raw bytes keeps reformatting from being
// reported as a contract change while still catching every semantic edit.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalSchemaHash(schemaFile) {
  const schema = JSON.parse(fs.readFileSync(new URL(schemaFile, SCHEMA_DIRECTORY), 'utf8'));
  return createHash('sha256').update(JSON.stringify(canonical(schema))).digest('hex');
}
