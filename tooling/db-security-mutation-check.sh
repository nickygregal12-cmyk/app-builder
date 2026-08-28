#!/usr/bin/env bash
# Proof of proof for the generated database's security boundaries.
#
# A pgTAP suite that passes tells you the tests ran, not that they would notice
# if the protection went away. This breaks each safeguard in turn, against a
# real PostgreSQL with the generated schema applied, and requires the suite to
# FAIL each time. A mutation that leaves the suite green is a safeguard nothing
# is actually testing.
#
# It covers two boundaries that are easy to confuse. Row level security decides
# WHICH ROWS a caller may touch; column privileges decide WHICH FIELDS of them
# may change. The second was decorative until the recipes started revoking the
# blanket grant a Supabase database installs before any of them run, so the
# mutations below break both kinds and require the suite to notice.
#
# Deliberately not wired into `npm run check`: it needs a container runtime and
# several minutes. Run it when the policies or grants change.
#
#   bash tooling/db-security-mutation-check.sh
#
# Requires podman (or docker via CONTAINER_CLI) and network access to pull
# supabase/postgres once.

set -uo pipefail

CLI="${CONTAINER_CLI:-podman}"
IMAGE="${RECORDS_PG_IMAGE:-docker.io/supabase/postgres:15.8.1.060}"
NAME="records-mutation-$$"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap '"$CLI" rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"' EXIT

SCHEMA_DIR="$ROOT/.tmp/generated-acceptance-b2b-saas/supabase/schema"
if [ ! -d "$SCHEMA_DIR" ]; then
  echo "Generate the canonical app first: npm run generate:acceptance" >&2
  exit 2
fi

# The migration is assembled from the GENERATED fragments, not from the recipe
# sources, so what is mutated below is what a generated application ships.
build_migration() {
  local out="$1"
  echo 'create extension if not exists pgtap with schema extensions;' > "$out"
  for fragment in "$SCHEMA_DIR"/*.sql; do
    printf '\n-- source: %s\n' "$(basename "$fragment")" >> "$out"
    cat "$fragment" >> "$out"
  done
}

start_database() {
  "$CLI" rm -f "$NAME" >/dev/null 2>&1
  "$CLI" run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
  # The image restarts postgres partway through initialisation, so one
  # successful connection is not readiness.
  for _ in $(seq 1 90); do
    if [ "$("$CLI" logs "$NAME" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ]; then break; fi
    sleep 2
  done
  sleep 5
}

# Returns 0 when the suite passes, 1 when any assertion fails.
run_suite() {
  local migration="$1"
  # A bare image's storage schema predates the columns the Storage service adds,
  # so bring it up to shape before applying the uploads fragment. Local
  # approximation only; CI runs the real service.
  "$CLI" cp "$ROOT/tooling/lib/storage-schema-bootstrap.sql" "$NAME:/tmp/boot.sql" >/dev/null
  "$CLI" exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/boot.sql >/dev/null 2>&1
  "$CLI" cp "$migration" "$NAME:/tmp/m.sql" >/dev/null
  if ! "$CLI" exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql >/dev/null 2>&1; then
    echo "        (schema did not apply)"
    return 1
  fi
  # This image leaves `anon` holding blanket table privileges that the real
  # Supabase stack revokes; matching it keeps the anonymous assertions honest.
  "$CLI" exec "$NAME" psql -U postgres -c "revoke all on all tables in schema public from anon;" >/dev/null 2>&1
  "$CLI" cp "$ROOT/tooling/supabase-rls-acceptance.sql" "$NAME:/tmp/t.sql" >/dev/null
  "$CLI" exec "$NAME" psql -U postgres -f /tmp/t.sql > "$WORK/tap.log" 2>&1

  # "No failing assertions" is not the same as "passed", and reading it that way
  # made this harness lie. A mutation that provokes a hard SQL error aborts the
  # transaction, so pgTAP stops emitting anything at all — no `not ok`, no
  # further `ok` — and a check that only grepped for `not ok` reported the
  # protection as untested when it had in fact been caught loudly.
  #
  # A run passes only if it completed: the plan is present, every planned
  # assertion reported `ok`, and Postgres raised nothing.
  local planned observed
  planned="$(grep -oE '^ *1\.\.[0-9]+' "$WORK/tap.log" | head -1 | grep -oE '[0-9]+$')"
  observed="$(grep -cE '^ *ok [0-9]+' "$WORK/tap.log")"
  [ -n "$planned" ] \
    && [ "$observed" -eq "$planned" ] \
    && ! grep -qE '^ *not ok' "$WORK/tap.log" \
    && ! grep -qE '^psql:.*ERROR:' "$WORK/tap.log"
}

failures=0

# --- Baseline -----------------------------------------------------------------
build_migration "$WORK/baseline.sql"
start_database
echo "== Baseline =="
if run_suite "$WORK/baseline.sql"; then
  echo "  PASS  unmutated generated schema passes all assertions"
else
  echo "  FAIL  the unmutated schema does not pass; nothing below means anything"
  grep -E '^ *not ok' "$WORK/tap.log" | sed 's/^ */        /'
  exit 1
fi

# --- Mutations ----------------------------------------------------------------
#
# Each entry weakens one protection with a sed expression over the assembled
# migration. The suite MUST fail; if it still passes, that protection has no
# test behind it.
echo
echo "== Mutations (each MUST fail the suite) =="

mutate() {
  local label="$1" expression="$2"
  build_migration "$WORK/mutant.sql"
  sed -i "$expression" "$WORK/mutant.sql"
  if cmp -s "$WORK/baseline.sql" "$WORK/mutant.sql"; then
    echo "  ERROR $label — the mutation changed nothing, so it proves nothing"
    failures=$((failures + 1))
    return
  fi
  start_database
  if run_suite "$WORK/mutant.sql"; then
    echo "  SURVIVED  $label — the suite still passed. This protection is untested."
    failures=$((failures + 1))
  else
    local caught
    caught="$(grep -cE '^ *not ok' "$WORK/tap.log")"
    if [ "$caught" -gt 0 ]; then
      echo "  killed    $label — ${caught} assertion(s) failed"
    else
      echo "  killed    $label — the suite could not complete (the mutation raised)"
    fi
  fi
}

# 1. Tenant predicate on SELECT: every member sees every tenant's records.
mutate "tenant predicate removed from SELECT" \
  's|^create policy "records_select_member" on public.records for select to authenticated$|create policy "records_select_member" on public.records for select to authenticated|; s|^using (app_private.has_org_role(organisation_id, null));$|using (true);|'

# 2. Tenant predicate on UPDATE: anyone authenticated may edit any record.
mutate "tenant predicate removed from UPDATE" \
  's|^using (app_private.has_org_role(organisation_id, array\[.owner., .admin., .editor., .member.\]))$|using (true)|'

# 3. Organisation-id forgery: the insert no longer re-derives membership, so a
#    client may name any tenant it likes.
mutate "organisation_id forgery guard removed from INSERT" \
  "s|app_private.has_org_role(organisation_id, array\['owner', 'admin', 'editor', 'member'\])\$|true|"

# 4. Role distinction: a viewer becomes a contributor and delete stops being an
#    owner/admin privilege.
mutate "role distinction flattened" \
  "s|array\['owner', 'admin', 'editor', 'member'\]|array['owner', 'admin', 'editor', 'member', 'viewer']|g; s|using (app_private.has_org_role(organisation_id, array\['owner', 'admin'\]));|using (app_private.has_org_role(organisation_id, null));|"

# 5. Admin boundary: the bounded archive operation stops checking the role.
mutate "archive operation stops checking the organisation role" \
  "s|if not app_private.has_org_role(target.organisation_id, array\['owner', 'admin'\]) then|if false then|"

# 6. The privileged column, with its OTHER protection removed first.
#
#    This mutation is deliberately compound, and the reason is worth recording.
#    Before the write boundary existed, disabling the trigger was enough to make
#    `archived_at` writable and the suite caught it. Now the column carries no
#    UPDATE grant either, so removing the trigger alone changes nothing — the
#    privilege refuses the write first, the assertion still passes, and the
#    mutation survives while looking like an untested safeguard.
#
#    Two mechanisms now guard one column, which is defence in depth rather than
#    duplication: the grant stops today's client, and the trigger stops a future
#    recipe author who adds `archived_at` to the grant list without thinking. To
#    test the trigger, this grants the column back and leaves the trigger to do
#    the work alone.
mutate "archived_at granted back, leaving only the trigger" \
  "s|^grant update (reference, title, summary, status) on public.records to authenticated;\$|grant update (reference, title, summary, status, archived_at) on public.records to authenticated;|; s|if new.archived_at is distinct from old.archived_at|if false|"

# --- The write boundary: WHICH COLUMNS may change ------------------------------
#
# Each of these was reachable before the explicit revoke. They are the reason
# the revoke exists, so each must be caught.

# 7. The revoke itself. Without it every column grant below is additive, and a
#    signed-in user regains table-wide UPDATE on records.
mutate "records inherits blanket UPDATE again" \
  "s|^revoke all on public.records from anon, authenticated;\$||"

# 8. Authorship and tenancy become writable columns on records.
mutate "records grants organisation_id and created_by" \
  "s|^grant update (reference, title, summary, status) on public.records to authenticated;\$|grant update (reference, title, summary, status, organisation_id, created_by) on public.records to authenticated;|"

# 9. The membership revoke, which is where the stakes are plainest: without it
#    an admin can rewrite user_id and hand a membership to somebody else.
mutate "organisation_memberships inherits blanket UPDATE again" \
  "s|^revoke all on public.organisation_memberships from anon, authenticated;\$||"

# 10. The organisations revoke. `organisations_delete_owner` keys off
#     created_by, so a writable created_by is privilege escalation.
mutate "organisations inherits blanket UPDATE again" \
  "s|^revoke all on public.organisations from anon, authenticated;\$||"

# 11. Profiles, the one table whose identity column RLS already protects — so
#     this proves the lifecycle column is covered by the revoke and not by luck.
mutate "profiles inherits blanket UPDATE again" \
  "s|^revoke all on public.profiles from anon, authenticated;\$||"


# --- Organisation-owned storage ------------------------------------------------
#
# Storage has no column-privilege boundary available: Supabase owns
# `storage.objects` and its API needs those grants, so RLS is the whole of it.
# That makes these policies load-bearing in a way the public-table ones are not,
# and each one is broken here to prove the suite would notice.

# 12. Tenant predicate on reading files: every member sees every tenant's files.
mutate "storage read predicate drops the organisation check" \
  "s|and app_private.has_org_role(app_private.storage_object_organisation(name), null)|and true|"

# 13. Tenant predicate on upload: a caller may write into any organisation's
#     namespace by naming it, which is the forgery case.
mutate "storage upload accepts any tenant prefix" \
  "s|and app_private.has_org_role(app_private.storage_object_organisation(name), array\['owner', 'admin', 'editor', 'member'\])|and true|"

# 14. Membership replaced by mere authentication — the classic wrong fix, and
#     the one that looks most like security while being none.
mutate "storage read requires only a signed-in caller" \
  "s|and app_private.has_org_role(app_private.storage_object_organisation(name), null)|and (select auth.uid()) is not null|"

# 15. The remove privilege stops being owner/admin.
mutate "storage delete loses its role restriction" \
  "s|and app_private.has_org_role(app_private.storage_object_organisation(name), array\['owner', 'admin'\])|and app_private.has_org_role(app_private.storage_object_organisation(name), null)|"

# 16. The tenant helper stops parsing, so every key resolves to one organisation
#     and the namespace collapses.
mutate "storage tenant helper returns a fixed organisation" \
  "s|then ((storage.foldername(object_name))\[1\])::uuid|then '20000000-0000-0000-0000-000000000001'::uuid|"

echo
if [ "$failures" -eq 0 ]; then
  echo "PASS  every mutated safeguard was caught by the acceptance suite."
else
  echo "FAIL  ${failures} mutation(s) survived. Those safeguards are not tested."
  exit 1
fi
