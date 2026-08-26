import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_ART_DIRECTION,
  LAYOUT_VARIANCE_ORDER,
  RESTRAINT_LEVELS,
  VISUAL_DISTINCTIVENESS_ORDER,
  artDirectionIntent,
  compileArtDirectionPlan,
} from './lib/art-direction.mjs';
import { DEFAULT_ACCENT, TYPOGRAPHY_VOICES, compileBrandSpec } from './lib/brand-spec.mjs';
import { MOTION_INTENSITY_ORDER, compileMotionContract, motionTokens } from './lib/motion-contract.mjs';
import { compileDesignSystemSpec, renderDesignSystemCss } from './lib/design-choices.mjs';
import { generateProject, loadCatalog } from './lib/generator.mjs';

const TOKENS_CSS = fs.readFileSync('templates/shared/presentation/tokens.css', 'utf8');
const STYLES_CSS = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');
const LAYOUTS = JSON.parse(fs.readFileSync('config/layout-patterns.json', 'utf8'));

function baseDesign(overrides = {}) {
  const catalog = loadCatalog();
  const pattern = catalog.layouts.patterns['public-marketing'];
  const { artDirection: _intent, ...design } = pattern;
  return {
    patternId: 'public-marketing',
    ...design,
    accentColor: DEFAULT_ACCENT,
    brand: compileBrandSpec(),
    artDirection: compileArtDirectionPlan(artDirectionIntent(pattern)),
    ...overrides,
  };
}

function pack({ colors = [], fontFamilies = [] } = {}) {
  return { brand: { colors, fontFamilies } };
}

test('BrandSpec resolves what the company showed without turning inference into source fact', () => {
  const observed = pack({
    // The greys a stylesheet is full of are furniture, not a brand colour.
    colors: [{ value: '#333333', sourceIds: ['source-a', 'source-b'] }, { value: '#f7f7f7', sourceIds: ['source-a'] }, { value: '#1b5e3f', sourceIds: ['source-a', 'source-c'] }],
    fontFamilies: [{ value: 'Georgia, serif', sourceIds: ['source-a'] }],
  });

  const fromSource = compileBrandSpec({ knowledgePack: observed });
  assert.equal(fromSource.accent.value, '#1b5e3f', 'the first observed colour that can actually carry a label is the brand colour');
  assert.deepEqual(fromSource.accent.sourceIds, ['source-a', 'source-c'], 'an observation must name the sources it came from');
  assert.equal(fromSource.accent.origin, 'observed');
  assert.equal(fromSource.typography.voice, 'transitional-serif');
  assert.equal(fromSource.typography.origin, 'observed');

  const supplied = compileBrandSpec({ manifest: { brand: { accentColor: '#7A1F3D', typographyVoice: 'grotesque-sans' } }, knowledgePack: observed });
  assert.equal(supplied.accent.value, '#7a1f3d', 'a stated colour outranks an observed one');
  assert.equal(supplied.accent.origin, 'supplied');
  assert.deepEqual(supplied.accent.sourceIds, [], 'a stated decision is not source-backed and must not claim sources');
  assert.equal(supplied.typography.voice, 'grotesque-sans');

  const nothingUsable = compileBrandSpec({ knowledgePack: pack({
    colors: [{ value: '#333333', sourceIds: ['source-a'] }, { value: '#ffffff', sourceIds: ['source-a'] }],
    fontFamilies: [{ value: 'Nonesuch Display, sans-serif', sourceIds: ['source-a'] }],
  }) });
  assert.equal(nothingUsable.accent.origin, 'derived', 'a page full of greys is not a brand colour');
  assert.equal(nothingUsable.accent.value, DEFAULT_ACCENT);
  assert.deepEqual(nothingUsable.accent.sourceIds, []);
  assert.equal(nothingUsable.typography.origin, 'derived', 'a typeface nothing here can resolve is not guessed at');

  const nothingAtAll = compileBrandSpec();
  assert.equal(nothingAtAll.accent.origin, 'derived');
  assert.equal(nothingAtAll.typography.origin, 'derived');
});

test('a resolved brand reaches the stylesheet as typography the template reads', () => {
  const humanist = compileDesignSystemSpec(baseDesign());
  const serif = compileDesignSystemSpec(baseDesign({ brand: compileBrandSpec({ manifest: { brand: { typographyVoice: 'transitional-serif' } } }) }));

  assert.equal(humanist.tokens['--font-display'], TYPOGRAPHY_VOICES['humanist-sans'].display);
  assert.equal(serif.tokens['--font-display'], TYPOGRAPHY_VOICES['transitional-serif'].display);
  assert.notEqual(renderDesignSystemCss(serif), renderDesignSystemCss(humanist), 'a different brand voice must produce a different stylesheet');

  // The declaration is only real because the template reads it.
  assert.match(STYLES_CSS, /font-family: var\(--font-body\)/, 'body copy must be set in the brand body face');
  assert.match(STYLES_CSS, /h1, h2, h3 \{[^}]*font-family: var\(--font-display\)/, 'headings must be set in the brand display face');

  for (const voice of Object.values(TYPOGRAPHY_VOICES)) {
    for (const stack of [voice.display, voice.body]) {
      assert.ok(/(ui-sans-serif|ui-serif|system-ui|sans-serif|serif)$/.test(stack.trim()), `${stack} must end in a generic family so it resolves with no web font`);
    }
  }
});

test('every ArtDirectionPlan dimension changes output the renderer consumes', () => {
  const baseline = compileDesignSystemSpec(baseDesign());
  const cases = [
    { dimension: 'layoutVariance', values: LAYOUT_VARIANCE_ORDER, token: '--section-alt-ground' },
    { dimension: 'visualDistinctiveness', values: VISUAL_DISTINCTIVENESS_ORDER, token: '--hero-scale' },
    { dimension: 'motionIntensity', values: MOTION_INTENSITY_ORDER, token: '--motion-duration-fast' },
  ];

  for (const entry of cases) {
    const rendered = new Set();
    for (const value of entry.values) {
      // restraintLevel low, so this measures the dimension rather than the ceiling.
      const plan = compileArtDirectionPlan({ ...DEFAULT_ART_DIRECTION, restraintLevel: 'low', [entry.dimension]: value });
      const spec = compileDesignSystemSpec(baseDesign({ artDirection: plan }));
      assert.ok(spec.tokens[entry.token], `${entry.dimension} must compile ${entry.token}`);
      rendered.add(renderDesignSystemCss(spec));
    }
    assert.equal(rendered.size, entry.values.length, `${entry.dimension} is declared but ${entry.values.length} values do not produce ${entry.values.length} stylesheets`);
  }

  // informationDensity is the existing density control rather than a second
  // rhythm, and the spec must say so rather than carrying two.
  const dense = compileDesignSystemSpec(baseDesign({ density: 'dense' }));
  assert.equal(dense.artDirection.dimensions.informationDensity, 'dense');
  assert.notEqual(dense.tokens['--section-space'], baseline.tokens['--section-space']);

  for (const token of ['--section-alt-ground', '--hero-scale', '--display-measure']) {
    assert.ok(TOKENS_CSS.includes(`${token}:`), `${token} has no default in the token file`);
    assert.ok(STYLES_CSS.includes(`var(${token})`), `${token} is compiled but no rule reads it`);
  }
});

test('restraintLevel is a ceiling that only reduces, and records what it cut', () => {
  const ambitious = { layoutVariance: 'varied', motionIntensity: 'expressive', visualDistinctiveness: 'expressive' };
  const restrained = compileArtDirectionPlan({ ...ambitious, restraintLevel: 'high' });
  assert.deepEqual(restrained.dimensions, { layoutVariance: 'alternating', motionIntensity: 'subtle', visualDistinctiveness: 'balanced', restraintLevel: 'high' });
  assert.deepEqual(restrained.clamped.map((entry) => entry.dimension).sort(), ['layoutVariance', 'motionIntensity', 'visualDistinctiveness']);
  for (const entry of restrained.clamped) assert.equal(entry.reason, 'restraintLevel high');

  const unrestrained = compileArtDirectionPlan({ ...ambitious, restraintLevel: 'low' });
  assert.deepEqual(unrestrained.dimensions, { ...ambitious, restraintLevel: 'low' });
  assert.deepEqual(unrestrained.clamped, [], 'nothing was cut, so nothing is recorded as cut');

  // A ceiling can never raise a quiet plan into a loud one.
  const quiet = { layoutVariance: 'uniform', motionIntensity: 'none', visualDistinctiveness: 'restrained' };
  for (const restraintLevel of RESTRAINT_LEVELS) {
    const plan = compileArtDirectionPlan({ ...quiet, restraintLevel });
    assert.deepEqual(plan.dimensions, { ...quiet, restraintLevel }, `restraintLevel ${restraintLevel} must not add movement nobody asked for`);
    assert.deepEqual(plan.clamped, []);
  }
});

test('MotionContract compiles bounded movement and never trades away reduced motion', () => {
  const rendered = new Set();
  for (const intensity of MOTION_INTENSITY_ORDER) {
    const contract = compileMotionContract(intensity);
    assert.equal(contract.intensity, intensity);
    assert.equal(contract.reducedMotionRequired, true, 'honouring prefers-reduced-motion is not a level of expressiveness');
    rendered.add(JSON.stringify(motionTokens(contract)));
  }
  assert.equal(rendered.size, MOTION_INTENSITY_ORDER.length, 'every intensity must move differently');

  const still = compileMotionContract('none');
  assert.equal(still.decorativeMovement, false);
  assert.equal(motionTokens(still)['--motion-decorative-scale'], '1', 'movement with no interaction behind it is refused rather than made small');
  assert.equal(motionTokens(still)['--motion-hover-lift'], '0px');
  assert.equal(compileMotionContract('subtle').decorativeMovement, false);
  assert.equal(compileMotionContract('moderate').decorativeMovement, true);

  // An unknown band is not silently accepted as a new one.
  assert.equal(compileMotionContract('cinematic').intensity, 'moderate');

  assert.match(TOKENS_CSS, /@media \(prefers-reduced-motion: reduce\)/, 'the reduced-motion floor must stay in the template');
  for (const token of ['--motion-duration-fast', '--motion-duration-slow', '--motion-ease', '--motion-hover-lift', '--motion-decorative-scale']) {
    assert.ok(TOKENS_CSS.includes(`${token}:`), `${token} has no default in the token file`);
    assert.ok(STYLES_CSS.includes(`var(${token})`), `${token} is compiled but no rule reads it`);
  }
});

test('the canonical project types are art-directed differently, not recoloured', () => {
  const catalog = loadCatalog();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-art-direction-'));
  const specs = new Map();

  try {
    for (const [projectType, patternId] of Object.entries(LAYOUTS.projectTypeDefaults)) {
      const projectManifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
      projectManifest.project.type = projectType;
      projectManifest.project.slug = `art-direction-${projectType}`;
      const out = path.join(tmp, projectType);
      generateProject(projectManifest, out, { catalog });
      const spec = JSON.parse(fs.readFileSync(path.join(out, '.product/design-system.json'), 'utf8'));
      assert.equal(spec.layout.patternId, patternId);
      specs.set(projectType, spec);
    }

    const grounds = new Set([...specs.values()].map((spec) => spec.tokens['--section-alt-ground']));
    const heroes = new Set([...specs.values()].map((spec) => spec.tokens['--hero-scale']));
    const motions = new Set([...specs.values()].map((spec) => spec.tokens['--motion-duration-fast']));
    assert.ok(grounds.size >= 2, 'the project types must not all change ground the same way');
    assert.ok(heroes.size >= 2, 'the project types must not all open the same way');
    assert.ok(motions.size >= 2, 'the project types must not all move the same way');

    // A dense internal tool wants hover feedback and no flourish, so its own
    // ceiling cuts its declared motion back and says it did.
    const internal = specs.get('internal-tool');
    assert.equal(internal.artDirection.dimensions.restraintLevel, 'high');
    assert.equal(internal.artDirection.dimensions.motionIntensity, 'subtle');
    assert.deepEqual(internal.artDirection.clamped.map((entry) => entry.dimension), ['motionIntensity']);
    assert.equal(internal.tokens['--section-alt-ground'], 'transparent', 'a worked-in surface stays on one ground');

    const marketing = specs.get('marketing-site');
    assert.equal(marketing.artDirection.dimensions.visualDistinctiveness, 'expressive');
    assert.notEqual(marketing.tokens['--hero-scale'], internal.tokens['--hero-scale']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('an observed brand reaches the generated repository with its sources intact', () => {
  const catalog = loadCatalog();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-observed-brand-'));
  const out = path.join(tmp, 'project');

  try {
    const projectManifest = JSON.parse(fs.readFileSync('examples/generator-project-manifest.json', 'utf8'));
    delete projectManifest.brand.accentColor;
    generateProject(projectManifest, out, {
      catalog,
      knowledgePack: pack({
        colors: [{ value: '#cccccc', sourceIds: ['source-a'] }, { value: '#7d2b1f', sourceIds: ['source-a', 'source-b'] }],
        fontFamilies: [{ value: '"Playfair Display", Georgia, serif', sourceIds: ['source-b'] }],
      }),
    });

    const spec = JSON.parse(fs.readFileSync(path.join(out, '.product/design-system.json'), 'utf8'));
    assert.equal(spec.brand.accent.origin, 'observed');
    assert.equal(spec.brand.accent.value, '#7d2b1f');
    assert.deepEqual(spec.brand.accent.sourceIds, ['source-a', 'source-b']);
    assert.equal(spec.brand.accent.overridden, false);
    assert.equal(spec.brand.typography.voice, 'editorial-serif-sans');
    assert.equal(spec.controls.accentColor, '#7d2b1f', 'the build must present the colour its own material showed');

    const brandCss = fs.readFileSync(path.join(out, 'src/generated/brand.css'), 'utf8');
    assert.match(brandCss, /--color-accent: #7d2b1f;/);
    assert.match(brandCss, /--font-display: Georgia/);

    // A person choosing another colour is a decision, not a new observation.
    const overridden = compileDesignSystemSpec({ ...JSON.parse(fs.readFileSync(path.join(out, '.app-builder/project.json'), 'utf8')).design, accentColor: '#7a1f3d' });
    assert.equal(overridden.brand.accent.origin, 'observed', 'what the sources showed does not change because someone chose otherwise');
    assert.equal(overridden.brand.accent.overridden, true);
    assert.equal(overridden.tokens['--color-accent'], '#7a1f3d');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
