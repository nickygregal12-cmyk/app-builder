/**
 * Stage Q12 — the evidence half of the production data-change safety contract.
 *
 * `data-change.js` refuses a change whose restore was never rehearsed. This is what performs the
 * rehearsal, and the reason it is a separate module is the reason the stage exists at all: a JSON
 * record saying `backup: true` is a claim about a backup, and the only thing that turns it into
 * evidence is having restored it and looked at what came back.
 *
 * The orchestration below is provider-neutral. It never opens a connection, never writes SQL and
 * never knows what a dump file is. A `RecoveryAdapter` does all of that; the stable App Builder
 * concept is "capture, damage, restore, compare", not `pg_dump`. A second provider is a second
 * adapter rather than a second definition of what recovery means.
 *
 * Most of the work here is refusing to be fooled by its own happy path. A rehearsal that restores an
 * empty database passes trivially; so does one whose destructive step destroyed nothing, and so does
 * one against an adapter that reports whatever it is asked to report. Each of those is a named
 * failure below, because the whole point of this rehearsal is to be the thing that cannot pass
 * without having done anything.
 */

/** Every way a rehearsal can fail to be evidence. There is no unnamed failure and no default pass. */
export const RESTORE_REHEARSAL_FAILURES = Object.freeze([
  'adapter-incomplete',
  'baseline-empty',
  'invariant-undeclared',
  'invariant-unmeasured',
  'snapshot-not-captured',
  'snapshot-empty',
  'damage-ineffective',
  'schema-not-restored',
  'invariant-not-restored',
  'adapter-error',
]);

/** What an adapter must be able to do. A missing method is `adapter-incomplete`, never a skip. */
export const RECOVERY_ADAPTER_METHODS = Object.freeze(['fingerprintSchema', 'measureInvariants', 'capture', 'restore']);

function missingAdapterMethods(adapter) {
  return RECOVERY_ADAPTER_METHODS.filter((name) => typeof adapter?.[name] !== 'function');
}

function stableCompare(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/**
 * Perform a restore rehearsal against a live, disposable database.
 *
 * @param {object} input
 * @param {object} input.adapter provider implementation of `RECOVERY_ADAPTER_METHODS`
 * @param {string} input.environment environment the rehearsal represents
 * @param {string} input.databaseId database identity the rehearsal represents
 * @param {Array<{id: string, description: string}>} input.invariants what must come back. These are
 *   the facts a restore has to reproduce — row counts, referential integrity, the tenant-isolation
 *   policies that made the rows safe to store. The adapter measures them; this decides whether the
 *   measurements agree before and after.
 * @param {{description: string, apply: Function}} input.damage the controlled destruction. It is
 *   required rather than optional: a rehearsal with nothing to recover from is a backup test that
 *   never tested a restore.
 * @returns {Promise<object>} the rehearsal result, whose `evidence` is directly consumable by
 *   `planDataChange` as `recovery.restoreRehearsal`.
 */
export async function runRestoreRehearsal({
  adapter,
  environment,
  databaseId,
  invariants = [],
  damage,
  evidenceId,
  clock = () => new Date(),
} = {}) {
  const failures = [];
  const steps = [];
  const fail = (reason, detail) => { failures.push({ reason, detail }); };
  const startedAt = clock().toISOString();

  const missing = missingAdapterMethods(adapter);
  if (missing.length > 0) fail('adapter-incomplete', `Recovery adapter is missing: ${missing.join(', ')}.`);
  if (typeof damage?.apply !== 'function' || !String(damage?.description ?? '').trim()) {
    fail('adapter-incomplete', 'A rehearsal needs a described destructive step to recover from.');
  }
  const declared = invariants.map((entry) => String(entry?.id ?? '').trim()).filter(Boolean);
  if (declared.length === 0) fail('invariant-undeclared', 'Name the facts a restore must reproduce. "It ran without error" is not one.');
  if (failures.length > 0) return rehearsalResult({ failures, steps, environment, databaseId, evidenceId, startedAt, clock, snapshot: null, damage });

  let snapshot = null;
  try {
    const baselineSchema = await adapter.fingerprintSchema();
    const baselineInvariants = await adapter.measureInvariants(invariants);
    steps.push({ step: 'baseline', invariants: baselineInvariants });

    for (const id of declared) {
      if (!(id in (baselineInvariants ?? {}))) fail('invariant-unmeasured', `The adapter did not measure ${id}.`);
    }
    // A restore of nothing is indistinguishable from a successful restore of everything. If the
    // baseline holds no rows, this rehearsal cannot prove that rows come back.
    const numeric = Object.values(baselineInvariants ?? {}).map((value) => Number(value)).filter((value) => Number.isFinite(value));
    // `every` over an empty list is true, and that is the right answer here: a baseline with
    // nothing countable in it is precisely the case this refuses.
    if (numeric.every((value) => value === 0)) {
      fail('baseline-empty', 'No invariant counted anything before the snapshot. Seed real rows first.');
    }
    if (failures.length > 0) return rehearsalResult({ failures, steps, environment, databaseId, evidenceId, startedAt, clock, snapshot, damage });

    snapshot = await adapter.capture();
    steps.push({ step: 'capture', snapshotId: snapshot?.snapshotId ?? null, bytes: snapshot?.bytes ?? null });
    if (!snapshot?.snapshotId || !snapshot?.digest) fail('snapshot-not-captured', 'The adapter returned no identified, digested snapshot.');
    else if (!Number.isFinite(snapshot.bytes) || snapshot.bytes <= 0) fail('snapshot-empty', `Snapshot ${snapshot.snapshotId} is empty.`);
    if (failures.length > 0) return rehearsalResult({ failures, steps, environment, databaseId, evidenceId, startedAt, clock, snapshot, damage });

    await damage.apply();
    const damagedSchema = await adapter.fingerprintSchema();
    const damagedInvariants = await adapter.measureInvariants(invariants);
    steps.push({ step: 'damage', description: damage.description, invariants: damagedInvariants });

    // The guard that stops this whole rehearsal from being ceremony. If the destructive step left
    // the database as it found it, the restore that follows proves nothing at all, and a green
    // result here would be worse than no result.
    if (stableCompare(damagedSchema, baselineSchema) && stableCompare(damagedInvariants, baselineInvariants)) {
      fail('damage-ineffective', `"${damage.description}" changed neither the schema nor any invariant, so restoring it proves nothing.`);
      return rehearsalResult({ failures, steps, environment, databaseId, evidenceId, startedAt, clock, snapshot, damage });
    }

    await adapter.restore(snapshot);
    const restoredSchema = await adapter.fingerprintSchema();
    const restoredInvariants = await adapter.measureInvariants(invariants);
    steps.push({ step: 'restore', invariants: restoredInvariants });

    if (!stableCompare(restoredSchema, baselineSchema)) {
      fail('schema-not-restored', 'The restored schema is not the schema that was captured.');
    }
    for (const id of declared) {
      if (!stableCompare(restoredInvariants?.[id], baselineInvariants?.[id])) {
        fail('invariant-not-restored', `${id}: ${JSON.stringify(baselineInvariants?.[id])} before, ${JSON.stringify(restoredInvariants?.[id])} after restore.`);
      }
    }
  } catch (error) {
    // An adapter that throws has not proven recovery. It is never a skip.
    fail('adapter-error', error?.message ?? String(error));
  }

  return rehearsalResult({ failures, steps, environment, databaseId, evidenceId, startedAt, clock, snapshot, damage });
}

function rehearsalResult({ failures, steps, environment, databaseId, evidenceId, startedAt, clock, snapshot, damage }) {
  const verified = failures.length === 0;
  const rehearsedAt = clock().toISOString();
  return {
    verified,
    environment: environment ?? null,
    databaseId: databaseId ?? null,
    startedAt,
    rehearsedAt,
    snapshotId: snapshot?.snapshotId ?? null,
    digest: snapshot?.digest ?? null,
    bytes: snapshot?.bytes ?? null,
    damage: damage?.description ?? null,
    steps,
    failures,
    failureReasons: [...new Set(failures.map((entry) => entry.reason))].sort(),
    // Shaped for `planDataChange`'s `recovery.restoreRehearsal` so evidence flows into the decision
    // rather than being retyped by hand on the way — a rehearsal that has to be transcribed is a
    // rehearsal whose result can be improved in transcription.
    evidence: {
      evidenceId: evidenceId ?? null,
      rehearsedAt,
      snapshotId: snapshot?.snapshotId ?? null,
      verified,
      invariants: steps.find((entry) => entry.step === 'baseline')?.invariants
        ? Object.keys(steps.find((entry) => entry.step === 'baseline').invariants).sort()
        : [],
    },
  };
}
