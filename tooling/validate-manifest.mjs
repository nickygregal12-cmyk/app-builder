#!/usr/bin/env node
import process from 'node:process';
import { readJson, validateManifest } from './lib/manifest.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tooling/validate-manifest.mjs <manifest.json>');
  process.exit(2);
}

try {
  const errors = validateManifest(readJson(file));
  if (errors.length) {
    console.error(`Invalid manifest: ${file}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Valid manifest: ${file}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
