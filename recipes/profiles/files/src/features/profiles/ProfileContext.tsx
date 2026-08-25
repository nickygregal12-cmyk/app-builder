import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../../platform/supabase/client';

export type Profile = { id: string; display_name: string | null; avatar_url: string | null; created_at: string; updated_at: string };
type ProfilePatch = Pick<Profile, 'display_name' | 'avatar_url'>;
type ProfileContextValue = { profile: Profile | null; loading: boolean; save(patch: ProfilePatch): Promise<void>; refresh(): Promise<void> };
const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfilesProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setProfile(null); return; }
    setLoading(true);
    const { error: ensureError } = await supabase.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });
    if (ensureError) { setLoading(false); throw ensureError; }
    const { data, error } = await supabase.from('profiles').select('id,display_name,avatar_url,created_at,updated_at').eq('id', user.id).single();
    setLoading(false);
    if (error) throw error;
    setProfile(data as Profile);
  }, [user]);

  useEffect(() => { void refresh().catch(() => setProfile(null)); }, [refresh]);

  const value = useMemo<ProfileContextValue>(() => ({
    profile,
    loading,
    refresh,
    async save(patch) {
      if (!user) throw new Error('Sign in before updating a profile.');
      const { data, error } = await supabase.from('profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', user.id).select('id,display_name,avatar_url,created_at,updated_at').single();
      if (error) throw error;
      setProfile(data as Profile);
    },
  }), [loading, profile, refresh, user]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used inside ProfilesProvider.');
  return context;
}
