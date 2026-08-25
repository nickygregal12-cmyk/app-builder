export const recipe = { id: 'analytics', label: 'Analytics instrumentation' };

type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProperties = Record<string, AnalyticsValue>;
export type AnalyticsEvent = { name: string; properties: AnalyticsProperties; occurredAt: string };

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  if (!name.trim()) throw new Error('Analytics events require a name.');
  const detail: AnalyticsEvent = { name, properties, occurredAt: new Date().toISOString() };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<AnalyticsEvent>('app:analytics', { detail }));
  return detail;
}

let initialized = false;
export function setup(project: { name: string; type: string }) {
  if (initialized) return;
  initialized = true;
  trackEvent('app_initialized', { project: project.name, projectType: project.type });
}
