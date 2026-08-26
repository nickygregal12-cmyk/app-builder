import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_ADAPTER_METHODS,
  RESTORE_REHEARSAL_FAILURES,
  runRestoreRehearsal,
} from '../packages/control-plane/src/data-recovery.js';
import { evaluateDataChangeSafety, planDataChange, dataChangePlanDigest } from '../packages/control-plane/src/data-change.js';

/**
 * These cover the orchestration, not PostgreSQL. `npm run acceptance:data-recovery` proves the
 * whole thing against a real disposable database; this proves the rules that database is judged by,
 * fast enough to sit inside `npm run check` — including the adapters that lie, which are awkward to
 * arrange for real and are exactly the case the rehearsal exists to survive.
 */
function fakeDatabase() {
  return {
    schema: [{ kind: 'column', name: 'public.profiles.display_name' }, { kind: 'rls', name: 'public.profiles', enabled: true }],
    invariants: { 'profile-rows': '4', 'tenant-isolation': '1' },
  };
}

function fakeAdapter(state, { restoreDoes = 'restore' } = {}) {
  let captured = null;
  return {
    async fingerprintSchema() { return structuredClone(state.schema); },
    async measureInvariants(invariants) {
      return Object.fromEntries((invariants ?? []).map((entry) => [entry.id, state.invariants[entry.id] ?? null]));
    },
    async capture() {
      captured = structuredClone(state);
      return { snapshotId: 'snap-1', digest: 'sha256:abc', bytes: 4096 };
    },
    async restore() {
      if (restoreDoes === 'nothing') return;
      state.schema = structuredClone(captured.schema);
      state.invariants = structuredClone(captured.invariants);
    },
  };
}

const INVARIANTS = [
  { id: 'profile-rows', description: 'rows', query: 'select 1' },
  { id: 'tenant-isolation', description: 'isolation', query: 'select 1' },
];

const rehearse = (options) => runRestoreRehearsal({
  environment: 'preview',
  databaseId: 'db-1',
  evidenceId: 'evidence-1',
  invariants: INVARIANTS,
  ...options,
});

const realDamage = (state) => ({
  description: 'truncate memberships and drop a column',
  apply: async () => {
    state.invariants['profile-rows'] = '0';
    state.schema = state.schema.filter((entry) => entry.name !== 'public.profiles.display_name');
  },
});

test('a rehearsal that snapshots, damages and restores is verified', () => runRehearsalHappyPath());

async function runRehearsalHappyPath() {
  const state = fakeDatabase();
  const result = await rehearse({ adapter: fakeAdapter(state), damage: realDamage(state) });
  assert.deepEqual(result.failures, []);
  assert.equal(result.verified, true);
  assert.equal(result.snapshotId, 'snap-1');
  assert.deepEqual(result.evidence, {
    evidenceId: 'evidence-1',
    rehearsedAt: result.rehearsedAt,
    snapshotId: 'snap-1',
    verified: true,
    invariants: ['profile-rows', 'tenant-isolation'],
  });
}

test('a restore that never happened is caught by comparison rather than believed', async () => {
  const state = fakeDatabase();
  const result = await rehearse({ adapter: fakeAdapter(state, { restoreDoes: 'nothing' }), damage: realDamage(state) });
  assert.equal(result.verified, false);
  assert.ok(result.failureReasons.includes('invariant-not-restored'));
  assert.ok(result.failureReasons.includes('schema-not-restored'));
});

test('a restore that returns the rows but not the isolation is not a restore', async () => {
  const state = fakeDatabase();
  const adapter = fakeAdapter(state);
  const damage = {
    description: 'disable row level security',
    apply: async () => {
      // No row moves. Only the thing that made the rows safe to store.
      state.schema = state.schema.map((entry) => (entry.kind === 'rls' ? { ...entry, enabled: false } : entry));
      state.invariants['tenant-isolation'] = '4';
    },
  };
  const partial = {
    ...adapter,
    async restore(snapshot) {
      await adapter.restore(snapshot);
      state.invariants['tenant-isolation'] = '4';
    },
  };
  const result = await rehearse({ adapter: partial, damage });
  assert.equal(result.verified, false);
  assert.deepEqual(result.failureReasons, ['invariant-not-restored']);
  assert.match(result.failures[0].detail, /tenant-isolation/);
});

test('a destructive step that destroys nothing produces no evidence', async () => {
  const state = fakeDatabase();
  const result = await rehearse({
    adapter: fakeAdapter(state),
    damage: { description: 'a select that changes nothing', apply: async () => {} },
  });
  assert.equal(result.verified, false);
  assert.deepEqual(result.failureReasons, ['damage-ineffective']);
});

test('a rehearsal against a database holding nothing proves nothing', async () => {
  const state = fakeDatabase();
  state.invariants = { 'profile-rows': '0', 'tenant-isolation': '0' };
  const result = await rehearse({ adapter: fakeAdapter(state), damage: realDamage(state) });
  assert.equal(result.verified, false);
  assert.deepEqual(result.failureReasons, ['baseline-empty']);
});

test('an empty, unmeasurable or unsnapshotted rehearsal fails rather than passing quietly', async () => {
  const state = fakeDatabase();

  const noInvariants = await rehearse({ adapter: fakeAdapter(state), damage: realDamage(state), invariants: [] });
  assert.deepEqual(noInvariants.failureReasons, ['invariant-undeclared']);

  const unmeasuredState = fakeDatabase();
  const unmeasured = await rehearse({
    adapter: { ...fakeAdapter(unmeasuredState), measureInvariants: async () => ({ 'profile-rows': '4' }) },
    damage: realDamage(unmeasuredState),
  });
  assert.ok(unmeasured.failureReasons.includes('invariant-unmeasured'));

  const emptySnapshotState = fakeDatabase();
  const emptySnapshot = await rehearse({
    adapter: { ...fakeAdapter(emptySnapshotState), capture: async () => ({ snapshotId: 'snap-1', digest: 'sha256:abc', bytes: 0 }) },
    damage: realDamage(emptySnapshotState),
  });
  assert.deepEqual(emptySnapshot.failureReasons, ['snapshot-empty']);

  const noSnapshotState = fakeDatabase();
  const noSnapshot = await rehearse({
    adapter: { ...fakeAdapter(noSnapshotState), capture: async () => ({}) },
    damage: realDamage(noSnapshotState),
  });
  assert.deepEqual(noSnapshot.failureReasons, ['snapshot-not-captured']);
});

test('an adapter that is incomplete or throws is a failure, never a skip', async () => {
  const state = fakeDatabase();
  for (const method of RECOVERY_ADAPTER_METHODS) {
    const adapter = { ...fakeAdapter(state) };
    delete adapter[method];
    const result = await rehearse({ adapter, damage: realDamage(state) });
    assert.equal(result.verified, false, method);
    assert.deepEqual(result.failureReasons, ['adapter-incomplete'], method);
  }

  const throwingState = fakeDatabase();
  const thrown = await rehearse({
    adapter: { ...fakeAdapter(throwingState), restore: async () => { throw new Error('connection reset'); } },
    damage: realDamage(throwingState),
  });
  assert.equal(thrown.verified, false);
  assert.deepEqual(thrown.failureReasons, ['adapter-error']);

  const undescribed = await rehearse({ adapter: fakeAdapter(state), damage: { apply: async () => {} } });
  assert.deepEqual(undescribed.failureReasons, ['adapter-incomplete']);
});

test('every failure reason a rehearsal can report is a declared one', async () => {
  const state = fakeDatabase();
  const results = [
    await rehearse({ adapter: fakeAdapter(state, { restoreDoes: 'nothing' }), damage: realDamage(state) }),
    await rehearse({ adapter: fakeAdapter(fakeDatabase()), damage: { description: 'nothing', apply: async () => {} } }),
    await rehearse({ adapter: {}, damage: { description: 'nothing', apply: async () => {} } }),
  ];
  for (const result of results) {
    for (const failure of result.failures) {
      assert.ok(RESTORE_REHEARSAL_FAILURES.includes(failure.reason), `undeclared failure: ${failure.reason}`);
    }
  }
});

test('rehearsal evidence is the shape the safety contract consumes, and a failed one is refused', async () => {
  const state = fakeDatabase();
  const verified = await rehearse({ adapter: fakeAdapter(state), damage: realDamage(state) });
  const failedState = fakeDatabase();
  const failed = await rehearse({
    adapter: fakeAdapter(failedState, { restoreDoes: 'nothing' }),
    damage: realDamage(failedState),
  });

  const decide = (rehearsal) => {
    const base = {
      id: '20260826150000_drop_display_name',
      proposedBy: 'implementation-agent',
      sql: 'alter table public.profiles drop column display_name;',
      target: { environment: 'production', databaseId: 'db-prod-1' },
      impact: { rowsAffected: 4 },
      recovery: {
        snapshotId: rehearsal.snapshotId,
        environment: 'production',
        databaseId: 'db-prod-1',
        capturedAt: rehearsal.rehearsedAt,
        digest: rehearsal.digest ?? 'sha256:abc',
        restoreRehearsal: rehearsal.evidence,
      },
      rollback: { strategy: 'forward-repair', detail: 'Re-add from the snapshot export.' },
      preconditions: ['npm run acceptance:data-recovery'],
      verification: ['profile count unchanged'],
      onVerificationFailure: 'halt and restore',
    };
    const digest = dataChangePlanDigest(planDataChange(base));
    return evaluateDataChangeSafety({
      plan: planDataChange({
        ...base,
        approvals: [{ approvalId: 'a1', environment: 'production', grantedBy: 'nicky', expiresAt: new Date(Date.parse(rehearsal.rehearsedAt) + 3600_000).toISOString(), planDigest: digest }],
      }),
      runtime: { environment: 'production', databaseId: 'db-prod-1' },
      now: new Date(rehearsal.rehearsedAt),
    });
  };

  assert.equal(decide(verified).allowed, true, JSON.stringify(decide(verified).refusals));
  const refused = decide(failed);
  assert.equal(refused.allowed, false);
  assert.ok(refused.refusalReasons.includes('restore-unproven'));
});
