import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const profiles = fs.readFileSync('recipes/profiles/database/profiles.sql', 'utf8').toLowerCase();
const organisations = fs.readFileSync('recipes/organisations/database/organisations.sql', 'utf8').toLowerCase();
const admin = fs.readFileSync('recipes/admin/files/src/features/admin/index.tsx', 'utf8');
const auth = fs.readFileSync('recipes/auth/files/src/features/auth/AuthContext.tsx', 'utf8');
const adapter = JSON.parse(fs.readFileSync('adapters/supabase/adapter.json', 'utf8'));

function updatePoliciesHaveChecks(sql) {
  const updates = [...sql.matchAll(/create policy[\s\S]*?for update[\s\S]*?;/g)].map((match) => match[0]);
  assert.ok(updates.length > 0, 'expected at least one update policy');
  for (const policy of updates) {
    assert.match(policy, /using\s*\(/);
    assert.match(policy, /with check\s*\(/);
  }
}

test('Supabase adapter uses a browser-safe publishable key and exact SDK version', () => {
  assert.equal(adapter.package.dependencies['@supabase/supabase-js'], '2.112.4');
  const env = fs.readFileSync('adapters/supabase/files/.env.example', 'utf8');
  assert.match(env, /VITE_SUPABASE_PUBLISHABLE_KEY=/);
  assert.doesNotMatch(env, /SERVICE_ROLE|SECRET_KEY/);
});

test('profiles table is explicitly granted, RLS protected and user-owned', () => {
  assert.match(profiles, /alter table public\.profiles enable row level security/);
  assert.match(profiles, /grant select, insert on public\.profiles to authenticated/);
  assert.match(profiles, /auth\.uid\(\)\) = id/);
  updatePoliciesHaveChecks(profiles);
});

test('organisation tables use RLS and privileged role lookup stays private', () => {
  assert.match(organisations, /alter table public\.organisations enable row level security/);
  assert.match(organisations, /alter table public\.organisation_memberships enable row level security/);
  assert.match(organisations, /create schema if not exists app_private/);
  assert.match(organisations, /security definer/);
  assert.match(organisations, /set search_path = ''/);
  assert.match(organisations, /revoke all on function app_private\.has_org_role\(uuid, text\[\]\) from public/);
  assert.match(organisations, /grant execute on function app_private\.has_org_role\(uuid, text\[\]\) to authenticated/);
  assert.doesNotMatch(organisations, /create or replace function public\./);
  updatePoliciesHaveChecks(organisations);
});

test('admin role uses trusted app metadata and auth checks a server-validated user', () => {
  assert.match(admin, /app_metadata\?\.platform_role === 'admin'/);
  assert.doesNotMatch(admin, /user_metadata/);
  assert.match(auth, /supabase\.auth\.getUser\(\)/);
});

/**
 * The write boundary, enforced over EVERY recipe rather than the three that
 * happen to exist today.
 *
 * A Supabase database applies `alter default privileges in schema public grant
 * all on tables to anon, authenticated, service_role` before any recipe runs.
 * So a recipe that creates a table and then writes `grant update (a, b)` has not
 * narrowed anything: both roles already hold table-wide UPDATE, and the narrower
 * grant only adds a column grant on top. Every identity and lifecycle column in
 * this factory was writable by any signed-in user because of it — measured, not
 * theorised, with `tooling/db-privilege-probe.sh`.
 *
 * The fix is one line per table and it is easy to forget, which is exactly why
 * this is a rule rather than a convention. It is written against the recipe
 * catalogue rather than a list of filenames, so a new recipe with a new table
 * inherits it on the day it is added.
 */
test('every recipe table revokes inherited privileges before granting its own', () => {
  const catalogue = JSON.parse(fs.readFileSync('config/recipes.json', 'utf8')).recipes;
  const fragments = [];
  for (const [recipeId, entry] of Object.entries(catalogue)) {
    const definition = JSON.parse(fs.readFileSync(`${entry.path}/recipe.json`, 'utf8'));
    for (const relative of definition.database?.fragments ?? []) {
      fragments.push({ recipeId, file: `${entry.path}/${relative}`, sql: fs.readFileSync(`${entry.path}/${relative}`, 'utf8') });
    }
  }
  assert.ok(fragments.length > 0, 'expected at least one recipe to contribute database SQL');

  let tablesChecked = 0;
  for (const fragment of fragments) {
    const lower = fragment.sql.toLowerCase();
    for (const match of lower.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/g)) {
      const table = match[1];
      tablesChecked += 1;

      // Both roles, because `anon` inherits the same blanket grant and RLS is
      // the only thing standing in its way otherwise.
      const revoke = new RegExp(`revoke all on public\\.${table} from [^;]*\\banon\\b[^;]*\\bauthenticated\\b[^;]*;`);
      assert.match(
        lower,
        revoke,
        `${fragment.file}: public.${table} must "revoke all ... from anon, authenticated" before granting, or its column grants add privileges instead of limiting them`,
      );

      // Order is the whole point: revoking after granting would undo the grant.
      const revokeAt = lower.search(revoke);
      const grantAt = lower.search(new RegExp(`grant [^;]*on public\\.${table} to`));
      if (grantAt !== -1) {
        assert.ok(revokeAt < grantAt, `${fragment.file}: public.${table} grants before it revokes, which leaves the inherited privileges in place`);
      }

      assert.match(
        lower,
        new RegExp(`alter table public\\.${table} enable row level security`),
        `${fragment.file}: public.${table} must enable row level security`,
      );
    }
  }
  assert.ok(tablesChecked >= 4, `expected the known recipe tables to be covered, checked ${tablesChecked}`);
});
