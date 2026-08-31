/**
 * Benchmark asset readiness.
 *
 * A visual-ceiling benchmark asks one question: what does the factory build when
 * the quality of the input is not the limiter? Photographing that benchmark
 * before its photographs exist does not partially answer the question — it
 * answers a different one, and then the answer sits in the record wearing the
 * first question's name. An imagery-poor run labelled "ideal input" is worse
 * than no run at all, because the next person reads it as the ceiling.
 *
 * So this refuses. It is the asset counterpart to
 * `candidate-truth-readiness.mjs`: that module decides whether the *truth* is
 * strong enough to mint candidates, and this decides whether the *assets* are
 * rich enough for a run to be called an ideal-input baseline.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not stop a build. A benchmark project may generate, install, check
 * and be photographed at any time, and doing so while the asset set is
 * incomplete is useful work — it is how the composition is developed. The only
 * thing withheld is the *label*, and the label is the thing that carries meaning
 * into a review.
 *
 * It also does not judge photographs. There is no quality score here and there
 * should not be one: whether an image is any good is a question for the
 * independent reviewer, and a floor is a floor. This counts files against a
 * plan, and the plan is authored beside the source pack by whoever knows what
 * the benchmark is testing.
 *
 * It is generic to visual-excellence benchmarks. Nothing here knows the name of
 * a business, a provider or a case.
 */

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Roles that can open a page.
 *
 * A benchmark with a wordmark and twelve material details has assets and still
 * cannot open. `hero` is the role that carries an opening; a `project-primary`
 * frame is the accepted substitute, because a work-led practice legitimately
 * opens on its strongest project rather than on a made-for-purpose hero.
 */
const HERO_CAPABLE_ROLES = Object.freeze(['hero', 'project-primary']);
const BRAND_ROLES = Object.freeze(['brand']);
const PROJECT_ROLES = Object.freeze(['project-primary', 'project-supporting', 'detail']);
const PORTRAIT_ROLES = Object.freeze(['portrait']);

const DEFAULT_FLOOR = Object.freeze({
  requiredAssetsPresent: 'all',
  minimumProjectsWithPrimary: 0,
  minimumProjectAssets: 0,
  minimumPortraits: 0,
  brandAssetRequired: false,
  heroCapableRequired: false,
});

/**
 * Which planned assets actually have bytes.
 *
 * `present` is supplied by the caller rather than discovered here, because
 * "this file exists" is a question about a directory or a knowledge pack and
 * this module must stay indifferent to where the bytes came from. Pass the set
 * of asset ids that have been ingested; anything else in the plan is missing.
 */
export function assessBenchmarkAssetReadiness({ plan = null, presentAssetIds = [] } = {}) {
  const planned = list(plan?.assets);
  const present = new Set(list(presentAssetIds));
  const floor = { ...DEFAULT_FLOOR, ...plan?.floor };

  const withState = planned.map((asset) => ({
    assetId: asset.assetId,
    role: asset.role,
    project: asset.project ?? null,
    required: asset.required === true,
    present: present.has(asset.assetId),
  }));

  const missingRequired = withState.filter((asset) => asset.required && !asset.present);
  const presentAssets = withState.filter((asset) => asset.present);

  const projectsWithPrimary = new Set(
    presentAssets.filter((asset) => asset.role === 'project-primary' && asset.project).map((asset) => asset.project),
  );
  const projectAssetCount = presentAssets.filter((asset) => PROJECT_ROLES.includes(asset.role)).length;
  const portraitCount = presentAssets.filter((asset) => PORTRAIT_ROLES.includes(asset.role)).length;
  const hasBrand = presentAssets.some((asset) => BRAND_ROLES.includes(asset.role));
  const hasHeroCapable = presentAssets.some((asset) => HERO_CAPABLE_ROLES.includes(asset.role));

  // Each shortfall is named in the words of the thing it is short of, so a
  // refusal tells whoever is producing the bytes what to produce next rather
  // than only that the number was too small.
  const shortfalls = [];
  if (missingRequired.length) {
    shortfalls.push(`${missingRequired.length} required asset(s) have no bytes: ${missingRequired.map((asset) => asset.assetId).join(', ')}.`);
  }
  if (floor.brandAssetRequired && !hasBrand) shortfalls.push('No brand asset is present, so the site cannot carry its own wordmark.');
  if (floor.heroCapableRequired && !hasHeroCapable) shortfalls.push('No hero-capable asset is present, so no page can open on an image.');
  if (projectsWithPrimary.size < (floor.minimumProjectsWithPrimary ?? 0)) {
    shortfalls.push(`${projectsWithPrimary.size} project(s) have a primary frame, below the floor of ${floor.minimumProjectsWithPrimary}. A work index below that reads as a sample rather than a portfolio.`);
  }
  if (projectAssetCount < (floor.minimumProjectAssets ?? 0)) {
    shortfalls.push(`${projectAssetCount} project asset(s) present, below the floor of ${floor.minimumProjectAssets}. Below that no project can carry a sequence.`);
  }
  if (portraitCount < (floor.minimumPortraits ?? 0)) {
    shortfalls.push(`${portraitCount} portrait(s) present, below the floor of ${floor.minimumPortraits}.`);
  }

  const requiredCount = withState.filter((asset) => asset.required).length;
  const ready = shortfalls.length === 0;

  return {
    schemaVersion: 1,
    authority: 'benchmark-asset-plan',
    caseId: plan?.caseId ?? null,
    corpus: plan?.corpus ?? null,
    ready,
    // The label this gate exists to withhold. A run may happen either way; only
    // one of them may be recorded as the ideal-input measurement.
    baselineFreezable: ready,
    runLabel: ready ? 'ideal-input-visual-ceiling-baseline' : 'asset-incomplete-development-run',
    counts: {
      planned: withState.length,
      present: presentAssets.length,
      required: requiredCount,
      requiredPresent: requiredCount - missingRequired.length,
      projectsWithPrimary: projectsWithPrimary.size,
      projectAssets: projectAssetCount,
      portraits: portraitCount,
    },
    missingRequired: missingRequired.map((asset) => asset.assetId),
    shortfalls,
    reason: ready
      ? 'Every required asset has bytes and the plan’s floor is met, so a run over this input measures the factory rather than the asset gap.'
      : `This input cannot be frozen as an ideal-input baseline. ${shortfalls.join(' ')} A benchmark photographed without its photographs measures the asset gap and would be read later as the ceiling.`,
  };
}
