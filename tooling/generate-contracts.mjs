#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { compileFromFile } from 'json-schema-to-typescript';
import { GENERATED_DIRECTORY, REGISTRY_PATH, SCHEMA_DIRECTORY, canonicalSchemaHash, generatedFileName, readContractRegistry, undeclaredSchemas } from './lib/contract-families.mjs';

const root = process.cwd();
const check = process.argv.includes('--check');
const registry = readContractRegistry();

const coverage = undeclaredSchemas(registry);
if (coverage.undeclared.length || coverage.missing.length) {
  if (coverage.undeclared.length) console.error(`Schemas missing from config/contract-families.json: ${coverage.undeclared.join(', ')}`);
  if (coverage.missing.length) console.error(`Declared contract schemas that no longer exist: ${coverage.missing.join(', ')}`);
  process.exit(1);
}

function banner(family) {
  return [
    '/* eslint-disable */',
    '/**',
    ' * GENERATED FILE — DO NOT EDIT.',
    ` * Source: schemas/${family.schema}`,
    ' * Regenerate with: npm run contracts:generate',
    ' */',
  ].join('\n');
}

const generatedDirectory = GENERATED_DIRECTORY.pathname;
await fs.mkdir(generatedDirectory, { recursive: true });

const results = [];
for (const family of registry.families) {
  const schemaPath = path.join(SCHEMA_DIRECTORY.pathname, family.schema);
  const declarations = await compileFromFile(schemaPath, { bannerComment: banner(family) });
  if (!new RegExp(`\\b(?:interface|type) ${family.typeName}\\b`).test(declarations)) {
    console.error(`Contract family ${family.id} does not declare the expected root type ${family.typeName}.`);
    process.exit(1);
  }
  const outputPath = path.join(generatedDirectory, generatedFileName(family));
  await fs.writeFile(outputPath, declarations, 'utf8');
  results.push({
    family,
    typesHash: createHash('sha256').update(declarations).digest('hex'),
    schemaHash: canonicalSchemaHash(family.schema),
  });
}

// The barrel deliberately re-exports only each family's root type. Shared
// definitions such as source references are inlined into several families, so
// a wildcard re-export would collide.
const barrel = [
  '/* eslint-disable */',
  '/**',
  ' * GENERATED FILE — DO NOT EDIT.',
  ' * Source: config/contract-families.json',
  ' * Regenerate with: npm run contracts:generate',
  ' */',
  '',
  ...registry.families.map((family) => `export type { ${family.typeName} } from './${family.id}';`),
  '',
].join('\n');
await fs.writeFile(path.join(generatedDirectory, 'index.d.ts'), barrel, 'utf8');

function short(value) {
  return value ? `${value.slice(0, 12)}…` : 'no hash';
}

// Both hashes matter. The schema hash catches validation changes that do not
// alter the emitted TypeScript; the types hash catches generator changes that
// alter consumers without any schema edit.
const drifted = results.filter(({ family, typesHash, schemaHash }) => family.typesHash !== typesHash || family.schemaHash !== schemaHash);
if (check) {
  if (!drifted.length) {
    console.log(`Contract drift check passed for ${results.length} generated contract families.`);
    process.exit(0);
  }
  for (const result of drifted) {
    const { family } = result;
    if (family.schemaHash !== result.schemaHash) console.error(`Contract drift: schemas/${family.schema} hashes ${short(result.schemaHash)} but config/contract-families.json records ${short(family.schemaHash)}.`);
    if (family.typesHash !== result.typesHash) console.error(`Contract drift: ${family.id} generates types ${short(result.typesHash)} but config/contract-families.json records ${short(family.typesHash)}.`);
  }
  console.error('Run `npm run contracts:generate` and review the recorded hashes.');
  process.exit(1);
}

if (drifted.length) {
  const next = {
    ...registry,
    families: registry.families.map((family) => {
      const result = results.find((entry) => entry.family.id === family.id);
      return result ? { ...family, schemaHash: result.schemaHash, typesHash: result.typesHash } : family;
    }),
  };
  await fs.writeFile(REGISTRY_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

console.log(`Generated ${results.length} schema-derived contract families into ${path.relative(root, generatedDirectory)}${drifted.length ? ` (updated ${drifted.length} recorded hash(es))` : ''}.`);
