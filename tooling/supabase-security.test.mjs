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
