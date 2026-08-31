import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appendEvent } from '@app-builder/control-plane';

function json(value) { return JSON.stringify(value ?? null); }
function parse(value) { return value == null ? null : JSON.parse(String(value)); }

export class FactoryStore {
  constructor({ stateRoot, reconcile = true }) {
    this.stateRoot = path.resolve(stateRoot);
    fs.mkdirSync(this.stateRoot, { recursive: true });
    this.databasePath = path.join(this.stateRoot, 'factory.sqlite');
    this.ledgerPath = path.join(this.stateRoot, 'events.jsonl');
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        slug TEXT NOT NULL,
        state TEXT NOT NULL,
        workspace_path TEXT,
        manifest_json TEXT NOT NULL,
        knowledge_pack_json TEXT,
        intake_bundle_json TEXT,
        build_identity_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        state TEXT NOT NULL,
        objective TEXT NOT NULL,
        task_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        task_id TEXT,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        cost_gbp REAL NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        event_json TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS events_project_sequence ON events(project_id, sequence);
      CREATE INDEX IF NOT EXISTS events_task_sequence ON events(task_id, sequence);
      CREATE TABLE IF NOT EXISTS projection_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_projected_sequence INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        checkpoint_json TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    // A store created before approved intake became durable has no column for
    // it. Adding it here keeps an existing local factory usable rather than
    // asking an operator to discard their projects.
    const columns = this.db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name);
    if (!columns.includes('intake_bundle_json')) this.db.exec('ALTER TABLE projects ADD COLUMN intake_bundle_json TEXT');
    // Likewise for the build identity. A project verified before verification
    // recorded one keeps a null here, which is the honest answer: nothing about
    // that build's dependency graph, toolchain or output was written down.
    if (!columns.includes('build_identity_json')) this.db.exec('ALTER TABLE projects ADD COLUMN build_identity_json TEXT');

    // Opening the store is where a lost projection is found. A crash between
    // the ledger append and the projection insert leaves the read model short,
    // and nothing else in the system would ever notice — so the check runs
    // here, before anything can read a database that disagrees with the ledger.
    this.reconciliation = reconcile === false ? null : this.reconcileProjection();
  }

  upsertProject(project) {
    this.db.prepare(`
      INSERT INTO projects (id,name,type,slug,state,workspace_path,manifest_json,knowledge_pack_json,intake_bundle_json,build_identity_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        type=excluded.type,
        slug=excluded.slug,
        state=excluded.state,
        workspace_path=excluded.workspace_path,
        manifest_json=excluded.manifest_json,
        knowledge_pack_json=excluded.knowledge_pack_json,
        intake_bundle_json=COALESCE(excluded.intake_bundle_json, projects.intake_bundle_json),
        build_identity_json=COALESCE(excluded.build_identity_json, projects.build_identity_json),
        updated_at=excluded.updated_at
    `).run(project.id, project.name, project.type, project.slug, project.state, project.workspacePath ?? null, json(project.manifest), project.knowledgePack ? json(project.knowledgePack) : null, project.intakeBundle ? json(project.intakeBundle) : null, project.buildIdentity ? json(project.buildIdentity) : null, project.createdAt, project.updatedAt);
    return this.getProject(project.id);
  }

  getProject(id) {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      slug: row.slug,
      state: row.state,
      workspacePath: row.workspace_path,
      manifest: parse(row.manifest_json),
      knowledgePack: parse(row.knowledge_pack_json),
      intakeBundle: parse(row.intake_bundle_json),
      buildIdentity: parse(row.build_identity_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listProjects() {
    return this.db.prepare('SELECT id FROM projects ORDER BY created_at ASC').all().map((row) => this.getProject(row.id));
  }

  upsertTask(task) {
    this.db.prepare(`
      INSERT INTO tasks (id,project_id,state,objective,task_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        state=excluded.state,
        objective=excluded.objective,
        task_json=excluded.task_json,
        updated_at=excluded.updated_at
    `).run(task.id, task.projectId, task.state, task.objective, json(task), task.createdAt, task.updatedAt);
    return task;
  }

  listTasks(projectId) {
    return this.db.prepare('SELECT task_json FROM tasks WHERE project_id = ? ORDER BY created_at ASC').all(projectId).map((row) => parse(row.task_json));
  }

  /**
   * Project one event into the read model.
   *
   * Idempotent by `id`, which is what makes reconciliation and rebuild safe:
   * projecting an event the database already has must be a no-op rather than a
   * unique-constraint failure, or the recovery path becomes the thing that
   * needs recovering.
   */
  projectEvent(event) {
    return this.db.prepare(`
      INSERT INTO events (id,project_id,task_id,type,timestamp,actor,cost_gbp,duration_ms,input_tokens,output_tokens,event_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).run(event.id, event.projectId, event.taskId ?? null, event.type, event.timestamp, event.actor, event.usage?.costGbp ?? 0, event.usage?.durationMs ?? 0, event.usage?.inputTokens ?? 0, event.usage?.outputTokens ?? 0, json(event));
  }

  /**
   * The ledger, read synchronously.
   *
   * The async reader in the control plane is the one callers use; reconciliation
   * happens while a store is being opened, and an operation that has to run
   * before anything can read the database is clearer as part of opening it than
   * as something every caller must remember to await.
   *
   * **A ledger event's sequence is its position in the file, one-based.** The
   * ledger is append-only JSONL, so position already *is* the monotonic
   * sequence Stage Q11 asks for. Writing one into each line as well would create
   * a second source of the same number, and two sources of one number are two
   * numbers as soon as anything goes wrong.
   */
  readLedger() {
    if (!fs.existsSync(this.ledgerPath)) return [];
    return fs.readFileSync(this.ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }

  lastProjectedSequence() {
    const row = this.db.prepare('SELECT last_projected_sequence FROM projection_state WHERE id = 1').get();
    return row ? Number(row.last_projected_sequence) : 0;
  }

  setLastProjectedSequence(sequence) {
    this.db.prepare('INSERT INTO projection_state (id,last_projected_sequence) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_projected_sequence = excluded.last_projected_sequence').run(sequence);
  }

  /**
   * Make the read model equal the ledger.
   *
   * The failure this exists for is silent, which is the worst kind. `recordEvent`
   * appends to the authoritative ledger and then inserts into SQLite; a process
   * that dies between those two statements leaves an event that happened and a
   * read model that has never heard of it. Reopening the store used to notice
   * nothing at all — two events in the ledger, one in the projection, and every
   * later read, every cost total and every resume packet quietly short by one.
   *
   * Stage Q11 in `docs/ENGINEERING_QUALITY_PROGRAMME.md` says what to do about
   * it: ledger at 1827 and projection at 1821 means replaying 1822 to 1827,
   * rather than guessing. `last_projected_sequence` is what makes that a replay
   * of six events instead of a scan of all 1827.
   *
   * A counter alone is not enough to trust, though, because it only describes
   * one shape of divergence. Two cheap checks decide whether the fast path is
   * safe: the projection must hold exactly that many rows, and the row at that
   * sequence must be the ledger's event at that position. If either disagrees —
   * a row deleted from the middle, a row the ledger never had, a counter that
   * outran the table — no replay can fix it, because `sequence` is assigned on
   * insert and appending a missing middle event would place it after events that
   * came later. That is a **rebuild**, which is always available precisely
   * because the events table is derived from the ledger and nothing else.
   *
   * An event whose project is not in the database is reported rather than
   * inserted. The projects table is separate durable state, not a projection of
   * the ledger, so a foreign key that cannot resolve is a fact about this store
   * worth surfacing — not something reconciliation should invent a project to
   * satisfy.
   */
  reconcileProjection() {
    const ledger = this.readLedger();
    const projectedRows = this.db.prepare('SELECT id FROM events ORDER BY sequence ASC').all().map((row) => row.id);
    const stored = this.lastProjectedSequence();

    const countAgrees = projectedRows.length === stored;
    const boundaryAgrees = stored === 0 || (stored <= ledger.length && projectedRows[stored - 1] === ledger[stored - 1]?.id);
    const canReplay = countAgrees && boundaryAgrees && stored <= ledger.length;

    const from = canReplay ? stored : 0;
    // A rebuild resets the sequence counter as well as the rows. `AUTOINCREMENT`
    // never reuses a value, so without this a rebuilt projection would return
    // the same events under different sequence numbers — and `listEvents` takes
    // `afterSequence`, so a caller polling from 3 would silently skip whatever
    // the rebuild renumbered past it. Resetting makes the projection a
    // deterministic function of the ledger rather than of how many times it has
    // been rebuilt.
    if (!canReplay) this.db.exec("DELETE FROM events; DELETE FROM sqlite_sequence WHERE name = 'events'");

    const knownProjects = new Set(this.db.prepare('SELECT id FROM projects').all().map((row) => row.id));
    const orphaned = [];
    let recovered = 0;
    for (let index = from; index < ledger.length; index += 1) {
      const event = ledger[index];
      if (!knownProjects.has(event.projectId)) {
        orphaned.push({ eventId: event.id, projectId: event.projectId, type: event.type, sequence: index + 1 });
        continue;
      }
      this.projectEvent(event);
      recovered += 1;
    }
    this.setLastProjectedSequence(ledger.length - orphaned.length);

    return {
      mode: canReplay ? (recovered || orphaned.length ? 'replayed' : 'already-consistent') : 'rebuilt',
      ledgerEvents: ledger.length,
      replayedFrom: from + 1,
      recovered,
      orphaned,
    };
  }

  /**
   * Re-derive the read model from the ledger alone.
   *
   * Deliberately not "rebuild everything". Projects, tasks and checkpoints are
   * written directly and are not projections of the ledger, so this rebuilds
   * exactly what the ledger is authoritative for and says so rather than
   * implying a recovery it cannot perform.
   */
  rebuildProjection() {
    this.db.exec("DELETE FROM events; DELETE FROM sqlite_sequence WHERE name = 'events'");
    this.setLastProjectedSequence(0);
    return this.reconcileProjection();
  }

  async recordEvent(event) {
    await appendEvent(this.ledgerPath, event);
    this.projectEvent(event);
    // The counter moves only after the projection insert, so a crash between
    // the two leaves it pointing at the last event that genuinely reached the
    // read model. A counter advanced optimistically would describe a projection
    // that does not exist, which is worse than no counter at all.
    this.setLastProjectedSequence(this.lastProjectedSequence() + 1);
    return event;
  }

  listEvents(projectId, { afterSequence = 0, taskId = null } = {}) {
    const rows = taskId
      ? this.db.prepare('SELECT sequence,event_json FROM events WHERE project_id = ? AND task_id = ? AND sequence > ? ORDER BY sequence ASC').all(projectId, taskId, afterSequence)
      : this.db.prepare('SELECT sequence,event_json FROM events WHERE project_id = ? AND sequence > ? ORDER BY sequence ASC').all(projectId, afterSequence);
    return rows.map((row) => ({ sequence: Number(row.sequence), ...parse(row.event_json) }));
  }

  recordCheckpoint(checkpoint) {
    this.db.prepare(`INSERT OR REPLACE INTO checkpoints (id,project_id,task_id,created_at,checkpoint_json) VALUES (?,?,?,?,?)`)
      .run(checkpoint.id, checkpoint.projectId, checkpoint.taskId, checkpoint.createdAt, json(checkpoint));
    return checkpoint;
  }

  listCheckpoints(projectId) {
    return this.db.prepare('SELECT checkpoint_json FROM checkpoints WHERE project_id = ? ORDER BY created_at ASC').all(projectId).map((row) => parse(row.checkpoint_json));
  }

  latestCheckpoint(projectId) {
    const row = this.db.prepare('SELECT checkpoint_json FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(projectId);
    return row ? parse(row.checkpoint_json) : null;
  }

  metrics(projectId) {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS event_count,
             COALESCE(SUM(cost_gbp),0) AS cost_gbp,
             COALESCE(SUM(duration_ms),0) AS duration_ms,
             COALESCE(SUM(input_tokens),0) AS input_tokens,
             COALESCE(SUM(output_tokens),0) AS output_tokens,
             COALESCE(SUM(CASE WHEN type = 'user.intervention' THEN 1 ELSE 0 END),0) AS interventions
      FROM events WHERE project_id = ?
    `).get(projectId);
    return {
      eventCount: Number(row.event_count),
      costGbp: Number(row.cost_gbp),
      durationMs: Number(row.duration_ms),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      interventions: Number(row.interventions),
    };
  }

  close() { this.db.close(); }
}
