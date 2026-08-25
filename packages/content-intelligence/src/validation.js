import { ASSET_STATUSES, RIGHTS_STATUSES, SOURCE_CHANNELS, SOURCE_ROLES } from './governance.js';

export function validateKnowledgePack(pack) {
  const errors = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return { valid: false, errors: ['Knowledge pack must be an object.'] };
  if (pack.schemaVersion !== 1) errors.push('schemaVersion must equal 1.');
  if (typeof pack.intelligenceVersion !== 'string' || !pack.intelligenceVersion) errors.push('intelligenceVersion is required.');
  const arrays = ['sources', 'facts', 'assets', 'content', 'chunks', 'references', 'requirements', 'research', 'generatedCopy'];
  for (const field of arrays) if (!Array.isArray(pack[field])) errors.push(`${field} must be an array.`);
  if (!pack.brand || typeof pack.brand !== 'object') errors.push('brand must be an object.');
  if (!pack.companyProfile || typeof pack.companyProfile !== 'object') errors.push('companyProfile must be an object.');
  if (typeof pack.packHash !== 'string' || !/^[a-f0-9]{64}$/.test(pack.packHash)) errors.push('packHash must be a SHA-256 hex digest.');

  const sourceIds = new Set();
  const sourcesById = new Map();
  for (const source of pack.sources ?? []) {
    if (!source.id) {
      errors.push('Every source requires an id.');
      continue;
    }
    sourceIds.add(source.id);
    sourcesById.set(source.id, source);
    if (!RIGHTS_STATUSES.includes(source.rightsStatus)) errors.push(`Source ${source.id} has invalid rightsStatus.`);
    if (!ASSET_STATUSES.includes(source.assetStatus)) errors.push(`Source ${source.id} has invalid assetStatus.`);
    if (!SOURCE_ROLES.includes(source.sourceRole)) errors.push(`Source ${source.id} has invalid sourceRole.`);
    if (!SOURCE_CHANNELS.includes(source.sourceChannel)) errors.push(`Source ${source.id} has invalid sourceChannel.`);
    if (source.instructionAuthority !== 'none') errors.push(`Source ${source.id} must have instructionAuthority none.`);
    if (typeof source.publishUseAllowed !== 'boolean') errors.push(`Source ${source.id} must declare publishUseAllowed.`);
    if (source.assetStatus === 'approved' && source.rightsStatus !== 'approved-for-use') errors.push(`Source ${source.id} cannot be approved without approved-for-use rights.`);
    if (source.publishUseAllowed && (source.rightsStatus !== 'approved-for-use' || source.assetStatus !== 'approved')) errors.push(`Source ${source.id} cannot be publishable without approved rights and approval state.`);
  }

  for (const fact of pack.facts ?? []) {
    if (!fact.id || !fact.path || fact.value === undefined) errors.push('Every fact requires id, path and value.');
    if (!sourceIds.has(fact.sourceId)) errors.push(`Fact ${fact.id ?? 'unknown'} references missing source ${fact.sourceId}.`);
    if (!(Number.isFinite(fact.confidence) && fact.confidence >= 0 && fact.confidence <= 1)) errors.push(`Fact ${fact.id ?? 'unknown'} has invalid confidence.`);
    if (!['user-provided', 'candidate', 'verified', 'rejected'].includes(fact.verification)) errors.push(`Fact ${fact.id ?? 'unknown'} has invalid verification state.`);
  }

  const assetsById = new Map();
  for (const asset of pack.assets ?? []) {
    assetsById.set(asset.id, asset);
    const source = sourcesById.get(asset.sourceId);
    if (!source) {
      errors.push(`Asset ${asset.id ?? 'unknown'} references missing source ${asset.sourceId}.`);
      continue;
    }
    for (const field of ['provenance', 'rightsStatus', 'assetStatus', 'sourceRole', 'sourceChannel', 'instructionAuthority', 'publishUseAllowed']) {
      if (asset[field] !== source[field]) errors.push(`Asset ${asset.id ?? 'unknown'} governance field ${field} must match source ${source.id}.`);
    }
  }

  for (const chunk of pack.chunks ?? []) {
    if (!chunk.id || !/^[a-f0-9]{64}$/.test(chunk.contentHash ?? '')) errors.push('Every chunk requires an id and SHA-256 contentHash.');
    for (const sourceId of chunk.sourceIds ?? []) if (!sourceIds.has(sourceId)) errors.push(`Chunk ${chunk.id ?? 'unknown'} references missing source ${sourceId}.`);
  }

  if (pack.brand && typeof pack.brand === 'object') {
    for (const candidate of pack.brand.sourceCandidates ?? []) {
      const source = sourcesById.get(candidate.sourceId);
      if (!source) errors.push(`Brand source candidate references missing source ${candidate.sourceId}.`);
      else if (!['primary-brand', 'brand-supporting'].includes(source.sourceRole)) errors.push(`Brand source candidate ${candidate.sourceId} is not a brand source.`);
    }
    for (const assetId of pack.brand.publishableAssetIds ?? []) {
      const asset = assetsById.get(assetId);
      if (!asset?.publishUseAllowed) errors.push(`Brand publishable asset ${assetId} is missing or not approved for publication.`);
    }
    for (const assetId of pack.brand.referenceOnlyAssetIds ?? []) {
      const asset = assetsById.get(assetId);
      if (!asset || asset.publishUseAllowed) errors.push(`Brand reference-only asset ${assetId} is missing or is publishable.`);
    }
  }

  for (const item of pack.generatedCopy ?? []) if (item.provenance !== 'generated') errors.push('generatedCopy entries must explicitly use generated provenance.');
  return { valid: errors.length === 0, errors };
}

export function assertKnowledgePack(pack) {
  const result = validateKnowledgePack(pack);
  if (!result.valid) throw new Error(`Invalid knowledge pack:\n- ${result.errors.join('\n- ')}`);
  return pack;
}
