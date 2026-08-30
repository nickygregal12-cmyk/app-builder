import { structuralSignature } from './visual-direction.mjs';

/**
 * The signal that the factory is not making every business the same beautiful
 * template.
 *
 * `assessDiversity` already refuses a *candidate set* whose members are one
 * build in other colours. That is a different question with a different answer:
 * candidates share a frozen truth and must differ, so identical is a defect by
 * construction. Two unrelated businesses are not obliged to differ — both may
 * genuinely be five-page marketing sites — and the machinery is reused rather
 * than re-invented precisely because the comparison is the same and the
 * *conclusion* is not.
 *
 * So this is a diagnostic, not a gate. `docs/VISUAL_EXCELLENCE.md` §8 says to
 * begin as a diagnostic rather than an arbitrary blocking threshold, and to use
 * real corpus evidence to identify repeatedly generic patterns before retiring
 * or improving them. A blocking percentage invented before the corpus exists
 * would be a number chosen to look rigorous over a corpus of one.
 *
 * What it does assert is the reading. A signal that takes exactly one value
 * across every build in the set is *uniform*: whatever the factory decides
 * there, it is not deciding it from the business. That is a finding whether the
 * corpus has three builds or fifty, and it is what §8's "repeatedly generic
 * patterns" means operationally.
 */

/** The nine signals §5C names, mapped to where each already lives. */
export const SIGNALS = Object.freeze([
  { id: 'sequence', label: 'section/presentation sequence', from: 'sequence' },
  { id: 'actionTreatment', label: 'action family', from: 'axes.actionTreatment' },
  { id: 'ctaComposition', label: 'closing-ask composition', from: 'axes.ctaComposition' },
  { id: 'heroComposition', label: 'opening composition', from: 'axes.heroComposition' },
  { id: 'navigationFamily', label: 'navigation family', from: 'axes.navigationFamily' },
  { id: 'typographyStrategy', label: 'typographic character', from: 'axes.typographyStrategy' },
  { id: 'heroStrategy', label: 'hero strategy', from: 'axes.heroStrategy' },
  { id: 'gridFamily', label: 'layout/grid family', from: 'axes.gridFamily' },
  { id: 'layoutFamily', label: 'layout pattern', from: 'axes.layoutFamily' },
  { id: 'informationDensity', label: 'density', from: 'axes.informationDensity' },
  { id: 'headingTreatment', label: 'typography treatment', from: 'axes.headingTreatment' },
  { id: 'typographicVoice', label: 'typographic voice', from: 'brand.typography.voice' },
  { id: 'ctaPlacement', label: 'CTA structure', from: 'axes.ctaPlacement' },
  { id: 'distinctiveMoment', label: 'visual motif', from: 'axes.distinctiveMoment' },
  { id: 'responsiveStrategy', label: 'responsive strategy', from: 'axes.responsiveStrategy' },
  { id: 'motionIntensity', label: 'motion', from: 'axes.motionIntensity' },
]);

const SIGNAL_IDS = Object.freeze(SIGNALS.map((signal) => signal.id));

/**
 * One build's reading, from artifacts a generated repository already carries.
 *
 * `structuralSignature` is the same function the candidate-set diversity gate
 * uses, so a change to what "structurally different" means cannot mean one
 * thing within a set and another across the corpus. Typographic voice is the
 * one signal it does not carry — it is a brand decision rather than a
 * composition axis — and it is read from the compiled DesignSystemSpec.
 */
export function crossBuildSignature({ build, composition, design, direction = null }) {
  const signature = structuralSignature({ direction, composition, design });
  return {
    schemaVersion: 1,
    build,
    // Whether this build was ever handed a promoted direction. Without one,
    // `structuralSignature` reads the default dimensions, and a set of builds
    // that all did so is uniform for a reason that is not the factory making
    // every business alike. Recorded per build so the reading cannot be made
    // without it.
    directionPromoted: Boolean(direction),
    signals: {
      // A sequence is compared as a whole: the same section types in the same
      // order across two unrelated businesses is the finding, not any one page.
      sequence: JSON.stringify(signature.sequence.map((page) => page.presentation)),
      actionTreatment: signature.axes.actionTreatment ?? null,
      ctaComposition: signature.axes.ctaComposition ?? null,
      heroComposition: signature.axes.heroComposition ?? null,
      navigationFamily: signature.axes.navigationFamily ?? null,
      typographyStrategy: signature.axes.typographyStrategy ?? null,
      heroStrategy: signature.axes.heroStrategy ?? null,
      gridFamily: signature.axes.gridFamily ?? null,
      layoutFamily: signature.axes.layoutFamily ?? null,
      informationDensity: signature.axes.informationDensity ?? null,
      headingTreatment: signature.axes.headingTreatment ?? null,
      typographicVoice: design?.brand?.typography?.voice ?? null,
      ctaPlacement: signature.axes.ctaPlacement ?? null,
      distinctiveMoment: signature.axes.distinctiveMoment ?? null,
      responsiveStrategy: signature.axes.responsiveStrategy ?? null,
      motionIntensity: signature.axes.motionIntensity ?? null,
    },
  };
}

function pairs(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) out.push([items[i], items[j]]);
  return out;
}

/**
 * Read a set of unrelated builds.
 *
 * Three observations, in descending order of how much they mean:
 *
 * - `identical` — two unrelated businesses whose every signal agrees. Not a
 *   percentage and not a judgement call: it is the definition of a template.
 * - `uniform` — a signal with exactly one value across the whole set. The
 *   factory is not reading the business there.
 * - `repeated` — a signal's most common value and how much of the set holds it.
 *   Meaningless at three builds and the point of the diagnostic at thirty, so
 *   it is reported as a count rather than scored.
 *
 * Nothing here fails. The reading is the output.
 */
export function assessCrossBuildDiversity(signatures, { signals = SIGNAL_IDS } = {}) {
  const builds = signatures.map((entry) => entry.build);
  const identical = [];
  const partial = [];
  for (const [a, b] of pairs(signatures)) {
    const differing = signals.filter((signal) => a.signals[signal] !== b.signals[signal]);
    const shared = signals.filter((signal) => a.signals[signal] === b.signals[signal]);
    if (differing.length === 0) {
      identical.push({ a: a.build, b: b.build, detail: `${a.build} and ${b.build} are two unrelated businesses with the same structure, the same rhythm and the same visual motif. Nothing a visitor could see distinguishes the shape of one from the other.` });
    } else {
      partial.push({ a: a.build, b: b.build, differing, shared, differingCount: differing.length });
    }
  }

  const perSignal = {};
  for (const signal of signals) {
    const counts = new Map();
    for (const entry of signatures) {
      const value = entry.signals[signal];
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const values = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [commonest, count] = values[0] ?? [null, 0];
    perSignal[signal] = {
      distinctValues: counts.size,
      uniform: counts.size === 1 && signatures.length > 1,
      commonest,
      commonestCount: count,
      ofBuilds: signatures.length,
    };
  }

  const uniform = signals.filter((signal) => perSignal[signal].uniform);
  const withDirection = signatures.filter((entry) => entry.directionPromoted).length;
  return {
    schemaVersion: 1,
    diagnostic: 'cross-build-anti-template',
    // Stated on the report rather than in a comment, because a reader who finds
    // this file in six months needs to know it never blocked anything.
    advisory: true,
    blocking: false,
    builds,
    buildCount: signatures.length,
    // The one number that changes what a uniform signal means.
    buildsWithPromotedDirection: withDirection,
    // A corpus of one cannot say anything about whether unrelated businesses
    // look alike, and saying so is more useful than a report full of zeroes.
    meaningful: signatures.length >= 3,
    signals: perSignal,
    identical,
    uniform,
    leastDifferent: partial.slice().sort((a, b) => a.differingCount - b.differingCount).slice(0, 5),
  };
}

/**
 * The reading in sentences, because a table of counts is not a finding.
 */
export function describeCrossBuildDiversity(report) {
  const lines = [];
  lines.push(`Cross-build anti-template diagnostic over ${report.buildCount} build(s): ${report.builds.join(', ')}.`);
  lines.push('Advisory. Nothing here blocks a build; §8 of docs/VISUAL_EXCELLENCE.md asks for real corpus evidence before any threshold exists.');
  if (!report.meaningful) {
    lines.push(`Not yet meaningful: ${report.buildCount} build(s) cannot show whether unrelated businesses come out looking alike. The corpus in docs/GENUINE_BUSINESS_ACCEPTANCE.md is what fills this in.`);
  }
  if (report.buildsWithPromotedDirection === 0 && report.buildCount > 1) {
    lines.push('No build in this set carries a promoted visual direction, so every one of them signs from the default composition dimensions. A uniform signal below therefore says the direction machinery is unused by ordinary builds — which is what the outstanding Phase 4D verdict means in practice — and not that the factory answers different businesses the same way. That second reading needs a set where directions have actually been promoted.');
  }
  for (const pair of report.identical) lines.push(`IDENTICAL: ${pair.detail}`);
  for (const signal of report.uniform) {
    const meta = SIGNALS.find((entry) => entry.id === signal);
    lines.push(`UNIFORM: every build has the same ${meta?.label ?? signal} (${JSON.stringify(report.signals[signal].commonest)}). Whatever decides that, it is not the business.`);
  }
  for (const pair of report.leastDifferent) {
    lines.push(`${pair.a} vs ${pair.b}: differ in ${pair.differingCount} of ${pair.differing.length + pair.shared.length} signals (${pair.differing.join(', ')}).`);
  }
  return lines;
}
