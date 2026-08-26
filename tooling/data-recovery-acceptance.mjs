#!/usr/bin/env node
/**
 * Stage Q12 executable backup/restore acceptance.
 *
 * `data-change.js` refuses a production change whose restore was never rehearsed. This is the thing
 * that performs the rehearsal, against a real PostgreSQL database, with the factory's own recipe
 * schema installed in it — and then hands the result straight to the safety contract, so the
 * evidence the gate demands is produced by a restore that actually happened rather than typed into
 * a fixture.
 *
 * The database is disposable and local. Proving that a dump can be restored does not need a cloud
 * project, and a safety contract that cannot be exercised without one is a safety contract nobody
 * exercises.
 *
 * Four scenarios run, and three of them are supposed to fail. A rehearsal harness that has only
 * ever been shown succeeding is indistinguishable from one that returns success unconditionally,
 * and this whole stage exists because `backup: true` was exactly that kind of claim.
 */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { startDisposablePostgres, locatePostgresBin } from './lib/disposable-postgres.mjs';
import { createPostgresRecoveryAdapter } from './lib/postgres-recovery-adapter.mjs';
import { runRestoreRehearsal } from '../packages/control-plane/src/data-recovery.js';
import { evaluateDataChangeSafety, planDataChange, dataChangePlanDigest } from '../packages/control-plane/src/data-change.js';

const ENVIRONMENT = 'preview';
const DATABASE_ID = 'db-recovery-rehearsal';
const EVIDENCE_ROOT = path.resolve('.app-builder/data-recovery');

/**
 * The minimum Supabase-shaped surface the recipe SQL needs in order to install: an `auth` schema
 * with a users table, the `auth.uid()` the policies read, and the two roles they are granted to.
 *
 * This is not a claim to be Supabase, and it is not where the policies themselves are proven — the
 * `database-security` job does that against a real Supabase stack with pgTAP. The question here is
 * narrower and provider-independent: after a snapshot and a destructive mutation, do the schema, the
 * rows and the isolation those policies provide come back.
 */
const AUTH_COMPATIBILITY = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant select on auth.users to authenticated;
`;

const SEED = `
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@test.local'),
  ('10000000-0000-0000-0000-000000000002', 'admin-a@test.local'),
  ('10000000-0000-0000-0000-000000000003', 'member-a@test.local'),
  ('10000000-0000-0000-0000-000000000006', 'owner-b@test.local');
insert into public.profiles (id, display_name) values
  ('10000000-0000-0000-0000-000000000001', 'Owner A'),
  ('10000000-0000-0000-0000-000000000002', 'Admin A'),
  ('10000000-0000-0000-0000-000000000003', 'Member A'),
  ('10000000-0000-0000-0000-000000000006', 'Owner B');
insert into public.organisations (id, name, slug, created_by) values
  ('20000000-0000-0000-0000-000000000001', 'Organisation A', 'organisation-a', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'Organisation B', 'organisation-b', '10000000-0000-0000-0000-000000000006');
insert into public.organisation_memberships (organisation_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'member'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 'owner');
`;

/**
 * What a restore has to reproduce.
 *
 * Counts alone would be a weak contract: a restore that returns every row into a table whose
 * row-level security is gone has returned the data and lost what made it safe to store. So the
 * declared invariants cover volume, referential integrity, the actual stored values, and — read as
 * a real `authenticated` caller — the tenant isolation the policies provide.
 */
const INVARIANTS = [
  { id: 'profile-rows', description: 'every profile row', query: 'select count(*) from public.profiles;' },
  { id: 'organisation-rows', description: 'every organisation row', query: 'select count(*) from public.organisations;' },
  { id: 'membership-rows', description: 'every membership row', query: 'select count(*) from public.organisation_memberships;' },
  {
    id: 'profile-values',
    description: 'the stored values, not just the row count',
    query: "select md5(string_agg(coalesce(display_name, '~') , '|' order by id)) from public.profiles;",
  },
  {
    id: 'membership-referential-integrity',
    description: 'no membership pointing at a missing organisation or profile',
    query: `select count(*) from public.organisation_memberships m
            where not exists (select 1 from public.organisations o where o.id = m.organisation_id)
               or not exists (select 1 from public.profiles p where p.id = m.user_id);`,
  },
  {
    id: 'tenant-isolation',
    description: 'an authenticated caller still sees only their own profile',
    // Asked as the role the policies are written for, with that user's claim. A catalog entry
    // saying a policy exists is not the same fact as that policy still limiting what a caller can
    // read, and only the second one survives being restored badly.
    session: { role: 'authenticated', 'request.jwt.claim.sub': '10000000-0000-0000-0000-000000000001' },
    query: 'select count(*) from public.profiles;',
  },
  {
    id: 'organisation-isolation',
    description: 'an authenticated member still sees only their own organisation',
    // The one that fails *open*. Disabling row-level security does not remove a row, so every
    // count-based invariant is unmoved by it; this one goes from one organisation to two, which is
    // the shape of the leak a restore has to be proven to undo.
    session: { role: 'authenticated', 'request.jwt.claim.sub': '10000000-0000-0000-0000-000000000003' },
    query: 'select count(*) from public.organisations;',
  },
];

/** The controlled destruction: a row loss, a column loss, a policy loss and an RLS regression. */
const DAMAGE = `
truncate public.organisation_memberships cascade;
alter table public.profiles drop column display_name;
drop policy "profiles_select_own" on public.profiles;
alter table public.organisations disable row level security;
`;

async function install(cluster) {
  await cluster.psql(AUTH_COMPATIBILITY);
  for (const recipe of ['recipes/profiles/database/profiles.sql', 'recipes/organisations/database/organisations.sql']) {
    await cluster.psql(readFileSync(path.resolve(recipe), 'utf8'));
  }
  await cluster.psql(SEED);
}

function report(label, result) {
  const status = result.verified ? 'verified' : `refused (${result.failureReasons.join(', ')})`;
  console.log(`  ${label}: ${status}`);
  return result;
}

async function main() {
  if (!locatePostgresBin()) {
    // Never a skip. A recovery gate that stands down when the database is missing is a gate that
    // reports success for a rehearsal it did not run.
    console.error('Data-recovery acceptance requires PostgreSQL server binaries (initdb, pg_ctl, pg_dump, pg_restore).');
    console.error('Install postgresql, or point APP_BUILDER_POSTGRES_BIN at the bin directory.');
    process.exitCode = 1;
    return;
  }

  await mkdir(EVIDENCE_ROOT, { recursive: true });
  const cluster = await startDisposablePostgres({ label: 'q12-recovery' });
  console.log(`Disposable PostgreSQL cluster at ${cluster.socketDirectory} (${cluster.binDirectory}).`);

  try {
    await install(cluster);
    const adapter = createPostgresRecoveryAdapter(cluster, cluster.root);

    console.log('\nRehearsals:');

    // 1. The real one. Snapshot, destroy, restore, and prove what came back.
    const rehearsal = report('real snapshot/damage/restore', await runRestoreRehearsal({
      adapter,
      environment: ENVIRONMENT,
      databaseId: DATABASE_ID,
      evidenceId: `restore-rehearsal-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}`,
      invariants: INVARIANTS,
      damage: {
        description: 'truncate memberships, drop a column, drop a policy and disable RLS',
        apply: () => cluster.psql(DAMAGE),
      },
    }));
    assert.equal(rehearsal.verified, true, `restore rehearsal failed: ${JSON.stringify(rehearsal.failures, null, 2)}`);

    const damaged = rehearsal.steps.find((entry) => entry.step === 'damage')?.invariants ?? {};
    const baseline = rehearsal.steps.find((entry) => entry.step === 'baseline')?.invariants ?? {};
    // The damage has to have been real, and specifically real in the way that matters: rows gone,
    // values gone, and isolation gone. Otherwise the restore above proved only that nothing moved.
    assert.notEqual(damaged['membership-rows'], baseline['membership-rows'], 'the destructive step did not remove rows');
    assert.ok(String(damaged['profile-values']).startsWith('error:'), 'the dropped column was still readable');
    assert.notEqual(damaged['tenant-isolation'], baseline['tenant-isolation'], 'dropping the select policy did not change what a caller could read');
    assert.equal(baseline['tenant-isolation'], '1', 'the seeded baseline was not actually isolated');
    // The damage has to include a failure that opens the data up rather than only closing it down,
    // because those are the restores that look fine from every count.
    assert.equal(baseline['organisation-isolation'], '1', 'the seeded baseline already leaked organisations');
    assert.equal(damaged['organisation-isolation'], '2', 'disabling row-level security did not leak');
    assert.equal(baseline['membership-referential-integrity'], '0');

    // 2. A destructive step that destroys nothing must not produce evidence. This is the guard
    //    against a rehearsal that passes because it never had anything to recover from.
    const inert = report('damage that changes nothing', await runRestoreRehearsal({
      adapter,
      environment: ENVIRONMENT,
      databaseId: DATABASE_ID,
      invariants: INVARIANTS,
      damage: { description: 'a select that changes nothing', apply: () => cluster.psql('select 1;') },
    }));
    assert.equal(inert.verified, false);
    assert.deepEqual(inert.failureReasons, ['damage-ineffective']);

    // 3. An adapter that reports a restore it did not perform must be caught by the comparison
    //    rather than believed. This is the failure mode the whole stage is named after.
    const lying = report('a restore that never happened', await runRestoreRehearsal({
      adapter: { ...adapter, restore: async () => { /* claims success, does nothing */ } },
      environment: ENVIRONMENT,
      databaseId: DATABASE_ID,
      invariants: INVARIANTS,
      damage: { description: 'truncate memberships', apply: () => cluster.psql('truncate public.organisation_memberships cascade;') },
    }));
    assert.equal(lying.verified, false);
    assert.ok(lying.failureReasons.includes('invariant-not-restored'), lying.failureReasons.join(', '));

    // Put the database back before the last scenario, using the real adapter this time.
    await adapter.restore(await recapture(adapter, cluster));

    // 4. A rehearsal against a database holding nothing proves nothing.
    await cluster.psql('truncate public.organisation_memberships, public.organisations, public.profiles, auth.users cascade;');
    const empty = report('rehearsal against an empty database', await runRestoreRehearsal({
      adapter,
      environment: ENVIRONMENT,
      databaseId: DATABASE_ID,
      invariants: INVARIANTS,
      damage: { description: 'drop a column', apply: () => cluster.psql('alter table public.profiles drop column if exists avatar_url;') },
    }));
    assert.equal(empty.verified, false);
    assert.deepEqual(empty.failureReasons, ['baseline-empty']);

    // The evidence produced by scenario 1 must be the evidence the safety contract accepts, and a
    // change carrying the refused rehearsals must still be refused. Otherwise the two halves of
    // Stage Q12 are two unrelated programmes that happen to share a number.
    const accepted = evaluateAgainstContract(rehearsal);
    assert.equal(accepted.allowed, true, `the contract refused genuine evidence: ${JSON.stringify(accepted.refusals, null, 2)}`);
    for (const refused of [inert, lying, empty]) {
      const decision = evaluateAgainstContract(refused);
      assert.equal(decision.allowed, false, 'the contract accepted a rehearsal that failed');
      assert.ok(decision.refusalReasons.includes('restore-unproven'), decision.refusalReasons.join(', '));
    }
    console.log('\nThe safety contract accepts the verified rehearsal and refuses all three failed ones.');

    const evidenceFile = path.join(EVIDENCE_ROOT, 'restore-rehearsal.json');
    await writeFile(evidenceFile, `${JSON.stringify({
      schemaVersion: 1,
      provider: adapter.provider,
      environment: ENVIRONMENT,
      databaseId: DATABASE_ID,
      recipes: ['profiles', 'organisations'],
      invariants: INVARIANTS.map(({ id, description }) => ({ id, description })),
      rehearsal,
      refusedScenarios: [inert, lying, empty].map((entry) => ({ damage: entry.damage, failureReasons: entry.failureReasons })),
    }, null, 2)}\n`);
    console.log(`Evidence written to ${path.relative(process.cwd(), evidenceFile)}.`);
  } finally {
    await cluster.stop();
  }
}

/** Capture a fresh snapshot to restore from, for the scenarios that need a clean database back. */
async function recapture(adapter, cluster) {
  await cluster.psql('truncate public.organisation_memberships cascade;');
  await cluster.psql(`insert into public.organisation_memberships (organisation_id, user_id, role) values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'admin'),
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'member'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000006', 'owner');`);
  return adapter.capture();
}

/**
 * Feed a rehearsal into the Q12 decision as a real proposal would: a destructive production change
 * whose recovery section is this rehearsal and nothing else invented.
 */
function evaluateAgainstContract(rehearsal) {
  const base = {
    id: '20260826150000_drop_display_name',
    proposedBy: 'q12-acceptance',
    sql: 'alter table public.profiles drop column display_name;',
    target: { environment: 'production', databaseId: 'db-prod-1' },
    impact: { rowsAffected: 4, tables: ['public.profiles'] },
    recovery: {
      snapshotId: rehearsal.snapshotId,
      environment: 'production',
      databaseId: 'db-prod-1',
      capturedAt: rehearsal.rehearsedAt,
      digest: rehearsal.digest,
      restoreRehearsal: rehearsal.evidence,
    },
    rollback: { strategy: 'forward-repair', detail: 'Re-add the column from the snapshot export.' },
    preconditions: ['npm run acceptance:data-recovery'],
    verification: ['profile count unchanged'],
    onVerificationFailure: 'halt and restore the snapshot',
  };
  const digest = dataChangePlanDigest(planDataChange(base));
  const plan = planDataChange({
    ...base,
    approvals: [{ approvalId: 'approval-1', environment: 'production', grantedBy: 'nicky', expiresAt: new Date(Date.now() + 3600_000).toISOString(), planDigest: digest }],
  });
  return evaluateDataChangeSafety({
    plan,
    runtime: { environment: 'production', databaseId: 'db-prod-1' },
    now: new Date(rehearsal.rehearsedAt),
  });
}

await main();
