/**
 * Design Contract editing and Phase 4C DesignSystemSpec compilation.
 *
 * Structured controls over the design decisions the factory already makes, not
 * a stylesheet someone can type into. Every control has a declared set of
 * allowed values or a rule that decides whether a value is acceptable, and a
 * choice outside that fails closed.
 *
 * The controls are deliberately the ones that compile. `accentColor`,
 * `maxWidth` and `radius` already become CSS custom properties that the
 * template uses widely; `density` did not, and is compiled here rather than
 * offered as a label that changes nothing.
 *
 * Phase 4C adds a compiler IR named DesignSystemSpec between those decisions
 * and CSS. It is derived from the existing Design Contract rather than becoming
 * another design authority. Existing generation and live Console edits already
 * call `renderBrandCss`, so routing that function through the spec gives the
 * declaration a real renderer consumer before any registry or extra UI is
 * allowed to grow around it.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** What each density means in section rhythm. This is what makes it real. */
export const DENSITIES = Object.freeze({
  relaxed: Object.freeze({ label: 'Relaxed', sectionSpace: 'clamp(72px, 9vw, 132px)', purpose: 'Generous vertical rhythm. Best where each section deserves its own breath.' }),
  comfortable: Object.freeze({ label: 'Comfortable', sectionSpace: 'clamp(56px, 7vw, 104px)', purpose: 'The default rhythm.' }),
  compact: Object.freeze({ label: 'Compact', sectionSpace: 'clamp(40px, 5vw, 72px)', purpose: 'Tighter. Best where a visitor is scanning for something.' }),
  dense: Object.freeze({ label: 'Dense', sectionSpace: 'clamp(28px, 3.5vw, 52px)', purpose: 'Tightest. Best for an internal surface that is worked in, not read.' }),
});

export const MAX_WIDTHS = Object.freeze([
  Object.freeze({ id: '64rem', label: 'Narrow', purpose: 'A single column of reading width.' }),
  Object.freeze({ id: '72rem', label: 'Standard', purpose: 'The default measure.' }),
  Object.freeze({ id: '90rem', label: 'Wide', purpose: 'More room across, for grids and dashboards.' }),
  Object.freeze({ id: '96rem', label: 'Full', purpose: 'Widest. Best for dense application surfaces.' }),
]);

export const RADII = Object.freeze([
  Object.freeze({ id: '0rem', label: 'Square', purpose: 'No rounding.' }),
  Object.freeze({ id: '0.625rem', label: 'Slight', purpose: 'Barely rounded.' }),
  Object.freeze({ id: '1rem', label: 'Rounded', purpose: 'The default corner.' }),
  Object.freeze({ id: '1.5rem', label: 'Soft', purpose: 'Noticeably soft corners.' }),
]);

function channel(value) {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * Whether an accent may be used.
 *
 * The accent is the background of the primary action, and the label on it is
 * `--color-accent-contrast`. An accent that makes that label unreadable is not
 * a matter of taste, so it is refused here rather than shipped and caught later
 * by an accessibility gate — or not caught at all.
 */
export const ACCENT_CONTRAST_COLOR = '#ffffff';
export const ACCENT_MINIMUM_CONTRAST = 4.5;

export function assertAccentColor(value) {
  if (typeof value !== 'string' || !HEX.test(value)) throw new Error(`Unsupported accent colour: ${String(value)} is not a six-digit hex colour.`);
  const accent = value.toLowerCase();
  const ratio = contrastRatio(accent, ACCENT_CONTRAST_COLOR);
  if (ratio < ACCENT_MINIMUM_CONTRAST) {
    throw new Error(`Accent colour ${accent} contrasts ${ratio.toFixed(2)}:1 against the label it carries, below the ${ACCENT_MINIMUM_CONTRAST}:1 needed to stay readable.`);
  }
  return accent;
}

const CHOICES = {
  accentColor: { assert: assertAccentColor },
  maxWidth: { allowed: MAX_WIDTHS.map((entry) => entry.id) },
  radius: { allowed: RADII.map((entry) => entry.id) },
  density: { allowed: Object.keys(DENSITIES) },
};

/** Refuse anything the contract does not offer, rather than compiling it. */
export function assertDesignChoices(choices = {}) {
  const resolved = {};
  for (const [key, value] of Object.entries(choices)) {
    const control = CHOICES[key];
    if (!control) throw new Error(`Unsupported design control: ${key}.`);
    if (value === null || value === undefined) continue;
    if (control.assert) { resolved[key] = control.assert(value); continue; }
    if (!control.allowed.includes(value)) {
      throw new Error(`Unsupported ${key}: ${String(value)}. It offers: ${control.allowed.join(', ')}.`);
    }
    resolved[key] = value;
  }
  return resolved;
}

/** The controls a person is offered, with what the build currently uses. */
export function designControls(design) {
  return [
    { control: 'density', label: 'Section rhythm', value: design.density, options: Object.entries(DENSITIES).map(([id, entry]) => ({ id, label: entry.label, purpose: entry.purpose })) },
    { control: 'maxWidth', label: 'Measure', value: design.maxWidth, options: MAX_WIDTHS.map((entry) => ({ ...entry })) },
    { control: 'radius', label: 'Corners', value: design.radius, options: RADII.map((entry) => ({ ...entry })) },
  ];
}

export function applyDesignChoices(design, choices = {}) {
  return { ...design, ...assertDesignChoices(choices) };
}

/**
 * Compile the design into the custom properties the template reads.
 *
 * A design contract that does not compile is a prompt. Every property here is
 * one the stylesheet actually uses.
 */
export function compileDesignTokens(design) {
  const density = DENSITIES[design.density] ?? DENSITIES.comfortable;
  return {
    '--color-accent': design.accentColor,
    '--layout-max-width': design.maxWidth,
    '--layout-radius': design.radius,
    '--section-space': density.sectionSpace,
  };
}

/**
 * Phase 4C compiler IR.
 *
 * This is intentionally derived from the existing Design Contract. It records
 * both the decisions that produced the output and the exact token output a
 * renderer consumes, so future persistence can be portable without inventing
 * a second source of design truth.
 */
export function compileDesignSystemSpec(design) {
  return {
    schemaVersion: 1,
    authority: 'design-contract',
    layout: {
      patternId: design.patternId,
      label: design.label,
      shellClass: design.shellClass,
    },
    controls: {
      accentColor: design.accentColor,
      maxWidth: design.maxWidth,
      radius: design.radius,
      density: design.density,
    },
    tokens: compileDesignTokens(design),
  };
}

/** A real renderer consumer for DesignSystemSpec, not a decorative declaration. */
export function renderDesignSystemCss(spec) {
  if (!spec || spec.schemaVersion !== 1 || spec.authority !== 'design-contract' || !spec.tokens || typeof spec.tokens !== 'object') {
    throw new Error('Invalid DesignSystemSpec: expected compiler output from the Design Contract.');
  }
  const entries = Object.entries(spec.tokens).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${entries.join('\n')}\n}\n`;
}

/** Existing product path: generation and live Console edits now compile through DesignSystemSpec. */
export function renderBrandCss(design) {
  return renderDesignSystemCss(compileDesignSystemSpec(design));
}
