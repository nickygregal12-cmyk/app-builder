/**
 * Stage Q12 — the executable half of the production data-change safety contract.
 *
 * Executed RLS acceptance proves tenant isolation. It says nothing about whether a migration is
 * safe to run against data someone depends on, and "the schema tests passed" has never been an
 * answer to "can we get the rows back". This module is the answer to the second question, and it
 * is deliberately a pure function of declared facts: no database connection, no provider, no
 * model. A proposal is refused here, before anything is dispatched, or it is not refused at all.
 *
 * Ten questions have to be answerable before a serious mutation runs — what changes, against
 * which environment, whether it is destructive, what data it touches, what snapshot exists, how
 * restore was proven, what runs first, who approved, what proves success afterwards and what
 * happens when that proof fails. Each of them is a named refusal below rather than a paragraph in
 * a runbook, because a runbook cannot fail closed.
 *
 * The `classification` half is a SQL reader, not a SQL parser. It recognises the statement shapes
 * that lose data and refuses to guess at anything else: an unrecognised statement is
 * `unclassified`, which is a refusal rather than a shrug. A classifier that assumes the statements
 * it does not understand are harmless is how a `drop table` ships as an additive change.
 *
 * Approval reuses the existing boundary rather than inventing a second one. `capabilities.js`
 * decides whether an attempt may invoke a mutating operation at all; this decides whether the
 * specific change it wants to make is recoverable and approved. Both are deny-by-default and
 * neither is a prompt asking the model to be careful.
 */

import { createHash } from 'node:crypto';

/** Environments a plan may target. Same vocabulary as a capability grant, deliberately. */
export const DATA_CHANGE_ENVIRONMENTS = Object.freeze(['development', 'preview', 'production']);

/**
 * What a statement does to data that already exists.
 *
 * `contract` is the expand/contract vocabulary: a step that removes the compatibility the previous
 * deployment relied on. It is not destructive of rows, but it is destructive of the ability to roll
 * the application back, so it carries recovery requirements of its own.
 */
export const DATA_CHANGE_CLASSES = Object.freeze([
  'additive',
  'backfill',
  'contract',
  'narrowing',
  'destructive',
  'unclassified',
]);

/** Ordered least to most dangerous. A plan is classified by its worst statement, never its average. */
const CLASS_ORDER = Object.freeze(['additive', 'backfill', 'contract', 'narrowing', 'destructive', 'unclassified']);

/**
 * Every reason a data change can be refused. A refusal is always one of these; there is no
 * unnamed "unsafe" and no default-allow branch.
 */
export const DATA_CHANGE_REFUSALS = Object.freeze([
  'plan-empty',
  'plan-identity-missing',
  'statement-unclassified',
  'target-environment-unknown',
  'target-database-unidentified',
  'runtime-environment-mismatch',
  'runtime-database-mismatch',
  'environment-database-mismatch',
  'migration-sequence-drift',
  'impact-unknown',
  'recovery-evidence-missing',
  'recovery-evidence-mismatched',
  'recovery-evidence-stale',
  'restore-unproven',
  'restore-rehearsal-mismatched',
  'rollback-plan-missing',
  'precondition-missing',
  'verification-missing',
  'verification-failure-response-missing',
  'approval-missing',
  'approval-expired',
  'approval-environment-mismatch',
  'approval-plan-mismatch',
  'approval-self-issued',
]);

/**
 * How old a snapshot may be when the change runs. A snapshot taken last week is a snapshot of
 * data that no longer exists; restoring it is a second data-loss event, not a recovery.
 */
export const DEFAULT_MAX_RECOVERY_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * How long a restore rehearsal stays evidence. Restore is proven by having been performed, and a
 * rehearsal against a schema six months out of date proves the old schema was recoverable.
 */
export const DEFAULT_MAX_RESTORE_REHEARSAL_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function text(value) {
  const candidate = String(value ?? '').trim();
  return candidate === '' ? null : candidate;
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

function worstClass(classes) {
  let worst = 'additive';
  for (const candidate of classes) {
    if (CLASS_ORDER.indexOf(candidate) > CLASS_ORDER.indexOf(worst)) worst = candidate;
  }
  return worst;
}

/**
 * Split a migration into statements.
 *
 * Semicolons inside string literals, quoted identifiers, dollar-quoted function bodies and
 * comments are not statement boundaries. A splitter that thinks they are will cut a trigger
 * function in half and then classify both halves as unrecognised — or worse, classify the half
 * containing `drop` as belonging to a statement that never existed.
 */
export function splitSqlStatements(sql) {
  const source = String(sql ?? '');
  const statements = [];
  let current = '';
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const pair = source.slice(index, index + 2);

    if (pair === '--') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (pair === '/*') {
      // Postgres block comments nest, so counting depth is the only correct scan.
      let depth = 1;
      let cursor = index + 2;
      while (cursor < source.length && depth > 0) {
        const window = source.slice(cursor, cursor + 2);
        if (window === '/*') { depth += 1; cursor += 2; continue; }
        if (window === '*/') { depth -= 1; cursor += 2; continue; }
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    if (character === "'" || character === '"') {
      const quote = character;
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === quote) {
          if (source[cursor + 1] === quote) { cursor += 2; continue; }
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      current += source.slice(index, cursor);
      index = cursor;
      continue;
    }
    if (character === '$') {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(source.slice(index));
      if (tag) {
        const closing = source.indexOf(tag[0], index + tag[0].length);
        const end = closing === -1 ? source.length : closing + tag[0].length;
        current += source.slice(index, end);
        index = end;
        continue;
      }
    }
    if (character === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Collapse whitespace and case so the shape matchers below read as one line. */
function normalizedStatement(statement) {
  return String(statement ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Statement shapes, most dangerous first. Order matters: `alter table ... drop column` must be
 * matched as a drop before the generic `alter table` shapes get a chance to call it additive.
 *
 * Every entry carries the reason it is classified that way, because a refusal a human cannot act
 * on is a refusal they will route around.
 */
const STATEMENT_SHAPES = Object.freeze([
  { pattern: /^drop\s+(table|schema|database|type|sequence|materialized\s+view|view)\b/, class: 'destructive', operation: 'drop-object', reason: 'Drops an object and every row in it.' },
  { pattern: /^alter\s+table\b.*\bdrop\s+(column|constraint)\b/, class: 'destructive', operation: 'drop-column', reason: 'Drops a column and the values stored in it.' },
  { pattern: /^truncate\b/, class: 'destructive', operation: 'truncate', reason: 'Removes every row without a predicate.' },
  { pattern: /^delete\s+from\b(?!.*\bwhere\b)/, class: 'destructive', operation: 'delete-unbounded', reason: 'Deletes every row: no where clause.' },
  { pattern: /^delete\s+from\b/, class: 'destructive', operation: 'delete', reason: 'Deletes existing rows.' },
  // A dropped policy or disabled RLS does not lose a row; it loses the isolation that made the
  // rows safe to store. Same recovery burden, different failure.
  { pattern: /^drop\s+policy\b/, class: 'destructive', operation: 'drop-policy', reason: 'Removes a row-level security policy.' },
  { pattern: /^alter\s+table\b.*\bdisable\s+row\s+level\s+security\b/, class: 'destructive', operation: 'disable-rls', reason: 'Disables row-level security on a table.' },
  { pattern: /^drop\s+(index|trigger|function|extension)\b/, class: 'contract', operation: 'drop-support-object', reason: 'Removes an object the deployed code may still depend on.' },

  // Type changes are classified as narrowing on purpose. Deciding that `text -> varchar(255)` is
  // safe requires knowing the longest value in the column, which is a fact about the data rather
  // than about the statement. The plan supplies that fact; the classifier does not invent it.
  { pattern: /^alter\s+table\b.*\balter\s+(column\s+)?\S+\s+(set\s+data\s+)?type\b/, class: 'narrowing', operation: 'alter-column-type', reason: 'Changes a column type: existing rows may not fit.' },
  { pattern: /^alter\s+table\b.*\bset\s+not\s+null\b/, class: 'narrowing', operation: 'set-not-null', reason: 'Rejects rows that are currently null.' },
  { pattern: /^alter\s+table\b.*\badd\s+column\b.*\bnot\s+null\b(?!.*\bdefault\b)/, class: 'narrowing', operation: 'add-not-null-column', reason: 'Adds a not-null column with no default: fails on a non-empty table.' },
  { pattern: /^alter\s+table\b.*\badd\s+constraint\b.*\b(check|foreign\s+key|unique)\b/, class: 'narrowing', operation: 'add-constraint', reason: 'Rejects rows that do not already satisfy the constraint.' },
  { pattern: /^create\s+unique\s+index\b/, class: 'narrowing', operation: 'add-unique-index', reason: 'Fails when existing rows already collide.' },

  { pattern: /^alter\s+table\b.*\brename\b/, class: 'contract', operation: 'rename', reason: 'Renames a name the deployed code still uses.' },
  { pattern: /^alter\s+table\b.*\balter\s+(column\s+)?\S+\s+drop\s+default\b/, class: 'contract', operation: 'drop-default', reason: 'Removes a default the deployed code relies on.' },
  { pattern: /^revoke\b/, class: 'contract', operation: 'revoke', reason: 'Removes a grant the deployed code may hold.' },

  { pattern: /^update\b/, class: 'backfill', operation: 'update', reason: 'Rewrites values in existing rows.' },
  { pattern: /^insert\s+into\b/, class: 'backfill', operation: 'insert', reason: 'Writes new rows.' },

  { pattern: /^create\s+(table|schema|type|sequence|index|view|materialized\s+view|extension|trigger)\b/, class: 'additive', operation: 'create-object', reason: 'Creates a new object.' },
  { pattern: /^create\s+(or\s+replace\s+)?(function|procedure|policy)\b/, class: 'additive', operation: 'create-routine', reason: 'Creates or replaces a routine or policy.' },
  { pattern: /^alter\s+table\b.*\badd\s+column\b/, class: 'additive', operation: 'add-column', reason: 'Adds a nullable or defaulted column.' },
  { pattern: /^alter\s+table\b.*\benable\s+row\s+level\s+security\b/, class: 'additive', operation: 'enable-rls', reason: 'Enables row-level security.' },
  { pattern: /^alter\s+table\b.*\balter\s+(column\s+)?\S+\s+(set\s+default|drop\s+not\s+null)\b/, class: 'additive', operation: 'relax-column', reason: 'Relaxes a column: no existing row can fail it.' },
  { pattern: /^(grant|comment\s+on)\b/, class: 'additive', operation: 'grant', reason: 'Adds a grant or a comment.' },
]);

/**
 * Classify one statement.
 *
 * Returns `unclassified` rather than a guess when no shape matches. `unclassified` is a refusal
 * reason further down, so an unrecognised statement stops the change instead of riding along with
 * the recognised ones.
 */
export function classifySqlStatement(statement) {
  const raw = text(statement);
  if (!raw) return { class: 'unclassified', operation: null, reason: 'Empty statement.', statement: '' };
  const normalized = normalizedStatement(raw);
  for (const shape of STATEMENT_SHAPES) {
    if (shape.pattern.test(normalized)) {
      return { class: shape.class, operation: shape.operation, reason: shape.reason, statement: raw };
    }
  }
  return {
    class: 'unclassified',
    operation: null,
    reason: 'No known statement shape matched. An unread statement is not a safe statement.',
    statement: raw,
  };
}

/**
 * Read a proposed change into a normalised, classified plan.
 *
 * This never decides whether the change may run — `evaluateDataChangeSafety` does that. Keeping
 * them apart means a plan can be classified and shown to a reviewer without a decision being
 * implied, and it means the digest an approval binds to is stable before any runtime facts exist.
 */
export function planDataChange(input) {
  const statements = Array.isArray(input?.statements) && input.statements.length > 0
    ? input.statements.map((entry) => text(entry)).filter(Boolean)
    : splitSqlStatements(input?.sql ?? '');
  const classified = statements.map((statement) => classifySqlStatement(statement));

  const target = {
    environment: text(input?.target?.environment),
    databaseId: text(input?.target?.databaseId),
  };

  const plan = {
    schemaVersion: 1,
    id: text(input?.id),
    proposedBy: text(input?.proposedBy),
    target,
    expectedPreviousMigrations: (input?.expectedPreviousMigrations ?? []).map((entry) => text(entry)).filter(Boolean),
    statements: classified,
    classification: classified.length === 0 ? null : worstClass(classified.map((entry) => entry.class)),
    impact: {
      // `null` and `0` are different answers. `0` is "we looked and nothing is affected";
      // `null` is "nobody looked", which is the state this contract exists to refuse.
      rowsAffected: Number.isFinite(input?.impact?.rowsAffected) ? Number(input.impact.rowsAffected) : null,
      tables: (input?.impact?.tables ?? []).map((entry) => text(entry)).filter(Boolean),
      measuredAt: text(input?.impact?.measuredAt),
    },
    recovery: input?.recovery ? {
      snapshotId: text(input.recovery.snapshotId),
      environment: text(input.recovery.environment),
      databaseId: text(input.recovery.databaseId),
      capturedAt: text(input.recovery.capturedAt),
      digest: text(input.recovery.digest),
      restoreRehearsal: input.recovery.restoreRehearsal ? {
        evidenceId: text(input.recovery.restoreRehearsal.evidenceId),
        rehearsedAt: text(input.recovery.restoreRehearsal.rehearsedAt),
        snapshotId: text(input.recovery.restoreRehearsal.snapshotId),
        verified: input.recovery.restoreRehearsal.verified === true,
        invariants: (input.recovery.restoreRehearsal.invariants ?? []).map((entry) => text(entry)).filter(Boolean),
      } : null,
    } : null,
    rollback: input?.rollback ? {
      strategy: text(input.rollback.strategy),
      detail: text(input.rollback.detail),
    } : null,
    preconditions: (input?.preconditions ?? []).map((entry) => text(entry)).filter(Boolean),
    verification: (input?.verification ?? []).map((entry) => text(entry)).filter(Boolean),
    onVerificationFailure: text(input?.onVerificationFailure),
    approvals: (input?.approvals ?? []).map((entry) => ({
      approvalId: text(entry?.approvalId),
      environment: text(entry?.environment),
      grantedBy: text(entry?.grantedBy),
      expiresAt: text(entry?.expiresAt),
      planDigest: text(entry?.planDigest),
    })),
  };

  plan.digest = dataChangePlanDigest(plan);
  return plan;
}

/**
 * The identity an approval binds to.
 *
 * Covers exactly what an approver reviewed: which statements, against which environment and
 * database, in which order. It deliberately excludes recovery evidence, approvals and timestamps,
 * so re-capturing a snapshot does not invalidate the approval — but editing, adding, removing or
 * reordering a statement does, and so does retargeting the change.
 */
export function dataChangePlanDigest(plan) {
  return createHash('sha256').update(canonical({
    id: plan?.id ?? null,
    target: plan?.target ?? null,
    statements: (plan?.statements ?? []).map((entry) => entry.statement),
  })).digest('hex');
}

/**
 * What a class of change has to carry before it may run.
 *
 * Production is not a different contract, only a stricter one: everything a preview change must
 * answer, plus an approval and a snapshot of the actual target. A `backfill` in development needs
 * to know what it touches; the same backfill in production needs to be recoverable too.
 */
export function dataChangeRequirements(classification, environment) {
  const production = environment === 'production';
  const touchesExistingRows = ['backfill', 'narrowing', 'destructive'].includes(classification);
  const irreversible = ['narrowing', 'destructive', 'contract'].includes(classification);
  return {
    impact: touchesExistingRows,
    recovery: irreversible && environment !== 'development',
    restoreRehearsal: irreversible && production,
    rollback: irreversible || production,
    preconditions: irreversible && production,
    verification: irreversible || touchesExistingRows,
    verificationFailureResponse: irreversible || touchesExistingRows,
    // Every production mutation is approved, including an additive one. "It only adds a column"
    // is an argument about blast radius, not about who decided to change production.
    approval: production,
  };
}

function parseTime(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The single safety decision.
 *
 * Every branch is a refusal. `allowed` is true only after every requirement for the plan's own
 * classification and target environment has been satisfied by a declared, checkable fact.
 *
 * @param {object} input
 * @param {object} input.plan a plan from `planDataChange`
 * @param {object} input.runtime what the executor is actually about to do:
 *   `{ environment, databaseId, appliedMigrations }`. The plan says what was intended; this says
 *   what is in front of the executor, and the whole point is to catch the case where they differ.
 * @param {object} [input.environmentRegistry] `{ [environment]: { databaseIds: [] } }` — the
 *   operator's record of which database belongs to which environment. When it is supplied, a
 *   preview plan naming a production database is refused even though the plan and the runtime
 *   agree with each other, because they can agree and both be wrong.
 */
export function evaluateDataChangeSafety({
  plan,
  runtime = {},
  environmentRegistry = null,
  now = new Date(),
  maxRecoveryAgeMs = DEFAULT_MAX_RECOVERY_AGE_MS,
  maxRestoreRehearsalAgeMs = DEFAULT_MAX_RESTORE_REHEARSAL_AGE_MS,
} = {}) {
  const moment = (now instanceof Date ? now : new Date(now)).getTime();
  const refusals = [];
  const refuse = (reason, detail) => { refusals.push({ reason, detail }); };

  const classification = plan?.classification ?? null;
  const environment = plan?.target?.environment ?? null;

  if (!plan || (plan.statements ?? []).length === 0) {
    refuse('plan-empty', 'A data change with no statements is not a plan.');
  }
  if (!plan?.id) refuse('plan-identity-missing', 'A migration must be identifiable to be ordered, audited or rolled back.');

  for (const [index, entry] of (plan?.statements ?? []).entries()) {
    if (entry.class === 'unclassified') {
      refuse('statement-unclassified', `Statement ${index + 1} was not recognised: ${entry.reason}`);
    }
  }

  if (!environment || !DATA_CHANGE_ENVIRONMENTS.includes(environment)) {
    refuse('target-environment-unknown', `Plan target environment must be one of ${DATA_CHANGE_ENVIRONMENTS.join(', ')}.`);
  }
  if (!plan?.target?.databaseId) {
    refuse('target-database-unidentified', 'A plan that does not name the database it targets cannot be checked against the one in front of the executor.');
  }

  const runtimeEnvironment = text(runtime?.environment);
  const runtimeDatabaseId = text(runtime?.databaseId);
  if (runtimeEnvironment && environment && runtimeEnvironment !== environment) {
    refuse('runtime-environment-mismatch', `Plan targets ${environment}; the executor is in ${runtimeEnvironment}.`);
  }
  if (runtimeDatabaseId && plan?.target?.databaseId && runtimeDatabaseId !== plan.target.databaseId) {
    refuse('runtime-database-mismatch', `Plan targets ${plan.target.databaseId}; the executor is connected to ${runtimeDatabaseId}.`);
  }

  if (environmentRegistry && plan?.target?.databaseId) {
    const owning = Object.entries(environmentRegistry)
      .filter(([, record]) => (record?.databaseIds ?? []).includes(plan.target.databaseId))
      .map(([name]) => name);
    if (owning.length === 0) {
      refuse('environment-database-mismatch', `${plan.target.databaseId} is not registered to any environment.`);
    } else if (!owning.includes(environment)) {
      refuse('environment-database-mismatch', `${plan.target.databaseId} is registered to ${owning.join(', ')}, not ${environment}.`);
    }
  }

  // Migration order is part of safety rather than tidiness: a plan written against a schema the
  // target does not have is a plan whose classification was computed for a different database.
  if (Array.isArray(runtime?.appliedMigrations)) {
    const applied = runtime.appliedMigrations.map((entry) => text(entry)).filter(Boolean);
    const expected = plan?.expectedPreviousMigrations ?? [];
    const drifted = expected.filter((entry) => !applied.includes(entry));
    if (drifted.length > 0) {
      refuse('migration-sequence-drift', `Target is missing migrations this plan was written against: ${drifted.join(', ')}.`);
    }
    if (plan?.id && applied.includes(plan.id)) {
      refuse('migration-sequence-drift', `${plan.id} has already been applied to this target.`);
    }
    const ahead = applied.filter((entry) => !expected.includes(entry) && entry !== plan?.id);
    if (expected.length > 0 && ahead.length > 0) {
      refuse('migration-sequence-drift', `Target carries migrations this plan did not expect: ${ahead.join(', ')}.`);
    }
  }

  const required = dataChangeRequirements(classification, environment);

  if (required.impact && plan?.impact?.rowsAffected === null) {
    refuse('impact-unknown', 'A change that touches existing rows must state how many, measured rather than assumed.');
  }

  if (required.recovery) {
    const recovery = plan?.recovery ?? null;
    if (!recovery?.snapshotId || !recovery?.digest || !recovery?.capturedAt) {
      refuse('recovery-evidence-missing', 'A recoverable change needs an identified snapshot with a content digest and a capture time.');
    } else {
      if (recovery.environment !== environment || (plan?.target?.databaseId && recovery.databaseId !== plan.target.databaseId)) {
        refuse('recovery-evidence-mismatched', `Snapshot ${recovery.snapshotId} was taken from ${recovery.environment}/${recovery.databaseId}, not ${environment}/${plan?.target?.databaseId}.`);
      }
      const capturedAt = parseTime(recovery.capturedAt);
      if (capturedAt === null) {
        refuse('recovery-evidence-missing', 'Snapshot capture time is not a timestamp.');
      } else if (moment - capturedAt > maxRecoveryAgeMs) {
        refuse('recovery-evidence-stale', `Snapshot ${recovery.snapshotId} is older than the permitted recovery window.`);
      } else if (capturedAt - moment > 60_000) {
        refuse('recovery-evidence-mismatched', `Snapshot ${recovery.snapshotId} claims to have been captured in the future.`);
      }
    }
  }

  if (required.restoreRehearsal) {
    const rehearsal = plan?.recovery?.restoreRehearsal ?? null;
    if (!rehearsal?.evidenceId || rehearsal.verified !== true) {
      // The distinction this whole stage turns on: a record saying a backup was taken is not a
      // record saying the backup can be restored. Only a performed restore says that.
      refuse('restore-unproven', 'Restore must have been performed and verified. A snapshot nobody has restored is an untested claim.');
    } else {
      if (plan?.recovery?.snapshotId && rehearsal.snapshotId && rehearsal.snapshotId !== plan.recovery.snapshotId) {
        refuse('restore-rehearsal-mismatched', `Rehearsal restored ${rehearsal.snapshotId}, not the snapshot ${plan.recovery.snapshotId} this change relies on.`);
      }
      const rehearsedAt = parseTime(rehearsal.rehearsedAt);
      if (rehearsedAt === null) {
        refuse('restore-unproven', 'Restore rehearsal time is not a timestamp.');
      } else if (moment - rehearsedAt > maxRestoreRehearsalAgeMs) {
        refuse('restore-unproven', 'The restore rehearsal is older than the window in which it proves anything.');
      }
    }
  }

  if (required.rollback && !plan?.rollback?.strategy) {
    refuse('rollback-plan-missing', 'State how the change is reversed, or why it cannot be and what forward repair replaces it.');
  }
  if (required.preconditions && (plan?.preconditions ?? []).length === 0) {
    refuse('precondition-missing', 'Name the deterministic checks that run before the mutation.');
  }
  if (required.verification && (plan?.verification ?? []).length === 0) {
    refuse('verification-missing', 'Name the checks that prove the change succeeded.');
  }
  if (required.verificationFailureResponse && !plan?.onVerificationFailure) {
    refuse('verification-failure-response-missing', 'State what happens when post-change verification fails.');
  }

  if (required.approval) {
    const candidates = (plan?.approvals ?? []).filter((entry) => entry.approvalId);
    if (candidates.length === 0) {
      refuse('approval-missing', `A ${environment} data change requires an explicit approval.`);
    } else {
      const scoped = candidates.filter((entry) => entry.environment === environment);
      if (scoped.length === 0) {
        refuse('approval-environment-mismatch', `No approval names ${environment}.`);
      } else {
        const bound = scoped.filter((entry) => entry.planDigest === plan.digest);
        if (bound.length === 0) {
          // An approval that floats free of what was approved is an approval for whatever the
          // proposer substitutes afterwards.
          refuse('approval-plan-mismatch', 'No approval is bound to this exact plan digest.');
        } else {
          const live = bound.filter((entry) => {
            const expiry = parseTime(entry.expiresAt);
            return expiry !== null && expiry > moment;
          });
          if (live.length === 0) {
            refuse('approval-expired', 'Every approval bound to this plan has expired.');
          } else if (plan?.proposedBy && live.every((entry) => entry.grantedBy === plan.proposedBy)) {
            // AGENTS.md principle 17. The proposer signing their own production migration is the
            // absence of an approval boundary, spelled as its presence.
            refuse('approval-self-issued', `${plan.proposedBy} proposed this change and is its only approver.`);
          }
        }
      }
    }
  }

  return {
    allowed: refusals.length === 0,
    classification,
    environment,
    requirements: required,
    refusals,
    refusalReasons: [...new Set(refusals.map((entry) => entry.reason))].sort(),
  };
}
