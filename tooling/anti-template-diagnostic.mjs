#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { assessCrossBuildDiversity, crossBuildSignature, describeCrossBuildDiversity } from './lib/cross-build-diversity.mjs';

/**
 * Read builds the factory has already produced and say whether unrelated
 * businesses are coming out the same shape.
 *
 * Everything it needs is in an ordinary generated repository — the composition,
 * the compiled design and the promoted direction — so this never regenerates
 * anything and never needs factory state. Point it at directories:
 *
 *   node tooling/anti-template-diagnostic.mjs .tmp/generated-acceptance-*
 *
 * With no arguments it reads whatever generated builds are lying around from
 * the acceptance runs, and says plainly what that set is and is not.
 */

const ROOT = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadBuild(dir) {
  const stateDir = path.join(dir, '.app-builder');
  const compositionPath = path.join(stateDir, 'composition.json');
  const projectPath = path.join(stateDir, 'project.json');
  if (!fs.existsSync(compositionPath) || !fs.existsSync(projectPath)) return null;
  const project = readJson(projectPath);
  const design = project.composedDesign ?? project.design ?? null;
  return crossBuildSignature({
    build: path.basename(dir),
    composition: readJson(compositionPath),
    design,
    // A promoted direction lives on the design record. A build with none signs
    // from the composition alone, which is the honest reading of a project that
    // never ran a candidate set.
    //
    // The field is `visualDirectionId`, and this read `visualDirection` — which
    // no record has ever carried. So `direction` was null for every build ever
    // measured, `structuralSignature` fell back to the default dimensions, and
    // the diagnostic reported "solid / panel / stacked / utility / neutral"
    // uniformly over sets whose candidates demonstrably render an underlined
    // ask, an editorial masthead and a serif voice. It then explained the
    // reading it had produced — "no build in this set carries a promoted
    // visual direction" — which was true of its own parse and not of the
    // builds. An instrument whose null case looks exactly like the finding it
    // exists to detect will report that finding forever.
    //
    // `structuralSignature` wants `.artDirection.dimensions`, which the design
    // record already has; only the identity has to be renamed onto the shape
    // it expects. Adapting here rather than in the signature keeps the shared
    // definition of "structurally different" identical for the candidate-set
    // gate that also uses it.
    direction: design?.visualDirectionId
      ? { id: design.visualDirectionId, artDirection: design.artDirection }
      : null,
  });
}

function discover() {
  const roots = ['.tmp', '.app-builder/static-renderer/workspaces', '.tmp/real-business-acceptance/workspaces'];
  const found = [];
  for (const root of roots) {
    const abs = path.join(ROOT, root);
    if (!fs.existsSync(abs)) continue;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(abs, entry.name);
      if (fs.existsSync(path.join(dir, '.app-builder/composition.json'))) found.push(dir);
    }
  }
  return found;
}

function main() {
  const requested = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
  const dirs = requested.length ? requested : discover();
  const signatures = dirs.map(loadBuild).filter(Boolean);

  if (!signatures.length) {
    console.error('No generated builds found. Generate some (`npm run generate:acceptance`) or name directories explicitly.');
    process.exit(1);
  }

  const report = assessCrossBuildDiversity(signatures);
  for (const line of describeCrossBuildDiversity(report)) console.log(line);

  const out = path.join(ROOT, '.app-builder/anti-template');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify({ ...report, signatures }, null, 2)}\n`);
  console.log(`\nEvidence: ${path.relative(ROOT, out)}/report.json`);

  // Deliberately always zero. This is a diagnostic; the moment it decides a
  // build it has invented a threshold the corpus has not earned.
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
