begin;

select plan(18);

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
  ('10000000-0000-0000-0000-000000000006', 'owner-b@test.local', '{"test_identifier":"owner-b"}'::jsonb);

insert into public.profiles (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'Owner A'),
  ('10000000-0000-0000-0000-000000000002', 'Admin A'),
  ('10000000-0000-0000-0000-000000000003', 'Editor A'),
  ('10000000-0000-0000-0000-000000000004', 'Member A'),
  ('10000000-0000-0000-0000-000000000005', 'Viewer A'),
  ('10000000-0000-0000-0000-000000000006', 'Owner B');
insert into public.organisations (id, name, slug, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Organisation A', 'organisation-a', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Organisation B', 'organisation-b', '10000000-0000-0000-0000-000000000006');
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'editor'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'member'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'viewer'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 'owner');

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

reset role;
select * from finish();
rollback;
