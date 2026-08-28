#!/usr/bin/env node
/**
 * The organisation-files boundary, proved through the Storage HTTP API.
 *
 * This exists because part of the boundary is unreachable from SQL. A real
 * Supabase deployment installs a trigger on `storage.objects` that refuses
 * direct DELETE and UPDATE — "Direct deletion from storage tables is not
 * allowed. Use the Storage API instead." — so the remove boundary and the
 * rename-between-tenants boundary cannot be asserted in pgTAP however much one
 * would like to. An earlier draft tried, and passed locally only because the
 * bare postgres image carries no such trigger; CI, which runs the real service,
 * refused it immediately.
 *
 * So the proof is split along the line the platform actually draws:
 *
 *   pgTAP                    which objects a caller may SEE and CREATE
 *   this file                which a caller may REMOVE, and the refusals
 *                            that only the Storage API can express
 *   the browser journey      that a person can do it and it persists
 *
 * Every request below is made with a real access token for a real seeded
 * identity, obtained by password grant, so what is exercised is the same path a
 * generated application takes.
 *
 *   node tooling/storage-boundary-acceptance.mjs --url http://127.0.0.1:54321 \
 *     --anon-key <anon> --service-key <service>
 */

import process from 'node:process';

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

const url = argument('--url', 'http://127.0.0.1:54321').replace(/\/$/, '');
const anonKey = argument('--anon-key');
const serviceKey = argument('--service-key');
if (!anonKey || !serviceKey) {
  console.error('Usage: node tooling/storage-boundary-acceptance.mjs --anon-key <key> --service-key <key> [--url <api>]');
  process.exit(2);
}

const BUCKET = 'organisation-files';
const ORG_A = '20000000-0000-0000-0000-000000000001';
const ORG_B = '20000000-0000-0000-0000-000000000002';

// The identities the shared seed already creates. No second fixture system.
const PEOPLE = {
  ownerA: { email: 'owner-a@test.local', password: 'records-journey-owner-a' },
  memberA: { email: 'member-a@test.local', password: 'records-journey-member-a' },
  viewerA: { email: 'viewer-a@test.local', password: 'records-journey-viewer-a' },
  ownerB: { email: 'owner-b@test.local', password: 'records-journey-owner-b' },
};

async function signIn({ email, password }) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Could not sign in ${email}: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

const asUser = (token) => ({ apikey: anonKey, Authorization: `Bearer ${token}` });
const asService = () => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });

async function put(headers, key, body, contentType = 'text/plain') {
  return fetch(`${url}/storage/v1/object/${BUCKET}/${key}`, { method: 'POST', headers: { ...headers, 'Content-Type': contentType, 'x-upsert': 'true' }, body });
}
async function del(headers, key) {
  return fetch(`${url}/storage/v1/object/${BUCKET}/${key}`, { method: 'DELETE', headers });
}
async function list(headers, prefix) {
  const response = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  if (!response.ok) return [];
  const body = await response.json();
  return Array.isArray(body) ? body.filter((entry) => entry.id !== null).map((entry) => entry.name) : [];
}

/** Does this object exist, asked with authority that ignores RLS? */
async function existsAuthoritatively(key) {
  return (await list(asService(), key.split('/')[0])).includes(key.split('/').slice(1).join('/'));
}

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); else console.log(`  ok    ${message}`); };

console.log('== Organisation files: the Storage API boundary ==\n');

const tokens = Object.fromEntries(await Promise.all(
  Object.entries(PEOPLE).map(async ([name, person]) => [name, await signIn(person)]),
));

// --- Fixtures, placed with authority so the tests act on real objects --------
const targetA = `${ORG_A}/50000000-0000-0000-0000-0000000000a1-org-a-target.txt`;
const targetB = `${ORG_B}/50000000-0000-0000-0000-0000000000b1-org-b-target.txt`;
for (const key of [targetA, targetB]) {
  const seeded = await put(asService(), key, `seeded ${key}\n`);
  if (!seeded.ok) { console.error(`Could not seed ${key}: ${seeded.status} ${await seeded.text()}`); process.exit(1); }
}

// --- Cross-tenant refusals ---------------------------------------------------
expect(!(await list(asUser(tokens.ownerA), ORG_B)).length, 'organisation A cannot list organisation B files');
expect((await list(asUser(tokens.ownerA), ORG_A)).length > 0, 'organisation A can list its own files');

// Fetching another tenant's object by its exact key, which is the guessed-path case.
const stolen = await fetch(`${url}/storage/v1/object/${BUCKET}/${targetB}`, { headers: asUser(tokens.ownerA) });
expect(!stolen.ok, 'organisation A cannot fetch an organisation B file by its exact key');

await del(asUser(tokens.ownerA), targetB);
expect(await existsAuthoritatively(targetB), 'organisation A cannot delete an organisation B file');

const forged = await put(asUser(tokens.ownerA), `${ORG_B}/50000000-0000-0000-0000-0000000000b2-forged.txt`, 'forged\n');
expect(!forged.ok, 'organisation A cannot upload into the organisation B namespace');

// --- Role distinction, which is the part SQL could not reach -----------------
await del(asUser(tokens.memberA), targetA);
expect(await existsAuthoritatively(targetA), 'a member of organisation A cannot remove one of its files');

const viewerUpload = await put(asUser(tokens.viewerA), `${ORG_A}/50000000-0000-0000-0000-0000000000a2-viewer.txt`, 'viewer\n');
expect(!viewerUpload.ok, 'a viewer in organisation A cannot upload a file');

// --- Anonymous ---------------------------------------------------------------
const anonList = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
  method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: ORG_A, limit: 100 }),
});
const anonNames = anonList.ok ? (await anonList.json()).filter((entry) => entry.id !== null) : [];
expect(anonNames.length === 0, 'an anonymous caller lists no organisation files');
const anonFetch = await fetch(`${url}/storage/v1/object/${BUCKET}/${targetA}`, { headers: { apikey: anonKey } });
expect(!anonFetch.ok, 'an anonymous caller cannot fetch an organisation file');

// --- The permitted operation still works -------------------------------------
// Proved last, because it destroys the fixture the refusals above act on.
const removed = await del(asUser(tokens.ownerA), targetA);
expect(removed.ok, 'an owner of organisation A can remove one of its files');
expect(!(await existsAuthoritatively(targetA)), 'a removal by an owner actually persists');

console.log('\n== Result ==\n');
if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  process.exitCode = 1;
} else {
  console.log('PASS  the Storage API enforces the organisation boundary and the role distinction.');
}
