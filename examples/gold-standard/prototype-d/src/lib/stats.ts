/**
 * Everything the report states as a number.
 *
 * Nothing on the site types a figure. Every value a sentence quotes is imported from here, so a
 * paragraph and the chart beside it cannot disagree — which on a document whose whole argument
 * is about numbers being read carelessly would be the one unforgivable defect.
 */
import { simulate, MONTHS, CATCHMENTS, type Series } from './generate';

export const SERIES: Series[] = simulate();
export const seriesFor = (slug: string) => SERIES.find((entry) => entry.catchment.slug === slug)!;

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const cov = xs.reduce((total, x, i) => total + (x - mx) * (ys[i] - my), 0);
  const vx = xs.reduce((total, x) => total + (x - mx) ** 2, 0);
  const vy = ys.reduce((total, y) => total + (y - my) ** 2, 0);
  return cov / Math.sqrt(vx * vy);
}

const coverage = SERIES.map((s) => s.totals.coverage);
const reported = SERIES.map((s) => s.totals.perOverflow);
const latent = SERIES.map((s) => s.totals.latentPerOverflow);

/**
 * The two correlations the report turns on.
 *
 * `reportedVsCoverage` is what the published figures actually measure. `latentVsCoverage` is the
 * control: the two inputs were drawn independently, and if this were not near zero the finding
 * would have been written into the data rather than found in it. An earlier draft of the
 * catchment table failed exactly that check at -0.87, and the method page publishes this number
 * for the same reason a paper publishes its controls.
 */
export const R = {
  reportedVsCoverage: pearson(coverage, reported),
  latentVsCoverage: pearson(coverage, latent),
  reportedVsLatent: pearson(latent, reported),
};

export const OVERALL = {
  catchments: SERIES.length,
  months: MONTHS,
  overflows: CATCHMENTS.reduce((total, c) => total + c.overflows, 0),
  population: CATCHMENTS.reduce((total, c) => total + c.population, 0),
  meanCoverage: coverage.reduce((a, b) => a + b, 0) / coverage.length,
  worstCoverage: Math.min(...coverage),
  bestCoverage: Math.max(...coverage),
  reportedTotal: SERIES.reduce((total, s) => total + s.totals.reported, 0),
  latentTotal: SERIES.reduce((total, s) => total + s.totals.latent, 0),
  /** The single worst catchment-month anywhere in the study. */
  worstMonth: SERIES.flatMap((s) => s.points.map((p) => ({ s, p })))
    .reduce((worst, entry) => (entry.p.coverage < worst.p.coverage ? entry : worst)),
};

export const byReported = [...SERIES].sort((a, b) => a.totals.perOverflow - b.totals.perOverflow);
export const byCoverage = [...SERIES].sort((a, b) => a.totals.coverage - b.totals.coverage);
export const byLatent = [...SERIES].sort((a, b) => b.totals.latentPerOverflow - a.totals.latentPerOverflow);

/**
 * The inversion, found rather than chosen.
 *
 * A pair where the catchment with the higher underlying rate reports fewer spills per overflow,
 * ranked by how wide the gap is. If the simulation ever stopped producing one, the report would
 * have to stop making its central claim — so it is computed and the page reads from it.
 */
export const INVERSIONS = SERIES.flatMap((a) =>
  SERIES.filter((b) =>
    a.catchment.slug !== b.catchment.slug
    && a.totals.latentPerOverflow > b.totals.latentPerOverflow
    && a.totals.perOverflow < b.totals.perOverflow)
    .map((b) => ({
      dirtier: a,
      cleaner: b,
      latentGap: a.totals.latentPerOverflow - b.totals.latentPerOverflow,
      reportedGap: b.totals.perOverflow - a.totals.perOverflow,
      coverageGap: b.totals.coverage - a.totals.coverage,
    })))
  .sort((x, y) => (y.latentGap + y.reportedGap) - (x.latentGap + x.reportedGap));

export const HEADLINE_INVERSION = INVERSIONS[0];

export const pct = (value: number, places = 0) => `${(value * 100).toFixed(places)}%`;
export const num = (value: number, places = 0) => value.toLocaleString('en-GB', { minimumFractionDigits: places, maximumFractionDigits: places });
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
