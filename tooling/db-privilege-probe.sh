#!/usr/bin/env bash
# What privileges does a generated application's database ACTUALLY hand out?
#
# Not what the recipe SQL appears to say. PR #182 found that a Supabase database
# applies `alter default privileges in schema public grant all on tables to
# anon, authenticated, service_role` before any recipe runs, so a recipe's
# narrower `grant update (col, col)` ADDS a column grant to a role that already
# holds table-wide UPDATE. The narrower grant reads like a restriction and is
# not one.
#
# This measures the effective privilege model against the schema the factory
# actually ships, and prints it. It answers a question; it asserts nothing.
# `tooling/supabase-rls-acceptance.sql` is where the assertions live.
#
#   bash tooling/db-privilege-probe.sh
#
# Requires podman (or docker via CONTAINER_CLI) and the generated app.

set -uo pipefail

CLI="${CONTAINER_CLI:-podman}"
IMAGE="${RECORDS_PG_IMAGE:-docker.io/supabase/postgres:15.8.1.060}"
NAME="db-privilege-probe-$$"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCHEMA_DIR="$ROOT/.tmp/generated-acceptance-b2b-saas/supabase/schema"
WORK="$(mktemp -d)"
trap '"$CLI" rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"' EXIT

if [ ! -d "$SCHEMA_DIR" ]; then
  echo "Generate the canonical app first: npm run generate:acceptance" >&2
  exit 2
fi

echo 'create extension if not exists pgtap with schema extensions;' > "$WORK/m.sql"
for fragment in "$SCHEMA_DIR"/*.sql; do
  printf '\n-- source: %s\n' "$(basename "$fragment")" >> "$WORK/m.sql"
  cat "$fragment" >> "$WORK/m.sql"
done

"$CLI" run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
for _ in $(seq 1 90); do
  if [ "$("$CLI" logs "$NAME" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ]; then break; fi
  sleep 2
done
sleep 5

"$CLI" cp "$WORK/m.sql" "$NAME:/tmp/m.sql" >/dev/null
"$CLI" exec "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/m.sql >/dev/null || { echo "schema did not apply" >&2; exit 1; }

probe() { "$CLI" exec "$NAME" psql -U postgres -X -q -c "$1"; }

echo "=============================================================="
echo " Default privileges installed BEFORE any recipe ran"
echo "=============================================================="
probe "select defaclrole::regrole as granted_by, defaclobjtype as objtype, defaclacl as acl
       from pg_default_acl where defaclnamespace = 'public'::regnamespace::oid or defaclnamespace = 0;"

echo "=============================================================="
echo " TABLE-level privileges held by authenticated / anon"
echo "=============================================================="
probe "select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as table_privileges
       from information_schema.role_table_grants
       where table_schema = 'public'
         and grantee in ('authenticated','anon')
         and table_name in ('profiles','organisations','organisation_memberships','records')
       group by table_name, grantee order by table_name, grantee;"

echo "=============================================================="
echo " COLUMN-level UPDATE privileges (what the recipes tried to say)"
echo "=============================================================="
probe "select table_name, grantee, string_agg(column_name, ', ' order by column_name) as updatable_columns
       from information_schema.column_privileges
       where table_schema = 'public' and privilege_type = 'UPDATE'
         and grantee in ('authenticated','anon')
         and table_name in ('profiles','organisations','organisation_memberships','records')
       group by table_name, grantee order by table_name, grantee;"

echo "=============================================================="
echo " RLS, policies, constraints, triggers, security-definer functions"
echo "=============================================================="
probe "select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
       from pg_class where relnamespace = 'public'::regnamespace
         and relname in ('profiles','organisations','organisation_memberships','records') order by relname;"
probe "select tablename as table_name, policyname, cmd from pg_policies
       where schemaname = 'public' order by tablename, cmd, policyname;"
probe "select c.relname as table_name, t.tgname as trigger_name, p.proname as function
       from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace order by 1, 2;"
probe "select n.nspname as schema, p.proname as function, p.prosecdef as security_definer
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','app_private') and p.prosecdef order by 1, 2;"
