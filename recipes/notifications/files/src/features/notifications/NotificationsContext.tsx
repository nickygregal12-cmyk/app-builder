import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth';
import { useOrganisations, type Organisation } from '../organisations';
import { supabase } from '../../platform/supabase/client';

/**
 * The notifications addressed to the signed-in person.
 *
 * Nothing here creates one, and that is the point rather than an omission. A
 * notification is raised by the database when a real application event happens
 * — today, a record being added to or archived in an organisation — and no
 * client holds the privilege to insert one. This context can read the person's
 * own notifications and mark one read; there is no code path from a browser to
 * a new row, because there is no grant behind one.
 *
 * As with records and files, the `eq('organisation_id', …)` below selects which
 * organisation the person is *looking at*. It is not what stops them seeing
 * another organisation's notifications, and it is certainly not what stops them
 * seeing a colleague's: both of those are row level security, and both are
 * proved against a real PostgreSQL in `tooling/supabase-rls-acceptance.sql`.
 */

export type NotificationKind = 'record-created' | 'record-archived';

export type AppNotification = {
  id: string;
  organisation_id: string;
  recipient_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationsContextValue = {
  organisation: Organisation | null;
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  markRead(id: string): Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const COLUMNS = 'id,organisation_id,recipient_id,kind,title,body,read_at,created_at';

/** Newest first, and bounded: an inbox is not an archive. */
const PAGE_SIZE = 50;

export function NotificationsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { organisations } = useOrganisations();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const organisation = organisations[0] ?? null;

  const refresh = useCallback(async () => {
    if (!user || !organisation) { setNotifications([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('notifications')
      .select(COLUMNS)
      .eq('organisation_id', organisation.id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    setLoading(false);
    if (queryError) { setError(queryError.message); setNotifications([]); return; }
    setNotifications((data ?? []) as AppNotification[]);
  }, [organisation, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const unreadCount = useMemo(() => notifications.filter((entry) => entry.read_at === null).length, [notifications]);

  const value = useMemo<NotificationsContextValue>(() => ({
    organisation,
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    async markRead(id) {
      // The only mutation this capability offers. `read_at` is sent as a
      // timestamp because PostgREST needs a value to write, and the database
      // then overwrites it with its own clock: the recipient decides THAT they
      // have read it, never when.
      const { data, error: updateError } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .select(COLUMNS)
        .single();
      if (updateError) throw updateError;
      const updated = data as AppNotification;
      setNotifications((current) => current.map((entry) => (entry.id === id ? updated : entry)));
    },
  }), [error, loading, notifications, organisation, refresh, unreadCount]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return context;
}
