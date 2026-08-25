import fs from 'node:fs';
import { validateContract } from '@app-builder/contracts';

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

// The Project Manifest family is validated by the shared schema-derived
// contract surface. Buildability — whether a requested module or adapter has a
// ready recipe — remains separate and stays with the registries.
export function validateManifest(manifest) {
  return validateContract('project-manifest', manifest);
}
