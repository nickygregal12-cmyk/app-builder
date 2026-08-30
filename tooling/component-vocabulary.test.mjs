import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ACTION_TREATMENTS, CTA_COMPOSITIONS, HERO_COMPOSITIONS, PANEL_GRAMMARS, TYPOGRAPHY_STRATEGIES, DEFAULT_COMPOSITION_DIMENSIONS, structuralSignature } from './lib/visual-direction.mjs';

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

test('typographic character is a category change, not a size change', () => {
  assert.deepEqual([...TYPOGRAPHY_STRATEGIES], ['neutral', 'editorial', 'technical', 'bold']);
  assert.equal(DEFAULT_COMPOSITION_DIMENSIONS.typographyStrategy, 'neutral');

  const css = read('templates/shared/presentation/styles.css');
  // The point is the pairing category. A strategy that only moved the scale
  // would be the thing the previous candidate sets already varied without
  // changing how any of them read.
  assert.match(css, /\.type-editorial \{[^}]*--font-display:[^;]*serif/, 'editorial must actually change the display family to a serif');
  assert.match(css, /\.type-technical \{[^}]*--font-display:[^;]*mono/, 'technical must actually change the display family to a mono');
  // And each still has to carry its own scale/weight/tracking/measure, or it is
  // a typeface swap rather than a strategy.
  for (const strategy of ['editorial', 'technical', 'bold']) {
    const block = css.match(new RegExp(`\\.type-${strategy} \\{([^}]*)\\}`));
    assert.ok(block, `${strategy} declares no token block`);
    for (const token of ['--display-weight', '--display-tracking', '--display-leading', '--display-measure']) {
      assert.ok(block[1].includes(token), `${strategy} does not set ${token}`);
    }
  }

  // No font bytes may enter a generated repository: nothing to license, nothing
  // to preload, no layout shift, no network dependency in the output.
  assert.doesNotMatch(css, /@font-face|fonts\.googleapis|fonts\.gstatic/, 'the typography families must stay on system stacks');
});

/**
 * The middle of the page.
 *
 * The last thing the v4 critic named that had not been paid — "thin dividers
 * and one card grammar" — and the one that already had an axis. `gridFamily`
 * reached the stylesheet and nothing else, so all four grammars re-laid out one
 * DOM. The result was only ever visible in a screenshot: `editorial-rows` and
 * `schedule-rows` both compiled to a numbered three-column ruled row, so two of
 * the three imagery-free nbm candidates presented an identical middle in
 * different typefaces. Nothing failed. This is that finding, made a check.
 */
test('a panel grammar emits its own structure rather than re-laying out one DOM', () => {
  assert.deepEqual([...PANEL_GRAMMARS], ['symmetric', 'asymmetric', 'editorial-rows', 'schedule-rows']);
  // `symmetric` is what every build rendered before the grammar reached the
  // DOM, so a project that names none is unchanged.
  assert.equal(DEFAULT_COMPOSITION_DIMENSIONS.gridFamily, 'symmetric');

  for (const source of [
    read('templates/react-vite-neutral/files/src/App.tsx'),
    read('templates/astro-static-content/files/src/components/Items.astro'),
  ]) {
    // Structure one grammar has and the others do not. If every branch emitted
    // the same children this would be a class swap, and the reviews would keep
    // describing the same ruled rows.
    assert.match(source, /panel-lede/, 'the editorial grammar needs a wrapper that lets the body sit under the title');
    assert.match(source, /panel-index/, 'the register needs its index in the document, not drawn by the stylesheet');
    assert.match(source, /panel-support/, 'the showcase needs its lead to be a sibling of the supporting group');
    assert.match(source, /<ol/, 'the register is an ordered list, because an entry’s position is part of what it says');
    // The item keeps its component identity in every grammar, or element
    // identity, DesignLint and the distinctive-moment contract stop addressing
    // the thing they were written against.
    assert.match(source, /content-card/, 'the item must keep its component identity across grammars');
    assert.match(source, /data-panel-grammar/, 'the rendered grammar must be inspectable');
  }
});

test('a grammar the content cannot carry is refused rather than rendered badly', () => {
  // A showcase needs something to be dominant *with* and something to be
  // dominant *over*. Rendering the declared grammar faithfully for one thin
  // item produces a lead panel with nothing beside it: a page that reads as
  // broken rather than art-directed.
  for (const source of [
    read('templates/react-vite-neutral/files/src/App.tsx'),
    read('templates/astro-static-content/files/src/lib/composition.ts'),
  ]) {
    assert.match(source, /length >= 3 && detailed \? 'asymmetric' : 'symmetric'/, 'the showcase must be refused for a set that cannot carry it');
  }
});

test('the grammar reaches the block that used to be outside it', () => {
  // The contact panel is a set of rows in the middle of the page like any
  // other, and it was the only one no grammar answered. Two directions that
  // differed in their opening, their items, their closing ask and their
  // typeface still presented the same four white boxes in the lower half.
  for (const source of [
    read('templates/react-vite-neutral/files/src/App.tsx'),
    read('templates/astro-static-content/files/src/components/Section.astro'),
  ]) {
    assert.match(source, /contact-section panel-\$\{DECLARED_GRAMMAR\}/, 'the contact panel must carry the declared grammar');
  }
  const css = read('templates/shared/presentation/styles.css');
  for (const grammar of ['editorial-rows', 'schedule-rows', 'asymmetric']) {
    assert.match(
      css,
      new RegExp(`\\.contact-section\\.panel-${grammar} \\.contact-grid`),
      `the contact panel has no ${grammar} treatment, so that direction closes on the default boxes`,
    );
  }
});

test('the stylesheet gives every grammar something a token could not', () => {
  const css = read('templates/shared/presentation/styles.css');
  // Each grammar has to drop or add structure, not tint it. A grammar
  // reachable by changing `--layout-radius` would be a token wearing a
  // family's name, and `structuralSignature` excludes tokens for that reason.
  assert.match(css, /\.panel-editorial-rows > \.content-card[\s\S]{0,320}border-top:\s*1px/, 'editorial entries are separated by a hairline rather than boxed');
  assert.match(css, /\.panel-editorial-rows \.panel-detail \{[^}]*max-width/, 'an editorial entry sets its own reading measure');
  assert.match(css, /\.panel-schedule-rows > \.content-card[\s\S]{0,320}grid-template-columns:\s*4\.5rem/, 'a register reads across in named columns');
  assert.match(css, /\.panel-asymmetric \{[^}]*grid-template-columns/, 'a showcase gives its lead a different share of the width');
  // And the two that used to be the same must not be the same again.
  const editorial = css.match(/\.panel-editorial-rows > \.content-card \{([^}]*)\}/);
  const register = css.match(/\.panel-schedule-rows > \.content-card \{([^}]*)\}/);
  assert.ok(editorial && register, 'both grammars must declare their own entry rule');
  assert.notEqual(
    editorial[1].replace(/\s+/g, ' ').trim(),
    register[1].replace(/\s+/g, ' ').trim(),
    'the editorial and register grammars declare the same entry, which is the convergence this family exists to end',
  );
});

/**
 * The defect this axis shipped, found in a screenshot and nowhere else.
 *
 * The contact panel carries the grammar on its own `<section>`, and the
 * register's container reset — `padding: 0`, entirely correct for the `<ol>`
 * it was written for — matched that section too. The section lost its page
 * gutter and its rows ran to the window edge. Every test passed.
 */
test('a grammar rule cannot take the page gutter off the section that carries it', () => {
  const css = read('templates/shared/presentation/styles.css');
  for (const grammar of ['editorial-rows', 'schedule-rows', 'asymmetric']) {
    assert.doesNotMatch(
      css,
      new RegExp(`(^|\\})\\s*\\.panel-${grammar} \\{`, 'm'),
      `.panel-${grammar} is declared unscoped, so it styles the section that carries the same class as well as the container it was written for`,
    );
  }
});

test('every grammar says what it does on a phone', () => {
  const css = read('templates/shared/presentation/styles.css');
  // Not accidental wrapping. Each grammar states its own mobile behaviour, and
  // the one thing each must not lose is the thing that makes it that grammar.
  assert.match(css, /max-width:\s*880px[\s\S]*?\.panel-schedule-rows \.panel-index \{[^}]*grid-column:\s*1/, 'a register keeps its index on a phone');
  assert.match(css, /max-width:\s*880px[\s\S]*?\.panel-editorial-rows \.panel-lede h3[^}]*font-size/, 'an editorial entry keeps its rhythm rather than inheriting a narrower desktop');
  assert.match(css, /max-width:\s*880px[\s\S]*?\.panel-asymmetric \{[^}]*grid-template-columns:\s*1fr/, 'a showcase becomes an ordered stack');
});

test('every direction chooses a panel grammar, and the imagery-free set spans them', () => {
  const directions = json('config/visual-directions.json').directions;
  for (const [id, direction] of Object.entries(directions)) {
    const grammar = direction.composition?.gridFamily;
    assert.ok(PANEL_GRAMMARS.includes(grammar), `${id} names a panel grammar that does not exist: ${grammar}`);
  }
  // The three directions nbm can actually produce — immersive-lead is refused
  // without photography — must not share a middle, or the candidate set is
  // diverse at its opening and its closing and the same in between.
  const nbm = ['structured-practice', 'editorial-authority', 'schedule-register']
    .map((id) => directions[id].composition.gridFamily);
  assert.equal(new Set(nbm).size, 3, `the three imagery-free directions present the same middle: ${nbm.join(', ')}`);
});

test('an external source may only name roles that exist and actually design', () => {
  const sources = json('config/external-sources.json').sources;
  const roles = new Set(Object.keys(json('config/agent-roles.json').roles));
  // Reviewers are deliberately excluded from design prior art: a critic that
  // read the same catalogue as the producer is a weaker critic, which is the
  // separation rule 17 exists for.
  const reviewers = new Set(['visual-critic', 'design-critic', 'independent-second-opinion', 'red-team', 'product-critic', 'ux-critic', 'ia-critic']);
  for (const [id, source] of Object.entries(sources)) {
    for (const role of source.allowedRoles ?? []) {
      assert.ok(roles.has(role), `${id} grants itself to "${role}", which is not a role in config/agent-roles.json`);
      assert.ok(!reviewers.has(role), `${id} grants design prior art to the reviewer role "${role}"`);
    }
    // A source that may be loaded has to be pinned and licensed first.
    if ((source.allowedRoles ?? []).length) {
      assert.ok(source.pinnedRef, `${id} is loadable but is not pinned to a commit`);
      assert.ok(source.license, `${id} is loadable but records no licence`);
      assert.equal(source.evaluationStatus, 'evaluated', `${id} is loadable but was never evaluated`);
    }
  }
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
