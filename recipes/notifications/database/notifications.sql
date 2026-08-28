-- App Builder in-app notifications recipe. Review before creating a real Supabase migration.
--
-- The first capability in this factory whose rows are created by the DATABASE
-- rather than by a client. Records and files are things a person puts there;
-- a notification is something the application says happened, and the difference
-- decides the whole security shape below.
--
-- ## What this is, and what it deliberately is not
--
-- It is one sentence:
--
--   a real application event  ->  an in-app notification for the people it concerns
--
-- It is NOT an event bus, a queue, a worker, a realtime channel, an email
-- pipeline, a webhook dispatcher or a scheduled job. Each of those may one day
-- consume this same seam; none of them is needed to prove that a generated
-- application can tell the right person that something happened, and building
-- them here would be speculative infrastructure with no consumer.
--
-- The event seam is deliberately the smallest one available: a trigger on the
-- table whose changes are the events. There is no separate `events` table
-- because nothing reads one, and a second source of truth for "what happened"
-- is exactly the kind of thing this factory refuses to add ahead of a consumer.
--
-- ## Ownership is two-dimensional, and both halves are enforced
--
-- A notification belongs to an ORGANISATION and to a RECIPIENT. Records and
-- files only ever needed the first: any member of the owning organisation may
-- read any of its records. A notification addressed to a colleague is not
-- readable by the rest of the organisation, so `has_org_role` alone is not the
-- boundary here — it is half of it.
--
-- Every policy therefore tests both, and the organisation half is not
-- redundant: it is what stops a person who has LEFT an organisation from
-- continuing to read what it told them, and it keeps the tenant predicate on
-- the row even though the recipient predicate would usually reach the same
-- answer.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  -- Who this is for. Not "who caused it": the actor is deliberately not stored,
  -- because nothing in the product surface shows it and a column no consumer
  -- reads is a column that will drift.
  recipient_id uuid not null references auth.users(id) on delete cascade,
  -- A bounded enumeration rather than free text. A client cannot write this
  -- column at all (see the grants below), but the constraint is what stops a
  -- future recipe from turning it into an open string and inventing a
  -- notification kind the product has never rendered.
  kind text not null check (kind in ('record-created', 'record-archived')),
  title text not null check (char_length(title) between 1 and 200),
  body text check (body is null or char_length(body) <= 1000),
  -- Null is unread. A nullable timestamp rather than a boolean plus a
  -- timestamp, because two columns that must agree are two columns that
  -- eventually will not.
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Every read is "my notifications, newest first", so that is the index.
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
-- The unread count is the other question the surface asks, and it asks it often.
create index if not exists notifications_recipient_unread_idx on public.notifications(recipient_id) where read_at is null;
create index if not exists notifications_organisation_idx on public.notifications(organisation_id);

-- --- The write boundary: WHICH COLUMNS may change ------------------------------
--
-- `revoke` first, and it is not ceremony. A Supabase database applies
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role` before any recipe runs, so by the time this file
-- executes both roles already hold table-wide INSERT, UPDATE and DELETE on this
-- table. A narrower `grant update (...)` after that ADDS a column grant to a
-- role that can already write every column: it reads like a restriction and is
-- not one. Measured, not assumed - `tooling/db-privilege-probe.sh` prints the
-- effective model.
--
-- What is granted back is the whole product surface and nothing else:
--
--   select                -> read my own notifications
--   update (read_at)      -> mark one of them read
--
-- There is NO insert grant and NO delete grant, for anybody. That is the
-- forgery boundary, and it is a privilege rather than a policy on purpose: an
-- insert POLICY can only test what the row says about itself, so a client that
-- named itself as the recipient of a `record-archived` notification it invented
-- would satisfy any honest `with check` clause. Withholding the privilege
-- refuses the statement before a policy is ever consulted, and it refuses it
-- for every kind, every recipient and every organisation at once.
--
-- The only thing that may create a notification is the trigger at the foot of
-- this file, which runs as the table's owner and is reachable only by causing
-- the application event it watches.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- The column guard, and why it exists beside the grant rather than instead of it.
--
-- Two mechanisms defend the same columns, which is defence in depth rather than
-- duplication: the grant stops today's client, and this stops a future recipe
-- author who widens the grant list without thinking about what a widened list
-- lets a recipient do to their own row. The records recipe learned this the
-- hard way with `archived_at`.
--
-- It also does one thing the grant cannot. `read_at` IS writable by the
-- recipient, so without this a person could mark a notification read at a time
-- of their choosing - backdated, or in the future - and any later feature that
-- trusted that timestamp would be trusting the client. The recipient decides
-- THAT they have read it; the database decides WHEN.
create or replace function app_private.guard_notification_columns()
returns trigger
language plpgsql
as $$
begin
  -- One row comparison rather than a seven-clause `or`, and that is a testing
  -- decision as much as a style one. A chain can be half-removed, which would
  -- let the mutation harness report this safeguard as covered when only part of
  -- it had been broken; a single comparison is either enforced or it is not.
  if row(new.id, new.organisation_id, new.recipient_id, new.kind, new.title, new.body, new.created_at) is distinct from row(old.id, old.organisation_id, old.recipient_id, old.kind, old.title, old.body, old.created_at) then
    raise exception 'A notification''s ownership and content are set when it is raised and cannot be rewritten.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.read_at is distinct from old.read_at then
    if old.read_at is not null then
      raise exception 'A notification that has been read cannot be changed again.'
        using errcode = 'insufficient_privilege';
    end if;
    -- The client asked to mark it read. When that happened is not theirs to say.
    new.read_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_columns on public.notifications;
create trigger notifications_guard_columns
before update on public.notifications
for each row execute function app_private.guard_notification_columns();

alter table public.notifications enable row level security;

-- --- Row level security ---------------------------------------------------------
--
-- Read: the recipient, and only while they are still a member of the owning
-- organisation. Both halves are load-bearing. The recipient predicate is what
-- keeps one colleague out of another's notifications; the organisation
-- predicate is what stops a former member from continuing to read what the
-- organisation told them, and keeps the tenant boundary on the row rather than
-- relying on `recipient_id` having been set correctly by something else.
create policy "notifications_select_recipient" on public.notifications for select to authenticated
using (
  recipient_id = (select auth.uid())
  and app_private.has_org_role(organisation_id, null)
);

-- Update: the same person, tested again after the change. The `with check`
-- half is what stops an update from being a reassignment - it re-tests both
-- predicates against the row as it would be, so a write that tried to move a
-- notification to another recipient or another organisation would have to
-- satisfy the destination as well. It cannot reach that test today, because
-- neither column is granted and the trigger raises first; the clause is here so
-- that widening either of those does not silently open a hand-off.
create policy "notifications_update_recipient" on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) and app_private.has_org_role(organisation_id, null))
with check (recipient_id = (select auth.uid()) and app_private.has_org_role(organisation_id, null));

-- There is deliberately NO insert policy and NO delete policy.
--
-- Their absence is the design, not an oversight, and it is asserted by a
-- contract test so that nobody adds one back for symmetry. An insert policy
-- would be the only way a client could ever forge a system notification, and a
-- delete policy would let a recipient destroy the record that something was
-- told to them. Nothing in the product needs either.

-- --- The application event ------------------------------------------------------
--
-- One trigger, on the one table whose changes are application events today.
--
-- It is `security definer` because it writes a table no caller may write, and
-- that is the entire elevation: it can insert notifications, and it can do
-- nothing else. It reads the row the database has already accepted - so the
-- records policies have already decided the caller was entitled to cause this
-- event - and it fans out to the membership table, which is the existing
-- authority on who is in an organisation. Nothing the client sent chooses a
-- recipient, a kind, an organisation or a timestamp.
--
-- The actor is excluded. A person does not need to be told what they just did,
-- and excluding them is what makes "the recipient sees it and the author does
-- not" a visible product behaviour rather than an invisible policy detail.
--
-- `auth.uid()` is null when the event is caused by a migration, a seed or an
-- operator at a psql prompt. Falling back to the record's own author keeps the
-- exclusion deterministic in those cases instead of notifying everybody.
create or replace function app_private.notify_record_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_kind text;
  event_title text;
  event_body text;
  actor uuid := coalesce((select auth.uid()), new.created_by);
begin
  if tg_op = 'INSERT' then
    event_kind := 'record-created';
    event_title := 'New record: ' || new.title;
    event_body := new.reference || ' was added to this organisation.';
  elsif new.status = 'archived' and old.status is distinct from 'archived' then
    event_kind := 'record-archived';
    event_title := 'Record archived: ' || new.title;
    event_body := new.reference || ' was moved to the archive.';
  else
    -- Every other update is an ordinary edit. A notification per keystroke-sized
    -- change would make the surface useless, which is a product decision and is
    -- made here rather than in the client that would have to filter it out.
    return null;
  end if;

  insert into public.notifications (organisation_id, recipient_id, kind, title, body)
  select new.organisation_id, membership.user_id, event_kind, left(event_title, 200), left(event_body, 1000)
  from public.organisation_memberships membership
  where membership.organisation_id = new.organisation_id
    and membership.user_id is distinct from actor;

  return null;
end;
$$;

drop trigger if exists records_notify_members on public.records;
create trigger records_notify_members
after insert or update of status on public.records
for each row execute function app_private.notify_record_event();

-- Not granted to anyone. A trigger function is invoked by the database on the
-- table's behalf, never called directly, so an EXECUTE grant would only widen
-- what a caller can reach - and some Postgres images hand `anon` EXECUTE on new
-- functions by default, which is why this is stated rather than assumed.
revoke all on function app_private.notify_record_event() from public;
revoke all on function app_private.guard_notification_columns() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_private.notify_record_event() from anon';
    execute 'revoke all on function app_private.guard_notification_columns() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_private.notify_record_event() from authenticated';
    execute 'revoke all on function app_private.guard_notification_columns() from authenticated';
  end if;
end
$$;
