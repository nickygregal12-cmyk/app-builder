/**
 * Visual Asset Readiness — Phase 4D.4.
 *
 * The question this answers is asked *before* a visual direction is chosen:
 * can the approved inventory actually support the visual story a direction
 * wants to tell?
 *
 * Getting the order wrong is what produces the familiar failure — an
 * imagery-led design chosen for a business with two logos and no photography,
 * discovered at review as a page of grey rectangles. "No publishable imagery"
 * is a legitimate art-direction input, and treating it as one is the whole
 * point: it selects a typography-led direction rather than breaking an
 * imagery-led one.
 *
 * Nothing here decides rights. Publication is settled upstream by source
 * governance and per-asset decisions, and this reads the resolved answer. An
 * asset that is reference-only counts towards `withheld` and never towards
 * coverage, so a direction can never be justified by a photograph the business
 * has not cleared.
 */

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Coverage classes, and what each one has to be able to do.
 *
 * `hero` is the one with a shape requirement rather than only a count: an
 * opening photograph is cropped wide, and an image with no wide variant and no
 * landscape original will be letterboxed into a shape it was never framed for.
 */
export const COVERAGE_CLASSES = Object.freeze(['hero', 'gallery', 'people', 'logo']);

/** Minimum publishable photographs before a gallery is a gallery rather than a picture. */
const GALLERY_MINIMUM = 2;

function decided(assets, assetDecisions) {
  const decisions = new Map(list(assetDecisions).filter((entry) => entry?.assetId && entry?.effect).map((entry) => [entry.assetId, entry]));
  return assets.map((asset) => {
    const decision = decisions.get(asset.id);
    return decision ? { ...asset, ...decision.effect } : asset;
  });
}

/**
 * Wide enough to open a page.
 *
 * This asked only about variants, which are produced by the optimiser. An asset
 * that has been ingested and not yet optimised has none, so a genuinely wide
 * photograph was invisible here: the Ardwell & Roe benchmark supplied a 2048x1152
 * hero frame and readiness still reported "0 wide enough to open a page", which
 * refused the imagery-led direction on a portfolio practice that had just been
 * given a portfolio. The asset's own dimensions answer the same question when
 * nothing has been derived from it yet, and a variant still wins when one exists
 * — an optimiser crop is a better answer than the original frame, not a
 * different one.
 */
function hasWideCrop(asset) {
  if (list(asset.variants).some((variant) => variant.role === 'hero-16x9')) return true;
  if (list(asset.variants).some((variant) => (variant.width ?? 0) >= (variant.height ?? 0) * 1.4)) return true;
  return (asset.width ?? 0) >= (asset.height ?? 0) * 1.4;
}

/**
 * Classify what a build could actually publish.
 *
 * `supportsImageryLed` is the field with a consumer: `selectVisualDirections`
 * refuses an `imagery-required` direction when it is false. Everything else is
 * evidence for a person reading why.
 */
export function compileAssetReadiness({ knowledgePack = null, assetDecisions = [] } = {}) {
  const all = decided(list(knowledgePack?.assets).filter((asset) => !asset.duplicateOf), assetDecisions);
  const publishable = all.filter((asset) => asset.publishUseAllowed);
  const withheld = all.filter((asset) => !asset.publishUseAllowed);

  const photographs = publishable.filter((asset) => asset.kind === 'image');
  const coverage = {
    hero: photographs.filter(hasWideCrop).map((asset) => asset.id),
    gallery: photographs.map((asset) => asset.id),
    people: publishable.filter((asset) => /team|staff|person|people|portrait|headshot/i.test(`${asset.metadata?.alt ?? ''} ${asset.label ?? ''}`)).map((asset) => asset.id),
    logo: publishable.filter((asset) => asset.kind === 'logo').map((asset) => asset.id),
  };

  const supportsImageryLed = coverage.hero.length >= 1 && coverage.gallery.length >= GALLERY_MINIMUM;
  const strategy = supportsImageryLed
    ? 'imagery-viable'
    : photographs.length > 0
      ? 'imagery-supporting'
      : 'typography-led';

  const strategyReason = supportsImageryLed
    ? `${coverage.gallery.length} publishable photographs, ${coverage.hero.length} of them wide enough to open a page.`
    : photographs.length > 0
      ? `${photographs.length} publishable ${photographs.length === 1 ? 'photograph' : 'photographs'}, ${coverage.hero.length} wide enough to open a page — enough to support a page, not enough to lead one.`
      : withheld.length > 0
        ? `No photograph is cleared for publication. ${withheld.length} ${withheld.length === 1 ? 'asset is' : 'assets are'} held back by rights or approval, so the direction has to carry the page with type and layout.`
        : 'No photographs were supplied at all, so the direction has to carry the page with type and layout.';

  return {
    schemaVersion: 1,
    authority: 'source-governance',
    counts: {
      total: all.length,
      publishable: publishable.length,
      withheld: withheld.length,
      photographs: photographs.length,
    },
    coverage,
    // Named rather than counted, so a review can see which asset was held back
    // and why instead of being told a number.
    withheld: withheld.map((asset) => ({ id: asset.id, kind: asset.kind, rightsStatus: asset.rightsStatus, assetStatus: asset.assetStatus })),
    supportsImageryLed,
    strategy,
    strategyReason,
    // What an operator could do about it. A readiness result that only reports
    // a shortfall leaves the person reading it with nowhere to go.
    remedies: supportsImageryLed ? [] : remedies({ photographs, withheld }),
  };
}

function remedies({ photographs, withheld }) {
  const options = [];
  if (withheld.length) options.push({ id: 'clear-rights', detail: `Declare publication rights for ${withheld.length} withheld ${withheld.length === 1 ? 'asset' : 'assets'} where the business actually holds them.` });
  options.push({ id: 'request-owner-assets', detail: photographs.length ? 'Ask the owner for a wide opening photograph and at least two more of the work.' : 'Ask the owner for photographs of the work.' });
  options.push({ id: 'typography-led-direction', detail: 'Choose a direction that carries the page with type, grid and hierarchy. This needs nothing from the owner and is the current selection.' });
  return options;
}
