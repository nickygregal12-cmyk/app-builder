-- The benchmark project's OWN scoring rule. Not factory code.
--
-- `recipes/scheduled-decisions` ships `app_domain.score_decision` and
-- `app_domain.max_decision_points` as functions that raise, and this file is
-- what a generated product's own migration would contain: the two sentences
-- only the product can write. The split is the point of the recipe. Settlement,
-- idempotence, the reveal rule and the leaderboard's total order are the same
-- in every product of this shape and are extracted; "three points for the exact
-- result" is this product's rule and stays here, out of the factory.
--
-- `config/application-journey-benchmarks.json` freezes the rule this implements:
--   Exact outcome scores 3; correct direction with wrong margin scores 1;
--   anything else scores 0.
--
-- A decision and an outcome are each `{"a": <integer>, "b": <integer>}`. The
-- keys are deliberately not the benchmark domain's words: the domain vocabulary
-- rule in tooling/application-journey-benchmark.test.mjs keeps the reference
-- product out of the factory, and there is no reason to smuggle it back in
-- through a JSON key.

create or replace function app_domain.score_decision(choice jsonb, outcome jsonb)
returns integer
language sql
immutable
as $$
  select case
    -- A malformed or absent decision scores nothing. It does not raise: a
    -- settlement run must not be stopped for everybody by one bad row.
    when choice is null or outcome is null then 0
    when jsonb_typeof(choice -> 'a') <> 'number' or jsonb_typeof(choice -> 'b') <> 'number' then 0
    when jsonb_typeof(outcome -> 'a') <> 'number' or jsonb_typeof(outcome -> 'b') <> 'number' then 0
    when (choice ->> 'a')::integer = (outcome ->> 'a')::integer
     and (choice ->> 'b')::integer = (outcome ->> 'b')::integer then 3
    -- Cast to numeric explicitly. `sign` exists for numeric and for double
    -- precision and not for integer, so an integer argument leaves the
    -- resolution to whichever implicit cast the server prefers.
    when sign(((choice ->> 'a')::integer - (choice ->> 'b')::integer)::numeric)
       = sign(((outcome ->> 'a')::integer - (outcome ->> 'b')::integer)::numeric) then 1
    else 0
  end;
$$;

create or replace function app_domain.max_decision_points()
returns integer
language sql
immutable
as $$
  select 3;
$$;

grant execute on function app_domain.score_decision(jsonb, jsonb) to authenticated;
grant execute on function app_domain.max_decision_points() to authenticated;
