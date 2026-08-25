import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

export const recipe = { id: 'observability', label: 'Observability foundation' };

type ErrorDetail = { message: string; stack?: string; source: string };

export function reportError(error: unknown, source = 'application') {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const detail: ErrorDetail = { message: normalized.message, stack: normalized.stack, source };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ErrorDetail>('app:error', { detail }));
  return detail;
}

export class AppErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(new Error(`${error.message}\n${info.componentStack}`), 'react-boundary'); }
  render(): ReactNode {
    if (this.state.error) return <main role="alert"><h1>Something went wrong</h1><p>The application hit an unexpected error. Refresh the page and try again.</p></main>;
    return this.props.children;
  }
}

export const Provider = AppErrorBoundary;
let installed = false;
export function setup() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'window-error'));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'unhandled-rejection'));
}
