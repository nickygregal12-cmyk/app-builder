import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ACTION_TREATMENTS, CTA_COMPOSITIONS, HERO_COMPOSITIONS, DEFAULT_COMPOSITION_DIMENSIONS, structuralSignature } from './lib/visual-direction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

/**
 * What the visual system can and cannot choose, made executable.
 *
 * `docs/PHASE_4D_VISUAL_DEBT.md` records the finding in prose: `distinctiveness`
 * scored 4.3-4.8 across every candidate in every independent review, through a
 * content fix, a moment contract, an axis-rendering fix and an entirely new
 * direction, and the v4 critic named why — "familiar sans-serif headings, pill
 * buttons, thin dividers and a dark CTA rectangle".
 *
 * Prose cannot fail. This file is the same finding as a check, so that the
 * inventory of what a direction may actually vary is read off the committed
 * contract rather than re-derived by the next person from four review files.
 */

test('the section vocabulary inventory is what the reviews said it was', () => {
  const template = json('templates/react-vite-neutral/template.json');
  const variants = Object.fromEntries(
    Object.entries(template.presentation.components).map(([type, component]) => [type, (component.variants ?? []).length]),
  );

  // The public marketing vocabulary. These are the section types an independent
  // reviewer is looking at when they judge a website, and the count is how many
  // materially different compositions a direction may choose between.
  assert.equal(variants.hero, 2, 'hero offers two densities of one composition, not two compositions');
  assert.equal(variants['item-grid'], 3, 'the item shapes are the one place real compositional choice already existed');

  // The sections with no choice at all. `cta` is the "dark closing rectangle":
  // it renders through the same GenericSection DOM as every other section and
  // is told apart only by a class, so no direction can change what the closing
  // ask is made of. This assertion is expected to change when a CTA family
  // lands — and changing it should be a deliberate act with evidence, which is
  // why it is written down rather than left implicit.
  // `cta` used to be here. It now has a composition family of its own — see
  // `CTA_COMPOSITIONS` — which is why it is asserted separately below rather
  // than listed among the section types that still have no choice at all.
  for (const type of ['gallery', 'contact-panel', 'enquiry-form', 'rich-text']) {
    assert.equal(variants[type], 0, `${type} has no compositional axis, which is the finding rather than an oversight`);
  }
});

test('the action family is a family and not a token', () => {
  // Five implementations, and none of them reachable by changing a token. A
  // treatment that differed only by radius or colour would be a restyle, and
  // `structuralSignature` deliberately excludes tokens so that a recoloured
  // candidate cannot claim to be a different one.
  assert.deepEqual([...ACTION_TREATMENTS], ['solid', 'outlined', 'underline', 'arrow', 'block']);

  // The default is what every build rendered before the axis existed, so a
  // project that names no treatment renders exactly what it rendered before.
  assert.equal(DEFAULT_COMPOSITION_DIMENSIONS.actionTreatment, 'solid');
});

test('the closing ask is a composition family and not a repaint', () => {
  assert.deepEqual([...CTA_COMPOSITIONS], ['panel', 'editorial', 'banner', 'register']);
  // `panel` is what every build rendered before the axis, so an unchanged
  // project renders an unchanged closing ask.
  assert.equal(DEFAULT_COMPOSITION_DIMENSIONS.ctaComposition, 'panel');

  const css = read('templates/shared/presentation/styles.css');
  // Each composition has to drop something the panel has, not tint it. A member
  // that only changed `background` would be a token wearing a family's name.
  assert.match(css, /\.cta-section\.cta-editorial[\s\S]{0,260}background:\s*none/, 'editorial must have no panel at all');
  assert.match(css, /\.cta-section\.cta-banner[\s\S]{0,260}margin-inline:\s*0/, 'banner must run edge to edge rather than sit inset');
  assert.match(css, /\.cta-section\.cta-register[\s\S]{0,320}border-top/, 'register must be a ruled row rather than a filled panel');

  // The panel hands its actions inverse ink. A composition without the dark
  // ground that kept it would render the ask invisible — the exact defect the
  // action family shipped and had to be fixed for.
  assert.match(css, /cta-editorial \.action-link[\s\S]{0,200}color:\s*var\(--color-accent\)/, 'a light composition must re-colour its actions');
});

test('the closing-ask composition changes the DOM, not only the class', () => {
  const source = read('templates/astro-static-content/files/src/components/Section.astro');
  assert.match(source, /data-cta-composition=\{CTA_COMPOSITION\}/, 'the rendered composition must be inspectable');
  // Structure the other compositions do not have. If every branch emitted the
  // same children, this would be a class swap and the reviews would keep
  // describing the same closing rectangle.
  assert.match(source, /CTA_COMPOSITION === 'register' && <span class="cta-rule"/, 'register carries a rule element');
  assert.match(source, /CTA_COMPOSITION === 'banner' \?[\s\S]{0,200}cta-inner/, 'banner needs an inner container because it is edge to edge');
  // And the ask still says the same thing in every composition.
  const bodies = source.match(/editable\(section, title\)/g) ?? [];
  assert.ok(bodies.length >= 2, 'every composition must render the same heading binding');
});

test('the opening composes even when there is no photograph to place', () => {
  assert.deepEqual([...HERO_COMPOSITIONS], ['stacked', 'columns', 'statement', 'centred']);
  assert.equal(DEFAULT_COMPOSITION_DIMENSIONS.heroComposition, 'stacked');

  const source = read('templates/astro-static-content/files/src/components/Section.astro');
  assert.match(source, /data-hero-composition=\{HERO_COMPOSITION\}/, 'the rendered opening composition must be inspectable');
  assert.match(source, /hero-compose-\$\{HERO_COMPOSITION\}/, 'the composition must reach the class list');

  const css = read('templates/shared/presentation/styles.css');
  // The point of this axis is that it works without a `lead` asset, so the
  // rules must not be scoped behind the image-carrying classes.
  assert.match(css, /\.hero-compose-columns[\s\S]{0,400}grid-template-columns/, 'columns must be a two-column opening');
  assert.match(css, /\.hero-compose-statement[\s\S]{0,240}font-size:\s*clamp/, 'statement must change the display scale, not the colour');
  assert.match(css, /\.hero-compose-centred[\s\S]{0,320}margin-inline:\s*auto/, 'centred must actually centre');
  // `heroStrategy` styles the same element — `hero-utility` makes it a
  // two-column grid — and the two axes compose. A composition that does not set
  // its own layout inherits the strategy's, which rendered centred copy with
  // the ask floating beside it at mid-height: neither composition.
  assert.match(
    css,
    /\.hero-compose-centred \.hero-copy-column \{[^}]*display:\s*flex/,
    'a composition must restate the layout properties it owns, or a strategy that also styles the copy column wins',
  );
  // A two-column opening squeezed onto a phone is the "desktop with fewer
  // columns" mobile this repository refuses elsewhere.
  assert.match(css, /max-width:\s*899px[\s\S]{0,200}hero-compose-columns[\s\S]{0,120}display:\s*block/, 'columns must collapse on a phone deliberately');
});

test('the family reaches the structural signature, so two candidates can differ by it', () => {
  const base = { id: 'a', artDirection: { dimensions: { ...DEFAULT_COMPOSITION_DIMENSIONS } } };
  const other = { id: 'b', artDirection: { dimensions: { ...DEFAULT_COMPOSITION_DIMENSIONS, actionTreatment: 'underline' } } };
  const composition = { pages: [], sections: [] };

  const one = structuralSignature({ direction: base, composition });
  const two = structuralSignature({ direction: other, composition });
  assert.equal(one.axes.actionTreatment, 'solid');
  assert.equal(two.axes.actionTreatment, 'underline');
  assert.equal(one.axes.ctaComposition, 'panel', 'the closing ask must be part of what makes two candidates different');
  assert.notDeepEqual(one.axes, two.axes, 'a different action family must register as a structural difference');
});

test('every direction chooses a closing-ask composition, and the candidate set spans them', () => {
  const directions = json('config/visual-directions.json').directions;
  const chosen = Object.entries(directions).map(([id, direction]) => {
    const value = direction.composition?.ctaComposition;
    assert.ok(CTA_COMPOSITIONS.includes(value), `${id} names an unknown closing-ask composition: ${value}`);
    return value;
  });
  assert.ok(new Set(chosen).size >= 3, `directions must span the family, got ${new Set(chosen).size}`);

  // The three directions NBM can actually produce — immersive-lead is refused
  // without photography — must not share a closing ask, or the candidate set
  // is diverse everywhere except the place a visitor looks last.
  const nbm = ['structured-practice', 'editorial-authority', 'schedule-register']
    .map((id) => directions[id].composition.ctaComposition);
  assert.equal(new Set(nbm).size, 3, `the three imagery-free directions close identically: ${nbm.join(', ')}`);

  // And they must open three different ways too, for the same reason.
  const openings = ['structured-practice', 'editorial-authority', 'schedule-register']
    .map((id) => directions[id].composition.heroComposition);
  assert.equal(new Set(openings).size, 3, `the three imagery-free directions open identically: ${openings.join(', ')}`);
});

test('every direction chooses an action family, and they are not all the same one', () => {
  const directions = json('config/visual-directions.json').directions;
  const chosen = Object.entries(directions).map(([id, direction]) => {
    const treatment = direction.composition?.actionTreatment;
    assert.ok(treatment, `${id} names no action family`);
    assert.ok(ACTION_TREATMENTS.includes(treatment), `${id} names an action family that does not exist: ${treatment}`);
    return treatment;
  });
  // The whole point is that candidates stop arriving with the same control.
  // Directions sharing a treatment is allowed; every direction sharing one is
  // the state this axis was added to end.
  assert.ok(new Set(chosen).size >= 4, `directions must span the family, got ${new Set(chosen).size} distinct treatments`);
});

test('a treatment that is not a button does not carry the button class', () => {
  // The defect this prevents is subtle and was the actual mechanism: a text
  // link with `class="button"` inherits the pill styling above it, so a
  // direction that asked for an editorial link still rendered a filled control
  // and every candidate looked alike.
  for (const source of [
    read('templates/react-vite-neutral/files/src/App.tsx'),
    read('templates/astro-static-content/files/src/components/Actions.astro'),
  ]) {
    assert.match(source, /action-link/, 'a non-boxed treatment needs its own class rather than the control class');
    assert.match(source, /boxed|BOXED/, 'the renderer must decide per treatment whether this is a control at all');
    // Element identity survives every treatment, or the Builder can no longer
    // address the action it could address yesterday.
    assert.match(source, /data-element-key=\{?`action:\$\{index\}`\}?/, 'element identity must survive the treatment');
  }
});

test('both renderers agree about the family', () => {
  // A promoted direction that looked like one thing in the React preview and
  // another in the shipped static build is the class of defect `renderingSource`
  // exists to catch after the fact. Two renderers disagreeing about what a call
  // to action is made of would introduce it on purpose.
  const react = read('templates/react-vite-neutral/files/src/App.tsx');
  const astro = read('templates/astro-static-content/files/src/components/Actions.astro');
  for (const treatment of ACTION_TREATMENTS) {
    assert.ok(react.includes(`'${treatment}'`), `the React renderer does not know the ${treatment} treatment`);
    assert.ok(astro.includes(`'${treatment}'`), `the static renderer does not know the ${treatment} treatment`);
  }
  for (const source of [react, astro]) {
    assert.match(source, /action-arrow[\s\S]{0,80}aria-hidden/, 'the arrow is decoration and must be hidden from assistive technology');
  }
});

/**
 * The gap that let a broken axis reach CI.
 *
 * `npm run check` typechecks the Console workspace; the generated projects are
 * typechecked by `npm run benchmark:acceptance`, which installs and builds and
 * therefore only runs hosted. So a new dimension added to the contract but not
 * to the template's own `VisualDirection` type passed every local gate and
 * failed six generated projects in CI with `Property 'actionTreatment' does not
 * exist`. This is that check, made local and cheap.
 */
test('every template type knows every composition dimension the contract can send it', () => {
  // Both renderers, because a marketing site is rendered by the static one and
  // an application by the React one. A dimension added to only one of them is a
  // direction that means something on half the products.
  for (const file of [
    'templates/react-vite-neutral/files/src/App.tsx',
    'templates/astro-static-content/files/src/lib/composition.ts',
  ]) {
    const declared = read(file).match(/dimensions\?:\s*\{([^}]*)\}/);
    assert.ok(declared, `${file} must declare the dimensions it is willing to read`);
    for (const axis of Object.keys(DEFAULT_COMPOSITION_DIMENSIONS)) {
      assert.ok(
        declared[1].includes(`${axis}?:`),
        `${file} does not list ${axis}, so every generated project fails its own tsc the moment a direction sends it.`,
      );
    }
  }
});

/**
 * The defect that cost this axis a whole hosted round trip.
 *
 * `Actions.astro` read the direction off the *composition* module. The
 * composition carries pages, sections and bindings; the direction lives on the
 * design module, which is where `Section.astro` and `SiteLayout.astro` read
 * theirs. So the lookup returned undefined, the treatment fell back to `solid`,
 * and the axis reached the candidate signature, the diversity gate and the
 * review packet while all three candidates still rendered the same filled pill.
 *
 * Nothing failed. CI was green and `report.json` reported three different
 * families. Only the screenshots disagreed.
 */
test('a renderer reads the direction from the module that carries it', () => {
  for (const file of [
    'templates/astro-static-content/files/src/components/Actions.astro',
    'templates/astro-static-content/files/src/components/Section.astro',
  ]) {
    const source = read(file);
    if (!/artDirection\?\.dimensions/.test(source)) continue;
    assert.match(
      source,
      /import \{ design \} from '\.\.\/generated\/design'/,
      `${file} reads artDirection but does not import the design module. The composition does not carry the direction, so the lookup silently returns undefined and the axis renders as its default.`,
    );
  }
});

test('the stylesheet gives every treatment something a token could not', () => {
  const css = read('templates/shared/presentation/styles.css');
  // Each treatment has to be different in a way `--layout-radius` and
  // `--color-accent` cannot express, or it is a skin wearing a family's name.
  assert.match(css, /\.button\.action-outlined[\s\S]*?background:\s*transparent/, 'outlined must drop the fill');
  assert.match(css, /\.button\.action-block[\s\S]*?width:\s*100%/, 'block must change the footprint, not the colour');
  assert.match(css, /\.action-link\.action-underline[\s\S]*?border-bottom/, 'underline must be a rule under text rather than a box');
  assert.match(css, /prefers-reduced-motion[\s\S]*?action-arrow/, 'the arrow movement must be dropped under reduced motion');

  // The rank rules set a background without requiring `.button`, because every
  // action used to be one. A text treatment that does not reset them renders as
  // a filled box with an arrow after it, which is the family reaching the DOM
  // and changing nothing a visitor sees.
  assert.match(
    css,
    /\.action-link\.primary-action[\s\S]{0,200}background:\s*none/,
    'a text treatment must clear the rank background it would otherwise inherit',
  );

  // Every treatment has to stay readable on the dark closing panel. The first
  // version of the reset covered `.action-link` and left `.action-outlined`
  // dark-on-black, so the secondary ask in the closing panel was effectively
  // invisible — a family that can put an unreadable control on the page is not
  // ready to be chosen.
  for (const treatment of ['action-outlined', 'action-block']) {
    assert.match(
      css,
      new RegExp(`\\.cta-section[^{]*\\.${treatment}[\\s\\S]{0,240}color:\\s*var\\(--color-text-inverse\\)`),
      `${treatment} must take the closing panel's inverse ink, or it renders dark on a dark ground`,
    );
  }
});
