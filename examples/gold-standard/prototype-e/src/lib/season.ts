/**
 * The season: thirty lettable weeks, each characterised by the tide rather than by a description.
 *
 * This is the commercial half of the model. `tide.ts` says what the water does; this says what
 * that means for somebody choosing a week and paying for it.
 *
 * ## Why the weeks are not interchangeable
 *
 * A holiday let normally varies on one axis — the calendar. High season costs more than low
 * season and that is the whole pricing model. Here there are two, because the moon does not care
 * what month it is.
 *
 * The size of that second axis had to be measured rather than assumed, and it is smaller than the
 * first draft of this file claimed. That draft said a neap week opens up to fourteen and a half
 * hours a day and a spring week shuts for over ten. The model says the shut-hours run from about
 * 9h45 a day at neaps to about 10h10 at springs — two hours and twenty minutes across a week, not
 * the gulf that sentence implied. The envelope of a two-constituent tide moves *within* each day,
 * so neither end of the fortnight is ever as extreme as its amplitude suggests.
 *
 * The bigger difference is the length of each individual crossing, and it too came out smaller
 * than the sentence that preceded it. Averaged over a week it is about 34 minutes — 7h34 at the
 * neap end against 7h00 at the spring end. On the handful of days at the very extremes of the
 * cycle it approaches an hour, and the crossing page quotes that separately and says which is
 * which, because a week is always a mixture and a day at true neaps is not.
 *
 * Thirty-four minutes twice a day is still the difference a guest experiences, so it is what the
 * site leads with, with the weekly totals beside it rather than instead of it. Three times now a
 * claim written before the measurement has had to come down to meet it. None of them survived
 * into a page, which is the only reason this is a note rather than a finding.
 *
 * The correction is recorded here because the temptation was to raise S2_AMP until the marketing
 * sentence became true. The ratio in tide.ts is about a third, which is what this coast actually
 * has; changing it to make a claim work would be writing the conclusion into the inputs, which is
 * the mistake prototype D made and caught.
 *
 * ## What is computed and what is asserted
 *
 * Computed from the tide: every crossing window, the shut-hours total, the longest closure, the
 * arrival and departure windows, and the spring–neap position. Asserted: the base rates, the
 * changeover convention and the season dates, which are commercial decisions and not physics.
 * Nothing in the first list is written by hand anywhere in this repository.
 */
import { DAYS, MONTHS, clock, hoursSince, shutFor, springNeap, windows, type Window } from './tide';

/**
 * The season, and the changeover.
 *
 * Friday to Friday, encoded by the fact that the season starts on one: every week is seven days
 * from here, so the changeover day is a property of this date rather than a separate constant to
 * be kept in step with it.
 *
 * Outside these dates the causeway is crossed in the dark at both ends of most days and the house
 * is shut.
 */
const SEASON_START = new Date(Date.UTC(2026, 3, 3)); // Friday 3 April 2026
const WEEKS = 30;

/**
 * Arrivals are not before this, and departures are not after it.
 *
 * These are the housekeeping window, not the tide. The point of stating them as hours rather than
 * folding them into the crossing is that a guest can see which of the two constraints is binding
 * on their week — and on about a fifth of weeks it is this one rather than the water.
 */
export const ARRIVE_AFTER = 15; // 15:00
export const DEPART_BEFORE = 11; // 11:00

export interface Day {
  date: Date;
  /** Hours after the tide epoch at 00:00 on this day. */
  origin: number;
  dayName: string;
  label: string;
  /**
   * The day's crossings, clipped to midnight at both ends — FOR DRAWING ONLY.
   *
   * Named `bars` rather than `crossings` because it is the wrong list for every statistic and it
   * was used as the right one four separate times: the shut-hours total, the longest closure, the
   * mean crossing length and the spring-versus-neap comparison were each wrong in turn, each in a
   * different direction, and one of them printed the headline backwards.
   *
   * A crossing that runs 22:10 to 03:40 appears here as two bars, because that is what a day bar
   * has to draw. It is one crossing. Count it once, from `Week.crossings` or `ALL_CROSSINGS`.
   */
  bars: Window[];
  /** Hours in the day during which the causeway is impassable. */
  shutHours: number;
  /** The longest single closure that starts on this day, in hours. */
  longestShut: number;
  springNeap: number;
}

export interface Week {
  slug: string;
  index: number;
  /** The arrival Friday. */
  start: Date;
  /** The departure Friday. */
  end: Date;
  label: string;
  days: Day[];
  /** Mean spring–neap position over the seven nights, 0 (neaps) to 1 (springs). */
  tone: number;
  /** Total hours cut off across the seven nights. */
  shutHours: number;
  /** The longest single closure anywhere in the week. */
  longestShut: number;
  /**
   * Every crossing of the week, whole.
   *
   * Not the union of the days' crossings, because midnight cuts a crossing in half and a crossing
   * does not stop at midnight. Day.crossings is clipped on purpose — it draws a bar for one day —
   * and this is not, because it is what gets counted.
   *
   * Getting this wrong inverted a headline: measured from the clipped daily lists, neap weeks
   * appeared to have *shorter* crossings than spring weeks, because neaps produce three windows a
   * day of which two are midnight slivers. The mean was averaging the day boundary.
   */
  crossings: Window[];
  /** The mean length of a whole crossing this week. */
  meanCrossing: number;
  /** When you can drive on, on the Friday you arrive. Null if the tide shuts the afternoon. */
  arrival: { from: number; to: number } | null;
  /** When you must be off by, on the Friday you leave. */
  departure: { from: number; to: number } | null;
  band: SeasonBand;
  price: number;
}

const dayOf = (date: Date) => DAYS[date.getUTCDay()];
const fmt = (date: Date) => `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)}`;
const iso = (date: Date) => date.toISOString().slice(0, 10);

function buildDay(date: Date): Day {
  const origin = hoursSince(date);
  const bars = windows(origin, origin + 24);
  // From the state of the road, not from the bars — see shutFor.
  const { shut, longest } = shutFor(origin, origin + 24);
  return {
    date,
    origin,
    dayName: dayOf(date),
    label: `${dayOf(date).slice(0, 3)} ${fmt(date)}`,
    bars,
    shutHours: shut,
    longestShut: longest,
    springNeap: springNeap(origin),
  };
}

/**
 * The crossing you actually arrive on.
 *
 * Not "the first window after three o'clock" — the first window that is still open *at or after*
 * three o'clock, clipped to start no earlier than that. A window running 13:10–18:20 is an
 * arrival window from 15:00, and calling it unavailable because it began before housekeeping
 * finished would be the model being tidy at the guest's expense.
 *
 * Returns null when the water shuts the whole of the rest of the day, which happens on a handful
 * of spring Fridays a season and is the single most important fact about those weeks.
 */
function arrivalWindow(origin: number): { from: number; to: number } | null {
  const earliest = origin + ARRIVE_AFTER;
  // Scanned a day either side, so a crossing that opens on the Thursday evening or runs past
  // midnight into the Saturday is one crossing. Reading the day bars here printed arrivals
  // ending at "00:00" on a third of the weeks — the road was open, the *day* had ended.
  for (const window of windows(origin - 24, origin + 48)) {
    if (window.from >= origin + 24) break;
    if (window.to <= earliest + 0.5) continue; // gone, or too little left to be a crossing
    return { from: Math.max(window.from, earliest), to: window.to };
  }
  return null;
}

/** The last crossing you can leave on, clipped to the eleven o'clock changeover. */
function departureWindow(origin: number): { from: number; to: number } | null {
  const latest = origin + DEPART_BEFORE;
  let found: { from: number; to: number } | null = null;
  for (const window of windows(origin - 24, origin + 24)) {
    if (window.from >= latest) break;
    if (Math.min(window.to, latest) - window.from < 0.5) continue;
    found = { from: window.from, to: Math.min(window.to, latest) };
  }
  return found;
}

export type SeasonBand = 'low' | 'shoulder' | 'high' | 'peak';

/** Asserted, not computed. A commercial decision about when people want to come. */
const BANDS: { band: SeasonBand; base: number; from: string; to: string }[] = [
  { band: 'low', base: 3400, from: '2026-04-03', to: '2026-05-14' },
  { band: 'shoulder', base: 4450, from: '2026-05-15', to: '2026-07-16' },
  { band: 'peak', base: 6900, from: '2026-07-17', to: '2026-08-27' },
  { band: 'high', base: 5200, from: '2026-08-28', to: '2026-09-24' },
  { band: 'shoulder', base: 4450, from: '2026-09-25', to: '2026-11-01' },
];

const bandFor = (date: Date): { band: SeasonBand; base: number } => {
  const key = iso(date);
  const found = BANDS.find((b) => key >= b.from && key <= b.to);
  return found ? { band: found.band, base: found.base } : { band: 'low', base: 3400 };
};

/**
 * Price.
 *
 * Base rate by season, then up to eight per cent off for how hard the crossing is that week. The
 * discount is a straight function of the mean spring–neap position and is shown on the page as a
 * discount with its reason, not folded into a headline number.
 *
 * Eight per cent is a judgement, and it was twelve until the model was measured properly. Twelve
 * implied a bigger difference between a spring week and a neap week than there is: an hour off
 * each crossing is worth a discount, but it is not worth eight hundred pounds in peak season, and
 * pricing a difference larger than the one you are selling is how a straightforward trade turns
 * into a gimmick.
 */
const SPRING_DISCOUNT = 0.08;
const priceFor = (base: number, tone: number) => Math.round((base * (1 - SPRING_DISCOUNT * tone)) / 25) * 25;

function buildWeek(index: number): Week {
  const start = new Date(SEASON_START.getTime() + index * 7 * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const days = Array.from({ length: 7 }, (_, i) => buildDay(new Date(start.getTime() + i * 86_400_000)));
  const tone = days.reduce((total, day) => total + day.springNeap, 0) / days.length;
  const { band, base } = bandFor(start);
  // Scanned a day wide either side, then kept only the crossings that lie wholly inside the week,
  // so neither end is a fragment of one cut off by the week boundary.
  const origin = days[0].origin;
  const whole = windows(origin - 24, origin + 24 * 8)
    .filter((w) => w.from >= origin && w.to <= origin + 24 * 7);
  return {
    slug: iso(start),
    index,
    start,
    end,
    label: `${fmt(start)} – ${fmt(end)}`,
    days,
    tone,
    shutHours: days.reduce((total, day) => total + day.shutHours, 0),
    longestShut: Math.max(...days.map((day) => day.longestShut)),
    crossings: whole,
    meanCrossing: whole.reduce((total, w) => total + w.length, 0) / whole.length,
    arrival: arrivalWindow(origin),
    departure: departureWindow(hoursSince(end)),
    band,
    price: priceFor(base, tone),
  };
}

export const SEASON: Week[] = Array.from({ length: WEEKS }, (_, i) => buildWeek(i));

/** The vocabulary for a week's crossing, derived from its tone and used everywhere. */
export const toneName = (tone: number) =>
  tone > 0.66 ? 'springs' : tone < 0.34 ? 'neaps' : 'mixed';

export const toneSentence = (week: Week) => {
  const name = toneName(week.tone);
  if (name === 'neaps')
    return 'Neap week. The crossings are at their longest — close to eight hours each — so there is room either side of whatever you are doing.';
  if (name === 'springs')
    return 'Spring week. Each crossing is about an hour shorter than at neaps, which is the hour you would have used for getting back.';
  return 'A week that changes as it goes: the crossings lengthen or shorten by around an hour between the Friday you arrive and the Friday you leave.';
};



export const money = (value: number) => `£${value.toLocaleString('en-GB')}`;
export const hoursLabel = (value: number) => {
  // Round to minutes first. Flooring the hours and rounding the remainder separately prints
  // "5h 60m", which the probe duly did.
  const total = Math.round(value * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
};
export const span = (window: { from: number; to: number }) => `${clock(window.from)}–${clock(window.to)}`;

export const BAND_LABEL: Record<SeasonBand, string> = {
  low: 'Low',
  shoulder: 'Shoulder',
  high: 'High',
  peak: 'Peak',
};

/**
 * Every whole crossing of the season, tagged with where in the cycle it falls.
 *
 * One list, built once, so that no statistic anywhere in this site has to go back to the day
 * bars and get it wrong again.
 */
export const ALL_CROSSINGS: { window: Window; springNeap: number }[] = (() => {
  const first = SEASON[0].days[0].origin;
  const last = SEASON.at(-1)!.days[6].origin + 24;
  return windows(first - 24, last + 24)
    .filter((w) => w.from >= first && w.to <= last)
    .map((window) => ({ window, springNeap: springNeap(window.from + window.length / 2 - 12) }));
})();

/** Mean crossing length over the crossings matching a predicate on cycle position. */
export const crossingMean = (test: (springNeap: number) => boolean) => {
  const picked = ALL_CROSSINGS.filter((c) => test(c.springNeap));
  return {
    count: picked.length,
    mean: picked.reduce((total, c) => total + c.window.length, 0) / picked.length,
  };
};

/** Season-wide figures, quoted on the crossing and booking pages. */
export const SEASON_FACTS = (() => {
  const allDays = SEASON.flatMap((week) => week.days);
  const easiest = [...SEASON].sort((a, b) => a.shutHours - b.shutHours)[0];
  const hardest = [...SEASON].sort((a, b) => b.shutHours - a.shutHours)[0];
  const noAfternoonArrival = SEASON.filter((week) => week.arrival === null);
  const earlyDepartures = SEASON.filter((week) => week.departure && week.departure.to - Math.floor(week.departure.to / 24) * 24 < 8);
  return {
    weeks: SEASON.length,
    days: allDays.length,
    meanShutPerDay: allDays.reduce((t, d) => t + d.shutHours, 0) / allDays.length,
    easiest,
    hardest,
    longestClosure: Math.max(...allDays.map((d) => d.longestShut)),
    threeBarDays: allDays.filter((d) => d.bars.length >= 3).length,
    atNeaps: crossingMean((sn) => sn < 0.15),
    atSprings: crossingMean((sn) => sn > 0.85),
    noAfternoonArrival,
    earlyDepartures,
    cheapest: [...SEASON].sort((a, b) => a.price - b.price)[0],
  };
})();
