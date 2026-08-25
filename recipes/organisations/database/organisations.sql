-- App Builder organisations/RBAC recipe. Review before creating a real Supabase migration.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.organisation_memberships (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);

create index if not exists organisations_created_by_idx on public.organisations(created_by);
create index if not exists organisation_memberships_user_idx on public.organisation_memberships(user_id);

create or replace function app_private.has_org_role(target_org uuid, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.organisation_memberships membership
    where membership.organisation_id = target_org
      and membership.user_id = (select auth.uid())
      and (allowed_roles is null or membership.role = any(allowed_roles))
  );
$$;

revoke all on function app_private.has_org_role(uuid, text[]) from public;
grant execute on function app_private.has_org_role(uuid, text[]) to authenticated;

alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;

grant select, insert, delete on public.organisations to authenticated;
grant update (name, slug) on public.organisations to authenticated;
grant select, insert, delete on public.organisation_memberships to authenticated;
grant update (role) on public.organisation_memberships to authenticated;

create policy "organisations_select_member" on public.organisations for select to authenticated
using ((select auth.uid()) = created_by or app_private.has_org_role(id, null));

create policy "organisations_insert_owner" on public.organisations for insert to authenticated
with check ((select auth.uid()) = created_by);

create policy "organisations_update_admin" on public.organisations for update to authenticated
using (app_private.has_org_role(id, array['owner','admin']))
with check (app_private.has_org_role(id, array['owner','admin']));

create policy "organisations_delete_owner" on public.organisations for delete to authenticated
using ((select auth.uid()) = created_by and (not exists (select 1 from public.organisation_memberships membership where membership.organisation_id = id) or app_private.has_org_role(id, array['owner'])));

create policy "memberships_select_self_or_admin" on public.organisation_memberships for select to authenticated
using ((select auth.uid()) = user_id or app_private.has_org_role(organisation_id, array['owner','admin']));

create policy "memberships_insert_owner_or_admin" on public.organisation_memberships for insert to authenticated
with check (
  ((select auth.uid()) = user_id and role = 'owner' and exists (
    select 1 from public.organisations organisation
    where organisation.id = organisation_id and organisation.created_by = (select auth.uid())
  ))
  or (app_private.has_org_role(organisation_id, array['owner','admin']) and role in ('admin','editor','member','viewer'))
);

create policy "memberships_update_admin" on public.organisation_memberships for update to authenticated
using (app_private.has_org_role(organisation_id, array['owner','admin']) and role <> 'owner')
with check (app_private.has_org_role(organisation_id, array['owner','admin']) and role in ('admin','editor','member','viewer'));

create policy "memberships_delete_admin_or_self" on public.organisation_memberships for delete to authenticated
using ((role <> 'owner' and (select auth.uid()) = user_id) or (role <> 'owner' and app_private.has_org_role(organisation_id, array['owner','admin'])));
