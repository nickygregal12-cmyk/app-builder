#!/usr/bin/env node
/**
 * Deterministic identities, tenants, records and files for the
 * generated-application browser journeys, created through the real Supabase APIs.
 *
 * The same six identities the pgTAP acceptance uses, in the same two
 * organisations, so the browser journey and the database acceptance are talking
 * about one scenario rather than two that happen to rhyme. This does not invent
 * a second fixture system: the SQL suite seeds its own rows inside a
 * transaction it rolls back, and this seeds the same shape into a running stack
 * that a browser can sign in to.
 *
 *   node tooling/seed-records-journey.mjs --url http://127.0.0.1:54321 \
 *     --service-key <service_role key> --db-url postgresql://...
 *
 * Users are created through the GoTrue admin API rather than by inserting into
 * `auth.users`, because a row inserted by hand has no password anybody can sign
 * in with, and a journey that cannot sign in is not a journey.
 *
 * Passwords here are test credentials for a throwaway local stack. They are not
 * secrets, are never read from the environment, and must never be reused.
 */

import process from 'node:process';
import { spawnSync } from 'node:child_process';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const url = argument('--url', 'http://127.0.0.1:54321').replace(/\/$/, '');
const serviceKey = argument('--service-key');
const dbUrl = argument('--db-url', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
if (!serviceKey) {
  console.error('Usage: node tooling/seed-records-journey.mjs --service-key <key> [--url <api>] [--db-url <postgres>]');
  process.exit(2);
}

export const IDENTITIES = Object.freeze([
  { id: '10000000-0000-0000-0000-000000000001', email: 'owner-a@test.local', password: 'records-journey-owner-a', role: 'owner', organisation: 'a', name: 'Owner A', platformRole: 'admin' },
  { id: '10000000-0000-0000-0000-000000000004', email: 'member-a@test.local', password: 'records-journey-member-a', role: 'member', organisation: 'a', name: 'Member A' },
  { id: '10000000-0000-0000-0000-000000000005', email: 'viewer-a@test.local', password: 'records-journey-viewer-a', role: 'viewer', organisation: 'a', name: 'Viewer A' },
  { id: '10000000-0000-0000-0000-000000000006', email: 'owner-b@test.local', password: 'records-journey-owner-b', role: 'owner', organisation: 'b', name: 'Owner B' },
]);

const ORGANISATIONS = Object.freeze({
  a: { id: '20000000-0000-0000-0000-000000000001', name: 'Organisation A', slug: 'organisation-a', createdBy: '10000000-0000-0000-0000-000000000001' },
  b: { id: '20000000-0000-0000-0000-000000000002', name: 'Organisation B', slug: 'organisation-b', createdBy: '10000000-0000-0000-0000-000000000006' },
});

async function createUser(identity) {
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: identity.id, email: identity.email, password: identity.password, email_confirm: true, app_metadata: identity.platformRole ? { platform_role: identity.platformRole } : {} }),
  });
  if (response.ok) return 'created';
  const body = await response.text();
  // A rerun against a stack that already holds the identity is not a failure.
  if (/already been registered|already exists|duplicate/i.test(body)) return 'existing';
  throw new Error(`Could not create ${identity.email}: ${response.status} ${body}`);
}

function sql(statement) {
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-c', statement], { encoding: 'utf8', stdio: 'pipe' });
  if (result.status !== 0) throw new Error(`psql failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result.stdout;
}

for (const identity of IDENTITIES) {
  const outcome = await createUser(identity);
  console.log(`${outcome.padEnd(8)} ${identity.email}`);
}

// Profiles, organisations, memberships and one record per tenant. Written with
// `on conflict do nothing` so the seed is idempotent, and as the database owner
// because seeding is not something a tenant does.
const profiles = IDENTITIES.map((identity) => `('${identity.id}', '${identity.name}')`).join(', ');
const memberships = IDENTITIES.map((identity) => `('${ORGANISATIONS[identity.organisation].id}', '${identity.id}', '${identity.role}')`).join(', ');

sql(`insert into public.profiles (id, display_name) values ${profiles} on conflict (id) do nothing;`);
sql(`insert into public.organisations (id, name, slug, created_by) values
  ('${ORGANISATIONS.a.id}', '${ORGANISATIONS.a.name}', '${ORGANISATIONS.a.slug}', '${ORGANISATIONS.a.createdBy}'),
  ('${ORGANISATIONS.b.id}', '${ORGANISATIONS.b.name}', '${ORGANISATIONS.b.slug}', '${ORGANISATIONS.b.createdBy}')
  on conflict (id) do nothing;`);
sql(`insert into public.organisation_memberships (organisation_id, user_id, role) values ${memberships} on conflict (organisation_id, user_id) do nothing;`);

// One record per tenant, so the journey can prove that only one of them is
// visible. Organisation B's record is the control: if it ever appears in
// organisation A's list, the isolation the pgTAP suite proves has been undone
// somewhere between the database and the screen.
//
// These inserts also raise notifications, and that is worth stating because it
// is not seeding notifications — it is the notifications recipe's trigger
// reacting to a real record being created, exactly as it does for a record
// created through the interface. `auth.uid()` is null for a psql seed, so the
// trigger falls back to the record's own author: organisation A's owner is the
// author of REC-A1 and is therefore NOT notified about it, which is what leaves
// the notification journey a clean starting point to act against.
sql(`insert into public.records (id, organisation_id, reference, title, summary, status, created_by) values
  ('30000000-0000-0000-0000-000000000001', '${ORGANISATIONS.a.id}', 'REC-A1', 'Organisation A first record', 'Seeded for the browser journey.', 'active', '${ORGANISATIONS.a.createdBy}'),
  ('30000000-0000-0000-0000-000000000004', '${ORGANISATIONS.b.id}', 'REC-B1', 'Organisation B confidential record', 'Must never appear to organisation A.', 'active', '${ORGANISATIONS.b.createdBy}')
  on conflict (id) do nothing;`);

// One file owned by organisation B, so the uploads journey can prove that
// organisation A never sees it. Uploaded with the service key, because seeding
// is not something a tenant does — and because the point is that a legitimately
// present object in another tenant stays invisible, not that it was never there.
const CONFIDENTIAL = 'Organisation B confidential file. Organisation A must never see this.\n';
const objectKey = `${ORGANISATIONS.b.id}/40000000-0000-0000-0000-0000000000b1-organisation-b-confidential.txt`;
const upload = await fetch(`${url}/storage/v1/object/organisation-files/${objectKey}`, {
  method: 'POST',
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'text/plain', 'x-upsert': 'true' },
  body: CONFIDENTIAL,
});
if (!upload.ok) {
  const detail = await upload.text();
  throw new Error(`Could not seed the organisation B file: ${upload.status} ${detail}`);
}
console.log('seeded   organisation B file for the cross-tenant assertion');

// --- The scheduled-decision journey -------------------------------------------
//
// Two entities in organisation A, and the order of these statements is the
// fixture rather than an implementation detail.
//
// A decision cannot be written to an entity whose window has closed — the
// trigger refuses it whoever is asking, including this seed. So the settled
// entity is created OPEN, decided on, and only then brought forward. That is
// also the honest shape: it is what happened, in the order it happened, rather
// than a row asserting that it did.
const SCHEDULE = Object.freeze({
  open: '44000000-0000-0000-0000-000000000001',
  settled: '44000000-0000-0000-0000-000000000002',
});
const MEMBER_A = '10000000-0000-0000-0000-000000000004';
const VIEWER_A = '10000000-0000-0000-0000-000000000005';
const OWNER_A = ORGANISATIONS.a.createdBy;

sql(`insert into public.scheduled_entities (id, organisation_id, reference, title, decision_deadline, created_by) values
  ('${SCHEDULE.open}', '${ORGANISATIONS.a.id}', 'SCH-OPEN', 'Open for decisions', now() + interval '2 hours', '${OWNER_A}'),
  ('${SCHEDULE.settled}', '${ORGANISATIONS.a.id}', 'SCH-SETTLED', 'Already settled', now() + interval '2 hours', '${OWNER_A}')
  on conflict (id) do nothing;`);

// Viewer A decides on the open entity and Member A does not. That asymmetry is
// the browser isolation assertion: signed in as Member A, a decision that
// demonstrably exists must not be on the page. A fixture where nobody else had
// decided would pass whether the policy worked or not.
sql(`insert into public.scheduled_decisions (entity_id, identity_id, choice) values
  ('${SCHEDULE.open}', '${VIEWER_A}', '{"a":1,"b":1}'::jsonb),
  ('${SCHEDULE.settled}', '${MEMBER_A}', '{"a":2,"b":1}'::jsonb),
  ('${SCHEDULE.settled}', '${VIEWER_A}', '{"a":5,"b":0}'::jsonb)
  on conflict (entity_id, identity_id) do nothing;`);

// Now close the settled entity's window. Allowed because it is still open at
// this moment, and refused for ever afterwards.
sql(`update public.scheduled_entities set decision_deadline = now() - interval '1 minute'
     where id = '${SCHEDULE.settled}' and decision_deadline > now();`);

sql(`insert into public.scheduled_official_results (entity_id, version, status, outcome, source, observed_at) values
  ('${SCHEDULE.settled}', 1, 'confirmed', '{"a":2,"b":1}'::jsonb, 'journey-seed-results-feed', now() - interval '30 seconds')
  on conflict (entity_id, version) do nothing;`);

// Settled through the real function rather than by inserting settlement rows,
// because the point of a seeded standing is that the thing which produces
// standings produced it. `settle_scheduled_entity` re-derives the caller's role,
// so the seed has to claim an identity the way a request would; both settings
// are transaction-local and psql runs this as one transaction.
sql(`select set_config('request.jwt.claim.sub', '${OWNER_A}', true);
     select set_config('request.jwt.claims', '{"sub":"${OWNER_A}","role":"authenticated"}', true);
     select public.settle_scheduled_entity('${SCHEDULE.settled}');`);

console.log('seeded   2 scheduled entities, 3 decisions and one settled result');

console.log('seeded   2 organisations, 4 identities, 2 records, 1 file, 2 scheduled entities (and the notifications those records raised)');
