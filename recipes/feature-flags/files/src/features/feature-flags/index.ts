export const recipe = {
  id: 'feature-flags',
  label: 'Feature flags',
};

function envKey(name: string) {
  return `VITE_FEATURE_${name.trim().replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`;
}

export function isFeatureEnabled(name: string, fallback = false) {
  const raw = import.meta.env[envKey(name)];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}
