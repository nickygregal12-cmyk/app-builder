import fs from 'node:fs';
import path from 'node:path';
import { decideAssetGovernance, recropAsset } from '@app-builder/content-intelligence';

/**
 * Per-asset publication decisions.
 *
 * Source governance answers "may we read this?" and is settled before
 * ingestion. This answers "may we publish this particular picture?", which can
 * only be asked once the assets exist, and stays askable afterwards — including
 * after a build, because that is when someone looking at the site notices the
 * photograph that should not be on it.
 */
/**
 * The retained original for an asset, if there is one.
 *
 * Every derived file is a resize or a crop of it. Assets ingested before
 * originals were kept have none, and there is nothing to recompute a crop from.
 */
export function originalAssetPath(service, projectId, asset) {
  const directory = service.ingestion.assetDirectory(projectId);
  const prefix = `${String(asset.contentHash ?? '').slice(0, 16)}-original.`;
  if (!fs.existsSync(directory)) return null;
  const match = fs.readdirSync(directory).find((entry) => entry.startsWith(prefix));
  return match ? path.join(directory, match) : null;
}

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
      // A crop can only be recomputed from the original, so an asset ingested
      // before originals were retained says so rather than offering a control
      // that would quietly do nothing.
      recroppable: Boolean(crops.length && originalAssetPath(service, projectId, asset)),
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
      focalPoint: decision?.focalPoint ?? null,
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

/**
 * Recompute an asset's crops around a chosen point.
 *
 * The point is recorded on the asset's decision, so it survives a rebuild and
 * is re-applied when re-ingestion regenerates the derived files. Choosing a
 * point does not publish the crops: `cropReview` still gates that, because
 * saying where the subject is and agreeing with the result are two different
 * judgements.
 */
export async function recropProjectAsset(service, projectId, assetId, focalPoint) {
  const pack = service.getKnowledgePack(projectId);
  if (!pack) throw new Error('Asset decisions need an ingested knowledge pack; there are no assets to decide about yet.');
  const asset = (pack.assets ?? []).find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`Unknown project asset: ${assetId}`);

  const point = normalizeFocalPoint(focalPoint);
  const original = originalAssetPath(service, projectId, asset);
  if (!original) throw new Error(`Asset ${assetId} has no retained original, so its crops cannot be recomputed. Re-ingest the source to keep one.`);

  await recropAsset(fs.readFileSync(original), asset.contentHash, point, {
    fs: fs.promises,
    assetOutputDir: service.ingestion.assetDirectory(projectId),
    assetUriPrefix: 'assets',
  });

  const existing = service.readAssetDecisions(projectId).decisions;
  const current = existing.find((entry) => entry.assetId === assetId) ?? null;
  const decision = {
    assetId,
    decision: current?.decision ?? 'approve',
    rightsDeclaration: current?.rightsDeclaration ?? null,
    focalPoint: point,
    // A recomputed crop is a new thing to look at, so agreeing with the last
    // one does not carry over.
    cropReview: 'pending',
    ...(current?.note ? { note: current.note } : {}),
    decidedAt: new Date().toISOString(),
    decidedBy: 'console',
    effect: current?.effect ?? decideAssetGovernance(asset, (pack.sources ?? []).find((entry) => entry.id === asset.sourceId) ?? null, {
      decision: 'approve',
      rightsDeclaration: asset.rightsStatus === 'approved-for-use' ? null : 'owned-by-the-business',
    }),
  };
  await service.writeAssetDecisions(projectId, [...existing.filter((entry) => entry.assetId !== assetId), decision], decision);
  return { asset: assetInventory(service, projectId).find((entry) => entry.id === assetId) ?? null };
}

function normalizeFocalPoint(focalPoint) {
  const x = Number(focalPoint?.x);
  const y = Number(focalPoint?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error('A focal point needs x and y between 0 and 1.');
  }
  return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) };
}

/**
 * Re-apply every recorded focal point.
 *
 * Ingestion regenerates derived files from the source, which would otherwise
 * hand an attention heuristic back the framing a person already chose.
 */
export async function reapplyAssetFocalPoints(service, projectId) {
  const pack = service.getKnowledgePack(projectId);
  if (!pack) return 0;
  const decisions = service.readAssetDecisions(projectId).decisions.filter((entry) => entry.focalPoint);
  let applied = 0;
  for (const entry of decisions) {
    const asset = (pack.assets ?? []).find((item) => item.id === entry.assetId);
    const original = asset ? originalAssetPath(service, projectId, asset) : null;
    if (!original) continue;
    await recropAsset(fs.readFileSync(original), asset.contentHash, entry.focalPoint, {
      fs: fs.promises,
      assetOutputDir: service.ingestion.assetDirectory(projectId),
      assetUriPrefix: 'assets',
    });
    applied += 1;
  }
  return applied;
}
