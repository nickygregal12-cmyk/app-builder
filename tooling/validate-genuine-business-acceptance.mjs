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

      // Launch readiness is reported, never enforced. The factory is still being built, so a real
      // run is expected to start from a build that still carries known findings. What matters is
      // that the number is recorded and that the prediction can be checked against reality.
      const launch = evidence.launchReadiness;
      if (launch) {
        console.log(
          `Launch readiness at handover: ${launch.predictedManualEdits} predicted edit(s), `
          + `${launch.blockersAtHandover} blocker(s), ${launch.evidenceGaps ?? 0} evidence gap(s)`,
        );
        const delta = evidence.manualEdits.total - launch.predictedManualEdits;
        if (delta === 0) {
          console.log('Prediction accuracy: the audit predicted the review exactly.');
        } else if (delta > 0) {
          console.log(`Prediction accuracy: the review found ${delta} more edit(s) than the audit predicted — those categories are where the audit is blind.`);
        } else {
          console.log(`Prediction accuracy: the audit over-predicted by ${-delta} edit(s) — those checks may be too eager.`);
        }
      } else {
        console.log('Launch readiness: not recorded for this run.');
      }
    }
  }
}
