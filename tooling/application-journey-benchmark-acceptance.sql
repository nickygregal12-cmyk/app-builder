-- The bounded serious-application benchmark, executed.
--
-- `config/application-journey-benchmarks.json` freezes what a generated
-- application must be shown to do; `tooling/application-journey-benchmark.test.mjs`
-- keeps that contract sound and keeps its domain out of the factory. Neither of
-- them runs anything. This file is the part that does: every scenario id in the
-- frozen contract appears in a test description below, against schema the
-- factory actually generated, on a real PostgreSQL cluster.
--
-- The pairing is enforced rather than trusted —
-- `tooling/application-journey-benchmark.test.mjs` fails if a frozen scenario
-- has no test here, so a scenario cannot be quietly dropped from the executed
-- half while remaining in the contract.
--
-- Every assertion runs as `authenticated` with a real JWT subject unless it is
-- deliberately proving something about a privileged path. Where a scenario is
-- about what somebody may NOT do, the fixture always contains the thing they
-- must not reach: an isolation test whose competing identity has no data is a
-- test that passes because there was nothing to leak.

begin;

select plan(60);

-- --- Identities and tenancy -----------------------------------------------------
--
-- Four competitors inside ONE organisation. That is the isolation axis this
-- slice is about: the organisations recipe already proves tenant A cannot see
-- tenant B, and it is not the failure this shape has. Here everybody is
-- legitimately in the same competition and still must not see each other's
-- decision before the deadline.
--
-- The identity ids are ordered deliberately: a < b < c < d, because the
-- leaderboard's last tie-break is `identity_id asc` and an assertion about it
-- has to know what the right answer is.
insert into auth.users (id, email, raw_user_meta_data) values
  ('41000000-0000-0000-0000-000000000001', 'operator@benchmark.local', '{"test_identifier":"operator"}'::jsonb),
  ('41000000-0000-0000-0000-000000000002', 'identity-a@benchmark.local', '{"test_identifier":"identity-a"}'::jsonb),
  ('41000000-0000-0000-0000-000000000003', 'identity-b@benchmark.local', '{"test_identifier":"identity-b"}'::jsonb),
  ('41000000-0000-0000-0000-000000000004', 'identity-c@benchmark.local', '{"test_identifier":"identity-c"}'::jsonb),
  ('41000000-0000-0000-0000-000000000005', 'identity-d@benchmark.local', '{"test_identifier":"identity-d"}'::jsonb),
  ('41000000-0000-0000-0000-000000000006', 'outsider@benchmark.local', '{"test_identifier":"outsider"}'::jsonb);

insert into public.profiles (id, display_name) values
  ('41000000-0000-0000-0000-000000000001', 'Operator'),
  ('41000000-0000-0000-0000-000000000002', 'Identity A'),
  ('41000000-0000-0000-0000-000000000003', 'Identity B'),
  ('41000000-0000-0000-0000-000000000004', 'Identity C'),
  ('41000000-0000-0000-0000-000000000005', 'Identity D'),
  ('41000000-0000-0000-0000-000000000006', 'Outsider');

insert into public.organisations (id, name, slug, created_by) values
  ('42000000-0000-0000-0000-000000000001', 'Benchmark competition', 'benchmark-competition', '41000000-0000-0000-0000-000000000001'),
  ('42000000-0000-0000-0000-000000000002', 'Unrelated organisation', 'unrelated-organisation', '41000000-0000-0000-0000-000000000006');

insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'owner'),
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'member'),
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003', 'member'),
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000004', 'member'),
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000005', 'member'),
  ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000006', 'owner');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduled_entities'::regclass),
  'scheduled entities have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduled_decisions'::regclass),
  'scheduled decisions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduled_official_results'::regclass),
  'official results have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.scheduled_settlements'::regclass),
  'settlements have RLS enabled'
);

-- The settlement identity key, as a constraint that exists rather than as a
-- claim in a comment. If this is ever relaxed to a plain index, the repeat
-- settlement below stops proving idempotence and starts proving nothing.
--
-- The comparison happens inside the query rather than through `results_eq`, and
-- both details are deliberate. `array[array[...]]` is a two-dimensional array in
-- PostgreSQL rather than a one-row list containing an array, so comparing the
-- aggregate directly would not mean what it reads as. And `attname` is of type
-- `name`, whose collation is not the database default, so handing the derived
-- text to `results_eq` fails with "could not determine which collation to use"
-- before it compares anything. An unknown literal on the other side of `=`
-- adopts the collation of the column, so there is nothing left to resolve.
select ok(
  (select array_to_string(array_agg(attname::text order by attname::text), ',')
            = 'entity_id,identity_id,official_result_version'
     from pg_constraint
     join pg_attribute on pg_attribute.attrelid = pg_constraint.conrelid
                      and pg_attribute.attnum = any(pg_constraint.conkey)
     where pg_constraint.conname = 'scheduled_settlements_identity_key'
       and pg_constraint.contype = 'u'),
  'the frozen settlement identity key is a unique constraint on exactly entity, identity and result version'
);

-- --- The scheduled entity, created through the real client path ------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.scheduled_entities (id, organisation_id, reference, title, decision_deadline, created_by)
    values ('43000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001', 'ENT-1',
            'First scheduled entity', now() + interval '1 hour', '41000000-0000-0000-0000-000000000001')$$,
  'an organisation owner can schedule an entity with a future deadline'
);

select is(
  (select public.scheduled_entity_state('43000000-0000-0000-0000-000000000001')),
  'scheduled'::text,
  'an entity whose deadline is in the future reports the scheduled state'
);

-- The list view and the single-entity function must never disagree, because a
-- product reads the first and enforces against the second. They share one
-- expression so that they cannot, and this is the assertion that keeps them
-- sharing it.
select results_eq(
  $$select state from public.scheduled_entity_board where id = '43000000-0000-0000-0000-000000000001'$$,
  array['scheduled'::text],
  'the board view reports the same state the single-entity function does'
);

-- A member is not an operator. Scheduling is the act that fixes the deadline
-- everyone else is bound by.
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.scheduled_entities (organisation_id, reference, title, decision_deadline, created_by)
    values ('42000000-0000-0000-0000-000000000001', 'ENT-X', 'Member-scheduled entity', now() + interval '1 hour',
            '41000000-0000-0000-0000-000000000002')$$,
  '42501',
  null,
  'a member cannot schedule an entity, so they cannot choose their own deadline'
);

-- --- [pre-lock-decision-accepted] -----------------------------------------------

select lives_ok(
  $$insert into public.scheduled_decisions (entity_id, identity_id, choice)
    values ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', '{"a":2,"b":1}'::jsonb)$$,
  '[pre-lock-decision-accepted] an identity can submit a decision before the stored deadline'
);
select results_eq(
  $$select count(*)::bigint from public.scheduled_decisions
    where entity_id = '43000000-0000-0000-0000-000000000001'
      and identity_id = '41000000-0000-0000-0000-000000000002'$$,
  array[1::bigint],
  '[pre-lock-decision-accepted] the accepted decision is stored'
);

-- Forging authorship. The decision is the thing being competed over, so writing
-- one in somebody else's name is the most direct attack on the product.
select throws_ok(
  $$insert into public.scheduled_decisions (entity_id, identity_id, choice)
    values ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003', '{"a":9,"b":9}'::jsonb)$$,
  '42501',
  null,
  'an identity cannot submit a decision in another identity name'
);

-- --- [competing-identity-cannot-read] -------------------------------------------

select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select results_eq(
  $$select count(*)::bigint from public.scheduled_decisions
    where entity_id = '43000000-0000-0000-0000-000000000001'$$,
  array[0::bigint],
  '[competing-identity-cannot-read] a competing identity sees nothing while the window is open'
);

select lives_ok(
  $$insert into public.scheduled_decisions (entity_id, identity_id, choice)
    values ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000003', '{"a":5,"b":0}'::jsonb)$$,
  'the competing identity can make their own decision'
);

-- The half that makes the assertion above non-vacuous: two decisions now exist
-- on this entity and this identity can see exactly one of them - their own.
select results_eq(
  $$select count(*)::bigint from public.scheduled_decisions
    where entity_id = '43000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  '[competing-identity-cannot-read] with two decisions on the entity, an identity sees only their own'
);

-- An amendment may change the decision and may not move it to another entity or
-- another person. That is a column-level grant rather than a policy, and it is
-- asserted here because a grant is invisible in the policies above and easy to
-- widen: the first client that cannot write through it reports "permission
-- denied for table", and granting plain UPDATE makes the symptom go away while
-- handing every author the ability to reassign their decision to somebody else.
--
-- It cost a real diagnosis. A client-side upsert compiles to
-- `on conflict do update set` over every column it sends, so it asked for update
-- on `entity_id` and `identity_id`, and was refused for the whole table on the
-- first decision anyone made — before any row conflicted. The grant was right.
select ok(
  has_column_privilege('authenticated', 'public.scheduled_decisions', 'choice', 'UPDATE'),
  'an author may amend the decision itself'
);
select ok(
  not has_column_privilege('authenticated', 'public.scheduled_decisions', 'identity_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.scheduled_decisions', 'entity_id', 'UPDATE'),
  'and may not move a decision to another person or another entity'
);

-- --- [competing-identity-cannot-amend] ------------------------------------------
--
-- This one changes no rows rather than raising, and that is the correct
-- behaviour rather than a weaker one. Ownership is enforced in the policy's
-- `using` clause, which filters the row away; raising instead would confirm to
-- one competitor that another competitor's decision exists.
select results_eq(
  $$with attempted as (
      update public.scheduled_decisions set choice = '{"a":0,"b":9}'::jsonb
      where entity_id = '43000000-0000-0000-0000-000000000001'
        and identity_id = '41000000-0000-0000-0000-000000000002'
      returning 1)
    select count(*)::bigint from attempted$$,
  array[0::bigint],
  '[competing-identity-cannot-amend] amending another identity decision changes nothing'
);

reset role;
select results_eq(
  $$select choice from public.scheduled_decisions
    where entity_id = '43000000-0000-0000-0000-000000000001'
      and identity_id = '41000000-0000-0000-0000-000000000002'$$,
  array['{"a": 2, "b": 1}'::jsonb],
  '[competing-identity-cannot-amend] and the targeted decision still holds what its author wrote'
);

-- --- The rest of the fixture ----------------------------------------------------
--
-- Three more entities and the remaining decisions, seeded directly. The
-- authenticated path is proved above; repeating it sixteen times would add
-- running time and no evidence. The window trigger still applies to these
-- inserts - a seeded late decision would be refused exactly as a client one is,
-- which is why these entities are created open and closed afterwards.
insert into public.scheduled_entities (id, organisation_id, reference, title, decision_deadline, created_by) values
  ('43000000-0000-0000-0000-000000000002', '42000000-0000-0000-0000-000000000001', 'ENT-2', 'Second scheduled entity', now() + interval '1 hour', '41000000-0000-0000-0000-000000000001'),
  ('43000000-0000-0000-0000-000000000003', '42000000-0000-0000-0000-000000000001', 'ENT-3', 'Third scheduled entity', now() + interval '1 hour', '41000000-0000-0000-0000-000000000001'),
  ('43000000-0000-0000-0000-000000000004', '42000000-0000-0000-0000-000000000001', 'ENT-4', 'Fourth scheduled entity', now() + interval '1 hour', '41000000-0000-0000-0000-000000000001');

-- `{"a":2,"b":1}` is exact against every entity's confirmed outcome below,
-- `{"a":5,"b":0}` has the right direction and the wrong margin, and
-- `{"a":0,"b":3}` has neither. The totals these produce are what the leaderboard
-- assertions expect, so they are chosen rather than arbitrary.
insert into public.scheduled_decisions (entity_id, identity_id, choice) values
  ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000004', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000005', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000003', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000004', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000005', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000002', '{"a":0,"b":3}'::jsonb),
  ('43000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000003', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000004', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000005', '{"a":5,"b":0}'::jsonb),
  ('43000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000002', '{"a":0,"b":3}'::jsonb),
  ('43000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000003', '{"a":0,"b":3}'::jsonb),
  ('43000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', '{"a":0,"b":3}'::jsonb),
  ('43000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000005', '{"a":5,"b":0}'::jsonb);

-- --- Settling before the window closes ------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000001')$$,
  '22023',
  'The decision window for this entity has not closed yet.',
  'settlement is refused while decisions can still be changed'
);

-- --- The lock, and the fact that nothing had to run for it to happen -------------
--
-- Bringing the deadline forward is ordinary rescheduling and the operator may
-- do it. What follows is the lock taking effect with no job, no trigger and no
-- state column: the same rows, read after the deadline they already carried.
select lives_ok(
  $$update public.scheduled_entities set decision_deadline = now() - interval '1 minute'
    where organisation_id = '42000000-0000-0000-0000-000000000001'$$,
  'an operator can bring a deadline forward while the window is still open'
);

select is(
  (select public.scheduled_entity_state('43000000-0000-0000-0000-000000000001')),
  'locked'::text,
  'the entity reports the locked state from the stored deadline alone'
);

select results_eq(
  $$select result_state from public.scheduled_entities where id = '43000000-0000-0000-0000-000000000001'$$,
  array['scheduled'::text],
  'and no stored column had to be updated for the lock to take effect'
);
select results_eq(
  $$select state from public.scheduled_entity_board where id = '43000000-0000-0000-0000-000000000001'$$,
  array['locked'::text],
  'the board a client reads reports the lock too, from the same expression'
);

-- A closed window never reopens. This is the assertion that stops a late
-- decision being made legal after its author has seen how the event is going.
select throws_ok(
  $$update public.scheduled_entities set decision_deadline = now() + interval '1 hour'
    where id = '43000000-0000-0000-0000-000000000001'$$,
  '42501',
  'The decision window for this entity has already closed and cannot be reopened or moved.',
  'a closed decision window cannot be reopened, even by the operator who set it'
);

-- --- [post-lock-decision-refused] and [post-lock-amendment-refused] --------------

select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.scheduled_decisions (entity_id, identity_id, choice)
    values ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', '{"a":1,"b":0}'::jsonb)$$,
  '42501',
  'The decision window for this entity closed at its stored deadline.',
  '[post-lock-decision-refused] a decision submitted after the deadline is refused with the frozen reason'
);

select throws_ok(
  $$update public.scheduled_decisions set choice = '{"a":1,"b":0}'::jsonb
    where entity_id = '43000000-0000-0000-0000-000000000001'
      and identity_id = '41000000-0000-0000-0000-000000000002'$$,
  '42501',
  'A locked decision is not editable, including by the identity that made it.',
  '[post-lock-amendment-refused] the author cannot amend their own decision once it is locked'
);

select results_eq(
  $$select choice from public.scheduled_decisions
    where entity_id = '43000000-0000-0000-0000-000000000001'
      and identity_id = '41000000-0000-0000-0000-000000000002'$$,
  array['{"a": 2, "b": 1}'::jsonb],
  '[post-lock-amendment-refused] and the decision still holds what was submitted before the deadline'
);

-- The reveal. The same query that returned one row before the deadline now
-- returns all four, which is the other half of the isolation proof: the rule was
-- "not yet", not "never".
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.scheduled_decisions
    where entity_id = '43000000-0000-0000-0000-000000000001'$$,
  array[4::bigint],
  'once the entity is locked every decision on it is visible to the competition'
);

-- Locking reveals decisions to the competition, not to the internet.
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select results_eq(
  $$select count(*)::bigint from public.scheduled_decisions$$,
  array[0::bigint],
  'an identity outside the organisation sees no decisions at all, before or after the lock'
);
-- The view is `security_invoker`, and this is what says so. A definer view here
-- would hand every organisation's schedule to every signed-in person, and would
-- look exactly like a working one until somebody outside the tenant read it.
select results_eq(
  $$select count(*)::bigint from public.scheduled_entity_board$$,
  array[0::bigint],
  'and no entity from another organisation reaches them through the board view'
);
select throws_ok(
  $$select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000001')$$,
  'P0002',
  null,
  'an identity outside the organisation is told the entity does not exist rather than that it is not theirs'
);

-- --- [provisional-result-does-not-settle] ---------------------------------------

reset role;
insert into public.scheduled_official_results (entity_id, version, status, outcome, source, observed_at) values
  ('43000000-0000-0000-0000-000000000001', 1, 'in-progress', '{"a":2,"b":1}'::jsonb, 'benchmark-results-feed', now() - interval '30 minutes');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000001')$$,
  '22023',
  'No confirmed official result has been recorded for this entity. Provisional reports do not settle.',
  '[provisional-result-does-not-settle] a result reported while the event is still running does not settle'
);
select results_eq(
  $$select count(*)::bigint from public.scheduled_settlements$$,
  array[0::bigint],
  '[provisional-result-does-not-settle] and nothing was scored'
);

-- A browser holding the publishable key must not be able to declare what
-- officially happened. This is the whole external-truth boundary in one row.
select throws_ok(
  $$insert into public.scheduled_official_results (entity_id, version, status, outcome, source, observed_at)
    values ('43000000-0000-0000-0000-000000000001', 99, 'confirmed', '{"a":9,"b":0}'::jsonb, 'forged', now())$$,
  '42501',
  null,
  'a signed-in identity cannot declare an official result'
);

-- --- [official-result-settles] --------------------------------------------------

reset role;
insert into public.scheduled_official_results (entity_id, version, status, outcome, source, observed_at)
select entity.id, 2, 'confirmed', '{"a":2,"b":1}'::jsonb, 'benchmark-results-feed', now() - interval '5 minutes'
from public.scheduled_entities entity
where entity.organisation_id = '42000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000001')),
  4,
  '[official-result-settles] a confirmed official result settles every decision on the entity'
);
select is(
  (select public.scheduled_entity_state('43000000-0000-0000-0000-000000000001')),
  'settled'::text,
  '[official-result-settles] and the entity reports the settled state'
);
select results_eq(
  $$select points from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000001'
      and identity_id = '41000000-0000-0000-0000-000000000002'$$,
  array[3],
  '[official-result-settles] the exact decision scored the maximum the product declares'
);
select results_eq(
  $$select points from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000001'
      and identity_id = '41000000-0000-0000-0000-000000000003'$$,
  array[1],
  '[official-result-settles] the right direction with the wrong margin scored less'
);

-- --- [repeat-settlement-unchanged] ----------------------------------------------

select is(
  (select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000001')),
  0,
  '[repeat-settlement-unchanged] settling the same entity, identities and result version again creates nothing'
);
select results_eq(
  $$select count(*)::bigint from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000001'$$,
  array[4::bigint],
  '[repeat-settlement-unchanged] and the number of settlements is unchanged'
);
select results_eq(
  $$select sum(points)::bigint from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000001'$$,
  array[6::bigint],
  '[repeat-settlement-unchanged] and nobody was paid twice'
);

-- --- [leaderboard-is-ordered] ---------------------------------------------------

select is((select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000002')), 4, 'the second entity settles');
select is((select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000003')), 4, 'the third entity settles');
select is((select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000004')), 4, 'the fourth entity settles');

-- a: 3 + 1 + 0 + 0 = 4, one top score
-- d: 1 + 1 + 1 + 1 = 4, no top score
-- b: 1 + 1 + 1 + 0 = 3, no top score
-- c: 1 + 1 + 1 + 0 = 3, no top score
--
-- So the three ordering keys are each the one that decides a specific pair:
-- total separates {a,d} from {b,c}, the top-score count separates a from d, and
-- the identity id separates b from c. A fixture where one key could have
-- produced the whole order would not have tested the other two.
select results_eq(
  $$select identity_id::text from public.scheduled_leaderboard order by board_position$$,
  array[
    '41000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000005',
    '41000000-0000-0000-0000-000000000003',
    '41000000-0000-0000-0000-000000000004'
  ],
  '[leaderboard-is-ordered] the leaderboard orders by total, then top scores, then identity'
);
select results_eq(
  $$select total_score from public.scheduled_leaderboard order by board_position$$,
  array[4::bigint, 4::bigint, 3::bigint, 3::bigint],
  '[leaderboard-is-ordered] totals are persisted and deterministic'
);
select results_eq(
  $$select count(distinct board_position)::bigint from public.scheduled_leaderboard$$,
  array[4::bigint],
  '[leaderboard-is-ordered] no two identities share a position, so the order cannot end in a tie'
);

-- --- Correction ------------------------------------------------------------------
--
-- The frozen correction policy: a corrected official result re-runs settlement
-- under the same identity key and replaces the score, and the previous score is
-- not silently overwritten. Version 3 is therefore a new row, the version 2
-- settlements stay exactly where they are, and the leaderboard counts only the
-- latest confirmed version.
reset role;
insert into public.scheduled_official_results (entity_id, version, status, outcome, source, observed_at) values
  ('43000000-0000-0000-0000-000000000001', 3, 'confirmed', '{"a":0,"b":1}'::jsonb, 'benchmark-results-feed', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000001')),
  4,
  'a corrected official result settles again under a new version'
);
select results_eq(
  $$select count(*)::bigint from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000001' and official_result_version = 2$$,
  array[4::bigint],
  'the settlements made under the superseded result are still on record'
);
select results_eq(
  $$select sum(points)::bigint from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000001' and official_result_version = 3$$,
  array[0::bigint],
  'and the corrected result scored the same decisions differently'
);

-- a: 0 + 1 + 0 + 0 = 1
-- b: 0 + 1 + 1 + 0 = 2
-- c: 0 + 1 + 1 + 0 = 2
-- d: 0 + 1 + 1 + 1 = 3
select results_eq(
  $$select total_score from public.scheduled_leaderboard order by board_position$$,
  array[3::bigint, 2::bigint, 2::bigint, 1::bigint],
  'the leaderboard counts only the latest confirmed version, so a correction changes the standings'
);
select results_eq(
  $$select identity_id::text from public.scheduled_leaderboard order by board_position limit 1$$,
  array['41000000-0000-0000-0000-000000000005'],
  'and the identity the correction favoured is now first'
);

-- --- Voiding ---------------------------------------------------------------------
--
-- Discarded, not scored. A voided entity that keeps contributing to a
-- leaderboard is the failure this state exists to prevent.
select throws_ok(
  $$select public.void_scheduled_entity('43000000-0000-0000-0000-000000000004', '   ')$$,
  '22023',
  'Voiding an entity requires a recorded reason.',
  'an entity cannot be voided without a recorded reason'
);
select lives_ok(
  $$select public.void_scheduled_entity('43000000-0000-0000-0000-000000000004', 'The event was abandoned.')$$,
  'an operator can void an entity that will never produce a result'
);
select is(
  (select public.scheduled_entity_state('43000000-0000-0000-0000-000000000004')),
  'voided'::text,
  'the voided entity reports the voided state'
);
select results_eq(
  $$select count(*)::bigint from public.scheduled_settlements
    where entity_id = '43000000-0000-0000-0000-000000000004'$$,
  array[0::bigint],
  'a voided entity keeps no settlements'
);
select throws_ok(
  $$select public.settle_scheduled_entity('43000000-0000-0000-0000-000000000004')$$,
  '22023',
  'A voided entity has no result to settle.',
  'and it cannot be settled afterwards'
);
select results_eq(
  $$select total_score from public.scheduled_leaderboard order by board_position$$,
  array[2::bigint, 2::bigint, 2::bigint, 1::bigint],
  'and the leaderboard no longer counts what the voided entity paid'
);

-- --- The product rule the factory refuses to guess --------------------------------
--
-- The recipe ships both `app_domain` functions as functions that raise, and the
-- benchmark project replaces them. Putting the raising version back proves the
-- default is genuinely fail-closed rather than a comment: a build that forgot to
-- declare its scoring rule cannot produce a leaderboard of silent zeroes.
reset role;
create or replace function app_domain.max_decision_points()
returns integer
language plpgsql
immutable
as $body$
begin
  raise exception 'This product has not declared its maximum decision score. Replace app_domain.max_decision_points().'
    using errcode = 'feature_not_supported';
end;
$body$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.scheduled_leaderboard$$,
  '0A000',
  'This product has not declared its maximum decision score. Replace app_domain.max_decision_points().',
  'a product that has not declared its own scoring rule fails closed instead of ranking everyone at zero'
);

reset role;
select * from finish();
rollback;
