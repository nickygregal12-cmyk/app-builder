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
  const sourceIds = new Set((pack.sources ?? []).map((source) => source.id));
  for (const fact of pack.facts ?? []) {
    if (!fact.id || !fact.path || fact.value === undefined) errors.push('Every fact requires id, path and value.');
    if (!sourceIds.has(fact.sourceId)) errors.push(`Fact ${fact.id ?? 'unknown'} references missing source ${fact.sourceId}.`);
    if (!(Number.isFinite(fact.confidence) && fact.confidence >= 0 && fact.confidence <= 1)) errors.push(`Fact ${fact.id ?? 'unknown'} has invalid confidence.`);
    if (!['user-provided', 'candidate', 'verified', 'rejected'].includes(fact.verification)) errors.push(`Fact ${fact.id ?? 'unknown'} has invalid verification state.`);
  }
  for (const chunk of pack.chunks ?? []) {
    if (!chunk.id || !/^[a-f0-9]{64}$/.test(chunk.contentHash ?? '')) errors.push('Every chunk requires an id and SHA-256 contentHash.');
    for (const sourceId of chunk.sourceIds ?? []) if (!sourceIds.has(sourceId)) errors.push(`Chunk ${chunk.id ?? 'unknown'} references missing source ${sourceId}.`);
  }
  for (const item of pack.generatedCopy ?? []) if (item.provenance !== 'generated') errors.push('generatedCopy entries must explicitly use generated provenance.');
  return { valid: errors.length === 0, errors };
}

export function assertKnowledgePack(pack) {
  const result = validateKnowledgePack(pack);
  if (!result.valid) throw new Error(`Invalid knowledge pack:\n- ${result.errors.join('\n- ')}`);
  return pack;
}
