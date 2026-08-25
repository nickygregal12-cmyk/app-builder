import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../../platform/supabase/client';

export type OrganisationRole = 'owner' | 'admin' | 'editor' | 'member' | 'viewer';
export type Organisation = { id: string; name: string; slug: string; created_by: string; created_at: string; role: OrganisationRole };
type OrganisationContextValue = { organisations: Organisation[]; loading: boolean; refresh(): Promise<void>; create(name: string, slug: string): Promise<Organisation> };
const OrganisationContext = createContext<OrganisationContextValue | null>(null);

export function OrganisationsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setOrganisations([]); return; }
    setLoading(true);
    const { data: memberships, error: membershipError } = await supabase.from('organisation_memberships').select('organisation_id,role').eq('user_id', user.id);
    if (membershipError) { setLoading(false); throw membershipError; }
    const ids = (memberships ?? []).map((row) => row.organisation_id as string);
    if (!ids.length) { setOrganisations([]); setLoading(false); return; }
    const { data: organisationsData, error: organisationsError } = await supabase.from('organisations').select('id,name,slug,created_by,created_at').in('id', ids);
    setLoading(false);
    if (organisationsError) throw organisationsError;
    const roles = new Map((memberships ?? []).map((row) => [row.organisation_id as string, row.role as OrganisationRole]));
    setOrganisations((organisationsData ?? []).map((row) => ({ ...row, role: roles.get(row.id as string) ?? 'member' })) as Organisation[]);
  }, [user]);

  useEffect(() => { void refresh().catch(() => setOrganisations([])); }, [refresh]);

  const value = useMemo<OrganisationContextValue>(() => ({
    organisations,
    loading,
    refresh,
    async create(name, slug) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError ?? new Error('Sign in before creating an organisation.');
      const { data: organisation, error } = await supabase.from('organisations').insert({ name: name.trim(), slug: slug.trim(), created_by: authData.user.id }).select('id,name,slug,created_by,created_at').single();
      if (error) throw error;
      const { error: membershipError } = await supabase.from('organisation_memberships').insert({ organisation_id: organisation.id, user_id: authData.user.id, role: 'owner' });
      if (membershipError) {
        await supabase.from('organisations').delete().eq('id', organisation.id);
        throw membershipError;
      }
      const created = { ...organisation, role: 'owner' as const } as Organisation;
      setOrganisations((current) => [...current, created]);
      return created;
    },
  }), [loading, organisations, refresh]);

  return <OrganisationContext.Provider value={value}>{children}</OrganisationContext.Provider>;
}

export function useOrganisations() {
  const context = useContext(OrganisationContext);
  if (!context) throw new Error('useOrganisations must be used inside OrganisationsProvider.');
  return context;
}
