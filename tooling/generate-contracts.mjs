#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compileFromFile } from 'json-schema-to-typescript';

const root = process.cwd();
const schemaPath = path.join(root, 'schemas/project-manifest.schema.json');
const outputDirectory = path.join(root, 'packages/contracts/generated');
const outputPath = path.join(outputDirectory, 'project-manifest.d.ts');

const generated = await compileFromFile(schemaPath, {
  bannerComment: [
    '/* eslint-disable */',
    '/**',
    ' * GENERATED FILE — DO NOT EDIT.',
    ' * Source: schemas/project-manifest.schema.json',
    ' * Regenerate with: npm run contracts:generate',
    ' */',
  ].join('\n'),
});

await fs.mkdir(outputDirectory, { recursive: true });
await fs.writeFile(outputPath, generated, 'utf8');
console.log(`Generated schema-derived contract: ${path.relative(root, outputPath)}`);
