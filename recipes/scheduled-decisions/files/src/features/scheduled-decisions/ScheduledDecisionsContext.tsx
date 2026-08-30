import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth';
import { useOrganisations } from '../organisations';
import { supabase } from '../../platform/supabase/client';

/**
 * Scheduled entities, this identity's decisions, and the standings.
 *
 * Two things this deliberately does not do, both of which would look like
 * ordinary front-end work and both of which would be wrong.
 *
 * It does not decide whether a decision window is open. `state` arrives from
 * `scheduled_entity_board`, which derives it server-side from the stored
 * deadline. Comparing a deadline to `Date.now()` here would put the answer on
 * the side of the connection whose clock nobody controls: a browser running ten
 * minutes slow would render an editable form for a window the database has
 * already closed, and the person would be told their entry was saved by an
 * interface that had no way to know otherwise.
 *
 * It does not filter other competitors' decisions out of the list. The SELECT
 * policy returns your own until the entity locks and everybody's afterwards, so
 * what arrives here is already what you are allowed to see. A filter here would
 * be a decoration on top of a leak — and, worse, would make a leak invisible in
 * exactly the interface someone would use to look for one.
 */

export type ScheduledEntityState = 'scheduled' | 'locked' | 'awaiting-official' | 'settled' | 'voided';

export type ScheduledEntity = {
  id: string;
  organisation_id: string;
  reference: string;
  title: string;
  decision_deadline: string;
  result_state: string;
  voided_reason: string | null;
  state: ScheduledEntityState;
};

export type ScheduledDecision = {
  id: string;
  entity_id: string;
  identity_id: string;
  choice: unknown;
  created_at: string;
  updated_at: string;
};

export type LeaderboardRow = {
  identity_id: string;
  total_score: number;
  top_score_count: number;
  board_position: number;
};

type ScheduledDecisionsContextValue = {
  organisationId: string | null;
  entities: ScheduledEntity[];
  decisions: ScheduledDecision[];
  leaderboard: LeaderboardRow[];
  identityId: string | null;
  loading: boolean;
  error: string | null;
  /** Null when the product has not declared a scoring rule, which is a state and not a crash. */
  leaderboardUnavailable: string | null;
  refresh(): Promise<void>;
  submitDecision(entityId: string, choice: unknown): Promise<void>;
};

const ScheduledDecisionsContext = createContext<ScheduledDecisionsContextValue | null>(null);

const ENTITY_COLUMNS = 'id,organisation_id,reference,title,decision_deadline,result_state,voided_reason,state';
const DECISION_COLUMNS = 'id,entity_id,identity_id,choice,created_at,updated_at';

export function ScheduledDecisionsProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { organisations } = useOrganisations();
  const [entities, setEntities] = useState<ScheduledEntity[]>([]);
  const [decisions, setDecisions] = useState<ScheduledDecision[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardUnavailable, setLeaderboardUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const organisationId = organisations[0]?.id ?? null;

  const refresh = useCallback(async () => {
    if (!user || !organisationId) { setEntities([]); setDecisions([]); setLeaderboard([]); return; }
    setLoading(true);
    setError(null);

    const board = await supabase
      .from('scheduled_entity_board')
      .select(ENTITY_COLUMNS)
      .eq('organisation_id', organisationId)
      .order('decision_deadline', { ascending: true });
    if (board.error) { setLoading(false); setError(board.error.message); setEntities([]); return; }
    const rows = (board.data ?? []) as ScheduledEntity[];
    setEntities(rows);

    const visible = await supabase
      .from('scheduled_decisions')
      .select(DECISION_COLUMNS)
      .in('entity_id', rows.map((entity) => entity.id));
    if (visible.error) { setLoading(false); setError(visible.error.message); setDecisions([]); return; }
    setDecisions((visible.data ?? []) as ScheduledDecision[]);

    // A product that has not declared its scoring rule cannot rank anybody, and
    // the database says so rather than returning zeroes. That is a message worth
    // showing, not an error worth failing the whole surface for — the schedule
    // and the decisions above it are still true and still useful.
    const standings = await supabase.from('scheduled_leaderboard').select('*').order('board_position', { ascending: true });
    setLoading(false);
    if (standings.error) { setLeaderboard([]); setLeaderboardUnavailable(standings.error.message); return; }
    setLeaderboardUnavailable(null);
    setLeaderboard((standings.data ?? []) as LeaderboardRow[]);
  }, [organisationId, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<ScheduledDecisionsContextValue>(() => ({
    organisationId,
    entities,
    decisions,
    leaderboard,
    leaderboardUnavailable,
    identityId: user?.id ?? null,
    loading,
    error,
    refresh,
    async submitDecision(entityId, choice) {
      if (!user) throw new Error('Sign in before making a decision.');
      // Upsert rather than read-then-write. Deciding in the client whether a
      // decision already exists is a race with the same person's other tab; the
      // unique constraint settles it without one.
      const { error: writeError } = await supabase
        .from('scheduled_decisions')
        .upsert({ entity_id: entityId, identity_id: user.id, choice }, { onConflict: 'entity_id,identity_id' });
      if (writeError) throw writeError;
      await refresh();
    },
  }), [decisions, entities, error, leaderboard, leaderboardUnavailable, loading, organisationId, refresh, user]);

  return <ScheduledDecisionsContext.Provider value={value}>{children}</ScheduledDecisionsContext.Provider>;
}

export function useScheduledDecisions() {
  const context = useContext(ScheduledDecisionsContext);
  if (!context) throw new Error('useScheduledDecisions must be used inside ScheduledDecisionsProvider.');
  return context;
}
