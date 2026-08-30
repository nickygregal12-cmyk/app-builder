import { supabase } from '../../platform/supabase/client';

/**
 * The client surface of the scheduled-decision spine.
 *
 * Every function here is a thin call onto a boundary the database already
 * enforces, and that is the point rather than an omission. There is no
 * `isOpen(entity)` helper that compares a deadline to `Date.now()`, because a
 * browser clock is a suggestion: the same comparison run against a fast local
 * clock would show a closed window as open, and a product built on it would
 * render an editable form that the database then refuses. `entityState()` asks
 * the server, which is the only participant whose clock is authoritative.
 *
 * Likewise there is no filter here that hides other competitors' decisions
 * before the deadline. The SELECT policy does that. A client-side filter over
 * rows the server was willing to send is a decoration on top of a leak.
 */

export const recipe = {
  id: 'scheduled-decisions',
  label: 'Scheduled decisions, settlement and leaderboard',
};

/** The five states of the frozen lifecycle, as the server reports them. */
export type ScheduledEntityState = 'scheduled' | 'locked' | 'awaiting-official' | 'settled' | 'voided';

export type ScheduledEntity = {
  id: string;
  organisation_id: string;
  reference: string;
  title: string;
  decision_deadline: string;
  result_state: 'scheduled' | 'awaiting-official' | 'settled' | 'voided';
  voided_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ScheduledDecision = {
  id: string;
  entity_id: string;
  identity_id: string;
  /** Opaque to this recipe. The product's scoring rule owns its shape. */
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

export async function listScheduledEntities(organisationId: string) {
  const { data, error } = await supabase
    .from('scheduled_entities')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('decision_deadline', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ScheduledEntity[];
}

/**
 * The authoritative lifecycle state, derived server-side from the stored
 * deadline and the server clock.
 */
export async function entityState(entityId: string) {
  const { data, error } = await supabase.rpc('scheduled_entity_state', { entity_id: entityId });
  if (error) throw error;
  return data as ScheduledEntityState | null;
}

/**
 * Submit or revise this identity's decision.
 *
 * A single upsert rather than a read-then-write, because deciding whether a
 * decision already exists in the client and acting on the answer is a race with
 * the person's other tab. The unique constraint settles it instead.
 */
export async function submitDecision(entityId: string, identityId: string, choice: unknown) {
  const { data, error } = await supabase
    .from('scheduled_decisions')
    .upsert({ entity_id: entityId, identity_id: identityId, choice }, { onConflict: 'entity_id,identity_id' })
    .select()
    .single();
  if (error) throw error;
  return data as ScheduledDecision;
}

/**
 * Decisions for one entity: only this identity's own until the entity locks,
 * then everybody's. The difference is a policy, not a parameter.
 */
export async function listDecisions(entityId: string) {
  const { data, error } = await supabase.from('scheduled_decisions').select('*').eq('entity_id', entityId);
  if (error) throw error;
  return (data ?? []) as ScheduledDecision[];
}

/** Returns how many settlements this call created; a repeat returns 0. */
export async function settleEntity(entityId: string) {
  const { data, error } = await supabase.rpc('settle_scheduled_entity', { entity_id: entityId });
  if (error) throw error;
  return data as number;
}

export async function voidEntity(entityId: string, reason: string) {
  const { data, error } = await supabase.rpc('void_scheduled_entity', { entity_id: entityId, reason });
  if (error) throw error;
  return data as ScheduledEntity;
}

/**
 * The leaderboard, already totally ordered by the view. The explicit `order` is
 * belt and braces for a PostgREST response, not the thing that makes the
 * ordering deterministic — `board_position` is.
 */
export async function readLeaderboard() {
  const { data, error } = await supabase
    .from('scheduled_leaderboard')
    .select('*')
    .order('board_position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}
