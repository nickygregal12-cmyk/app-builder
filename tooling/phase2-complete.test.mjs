import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationPlan, generateProject, loadCatalog } from './lib/generator.mjs';

const catalog = loadCatalog();
const projectTypes = JSON.parse(fs.readFileSync('config/project-types.json', 'utf8')).projectTypes;
const modules = JSON.parse(fs.readFileSync('config/modules.json', 'utf8')).modules;

function manifestFor(type) {
  const backend = ['marketing-site', 'content-site'].includes(type) ? 'none' : 'supabase';
  const enabled = Object.fromEntries((projectTypes[type].defaultModules ?? []).map((name) => [name, true]));
  return {
    schemaVersion: 1,
    project: { name: `${type} acceptance`, slug: `${type}-acceptance`, type, primaryGoal: `Prove deterministic ${type} generation.` },
    modules: enabled,
    infrastructure: { backend, deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 5 },
    brand: { accentColor: '#315b72' },
    inputs: { sources: [] },
    outOfScope: [],
  };
}

function filesUnder(root, base = root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(full, base) : [path.relative(base, full)];
  }).sort();
}

test('every project-type default module is a ready deterministic capability', () => {
  for (const [type, config] of Object.entries(projectTypes)) {
    for (const moduleName of config.defaultModules ?? []) assert.equal(modules[moduleName]?.status, 'ready', `${type} defaults to non-ready ${moduleName}`);
  }
});

test('all six project types have distinct deterministic layouts and generate standalone projects', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-phase2-'));
  const layouts = new Set();
  try {
    for (const type of Object.keys(projectTypes)) {
      const manifest = manifestFor(type);
      const out = path.join(temp, type);
      const plan = generateProject(manifest, out, { catalog });
      layouts.add(plan.design.patternId);
      assert.equal(plan.missingModules.length, 0);
      assert.ok(plan.adapters.some((adapter) => adapter.id === 'netlify'));
      assert.ok(fs.existsSync(path.join(out, 'netlify.toml')));
      assert.ok(fs.existsSync(path.join(out, 'docs/HANDOVER.md')));
      assert.ok(fs.existsSync(path.join(out, 'src/generated/design.ts')));
      assert.ok(fs.existsSync(path.join(out, 'src/generated/scenarios.ts')));
      const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
      assert.equal(Object.keys(pkg.dependencies ?? {}).some((name) => name.startsWith('@app-builder/')), false);
    }
    assert.equal(layouts.size, Object.keys(projectTypes).length);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('generation is byte-stable for identical inputs', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-stable-'));
  const first = path.join(temp, 'first');
  const second = path.join(temp, 'second');
  const manifest = manifestFor('content-site');
  try {
    generateProject(manifest, first, { catalog });
    generateProject(manifest, second, { catalog });
    const files = filesUnder(first);
    assert.deepEqual(files, filesUnder(second));
    for (const relative of files) assert.deepEqual(fs.readFileSync(path.join(first, relative)), fs.readFileSync(path.join(second, relative)), relative);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('deployment selection fails closed for an unsupported target', () => {
  const manifest = manifestFor('content-site');
  manifest.infrastructure.deployment = 'cloudflare';
  assert.throws(() => buildGenerationPlan(manifest, { catalog }), /No ready deployment adapter for cloudflare/);
});

test('Netlify and lead-generation contracts include SPA routing and static form detection', () => {
  const netlify = fs.readFileSync('adapters/netlify/files/netlify.toml', 'utf8');
  const form = fs.readFileSync('recipes/lead-generation/files/public/__forms.html', 'utf8');
  const component = fs.readFileSync('recipes/lead-generation/files/src/features/lead-generation/index.tsx', 'utf8');
  assert.match(netlify, /publish = "dist"/);
  assert.match(netlify, /from = "\/\*"[\s\S]*to = "\/index\.html"[\s\S]*status = 200/);
  assert.match(form, /name="enquiry"/);
  assert.match(form, /netlify-honeypot="bot-field"/);
  assert.match(component, /fetch\('\/__forms\.html'/);
});

test('upload recipe owns a private organisation bucket and derives the tenant from the object key', () => {
  const sql = fs.readFileSync('recipes/uploads/database/storage.sql', 'utf8').toLowerCase();

  // Private, and organisation-owned rather than user-owned. The previous
  // version of this test asserted a `user-files` bucket keyed on `auth.uid()`,
  // which was the consumer-product shape: it gave every person a private folder
  // and gave an organisation no way to keep anything.
  assert.match(sql, /'organisation-files', 'organisation-files', false/);

  // The tenant is re-derived from the object's own key by a helper that returns
  // null for a malformed one, so a policy can never raise on a bad path and
  // `has_org_role(null, …)` is false.
  assert.match(sql, /app_private\.storage_object_organisation/);
  assert.match(sql, /app_private\.has_org_role\(app_private\.storage_object_organisation\(name\)/);
  assert.doesNotMatch(sql, /\(select auth\.uid\(\)\)::text/, 'storage tenancy must not fall back to a per-user folder');

  assert.match(sql, /for select to authenticated/);
  assert.match(sql, /for insert to authenticated/);
  assert.match(sql, /for delete to authenticated/);

  // The absence of an UPDATE policy is the design, not an oversight, so it is
  // asserted rather than left to be re-broken by someone adding one for
  // symmetry. Renaming an object is how a file would move between tenants: an
  // identity belonging to two organisations could otherwise rewrite the tenant
  // prefix and satisfy a membership check on both sides of the write.
  assert.doesNotMatch(sql, /for update to authenticated/, 'an update policy would make an object reclassifiable between tenants');

  // Supabase owns storage.objects and its API needs those grants, so PR #184's
  // revoke-before-grant rule for factory-owned public tables must not be
  // applied here. RLS is the whole boundary for storage.
  assert.doesNotMatch(sql, /revoke all on storage\./, 'revoking Supabase storage grants breaks the Storage API rather than securing it');
});

test('notifications are created only by the database and readable only by their recipient', () => {
  const sql = fs.readFileSync('recipes/notifications/database/notifications.sql', 'utf8').toLowerCase();

  // The forgery boundary is a PRIVILEGE, not a policy. An insert policy can
  // only test what a row says about itself, so a client naming itself as the
  // recipient of a notification it invented satisfies any honest `with check`
  // clause. Withholding the grant refuses the statement before a policy is
  // consulted, for every kind, recipient and organisation at once.
  assert.match(sql, /revoke all on public\.notifications from anon, authenticated;/);
  assert.match(sql, /grant select on public\.notifications to authenticated;/);
  assert.match(sql, /grant update \(read_at\) on public\.notifications to authenticated;/);
  assert.doesNotMatch(sql, /grant insert[^;]*on public\.notifications/, 'a client that can insert a notification can forge one from the system');
  assert.doesNotMatch(sql, /grant delete[^;]*on public\.notifications/, 'a recipient must not be able to destroy the record that something was told to them');

  // The absence of these policies is the design rather than an oversight, and
  // is asserted so that nobody adds one back for symmetry with records.
  assert.doesNotMatch(sql, /on public\.notifications for insert/, 'an insert policy would be the only route to a forged system notification');
  assert.doesNotMatch(sql, /on public\.notifications for delete/, 'a delete policy would let a recipient erase what they were told');

  // Ownership is two-dimensional here, unlike every capability before it: an
  // organisation-wide read would show one colleague another colleague's inbox,
  // so both predicates have to be present on both policies.
  assert.match(sql, /on public\.notifications for select to authenticated/);
  assert.match(sql, /on public\.notifications for update to authenticated/);
  const policies = [...sql.matchAll(/create policy[\s\S]*?on public\.notifications[\s\S]*?;/g)].map((match) => match[0]);
  assert.equal(policies.length, 2, 'notifications must carry exactly the read and mark-read policies');
  for (const policy of policies) {
    assert.match(policy, /recipient_id = \(select auth\.uid\(\)\)/, 'every notification policy must test the recipient');
    assert.match(policy, /app_private\.has_org_role\(organisation_id, null\)/, 'every notification policy must test the organisation');
  }

  // The one elevated creation path, and the bound on it: a trigger on the table
  // whose changes are the application events, writing nothing else.
  assert.match(sql, /create or replace function app_private\.notify_record_event\(\)[\s\S]*?security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /after insert or update of status on public\.records/);
  assert.match(sql, /where membership\.organisation_id = new\.organisation_id/, 'the fan-out must be scoped to the organisation the event happened in');
  assert.match(sql, /and membership\.user_id is distinct from actor/, 'the person who caused the event is not notified about it');
  assert.doesNotMatch(sql, /create or replace function public\./, 'notifications add no publicly callable function');

  // A bounded enumeration rather than free text, so a future recipe cannot
  // invent a notification kind the product has never rendered.
  assert.match(sql, /check \(kind in \('record-created', 'record-archived'\)\)/);
});
