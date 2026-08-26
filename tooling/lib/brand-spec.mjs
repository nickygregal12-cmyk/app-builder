/**
 * BrandSpec — the resolved brand presentation inputs a build compiles from.
 *
 * This does not extract anything. Phase 3 already reads a company's own
 * material and records what it observed in the knowledge pack's `brand` block:
 * the hex colours its pages use and the font families its stylesheets name,
 * each with the sources they came from. A second extraction pipeline would be a
 * second thing to keep true.
 *
 * What was missing is the step after observation. Those observations sat in the
 * pack and the build used a default navy and the template's own typeface
 * regardless, so a business whose site is dark green and set in Georgia got a
 * build that looked nothing like it. BrandSpec resolves observation into the
 * two presentation inputs the design system actually compiles, and keeps three
 * things apart while doing it:
 *
 *   supplied  — someone stated it in the manifest;
 *   observed  — read from the company's own material, with the sources named;
 *   derived   — the factory's own default, with nothing behind it.
 *
 * An inference is never recorded as a source fact. `sourceIds` is non-empty for
 * an observation and empty for everything else, so a later review can tell what
 * the business actually showed from what the factory decided on its behalf.
 */

import { ACCENT_CONTRAST_COLOR, ACCENT_MINIMUM_CONTRAST, contrastRatio } from './design-choices.mjs';

const HEX = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_ACCENT = '#315b72';

/**
 * Typography voices, as system stacks.
 *
 * Every stack resolves on an ordinary machine with no web font to download, so
 * choosing a voice cannot cost the generated app a network request, a licence
 * or a layout shift. That bounds the range — this is not a type foundry — but a
 * serif business genuinely reads as a serif business, which is the difference
 * that was missing.
 */
export const TYPOGRAPHY_VOICES = Object.freeze({
  'humanist-sans': Object.freeze({
    label: 'Humanist sans',
    display: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  }),
  'grotesque-sans': Object.freeze({
    label: 'Grotesque sans',
    display: 'Helvetica Neue, Helvetica, Arial, ui-sans-serif, system-ui, sans-serif',
    body: 'Helvetica Neue, Helvetica, Arial, ui-sans-serif, system-ui, sans-serif',
  }),
  'transitional-serif': Object.freeze({
    label: 'Transitional serif',
    display: 'Georgia, "Times New Roman", Times, ui-serif, serif',
    body: 'Georgia, "Times New Roman", Times, ui-serif, serif',
  }),
  'editorial-serif-sans': Object.freeze({
    label: 'Serif headings, sans body',
    display: 'Georgia, "Times New Roman", Times, ui-serif, serif',
    body: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  }),
});

export const DEFAULT_TYPOGRAPHY_VOICE = 'humanist-sans';

/**
 * Font families a company's own stylesheet can name that map onto a voice.
 *
 * Deliberately a small allowlist. A family nobody here can resolve is not
 * guessed at: the voice stays derived and the observation is simply not used,
 * which is honest and leaves the build looking like the factory's default
 * rather than like a font the visitor does not have.
 */
const OBSERVED_FAMILY_VOICES = Object.freeze({
  inter: 'humanist-sans',
  roboto: 'humanist-sans',
  'open sans': 'humanist-sans',
  lato: 'humanist-sans',
  'segoe ui': 'humanist-sans',
  'system-ui': 'humanist-sans',
  '-apple-system': 'humanist-sans',
  helvetica: 'grotesque-sans',
  'helvetica neue': 'grotesque-sans',
  arial: 'grotesque-sans',
  'arial narrow': 'grotesque-sans',
  georgia: 'transitional-serif',
  'times new roman': 'transitional-serif',
  times: 'transitional-serif',
  garamond: 'transitional-serif',
  'playfair display': 'editorial-serif-sans',
  merriweather: 'editorial-serif-sans',
  lora: 'editorial-serif-sans',
});

function channels(hex) {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

/**
 * Whether an observed colour is a brand colour rather than furniture.
 *
 * A page's stylesheet is full of hex values that carry no brand meaning: the
 * near-white it sits on, the near-black it writes in, the grey of a hairline
 * rule. Taking the most frequent one would usually produce `#333333`. A colour
 * has to actually be a colour — a meaningful spread between its channels — and
 * still carry a readable label before it can stand for a business.
 */
const MINIMUM_CHROMA = 24;

export function usableAccent(value) {
  if (typeof value !== 'string' || !HEX.test(value)) return false;
  const rgb = channels(value.toLowerCase());
  if (Math.max(...rgb) - Math.min(...rgb) < MINIMUM_CHROMA) return false;
  return contrastRatio(value.toLowerCase(), ACCENT_CONTRAST_COLOR) >= ACCENT_MINIMUM_CONTRAST;
}

function suppliedAccent(manifest) {
  const value = manifest?.brand?.accentColor;
  return usableAccent(value) ? value.toLowerCase() : null;
}

/**
 * The company's own colour, where its own material shows one it can use.
 *
 * Observations arrive sorted by how many sources carried them, so the colour
 * the business uses across its site outranks one that appeared on a single
 * page.
 */
function observedAccent(knowledgePack) {
  for (const entry of knowledgePack?.brand?.colors ?? []) {
    if (usableAccent(entry?.value)) return { value: entry.value.toLowerCase(), sourceIds: [...(entry.sourceIds ?? [])] };
  }
  return null;
}

function suppliedVoice(manifest) {
  const value = manifest?.brand?.typographyVoice;
  return typeof value === 'string' && Object.hasOwn(TYPOGRAPHY_VOICES, value) ? value : null;
}

function observedVoice(knowledgePack) {
  for (const entry of knowledgePack?.brand?.fontFamilies ?? []) {
    const first = String(entry?.value ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    const voice = OBSERVED_FAMILY_VOICES[first];
    if (voice) return { voice, sourceIds: [...(entry.sourceIds ?? [])] };
  }
  return null;
}

/**
 * Resolve brand presentation inputs for a build.
 *
 * The result is recorded on the design the build carries, so a rebuild, a live
 * edit and a recipe change all keep the same resolved brand rather than
 * re-deciding it from whatever material happens to be at hand.
 */
export function compileBrandSpec({ manifest = null, knowledgePack = null } = {}) {
  const supplied = suppliedAccent(manifest);
  const observed = supplied ? null : observedAccent(knowledgePack);
  const accent = supplied
    ? { value: supplied, origin: 'supplied', sourceIds: [] }
    : observed
      ? { value: observed.value, origin: 'observed', sourceIds: observed.sourceIds }
      : { value: DEFAULT_ACCENT, origin: 'derived', sourceIds: [] };

  const suppliedTypography = suppliedVoice(manifest);
  const observedTypography = suppliedTypography ? null : observedVoice(knowledgePack);
  const typography = suppliedTypography
    ? { voice: suppliedTypography, origin: 'supplied', sourceIds: [] }
    : observedTypography
      ? { voice: observedTypography.voice, origin: 'observed', sourceIds: observedTypography.sourceIds }
      : { voice: DEFAULT_TYPOGRAPHY_VOICE, origin: 'derived', sourceIds: [] };

  return {
    schemaVersion: 1,
    authority: 'design-contract',
    accent,
    typography: { ...typography, ...TYPOGRAPHY_VOICES[typography.voice] },
  };
}

/** The two presentation inputs BrandSpec contributes to the compiled token set. */
export function brandTokens(brandSpec, accentColor) {
  const voice = TYPOGRAPHY_VOICES[brandSpec?.typography?.voice] ?? TYPOGRAPHY_VOICES[DEFAULT_TYPOGRAPHY_VOICE];
  return {
    '--color-accent': accentColor ?? brandSpec?.accent?.value ?? DEFAULT_ACCENT,
    '--font-display': voice.display,
    '--font-body': voice.body,
  };
}
