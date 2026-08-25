-- App Builder profiles recipe. Review before creating a real Supabase migration.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select, insert on public.profiles to authenticated;
grant update (display_name, avatar_url, updated_at) on public.profiles to authenticated;

create policy "profiles_select_own" on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
