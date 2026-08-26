export { trackEvent, setup, type AnalyticsEvent, type AnalyticsProperties } from './analytics';
export { recipe } from './analytics';

/**
 * Instrumentation on a prerendered page.
 *
 * The measurement module itself is framework-free and ships unchanged, so any
 * island a project later adds can import `trackEvent`. What differs is how it
 * starts: the application renderer calls `setup` from the app it already boots,
 * and there is no app here to call it from. `BodyEnd` is the static equivalent
 * — a few hundred bytes at the end of the document, not a runtime.
 */
export { default as BodyEnd } from './BodyEnd.astro';
