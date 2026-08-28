-- App Builder profiles recipe. Review before creating a real Supabase migration.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- The write boundary: WHICH COLUMNS may change, as opposed to which rows.
--
-- `revoke` first, and it is not ceremony. A Supabase database applies
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role` before any recipe runs, so by the time this file
-- executes both roles already hold table-wide UPDATE on this table. A narrower
-- `grant update (...)` after that ADDS a column grant to a role that can already
-- write every column: it reads like a restriction and is not one. Measured, not
-- assumed - `tooling/db-privilege-probe.sh` prints the effective model.
--
-- Revoking first is what makes the grant below mean what it says. Row level
-- security still decides which rows; this decides which fields of them.
revoke all on public.profiles from anon, authenticated;
grant select, insert on public.profiles to authenticated;
grant update (display_name, avatar_url, updated_at) on public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
