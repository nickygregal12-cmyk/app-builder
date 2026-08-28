#!/usr/bin/env bash
# Proof of proof for the tenant-records security boundary.
#
# A pgTAP suite that passes tells you the tests ran, not that they would notice
# if the protection went away. This breaks each safeguard in turn, against a
# real PostgreSQL with the generated schema applied, and requires the suite to
# FAIL each time. A mutation that leaves the suite green is a safeguard nothing
# is actually testing.
#
# Deliberately not wired into `npm run check`: it needs a container runtime and
# several minutes. Run it when the records policies change.
#
#   bash tooling/records-mutation-check.sh
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

# 6. The privileged column stops being privileged. Mutating the GRANT proves
#    nothing on Supabase, whose default privileges already grant `authenticated`
#    full UPDATE on every new public table; the trigger is what enforces this, so
#    the trigger is what gets broken.
mutate "archived_at column guard disabled" \
  "s|if new.archived_at is distinct from old.archived_at|if false|"

echo
if [ "$failures" -eq 0 ]; then
  echo "PASS  every mutated safeguard was caught by the acceptance suite."
else
  echo "FAIL  ${failures} mutation(s) survived. Those safeguards are not tested."
  exit 1
fi
