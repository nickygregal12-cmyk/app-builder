const DECISIONS = new Set(['approve-for-use', 'reference-only', 'do-not-use']);

function sourceList(project) {
  return Array.isArray(project.manifest?.inputs?.sources) ? project.manifest.inputs.sources : [];
}

function applyDecision(source, decision) {
  if (!DECISIONS.has(decision)) throw new Error(`Unsupported source governance decision: ${decision}`);
  if (decision === 'approve-for-use') {
    if (/^https?:/i.test(source.uri ?? '') || source.kind === 'url') {
      throw new Error('Public URL references cannot be approved for republication through this control. Supply an owned file or use a later asset-level approval flow.');
    }
    if (source.provenance !== 'user-supplied') throw new Error('Only user-supplied source material can be approved for use through this control.');
    return { ...source, rightsStatus: 'approved-for-use', assetStatus: 'approved', instructionAuthority: 'none', publishUseAllowed: true };
  }
  if (decision === 'reference-only') {
    return { ...source, rightsStatus: 'reference-only', assetStatus: 'do-not-use', instructionAuthority: 'none', publishUseAllowed: false };
  }
  return { ...source, assetStatus: 'do-not-use', instructionAuthority: 'none', publishUseAllowed: false };
}

export async function updateProjectSourceGovernance(service, projectId, sourceId, decision) {
  await service.decideMutation('project.source.governance.update', projectId);
  const project = service.requireProject(projectId);
  if (project.state !== 'ready') throw new Error('Source governance can only be changed before project generation.');
  if (project.knowledgePack) throw new Error('Source governance must be resolved before knowledge ingestion is attached to the project.');
  const sources = sourceList(project);
  const index = sources.findIndex((source) => source.id === sourceId);
  if (index < 0) throw new Error(`Unknown project source: ${sourceId}`);

  const updatedSource = applyDecision(sources[index], decision);
  const manifest = structuredClone(project.manifest);
  manifest.inputs = { ...manifest.inputs, sources: [...sources] };
  manifest.inputs.sources[index] = updatedSource;
  const updatedAt = new Date().toISOString();
  service.store.upsertProject({ ...project, manifest, updatedAt });
  await service.recordOperationalEvent(projectId, 'source.governance.updated', {
    sourceId,
    decision,
    rightsStatus: updatedSource.rightsStatus ?? null,
    assetStatus: updatedSource.assetStatus ?? null,
    publishUseAllowed: updatedSource.publishUseAllowed === true,
  });
  return { source: updatedSource, project: service.getProject(projectId) };
}
