import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from '../auth';

export const recipe = { id: 'admin', label: 'Admin foundation' };

export function usePlatformAdmin() {
  const { user } = useAuth();
  return user?.app_metadata?.platform_role === 'admin';
}

export function AdminBoundary({ children, fallback = null }: PropsWithChildren<{ fallback?: ReactNode }>) {
  return usePlatformAdmin() ? <>{children}</> : <>{fallback}</>;
}

export function AdminShell({ title = 'Admin', children }: PropsWithChildren<{ title?: string }>) {
  return <section aria-label={title}><header><p>Administration</p><h1>{title}</h1></header>{children}</section>;
}

export { AdminSection } from './AdminSection';
import { AdminSection } from './AdminSection';
export const sections = { administration: AdminSection };

// UI gating is not authorization. Secure every privileged database/server action separately.
