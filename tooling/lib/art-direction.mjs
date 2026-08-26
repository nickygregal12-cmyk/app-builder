/**
 * ArtDirectionPlan — the presentation decisions that sit above tokens.
 *
 * Six project types previously produced six versions of the same page with a
 * different measure and corner radius. Everything that makes an editorial site
 * read differently from an internal tool — how much a page changes ground as it
 * scrolls, how much room the opening claims, how much the product is allowed to
 * move — was fixed in the template.
 *
 * The dimensions here are the ones the repository already named. Each one
 * compiles to something a renderer consumes; a dimension nobody reads would be
 * a knob on a picture of a machine.
 *
 *   informationDensity   -> --section-space          (the existing density control)
 *   layoutVariance       -> --section-alt-ground     (whether a page changes ground)
 *   visualDistinctiveness-> --hero-scale, --display-measure
 *   motionIntensity      -> the MotionContract, and every motion token
 *   restraintLevel       -> a ceiling over the three above
 *
 * `restraintLevel` is the one that is not a value but a policy. A dense
 * internal tool wants hover feedback and no flourish; declaring the intent and
 * the ceiling separately means the ceiling is recorded and auditable rather
 * than pre-applied by whoever wrote the config.
 */

import { DEFAULT_MOTION_INTENSITY, MOTION_INTENSITY_ORDER, compileMotionContract } from './motion-contract.mjs';

export const LAYOUT_VARIANCE_ORDER = Object.freeze(['uniform', 'alternating', 'varied']);
export const VISUAL_DISTINCTIVENESS_ORDER = Object.freeze(['restrained', 'balanced', 'expressive']);
export const RESTRAINT_LEVELS = Object.freeze(['high', 'medium', 'low']);

export const LAYOUT_VARIANCE = Object.freeze({
  uniform: Object.freeze({ label: 'Uniform', purpose: 'Every section sits on the same ground. Best where a page is worked in, not read.', altGround: 'transparent' }),
  alternating: Object.freeze({ label: 'Alternating', purpose: 'Sections alternate onto a tinted ground so the page has a rhythm.', altGround: 'var(--color-accent-soft)' }),
  varied: Object.freeze({ label: 'Varied', purpose: 'A stronger ground change, so a long read is broken into passages.', altGround: 'var(--color-surface-muted)' }),
});

export const VISUAL_DISTINCTIVENESS = Object.freeze({
  restrained: Object.freeze({ label: 'Restrained', purpose: 'The opening behaves like any other section.', heroScale: '1.05', displayMeasure: '22ch' }),
  balanced: Object.freeze({ label: 'Balanced', purpose: 'The opening claims some extra room.', heroScale: '1.3', displayMeasure: '16ch' }),
  expressive: Object.freeze({ label: 'Expressive', purpose: 'The opening is the point of the page and is sized like it.', heroScale: '1.65', displayMeasure: '13ch' }),
});

/**
 * What each restraint level refuses.
 *
 * A ceiling is a maximum, never a minimum: restraint can only reduce. It cannot
 * push a quiet internal tool into moving more than its own plan asked for.
 */
const CEILINGS = Object.freeze({
  high: Object.freeze({ motionIntensity: 'subtle', layoutVariance: 'alternating', visualDistinctiveness: 'balanced' }),
  medium: Object.freeze({ motionIntensity: 'moderate', layoutVariance: 'varied', visualDistinctiveness: 'expressive' }),
  low: Object.freeze({}),
});

const SCALES = Object.freeze({
  motionIntensity: MOTION_INTENSITY_ORDER,
  layoutVariance: LAYOUT_VARIANCE_ORDER,
  visualDistinctiveness: VISUAL_DISTINCTIVENESS_ORDER,
});

export const DEFAULT_ART_DIRECTION = Object.freeze({
  layoutVariance: 'alternating',
  motionIntensity: DEFAULT_MOTION_INTENSITY,
  visualDistinctiveness: 'balanced',
  restraintLevel: 'medium',
});

function onScale(dimension, value, fallback) {
  return SCALES[dimension].includes(value) ? value : fallback;
}

/**
 * Resolve the plan a build presents by, and record what restraint took off it.
 *
 * `clamped` is part of the output rather than a log line, because a reviewer
 * looking at a quiet build needs to be able to tell "this was asked for" from
 * "this was cut back".
 */
export function compileArtDirectionPlan(intent = {}) {
  const declared = {
    layoutVariance: onScale('layoutVariance', intent.layoutVariance, DEFAULT_ART_DIRECTION.layoutVariance),
    motionIntensity: onScale('motionIntensity', intent.motionIntensity, DEFAULT_ART_DIRECTION.motionIntensity),
    visualDistinctiveness: onScale('visualDistinctiveness', intent.visualDistinctiveness, DEFAULT_ART_DIRECTION.visualDistinctiveness),
  };
  const restraintLevel = RESTRAINT_LEVELS.includes(intent.restraintLevel) ? intent.restraintLevel : DEFAULT_ART_DIRECTION.restraintLevel;
  const ceiling = CEILINGS[restraintLevel];

  const dimensions = { ...declared, restraintLevel };
  const clamped = [];
  for (const [dimension, limit] of Object.entries(ceiling)) {
    const scale = SCALES[dimension];
    if (scale.indexOf(declared[dimension]) <= scale.indexOf(limit)) continue;
    dimensions[dimension] = limit;
    clamped.push({ dimension, declared: declared[dimension], applied: limit, reason: `restraintLevel ${restraintLevel}` });
  }

  return {
    schemaVersion: 1,
    authority: 'design-contract',
    dimensions,
    clamped,
    motion: compileMotionContract(dimensions.motionIntensity),
  };
}

/**
 * Read the intent a layout pattern declares.
 *
 * `informationDensity` is not read here: the pattern's `density` already is
 * that dimension, and it is a control a person can change. Restating it would
 * give the build two places to disagree about the same rhythm.
 */
export function artDirectionIntent(pattern = {}) {
  return { ...DEFAULT_ART_DIRECTION, ...(pattern.artDirection ?? {}) };
}

/** The custom properties the template stylesheet reads for composition and rhythm. */
export function artDirectionTokens(plan) {
  const variance = LAYOUT_VARIANCE[plan?.dimensions?.layoutVariance] ?? LAYOUT_VARIANCE[DEFAULT_ART_DIRECTION.layoutVariance];
  const distinctiveness = VISUAL_DISTINCTIVENESS[plan?.dimensions?.visualDistinctiveness] ?? VISUAL_DISTINCTIVENESS[DEFAULT_ART_DIRECTION.visualDistinctiveness];
  return {
    '--section-alt-ground': variance.altGround,
    '--hero-scale': distinctiveness.heroScale,
    '--display-measure': distinctiveness.displayMeasure,
  };
}
