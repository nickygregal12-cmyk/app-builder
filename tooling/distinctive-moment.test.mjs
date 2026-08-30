/**
 * A distinctive moment is an art-direction commitment, not a lucky selector.
 *
 * `figure-index` used to be implemented twice at different strengths: a 62px
 * index gutter on `.plain-list`, and a `--text-sm` numeral in the corner of a
 * `.content-card` that changed no layout at all. Both are valid presentations
 * of the same section, and the content decides which one composes. So when the
 * frozen knowledge pack gave services real descriptions, the item grid
 * legitimately moved from a list to cards and the direction's defining device
 * quietly became decoration. The independent review that followed reported no
 * distinctive moment at all, and the score for that criterion fell 4.6 -> 2.5.
 *
 * Nothing was broken in a way any test could see, which is the point of these.
 * The variant list is read from the template's own component manifest rather
 * than restated, so adding a variant to a section immediately fails every
 * moment that has not answered it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const directions = JSON.parse(fs.readFileSync('config/visual-directions.json', 'utf8'));
const template = JSON.parse(fs.readFileSync('templates/react-vite-neutral/template.json', 'utf8'));
const stylesheet = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');

/**
 * Which element a variant renders as.
 *
 * The template owns this and expresses it in JSX rather than in data, so it is
 * named here and then checked against the renderer below. A mapping that
 * drifted from the component would let this whole file pass over selectors
 * that match nothing.
 */
const VARIANT_ELEMENT = Object.freeze({
  cards: '.content-card',
  list: '.plain-list',
  features: '.feature-list',
  // Both hero variants render the same copy element; the variant changes the
  // surrounding scale, not what a moment attaches to.
  primary: '.hero-copy',
  compact: '.hero-copy',
});

// Properties that reserve space in the layout a reader sees. A moment that
// sets none of these is painting a mark, not composing.
const RESERVES_LAYOUT = /(^|[;{\s])(padding|padding-[a-z]+|margin|margin-[a-z]+|grid-template-[a-z]+|display|column-gap|row-gap|gap|border-[a-z]*-?width|border-bottom|border-left|border-top|border-right|min-height|height|width)\s*:/;

/** Every `selector { body }` rule in the shared stylesheet. */
function rules(css) {
  const found = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(css))) found.push({ selector: match[1].trim(), body: match[2].trim() });
  return found;
}

const ALL_RULES = rules(stylesheet);

function rulesFor(momentId, elementClass) {
  return ALL_RULES.filter((rule) => rule.selector.includes(`.moment-${momentId}`) && rule.selector.includes(elementClass));
}

function variantsOf(sectionType) {
  // The template keys its components by section type, which is the same key a
  // composition uses, so this cannot drift apart from what actually renders.
  const component = (template.presentation?.components ?? template.components ?? {})[sectionType];
  assert.ok(component, `the template declares no component for section type ${sectionType}`);
  return (component.variants ?? []).map((variant) => variant.id);
}

const moments = Object.fromEntries(Object.entries(directions.distinctiveMoments).filter(([key]) => key !== '__doc'));

test('the variant-to-element mapping still matches what the renderer emits', () => {
  // If this drifts, every coverage assertion below silently checks nothing.
  const app = fs.readFileSync('templates/react-vite-neutral/files/src/App.tsx', 'utf8');
  for (const [variant, element] of Object.entries(VARIANT_ELEMENT)) {
    // The class may be alone or beside the panel grammar's own class, and it
    // may be written as a literal or as a template. What matters to every
    // assertion below is that the renderer still emits it, because that is the
    // element a moment attaches to.
    assert.match(
      app,
      new RegExp(`className=(?:"|\\{\`)[^"\`]*\\b${element.slice(1)}\\b`),
      `the renderer no longer emits ${element} for ${variant}`,
    );
  }
  // The item-grid variants are the ones the renderer branches on by name.
  for (const variant of ['cards', 'list', 'features']) {
    assert.match(app, new RegExp(`'${variant}'`), `the renderer no longer knows the ${variant} variant`);
  }
});

test('every direction declares a distinctive moment the registry knows', () => {
  for (const [id, direction] of Object.entries(directions.directions)) {
    const moment = direction.composition?.distinctiveMoment;
    assert.ok(moment, `${id} declares no distinctive moment`);
    assert.ok(moments[moment], `${id} declares distinctive moment "${moment}", which no entry in distinctiveMoments describes`);
  }
});

test('a moment is implemented for every variant the sections carrying it can compile to', () => {
  for (const [momentId, moment] of Object.entries(moments)) {
    for (const [sectionType, coverage] of Object.entries(moment.carriedBy)) {
      if (coverage === 'no-variants') {
        assert.deepEqual(variantsOf(sectionType), [], `${sectionType} now has variants, so ${momentId} must say which it carries`);
        continue;
      }
      for (const variant of variantsOf(sectionType)) {
        const element = VARIANT_ELEMENT[variant];
        assert.ok(element, `no element is known for variant ${variant}`);
        const matched = rulesFor(momentId, element);
        assert.ok(
          matched.length > 0,
          `${momentId} has no implementation for the ${variant} variant of ${sectionType}. `
          + 'A direction that declares this moment and composes that variant would render without its defining device.',
        );
      }
    }
  }
});

test('a moment reserves layout in every variant, rather than painting a mark', () => {
  for (const [momentId, moment] of Object.entries(moments)) {
    for (const [sectionType, coverage] of Object.entries(moment.carriedBy)) {
      if (coverage === 'no-variants') continue;
      for (const variant of variantsOf(sectionType)) {
        const matched = rulesFor(momentId, VARIANT_ELEMENT[variant]);
        const reserves = matched.some((rule) => RESERVES_LAYOUT.test(rule.body));
        assert.ok(
          reserves,
          `${momentId} on the ${variant} variant of ${sectionType} sets no property that reserves layout. `
          + 'A corner glyph that changes no geometry is decoration, and it is what a reviewer reads as "no distinctive moment".',
        );
      }
    }
  }
});

test('figure-index survives the variant its own content earns', () => {
  // The specific regression: richer content moved services list -> cards.
  // Both forms must remain the thing a reader notices.
  for (const variant of ['list', 'cards', 'features']) {
    const matched = rulesFor('figure-index', VARIANT_ELEMENT[variant]);
    assert.ok(matched.length, `figure-index lost its ${variant} implementation`);
    const draws = matched.some((rule) => /content\s*:\s*counter\(/.test(rule.body));
    assert.ok(draws, `figure-index no longer numbers the ${variant} variant`);
    assert.ok(matched.some((rule) => RESERVES_LAYOUT.test(rule.body)), `figure-index does not reserve space in the ${variant} variant`);
  }
});
