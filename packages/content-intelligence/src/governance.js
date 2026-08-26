export const RIGHTS_STATUSES = Object.freeze(['approved-for-use', 'reference-only', 'unknown', 'restricted']);
export const ASSET_STATUSES = Object.freeze(['approved', 'suggested', 'generated', 'rejected', 'do-not-use']);
export const SOURCE_ROLES = Object.freeze(['primary-brand', 'brand-supporting', 'content', 'requirement', 'research']);
export const SOURCE_CHANNELS = Object.freeze(['upload', 'website', 'facebook', 'instagram', 'linkedin', 'other-public']);

function oneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}.`);
  return value;
}

function sourceChannel(source) {
  const uri = String(source.uri ?? '');
  if (!/^https?:/i.test(uri)) return 'upload';
  let host = '';
  try { host = new URL(uri).hostname.toLowerCase().replace(/^www\./, ''); } catch { return 'other-public'; }
  if (host === 'facebook.com' || host.endsWith('.facebook.com')) return 'facebook';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin';
  if (source.provenance === 'existing-site' || /existing[- ]site|company website/i.test(source.purpose ?? '')) return 'website';
  return 'other-public';
}

function sourceRole(source, kind) {
  if (source.sourceRole) return oneOf(source.sourceRole, SOURCE_ROLES, 'sourceRole');
  const purpose = String(source.purpose ?? '');
  if (kind === 'logo' || kind === 'screenshot' || /brand|style|visual|identity/i.test(purpose)) return 'brand-supporting';
  if (source.provenance === 'existing-site' || /existing[- ]site|company website/i.test(purpose)) return 'primary-brand';
  if (/requirement|brief|scope/i.test(purpose)) return 'requirement';
  if (source.provenance === 'external-research' || /research|reference/i.test(purpose)) return 'research';
  return 'content';
}

function rightsStatus(source) {
  if (source.rightsStatus) return oneOf(source.rightsStatus, RIGHTS_STATUSES, 'rightsStatus');
  if (source.approvedForUse === true) return 'approved-for-use';
  if (/^https?:/i.test(source.uri ?? '')) return 'reference-only';
  if (source.provenance === 'generated') return 'approved-for-use';
  return 'unknown';
}

function assetStatus(source, rights) {
  if (source.assetStatus) return oneOf(source.assetStatus, ASSET_STATUSES, 'assetStatus');
  if (source.provenance === 'generated') return 'generated';
  if (rights === 'reference-only' || rights === 'restricted') return 'do-not-use';
  if (source.approvedForUse === true && rights === 'approved-for-use') return 'approved';
  return 'suggested';
}

export function deriveSourceGovernance(source, kind) {
  const rights = rightsStatus(source);
  const status = assetStatus(source, rights);
  if (status === 'approved' && rights !== 'approved-for-use') {
    throw new Error('assetStatus approved requires rightsStatus approved-for-use.');
  }
  return {
    rightsStatus: rights,
    assetStatus: status,
    sourceRole: sourceRole(source, kind),
    sourceChannel: sourceChannel(source),
    instructionAuthority: 'none',
    publishUseAllowed: rights === 'approved-for-use' && status === 'approved',
  };
}

export const ASSET_DECISIONS = Object.freeze(['approve', 'reject', 'do-not-use']);
export const CROP_REVIEWS = Object.freeze(['pending', 'approved', 'rejected']);
export const RIGHTS_DECLARATIONS = Object.freeze(['owned-by-the-business', 'licensed-for-publication']);

/**
 * Resolve one per-asset decision.
 *
 * Approving a source is not approving every asset derived from it. A company
 * page can be read for what it says without its photographs becoming
 * republishable, so an approval that outruns the source's own rights needs a
 * declaration about this asset specifically. That declaration is made once, per
 * asset, by a person; it is never inferred from the asset being publicly
 * visible, which is what stops one click on a public site turning it into a
 * republishable bucket.
 *
 * Narrowing never needs a declaration. Refusing to publish something is always
 * allowed.
 */
export function decideAssetGovernance(asset, source, { decision, rightsDeclaration = null, cropReview = 'pending' } = {}) {
  if (!ASSET_DECISIONS.includes(decision)) throw new Error(`Unsupported asset decision: ${decision}`);
  if (!CROP_REVIEWS.includes(cropReview)) throw new Error(`Unsupported crop review state: ${cropReview}`);
  if (rightsDeclaration !== null && !RIGHTS_DECLARATIONS.includes(rightsDeclaration)) {
    throw new Error(`Unsupported rights declaration: ${rightsDeclaration}`);
  }

  if (decision === 'approve') {
    const sourceApproved = source?.rightsStatus === 'approved-for-use';
    if (!sourceApproved && !rightsDeclaration) {
      throw new Error(`Asset ${asset.id} comes from a source that is not approved for use, so approving it needs an explicit rights declaration for this asset.`);
    }
    if (asset.duplicateOf) throw new Error(`Asset ${asset.id} is an exact duplicate of ${asset.duplicateOf}; approve that one instead.`);
    return { rightsStatus: 'approved-for-use', assetStatus: 'approved', publishUseAllowed: true };
  }
  if (decision === 'reject') return { rightsStatus: asset.rightsStatus, assetStatus: 'rejected', publishUseAllowed: false };
  return { rightsStatus: asset.rightsStatus, assetStatus: 'do-not-use', publishUseAllowed: false };
}
