#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { generateProject, readJson } from './lib/generator.mjs';

const cases = [
  ['examples/generator-project-manifest.json', '.tmp/generated-acceptance-marketing'],
  ['examples/b2b-generator-project-manifest.json', '.tmp/generated-acceptance-b2b'],
];

for (const [manifestPath, outputPath] of cases) {
  const output = path.resolve(outputPath);
  fs.rmSync(output, { recursive: true, force: true });
  generateProject(readJson(path.resolve(manifestPath)), output);
  console.log(`${manifestPath} -> ${output}`);
}
