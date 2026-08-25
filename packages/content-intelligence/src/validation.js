import { validateContract } from '@app-builder/contracts';

// `schemas/knowledge-pack.schema.json` is the structural authority: required
// fields, enums, governance constants and hash formats live there. This module
// keeps only the relational and cross-entity governance rules that JSON Schema
// cannot express.
export function validateKnowledgePack(pack) {
  const errors = validateContract('knowledge-pack', pack);
  if (errors.length) return { valid: false, errors };

  const sourceIds = new Set();
  const sourcesById = new Map();
  for (const source of pack.sources) {
    sourceIds.add(source.id);
    sourcesById.set(source.id, source);
    if (source.assetStatus === 'approved' && source.rightsStatus !== 'approved-for-use') errors.push(`Source ${source.id} cannot be approved without approved-for-use rights.`);
    if (source.publishUseAllowed && (source.rightsStatus !== 'approved-for-use' || source.assetStatus !== 'approved')) errors.push(`Source ${source.id} cannot be publishable without approved rights and approval state.`);
  }

  for (const fact of pack.facts) {
    if (!sourceIds.has(fact.sourceId)) errors.push(`Fact ${fact.id} references missing source ${fact.sourceId}.`);
  }

  const assetsById = new Map();
  for (const asset of pack.assets) {
    assetsById.set(asset.id, asset);
    const source = sourcesById.get(asset.sourceId);
    if (!source) {
      errors.push(`Asset ${asset.id} references missing source ${asset.sourceId}.`);
      continue;
    }
    for (const field of ['provenance', 'rightsStatus', 'assetStatus', 'sourceRole', 'sourceChannel', 'instructionAuthority', 'publishUseAllowed']) {
      if (asset[field] !== source[field]) errors.push(`Asset ${asset.id} governance field ${field} must match source ${source.id}.`);
    }
  }

  for (const chunk of pack.chunks) {
    for (const sourceId of chunk.sourceIds) if (!sourceIds.has(sourceId)) errors.push(`Chunk ${chunk.id} references missing source ${sourceId}.`);
  }

  for (const candidate of pack.brand.sourceCandidates) {
    const source = sourcesById.get(candidate.sourceId);
    if (!source) errors.push(`Brand source candidate references missing source ${candidate.sourceId}.`);
    else if (!['primary-brand', 'brand-supporting'].includes(source.sourceRole)) errors.push(`Brand source candidate ${candidate.sourceId} is not a brand source.`);
  }

  for (const assetId of pack.brand.publishableAssetIds) {
    const asset = assetsById.get(assetId);
    if (!asset?.publishUseAllowed) errors.push(`Brand publishable asset ${assetId} is missing or not approved for publication.`);
  }

  for (const assetId of pack.brand.referenceOnlyAssetIds) {
    const asset = assetsById.get(assetId);
    if (!asset || asset.publishUseAllowed) errors.push(`Brand reference-only asset ${assetId} is missing or is publishable.`);
  }

  for (const item of pack.generatedCopy) if (item.provenance !== 'generated') errors.push('generatedCopy entries must explicitly use generated provenance.');
  return { valid: errors.length === 0, errors };
}

export function assertKnowledgePack(pack) {
  const result = validateKnowledgePack(pack);
  if (!result.valid) throw new Error(`Invalid knowledge pack:\n- ${result.errors.join('\n- ')}`);
  return pack;
}
