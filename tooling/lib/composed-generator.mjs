import fs from 'node:fs';
import path from 'node:path';
import { composeProject } from '../../packages/composition/src/index.js';
import { generateProject } from './generator.mjs';

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function renderComposition(composition) {
  return `export const composition = ${JSON.stringify(composition, null, 2)} as const;\n`;
}

export function generateComposedProject(manifest, outputDir, { knowledgePack = null, factoryRoot = process.cwd(), catalog } = {}) {
  const plan = generateProject(manifest, outputDir, { factoryRoot, ...(catalog ? { catalog } : {}) });
  const composition = composeProject({ manifest, knowledgePack });
  const out = path.resolve(outputDir);
  writeJson(path.join(out, '.app-builder/composition.json'), composition);
  fs.mkdirSync(path.join(out, 'src/generated'), { recursive: true });
  fs.writeFileSync(path.join(out, 'src/generated/composition.ts'), renderComposition(composition));
  return { plan, composition };
}
