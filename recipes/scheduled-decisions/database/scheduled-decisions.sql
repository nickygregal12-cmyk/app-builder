-- App Builder scheduled-decisions recipe. Review before creating a real Supabase migration.
--
-- The reusable spine underneath
--   `scheduled entity -> decision -> authoritative deadline/lock -> official result
--    -> deterministic settlement -> persisted score -> leaderboard`.
--
-- Every noun here is deliberately generic. The product that pulls this recipe
-- owns what a decision *means* and what it is *worth*; this file owns when a
-- decision may be made, who may see it, which reported result is allowed to
-- settle it, and that settling twice does not pay twice. Those are the parts
-- that are wrong in the same way in every product that has them, which is what
-- makes them worth extracting and the scoring rule not worth extracting.
--
-- Two things it deliberately does NOT do:
--
--   * it does not decide points. `app_domain.score_decision` below raises until
--     a product replaces it, so a build that forgot to declare its own rule
--     fails loudly at settlement instead of quietly scoring everyone zero;
--   * it does not need a scheduler. The lock is a fact about the clock and the
--     stored deadline, derived on read. A lifecycle whose correctness depends on
--     a cron job having fired is a lifecycle that is wrong for as long as the
--     job is late, and "the job was late" is not a defence a deadline can make.

-- --- The product's own rules, declared fail-closed ------------------------------
--
-- The extension point, and the reason this recipe can stay domain-neutral. A
-- generated product replaces both functions with its own; until it does, every
-- path that needs them raises rather than inventing an answer.
--
-- `create or replace` in a product migration is what an override looks like, so
-- these are created with `if not exists` semantics via a guard: re-running the
-- recipe fragment must not silently overwrite a product rule that is already
-- installed.
create schema if not exists app_domain;

do $$
begin
  if to_regprocedure('app_domain.score_decision(jsonb, jsonb)') is null then
    execute $fn$
      create function app_domain.score_decision(choice jsonb, outcome jsonb)
      returns integer
      language plpgsql
      immutable
      as $body$
      begin
        raise exception 'This product has not declared a scoring rule. Replace app_domain.score_decision(jsonb, jsonb).'
          using errcode = 'feature_not_supported';
      end;
      $body$;
    $fn$;
  end if;

  -- The leaderboard's first tie-break is "how often did this identity achieve the
  -- best result the rules can award". Only the product knows what that is, and a
  -- guessed maximum silently reorders the table.
  if to_regprocedure('app_domain.max_decision_points()') is null then
    execute $fn$
      create function app_domain.max_decision_points()
      returns integer
      language plpgsql
      immutable
      as $body$
      begin
        raise exception 'This product has not declared its maximum decision score. Replace app_domain.max_decision_points().'
          using errcode = 'feature_not_supported';
      end;
      $body$;
    $fn$;
  end if;
end
$$;

revoke all on function app_domain.score_decision(jsonb, jsonb) from public;
revoke all on function app_domain.max_decision_points() from public;
grant usage on schema app_domain to authenticated;
grant execute on function app_domain.score_decision(jsonb, jsonb) to authenticated;
grant execute on function app_domain.max_decision_points() to authenticated;

-- --- The scheduled entity -------------------------------------------------------

create table if not exists public.scheduled_entities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  reference text not null check (reference ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  title text not null check (char_length(title) between 1 and 200),
  -- Server-stored and server-read. No client ever sends "the deadline has
  -- passed"; it sends a decision, and the database decides whether it is late.
  decision_deadline timestamptz not null,
  -- Only the states that an external truth source moves the entity into are
  -- stored. `locked` is absent on purpose: it is derived from this column and
  -- the clock by `scheduled_entity_state` below, so it cannot drift.
  result_state text not null default 'scheduled'
    check (result_state in ('scheduled', 'awaiting-official', 'settled', 'voided')),
  -- Why the entity was voided, when it was. Present exactly when voided, so
  -- "discarded, not scored" is a recorded decision rather than a missing row.
  voided_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_entities_reference_unique_per_organisation unique (organisation_id, reference),
  constraint scheduled_entities_voided_reason_consistent check ((result_state = 'voided') = (voided_reason is not null))
);

create index if not exists scheduled_entities_organisation_idx on public.scheduled_entities(organisation_id);
create index if not exists scheduled_entities_deadline_idx on public.scheduled_entities(organisation_id, decision_deadline);

-- The lifecycle, as one answer rather than five places that each work it out.
--
-- `scheduled` and `locked` are the same stored row read at different times,
-- which is the whole point: nothing has to happen at the deadline for the
-- deadline to take effect.
create or replace function public.scheduled_entity_state(entity_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when entity.result_state <> 'scheduled' then entity.result_state
    when now() < entity.decision_deadline then 'scheduled'
    else 'locked'
  end
  from public.scheduled_entities entity
  where entity.id = entity_id
    and app_private.has_org_role(entity.organisation_id, null);
$$;

revoke all on function public.scheduled_entity_state(uuid) from public;
grant execute on function public.scheduled_entity_state(uuid) to authenticated;

-- Used by policies and triggers below, and separate from the public function
-- because a policy must not depend on the caller being allowed to *read* the
-- entity in order to decide whether they may *write* a decision about it.
create or replace function app_private.decision_window_open(entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.scheduled_entities entity
    where entity.id = entity_id
      and entity.result_state = 'scheduled'
      and now() < entity.decision_deadline
  );
$$;

revoke all on function app_private.decision_window_open(uuid) from public;
grant execute on function app_private.decision_window_open(uuid) to authenticated;

-- The deadline is defended here rather than by withholding an UPDATE grant,
-- for the reason recorded in the records recipe: a Supabase database has
-- already granted `authenticated` table-wide UPDATE through default privileges
-- before this file runs, so a narrower column grant documents intent and
-- enforces nothing.
--
-- The rule it enforces is the one that matters: a closed window never reopens.
-- Moving a deadline while decisions are still open is ordinary rescheduling.
-- Moving it after it has passed would admit decisions taken by someone who has
-- already seen how the event is going, which is the single most valuable thing
-- an attacker could do to a product of this shape.
create or replace function app_private.guard_scheduled_entity_columns()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.decision_deadline is distinct from old.decision_deadline
     and old.result_state = 'scheduled'
     and now() >= old.decision_deadline then
    raise exception 'The decision window for this entity has already closed and cannot be reopened or moved.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.decision_deadline is distinct from old.decision_deadline and old.result_state <> 'scheduled' then
    raise exception 'The deadline of an entity that has left the scheduled state cannot be changed.'
      using errcode = 'insufficient_privilege';
  end if;

  -- `result_state` moves only through the privileged transitions below, which
  -- identify themselves for the duration of one statement. A caller cannot
  -- reach this setting to any effect without going through a function that
  -- checks their role first.
  if new.result_state is distinct from old.result_state
     and coalesce(current_setting('app.scheduled_transition', true), '') <> 'on' then
    raise exception 'result_state is maintained by the scheduled-decisions transition functions and cannot be written directly.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists scheduled_entities_guard_columns on public.scheduled_entities;
create trigger scheduled_entities_guard_columns
before update on public.scheduled_entities
for each row execute function app_private.guard_scheduled_entity_columns();

alter table public.scheduled_entities enable row level security;

revoke all on public.scheduled_entities from anon, authenticated;
grant select, insert on public.scheduled_entities to authenticated;
grant update (reference, title, decision_deadline) on public.scheduled_entities to authenticated;

create policy "scheduled_entities_select_member" on public.scheduled_entities for select to authenticated
using (app_private.has_org_role(organisation_id, null));

create policy "scheduled_entities_insert_admin" on public.scheduled_entities for insert to authenticated
with check (
  app_private.has_org_role(organisation_id, array['owner', 'admin'])
  and created_by = (select auth.uid())
);

create policy "scheduled_entities_update_admin" on public.scheduled_entities for update to authenticated
using (app_private.has_org_role(organisation_id, array['owner', 'admin']))
with check (app_private.has_org_role(organisation_id, array['owner', 'admin']));

-- --- The decision ---------------------------------------------------------------

create table if not exists public.scheduled_decisions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.scheduled_entities(id) on delete cascade,
  -- The competitor, not the tenant. Isolation here is between two identities
  -- inside the SAME organisation, which is a different axis from the tenant
  -- isolation the organisations recipe proves, and is the one this shape gets
  -- wrong: everybody is allowed in the room, and still must not see each
  -- other's answer before the deadline.
  identity_id uuid not null references auth.users(id) on delete cascade,
  -- What was decided. Opaque on purpose; `app_domain.score_decision` is the only
  -- thing entitled to an opinion about its shape.
  choice jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_decisions_one_per_identity unique (entity_id, identity_id)
);

create index if not exists scheduled_decisions_entity_idx on public.scheduled_decisions(entity_id);
create index if not exists scheduled_decisions_identity_idx on public.scheduled_decisions(identity_id);

-- Row level security decides which rows a *client* may touch. This decides what
-- is true regardless of who is asking, including `service_role`, an operator at
-- a psql prompt, and any later function that forgets. A late decision is not a
-- permissions mistake to be caught at the edge; it is a false statement about
-- when something happened.
create or replace function app_private.guard_scheduled_decision_window()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.entity_id is distinct from old.entity_id then
      raise exception 'A decision cannot be moved to a different entity.' using errcode = 'insufficient_privilege';
    end if;
    if new.identity_id is distinct from old.identity_id then
      raise exception 'A decision cannot be reassigned to a different identity.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Two messages rather than one, because the two mistakes are different and a
  -- product that reports them identically makes the second one look like the
  -- first. "You are too late to enter" is a person who missed a deadline;
  -- "your entry is now fixed" is a person trying to change an answer after
  -- everybody can see it.
  if not app_private.decision_window_open(coalesce(new.entity_id, old.entity_id)) then
    if tg_op = 'UPDATE' then
      raise exception 'A locked decision is not editable, including by the identity that made it.'
        using errcode = 'insufficient_privilege';
    end if;
    raise exception 'The decision window for this entity closed at its stored deadline.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists scheduled_decisions_guard_window on public.scheduled_decisions;
create trigger scheduled_decisions_guard_window
before insert or update on public.scheduled_decisions
for each row execute function app_private.guard_scheduled_decision_window();

alter table public.scheduled_decisions enable row level security;

revoke all on public.scheduled_decisions from anon, authenticated;
grant select, insert on public.scheduled_decisions to authenticated;
grant update (choice) on public.scheduled_decisions to authenticated;

-- Read: your own decision whenever you like, and everybody else's only once the
-- entity has left its open window. This is the reveal rule, and it is a SELECT
-- policy rather than a client-side filter because a product that hides other
-- people's answers in React has not hidden them at all.
create policy "scheduled_decisions_select_own_or_revealed" on public.scheduled_decisions for select to authenticated
using (
  identity_id = (select auth.uid())
  or (
    not app_private.decision_window_open(entity_id)
    and exists (
      select 1 from public.scheduled_entities entity
      where entity.id = entity_id and app_private.has_org_role(entity.organisation_id, null)
    )
  )
);

-- Write: only as yourself, only into an entity of an organisation you belong to,
-- and only while the window is open.
--
-- The window condition is repeated from the trigger, and it is the trigger that
-- a late client actually hears from: a policy's `with check` is evaluated AFTER
-- before-row triggers have fired, so the trigger raises first. The repetition is
-- not there to produce the message. It is there so that the write boundary is
-- complete when someone reads the policies alone — which is where a reviewer
-- looks — and so that removing the trigger does not silently open the window.
create policy "scheduled_decisions_insert_own_while_open" on public.scheduled_decisions for insert to authenticated
with check (
  identity_id = (select auth.uid())
  and app_private.decision_window_open(entity_id)
  and exists (
    select 1 from public.scheduled_entities entity
    where entity.id = entity_id and app_private.has_org_role(entity.organisation_id, null)
  )
);

-- The window condition is in `with check` and deliberately NOT in `using`.
--
-- A `using` clause filters rows away, so a late amendment would match nothing
-- and the UPDATE would report success having changed nothing — the author would
-- be told their revision was saved. Leaving the row visible to the statement and
-- refusing the result turns that silence into the refusal it actually is.
--
-- Ownership stays in `using`, because there the silence is correct: refusing to
-- distinguish "not yours" from "no such row" is what stops one competitor
-- confirming another's decision exists.
create policy "scheduled_decisions_update_own_while_open" on public.scheduled_decisions for update to authenticated
using (identity_id = (select auth.uid()))
with check (identity_id = (select auth.uid()) and app_private.decision_window_open(entity_id));

-- --- The official result --------------------------------------------------------

create table if not exists public.scheduled_official_results (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.scheduled_entities(id) on delete cascade,
  -- Monotonic per entity. A correction is a new version, never an edit: the
  -- settlement identity key includes this number, so replacing a result in
  -- place would make two different settlements indistinguishable.
  version integer not null check (version >= 1),
  -- The provisional/official boundary, which is the whole reason this table
  -- exists rather than a column on the entity. A feed that reports a result
  -- while the event is still running is reporting something true and not yet
  -- final, and a product that settles on it has paid out on a guess.
  status text not null check (status in ('in-progress', 'unconfirmed', 'provisional', 'confirmed')),
  outcome jsonb not null,
  -- Provenance and freshness. "Where did this come from and when was it seen"
  -- is the difference between an official result and an assertion.
  source text not null check (char_length(source) between 1 and 200),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint scheduled_official_results_version_unique_per_entity unique (entity_id, version)
);

create index if not exists scheduled_official_results_entity_idx on public.scheduled_official_results(entity_id, version desc);

alter table public.scheduled_official_results enable row level security;

revoke all on public.scheduled_official_results from anon, authenticated;
-- Readable by members, writable by nobody through the client. Results arrive
-- through an ingestion path holding service credentials; there is no product
-- reason for a browser to be able to declare what officially happened.
grant select on public.scheduled_official_results to authenticated;

create policy "scheduled_official_results_select_member" on public.scheduled_official_results for select to authenticated
using (
  exists (
    select 1 from public.scheduled_entities entity
    where entity.id = entity_id and app_private.has_org_role(entity.organisation_id, null)
  )
);

-- --- Settlement -----------------------------------------------------------------

create table if not exists public.scheduled_settlements (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.scheduled_entities(id) on delete cascade,
  identity_id uuid not null references auth.users(id) on delete cascade,
  official_result_version integer not null,
  points integer not null,
  settled_at timestamptz not null default now(),
  -- The frozen settlement identity key, as a constraint rather than as a
  -- convention. Idempotence that lives in application code is idempotence until
  -- two requests arrive at once.
  constraint scheduled_settlements_identity_key unique (entity_id, identity_id, official_result_version)
);

create index if not exists scheduled_settlements_identity_idx on public.scheduled_settlements(identity_id);

alter table public.scheduled_settlements enable row level security;

revoke all on public.scheduled_settlements from anon, authenticated;
grant select on public.scheduled_settlements to authenticated;

-- Settled scores are public within the organisation. They only exist after the
-- window closed, so revealing them reveals nothing that was still secret.
create policy "scheduled_settlements_select_member" on public.scheduled_settlements for select to authenticated
using (
  exists (
    select 1 from public.scheduled_entities entity
    where entity.id = entity_id and app_private.has_org_role(entity.organisation_id, null)
  )
);

/*
 * Settle every decision on one entity against its latest confirmed result.
 *
 * Returns the number of settlements this call actually created, which is what
 * makes idempotence observable: the second call returns 0 rather than looking
 * identical to the first from the outside.
 *
 * A correction does not overwrite. A newly confirmed version settles again under
 * a new identity key, the previous rows stay where they are as the record of
 * what was paid before the correction, and the leaderboard counts only the
 * latest version — so the score changes without the history being lost.
 */
create or replace function public.settle_scheduled_entity(entity_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.scheduled_entities;
  official public.scheduled_official_results;
  created integer;
begin
  select * into target from public.scheduled_entities where id = settle_scheduled_entity.entity_id;

  -- A security definer function reads past row level security, so it re-imposes
  -- it deliberately. A caller outside the organisation is told the entity does
  -- not exist, exactly as RLS would have, rather than being told it exists and
  -- is not theirs.
  if not found or not app_private.has_org_role(target.organisation_id, null) then
    raise exception 'Scheduled entity % does not exist.', settle_scheduled_entity.entity_id using errcode = 'no_data_found';
  end if;

  if not app_private.has_org_role(target.organisation_id, array['owner', 'admin']) then
    raise exception 'Settling an entity requires the owner or admin role in its organisation.' using errcode = 'insufficient_privilege';
  end if;

  if target.result_state = 'voided' then
    raise exception 'A voided entity has no result to settle.' using errcode = 'invalid_parameter_value';
  end if;

  -- Settling before the window closes would score decisions that can still be
  -- changed, and would reveal that they had been scored.
  if target.result_state = 'scheduled' and now() < target.decision_deadline then
    raise exception 'The decision window for this entity has not closed yet.' using errcode = 'invalid_parameter_value';
  end if;

  -- `confirmed` is the only official status. A feed reporting a score while the
  -- event is still running is reporting something true and not yet final, and
  -- this is the line that stops it paying out.
  select * into official
  from public.scheduled_official_results result
  where result.entity_id = settle_scheduled_entity.entity_id
    and result.status = 'confirmed'
  order by result.version desc
  limit 1;

  if not found then
    raise exception 'No confirmed official result has been recorded for this entity. Provisional reports do not settle.'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.scheduled_settlements (entity_id, identity_id, official_result_version, points)
  select decision.entity_id,
         decision.identity_id,
         official.version,
         app_domain.score_decision(decision.choice, official.outcome)
  from public.scheduled_decisions decision
  where decision.entity_id = settle_scheduled_entity.entity_id
  on conflict on constraint scheduled_settlements_identity_key do nothing;

  get diagnostics created = row_count;

  perform set_config('app.scheduled_transition', 'on', true);
  update public.scheduled_entities set result_state = 'settled' where id = settle_scheduled_entity.entity_id;
  perform set_config('app.scheduled_transition', 'off', true);

  return created;
end;
$$;

revoke all on function public.settle_scheduled_entity(uuid) from public;
grant execute on function public.settle_scheduled_entity(uuid) to authenticated;

/*
 * Discard an entity that will never produce a result.
 *
 * Separate from settlement because the outcome is different in kind: decisions
 * are not scored zero, they are not scored at all. Any settlements a correction
 * had already produced are removed, because a voided entity contributing to a
 * leaderboard is the failure this state exists to prevent.
 */
create or replace function public.void_scheduled_entity(entity_id uuid, reason text)
returns public.scheduled_entities
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.scheduled_entities;
begin
  select * into target from public.scheduled_entities where id = void_scheduled_entity.entity_id;
  if not found or not app_private.has_org_role(target.organisation_id, null) then
    raise exception 'Scheduled entity % does not exist.', void_scheduled_entity.entity_id using errcode = 'no_data_found';
  end if;
  if not app_private.has_org_role(target.organisation_id, array['owner', 'admin']) then
    raise exception 'Voiding an entity requires the owner or admin role in its organisation.' using errcode = 'insufficient_privilege';
  end if;
  if reason is null or char_length(btrim(reason)) = 0 then
    raise exception 'Voiding an entity requires a recorded reason.' using errcode = 'invalid_parameter_value';
  end if;

  delete from public.scheduled_settlements where scheduled_settlements.entity_id = void_scheduled_entity.entity_id;

  perform set_config('app.scheduled_transition', 'on', true);
  update public.scheduled_entities
  set result_state = 'voided', voided_reason = btrim(reason)
  where id = void_scheduled_entity.entity_id
  returning * into target;
  perform set_config('app.scheduled_transition', 'off', true);

  return target;
end;
$$;

revoke all on function public.void_scheduled_entity(uuid, text) from public;
grant execute on function public.void_scheduled_entity(uuid, text) to authenticated;

-- Some Postgres images hand `anon` EXECUTE on new functions by default, so the
-- unauthenticated role is named explicitly rather than assumed to be covered by
-- revoking from `public`.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.settle_scheduled_entity(uuid) from anon';
    execute 'revoke all on function public.void_scheduled_entity(uuid, text) from anon';
    execute 'revoke all on function public.scheduled_entity_state(uuid) from anon';
    execute 'revoke all on function app_domain.score_decision(jsonb, jsonb) from anon';
    execute 'revoke all on function app_domain.max_decision_points() from anon';
    execute 'revoke usage on schema app_domain from anon';
  end if;
end
$$;

-- --- The leaderboard ------------------------------------------------------------
--
-- A read model, and a totally ordered one. `board_position` is computed with a window
-- function whose ordering ends in a unique column, so there is no tie for the
-- view to resolve arbitrarily and no dependence on a consumer remembering to
-- add the same ORDER BY. A leaderboard that renders in a different order on
-- Tuesday is not a leaderboard.
--
-- Only the latest confirmed version of each entity contributes, so a corrected
-- result replaces the score it produced instead of adding to it.
create or replace view public.scheduled_leaderboard as
with latest as (
  select result.entity_id, max(result.version) as version
  from public.scheduled_official_results result
  where result.status = 'confirmed'
  group by result.entity_id
),
totals as (
  select settlement.identity_id,
         sum(settlement.points)::bigint as total_score,
         count(*) filter (where settlement.points = app_domain.max_decision_points())::bigint as top_score_count
  from public.scheduled_settlements settlement
  join latest on latest.entity_id = settlement.entity_id
             and latest.version = settlement.official_result_version
  group by settlement.identity_id
)
select totals.identity_id,
       totals.total_score,
       totals.top_score_count,
       row_number() over (
         order by totals.total_score desc, totals.top_score_count desc, totals.identity_id asc
       )::bigint as board_position
from totals;

-- The view runs with the privileges of the caller, so the settlements policy
-- above still decides which rows reach it.
alter view public.scheduled_leaderboard set (security_invoker = on);

revoke all on public.scheduled_leaderboard from anon, authenticated;
grant select on public.scheduled_leaderboard to authenticated;
