import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { BESPOKE_ROOT, fulfilBespokePresentation, reviewBespokePresentation, validateBespokePresentation, writeBespokePresentation } from './lib/bespoke-presentation.mjs';

const FROZEN = 'a'.repeat(64);

const PLAN = Object.freeze({
  planId: 'rework-0123456789abcdef',
  setId: 'set-1',
  projectId: 'project-1',
  frozenTruthHash: FROZEN,
  customPresentation: {
    sectionId: 'page-home-hero',
    sectionType: 'hero',
    reason: 'distinctiveness failed and no axis the factory can tune would answer it.',
    artDirectionNeed: 'An opening whose memorable idea is the practice\'s own numbering system, set as type rather than as an image.',
    registryInsufficientBecause: 'Every registered hero presentation arranges a title, body and actions. None sets a numeric series as the primary visual event.',
    responsiveBehaviour: 'Must compose deliberately at 390px, not inherit the desktop arrangement narrowed.',
    motionBehaviour: 'Must respect the candidate\'s motion contract (restrained) and prefers-reduced-motion.',
    owner: 'art-direction',
    status: 'classified',
  },
});

const TOKENS = Object.freeze({
  '--color-accent': '#315b72',
  '--font-display': 'Inter, sans-serif',
  '--section-space': '96px',
  '--motion-duration-slow': '460ms',
  '--motion-ease': 'cubic-bezier(0.2, 0, 0.2, 1)',
});

const GOOD_CSS = `[data-section-id="page-home-hero"] .hero-copy-column { display: grid; gap: var(--section-space) }
[data-section-id="page-home-hero"] h1 { font-family: var(--font-display); color: var(--color-accent) }
@media (max-width: 720px) {
  [data-section-id="page-home-hero"] .hero-copy-column { gap: 24px; grid-template-columns: 1fr }
}
`;

const USED = ['--section-space', '--font-display', '--color-accent'];

function fulfil(overrides = {}) {
  return fulfilBespokePresentation({
    plan: PLAN,
    projectId: 'project-1',
    css: GOOD_CSS,
    tokensUsed: USED,
    createdAt: '2026-08-26T00:00:00.000Z',
    compiledTokens: TOKENS,
    ...overrides,
  });
}

test('a fulfilment exists only because a review classified a requirement the registry could not serve', () => {
  assert.throws(
    () => fulfilBespokePresentation({ plan: { ...PLAN, customPresentation: null }, projectId: 'p', css: GOOD_CSS, createdAt: 'now', compiledTokens: TOKENS }),
    /classified none/,
    'building a bespoke presentation with no classified requirement is the registry-is-a-ceiling failure in reverse',
  );
});

test('it starts awaiting an independent review and cannot start anywhere else', () => {
  const fulfilment = fulfil();
  assert.equal(fulfilment.status, 'awaiting-visual-review');
  assert.equal(fulfilment.review, null);
  const problems = validateBespokePresentation({ ...fulfilment, status: 'accepted', review: null }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'self-approval'));
});

test('it is project-local, and says what promotion into the registry would require', () => {
  const fulfilment = fulfil();
  assert.equal(fulfilment.scope, 'project-local');
  assert.equal(fulfilment.registryPromotion.eligible, false);
  assert.match(fulfilment.registryPromotion.requires, /Repeated evidence across unrelated projects/);
  const problems = validateBespokePresentation({ ...fulfilment, scope: 'registry' }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'scope'), 'a fulfilment that promoted itself would turn one project\'s exception into every project\'s default');
});

test('it owns one directory and cannot reach the composition, the design system or the manifest', () => {
  const fulfilment = fulfil();
  assert.deepEqual(fulfilment.changeSet.files, [`${BESPOKE_ROOT}/page-home-hero.css`]);
  for (const escape of ['src/generated/design.ts', '.product/design-system.json', '.app-builder/composition.json', 'package.json', '../outside.css', '/etc/passwd']) {
    const problems = validateBespokePresentation({ ...fulfilment, changeSet: { files: [escape] } }, { compiledTokens: TOKENS });
    assert.ok(problems.some((problem) => problem.rule === 'change-set'), `${escape} should be refused`);
  }
});

test('every selector is anchored to its own section', () => {
  const wide = `.hero-copy-column { display: grid }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
  const problems = validateBespokePresentation({ ...fulfil(), css: wide }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'section-scope'), 'a presentation that can restyle the rest of the site is a second stylesheet');
});

test('colour comes from tokens, never from a literal', () => {
  for (const literal of ['color: #ff0000', 'background: rgb(255 0 0)', 'border-color: hsl(200 50% 40%)']) {
    const css = `[data-section-id="page-home-hero"] h1 { ${literal} }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
    const problems = validateBespokePresentation({ ...fulfil(), css }, { compiledTokens: TOKENS });
    assert.ok(problems.some((problem) => problem.rule === 'token-only'), `${literal} should be refused`);
  }
});

test('color-mix over tokens is allowed, because it names tokens rather than picking a colour', () => {
  const css = `[data-section-id="page-home-hero"] h1 { background: color-mix(in srgb, var(--color-accent) 12%, transparent) }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
  const problems = validateBespokePresentation({ ...fulfil(), css, tokensUsed: ['--color-accent'] }, { compiledTokens: TOKENS });
  assert.deepEqual(problems.filter((problem) => problem.rule === 'token-only'), []);
});

test('a literal mixed into color-mix is still a literal', () => {
  const css = `[data-section-id="page-home-hero"] h1 { background: color-mix(in srgb, #ff0000 12%, transparent) }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
  const problems = validateBespokePresentation({ ...fulfil(), css, tokensUsed: [] }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'token-only'));
});

test('a token the compiler does not emit is refused, and a token used but not declared is too', () => {
  const css = `[data-section-id="page-home-hero"] h1 { color: var(--colour-of-magic) }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
  const problems = validateBespokePresentation({ ...fulfil(), css, tokensUsed: [] }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'unknown-token'), 'a declaration reading a token nothing emits resolves to nothing');
  assert.ok(problems.some((problem) => problem.rule === 'undeclared-token'), 'a dependency nothing records is a dependency nothing can check');
});

test('a token the template defaults is accepted even when the compiler does not emit it', () => {
  const css = `[data-section-id="page-home-hero"] h1 { border-radius: var(--radius-md) }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
  const problems = validateBespokePresentation({ ...fulfil(), css, tokensUsed: ['--radius-md'] }, { compiledTokens: TOKENS, templateTokenDefaults: new Set(['--radius-md']) });
  assert.deepEqual(problems.filter((problem) => problem.rule === 'unknown-token'), []);
});

test('it composes at a phone width rather than inheriting the desktop arrangement narrowed', () => {
  const desktopOnly = '[data-section-id="page-home-hero"] h1 { font-family: var(--font-display) }';
  const problems = validateBespokePresentation({ ...fulfil(), css: desktopOnly, tokensUsed: ['--font-display'] }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'responsive'), 'the classification required a deliberate mobile composition, and it is checkable');
});

test('anything that moves has a reduced-motion answer', () => {
  const moves = `[data-section-id="page-home-hero"] h1 { transition: transform var(--motion-duration-slow) var(--motion-ease) }
@media (max-width: 720px) { [data-section-id="page-home-hero"] h1 { font-size: 2rem } }`;
  const problems = validateBespokePresentation({ ...fulfil(), css: moves, tokensUsed: ['--motion-duration-slow', '--motion-ease'], motion: { declaresMotion: true, reducedMotionHonoured: true } }, { compiledTokens: TOKENS });
  assert.ok(problems.some((problem) => problem.rule === 'motion'), 'a MotionContract honoured only where it was written is not honoured');

  const answered = `${moves}
@media (prefers-reduced-motion: reduce) { [data-section-id="page-home-hero"] h1 { transition: none } }`;
  const fixed = validateBespokePresentation({ ...fulfil(), css: answered, tokensUsed: ['--motion-duration-slow', '--motion-ease'], motion: { declaresMotion: true, reducedMotionHonoured: true } }, { compiledTokens: TOKENS });
  assert.deepEqual(fixed.filter((problem) => problem.rule === 'motion'), []);
});

test('it writes only the files it owns, and refuses anything else even when handed to the writer directly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bespoke-'));
  try {
    const fulfilment = fulfil();
    const written = writeBespokePresentation(dir, fulfilment, { compiledTokens: TOKENS });
    assert.deepEqual(written, [`${BESPOKE_ROOT}/page-home-hero.css`]);
    assert.equal(fs.readFileSync(path.join(dir, BESPOKE_ROOT, 'page-home-hero.css'), 'utf8'), GOOD_CSS);
    assert.equal(fs.existsSync(path.join(dir, 'src/generated')), false, 'a bespoke presentation creates nothing outside its own directory');

    assert.throws(
      () => writeBespokePresentation(dir, { ...fulfilment, changeSet: { files: ['src/generated/design.ts'] } }, { compiledTokens: TOKENS }),
      /Refusing to write/,
      'the writer re-validates rather than trusting the record it was handed',
    );
    assert.equal(fs.existsSync(path.join(dir, 'src/generated/design.ts')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the creator may not review its own presentation', () => {
  const fulfilment = fulfil();
  assert.throws(
    () => reviewBespokePresentation(fulfilment, { verdict: 'pass', reviewedBy: fulfilment.createdBy, reviewedAt: 'now' }),
    /may not review it/,
  );
});

test('a pass needs the deterministic checks to have run and come back clean', () => {
  const fulfilment = fulfil();
  assert.throws(() => reviewBespokePresentation(fulfilment, { verdict: 'pass', reviewedBy: 'design-critic', reviewedAt: 'now' }), /needs DesignLint/);
  assert.throws(
    () => reviewBespokePresentation({ ...fulfilment, designLint: { violation: 1, warning: 0, recommendation: 0 } }, { verdict: 'pass', reviewedBy: 'design-critic', reviewedAt: 'now' }),
    /not something a visual verdict can overrule/,
  );
  assert.throws(
    () => reviewBespokePresentation({ ...fulfilment, designLint: { violation: 0, warning: 0, recommendation: 0 } }, { verdict: 'pass', reviewedBy: 'design-critic', reviewedAt: 'now' }),
    /needs rendered evidence/,
  );
});

test('a clean, photographed presentation can be passed by someone who did not write it, and only once', () => {
  const ready = { ...fulfil(), designLint: { violation: 0, warning: 0, recommendation: 0 }, renderedEvidenceId: 'evidence-1' };
  const accepted = reviewBespokePresentation(ready, { verdict: 'pass', reviewedBy: 'design-critic', reviewedAt: '2026-08-26T01:00:00.000Z' });
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.review.reviewedBy, 'design-critic');
  assert.throws(() => reviewBespokePresentation(accepted, { verdict: 'reject', reviewedBy: 'someone-else', reviewedAt: 'later' }), /already has a verdict/);
});

test('a rework verdict leaves it awaiting review rather than pretending it was decided', () => {
  const reworked = reviewBespokePresentation(fulfil(), { verdict: 'rework', reviewedBy: 'design-critic', reviewedAt: 'now', notes: 'the numbering reads as a price list' });
  assert.equal(reworked.status, 'awaiting-visual-review');
  assert.equal(reworked.review.verdict, 'rework');
});

test('it keeps lineage back to the review that asked for it, and to the truth that may not move', () => {
  const fulfilment = fulfil();
  assert.equal(fulfilment.planId, PLAN.planId);
  assert.equal(fulfilment.setId, PLAN.setId);
  assert.equal(fulfilment.frozenTruthHash, FROZEN);
  assert.equal(fulfilment.sectionId, PLAN.customPresentation.sectionId);
  assert.equal(fulfilment.artDirectionNeed, PLAN.customPresentation.artDirectionNeed);
});

test('the same declaration for the same requirement is the same presentation', () => {
  assert.equal(fulfil().presentationId, fulfil().presentationId);
  assert.notEqual(fulfil().presentationId, fulfil({ css: `${GOOD_CSS}\n[data-section-id="page-home-hero"] p { margin: 0 }` }).presentationId);
});

// --- Durability across a rebuild -------------------------------------------
//
// A rebuild generates into a fresh workspace, so anything that lives only in
// the previous one is lost the next time the project is built. A bespoke
// presentation that survived one build and vanished from the next would be
// worse than never having had one, because the review that passed it would
// still be on the record.

import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { templateTokenDefaults } from './lib/design-lint.mjs';

function serviceManifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Bespoke Test', slug, type: 'marketing-site', primaryGoal: 'Prove a classified presentation requirement can be fulfilled.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Services', 'Contact'],
    entities: [],
    company: {
      identity: { name: 'Bespoke Test' },
      services: ['Painting', 'Joinery', 'Fitted furniture'],
      locations: ['Glasgow'],
      contactDetails: { email: 'hello@example.com' },
      trustSignals: [],
      conversionGoals: ['email'],
    },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

test('a bespoke presentation survives a rebuild, and one whose tokens stopped resolving is refused rather than left broken', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-bespoke-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces'), stateRoot: path.join(root, 'state') });
  try {
    const project = service.createProject({ id: 'project-bespoke', manifest: serviceManifest('bespoke-test') });
    const first = await service.generateProject(project.id);

    const composition = JSON.parse(fs.readFileSync(path.join(first.workspace, '.app-builder/composition.json'), 'utf8'));
    const hero = composition.sections.find((entry) => entry.type === 'hero');
    assert.ok(hero, 'the build needs a hero section for the requirement to be about');
    const spec = JSON.parse(fs.readFileSync(path.join(first.workspace, '.product/design-system.json'), 'utf8'));
    const defaults = templateTokenDefaults(fs.readFileSync(path.join(first.workspace, 'src/design/tokens.css'), 'utf8'));

    const css = `[data-section-id="${hero.id}"] h1 { color: var(--color-accent) }\n@media (max-width: 720px) { [data-section-id="${hero.id}"] h1 { letter-spacing: -.02em } }\n`;
    const fulfilment = fulfilBespokePresentation({
      plan: { ...PLAN, customPresentation: { ...PLAN.customPresentation, sectionId: hero.id } },
      projectId: project.id,
      css,
      tokensUsed: ['--color-accent'],
      createdAt: '2026-08-26T00:00:00.000Z',
      compiledTokens: spec.tokens,
      templateTokenDefaults: defaults,
    });

    fs.mkdirSync(path.dirname(service.bespokePresentationsPath(project.id)), { recursive: true });
    fs.writeFileSync(service.bespokePresentationsPath(project.id), `${JSON.stringify({ schemaVersion: 1, projectId: project.id, presentations: [fulfilment] }, null, 2)}\n`);

    const rebuilt = await service.generateProject(project.id);
    assert.notEqual(rebuilt.workspace, first.workspace, 'a rebuild generates into a fresh workspace, which is why durability is the question');
    const applied = path.join(rebuilt.workspace, 'src/presentation/bespoke', `${hero.id}.css`);
    assert.equal(fs.existsSync(applied), true, 'the presentation is re-applied into the new build');
    assert.equal(fs.readFileSync(applied, 'utf8'), css);

    // A presentation reading a token this build no longer emits is refused,
    // not written. Silently rendering against an unresolvable custom property
    // is the failure the token rule exists to prevent, and a rebuild must not
    // be the back door to it.
    const stale = { ...fulfilment, presentationId: 'bespoke-ffffffffffffffff', css: css.replace('--color-accent', '--colour-of-magic'), tokensUsed: ['--colour-of-magic'] };
    fs.writeFileSync(service.bespokePresentationsPath(project.id), `${JSON.stringify({ schemaVersion: 1, projectId: project.id, presentations: [fulfilment, stale] }, null, 2)}\n`);

    const third = await service.generateProject(project.id);
    assert.equal(fs.existsSync(path.join(third.workspace, 'src/presentation/bespoke', `${hero.id}.css`)), true, 'the presentation that still resolves is still applied');
    const written = fs.readdirSync(path.join(third.workspace, 'src/presentation/bespoke'));
    assert.equal(written.length, 1, 'the presentation whose token stopped resolving is not written');

    // And a build that never had one creates no directory at all.
    const other = service.createProject({ id: 'project-plain', manifest: serviceManifest('plain-test') });
    const plain = await service.generateProject(other.id);
    assert.equal(fs.existsSync(path.join(plain.workspace, 'src/presentation/bespoke')), false, 'almost every project has none, and pays nothing for the lane existing');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('both renderers load whatever bespoke presentations a project carries', () => {
  for (const entry of ['templates/astro-static-content/files/src/layouts/SiteLayout.astro', 'templates/react-vite-neutral/files/src/main.tsx']) {
    const source = fs.readFileSync(entry, 'utf8');
    assert.match(
      source,
      /import\.meta\.glob\('\.[./]*presentation\/bespoke\/\*\.css', \{ eager: true \}\)/,
      `${entry} does not load bespoke presentations, so a fulfilment would be a file nothing renders`,
    );
    // Loaded last, or it cannot answer the section the registry could not.
    assert.ok(source.indexOf('presentation/bespoke') > source.indexOf('styles.css'), `${entry} loads bespoke presentations before the shared presentation, so the shared one wins`);
  }
});
