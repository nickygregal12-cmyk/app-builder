import { decideAssetGovernance } from '@app-builder/content-intelligence';

/**
 * Per-asset publication decisions.
 *
 * Source governance answers "may we read this?" and is settled before
 * ingestion. This answers "may we publish this particular picture?", which can
 * only be asked once the assets exist, and stays askable afterwards — including
 * after a build, because that is when someone looking at the site notices the
 * photograph that should not be on it.
 */
export function assetInventory(service, projectId) {
  const pack = service.getKnowledgePack(projectId);
  if (!pack) return [];
  const sources = new Map((pack.sources ?? []).map((source) => [source.id, source]));
  const decisions = new Map(service.readAssetDecisions(projectId).decisions.map((entry) => [entry.assetId, entry]));

  return (pack.assets ?? []).map((asset) => {
    const decision = decisions.get(asset.id) ?? null;
    const source = sources.get(asset.sourceId) ?? null;
    const effective = decision?.effect ?? { rightsStatus: asset.rightsStatus, assetStatus: asset.assetStatus, publishUseAllowed: asset.publishUseAllowed };
    const crops = (asset.variants ?? []).filter((variant) => variant.reviewBeforePublish);
    return {
      id: asset.id,
      sourceId: asset.sourceId,
      sourceLabel: source?.label ?? null,
      sourceChannel: asset.sourceChannel,
      kind: asset.kind,
      provenance: asset.provenance,
      mimeType: asset.mimeType ?? null,
      width: asset.metadata?.width ?? null,
      height: asset.metadata?.height ?? null,
      aspectRatio: asset.metadata?.aspectRatio ?? null,
      dominantColor: asset.metadata?.dominantColor ?? null,
      lowResolution: Boolean(asset.metadata?.lowResolution),
      variantCount: (asset.variants ?? []).length,
      cropCount: crops.length,
      duplicateOf: asset.duplicateOf ?? null,
      visualDuplicateOf: asset.visualDuplicateOf ?? null,
      // What it inherited, and what a person decided, kept apart. Collapsing
      // them would hide whether anyone has actually looked at this asset.
      inherited: { rightsStatus: asset.rightsStatus, assetStatus: asset.assetStatus, publishUseAllowed: asset.publishUseAllowed },
      decision: decision ? { decision: decision.decision, rightsDeclaration: decision.rightsDeclaration ?? null, cropReview: decision.cropReview, decidedAt: decision.decidedAt, note: decision.note ?? null } : null,
      cropReview: decision?.cropReview ?? 'pending',
      rightsStatus: effective.rightsStatus,
      assetStatus: effective.assetStatus,
      publishUseAllowed: effective.publishUseAllowed,
      // An approval that would outrun the source's rights needs a declaration
      // about this asset. Saying so up front beats refusing after the click.
      rightsDeclarationRequired: source?.rightsStatus !== 'approved-for-use',
    };
  });
}

export async function decideProjectAsset(service, projectId, assetId, request) {
  const pack = service.getKnowledgePack(projectId);
  if (!pack) throw new Error('Asset decisions need an ingested knowledge pack; there are no assets to decide about yet.');
  const asset = (pack.assets ?? []).find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Unknown project asset: ${assetId}`);
  const source = (pack.sources ?? []).find((entry) => entry.id === asset.sourceId) ?? null;

  const existing = service.readAssetDecisions(projectId).decisions.filter((entry) => entry.assetId !== assetId);

  // Clearing a decision returns the asset to what it inherited from its source
  // rather than recording a third state that means "never mind".
  if (request?.decision === 'clear') {
    const cleared = await service.writeAssetDecisions(projectId, existing, { assetId, decision: 'clear' });
    return { asset: assetInventory(service, projectId).find((entry) => entry.id === assetId) ?? null, decisions: cleared };
  }

  const effect = decideAssetGovernance(asset, source, {
    decision: request?.decision,
    rightsDeclaration: request?.rightsDeclaration ?? null,
    cropReview: request?.cropReview ?? 'pending',
  });

  const decision = {
    assetId,
    decision: request.decision,
    rightsDeclaration: request?.rightsDeclaration ?? null,
    cropReview: request?.cropReview ?? 'pending',
    ...(request?.note ? { note: String(request.note) } : {}),
    decidedAt: new Date().toISOString(),
    decidedBy: 'console',
    effect,
  };
  const decisions = await service.writeAssetDecisions(projectId, [...existing, decision], decision);
  return { asset: assetInventory(service, projectId).find((entry) => entry.id === assetId) ?? null, decisions };
}
