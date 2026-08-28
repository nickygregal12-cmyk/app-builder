import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth';
import { useOrganisations, type Organisation, type OrganisationRole } from '../organisations';
import { supabase } from '../../platform/supabase/client';

/**
 * Organisation-owned records, read and written through the tenant's own session.
 *
 * There is deliberately no client-side tenant filter beyond the one that makes
 * the query useful. `eq('organisation_id', …)` here selects which organisation
 * the person is *looking at*; it is not what stops them seeing another one.
 * That is row level security, and it holds whether this component filters
 * correctly, filters wrongly, or is bypassed entirely by someone with the
 * publishable key and a terminal.
 *
 * The distinction matters because it decides where a bug is dangerous. A defect
 * in this file shows the wrong list to someone entitled to both organisations;
 * a defect in the policy shows one tenant another tenant's data. Only the
 * second is a breach, and only the database can prevent it.
 */

export type RecordStatus = 'draft' | 'active' | 'archived';

export type TenantRecord = {
  id: string;
  organisation_id: string;
  reference: string;
  title: string;
  summary: string | null;
  status: RecordStatus;
  archived_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type RecordDraft = { reference: string; title: string; summary?: string | null; status?: RecordStatus };

/**
 * What the signed-in person may do here, derived from the role the
 * organisations recipe already resolved.
 *
 * This mirrors the SQL policies rather than deciding anything: it exists so the
 * interface can avoid offering an action that the database is going to refuse.
 * Hiding a control the caller cannot use is courtesy; the refusal itself lives
 * in the policy, and every one of these is proved against a real Postgres in
 * `tooling/supabase-rls-acceptance.sql`.
 */
export const CONTRIBUTOR_ROLES: readonly OrganisationRole[] = ['owner', 'admin', 'editor', 'member'];
export const RECORD_ADMIN_ROLES: readonly OrganisationRole[] = ['owner', 'admin'];

export function recordPermissions(role: OrganisationRole | null) {
  const contributor = role !== null && CONTRIBUTOR_ROLES.includes(role);
  const administrator = role !== null && RECORD_ADMIN_ROLES.includes(role);
  return { canRead: role !== null, canCreate: contributor, canEdit: contributor, canDelete: administrator, canArchive: administrator };
}

type RecordsContextValue = {
  organisation: Organisation | null;
  records: TenantRecord[];
  loading: boolean;
  error: string | null;
  permissions: ReturnType<typeof recordPermissions>;
  selectOrganisation(id: string): void;
  refresh(): Promise<void>;
  create(draft: RecordDraft): Promise<TenantRecord>;
  update(id: string, patch: Partial<RecordDraft>): Promise<TenantRecord>;
  remove(id: string): Promise<void>;
  setArchived(id: string, archived: boolean): Promise<TenantRecord>;
};

const RecordsContext = createContext<RecordsContextValue | null>(null);

const COLUMNS = 'id,organisation_id,reference,title,summary,status,archived_at,created_by,created_at,updated_at';

export function RecordsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { organisations } = useOrganisations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [records, setRecords] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The first organisation the person belongs to, until they choose another.
  const organisation = useMemo(
    () => organisations.find((entry) => entry.id === selectedId) ?? organisations[0] ?? null,
    [organisations, selectedId],
  );

  const refresh = useCallback(async () => {
    if (!user || !organisation) { setRecords([]); return; }
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('records')
      .select(COLUMNS)
      .eq('organisation_id', organisation.id)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (queryError) { setError(queryError.message); setRecords([]); return; }
    setRecords((data ?? []) as TenantRecord[]);
  }, [organisation, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const permissions = useMemo(() => recordPermissions(organisation?.role ?? null), [organisation]);

  const value = useMemo<RecordsContextValue>(() => ({
    organisation,
    records,
    loading,
    error,
    permissions,
    selectOrganisation: setSelectedId,
    refresh,
    async create(draft) {
      if (!organisation) throw new Error('Join or create an organisation before adding records.');
      if (!user) throw new Error('Sign in before adding records.');
      // `organisation_id` and `created_by` are sent by the client and enforced
      // by the insert policy. The browser proposes; Postgres disposes.
      const { data, error: insertError } = await supabase
        .from('records')
        .insert({
          organisation_id: organisation.id,
          reference: draft.reference.trim(),
          title: draft.title.trim(),
          summary: draft.summary?.trim() || null,
          status: draft.status ?? 'draft',
          created_by: user.id,
        })
        .select(COLUMNS)
        .single();
      if (insertError) throw insertError;
      const created = data as TenantRecord;
      setRecords((current) => [created, ...current]);
      return created;
    },
    async update(id, patch) {
      const payload: Record<string, unknown> = {};
      if (patch.reference !== undefined) payload.reference = patch.reference.trim();
      if (patch.title !== undefined) payload.title = patch.title.trim();
      if (patch.summary !== undefined) payload.summary = patch.summary?.trim() || null;
      if (patch.status !== undefined) payload.status = patch.status;
      const { data, error: updateError } = await supabase.from('records').update(payload).eq('id', id).select(COLUMNS).single();
      if (updateError) throw updateError;
      const updated = data as TenantRecord;
      setRecords((current) => current.map((entry) => (entry.id === id ? updated : entry)));
      return updated;
    },
    async remove(id) {
      const { error: deleteError } = await supabase.from('records').delete().eq('id', id);
      if (deleteError) throw deleteError;
      setRecords((current) => current.filter((entry) => entry.id !== id));
    },
    async setArchived(id, archived) {
      // The bounded privileged operation. Archiving is not an ordinary column
      // write and is not offered as one.
      const { data, error: rpcError } = await supabase.rpc('set_record_archived', { record_id: id, archived });
      if (rpcError) throw rpcError;
      const updated = data as TenantRecord;
      setRecords((current) => current.map((entry) => (entry.id === id ? updated : entry)));
      return updated;
    },
  }), [error, loading, organisation, permissions, records, refresh, user]);

  return <RecordsContext.Provider value={value}>{children}</RecordsContext.Provider>;
}

export function useRecords() {
  const context = useContext(RecordsContext);
  if (!context) throw new Error('useRecords must be used inside RecordsProvider.');
  return context;
}
