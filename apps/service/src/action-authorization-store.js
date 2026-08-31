/**
 * Durable storage for ActionAuthorizations, and the one place "once" is decided.
 *
 * The consume-once guarantee is a unique constraint, not a read. Two callers
 * can both read "not yet consumed" and both proceed; only one can win an insert
 * into a table whose primary key is the authorization id, and the loser has to
 * be told. This mirrors `approved_build_plan_executions`, which established the
 * pattern for one operation; the difference is only that this table is not
 * about one operation.
 *
 * Revocation is stored rather than carried in the document, because the
 * document is immutable and hashed. An authorization that could be edited to
 * say it was revoked could be edited to say it was not.
 */

function json(value) { return JSON.stringify(value ?? null); }
function parse(value) { return value == null ? null : JSON.parse(String(value)); }

const initialised = new WeakSet();

function database(store) {
  if (!store?.db || typeof store.db.exec !== 'function' || typeof store.db.prepare !== 'function') {
    throw new Error('Action authorization storage requires the factory SQLite store.');
  }
  if (!initialised.has(store)) {
    store.db.exec(`
      CREATE TABLE IF NOT EXISTS action_authorizations (
        authorization_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        approval_id TEXT NOT NULL,
        authorization_hash TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        revoked_by TEXT,
        revocation_reason TEXT,
        authorization_json TEXT NOT NULL,
        UNIQUE(project_id, operation, approval_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS action_authorizations_project ON action_authorizations(project_id, approved_at);
      CREATE TABLE IF NOT EXISTS action_authorization_consumptions (
        authorization_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        consumed_at TEXT NOT NULL,
        consumption_json TEXT NOT NULL,
        FOREIGN KEY(authorization_id) REFERENCES action_authorizations(authorization_id) ON DELETE CASCADE,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    initialised.add(store);
  }
  return store.db;
}

export function recordActionAuthorization(store, authorization) {
  database(store).prepare(`
    INSERT INTO action_authorizations
      (authorization_id,project_id,operation,approval_id,authorization_hash,approved_at,expires_at,revoked_at,revoked_by,revocation_reason,authorization_json)
    VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?)
  `).run(
    authorization.authorizationId,
    authorization.projectId,
    authorization.operation,
    authorization.approval.approvalId,
    authorization.authorizationHash,
    authorization.approval.approvedAt,
    authorization.expiresAt,
    json(authorization),
  );
  return authorization;
}

function row(store, projectId, authorizationId) {
  return database(store)
    .prepare('SELECT * FROM action_authorizations WHERE project_id = ? AND authorization_id = ?')
    .get(projectId, authorizationId) ?? null;
}

export function getActionAuthorization(store, projectId, authorizationId) {
  const found = row(store, projectId, authorizationId);
  return found ? parse(found.authorization_json) : null;
}

/** The mutable facts about an authorization, kept apart from the immutable document. */
export function getActionAuthorizationState(store, projectId, authorizationId) {
  const found = row(store, projectId, authorizationId);
  if (!found) return null;
  const consumption = getActionAuthorizationConsumption(store, authorizationId);
  return {
    revokedAt: found.revoked_at ?? null,
    revokedBy: found.revoked_by ?? null,
    revocationReason: found.revocation_reason ?? null,
    consumedAt: consumption?.consumedAt ?? null,
    consumption,
  };
}

export function getActionAuthorizationByApprovalId(store, projectId, operation, approvalId) {
  const found = database(store)
    .prepare('SELECT authorization_json FROM action_authorizations WHERE project_id = ? AND operation = ? AND approval_id = ?')
    .get(projectId, operation, approvalId);
  return found ? parse(found.authorization_json) : null;
}

export function listActionAuthorizations(store, projectId) {
  return database(store)
    .prepare('SELECT authorization_json FROM action_authorizations WHERE project_id = ? ORDER BY approved_at DESC')
    .all(projectId)
    .map((entry) => parse(entry.authorization_json));
}

export function getActionAuthorizationConsumption(store, authorizationId) {
  const found = database(store)
    .prepare('SELECT consumption_json FROM action_authorization_consumptions WHERE authorization_id = ?')
    .get(authorizationId);
  return found ? parse(found.consumption_json) : null;
}

/**
 * Spend it. The insert is the guard: whichever caller reaches it first owns the
 * authorization, and every other caller — including one retrying with the same
 * idempotency key — is told it is already spent and by which attempt.
 */
export function consumeActionAuthorization(store, { authorizationId, projectId, idempotencyKey, consumedAt }) {
  const consumption = { schemaVersion: 1, authorizationId, projectId, idempotencyKey, consumedAt };
  const result = database(store).prepare(`
    INSERT INTO action_authorization_consumptions (authorization_id,project_id,idempotency_key,consumed_at,consumption_json)
    VALUES (?,?,?,?,?)
    ON CONFLICT DO NOTHING
  `).run(authorizationId, projectId, idempotencyKey, consumedAt, json(consumption));
  return { consumed: result.changes === 1, consumption: getActionAuthorizationConsumption(store, authorizationId) };
}

export function revokeActionAuthorization(store, { projectId, authorizationId, revokedBy, reason, revokedAt }) {
  const result = database(store).prepare(`
    UPDATE action_authorizations
    SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
    WHERE project_id = ? AND authorization_id = ? AND revoked_at IS NULL
  `).run(revokedAt, revokedBy, reason ?? null, projectId, authorizationId);
  return { revoked: result.changes === 1, state: getActionAuthorizationState(store, projectId, authorizationId) };
}
