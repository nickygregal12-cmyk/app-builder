/**
 * MotionContract — how much a generated product is allowed to move.
 *
 * The template's movement used to be typed into the stylesheet: an .18s here, a
 * .5s there, a 1.03 scale on a gallery image. That is not a policy, it is a set
 * of habits, and it meant a dense internal tool and a marketing site moved
 * identically no matter what the design said about either.
 *
 * A contract with no consumer would be no better, so every value here compiles
 * to a custom property the template stylesheet reads. Changing the intensity
 * changes what a visitor sees move.
 *
 * `prefers-reduced-motion` is not one of the bands. Honouring it is not a level
 * of expressiveness a build can trade away, so it is required at every
 * intensity and the template's reduced-motion block stands regardless.
 */

export const MOTION_INTENSITIES = Object.freeze({
  none: Object.freeze({
    label: 'None',
    purpose: 'No movement at all. State changes are instant.',
    durationFast: '0ms',
    durationSlow: '0ms',
    easing: 'linear',
    hoverLift: '0px',
    decorativeScale: '1',
  }),
  subtle: Object.freeze({
    label: 'Subtle',
    purpose: 'Movement only where it confirms an interaction happened.',
    durationFast: '120ms',
    durationSlow: '260ms',
    easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
    hoverLift: '-1px',
    decorativeScale: '1.01',
  }),
  moderate: Object.freeze({
    label: 'Moderate',
    purpose: 'The default. Interaction feedback plus a little life in imagery.',
    durationFast: '180ms',
    durationSlow: '460ms',
    easing: 'cubic-bezier(0.2, 0, 0.2, 1)',
    hoverLift: '-2px',
    decorativeScale: '1.03',
  }),
  expressive: Object.freeze({
    label: 'Expressive',
    purpose: 'Deliberate, noticeable movement. Best where the product is the pitch.',
    durationFast: '240ms',
    durationSlow: '680ms',
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    hoverLift: '-3px',
    decorativeScale: '1.06',
  }),
});

export const MOTION_INTENSITY_ORDER = Object.freeze(['none', 'subtle', 'moderate', 'expressive']);
export const DEFAULT_MOTION_INTENSITY = 'moderate';

export function compileMotionContract(intensity = DEFAULT_MOTION_INTENSITY) {
  const band = MOTION_INTENSITIES[intensity] ?? MOTION_INTENSITIES[DEFAULT_MOTION_INTENSITY];
  const resolved = MOTION_INTENSITIES[intensity] ? intensity : DEFAULT_MOTION_INTENSITY;
  return {
    schemaVersion: 1,
    authority: 'design-contract',
    intensity: resolved,
    // Not negotiable at any intensity, and not a band a build can opt out of.
    reducedMotionRequired: true,
    // Decorative movement is movement with no interaction to confirm. Below
    // moderate it is refused rather than merely made small.
    decorativeMovement: resolved === 'moderate' || resolved === 'expressive',
    durations: { fast: band.durationFast, slow: band.durationSlow },
    easing: band.easing,
    hoverLift: band.hoverLift,
  };
}

/** The custom properties the template stylesheet reads for every transition it runs. */
export function motionTokens(contract) {
  const band = MOTION_INTENSITIES[contract?.intensity] ?? MOTION_INTENSITIES[DEFAULT_MOTION_INTENSITY];
  return {
    '--motion-duration-fast': contract?.durations?.fast ?? band.durationFast,
    '--motion-duration-slow': contract?.durations?.slow ?? band.durationSlow,
    '--motion-ease': contract?.easing ?? band.easing,
    '--motion-hover-lift': contract?.hoverLift ?? band.hoverLift,
    // A build that refuses decorative movement compiles the resting value, so
    // the rule stays in the stylesheet and simply has nothing to do.
    '--motion-decorative-scale': contract?.decorativeMovement === false ? '1' : band.decorativeScale,
  };
}
