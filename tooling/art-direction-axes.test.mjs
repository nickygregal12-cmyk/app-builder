/**
 * An art-direction axis either renders or it must not count.
 *
 * `layoutVariance`, `visualDistinctiveness` and `motionIntensity` were recorded
 * in every candidate signature and counted by the diversity gate, and reached
 * the stylesheet in no form at all. The composition plane needs two differing
 * axes to call a pair structurally different, and three of the ten it counts
 * were invisible — so a candidate set could be certified diverse over planes a
 * visitor cannot see. Two independent reviews then described two supposedly
 * different directions in almost the same words, as a competent
 * professional-services template.
 *
 * This is the same defect as a distinctive moment that renders as a corner
 * numeral: a declaration with a consumer that does not consume it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { visualDirectionClasses } from './lib/visual-direction.mjs';

const directions = JSON.parse(fs.readFileSync('config/visual-directions.json', 'utf8'));
const stylesheet = fs.readFileSync('templates/shared/presentation/styles.css', 'utf8');

/**
 * The axes the diversity gate counts, and the class prefix each compiles to.
 *
 * `informationDensity` and `layoutFamily` are absent deliberately: they compile
 * to tokens and to a layout pattern rather than to a shell class, and both are
 * visible in the built output by other means.
 */
const COUNTED_AXIS_PREFIX = Object.freeze({
  heroStrategy: 'hero-',
  gridFamily: 'grid-',
  headingTreatment: 'headings-',
  ctaPlacement: 'cta-',
  distinctiveMoment: 'moment-',
  layoutVariance: 'variance-',
  visualDistinctiveness: 'distinct-',
  motionIntensity: 'motion-',
});

function valuesUsedFor(axis) {
  const used = new Set();
  for (const direction of Object.values(directions.directions)) {
    const value = direction.composition?.[axis] ?? direction.artDirection?.[axis];
    if (value) used.add(value);
  }
  return [...used];
}

function styled(prefix, value) {
  return stylesheet.includes(`.${prefix}${value}`);
}

test('every axis the diversity gate counts reaches the stylesheet', () => {
  for (const [axis, prefix] of Object.entries(COUNTED_AXIS_PREFIX)) {
    const used = valuesUsedFor(axis);
    assert.ok(used.length, `no direction declares ${axis}`);
    const rendered = used.filter((value) => styled(prefix, value));
    // One value may legitimately be the unstyled base — `grid-symmetric` is the
    // grid every other family departs from. What is forbidden is an axis where
    // nothing renders, because then every difference along it is invisible and
    // the gate is counting noise.
    assert.ok(
      rendered.length > 0,
      `${axis} is counted for candidate diversity and no value it takes renders. `
      + `Declared: ${used.join(', ')}. Either implement it or stop counting it.`,
    );
  }
});

test('an axis with several declared values distinguishes at least two of them', () => {
  for (const [axis, prefix] of Object.entries(COUNTED_AXIS_PREFIX)) {
    const used = valuesUsedFor(axis);
    if (used.length < 2) continue;
    const rendered = used.filter((value) => styled(prefix, value));
    assert.ok(
      rendered.length >= 1,
      `${axis} takes ${used.length} values and none renders`,
    );
    // With one styled value and one bare base the pair is still visibly
    // different. With none styled it is not, which the first test catches.
  }
});

test('the shell carries every counted axis, so the stylesheet can reach it', () => {
  const classes = visualDirectionClasses({
    id: 'structured-practice',
    artDirection: {
      dimensions: {
        heroStrategy: 'split',
        gridFamily: 'symmetric',
        headingTreatment: 'ruled',
        ctaPlacement: 'closing',
        distinctiveMoment: 'figure-index',
        layoutVariance: 'alternating',
        visualDistinctiveness: 'balanced',
        motionIntensity: 'subtle',
      },
      responsive: { mobileHero: 'copy-first', navigation: 'inline-wrap', mobileSectionOrder: 'as-desktop', mobileDensity: 'as-desktop', mobileMotion: 'as-desktop' },
    },
    shellClass: 'layout-public',
  });
  for (const expected of ['variance-alternating', 'distinct-balanced', 'motion-subtle']) {
    assert.match(classes, new RegExp(`\\b${expected}\\b`), `${expected} must reach the shell or its rules can never match`);
  }
});

test('a direction that asks for stillness is not given movement', () => {
  // The one motion value with a hard guarantee rather than a taste: `none`
  // must actually suppress transitions, including ones other rules set.
  const rule = stylesheet.split('\n').find((line) => line.startsWith('.motion-none'));
  assert.ok(rule, 'motion-none has no implementation');
  assert.match(rule, /transition:\s*none/);
  assert.match(rule, /!important/, 'it has to out-rank the transitions the base components set');
});
