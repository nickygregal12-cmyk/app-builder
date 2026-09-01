/**
 * The tide, and therefore the causeway.
 *
 * FICTIONAL island, simplified model, and both of those are said on the page rather than here
 * only. Nobody should plan a crossing from this site; the point of computing it properly is that
 * a site about a tidal island whose tides were drawn by hand would be lying about the one thing
 * it is actually selling.
 *
 * ## The model
 *
 * Two constituents, which is enough to produce a tide that behaves.
 *
 *   M2 — the principal lunar semi-diurnal, period 12h 25.2m. The twice-daily rise and fall, and
 *        the reason high water is about fifty minutes later each day.
 *   S2 — the principal solar semi-diurnal, period exactly 12h. Its beat against M2 over 14.77
 *        days is the spring–neap cycle: when they align the range is large and the causeway is
 *        shut for longer; when they oppose, the crossing is easy all week.
 *
 * Real prediction uses dozens of constituents and a local harmonic analysis. Two gets the shape
 * right — the daily drift, the fortnightly swing, the asymmetry between one tide and the next —
 * and gets the absolute heights wrong, which is exactly the honest position for a website whose
 * job is to tell you what a week will feel like rather than when to drive onto a causeway.
 */

/** Hours. The lunar semi-diurnal period, and the reason nothing here repeats daily. */
const M2_PERIOD = 12.4206012;
const S2_PERIOD = 12.0;

/** Metres above chart datum. Invented for a fictional island, and plausible for this coast. */
const MEAN_LEVEL = 2.9;
const M2_AMP = 1.75;
const S2_AMP = 0.58;

/**
 * The height at which the causeway becomes impassable.
 *
 * Above mean level, and that is the whole physics rather than a tuned number. A causeway is a
 * road: it sits well up the tidal frame and is covered only around high water. The first version
 * of this file put the limit *below* mean level, which produces a model where a bigger tidal
 * range keeps the crossing open for longer — the opposite of every tidal causeway there is. The
 * probe caught it as an inverted spring–neap cycle before anything was built on it.
 *
 * With the limit above mean level the arithmetic comes out right: a larger range spends more of
 * each cycle above the road, so springs shut the crossing for longer and neaps open it up. At
 * these constants that is roughly nine hours a day shut at neaps and ten and a half at springs,
 * in two periods either side of each high water — which is the shape of a real crossing.
 *
 * A real one is published as a safe period rather than a height, because the margin is set by
 * whoever is liable rather than by the water. This is a height because the model produces
 * heights, and the site says so.
 */
export const CAUSEWAY_LIMIT = 3.35;

/** Hours since the epoch, from a date. The epoch is arbitrary and fixed; only phase matters. */
const EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0);
export const hoursSince = (date: Date) => (date.getTime() - EPOCH) / 3_600_000;

/** Predicted height, in metres, at a given number of hours after the epoch. */
export function height(hours: number): number {
  return MEAN_LEVEL
    + M2_AMP * Math.cos((2 * Math.PI * hours) / M2_PERIOD)
    + S2_AMP * Math.cos((2 * Math.PI * hours) / S2_PERIOD + 0.6);
}

export const isOpen = (hours: number) => height(hours) < CAUSEWAY_LIMIT;

export interface Window {
  /** Hours after epoch. */
  from: number;
  to: number;
  /** Duration in hours. */
  length: number;
}

/**
 * The crossings in a span, found by walking it.
 *
 * Ten-minute steps rather than solving the equation, because the causeway limit is crossed twice
 * per constituent cycle and the closed form is more trouble than a loop over a week. The step is
 * the resolution the site quotes to, so it is also the honest precision.
 */
export function windows(fromHours: number, toHours: number): Window[] {
  const STEP = 1 / 6;
  const found: Window[] = [];
  let start: number | null = null;
  for (let t = fromHours; t <= toHours; t += STEP) {
    const open = isOpen(t);
    if (open && start === null) start = t;
    if (!open && start !== null) {
      found.push({ from: start, to: t, length: t - start });
      start = null;
    }
  }
  if (start !== null) found.push({ from: start, to: toHours, length: toHours - start });
  // A sliver at either end of the span is an artefact of where the week was cut, not a crossing
  // anybody could use.
  return found.filter((window) => window.length >= 0.5);
}

/**
 * Where in the spring–neap cycle a moment sits, 0 to 1.
 *
 * Measured from the model rather than derived from the beat frequency alongside it. Two
 * expressions of the same cycle is one expression that can drift out of phase with the tide it
 * describes, and the first draft of this file did exactly that — reporting neaps on a day the
 * heights said was springs.
 *
 * So it reads the actual range over the surrounding twenty-five hours and normalises it between
 * the extremes the two constituents can produce. It cannot disagree with the water.
 */
const NEAP_RANGE = 2 * (M2_AMP - S2_AMP);
const SPRING_RANGE = 2 * (M2_AMP + S2_AMP);
export function springNeap(hours: number): number {
  let low = Infinity;
  let high = -Infinity;
  for (let t = hours; t <= hours + 25; t += 1 / 6) {
    const h = height(t);
    if (h < low) low = h;
    if (h > high) high = h;
  }
  return Math.min(1, Math.max(0, (high - low - NEAP_RANGE) / (SPRING_RANGE - NEAP_RANGE)));
}

/**
 * How long the water is over the road in a span, and the longest unbroken stretch of it.
 *
 * Deliberately *not* derived from `windows()`, and the difference matters. `windows()` drops
 * anything under half an hour, because a twenty-minute crossing is not a crossing anybody can
 * use. That is right for a timetable and wrong for a total: a crossing that happens to be cut
 * short by midnight gets dropped by the filter and its minutes reappear as closure, so a day's
 * shut-hours figure moves by up to half an hour depending on nothing but where the day boundary
 * falls.
 *
 * That artefact is the same size as the entire spring–neap signal the site is built on. It was
 * measured, not suspected: the probe reported a neap day shut for 9h30 and a spring day for
 * 10h10, when the arithmetic of the two constituents says the swing is over an hour and a half.
 *
 * So this integrates the actual state of the road and owes nothing to the display filter. Two
 * quantities, both honest, used for different things.
 */
export function shutFor(fromHours: number, toHours: number): { shut: number; longest: number } {
  const STEP = 1 / 60;
  let shut = 0;
  let run = 0;
  let longest = 0;
  for (let t = fromHours; t < toHours; t += STEP) {
    if (isOpen(t + STEP / 2)) {
      run = 0;
    } else {
      shut += STEP;
      run += STEP;
      if (run > longest) longest = run;
    }
  }
  return { shut, longest };
}

/** The tidal range over the twenty-five hours from a moment, in metres. */
export function rangeAt(hours: number): number {
  let low = Infinity;
  let high = -Infinity;
  for (let t = hours; t <= hours + 25; t += 1 / 6) {
    const h = height(t);
    if (h < low) low = h;
    if (h > high) high = h;
  }
  return high - low;
}

export const describeRange = (value: number) =>
  value > 0.72 ? 'springs' : value < 0.28 ? 'neaps' : 'between springs and neaps';

/** Hours after epoch to a wall-clock label. The island keeps UTC; so does the model. */
export function clock(hours: number): string {
  const total = Math.round(((hours % 24) + 24) % 24 * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
