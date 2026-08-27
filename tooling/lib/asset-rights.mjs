/**
 * Did this build publish anything it was not cleared to publish?
 *
 * Rights are not decided here and never were. Ingestion settles them per source
 * and per asset — `rightsStatus` is the permission, `assetStatus` is the
 * owner's approval — and both travel with the asset into the build. This asks
 * the one question those two fields exist to answer: an asset reached the
 * generated project's public directory, so was it allowed to?
 *
 * It reads the build's own asset manifest rather than the knowledge pack,
 * because the pack describes what was available and the manifest describes what
 * shipped. A pack entry that was correctly withheld is not a finding, and an
 * asset that shipped is a finding whatever the pack later says.
 */

/** Permission to publish. Anything else is reference material or unresolved. */
const PUBLISHABLE_RIGHTS = 'approved-for-use';

/** Approval states that mean the owner said no, whatever the rights say. */
const REFUSED_APPROVAL = new Set(['rejected', 'do-not-use']);

export const ASSET_RIGHTS_CHECKS = Object.freeze({
  'published-without-rights': {
    severity: 'blocker',
    title: 'An asset was published without publication rights',
    guidance: 'Public visibility is not publication permission. Clear the rights at ingestion or withhold the asset.',
  },
  'published-while-rejected': {
    severity: 'blocker',
    title: 'An asset the owner refused was published',
    guidance: 'A rejected or do-not-use asset must never reach a build. Remove it from the composition.',
  },
});

/**
 * @param {object} input
 * @param {Record<string, object>} input.assets  The build's own asset manifest, keyed by asset id.
 * @param {string|null} input.compositionHash    The build this report is evidence for.
 */
export function auditAssetRights({ assets = {}, compositionHash = null } = {}) {
  const findings = [];
  const entries = Object.values(assets ?? {});
  for (const asset of entries) {
    const where = `asset ${asset?.id ?? 'unknown'} (${asset?.kind ?? 'unknown kind'})`;
    if (REFUSED_APPROVAL.has(asset?.assetStatus)) {
      findings.push({
        check: 'published-while-rejected',
        ...ASSET_RIGHTS_CHECKS['published-while-rejected'],
        where,
        detail: `assetStatus is ${asset.assetStatus}, and ${asset.variants?.length ?? 0} variant(s) were copied into the build.`,
      });
    }
    if (asset?.rightsStatus !== PUBLISHABLE_RIGHTS) {
      findings.push({
        check: 'published-without-rights',
        ...ASSET_RIGHTS_CHECKS['published-without-rights'],
        where,
        detail: `rightsStatus is ${asset?.rightsStatus ?? 'absent'}, which is not ${PUBLISHABLE_RIGHTS}.`,
      });
    }
  }
  return {
    schemaVersion: 1,
    authority: 'asset-rights',
    compositionHash,
    published: entries.length,
    findings,
    // A build that published nothing is clean rather than unmeasured: it is a
    // true statement about what shipped, and the gate needs an answer either way.
    clean: findings.length === 0,
  };
}
