import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_CHANGE_CLASSES,
  DATA_CHANGE_REFUSALS,
  DEFAULT_MAX_RECOVERY_AGE_MS,
  DEFAULT_MAX_RESTORE_REHEARSAL_AGE_MS,
  classifySqlStatement,
  dataChangePlanDigest,
  dataChangeRequirements,
  evaluateDataChangeSafety,
  planDataChange,
  splitSqlStatements,
} from '../packages/control-plane/src/data-change.js';

const NOW = new Date('2026-08-26T12:00:00.000Z');
const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A production change that satisfies every requirement. Each unsafe case below is this plan with
 * exactly one fact removed or corrupted, so a test that fails names the missing guard rather than
 * a difference of ten fields.
 */
function safeProductionInput(overrides = {}) {
  const base = {
    id: '20260826120000_drop_legacy_nickname',
    proposedBy: 'implementation-agent',
    sql: 'alter table public.profiles drop column legacy_nickname;',
    target: { environment: 'production', databaseId: 'db-prod-1' },
    expectedPreviousMigrations: ['20260101000000_initial'],
    impact: { rowsAffected: 4120, tables: ['public.profiles'], measuredAt: iso(-10 * MINUTE) },
    recovery: {
      snapshotId: 'snap-2026-08-26-1130',
      environment: 'production',
      databaseId: 'db-prod-1',
      capturedAt: iso(-30 * MINUTE),
      digest: 'sha256:aaaa',
      restoreRehearsal: {
        evidenceId: 'restore-rehearsal-2026-08-20',
        rehearsedAt: iso(-6 * DAY),
        snapshotId: 'snap-2026-08-26-1130',
        verified: true,
        invariants: ['profile row count', 'organisation membership integrity'],
      },
    },
    rollback: { strategy: 'forward-repair', detail: 'Re-add the column from the snapshot export.' },
    preconditions: ['npm run check', 'pgTAP RLS acceptance'],
    verification: ['profile count unchanged', 'no orphaned memberships'],
    onVerificationFailure: 'halt and restore snap-2026-08-26-1130',
    approvals: [],
    ...overrides,
  };
  const digest = dataChangePlanDigest(planDataChange({ ...base, approvals: [] }));
  return {
    ...base,
    approvals: overrides.approvals ?? [{
      approvalId: 'approval-1',
      environment: 'production',
      grantedBy: 'nicky',
      expiresAt: iso(2 * HOUR),
      planDigest: digest,
    }],
  };
}

const runtime = { environment: 'production', databaseId: 'db-prod-1', appliedMigrations: ['20260101000000_initial'] };
const registry = { development: { databaseIds: ['db-dev-1'] }, preview: { databaseIds: ['db-preview-1'] }, production: { databaseIds: ['db-prod-1'] } };

const evaluate = (input, options = {}) => evaluateDataChangeSafety({
  plan: planDataChange(input),
  runtime,
  environmentRegistry: registry,
  now: NOW,
  ...options,
});

test('statement splitting survives the punctuation that hides a destructive statement', () => {
  const sql = `
    -- drop table public.decoy;
    /* nested /* comment */ with drop table public.decoy2; */
    insert into public.notes (body) values ('a semicolon; inside a literal');
    create function public.touch() returns trigger language plpgsql as $$
      begin
        new.updated_at = now();
        return new;
      end;
    $$;
    drop table public.legacy;
  `;
  const statements = splitSqlStatements(sql);
  assert.equal(statements.length, 3, `unexpected split: ${JSON.stringify(statements, null, 2)}`);
  assert.match(statements[0], /^insert into/);
  assert.match(statements[1], /^create function/);
  assert.match(statements[2], /^drop table public\.legacy$/);
  // The commented-out drops must not have become statements of their own.
  assert.ok(!statements.some((entry) => entry.includes('decoy')));
});

test('every classification is a declared class and every refusal a declared reason', () => {
  const samples = [
    'create table public.a (id uuid primary key)',
    'update public.a set id = id',
    'alter table public.a rename to b',
    'alter table public.a set not null',
    'drop table public.a',
    'vacuum full public.a',
  ];
  for (const statement of samples) {
    assert.ok(DATA_CHANGE_CLASSES.includes(classifySqlStatement(statement).class), statement);
  }
  const refused = evaluate({ ...safeProductionInput(), approvals: [] });
  for (const entry of refused.refusals) {
    assert.ok(DATA_CHANGE_REFUSALS.includes(entry.reason), `undeclared refusal: ${entry.reason}`);
  }
});

test('data-losing statement shapes are classified as such, not as the alter table they resemble', () => {
  const expectations = [
    ['alter table public.profiles drop column legacy_nickname', 'destructive', 'drop-column'],
    ['alter table public.profiles add column nickname text', 'additive', 'add-column'],
    ['alter table public.profiles add column nickname text not null', 'narrowing', 'add-not-null-column'],
    ['alter table public.profiles add column nickname text not null default \'\'', 'additive', 'add-column'],
    ['alter table public.profiles alter column nickname set not null', 'narrowing', 'set-not-null'],
    ['alter table public.profiles alter column nickname drop not null', 'additive', 'relax-column'],
    ['alter table public.profiles alter column nickname type varchar(20)', 'narrowing', 'alter-column-type'],
    ['alter table public.profiles rename column nickname to handle', 'contract', 'rename'],
    ['alter table public.profiles disable row level security', 'destructive', 'disable-rls'],
    ['alter table public.profiles enable row level security', 'additive', 'enable-rls'],
    ['drop policy profiles_self_read on public.profiles', 'destructive', 'drop-policy'],
    ['create policy profiles_self_read on public.profiles for select using (true)', 'additive', 'create-routine'],
    ['truncate public.audit_log', 'destructive', 'truncate'],
    ['delete from public.audit_log', 'destructive', 'delete-unbounded'],
    ['delete from public.audit_log where created_at < now()', 'destructive', 'delete'],
    ['create unique index profiles_email_key on public.profiles (email)', 'narrowing', 'add-unique-index'],
    ['create index profiles_email_idx on public.profiles (email)', 'additive', 'create-object'],
    ['update public.profiles set handle = nickname', 'backfill', 'update'],
  ];
  for (const [statement, expectedClass, expectedOperation] of expectations) {
    const result = classifySqlStatement(statement);
    assert.equal(result.class, expectedClass, `${statement} -> ${result.class}`);
    assert.equal(result.operation, expectedOperation, statement);
  }
});

test('an unreadable statement is a refusal rather than an assumption of safety', () => {
  const result = classifySqlStatement('do $$ begin perform public.nuke(); end $$');
  assert.equal(result.class, 'unclassified');
  const refused = evaluate({ ...safeProductionInput(), sql: 'do $$ begin perform public.nuke(); end $$;' });
  assert.equal(refused.allowed, false);
  assert.ok(refused.refusalReasons.includes('statement-unclassified'));
});

test('a plan is classified by its worst statement, never by its majority', () => {
  const plan = planDataChange({
    id: 'm1',
    target: { environment: 'preview', databaseId: 'db-preview-1' },
    sql: [
      'create table public.a (id uuid primary key);',
      'create index a_id_idx on public.a (id);',
      'alter table public.b drop column secret;',
      'grant select on public.a to authenticated;',
    ].join('\n'),
  });
  assert.equal(plan.classification, 'destructive');
});

test('a fully evidenced production change is allowed — the gate is not simply always closed', () => {
  const result = evaluate(safeProductionInput());
  assert.deepEqual(result.refusals, []);
  assert.equal(result.allowed, true);
  assert.equal(result.classification, 'destructive');
});

test('an additive development change needs no snapshot, and an additive production change still needs approval', () => {
  const additive = {
    id: '20260826130000_add_nickname',
    proposedBy: 'implementation-agent',
    sql: 'alter table public.profiles add column nickname text;',
    target: { environment: 'development', databaseId: 'db-dev-1' },
  };
  const development = evaluate(additive, {
    plan: planDataChange(additive),
    runtime: { environment: 'development', databaseId: 'db-dev-1' },
  });
  assert.equal(development.allowed, true, JSON.stringify(development.refusals));

  const productionInput = { ...additive, target: { environment: 'production', databaseId: 'db-prod-1' } };
  const production = evaluateDataChangeSafety({
    plan: planDataChange(productionInput),
    runtime,
    environmentRegistry: registry,
    now: NOW,
  });
  assert.equal(production.allowed, false);
  assert.deepEqual(production.refusalReasons, ['approval-missing', 'rollback-plan-missing']);
});

test('unsafe production changes are refused, each for its own named reason', () => {
  const cases = [
    ['recovery evidence absent', { recovery: null }, 'recovery-evidence-missing'],
    ['a backup recorded but never restored', {
      recovery: { ...safeProductionInput().recovery, restoreRehearsal: null },
    }, 'restore-unproven'],
    ['a rehearsal that says it happened without verifying anything', {
      recovery: {
        ...safeProductionInput().recovery,
        restoreRehearsal: { ...safeProductionInput().recovery.restoreRehearsal, verified: false },
      },
    }, 'restore-unproven'],
    ['a rehearsal of some other snapshot', {
      recovery: {
        ...safeProductionInput().recovery,
        restoreRehearsal: { ...safeProductionInput().recovery.restoreRehearsal, snapshotId: 'snap-unrelated' },
      },
    }, 'restore-rehearsal-mismatched'],
    ['a snapshot older than the recovery window', {
      recovery: { ...safeProductionInput().recovery, capturedAt: iso(-3 * DAY) },
    }, 'recovery-evidence-stale'],
    ['a snapshot taken from a different database', {
      recovery: { ...safeProductionInput().recovery, databaseId: 'db-preview-1' },
    }, 'recovery-evidence-mismatched'],
    ['nobody measured what the change touches', { impact: { rowsAffected: null } }, 'impact-unknown'],
    ['no statement of how the change is reversed', { rollback: null }, 'rollback-plan-missing'],
    ['no checks named before the mutation', { preconditions: [] }, 'precondition-missing'],
    ['no checks named after it', { verification: [] }, 'verification-missing'],
    ['no answer for a failed verification', { onVerificationFailure: null }, 'verification-failure-response-missing'],
    ['no approval at all', { approvals: [] }, 'approval-missing'],
    ['a migration nobody can identify', { id: null }, 'plan-identity-missing'],
    ['a plan that does not name its database', { target: { environment: 'production', databaseId: null } }, 'target-database-unidentified'],
    ['an environment outside the vocabulary', { target: { environment: 'staging', databaseId: 'db-prod-1' } }, 'target-environment-unknown'],
  ];

  for (const [label, override, expected] of cases) {
    const result = evaluate(safeProductionInput(override));
    assert.equal(result.allowed, false, `${label} was allowed`);
    assert.ok(result.refusalReasons.includes(expected), `${label}: expected ${expected}, got ${result.refusalReasons.join(', ')}`);
  }
});

test('a plan aimed at the wrong environment is refused even when the executor agrees with it', () => {
  // The plan and the executor both say "preview". The registry says the database they both name
  // is production. Two parties agreeing is not the same as either of them being right.
  const input = {
    id: '20260826140000_backfill',
    proposedBy: 'implementation-agent',
    sql: 'update public.profiles set handle = nickname;',
    target: { environment: 'preview', databaseId: 'db-prod-1' },
    impact: { rowsAffected: 10 },
    rollback: { strategy: 'forward-repair', detail: 'Re-run from snapshot export.' },
    verification: ['handle populated'],
    onVerificationFailure: 'halt',
  };
  const result = evaluateDataChangeSafety({
    plan: planDataChange(input),
    runtime: { environment: 'preview', databaseId: 'db-prod-1' },
    environmentRegistry: registry,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.refusalReasons.includes('environment-database-mismatch'));
});

test('a plan applied somewhere other than where it was planned is refused', () => {
  const result = evaluateDataChangeSafety({
    plan: planDataChange(safeProductionInput({ target: { environment: 'preview', databaseId: 'db-preview-1' } })),
    runtime,
    environmentRegistry: registry,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.refusalReasons.includes('runtime-environment-mismatch'));
  assert.ok(result.refusalReasons.includes('runtime-database-mismatch'));
});

test('migration sequence drift is refused in all three directions', () => {
  const behind = evaluateDataChangeSafety({
    plan: planDataChange(safeProductionInput()),
    runtime: { ...runtime, appliedMigrations: [] },
    environmentRegistry: registry,
    now: NOW,
  });
  assert.ok(behind.refusalReasons.includes('migration-sequence-drift'), 'target missing an expected migration');

  const ahead = evaluateDataChangeSafety({
    plan: planDataChange(safeProductionInput()),
    runtime: { ...runtime, appliedMigrations: [...runtime.appliedMigrations, '20260201000000_unknown'] },
    environmentRegistry: registry,
    now: NOW,
  });
  assert.ok(ahead.refusalReasons.includes('migration-sequence-drift'), 'target carries an unexpected migration');

  const replay = evaluateDataChangeSafety({
    plan: planDataChange(safeProductionInput()),
    runtime: { ...runtime, appliedMigrations: [...runtime.appliedMigrations, safeProductionInput().id] },
    environmentRegistry: registry,
    now: NOW,
  });
  assert.ok(replay.refusalReasons.includes('migration-sequence-drift'), 'migration already applied');
});

test('an approval binds to the statements that were approved', () => {
  const approved = safeProductionInput();
  // The approval is issued against the reviewed plan; the statements are then swapped for a
  // destructive one the approver never saw.
  const swapped = { ...approved, sql: 'drop table public.profiles;' };
  const result = evaluate(swapped);
  assert.equal(result.allowed, false);
  assert.ok(result.refusalReasons.includes('approval-plan-mismatch'));

  const expired = evaluate(safeProductionInput({
    approvals: [{ ...approved.approvals[0], expiresAt: iso(-MINUTE) }],
  }));
  assert.ok(expired.refusalReasons.includes('approval-expired'));

  const wrongEnvironment = evaluate(safeProductionInput({
    approvals: [{ ...approved.approvals[0], environment: 'preview' }],
  }));
  assert.ok(wrongEnvironment.refusalReasons.includes('approval-environment-mismatch'));
});

test('the proposer cannot be the only approver of its own production change', () => {
  const approved = safeProductionInput();
  const selfApproved = evaluate(safeProductionInput({
    approvals: [{ ...approved.approvals[0], grantedBy: 'implementation-agent' }],
  }));
  assert.equal(selfApproved.allowed, false);
  assert.ok(selfApproved.refusalReasons.includes('approval-self-issued'));

  // A second, independent approval on the same plan clears it.
  const countersigned = evaluate(safeProductionInput({
    approvals: [
      { ...approved.approvals[0], approvalId: 'approval-self', grantedBy: 'implementation-agent' },
      approved.approvals[0],
    ],
  }));
  assert.equal(countersigned.allowed, true, JSON.stringify(countersigned.refusals));
});

test('the plan digest ignores recapture and re-approval but not a change of substance', () => {
  const base = planDataChange(safeProductionInput());
  const recaptured = planDataChange(safeProductionInput({
    recovery: { ...safeProductionInput().recovery, snapshotId: 'snap-later', capturedAt: iso(-MINUTE) },
  }));
  assert.equal(recaptured.digest, base.digest, 'a fresher snapshot must not invalidate an approval');

  const reordered = planDataChange(safeProductionInput({
    sql: 'alter table public.profiles add column handle text;\nalter table public.profiles drop column legacy_nickname;',
  }));
  assert.notEqual(reordered.digest, base.digest);

  const retargeted = planDataChange(safeProductionInput({ target: { environment: 'preview', databaseId: 'db-preview-1' } }));
  assert.notEqual(retargeted.digest, base.digest, 'retargeting a change must invalidate its approval');
});

test('requirements tighten with class and environment rather than being one fixed list', () => {
  assert.equal(dataChangeRequirements('additive', 'development').recovery, false);
  assert.equal(dataChangeRequirements('destructive', 'development').recovery, false);
  assert.equal(dataChangeRequirements('destructive', 'preview').recovery, true);
  assert.equal(dataChangeRequirements('destructive', 'preview').restoreRehearsal, false);
  assert.equal(dataChangeRequirements('destructive', 'production').restoreRehearsal, true);
  assert.equal(dataChangeRequirements('additive', 'production').approval, true);
  // A narrowing or contract step is as unrecoverable as a drop even though it loses no row
  // outright: the first rejects data that already exists, the second removes the compatibility a
  // rollback would need. Both carry the recovery burden.
  for (const classification of ['narrowing', 'contract']) {
    assert.equal(dataChangeRequirements(classification, 'production').recovery, true, classification);
    assert.equal(dataChangeRequirements(classification, 'production').restoreRehearsal, true, classification);
    assert.equal(dataChangeRequirements(classification, 'production').rollback, true, classification);
    assert.equal(dataChangeRequirements(classification, 'preview').recovery, true, classification);
  }
  assert.equal(dataChangeRequirements('backfill', 'preview').impact, true);
  assert.equal(dataChangeRequirements('additive', 'preview').impact, false);
});

test('the plan digest is canonical: the same plan digests the same however its keys are ordered', () => {
  // The digest an approval binds to has to be a function of what the plan *says*, not of the order
  // its fields happened to be assembled in. `dataChangePlanDigest` is exported and can be handed a
  // plan from anywhere, so this asserts the property directly rather than through `planDataChange`,
  // which normalises key order on the way past and would hide the difference.
  const target = { environment: 'production', databaseId: 'db-prod-1' };
  const forwards = { id: 'm1', target, statements: [{ statement: 'drop table public.a' }] };
  const reversed = {
    statements: [{ statement: 'drop table public.a' }],
    target: { databaseId: 'db-prod-1', environment: 'production' },
    id: 'm1',
  };
  assert.equal(dataChangePlanDigest(reversed), dataChangePlanDigest(forwards));

  // And it still distinguishes plans that differ, so order-independence has not become
  // everything-independence.
  assert.notEqual(dataChangePlanDigest({ ...forwards, id: 'm2' }), dataChangePlanDigest(forwards));
  assert.notEqual(
    dataChangePlanDigest({ ...forwards, target: { environment: 'preview', databaseId: 'db-prod-1' } }),
    dataChangePlanDigest(forwards),
  );
  assert.notEqual(
    dataChangePlanDigest({ ...forwards, statements: [{ statement: 'drop table public.b' }] }),
    dataChangePlanDigest(forwards),
  );
  // A plan that names nothing still digests rather than throwing: the identity check is a refusal,
  // not a crash.
  assert.match(dataChangePlanDigest({ id: null, target: null, statements: [] }), /^[0-9a-f]{64}$/);
});

test('an empty statement list falls back to the SQL rather than becoming an empty plan', () => {
  const plan = planDataChange({
    ...safeProductionInput(),
    statements: [],
    sql: 'alter table public.profiles drop column legacy_nickname;',
  });
  assert.equal(plan.statements.length, 1);
  assert.equal(plan.classification, 'destructive');
});

test('a backfill must still say what proves it worked, and what happens when that fails', () => {
  // A backfill is reversible in principle and rewrites rows in practice. Requirements that keyed
  // only off irreversibility would let it run with nothing to check afterwards.
  const backfill = {
    id: '20260826160000_backfill_handles',
    proposedBy: 'implementation-agent',
    sql: 'update public.profiles set handle = nickname;',
    target: { environment: 'preview', databaseId: 'db-preview-1' },
    impact: { rowsAffected: 4120 },
    rollback: { strategy: 'forward-repair', detail: 'Re-run from the snapshot export.' },
  };
  const bare = evaluateDataChangeSafety({
    plan: planDataChange(backfill),
    runtime: { environment: 'preview', databaseId: 'db-preview-1' },
    environmentRegistry: registry,
    now: NOW,
  });
  assert.equal(bare.allowed, false);
  assert.ok(bare.refusalReasons.includes('verification-missing'));
  assert.ok(bare.refusalReasons.includes('verification-failure-response-missing'));

  const complete = evaluateDataChangeSafety({
    plan: planDataChange({ ...backfill, verification: ['handle populated for every row'], onVerificationFailure: 'halt' }),
    runtime: { environment: 'preview', databaseId: 'db-preview-1' },
    environmentRegistry: registry,
    now: NOW,
  });
  assert.equal(complete.allowed, true, JSON.stringify(complete.refusals));
});

test('recovery evidence is refused for each missing part separately, not only when it is absent', () => {
  const complete = safeProductionInput().recovery;
  for (const missing of ['snapshotId', 'digest', 'capturedAt']) {
    const result = evaluate(safeProductionInput({ recovery: { ...complete, [missing]: null } }));
    assert.equal(result.allowed, false, missing);
    assert.ok(result.refusalReasons.includes('recovery-evidence-missing'), `${missing}: ${result.refusalReasons.join(', ')}`);
  }
});

test('every age and expiry boundary is closed at the instant it names', () => {
  // A window that is generous by one millisecond is a window somebody can sit on. Each of these
  // asserts the last acceptable moment and the first unacceptable one, so widening any comparison
  // fails here rather than in a production migration.
  const recovery = safeProductionInput().recovery;

  const atLimit = evaluate(safeProductionInput({ recovery: { ...recovery, capturedAt: iso(-DEFAULT_MAX_RECOVERY_AGE_MS) } }));
  assert.equal(atLimit.allowed, true, `a snapshot exactly at the limit is still current: ${atLimit.refusalReasons.join(', ')}`);
  const pastLimit = evaluate(safeProductionInput({ recovery: { ...recovery, capturedAt: iso(-DEFAULT_MAX_RECOVERY_AGE_MS - 1) } }));
  assert.ok(pastLimit.refusalReasons.includes('recovery-evidence-stale'));

  const rehearsal = recovery.restoreRehearsal;
  const rehearsalAtLimit = evaluate(safeProductionInput({
    recovery: { ...recovery, restoreRehearsal: { ...rehearsal, rehearsedAt: iso(-DEFAULT_MAX_RESTORE_REHEARSAL_AGE_MS) } },
  }));
  assert.equal(rehearsalAtLimit.allowed, true, rehearsalAtLimit.refusalReasons.join(', '));
  const rehearsalPastLimit = evaluate(safeProductionInput({
    recovery: { ...recovery, restoreRehearsal: { ...rehearsal, rehearsedAt: iso(-DEFAULT_MAX_RESTORE_REHEARSAL_AGE_MS - 1) } },
  }));
  assert.ok(rehearsalPastLimit.refusalReasons.includes('restore-unproven'));

  // A clock that has run ahead is tolerated to a point and no further, because a snapshot that
  // claims the future has not been taken yet.
  const slightlyAhead = evaluate(safeProductionInput({ recovery: { ...recovery, capturedAt: iso(60_000) } }));
  assert.equal(slightlyAhead.allowed, true, slightlyAhead.refusalReasons.join(', '));
  const clearlyAhead = evaluate(safeProductionInput({ recovery: { ...recovery, capturedAt: iso(60_001) } }));
  assert.ok(clearlyAhead.refusalReasons.includes('recovery-evidence-mismatched'));

  // An approval is spent at its stated instant.
  const approval = safeProductionInput().approvals[0];
  const live = evaluate(safeProductionInput({ approvals: [{ ...approval, expiresAt: iso(1) }] }));
  assert.equal(live.allowed, true, live.refusalReasons.join(', '));
  const lapsed = evaluate(safeProductionInput({ approvals: [{ ...approval, expiresAt: NOW.toISOString() }] }));
  assert.ok(lapsed.refusalReasons.includes('approval-expired'));
});

test('an empty plan is refused rather than trivially allowed', () => {
  const result = evaluateDataChangeSafety({
    plan: planDataChange({ id: 'm1', sql: '-- nothing to do\n', target: { environment: 'production', databaseId: 'db-prod-1' } }),
    runtime,
    now: NOW,
  });
  assert.equal(result.allowed, false);
  assert.ok(result.refusalReasons.includes('plan-empty'));
});
