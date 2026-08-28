begin;

select plan(71);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.organisations'::regclass),
  'organisations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.organisation_memberships'::regclass),
  'organisation memberships has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.records'::regclass),
  'records has RLS enabled'
);

-- Create genuine local Supabase auth users before exercising recipe foreign keys
-- and RLS. This mirrors the minimal user shape used by Supabase test helpers while
-- keeping this acceptance gate self-contained and independent of a network-time
-- test-helper installation.
insert into auth.users (id, email, raw_user_meta_data) values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@test.local', '{"test_identifier":"owner-a"}'::jsonb),
  ('10000000-0000-0000-0000-000000000002', 'admin-a@test.local', '{"test_identifier":"admin-a"}'::jsonb),
  ('10000000-0000-0000-0000-000000000003', 'editor-a@test.local', '{"test_identifier":"editor-a"}'::jsonb),
  ('10000000-0000-0000-0000-000000000004', 'member-a@test.local', '{"test_identifier":"member-a"}'::jsonb),
  ('10000000-0000-0000-0000-000000000005', 'viewer-a@test.local', '{"test_identifier":"viewer-a"}'::jsonb),
  ('10000000-0000-0000-0000-000000000006', 'owner-b@test.local', '{"test_identifier":"owner-b"}'::jsonb),
  ('10000000-0000-0000-0000-000000000007', 'dual-ab@test.local', '{"test_identifier":"dual-ab"}'::jsonb);

insert into public.profiles (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'Owner A'),
  ('10000000-0000-0000-0000-000000000002', 'Admin A'),
  ('10000000-0000-0000-0000-000000000003', 'Editor A'),
  ('10000000-0000-0000-0000-000000000004', 'Member A'),
  ('10000000-0000-0000-0000-000000000005', 'Viewer A'),
  ('10000000-0000-0000-0000-000000000006', 'Owner B'),
  ('10000000-0000-0000-0000-000000000007', 'Dual AB');
insert into public.organisations (id, name, slug, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Organisation A', 'organisation-a', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Organisation B', 'organisation-b', '10000000-0000-0000-0000-000000000006');
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'editor'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'member'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'viewer'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'editor'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000007', 'editor');

-- Organisation-owned domain records. Two tenants with real rows, because a
-- tenant-isolation test with one tenant proves nothing: every query returns
-- everything the caller owns whether the predicate works or not.
--
--   Organisation A -> A1 (the record most assertions act on)
--                     A2 (kept draft for the archive-path tests)
--                     A3 (spent by the owner-delete assertion)
--   Organisation B -> B1 (must never be visible to Organisation A, or the
--                         reverse, whichever direction is under test)
insert into public.records (id, organisation_id, reference, title, summary, status, created_by) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'REC-A1', 'Organisation A first record', 'Owned by organisation A.', 'active', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'REC-A2', 'Organisation A archivable record', 'Used by the archive assertions.', 'draft', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'REC-A3', 'Organisation A deletable record', 'Used by the delete assertions.', 'draft', '10000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'REC-B1', 'Organisation B first record', 'Owned by organisation B.', 'active', '10000000-0000-0000-0000-000000000006');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'owner can read their organisation'
);
select results_eq(
  $$with changed as (update public.organisations set name = 'Organisation A owner edit' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'owner can update their organisation'
);
select results_eq(
  $$select count(*)::bigint from public.profiles$$,
  array[1::bigint],
  'profile RLS exposes only the current users profile'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'admin can read their organisation'
);
select results_eq(
  $$with changed as (update public.organisations set name = 'Organisation A admin edit' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'admin can update their organisation'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'editor can read their organisation'
);
select results_eq(
  $$with changed as (update public.organisations set name = 'editor must not edit organisation' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'editor cannot update organisation identity'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'member can read their organisation'
);
select results_eq(
  $$with changed as (update public.organisations set name = 'member must not edit organisation' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'member cannot update organisation identity'
);
select results_eq(
  $$select count(*)::bigint from public.organisation_memberships$$,
  array[1::bigint],
  'member can read only their own membership row'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'viewer can read their organisation'
);
select results_eq(
  $$with changed as (update public.organisations set name = 'viewer must not edit organisation' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'viewer cannot update organisation identity'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'a user from another organisation cannot read organisation A'
);
select results_eq(
  $$select count(*)::bigint from public.organisations where id = '20000000-0000-0000-0000-000000000002'$$,
  array[1::bigint],
  'cross-organisation isolation does not hide the users own organisation'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.organisations$$,
  '42501',
  'permission denied for table organisations',
  'anonymous users cannot read organisations'
);


-- ===========================================================================
-- Organisation-owned records: the first domain entity inside the tenancy.
--
-- Every assertion below acts through `authenticated` with a real JWT subject,
-- so what is being tested is the policy set a deployed application runs under
-- rather than a superuser's view of the table.
-- ===========================================================================

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
-- member-a: an ordinary contributor in organisation A
select results_eq(
  $$select count(*)::bigint from public.records where id = '30000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'a member of organisation A can read organisation A record A1'
);
select results_eq(
  $$select count(*)::bigint from public.records$$,
  array[3::bigint],
  'a member of organisation A sees only organisation A records, not organisation B record B1'
);
select results_eq(
  $$with created as (insert into public.records (organisation_id, reference, title, created_by) values ('20000000-0000-0000-0000-000000000001', 'REC-A-MEMBER', 'Created by a member', '10000000-0000-0000-0000-000000000004') returning 1) select count(*)::bigint from created$$,
  array[1::bigint],
  'a member of organisation A can create a record in their own organisation'
);
select results_eq(
  $$with changed as (update public.records set title = 'Member edited the title' where id = '30000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'a member of organisation A can update a record in their own organisation'
);

-- The tenancy barrier on the write path, tested from inside the tenant: a
-- member of A must not be able to hand one of A's records to B either.
-- This one RAISES rather than affecting no rows, and the difference is the
-- point. A `using` clause filters a row the caller may not touch, so a refused
-- update is silently zero rows; a `with check` clause tests the row as it would
-- be AFTER the write, so an update that tries to hand a record to another
-- tenant is rejected outright. Asserting zero rows here would have passed
-- against a policy with no `with check` clause at all.
select throws_ok(
  $$update public.records set organisation_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a member of organisation A cannot move a record into organisation B'
);

-- Role differentiation, part one: a member contributes but does not remove.
select results_eq(
  $$with removed as (delete from public.records where id = '30000000-0000-0000-0000-000000000003' returning 1) select count(*)::bigint from removed$$,
  array[0::bigint],
  'a member of organisation A cannot delete a record'
);

-- The privileged column is unreachable by an ordinary write. `archived_at`
-- carries no UPDATE grant and the check constraint ties it to the status, so
-- the archived state cannot be reached by any path that skips the function.
select throws_ok(
  $$update public.records set status = 'archived' where id = '30000000-0000-0000-0000-000000000002'$$,
  '23514',
  null,
  'a member cannot reach the archived state by writing status directly'
);

-- The column grant itself, rather than the constraint that backs it up. Setting
-- both fields at once is what a caller who had the privilege would do, so this
-- fails on the missing UPDATE grant for `archived_at` and not on the check
-- constraint. Mutation testing found this gap: granting the column left the
-- suite green, because the assertion above never tried to write it.
select throws_ok(
  $$update public.records set status = 'archived', archived_at = now() where id = '30000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'a member cannot write archived_at directly, whatever the table grants say'
);

-- The bounded privileged operation refuses a member outright rather than
-- silently doing nothing.
select throws_ok(
  $$select public.set_record_archived('30000000-0000-0000-0000-000000000002', true)$$,
  '42501',
  'Archiving a record requires the owner or admin role in its organisation.',
  'a member of organisation A cannot archive a record'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
-- viewer-a: read-only in organisation A
select results_eq(
  $$select count(*)::bigint from public.records where id = '30000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'a viewer in organisation A can read its records'
);
-- Role differentiation, part two: the viewer and the member differ, and they
-- differ in the direction the role names imply.
select throws_ok(
  $$insert into public.records (organisation_id, reference, title, created_by) values ('20000000-0000-0000-0000-000000000001', 'REC-A-VIEWER', 'Created by a viewer', '10000000-0000-0000-0000-000000000005')$$,
  '42501',
  null,
  'a viewer in organisation A cannot create a record'
);

-- The UPDATE policy's own tenant/role predicate, tested by the only caller who
-- can reach it: someone who may READ the row and may not WRITE it.
--
-- Added because mutation testing found the gap. Replacing that predicate with
-- `using (true)` left every assertion green, since the cross-tenant cases are
-- stopped by the SELECT policy before UPDATE is ever consulted. A viewer is
-- inside the tenant, so nothing hides the row from them, and the update policy
-- is the only thing that refuses.
select results_eq(
  $$with changed as (update public.records set title = 'Edited by a viewer' where id = '30000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'a viewer in organisation A cannot update a record it can read'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
-- admin-a: holds the organisation-scoped privilege
select results_eq(
  $$select status from public.set_record_archived('30000000-0000-0000-0000-000000000002', true)$$,
  array['archived'::text],
  'an admin of organisation A can archive one of its records'
);
select results_eq(
  $$select count(*)::bigint from public.records where id = '30000000-0000-0000-0000-000000000002' and archived_at is not null$$,
  array[1::bigint],
  'archiving stamps archived_at, which no role may write directly'
);
select results_eq(
  $$select status from public.set_record_archived('30000000-0000-0000-0000-000000000002', false)$$,
  array['draft'::text],
  'an admin of organisation A can restore a record it archived'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- owner-a: the broadest organisation-scoped role
select results_eq(
  $$with removed as (delete from public.records where id = '30000000-0000-0000-0000-000000000003' returning 1) select count(*)::bigint from removed$$,
  array[1::bigint],
  'an owner of organisation A can delete one of its records'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
-- owner-b: entitled in organisation B and nowhere else
select results_eq(
  $$select count(*)::bigint from public.records where id = '30000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  'organisation B cannot read organisation A record A1'
);
select results_eq(
  $$select count(*)::bigint from public.records$$,
  array[1::bigint],
  'organisation B sees only its own record'
);
select results_eq(
  $$with changed as (update public.records set title = 'Taken over by organisation B' where id = '30000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'organisation B cannot update organisation A record A1'
);
select results_eq(
  $$with removed as (delete from public.records where id = '30000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from removed$$,
  array[0::bigint],
  'organisation B cannot delete organisation A record A1'
);

-- Forgery: the browser is the one that sends organisation_id, so the case that
-- matters is a caller naming a tenant they do not belong to. The insert policy
-- re-derives membership and refuses.
select throws_ok(
  $$insert into public.records (organisation_id, reference, title, created_by) values ('20000000-0000-0000-0000-000000000001', 'REC-FORGED', 'Forged into organisation A', '10000000-0000-0000-0000-000000000006')$$,
  '42501',
  null,
  'organisation B cannot forge a record owned by organisation A'
);

-- Authorship forgery: even inside their own tenant, a caller cannot attribute
-- a record to somebody else.
select throws_ok(
  $$insert into public.records (organisation_id, reference, title, created_by) values ('20000000-0000-0000-0000-000000000002', 'REC-B-FORGED-AUTHOR', 'Attributed to another user', '10000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'a caller cannot attribute a record to another user'
);

-- The privileged operation must not leak existence across the tenant boundary:
-- organisation B is told the record does not exist, which is what row level
-- security would have told them by returning nothing.
select throws_ok(
  $$select public.set_record_archived('30000000-0000-0000-0000-000000000001', true)$$,
  'P0002',
  null,
  'the archive operation does not confirm that another tenant record exists'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.records$$,
  '42501',
  'permission denied for table records',
  'anonymous users cannot read records'
);
select throws_ok(
  $$select public.set_record_archived('30000000-0000-0000-0000-000000000001', true)$$,
  '42501',
  null,
  'anonymous users cannot invoke the archive operation'
);


-- ===========================================================================
-- The write boundary: WHICH COLUMNS, as opposed to which rows.
--
-- Row level security decides which rows a caller may touch. It says nothing
-- about which FIELDS of those rows may change, and every recipe here has been
-- relying on a narrow `grant update (...)` to draw that second line. A Supabase
-- database applies `alter default privileges in schema public grant all on
-- tables to anon, authenticated, service_role` before any recipe runs, so the
-- narrower grant ADDS a column grant to a role that already holds table-wide
-- UPDATE. It reads like a restriction and is not one.
--
-- Everything below is an identity or lifecycle column that no caller should be
-- able to rewrite. Each was reachable before the explicit revoke was added.
-- ===========================================================================

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
-- dual-ab: a contributor in BOTH organisations
-- Tenant hand-off. The records recipe claimed that omitting organisation_id
-- from the update grant prevented this; it did not, and for a caller entitled
-- in both organisations RLS passes on both sides of the write.
select throws_ok(
  $$update public.records set organisation_id = '20000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a contributor in two organisations cannot move a record between them'
);
select throws_ok(
  $$update public.records set created_by = '10000000-0000-0000-0000-000000000007' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a contributor cannot reassign authorship of a record'
);
select throws_ok(
  $$update public.records set id = '30000000-0000-0000-0000-0000000000ff' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a contributor cannot rewrite a record primary key'
);
select throws_ok(
  $$update public.records set created_at = now() - interval '5 years' where id = '30000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a contributor cannot backdate a record'
);
-- And the edit a contributor is supposed to make still works.
select results_eq(
  $$with changed as (update public.records set title = 'Edited by a dual-organisation contributor' where id = '30000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'the write boundary does not stop an intended record edit'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
-- admin-a: organisation admin, not its owner
-- Privilege escalation. `organisations_delete_owner` keys off created_by, so a
-- non-owner able to rewrite created_by can grant themselves the owner-only
-- delete right.
select throws_ok(
  $$update public.organisations set created_by = '10000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'an organisation admin cannot make themselves its creator'
);
select throws_ok(
  $$update public.organisations set created_at = now() - interval '5 years' where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'an organisation admin cannot backdate the organisation'
);
select throws_ok(
  $$update public.organisations set id = '20000000-0000-0000-0000-0000000000ff' where id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'an organisation admin cannot rewrite the organisation primary key'
);
select results_eq(
  $$with changed as (update public.organisations set name = 'Organisation A renamed by admin' where id = '20000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'the write boundary does not stop an intended organisation edit'
);

-- Membership identity. Changing a role is an admin's job; changing WHOSE
-- membership it is, or WHICH organisation it belongs to, is not.
select throws_ok(
  $$update public.organisation_memberships set user_id = '10000000-0000-0000-0000-000000000007' where organisation_id = '20000000-0000-0000-0000-000000000001' and user_id = '10000000-0000-0000-0000-000000000004'$$,
  '42501',
  null,
  'an admin cannot reassign a membership to a different user'
);
select throws_ok(
  $$update public.organisation_memberships set organisation_id = '20000000-0000-0000-0000-000000000002' where organisation_id = '20000000-0000-0000-0000-000000000001' and user_id = '10000000-0000-0000-0000-000000000004'$$,
  '42501',
  null,
  'an admin cannot move a membership into another organisation'
);
select throws_ok(
  $$update public.organisation_memberships set created_at = now() - interval '5 years' where organisation_id = '20000000-0000-0000-0000-000000000001' and user_id = '10000000-0000-0000-0000-000000000004'$$,
  '42501',
  null,
  'an admin cannot backdate a membership'
);
-- The one membership field an admin is meant to change still changes.
select results_eq(
  $$with changed as (update public.organisation_memberships set role = 'viewer' where organisation_id = '20000000-0000-0000-0000-000000000001' and user_id = '10000000-0000-0000-0000-000000000004' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'the write boundary does not stop an intended membership role change'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
-- owner-a: editing their own profile
select throws_ok(
  $$update public.profiles set created_at = now() - interval '5 years' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a user cannot backdate their own profile'
);
select throws_ok(
  $$update public.profiles set id = '10000000-0000-0000-0000-000000000004' where id = '10000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a user cannot rewrite a profile identity onto another user'
);
select results_eq(
  $$with changed as (update public.profiles set display_name = 'Owner A renamed' where id = '10000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[1::bigint],
  'the write boundary does not stop an intended profile edit'
);


-- ===========================================================================
-- Organisation-owned file storage.
--
-- These assertions act on `storage.objects` directly, as the `authenticated`
-- role with a real JWT subject, so what is tested is the policy set the Storage
-- API runs under. They deliberately do NOT claim to test the Storage HTTP API:
-- signed URLs, multipart upload and the service's own checks are above this
-- layer and are proved by the generated-application browser journey instead.
-- What is settled here is the question SQL can answer - which objects a caller
-- may see, create and remove.
--
-- Seeded as the owner, because seeding is not something a tenant does.
--
-- WHAT IS NOT ASSERTED HERE, and why. A real Supabase deployment installs a
-- trigger on `storage.objects` that refuses direct DELETE and UPDATE outright:
-- "Direct deletion from storage tables is not allowed. Use the Storage API
-- instead." So the remove boundary and the rename-between-tenants boundary
-- cannot be expressed in SQL at all, and an earlier draft of this file that
-- tried passed locally only because the bare postgres image carries no such
-- trigger — a less faithful environment quietly permitting what the real one
-- forbids. Those two boundaries are proved through the Storage HTTP API in
-- `tooling/storage-boundary-acceptance.mjs`, which is where they are reachable.
-- ===========================================================================

reset role;
-- Only the columns every storage schema version carries. `public` and
-- `file_size_limit` are added by the Storage service's own migrations, so a
-- bare PostgreSQL image has neither; what is under test here is the policy set,
-- not the bucket's flags, and naming a column that may not exist would make
-- this suite fail for a reason it is not about.
insert into storage.buckets (id, name) values ('organisation-files', 'organisation-files')
  on conflict (id) do nothing;
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('organisation-files', '20000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-00000000000a-report.pdf', '10000000-0000-0000-0000-000000000001', '{"size": 12}'::jsonb),
  ('organisation-files', '20000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-00000000000b-secret.pdf', '10000000-0000-0000-0000-000000000006', '{"size": 12}'::jsonb);

select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'storage objects have RLS enabled'
);
-- The tenant helper must refuse a key it cannot parse rather than raise, or a
-- malformed path would turn every policy evaluation into an error.
select is(
  app_private.storage_object_organisation('not-a-uuid/file.pdf'),
  null,
  'a storage key whose first segment is not an organisation id belongs to no organisation'
);
select is(
  app_private.storage_object_organisation('20000000-0000-0000-0000-000000000001/x-report.pdf'),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'the organisation is derived from the first segment of the object key'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
-- editor-a: a contributor in organisation A only.
-- Deliberately not member-a: the write-boundary block above demotes that
-- identity to viewer while proving an admin may change a role, so reusing it
-- here would test the wrong thing and look like a storage failure.
select results_eq(
  $$select count(*)::bigint from storage.objects where bucket_id = 'organisation-files'$$,
  array[1::bigint],
  'an editor of organisation A sees only organisation A files, never organisation B files'
);
select results_eq(
  $$with created as (insert into storage.objects (bucket_id, name, owner) values ('organisation-files', '20000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-00000000000c-editor.pdf', '10000000-0000-0000-0000-000000000003') returning 1) select count(*)::bigint from created$$,
  array[1::bigint],
  'an editor of organisation A can upload into their own organisation'
);
-- Forging the tenant prefix gets the caller nothing: membership is re-derived
-- from the very path they supplied.
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('organisation-files', '20000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-00000000000d-forged.pdf', '10000000-0000-0000-0000-000000000003')$$,
  '42501',
  null,
  'an editor of organisation A cannot upload into organisation B by naming its id'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
-- viewer-a: read-only in organisation A
select results_eq(
  $$select count(*)::bigint from storage.objects where bucket_id = 'organisation-files'$$,
  array[2::bigint],
  'a viewer in organisation A can see its files'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('organisation-files', '20000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-00000000000e-viewer.pdf', '10000000-0000-0000-0000-000000000005')$$,
  '42501',
  null,
  'a viewer in organisation A cannot upload a file'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
-- dual-ab: a contributor in BOTH organisations
-- The identity that makes the namespace question real. They may legitimately
-- see both tenants' files, and must still not be able to reclassify one into
-- the other. There is no UPDATE policy at all, so the rename that would move a
-- file between organisations is refused for everybody.
select results_eq(
  $$select count(*)::bigint from storage.objects where bucket_id = 'organisation-files'$$,
  array[3::bigint],
  'an identity in both organisations sees both organisations files'
);

reset role;
set local role anon;
select results_eq(
  $$select count(*)::bigint from storage.objects where bucket_id = 'organisation-files'$$,
  array[0::bigint],
  'anonymous callers see no organisation files'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('organisation-files', '20000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-00000000000f-anon.pdf')$$,
  '42501',
  null,
  'anonymous callers cannot upload an organisation file'
);

reset role;
select * from finish();
rollback;
