#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateGenuineBusinessEvidence } from './lib/genuine-business-evidence.mjs';

const evidenceFile = process.argv[2];
if (!evidenceFile) {
  console.error('Usage: node tooling/validate-genuine-business-acceptance.mjs <evidence.json>');
  process.exitCode = 2;
} else {
  const resolved = path.resolve(evidenceFile);
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    console.error(`Could not read genuine-business evidence: ${error.message}`);
    process.exitCode = 1;
  }

  if (evidence) {
    const errors = validateGenuineBusinessEvidence(evidence, { evidenceFile: resolved });
    if (errors.length) {
      console.error('Genuine business acceptance failed:');
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
    } else {
      console.log(`Genuine business acceptance passed: ${evidence.business.name}`);
      console.log(`Meaningful manual edits: ${evidence.manualEdits.total}/${evidence.manualEdits.targetMaximum - 1} allowed`);
    }
  }
}
