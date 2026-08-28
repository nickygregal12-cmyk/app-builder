-- App Builder tenant-records recipe. Review before creating a real Supabase migration.
--
-- The first organisation-owned DOMAIN entity. Everything before it — profiles,
-- organisations, memberships — is the tenancy machinery itself; this is a
-- product's own data living inside that machinery, which is what makes
-- "organisation A cannot see organisation B's records" a testable sentence
-- rather than an aspiration with nothing to test.
--
-- Tenancy is enforced in the DATABASE, never in the client. The browser is
-- trusted to *say* which organisation a row belongs to and never to *decide*
-- it: every policy re-derives the caller's membership through
-- `app_private.has_org_role`, so a forged organisation_id from a compromised or
-- hand-driven client is refused by Postgres rather than by a React component
-- that happened to filter correctly.
--
-- The reusable part is this shape, not the noun. A later domain recipe that
-- needs invoices, tickets or shipments copies the pattern below — an
-- `organisation_id` with a real foreign key, `has_org_role` in every policy, a
-- privileged column no role may write directly, and one bounded security
-- definer function — without touching auth, organisations or memberships.

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- A human-quotable identifier. Unique per organisation rather than globally,
  -- because two tenants naming a record REC-001 is not a collision.
  reference text not null check (reference ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  title text not null check (char_length(title) between 1 and 200),
  summary text check (summary is null or char_length(summary) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- Set only by `public.set_record_archived`. No role holds an UPDATE grant on
  -- this column, and the constraint below makes the status and the timestamp
  -- inseparable, so "archived" cannot be reached by any path that skips the
  -- privileged operation.
  archived_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint records_reference_unique_per_organisation unique (organisation_id, reference),
  constraint records_archived_state_consistent check ((status = 'archived') = (archived_at is not null))
);

-- Every read is scoped to one organisation, so that is the index that matters.
create index if not exists records_organisation_idx on public.records(organisation_id);
create index if not exists records_organisation_status_idx on public.records(organisation_id, status);
create index if not exists records_created_by_idx on public.records(created_by);

-- `updated_at` is maintained here rather than granted to the client, and
-- `archived_at` is defended here rather than by withholding a grant.
--
-- Withholding the grant is not enough, and that is worth stating plainly
-- because it is easy to believe otherwise. A Supabase database ships with
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role`, so every new table in `public` ALREADY grants
-- `authenticated` full UPDATE before this file's narrower
-- `grant update (…)` runs — and a narrower grant adds nothing, it does not take
-- the broader one away. The column grant below therefore documents intent; this
-- trigger is what enforces it.
--
-- The privileged path identifies itself with a transaction-local setting that
-- only `set_record_archived` sets. A caller cannot set it themselves to any
-- effect, because reaching the setting still means going through the function,
-- which checks the organisation role first.
create or replace function app_private.guard_record_columns()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.archived_at is distinct from old.archived_at
     and coalesce(current_setting('app.records_archiving', true), '') <> 'on' then
    raise exception 'archived_at is maintained by set_record_archived() and cannot be written directly.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists records_guard_columns on public.records;
create trigger records_guard_columns
before update on public.records
for each row execute function app_private.guard_record_columns();

alter table public.records enable row level security;

-- Column-level grants are the first boundary and are deliberately narrow.
-- `organisation_id` is absent from the UPDATE grant, so a row cannot be moved
-- between tenants even by someone who belongs to both; `archived_at` is absent
-- so the privileged operation is the only way to reach the archived state.
grant select, insert, delete on public.records to authenticated;
grant update (reference, title, summary, status) on public.records to authenticated;

-- --- Row level security -------------------------------------------------------
--
-- Read: any member of the owning organisation, whatever their role. A viewer
-- exists to see things.
create policy "records_select_member" on public.records for select to authenticated
using (app_private.has_org_role(organisation_id, null));

-- Create: everyone except a viewer, and only into an organisation the caller
-- actually belongs to. `created_by` is pinned to the caller so authorship
-- cannot be attributed to someone else.
create policy "records_insert_contributor" on public.records for insert to authenticated
with check (
  app_private.has_org_role(organisation_id, array['owner', 'admin', 'editor', 'member'])
  and created_by = (select auth.uid())
);

-- Update: the same contributors. The `with check` clause is the half that
-- matters for tenancy — it re-tests membership against the row AFTER the
-- change, so an update that rewrites `organisation_id` has to satisfy
-- membership of the destination organisation as well as the source.
create policy "records_update_contributor" on public.records for update to authenticated
using (app_private.has_org_role(organisation_id, array['owner', 'admin', 'editor', 'member']))
with check (app_private.has_org_role(organisation_id, array['owner', 'admin', 'editor', 'member']));

-- Delete: an organisation-scoped privilege. A member may create and revise
-- their own organisation's work; removing it is an owner/admin decision.
create policy "records_delete_admin" on public.records for delete to authenticated
using (app_private.has_org_role(organisation_id, array['owner', 'admin']));

-- --- The bounded privileged operation ------------------------------------------
--
-- Archiving is organisation-scoped, not platform-scoped. The `admin` recipe's
-- `usePlatformAdmin()` reads `app_metadata.platform_role` in the browser and
-- says of itself that UI gating is not authorization; using it here would make
-- a client-held claim the gate on a database write.
--
-- This is a narrow security definer function rather than a blanket RLS bypass:
-- it changes two columns of one row, it re-derives the caller's role from the
-- membership table, and it raises rather than returning quietly when the caller
-- is not entitled — a silent no-op would let a caller believe they had archived
-- something.
create or replace function public.set_record_archived(record_id uuid, archived boolean)
returns public.records
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.records;
begin
  select * into target from public.records where id = record_id;

  -- A security definer function reads past row level security, so it has to
  -- re-impose it deliberately. A caller who is not in the owning organisation
  -- is told the record does not exist, exactly as RLS would have told them by
  -- returning nothing: distinguishing "not yours" from "no such row" would let
  -- one tenant confirm another tenant's ids through the error message.
  if not found or not app_private.has_org_role(target.organisation_id, null) then
    raise exception 'Record % does not exist.', record_id using errcode = 'no_data_found';
  end if;

  -- Membership is re-derived here. Nothing the caller sent decides this.
  if not app_private.has_org_role(target.organisation_id, array['owner', 'admin']) then
    raise exception 'Archiving a record requires the owner or admin role in its organisation.' using errcode = 'insufficient_privilege';
  end if;

  -- Identify this write to the column guard for the duration of the
  -- statement only. `true` makes it transaction-local, so it cannot leak into
  -- a later statement on a pooled connection.
  perform set_config('app.records_archiving', 'on', true);
  update public.records
  set status = case when archived then 'archived' else 'draft' end,
      archived_at = case when archived then now() else null end
  where id = record_id
  returning * into target;
  perform set_config('app.records_archiving', 'off', true);

  return target;
end;
$$;

revoke all on function public.set_record_archived(uuid, boolean) from public;
grant execute on function public.set_record_archived(uuid, boolean) to authenticated;

-- Named explicitly rather than left to the platform's default privileges.
-- Revoking from `public` does not reach a role that was granted separately, and
-- some Postgres images hand `anon` EXECUTE on new functions by default. Without
-- this, an unauthenticated caller reaches the body and is refused by the
-- membership check instead of by the privilege — the same outcome by luck
-- rather than by declaration, and a different error depending on the host.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.set_record_archived(uuid, boolean) from anon';
  end if;
end
$$;
