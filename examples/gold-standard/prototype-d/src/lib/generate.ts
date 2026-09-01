/**
 * The dataset, and the generator that makes it.
 *
 * SYNTHETIC. Nothing here is a measurement. The catchments are invented; the mechanism is real.
 *
 * ## Why a generator rather than a table of numbers
 *
 * A report whose finding is "the figures cannot be read without their coverage" has to be very
 * careful about where its own figures came from. Typing a table by hand would mean typing the
 * finding, and the chart on the front page would then be a picture of a decision rather than of
 * anything.
 *
 * So the model is: each catchment has a **latent** monthly spill rate — the discharges that
 * actually happen, which in the real world nobody observes — and, separately, a **coverage**
 * profile describing how much of its monitoring estate is working. The reported figure is what
 * the working monitors would have seen. Reported ≈ latent × coverage.
 *
 * The two are drawn independently. Nothing in here makes dirty rivers badly monitored or the
 * reverse; the relationship the report describes is a consequence of observing a real process
 * through an incomplete instrument, and it falls out of the simulation rather than being put in.
 *
 * That cuts both ways, and the method page says so: the pattern is a genuine consequence of the
 * model, and the model is ours.
 *
 * ## Determinism
 *
 * A seeded PRNG, so the report is the same on every machine and on every build. A dataset that
 * differed between two renders would make every figure number in the document a lie.
 */

/** mulberry32. Small, fast, and good enough for a simulation nobody is betting on. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 20260114;
export const MONTHS = 60;
export const START = { year: 2021, month: 1 };

export interface Catchment {
  slug: string;
  name: string;
  region: string;
  /** Storm overflows in the catchment. */
  overflows: number;
  population: number;
  operator: string;
  /** Discharges per overflow per month, before seasonality. Drawn independently of coverage. */
  latentRate: number;
  /** Where this catchment's monitor availability starts and where it drifts to. */
  coverageStart: number;
  coverageEnd: number;
  note: string;
}

/**
 * Twelve invented catchments.
 *
 * Invented rather than real, and that is a deliberate safety decision rather than laziness.
 * Attaching simulated pollution figures to a real river would produce a chart that is one
 * screenshot away from being quoted as a measurement of somewhere people live.
 *
 * `latentRate` and the coverage pair are set independently of each other, and that independence
 * is checked rather than asserted: `probe.mjs` computes the correlation between them and the
 * method page publishes it. The first draft of this table failed that check at r = -0.87,
 * because the badly-monitored catchments had all been given high latent rates — the finding
 * written into the data, which is exactly what this file claims not to do. Everything the report
 * finds now comes from combining two independent columns.
 */
export const CATCHMENTS: Catchment[] = [
  { slug: 'ardenbeck', name: 'Ardenbeck', region: 'North West', overflows: 218, population: 412000, operator: 'Operator A', latentRate: 1.24, coverageStart: 0.71, coverageEnd: 0.93, note: 'Dense urban network on a short, steep river. A high latent rate and middling coverage, and its reported figures are the highest here — which is what a badly affected, adequately watched catchment looks like.' },
  { slug: 'brack-water', name: 'Brack Water', region: 'North East', overflows: 96, population: 138000, operator: 'Operator B', latentRate: 0.62, coverageStart: 0.44, coverageEnd: 0.58, note: 'The worst-monitored catchment in the study and, on latent rate, among the least affected. Both of those are true at once, and only one of them is visible in the published counts.' },
  { slug: 'cleeve-brook', name: 'Cleeve Brook', region: 'South West', overflows: 141, population: 205000, operator: 'Operator C', latentRate: 0.68, coverageStart: 0.88, coverageEnd: 0.95, note: 'Well monitored throughout, and genuinely quiet. The only catchment here where the reported figure and the underlying rate say the same thing.' },
  { slug: 'darrow', name: 'Darrow', region: 'Midlands', overflows: 307, population: 690000, operator: 'Operator A', latentRate: 0.58, coverageStart: 0.79, coverageEnd: 0.86, note: 'The largest estate in the study and the least affected per overflow. Coverage is middling and has barely moved in five years.' },
  { slug: 'elverley', name: 'Elverley', region: 'East', overflows: 74, population: 61000, operator: 'Operator D', latentRate: 1.31, coverageStart: 0.38, coverageEnd: 0.49, note: 'The highest latent rate in the study and the fewest working monitors. It reports fewer spills per overflow than Cleeve Brook, which is the inversion this report is about.' },
  { slug: 'fenn-rea', name: 'Fenn Rea', region: 'Midlands', overflows: 163, population: 244000, operator: 'Operator C', latentRate: 1.12, coverageStart: 0.83, coverageEnd: 0.91, note: 'Badly affected and well monitored, so its figures are high and are close to right. It is regularly named as one of the worst rivers in the study on the strength of being watched.' },
  { slug: 'garrow-dale', name: 'Garrow Dale', region: 'North West', overflows: 112, population: 88000, operator: 'Operator B', latentRate: 0.71, coverageStart: 0.52, coverageEnd: 0.61, note: 'Poorly monitored and moderately affected. Its published figures are low for both reasons at once, which is why coverage cannot be read off a spill count.' },
  { slug: 'haversby', name: 'Haversby', region: 'South East', overflows: 189, population: 356000, operator: 'Operator E', latentRate: 0.81, coverageStart: 0.86, coverageEnd: 0.94, note: 'Steady, well-instrumented, unremarkable. Useful mainly as a reference against which the others can be read.' },
  { slug: 'kilnsey-water', name: 'Kilnsey Water', region: 'North East', overflows: 58, population: 41000, operator: 'Operator D', latentRate: 1.18, coverageStart: 0.41, coverageEnd: 0.55, note: 'A high latent rate on the smallest estate, and in the worst month of 2022 nineteen working monitors out of fifty-eight.' },
  { slug: 'lyde', name: 'Lyde', region: 'South West', overflows: 134, population: 176000, operator: 'Operator E', latentRate: 0.94, coverageStart: 0.80, coverageEnd: 0.89, note: 'Improving coverage on a moderately affected estate. The 2024 rise in its reported spills is almost entirely a rise in monitoring.' },
  { slug: 'marden-vale', name: 'Marden Vale', region: 'South East', overflows: 246, population: 498000, operator: 'Operator A', latentRate: 0.99, coverageStart: 0.75, coverageEnd: 0.90, note: 'Large and urban. The clearest example of a catchment whose figures rose while its river did not change.' },
  { slug: 'nettlefold', name: 'Nettlefold', region: 'East', overflows: 87, population: 72000, operator: 'Operator B', latentRate: 0.87, coverageStart: 0.47, coverageEnd: 0.56, note: 'Poorly monitored and about average for latent rate, and consistently reported as one of the quieter catchments in the study.' },
];

export interface MonthPoint {
  index: number;
  year: number;
  month: number;
  /** Fraction of the estate reporting. */
  coverage: number;
  /** Discharges that occurred. Unobservable in reality; the point of the simulation. */
  latent: number;
  /** Discharges the working monitors saw. This is the number that gets published. */
  reported: number;
}

/** Storm overflows discharge in wet weather, so the year has a shape. */
const seasonality = (month: number) => 1 + 0.55 * Math.cos(((month - 1) / 12) * 2 * Math.PI);

export interface Series {
  catchment: Catchment;
  points: MonthPoint[];
  totals: { latent: number; reported: number; coverage: number; perOverflow: number; latentPerOverflow: number };
}

/**
 * Run the simulation.
 *
 * Coverage drifts from start to end with month-to-month noise and occasional outages; latent
 * discharges come from the catchment's own rate and the season; reported is the latent count
 * thinned by whatever was watching.
 */
export function simulate(): Series[] {
  const random = rng(SEED);
  return CATCHMENTS.map((catchment) => {
    const points: MonthPoint[] = [];
    for (let index = 0; index < MONTHS; index += 1) {
      const year = START.year + Math.floor(index / 12);
      const month = (index % 12) + 1;
      const progress = index / (MONTHS - 1);

      // Coverage: a drift, some noise, and an occasional bad month where a batch of monitors
      // drops out at once. Real availability does not degrade smoothly.
      const drift = catchment.coverageStart + (catchment.coverageEnd - catchment.coverageStart) * progress;
      const outage = random() < 0.06 ? 0.12 + random() * 0.16 : 0;
      const coverage = Math.min(0.99, Math.max(0.16, drift + (random() - 0.5) * 0.09 - outage));

      const latent = Math.round(catchment.overflows * catchment.latentRate * seasonality(month) * (0.82 + random() * 0.36));
      // What the working monitors saw. Thinning, with a little noise so it is not a clean
      // multiplication anybody could invert by eye.
      const reported = Math.round(latent * coverage * (0.94 + random() * 0.12));

      points.push({ index, year, month, coverage, latent, reported });
    }

    const latentTotal = points.reduce((sum, point) => sum + point.latent, 0);
    const reportedTotal = points.reduce((sum, point) => sum + point.reported, 0);
    return {
      catchment,
      points,
      totals: {
        latent: latentTotal,
        reported: reportedTotal,
        coverage: points.reduce((sum, point) => sum + point.coverage, 0) / points.length,
        perOverflow: reportedTotal / catchment.overflows / (MONTHS / 12),
        latentPerOverflow: latentTotal / catchment.overflows / (MONTHS / 12),
      },
    };
  });
}
