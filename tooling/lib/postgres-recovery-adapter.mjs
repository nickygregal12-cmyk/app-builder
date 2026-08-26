/**
 * The PostgreSQL implementation of the provider-neutral recovery adapter.
 *
 * `packages/control-plane/src/data-recovery.js` owns what a rehearsal has to prove; this owns how a
 * PostgreSQL database is snapshotted, measured and restored. Keeping the two apart is the point: a
 * second provider replaces this file and nothing else, and the control plane stays free of SQL, of
 * `pg_dump` and of the idea that "recovery" means a dump file at all.
 *
 * Snapshot and restore go through `pg_dump`/`pg_restore` rather than a hand-rolled export. A
 * recovery test that exercises a bespoke export path proves that the bespoke path works, which is
 * not the question anybody has in an incident.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The structural facts a restore has to reproduce.
 *
 * Row counts alone are a weak fingerprint: a restore that returns every row into a table whose
 * row-level security is gone has returned the data and lost the thing that made it safe to store.
 * So the fingerprint carries columns with their types and nullability, constraints, indexes, the
 * RLS flag per table and every policy expression.
 */
const SCHEMA_FINGERPRINT_SQL = `
select coalesce(json_agg(entry order by entry->>'kind', entry->>'name'), '[]'::json)::text
from (
  select json_build_object(
    'kind', 'column',
    'name', c.table_schema || '.' || c.table_name || '.' || c.column_name,
    'type', c.data_type,
    'nullable', c.is_nullable,
    'default', coalesce(c.column_default, '')
  ) as entry
  from information_schema.columns c
  where c.table_schema not in ('pg_catalog', 'information_schema')

  union all
  select json_build_object(
    'kind', 'constraint',
    'name', n.nspname || '.' || rel.relname || '.' || con.conname,
    'type', con.contype::text,
    'definition', pg_get_constraintdef(con.oid)
  )
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname not in ('pg_catalog', 'information_schema')

  union all
  select json_build_object('kind', 'index', 'name', schemaname || '.' || indexname, 'definition', indexdef)
  from pg_indexes
  where schemaname not in ('pg_catalog', 'information_schema')

  union all
  select json_build_object('kind', 'rls', 'name', n.nspname || '.' || rel.relname, 'enabled', rel.relrowsecurity)
  from pg_class rel
  join pg_namespace n on n.oid = rel.relnamespace
  where rel.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema')

  union all
  select json_build_object(
    'kind', 'policy',
    'name', schemaname || '.' || tablename || '.' || policyname,
    'command', cmd,
    'using', coalesce(qual, ''),
    'check', coalesce(with_check, '')
  )
  from pg_policies
  where schemaname not in ('pg_catalog', 'information_schema')
) fingerprint;
`;

/**
 * Build an adapter over a running cluster handle.
 *
 * @param {object} cluster handle from `startDisposablePostgres`
 * @param {string} snapshotDirectory where dump files are written
 */
export function createPostgresRecoveryAdapter(cluster, snapshotDirectory) {
  let sequence = 0;
  return {
    provider: 'postgresql',

    async fingerprintSchema() {
      const raw = (await cluster.psql(SCHEMA_FINGERPRINT_SQL)).trim();
      // Parsed rather than hashed: when a restore comes back wrong, "these two hashes differ" is
      // not something anyone can act on at three in the morning.
      return JSON.parse(raw || '[]');
    },

    /**
     * Run each declared invariant and return its value.
     *
     * An invariant is a SQL expression that must hold across the whole rehearsal. It is the caller
     * that decides what matters — counts, referential integrity, a specific tenant's visible rows —
     * and this only guarantees each one is actually executed and its answer recorded.
     */
    async measureInvariants(invariants) {
      const measured = {};
      for (const invariant of invariants ?? []) {
        const id = String(invariant?.id ?? '').trim();
        if (!id) continue;
        try {
          measured[id] = (await cluster.psql(invariant.query, { session: invariant.session ?? null })).trim();
        } catch (error) {
          // A query that cannot run after a destructive step has a real answer — the object is
          // gone — and recording that is how the "before" and "after" comparison stays honest.
          measured[id] = `error: ${String(error?.message ?? error).split('\n')[0]}`;
        }
      }
      return measured;
    },

    async capture() {
      sequence += 1;
      const snapshotId = `pg-snapshot-${String(sequence).padStart(3, '0')}`;
      const file = path.join(snapshotDirectory, `${snapshotId}.dump`);
      const bytes = await cluster.pgDump(file);
      // A digest over the dump bytes, so a snapshot swapped between capture and restore is a
      // different snapshot rather than the same one with different contents.
      const digest = `sha256:${createHash('sha256').update(await readFile(file)).digest('hex')}`;
      return { snapshotId, digest, bytes, file, capturedAt: new Date().toISOString() };
    },

    async restore(snapshot) {
      await cluster.pgRestore(snapshot.file);
    },
  };
}
