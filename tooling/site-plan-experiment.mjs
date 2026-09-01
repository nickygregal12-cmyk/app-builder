/**
 * The controlled B1 experiment: the current heuristic path against the planned one, same truth.
 *
 * Both sides run the real `composeProject` on the real approved knowledge packs committed in this
 * repository. Nothing is simulated and no expected route count is encoded anywhere — the point is
 * to find out what the planner does, including if the answer is "nothing useful".
 *
 *   node tooling/site-plan-experiment.mjs
 */
import fs from 'node:fs';
import { composeProject } from '../packages/composition/src/index.js';
import { planSite, validateSitePlan } from '../packages/composition/src/site-plan.js';

const FIXTURES = [
  {
    id: 'rich',
    label: 'Ardwell & Roe — rich approved truth',
    pack: 'examples/visual-excellence/ardwell-roe-approved-knowledge.v1.json',
    note: 'The case the 31-section / 9,217px / "effectively duplicate pages" review was run on.',
  },
  {
    id: 'thin',
    label: 'nbm — thin approved truth',
    pack: 'examples/genuine-business/nbm-approved-knowledge.v1.json',
    note: 'One Companies House description, empty trust signals, no projects, people or testimonials.',
  },
];

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** A manifest with nothing steering the outcome: no declared surfaces on either side. */
const manifestFor = (pack) => ({
  schemaVersion: 1,
  project: { name: pack?.project?.name ?? pack?.companyProfile?.identity?.name ?? 'Business', type: 'marketing-site' },
  company: { conversionGoals: ['enquiry'] },
});

/**
 * Two sections carrying the same content on one page.
 *
 * Compared on bindings rather than on section type, for the same reason as `duplicateRoutes`: a
 * page previewing the services and the projects renders two item grids and that is one page doing
 * two jobs, not one job twice.
 */
function duplicateJobs(composition) {
  const found = [];
  for (const page of composition.pages) {
    const seen = new Map();
    for (const section of composition.sections.filter((entry) => page.sectionIds.includes(entry.id))) {
      const key = `${section.type}:${(section.bindings ?? []).map((entry) => `${entry.key}=${JSON.stringify(entry.value).slice(0, 60)}`).sort().join('|')}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, count] of seen) if (count > 1) found.push(`${page.path}: ${key.split(':')[0]} x${count}`);
  }
  return found;
}

/**
 * Routes carrying the same content — the "effectively duplicate pages" finding.
 *
 * Compared on what the sections *bind*, not on their types. Two routes both rendered as an item
 * grid are not duplicates if one grid holds the services and the other holds the projects, and a
 * measure that called them duplicates would report a success as a failure.
 */
function duplicateRoutes(composition) {
  const signature = new Map();
  const found = [];
  for (const page of composition.pages) {
    if (page.path === '/404') continue;
    const key = composition.sections.filter((section) => page.sectionIds.includes(section.id))
      .flatMap((section) => (section.bindings ?? []).map((entry) => `${section.type}:${entry.key}:${JSON.stringify(entry.value).slice(0, 60)}`))
      .sort().join(' | ');
    if (!key) continue;
    if (signature.has(key)) found.push(`${page.path} == ${signature.get(key)}`);
    else signature.set(key, page.path);
  }
  return found;
}

const summarise = (composition) => ({
  routes: composition.pages.length,
  sections: composition.sections.length,
  perRoute: composition.pages.map((page) => `${page.path}:${page.sectionIds.length}`).join('  '),
  duplicateRoutes: duplicateRoutes(composition),
  duplicateJobs: duplicateJobs(composition),
  reasonedPurposes: composition.pages.filter((page) => !/^Provide the .* surface for /.test(page.purpose ?? '')).length,
});

const report = [];

for (const fixture of FIXTURES) {
  const pack = read(fixture.pack);
  const manifest = manifestFor(pack);

  const current = composeProject({ manifest, knowledgePack: pack });
  const plan = planSite({ manifest, knowledgePack: pack });
  const findings = validateSitePlan(plan, { knowledgePack: pack });
  const planned = findings.length ? null : composeProject({ manifest, knowledgePack: pack, sitePlan: plan });

  console.log(`\n=== ${fixture.label}`);
  console.log(`    ${fixture.note}`);
  if (findings.length) {
    console.log('    PLAN INVALID:');
    for (const finding of findings) console.log(`      ${finding.code}: ${finding.detail}`);
  }

  const a = summarise(current);
  const b = planned ? summarise(planned) : null;
  console.log(`\n    ${''.padEnd(22)}${'current'.padEnd(38)}planned`);
  const row = (label, x, y) => console.log(`    ${label.padEnd(22)}${String(x).padEnd(38)}${y}`);
  row('routes', a.routes, b?.routes ?? '—');
  row('total sections', a.sections, b?.sections ?? '—');
  row('sections per route', a.perRoute, b?.perRoute ?? '—');
  row('duplicate routes', a.duplicateRoutes.length ? a.duplicateRoutes.join(', ') : 'none', b ? (b.duplicateRoutes.length ? b.duplicateRoutes.join(', ') : 'none') : '—');
  row('repeated job on a page', a.duplicateJobs.length ? a.duplicateJobs.join(', ') : 'none', b ? (b.duplicateJobs.length ? b.duplicateJobs.join(', ') : 'none') : '—');
  row('routes with a reason', `${a.reasonedPurposes}/${a.routes}`, b ? `${b.reasonedPurposes}/${b.routes}` : '—');

  if (planned) {
    console.log('\n    planned routes and why they exist:');
    for (const route of plan.routes) console.log(`      ${route.path.padEnd(18)} ${route.existsBecause.slice(0, 120)}`);
    console.log('\n    declined:');
    for (const entry of plan.omitted) console.log(`      ${entry.candidate.padEnd(18)} ${entry.because.slice(0, 110)}`);
  }

  report.push({ fixture: fixture.id, current: a, planned: b, omitted: plan.omitted.length, findings });
}

/*
 * The negative assertion. Not "rich must have N more routes than thin" — that would be the quota
 * this capability exists to avoid — but that the two do not come out the same shape regardless of
 * what the truth says, which is what a template does.
 */
const [rich, thin] = report;
console.log('\n=== negative assertion');
const sameShape = rich.planned && thin.planned
  && rich.planned.routes === thin.planned.routes
  && rich.planned.perRoute === thin.planned.perRoute;
console.log(`    rich and thin produce the same structure: ${sameShape ? 'YES — the planner is a template' : 'no'}`);
console.log(`    thin declined ${thin.omitted} candidate route(s) rather than filling them`);
console.log(`    thin produced ${thin.planned?.routes ?? '—'} route(s); rich produced ${rich.planned?.routes ?? '—'}`);

fs.mkdirSync('.app-builder', { recursive: true });
fs.writeFileSync('.app-builder/site-plan-experiment.json', `${JSON.stringify(report, null, 1)}\n`);
if (sameShape) process.exitCode = 1;
