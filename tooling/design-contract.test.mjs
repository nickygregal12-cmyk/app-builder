import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateContract } from '@app-builder/contracts';
import {
  ACCENT_MINIMUM_CONTRAST,
  DENSITIES,
  MAX_WIDTHS,
  RADII,
  applyDesignChoices,
  assertAccentColor,
  assertDesignChoices,
  compileDesignSystemSpec,
  compileDesignTokens,
  contrastRatio,
  renderDesignSystemCss,
} from './lib/design-choices.mjs';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';

const TOKENS = fs.readFileSync('templates/shared/presentation/tokens.css', 'utf8');
const STYLES = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Design Test', slug, type: 'marketing-site', primaryGoal: 'Prove the design contract compiles.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Design Test' }, services: ['Painting'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
  };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

const baseDesign = { patternId: 'public-marketing', label: 'Public marketing', shellClass: 'layout-public', maxWidth: '72rem', density: 'comfortable', radius: '1rem', accentColor: '#315b72' };

test('every compiled property is one the template actually reads', () => {
  const spec = compileDesignSystemSpec(baseDesign);
  const tokens = spec.tokens;
  assert.equal(spec.authority, 'design-contract', 'DesignSystemSpec must remain derived from the existing design authority');
  assert.deepEqual(spec.controls, {
    accentColor: '#315b72',
    maxWidth: '72rem',
    radius: '1rem',
    density: 'comfortable',
  });
  assert.deepEqual(tokens, compileDesignTokens(baseDesign));

  for (const name of Object.keys(tokens)) {
    const used = STYLES.includes(`var(${name})`) || TOKENS.includes(`var(${name})`) || STYLES.includes(`calc(var(${name})`);
    assert.ok(used, `${name} is compiled but the template never reads it`);
    assert.ok(TOKENS.includes(`${name}:`), `${name} has no default in the token file`);
  }
  // A design contract that does not compile is a prompt. The product renderer
  // now consumes DesignSystemSpec rather than bypassing that compiler stage.
  assert.match(renderDesignSystemCss(spec), /--section-space: clamp\(56px, 7vw, 104px\);/);
  assert.match(renderDesignSystemCss(compileDesignSystemSpec({ ...baseDesign, density: 'dense' })), /--section-space: clamp\(28px, 3\.5vw, 52px\);/);
});

test('every active DesignSystemSpec control changes output the renderer consumes', () => {
  const baseline = compileDesignSystemSpec(baseDesign);
  const cases = [
    { control: 'accentColor', value: '#7a1f3d', token: '--color-accent' },
    { control: 'maxWidth', value: '90rem', token: '--layout-max-width' },
    { control: 'radius', value: '0.625rem', token: '--layout-radius' },
    { control: 'density', value: 'dense', token: '--section-space' },
  ];

  for (const entry of cases) {
    const next = compileDesignSystemSpec({ ...baseDesign, [entry.control]: entry.value });
    assert.notEqual(next.tokens[entry.token], baseline.tokens[entry.token], `${entry.control} is declared but does not change its compiled token`);
    assert.notEqual(renderDesignSystemCss(next), renderDesignSystemCss(baseline), `${entry.control} is declared but does not change rendered CSS`);
  }
});

test('DesignSystemSpec renderer fails closed for non-compiler declarations', () => {
  assert.throws(() => renderDesignSystemCss(null), /Invalid DesignSystemSpec/);
  assert.throws(() => renderDesignSystemCss({ schemaVersion: 1, authority: 'another-design-system', tokens: {} }), /Invalid DesignSystemSpec/);
  assert.throws(() => renderDesignSystemCss({ schemaVersion: 2, authority: 'design-contract', tokens: {} }), /Invalid DesignSystemSpec/);
});

test('each density compiles to a different rhythm', () => {
  const spaces = Object.keys(DENSITIES).map((density) => compileDesignSystemSpec({ ...baseDesign, density }).tokens['--section-space']);
  assert.equal(new Set(spaces).size, spaces.length, 'a density that compiles to the same value as another is not a choice');
});

test('an accent that cannot carry its own label is refused', () => {
  // White-on-yellow is unreadable; white-on-navy is not. This is not taste.
  assert.throws(() => assertAccentColor('#ffe600'), /contrasts .* below the 4\.5:1 needed/);
  assert.throws(() => assertAccentColor('#ffffff'), /below the 4\.5:1 needed/);
  assert.equal(assertAccentColor('#315B72'), '#315b72', 'a usable accent is accepted and normalised');
  assert.ok(contrastRatio('#315b72', '#ffffff') >= ACCENT_MINIMUM_CONTRAST);

  for (const bad of ['315b72', '#fff', 'rebeccapurple', '', null, 42]) {
    assert.throws(() => assertAccentColor(bad), /is not a six-digit hex colour/);
  }
});

test('a control outside the declared set fails closed', () => {
  assert.throws(() => assertDesignChoices({ maxWidth: '200rem' }), /Unsupported maxWidth: 200rem\. It offers:/);
  assert.throws(() => assertDesignChoices({ radius: '9rem' }), /Unsupported radius/);
  assert.throws(() => assertDesignChoices({ density: 'airy' }), /Unsupported density/);
  // Arbitrary CSS is not a design control.
  assert.throws(() => assertDesignChoices({ fontFamily: 'Comic Sans' }), /Unsupported design control: fontFamily/);
  assert.throws(() => assertDesignChoices({ '--color-page': 'red' }), /Unsupported design control/);

  assert.deepEqual(assertDesignChoices({ maxWidth: MAX_WIDTHS[0].id, radius: RADII[0].id, density: 'dense', accentColor: '#315b72' }), {
    maxWidth: MAX_WIDTHS[0].id, radius: RADII[0].id, density: 'dense', accentColor: '#315b72',
  });
  assert.deepEqual(assertDesignChoices({}), {});
});

test('choices apply over what the factory selected without replacing it', () => {
  const chosen = applyDesignChoices(baseDesign, { density: 'compact' });
  assert.equal(chosen.density, 'compact');
  assert.equal(chosen.patternId, baseDesign.patternId, 'a design choice is not a change of layout family');
  assert.equal(chosen.shellClass, baseDesign.shellClass);
});

test('a design choice compiles into the build, survives a rebuild and is recoverable', async () => {
  const dirs = roots('app-builder-design-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-design', manifest: manifest('design-test') });
    assert.equal(service.designContract(project.id), null, 'there is no design contract before a build');

    const generated = await service.generateProject(project.id);
    const contract = service.designContract(project.id);
    assert.equal(contract.design.density, 'comfortable');
    assert.deepEqual(contract.chosen, {});
    assert.deepEqual(contract.controls.map((entry) => entry.control), ['density', 'maxWidth', 'radius']);

    const brandFile = path.join(generated.workspace, 'src/generated/brand.css');
    assert.equal(fs.readFileSync(brandFile, 'utf8'), renderDesignSystemCss(compileDesignSystemSpec(contract.design)), 'the generated stylesheet must be the DesignSystemSpec renderer output');
    assert.match(fs.readFileSync(brandFile, 'utf8'), /--section-space: clamp\(56px, 7vw, 104px\);/);

    await assert.rejects(() => service.writeDesignChoices(project.id, { accentColor: '#ffe600' }), /below the 4\.5:1 needed/);
    await assert.rejects(() => service.writeDesignChoices(project.id, { density: 'airy' }), /Unsupported density/);
    assert.deepEqual(service.readDesignChoices(project.id).choices, {}, 'a refused choice reaches neither disk nor the build');

    const updated = await service.writeDesignChoices(project.id, { density: 'dense', accentColor: '#7a1f3d' });
    assert.equal(updated.design.density, 'dense');
    assert.deepEqual(validateContract('design-choice', service.readDesignChoices(project.id)), []);

    // The brand stylesheet is generated, so the change reaches the running
    // preview without a rebuild.
    const compiled = fs.readFileSync(brandFile, 'utf8');
    assert.equal(compiled, renderDesignSystemCss(compileDesignSystemSpec(updated.design)), 'live design edits must pass through the same DesignSystemSpec renderer');
    assert.match(compiled, /--section-space: clamp\(28px, 3\.5vw, 52px\);/);
    assert.match(compiled, /--color-accent: #7a1f3d;/);
    assert.match(fs.readFileSync(path.join(generated.workspace, 'src/generated/design.ts'), 'utf8'), /"density": "dense"/);

    const rebuilt = await service.generateProject(project.id);
    assert.notEqual(rebuilt.workspace, generated.workspace);
    assert.match(fs.readFileSync(path.join(rebuilt.workspace, 'src/generated/brand.css'), 'utf8'), /--color-accent: #7a1f3d;/);
    assert.equal(service.designContract(project.id).design.density, 'dense', 'a rebuild must not discard how someone set the design');

    // Clearing a control returns it to what the factory selected.
    const cleared = await service.writeDesignChoices(project.id, { density: null });
    assert.equal(cleared.design.density, 'comfortable');
    assert.equal('density' in service.readDesignChoices(project.id).choices, false);
    assert.equal(cleared.design.accentColor, '#7a1f3d', 'clearing one control leaves the others alone');
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});

/**
 * A display step chosen for the direction, not for the words it has to set.
 *
 * "nbm Construction Cost Consultants" at 67px set over **four lines** in
 * `structured-practice` at both 1440 and 390, and over four on a phone in
 * `service-forward`. Both adopted design catalogues call that a defect rather
 * than a long name: pbakaus/impeccable classifies it `oversized-h1`, and
 * leonxlnx/taste-skill states it as strongly as it states anything — a display
 * headline of four or more lines is a failure, and the answer is a smaller step
 * rather than a shorter company. The seventh independent review arrived at the
 * same place from the other end and asked for oversized headings to be
 * rebalanced. After fitting, both set in two lines.
 *
 * A ratio rather than a breakpoint, so a name that is barely long is barely
 * reduced and the rule has no cliff in it.
 */
test('the display step is fitted to the name it has to set', async () => {
  const { displayFit, compileDesignTokens } = await import('./lib/design-choices.mjs');

  // A name that fits is untouched. This is most projects, and they must render
  // exactly what they rendered before the fit existed.
  assert.equal(displayFit('MGB Decor'), 1);
  assert.equal(displayFit('Fenwick & Hale'), 1);
  assert.equal(displayFit(''), 1, 'a project with no name must not compile a shrunken headline');
  assert.equal(displayFit(null), 1);

  // A long one is reduced, and monotonically: longer is never larger.
  const long = displayFit('nbm Construction Cost Consultants');
  assert.ok(long < 1, 'a name that sets over four lines must not keep the full display step');
  assert.ok(displayFit('A'.repeat(80)) <= long, 'the fit must not grow as the name grows');

  // Floored, because past a point the answer is a shorter name rather than
  // six-point type. A headline that stopped being a headline is not a fix.
  assert.ok(displayFit('A'.repeat(400)) >= 0.7, 'the fit must bottom out rather than shrink without limit');

  // An unbreakable word is its own pressure: `Consultants` decides the
  // narrowest column the line can sit in, whatever the total length.
  assert.ok(
    displayFit('Aa Bb Cc Dd Ee Ff') > displayFit('Aa Bb Extraordinarily Cc'),
    'a long single word must reduce the step even when the whole name is short',
  );

  // And it reaches the stylesheet, or none of the above renders.
  const tokens = compileDesignTokens({ density: 'comfortable', maxWidth: '72rem', radius: '0rem', displayName: 'nbm Construction Cost Consultants' });
  assert.equal(tokens['--display-fit'], String(long));
  assert.equal(compileDesignTokens({ density: 'comfortable', maxWidth: '72rem', radius: '0rem' })['--display-fit'], '1');
});

test('the headline actually multiplies by the fit', () => {
  const css = fs.readFileSync(new URL('../templates/shared/presentation/styles.css', import.meta.url), 'utf8');
  assert.match(
    css,
    /h1 \{ font-size: calc\(var\(--text-4xl\) \* var\(--display-fit\)\)/,
    'the display step must consume the fit, or the token is a number nothing reads',
  );
  const tokens = fs.readFileSync(new URL('../templates/shared/presentation/tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /--display-fit:\s*1;/, 'a project compiled before this existed must default to the full step');
});

/**
 * One declaration per token.
 *
 * `--color-scrim` was declared twice in the same block: once as the RGB triplet
 * the immersive hero composes its gradient from, and once — added later, for the
 * disclosed navigation panel — as a complete colour. The second won, so
 * `rgb(var(--color-scrim) / 24%)` became `rgb(rgb(...) / 24%)`, the gradient was
 * invalid, and the hero lost the scrim its white text depends on. Nothing
 * failed: both lines are legal custom-property declarations, both resolve, and
 * DesignLint's rule is about colour literals rather than about duplication.
 *
 * The token file is one block of declarations, so a repeated name is always a
 * mistake rather than a cascade someone intended.
 */
test('no token is declared twice in the token source', () => {
  const tokens = fs.readFileSync(new URL('../templates/shared/presentation/tokens.css', import.meta.url), 'utf8');
  const seen = new Map();
  for (const match of tokens.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
    seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
  }
  const repeated = [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  assert.deepEqual(
    repeated,
    [],
    `${repeated.join(', ')} declared more than once. The later declaration silently wins, and a consumer written against the earlier one breaks without failing.`,
  );
});
