/**
 * What a colour does under four lights.
 *
 * This is the site's central artefact and the one thing a printed card cannot do, so it had
 * better be honest about what it is. Every rendering here is *computed* from the base colour by
 * a stated transform. Nothing is hand-picked to look convincing, which matters because
 * hand-picking is exactly how a paint company would fake this.
 *
 * ## The model, and its limits
 *
 * Each illuminant is a multiplicative tint applied in linear light with a luminance factor:
 * convert sRGB to linear, multiply per channel, scale, convert back. That is a crude von
 * Kries-style chromatic adaptation with no allowance for the eye adapting to the room it is
 * in, no spectral data for the pigment, and no account of the surface texture that makes lime
 * paint behave differently from a plastic film in the first place.
 *
 * It is therefore an approximation, and the site says so on the same screen rather than in a
 * footnote — because the limitation *is* the argument. If a computed rendering on a calibrated
 * display is still not good enough to choose from, a printed card under a shop's fluorescent
 * light certainly is not, and the only honest answer is a sample pot on the customer's own
 * wall. The conversion follows from the disclosure instead of surviving it.
 */

export interface Illuminant {
  id: string;
  name: string;
  /** What a customer would actually call this. */
  when: string;
  /** Per-channel multiplier in linear light. */
  tint: [number, number, number];
  /** Overall luminance factor. */
  level: number;
  note: string;
}

/**
 * Four, and no more.
 *
 * North, south, evening and lamp are the four a decorator actually names when asked why a
 * colour looked different in the shop. A fifth would be more model and less argument.
 */
export const ILLUMINANTS: Illuminant[] = [
  {
    id: 'north',
    name: 'North light',
    when: 'a north-facing room, overcast',
    tint: [0.93, 0.975, 1.07],
    level: 0.96,
    note: 'Cool and even. Takes the warmth out of an earth pigment and can make a yellow ochre look green.',
  },
  {
    id: 'south',
    name: 'South light',
    when: 'direct sun, midday',
    tint: [1.06, 1.02, 0.94],
    level: 1.12,
    note: 'Bright and slightly warm. Lifts everything and flattens the difference between close colours.',
  },
  {
    id: 'evening',
    name: 'Evening',
    when: 'low sun, an hour before dusk',
    tint: [1.10, 0.955, 0.83],
    level: 0.80,
    note: 'Warm and falling. Reds and ochres come forward; greens and greys go muddy.',
  },
  {
    id: 'lamp',
    name: 'Lamp',
    when: 'a 2700K bulb after dark',
    tint: [1.15, 0.955, 0.76],
    level: 0.72,
    note: 'Very warm and dim. This is the light a living room is actually used in, and almost nobody chooses paint under it.',
  },
];

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** sRGB transfer function, both directions. Doing this in gamma space would darken every mix. */
const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const toSrgb = (channel: number) => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);

export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16) / 255) as [number, number, number];
}

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(clamp(c) * 255).toString(16).padStart(2, '0')).join('')}`;

/** One colour, under one light. */
export function under(hex: string, illuminant: Illuminant): string {
  const linear = parseHex(hex).map(toLinear);
  const lit = linear.map((channel, index) => clamp(channel * illuminant.tint[index] * illuminant.level));
  return toHex(lit.map(toSrgb));
}

export function allLights(hex: string) {
  return ILLUMINANTS.map((illuminant) => ({ illuminant, hex: under(hex, illuminant) }));
}

/**
 * Light reflectance value, computed rather than asserted.
 *
 * LRV is a real number the trade uses — it decides whether a colour will make a north-facing
 * room unusable, and building regulations reference it for visual contrast between surfaces.
 * It is relative luminance expressed as a percentage, so it can be derived from the colour
 * itself. Typing thirty-six of them by hand would have produced thirty-six numbers that
 * happened to flatter the colours they sat beside.
 */
export function lrv(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear);
  return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) * 1000) / 10;
}

/** WCAG relative-luminance contrast between two colours. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = parseHex(hex).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

export const INK_DARK = '#2f2820';
export const INK_LIGHT = '#ede8da';

/**
 * Which ink to print on a given ground — measured, not guessed.
 *
 * The first version of this was `lrv > 42 ? dark : light`, a threshold chosen by eye. It is
 * wrong, and wrong in the direction that matters: with these two inks the crossover where light
 * ink starts beating dark ink is around LRV 20, not 42. Everything between those two numbers —
 * which on this palette is Nadder, Stubble, Sage Earth, Slate, Lead and five more — was being
 * given the worse of the two inks, at ratios below 3:1.
 *
 * So it computes both and takes the better. That is not a refinement of the threshold, it is
 * the removal of the threshold: a site whose ground changes thirty-six times cannot carry a
 * magic number that somebody has to remember to re-derive when a colour is added.
 */
export function inkOn(hex: string): 'dark' | 'light' {
  return contrast(hex, INK_DARK) >= contrast(hex, INK_LIGHT) ? 'dark' : 'light';
}

/** The contrast the chosen ink actually achieves. */
export function inkContrast(hex: string): number {
  return Math.max(contrast(hex, INK_DARK), contrast(hex, INK_LIGHT));
}

/**
 * Whether a colour may be used as a ground for running text.
 *
 * Not every colour can, and no choice of inks fixes it. With one dark ink and one light ink the
 * worst case sits where the two are equally bad, and even pure black against pure white only
 * reaches 4.58:1 there — so a mid-tone ground carrying body copy at 4.5:1 is at the limit of
 * what two inks can do, and seven of these thirty-six fall under it.
 *
 * That is a property of the palette rather than a defect to design around. A paint made to go
 * on a wall is not thereby a background for a paragraph. So sections that carry prose are
 * painted only in colours that clear the bar, and the rest of the range appears as what it
 * is — paint, at size, with a name on it.
 */
export const TEXT_CONTRAST_MINIMUM = 4.5;
export const groundSafe = (hex: string) => inkContrast(hex) >= TEXT_CONTRAST_MINIMUM;
