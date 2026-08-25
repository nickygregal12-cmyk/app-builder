import fs from 'node:fs';

const PROJECT_TYPES = new Set([
  'marketing-site', 'b2b-saas', 'consumer-app', 'internal-tool', 'content-site', 'ai-app',
]);

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push('schemaVersion must be 1');
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
  return errors;
}
