export const recipe = {
  id: 'feature-flags',
  label: 'Feature flags',
};

/**
 * A flag on a prerendered site is answered when the site is built.
 *
 * Nothing about the capability changes between renderers — a name becomes an
 * environment variable and the variable decides — except which prefix a build
 * tool exposes to code that can reach the browser. Astro uses `PUBLIC_`, so a
 * `VITE_FEATURE_*` name would read as undefined and every flag would silently
 * take its fallback.
 */
function envKey(name: string) {
  return `PUBLIC_FEATURE_${name.trim().replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}`;
}

export function isFeatureEnabled(name: string, fallback = false) {
  const raw = (import.meta.env as Record<string, unknown>)[envKey(name)];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}
