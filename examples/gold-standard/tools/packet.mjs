#!/usr/bin/env node
/**
 * Turn a hand-built prototype's rendered evidence into a review packet.
 *
 * The prototypes have to be measured by the instrument the standard is defined by, not by a
 * bespoke harness that asks nine questions and defines none of its numbers. That harness is
 * how three sites came back at 8.50, 8.56 and 8.71 and how this prototype climbed from 7.889
 * to 8.556 in a morning without any of its real faults being seen.
 *
 * So rather than approximate the v2 rubric, this writes the packet
 * `tooling/lib/codex-visual-reviewer.mjs` already reads, and the review is run by the
 * repository's own reviewer — anchored score bands, undisclosed bar, ceilings, and a pairwise
 * comparison against a benchmark reference chosen by the shape of the business problem.
 *
 *   node packet.mjs <prototype-dir> <evidence-dir> <out-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { criteriaFor } from '../../../tooling/lib/visual-rubric.mjs';

const prototypeDir = path.resolve(process.argv[2]);
const evidenceDir = path.resolve(process.argv[3]);
const outDir = path.resolve(process.argv[4] ?? path.join(prototypeDir, '.review/packet'));
/* Interaction states, captured separately. The reviewer refuses to guess at hover, focus and
   transition behaviour from static page shots — correctly — and scores interaction-craft on
   what it can see. So it is shown them, each labelled with the state it is holding. */
const statesDir = process.argv[5] ? path.resolve(process.argv[5]) : null;

const meta = JSON.parse(fs.readFileSync(path.join(prototypeDir, 'packet.meta.json'), 'utf8'));

/** `home--desktop.jpg` and `work-frihavn--mobile--2of3.jpg` both carry route and viewport. */
function describe(file) {
  const stem = file.replace(/\.jpg$/, '');
  const [routePart, viewportPart, panel] = stem.split('--');
  const route = routePart === 'home' ? '/' : `/${routePart.replace(/-/g, '/')}`;
  return {
    file,
    route: panel ? `${route} (panel ${panel.replace('of', ' of ')})` : route,
    viewport: viewportPart,
  };
}

/* Full-page ribbons are excluded: a 390x8000 strip is unreadable once fitted into a viewing
   pane, and submitting one is how a reviewer ends up marking type down for being small. The
   panels carry the same pixels at a legible shape. */
const files = fs.readdirSync(evidenceDir)
  .filter((name) => name.endsWith('.jpg') && !name.includes('--full'))
  .sort();

fs.mkdirSync(outDir, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(evidenceDir, file), path.join(outDir, file));

const STATE_ROUTES = {
  'nav-focus': ['/work', { focus: 'primary navigation, reached by keyboard' }],
  'nav-link-hover': ['/', { hover: 'navigation link, underline wiping in from the left' }],
  'register-entry-hover': ['/work', { hover: 'register entry, photograph scaling under the cursor' }],
  'route-link-hover': ['/', { hover: 'route to the register, translating right' }],
  'mail-link-hover': ['/work', { hover: 'mail link, rule darkening to ink' }],
  'skip-link-focus': ['/', { focus: 'skip link, revealed by the first Tab' }],
  'keyboard-traversal': ['/work', { keyboard: 'every tab stop outlined at once, showing traversal order' }],
  'reduced-motion': ['/work', { motion: 'prefers-reduced-motion: reduce — the same hover, with transitions suppressed' }],
  'active-nav-bureau': ['/bureau', { navigation: 'active route marked in the primary navigation' }],
  'action-hover': ['/survey', { hover: 'primary action inverting to ink' }],
  'action-touch-active': ['/survey', { touch: 'primary action held down at 390px' }],
  'scale-strip-hover': ['/work', { hover: 'proportional scale strip, bar under the cursor' }],
};

const stateCaptures = [];
if (statesDir && fs.existsSync(statesDir)) {
  for (const file of fs.readdirSync(statesDir).filter((n) => n.endsWith('.jpg')).sort()) {
    const key = file.replace(/--[a-z]+\.jpg$/, '');
    const entry = STATE_ROUTES[key];
    if (!entry) continue;
    fs.copyFileSync(path.join(statesDir, file), path.join(outDir, file));
    stateCaptures.push({ file, route: entry[0], viewport: file.includes('touch') ? 'mobile' : 'desktop', state: entry[1] });
  }
}

const packet = {
  schemaVersion: 1,
  business: meta.business,
  businessKind: meta.businessKind,
  benchmarkAnchors: meta.benchmarkAnchors,
  criteria: criteriaFor({ projectType: meta.projectType }),
  candidates: [
    {
      id: meta.candidateId,
      directionId: meta.candidateId,
      directionLabel: meta.directionLabel,
      captures: [...files.map(describe), ...stateCaptures],
      gate: { status: 'clear', mustAddress: [], blocking: [] },
    },
  ],
};

fs.writeFileSync(path.join(outDir, 'review.json'), JSON.stringify(packet, null, 1) + '\n');
console.log(`packet at ${outDir}`);
console.log(`  ${files.length} page captures + ${stateCaptures.length} interaction states, ${packet.criteria.length} criteria`);
console.log(`  viewports: ${[...new Set(files.map((f) => describe(f).viewport))].join(', ')}`);
console.log(`  routes: ${[...new Set(files.map((f) => describe(f).route.split(' ')[0]))].join(', ')}`);
