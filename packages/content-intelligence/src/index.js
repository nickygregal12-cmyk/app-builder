import { buildKnowledgePack as buildRawKnowledgePack } from './knowledge.js';
import { sha256 } from './shared.js';

export { RIGHTS_STATUSES, ASSET_STATUSES, SOURCE_ROLES, SOURCE_CHANNELS, ASSET_DECISIONS, CROP_REVIEWS, RIGHTS_DECLARATIONS, deriveSourceGovernance, decideAssetGovernance } from './governance.js';
export { CONTENT_INTELLIGENCE_VERSION, DEFAULT_LIMITS, assertSafeRemoteUrl, inferSourceKind } from './shared.js';
export { normalizeReferenceSource, normalizeSource, normalizeSources, normalizeWebsite } from './normalize.js';
export { assertKnowledgePack, validateKnowledgePack } from './validation.js';

export function buildKnowledgePack(normalizedSources, options = {}) {
  const raw = buildRawKnowledgePack(normalizedSources, options);
  const sources = raw.sources.map((source) => {
    const stableSource = { ...source };
    delete stableSource.cacheHit;
    stableSource.extractionSummary = { ...stableSource.extractionSummary };
    delete stableSource.extractionSummary.cacheHit;
    return stableSource;
  });
  const withoutHash = { ...raw, sources };
  delete withoutHash.packHash;
  return { ...withoutHash, packHash: sha256(JSON.stringify(withoutHash)) };
}
