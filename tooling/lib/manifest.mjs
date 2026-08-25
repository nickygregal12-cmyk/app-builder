import fs from 'node:fs';

const PROJECT_TYPES = new Set([
  'marketing-site', 'b2b-saas', 'consumer-app', 'internal-tool', 'content-site', 'ai-app',
]);

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

export function validateManifest(manifest) {
  const errors = [];
  if (![1, 2].includes(manifest?.schemaVersion)) errors.push('schemaVersion must be 1 or 2');
  if (!manifest?.project?.name?.trim()) errors.push('project.name is required');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest?.project?.slug ?? '')) errors.push('project.slug must be kebab-case');
  if (!PROJECT_TYPES.has(manifest?.project?.type)) errors.push('project.type is unsupported');
  if (!manifest?.project?.primaryGoal?.trim()) errors.push('project.primaryGoal is required');
  if (!manifest?.modules || typeof manifest.modules !== 'object' || Array.isArray(manifest.modules)) errors.push('modules must be an object');
  else for (const [key, value] of Object.entries(manifest.modules)) if (typeof value !== 'boolean') errors.push(`modules.${key} must be boolean`);
  if (!['none','supabase'].includes(manifest?.infrastructure?.backend)) errors.push('infrastructure.backend is unsupported');
  if (!['netlify','cloudflare','vercel','none'].includes(manifest?.infrastructure?.deployment)) errors.push('infrastructure.deployment is unsupported');
  if (!['economy','balanced','quality'].includes(manifest?.aiBudget?.mode)) errors.push('aiBudget.mode is unsupported');
  if (typeof manifest?.aiBudget?.maxBuildCostGbp !== 'number' || manifest.aiBudget.maxBuildCostGbp < 0) errors.push('aiBudget.maxBuildCostGbp must be >= 0');
  if (manifest?.schemaVersion === 2) {
    if (typeof manifest?.audience?.summary !== 'string' || !Array.isArray(manifest?.audience?.roles)) errors.push('audience must include summary and roles');
    if (!Array.isArray(manifest?.journeys)) errors.push('journeys must be an array');
    if (!Array.isArray(manifest?.majorSurfaces) || manifest.majorSurfaces.length === 0) errors.push('majorSurfaces must contain at least one surface');
    if (!Array.isArray(manifest?.entities)) errors.push('entities must be an array');
    if (!manifest?.company || typeof manifest.company !== 'object' || Array.isArray(manifest.company)) errors.push('company must be an object');
    if (!manifest?.constraints || typeof manifest.constraints !== 'object' || Array.isArray(manifest.constraints)) errors.push('constraints must be an object');
    if (!Array.isArray(manifest?.constraints?.customCapabilities)) errors.push('constraints.customCapabilities must be an array');
    if (!Array.isArray(manifest?.constraints?.excludedCapabilities)) errors.push('constraints.excludedCapabilities must be an array');
    if (!Array.isArray(manifest?.constraints?.unresolvedCapabilities)) errors.push('constraints.unresolvedCapabilities must be an array');
  }
  return errors;
}
