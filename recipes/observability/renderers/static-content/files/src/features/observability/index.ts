export const recipe = { id: 'observability', label: 'Observability foundation' };

type ErrorDetail = { message: string; stack?: string; source: string };

export function reportError(error: unknown, source = 'application'): ErrorDetail {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const detail: ErrorDetail = { message: normalized.message, stack: normalized.stack, source };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ErrorDetail>('app:error', { detail }));
  return detail;
}

/**
 * What this capability is, and is not, on a prerendered page.
 *
 * The application renderer's implementation is mostly a React error boundary,
 * because the failure it exists to catch is a component throwing while
 * rendering in the browser. A static page has already rendered by the time it
 * reaches a visitor, so that boundary has nothing to catch and shipping a React
 * runtime to install one would be the opposite of what this renderer is for.
 *
 * What remains is the half that is still true: uncaught errors and rejected
 * promises from whatever script the page does run are reported on `app:error`,
 * the same event and the same shape as the application renderer emits.
 */
export { default as BodyEnd } from './BodyEnd.astro';
