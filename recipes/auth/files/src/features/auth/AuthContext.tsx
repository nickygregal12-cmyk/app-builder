import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../platform/supabase/client';
import { AuthScreen } from './AuthScreen';

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setUser(error ? null : data.user);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function AuthGate({ children }: PropsWithChildren) {
  const { loading, user } = useAuth();
  if (loading) return <main className="auth-shell"><p>Checking your session…</p></main>;
  if (!user) return <AuthScreen />;
  return <>{children}</>;
}
