#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const required = [
  'docs/CONTENT_INTELLIGENCE.md',
  'packages/content-intelligence/package.json',
  'packages/content-intelligence/src/index.js',
  'packages/content-intelligence/src/shared.js',
  'packages/content-intelligence/src/extractors.js',
  'packages/content-intelligence/src/normalize.js',
  'packages/content-intelligence/src/knowledge.js',
  'packages/content-intelligence/src/validation.js',
  'schemas/normalized-source.schema.json',
  'schemas/knowledge-pack.schema.json',
  'tooling/ingest.mjs',
  'tooling/content-intelligence.test.mjs',
  'tooling/phase3-complete.test.mjs',
];
let failed = false;
for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    console.error(`Missing Phase 3 file: ${relative}`);
    failed = true;
  }
}
for (const relative of ['schemas/normalized-source.schema.json', 'schemas/knowledge-pack.schema.json']) {
  try { JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); } catch { console.error(`Invalid Phase 3 JSON schema: ${relative}`); failed = true; }
}
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'packages/content-intelligence/package.json'), 'utf8'));
  const expected = { exceljs: '4.4.0', mammoth: '1.12.1', 'pdf-parse': '2.4.5', sharp: '0.35.3' };
  for (const [name, version] of Object.entries(expected)) {
    if (pkg.dependencies?.[name] !== version) { console.error(`Phase 3 dependency ${name} must be pinned to ${version}.`); failed = true; }
  }
  const unexpected = Object.keys(pkg.dependencies ?? {}).filter((name) => !(name in expected));
  if (unexpected.length) { console.error(`Unexpected Phase 3 dependencies: ${unexpected.join(', ')}`); failed = true; }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}
const generatedRoots = ['templates', 'recipes'];
for (const base of generatedRoots) {
  const directory = path.join(root, base);
  if (!fs.existsSync(directory)) continue;
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(?:json|js|mjs|ts|tsx|md)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('@app-builder/content-intelligence')) {
        console.error(`Generated-project boundary violation: ${path.relative(root, full)} depends on factory content intelligence.`);
        failed = true;
      }
    }
  }
}
if (failed) process.exit(1);
console.log('Phase 3 doctor: content intelligence contracts, exact extractor dependencies and generated-app boundary are valid.');
