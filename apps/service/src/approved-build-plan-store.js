function json(value) { return JSON.stringify(value ?? null); }
function parse(value) { return value == null ? null : JSON.parse(String(value)); }

const initialised = new WeakSet();

function database(store) {
  if (!store?.db || typeof store.db.exec !== 'function' || typeof store.db.prepare !== 'function') {
    throw new Error('Approved build plan storage requires the factory SQLite store.');
  }
  if (!initialised.has(store)) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS approved_build_plans (
        plan_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        approval_id TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        UNIQUE(project_id, approval_id),
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
    initialised.add(store);
  }
  return store.db;
}

export function recordApprovedBuildPlan(store, plan) {
  database(store).prepare(`
    INSERT INTO approved_build_plans (plan_id,project_id,approval_id,plan_hash,approved_at,plan_json)
    VALUES (?,?,?,?,?,?)
  `).run(plan.planId, plan.projectId, plan.approval.approvalId, plan.planHash, plan.approval.approvedAt, json(plan));
  return plan;
}

export function getApprovedBuildPlan(store, projectId, planId) {
  const row = database(store).prepare('SELECT plan_json FROM approved_build_plans WHERE project_id = ? AND plan_id = ?').get(projectId, planId);
  return row ? parse(row.plan_json) : null;
}

export function getApprovedBuildPlanByApprovalId(store, projectId, approvalId) {
  const row = database(store).prepare('SELECT plan_json FROM approved_build_plans WHERE project_id = ? AND approval_id = ?').get(projectId, approvalId);
  return row ? parse(row.plan_json) : null;
}

export function listApprovedBuildPlans(store, projectId) {
  return database(store).prepare('SELECT plan_json FROM approved_build_plans WHERE project_id = ? ORDER BY approved_at DESC').all(projectId).map((row) => parse(row.plan_json));
}

export function claimApprovedBuildPlanExecution(store, { planId, projectId, requestId, claimedAt }) {
  const claim = { schemaVersion: 1, planId, projectId, requestId, claimedAt };
  const result = database(store).prepare(`
    INSERT INTO approved_build_plan_executions (plan_id,project_id,request_id,claimed_at,execution_json)
    VALUES (?,?,?,?,?)
    ON CONFLICT DO NOTHING
  `).run(planId, projectId, requestId, claimedAt, json(claim));
  return { claimed: result.changes === 1, claim: getApprovedBuildPlanExecution(store, planId) };
}

export function getApprovedBuildPlanExecution(store, planId) {
  const row = database(store).prepare('SELECT execution_json FROM approved_build_plan_executions WHERE plan_id = ?').get(planId);
  return row ? parse(row.execution_json) : null;
}
