import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { appendEvent } from '@app-builder/control-plane';

function json(value) { return JSON.stringify(value ?? null); }
function parse(value) { return value == null ? null : JSON.parse(String(value)); }

export class FactoryStore {
  constructor({ stateRoot }) {
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
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        checkpoint_json TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
  }

  upsertProject(project) {
    this.db.prepare(`
      INSERT INTO projects (id,name,type,slug,state,workspace_path,manifest_json,knowledge_pack_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        type=excluded.type,
        slug=excluded.slug,
        state=excluded.state,
        workspace_path=excluded.workspace_path,
        manifest_json=excluded.manifest_json,
        knowledge_pack_json=excluded.knowledge_pack_json,
        updated_at=excluded.updated_at
    `).run(project.id, project.name, project.type, project.slug, project.state, project.workspacePath ?? null, json(project.manifest), project.knowledgePack ? json(project.knowledgePack) : null, project.createdAt, project.updatedAt);
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

  async recordEvent(event) {
    await appendEvent(this.ledgerPath, event);
    this.db.prepare(`
      INSERT INTO events (id,project_id,task_id,type,timestamp,actor,cost_gbp,duration_ms,input_tokens,output_tokens,event_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(event.id, event.projectId, event.taskId ?? null, event.type, event.timestamp, event.actor, event.usage?.costGbp ?? 0, event.usage?.durationMs ?? 0, event.usage?.inputTokens ?? 0, event.usage?.outputTokens ?? 0, json(event));
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
