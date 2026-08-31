/**
 * The one authorization decision, as a service operation.
 *
 * `authorizeAction` is what every mutating route will call. It is written as a
 * single function on purpose: a decision that lives in several places is
 * several decisions, and the difference between them is where the bypass is.
 * Every outcome — permitted or refused — is recorded durably before the
 * operation runs, so "was this allowed" is answerable from the ledger rather
 * than from whichever surface happened to handle the request.
 *
 * It does not run the operation. Callers authorise, then act, then report. That
 * separation is what lets the same decision sit in front of a Console request,
 * an HTTP request, an MCP tool call, a broker operation and an internal caller
 * without any of them needing to know about the others.
 */

import { createEvent } from '@app-builder/control-plane';
import {
  AuthorizationError,
  assertActionAuthorizationUsable,
  mintActionAuthorization,
} from '@app-builder/control-plane/action-authorization';
import { assertContract } from '@app-builder/contracts';
import {
  consumeActionAuthorization,
  getActionAuthorization,
  getActionAuthorizationByApprovalId,
  getActionAuthorizationState,
  listActionAuthorizations,
  recordActionAuthorization,
  revokeActionAuthorization,
} from './action-authorization-store.js';

function requireProject(service, projectId) {
  const project = service?.store?.getProject(projectId) ?? null;
  if (!project) throw new Error(`Unknown project: ${projectId}`);
  return project;
}

/**
 * Audit writes must never replace the decision they are about. A failed ledger
 * append is already visible at the store boundary, and letting it throw here
 * would turn "refused: base drifted" into "refused: could not write an event",
 * which is a different and much less useful answer.
 */
async function record(service, projectId, type, payload) {
  try {
    await service.store.recordEvent(createEvent({ projectId, type, actor: 'factory-service', payload }));
  } catch {
    // Deliberately swallowed; see above.
  }
}

export async function approveActionAuthorization(service, projectId, input = {}) {
  requireProject(service, projectId);

  // Approving twice with one approval id is one approval, not two. Without
  // this, a retried Console click mints a second authorization and the
  // single-use guarantee becomes single-use-per-click.
  const existing = getActionAuthorizationByApprovalId(service.store, projectId, input.operation, input?.approval?.approvalId);
  if (existing) return existing;

  const authorization = assertContract('action-authorization', mintActionAuthorization({ ...input, projectId }));
  recordActionAuthorization(service.store, authorization);
  await record(service, projectId, 'action-authorization.approved', {
    authorizationId: authorization.authorizationId,
    authorizationHash: authorization.authorizationHash,
    operation: authorization.operation,
    environment: authorization.scope.environment,
    risk: authorization.scope.risk,
    baseKind: authorization.base.kind,
    baseDigest: authorization.base.digest,
    proposedBy: authorization.proposedBy,
    approvedBy: authorization.approval.approvedBy,
    expiresAt: authorization.expiresAt,
  });
  return authorization;
}

export function getProjectActionAuthorization(service, projectId, authorizationId) {
  requireProject(service, projectId);
  const authorization = getActionAuthorization(service.store, projectId, authorizationId);
  if (!authorization) return null;
  return { authorization, state: getActionAuthorizationState(service.store, projectId, authorizationId) };
}

export function listProjectActionAuthorizations(service, projectId) {
  requireProject(service, projectId);
  return listActionAuthorizations(service.store, projectId).map((authorization) => ({
    authorization,
    state: getActionAuthorizationState(service.store, projectId, authorization.authorizationId),
  }));
}

export async function revokeProjectActionAuthorization(service, projectId, authorizationId, { revokedBy, reason, revokedAt = new Date().toISOString() } = {}) {
  requireProject(service, projectId);
  if (!getActionAuthorization(service.store, projectId, authorizationId)) {
    throw new AuthorizationError('unknown-authorization', `No authorization ${authorizationId} exists for project ${projectId}.`);
  }
  const result = revokeActionAuthorization(service.store, { projectId, authorizationId, revokedBy: String(revokedBy ?? 'operator'), reason, revokedAt });
  if (result.revoked) {
    await record(service, projectId, 'action-authorization.revoked', { authorizationId, revokedBy, reason: reason ?? null, revokedAt });
  }
  return result;
}

/**
 * Decide, record, and spend.
 *
 * The consume happens here rather than after the operation succeeds. That is
 * deliberate: an authorization spent on an attempt that then failed is spent,
 * because the alternative is a failed attempt handing its permission back and a
 * caller retrying an operation whose base may have moved in between. A retry is
 * a new decision, which is what a new authorization is for.
 */
export async function authorizeAction(service, projectId, {
  operation,
  authorizationId,
  expectedAuthorizationHash,
  currentBaseDigest,
  environment,
  requestedScope = null,
  requestedBudget = null,
  idempotencyKey = null,
  consume = true,
  now = () => new Date(),
} = {}) {
  requireProject(service, projectId);

  const authorization = authorizationId ? getActionAuthorization(service.store, projectId, authorizationId) : null;
  const refused = async (error) => {
    await record(service, projectId, 'action-authorization.refused', {
      authorizationId: authorizationId ?? null,
      operation: operation ?? null,
      environment: environment ?? null,
      refusal: error instanceof AuthorizationError ? error.refusal : 'unknown-authorization',
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  };

  if (!authorization) {
    return refused(new AuthorizationError('unknown-authorization', `No authorization ${authorizationId ?? '(none supplied)'} exists for ${operation} on project ${projectId}.`));
  }

  const state = getActionAuthorizationState(service.store, projectId, authorizationId);
  let checked;
  try {
    checked = assertActionAuthorizationUsable(authorization, {
      projectId,
      operation,
      expectedHash: expectedAuthorizationHash,
      currentBaseDigest,
      environment,
      requestedScope,
      requestedBudget,
      consumedAt: state?.consumedAt ?? null,
      revokedAt: state?.revokedAt ?? null,
      now: now().toISOString(),
    });
  } catch (error) {
    return refused(error);
  }

  if (!consume) {
    await record(service, projectId, 'action-authorization.permitted', {
      authorizationId: checked.authorizationId, operation, environment, consumed: false,
    });
    return { authorization: checked, consumption: null };
  }

  // The state read above is not the guard. Two callers can both pass it; only
  // one can win the insert, and the loser is told here.
  const key = String(idempotencyKey ?? checked.idempotencyKey);
  const spent = consumeActionAuthorization(service.store, {
    authorizationId: checked.authorizationId,
    projectId,
    idempotencyKey: key,
    consumedAt: now().toISOString(),
  });
  if (!spent.consumed) {
    const by = spent.consumption?.idempotencyKey === key ? 'this attempt' : 'another attempt';
    return refused(new AuthorizationError('already-consumed', `Authorization ${checked.authorizationId} was already used by ${by}; approve a new authorization before retrying.`));
  }

  await record(service, projectId, 'action-authorization.permitted', {
    authorizationId: checked.authorizationId,
    operation,
    environment,
    risk: checked.scope.risk,
    baseDigest: checked.base.digest,
    idempotencyKey: key,
    consumed: true,
  });
  return { authorization: checked, consumption: spent.consumption };
}
