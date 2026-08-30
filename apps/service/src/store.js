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
      CREATE TABLE IF NOT EXISTS approved_build_plans (
        plan_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        approval_id TEXT NOT NULL UNIQUE,
        plan_hash TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS approved_build_plans_project_approved ON approved_build_plans(project_id, approved_at);
      CREATE TABLE IF NOT EXISTS approved_build_plan_executions (
        plan_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        request_id TEXT NOT NULL UNIQUE,
        claimed_at TEXT NOT NULL,
        execution_json TEXT NOT NULL,
        FOREIGN KEY(plan_id) REFERENCES approved_build_plans(plan_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    // A store created before approved intake became durable has no column for
    // it. Adding it here keeps an existing local factory usable rather than
    // asking an operator to discard their projects.
    const columns = this.db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name);
    if (!columns.includes('intake_bundle_json')) this.db.exec('ALTER TABLE projects ADD COLUMN intake_bundle_json TEXT');

    // Opening the store is where a lost projection is found. A crash between
    // the ledger append and the projection insert leaves the read model short,
    // and nothing else in the system would ever notice — so the check runs
    // here, before anything can read a database that disagrees with the ledger.
    this.reconciliation = reconcile === false ? null : this.reconcileProjection();
  }

  upsertProject(project) {
    this.db.prepare(`
      INSERT INTO projects (id,name,type,slug,state,workspace_path,manifest_json,knowledge_pack_json,intake_bundle_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        type=excluded.type,
        slug=excluded.slug,
        state=excluded.state,
        workspace_path=excluded.workspace_path,
        manifest_json=excluded.manifest_json,
        knowledge_pack_json=excluded.knowledge_pack_json,
        intake_bundle_json=COALESCE(excluded.intake_bundle_json, projects.intake_bundle_json),
        updated_at=excluded.updated_at
    `).run(project.id, project.name, project.type, project.slug, project.state, project.workspacePath ?? null, json(project.manifest), project.knowledgePack ? json(project.knowledgePack) : null, project.intakeBundle ? json(project.intakeBundle) : null, project.createdAt, project.updatedAt);
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listProjects() {
    return this.db.prepare('SELECT id FROM projects ORDER BY created_at ASC').all().map((row) => this.getProject(row.id));
  }

  recordApprovedBuildPlan(plan) {
    this.db.prepare(`
      INSERT INTO approved_build_plans (plan_id,project_id,approval_id,plan_hash,approved_at,plan_json)
      VALUES (?,?,?,?,?,?)
    `).run(plan.planId, plan.projectId, plan.approval.approvalId, plan.planHash, plan.approval.approvedAt, json(plan));
    return plan;
  }

  getApprovedBuildPlan(projectId, planId) {
    const row = this.db.prepare('SELECT plan_json FROM approved_build_plans WHERE project_id = ? AND plan_id = ?').get(projectId, planId);
    return row ? parse(row.plan_json) : null;
  }

  getApprovedBuildPlanByApprovalId(projectId, approvalId) {
    const row = this.db.prepare('SELECT plan_json FROM approved_build_plans WHERE project_id = ? AND approval_id = ?').get(projectId, approvalId);
    return row ? parse(row.plan_json) : null;
  }

  listApprovedBuildPlans(projectId) {
    return this.db.prepare('SELECT plan_json FROM approved_build_plans WHERE project_id = ? ORDER BY approved_at DESC').all(projectId).map((row) => parse(row.plan_json));
  }

  claimApprovedBuildPlanExecution({ planId, projectId, requestId, claimedAt }) {
    const claim = { schemaVersion: 1, planId, projectId, requestId, claimedAt };
    const result = this.db.prepare(`
      INSERT INTO approved_build_plan_executions (plan_id,project_id,request_id,claimed_at,execution_json)
      VALUES (?,?,?,?,?)
      ON CONFLICT DO NOTHING
    `).run(planId, projectId, requestId, claimedAt, json(claim));
    const existing = this.getApprovedBuildPlanExecution(planId);
    return { claimed: result.changes === 1, claim: existing };
  }

  getApprovedBuildPlanExecution(planId) {
    const row = this.db.prepare('SELECT execution_json FROM approved_build_plan_executions WHERE plan_id = ?').get(planId);
    return row ? parse(row.execution_json) : null;
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

  /** Project one event into the read model. */
  projectEvent(event) {
    return this.db.prepare(`
      INSERT INTO events (id,project_id,task_id,type,timestamp,actor,cost_gbp,duration_ms,input_tokens,output_tokens,event_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).run(event.id, event.projectId, event.taskId ?? null, event.type, event.timestamp, event.actor, event.usage?.costGbp ?? 0, event.usage?.durationMs ?? 0, event.usage?.inputTokens ?? 0, event.usage?.outputTokens ?? 0, json(event));
  }

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

  reconcileProjection() {
    const ledger = this.readLedger();
    const projectedRows = this.db.prepare('SELECT id FROM events ORDER BY sequence ASC').all().map((row) => row.id);
    const stored = this.lastProjectedSequence();

    const countAgrees = projectedRows.length === stored;
    const boundaryAgrees = stored === 0 || (stored <= ledger.length && projectedRows[stored - 1] === ledger[stored - 1]?.id);
    const canReplay = countAgrees && boundaryAgrees && stored <= ledger.length;

    const from = canReplay ? stored : 0;
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

  rebuildProjection() {
    this.db.exec("DELETE FROM events; DELETE FROM sqlite_sequence WHERE name = 'events'");
    this.setLastProjectedSequence(0);
    return this.reconcileProjection();
  }

  async recordEvent(event) {
    await appendEvent(this.ledgerPath, event);
    this.projectEvent(event);
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
