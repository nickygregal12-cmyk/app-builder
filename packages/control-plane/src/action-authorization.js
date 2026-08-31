/**
 * Permission for one exact operation, against one exact base, once.
 *
 * The factory already had this, for exactly one operation. `ApprovedBuildPlan`
 * fingerprints every approved input, freezes them, refuses when the project has
 * drifted since approval, and can be spent only once — including under a race,
 * because the winner is decided by a unique constraint rather than by a read.
 * It is genuinely good, and it guarded `project.generate` and nothing else.
 *
 * Meanwhile the same effect was reachable by calling `project.generate` through
 * the HTTP service, the MCP adapter, the agent broker or an internal caller,
 * and none of those asked for a plan. A guarantee that one route enforces is
 * not a guarantee; it is a route somebody has not found yet. So this is the
 * same semantics, generalised to any operation, so that every route can be made
 * to ask the same question.
 *
 * Three things stay separate on purpose, and this is only the second:
 *
 *   - **Product Contract Approval** — the owner approving *what should be
 *     built*: facts, constraints, journeys, criteria, budget.
 *   - **ActionAuthorization** — this. Permission for *one particular action*.
 *   - **Release Approval** — permission to *publish one exact artifact* to one
 *     exact target.
 *
 * Collapsing them is the failure this prevents: approving a plan becomes
 * permission to do anything the plan touches, and approving a build becomes
 * permission to put it in front of the public.
 *
 * What this module does not do: store anything, decide whether the caller is
 * who they say they are, or consume the authorization. Consumption is a claim
 * against a unique constraint and belongs to the store, because a read followed
 * by a write is not a consume-once — two callers can both pass the read.
 */

import { createHash, randomUUID } from 'node:crypto';

const AUTHORIZATION_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const OPAQUE_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const OPERATION = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*){1,4}$/;

export const AUTHORIZATION_ENVIRONMENTS = Object.freeze(['workspace', 'preview', 'production']);
export const AUTHORIZATION_RISKS = Object.freeze(['low', 'medium', 'high', 'critical']);
export const AUTHORIZATION_BASE_KINDS = Object.freeze(['project-state', 'artifact-revision']);

/** Every way an authorization can fail to permit what is being asked of it. */
export const AUTHORIZATION_REFUSALS = Object.freeze([
  'unknown-authorization',
  'content-tampered',
  'wrong-project',
  'wrong-operation',
  'wrong-environment',
  'base-drifted',
  'expired',
  'revoked',
  'already-consumed',
  'scope-widened',
  'budget-exceeded',
  'self-approved',
]);

export class AuthorizationError extends Error {
  constructor(refusal, message) {
    super(message);
    this.name = 'AuthorizationError';
    this.refusal = refusal;
  }
}

function refuse(refusal, message) {
  throw new AuthorizationError(refusal, message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

export function authorizationDigest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function actionAuthorizationHash(authorization) {
  const { authorizationHash: _ignored, ...payload } = authorization;
  return authorizationDigest(payload);
}

function requireText(value, label, max = 160) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`);
  return text;
}

function requireTimestamp(value, label) {
  const when = new Date(value);
  if (!Number.isFinite(when.getTime())) throw new Error(`${label} is not a valid timestamp.`);
  return when.toISOString();
}

function requireInteger(value, label, minimum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`${label} must be an integer >= ${minimum}.`);
  return parsed;
}

/**
 * Scope rules, normalised so two spellings of one rule compare equal. The
 * shapes are the ChangeSet shapes, because an authorization that could not
 * express what a ChangeSet expresses would be authorising something other than
 * the change it is about to permit.
 */
function normalizeRule(value, label) {
  const candidate = String(value ?? '').trim().replaceAll('\\', '/');
  if (candidate === '*') return candidate;
  if (!candidate || candidate.includes('\0')) throw new Error(`${label} contains an invalid scope rule.`);
  if (candidate.startsWith('/') || /^[A-Za-z]:\//.test(candidate) || candidate.includes('//')) {
    throw new Error(`${label} must contain repository-relative scope rules.`);
  }
  let suffix = '';
  if (candidate.endsWith('/**')) suffix = '/**';
  else if (candidate.endsWith('*')) suffix = '*';
  else if (candidate.endsWith('/')) suffix = '/';
  const stem = suffix ? candidate.slice(0, -suffix.length) : candidate;
  if (!stem || stem.includes('*')) throw new Error(`${label} contains an unsupported scope rule: ${candidate}`);
  if (stem.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an unsafe scope rule: ${candidate}`);
  }
  return `${stem}${suffix}`;
}

function ruleReach(rule) {
  if (rule === '*') return { prefix: '', recursive: true, exact: false };
  if (rule.endsWith('/**')) return { prefix: rule.slice(0, -3), recursive: true, exact: false };
  if (rule.endsWith('*')) return { prefix: rule.slice(0, -1), recursive: true, exact: false };
  if (rule.endsWith('/')) return { prefix: rule.slice(0, -1), recursive: true, exact: false };
  return { prefix: rule, recursive: false, exact: true };
}

/**
 * Does an authorized rule cover a requested one?
 *
 * Rule-against-rule, not file-against-rule: the question at authorization time
 * is whether the caller is asking for less than it was given, and a caller that
 * asks for `src/**` having been granted `src/pages/**` must be refused before
 * any file exists to test.
 */
export function ruleCovers(authorized, requested) {
  const granted = ruleReach(authorized);
  const asked = ruleReach(requested);
  if (granted.exact) return asked.exact && granted.prefix === asked.prefix;
  if (granted.prefix === '') return true;
  if (asked.prefix === granted.prefix) return true;
  return asked.prefix.startsWith(`${granted.prefix}/`);
}

export function scopeCovers(authorizedFiles, requestedFiles) {
  const granted = authorizedFiles.map((rule) => normalizeRule(rule, 'Authorized scope'));
  return requestedFiles
    .map((rule) => normalizeRule(rule, 'Requested scope'))
    .filter((requested) => !granted.some((rule) => ruleCovers(rule, requested)));
}

/**
 * Mint an authorization.
 *
 * The refusals here are all about the document being unusable as evidence
 * later. A self-approval is refused at minting rather than at use, because an
 * authorization that records its own proposer as its approver is not a weaker
 * permission — it is a record of nobody having decided anything.
 */
export function mintActionAuthorization(input, now = new Date().toISOString()) {
  const projectId = requireText(input?.projectId, 'Authorization projectId');
  const operation = requireText(input?.operation, 'Authorization operation', 120);
  if (!OPERATION.test(operation)) throw new Error(`Authorization operation is not a registered operation name: ${operation}`);

  const baseKind = String(input?.base?.kind ?? '');
  if (!AUTHORIZATION_BASE_KINDS.includes(baseKind)) throw new Error(`Authorization base kind is unsupported: ${baseKind || '(absent)'}`);
  const baseDigest = String(input?.base?.digest ?? '');
  if (!SHA256.test(baseDigest)) throw new Error('Authorization requires an exact SHA-256 base digest: permission is granted against a thing, not a name.');

  const environment = String(input?.scope?.environment ?? '');
  if (!AUTHORIZATION_ENVIRONMENTS.includes(environment)) throw new Error(`Authorization environment is unsupported: ${environment || '(absent)'}`);
  const risk = String(input?.scope?.risk ?? '');
  if (!AUTHORIZATION_RISKS.includes(risk)) throw new Error(`Authorization risk class is unsupported: ${risk || '(absent)'}`);
  const files = Array.isArray(input?.scope?.files) ? input.scope.files : [];
  if (files.length === 0) throw new Error('Authorization scope must name at least one file rule; an absent scope is not an unlimited one.');

  const proposedBy = requireText(input?.proposedBy, 'Authorization proposedBy');
  const approvedBy = requireText(input?.approval?.approvedBy, 'Authorization approvedBy');
  if (proposedBy === approvedBy) {
    refuse('self-approved', `${proposedBy} proposed this action and cannot also authorize it (principle 17).`);
  }
  const approvalId = requireText(input?.approval?.approvalId, 'Authorization approvalId', 120);
  if (!OPAQUE_ID.test(approvalId)) throw new Error('Authorization requires an explicit bounded approval id.');
  if (String(input?.approval?.mode ?? '') !== 'explicit-local-operator') {
    throw new Error('Authorization requires explicit local operator approval.');
  }

  const idempotencyKey = requireText(input?.idempotencyKey, 'Authorization idempotencyKey', 120);
  if (!OPAQUE_ID.test(idempotencyKey)) throw new Error('Authorization requires a bounded idempotency key.');

  const approvedAt = requireTimestamp(input?.approval?.approvedAt ?? now, 'Authorization approvedAt');
  const expiresAt = requireTimestamp(input?.expiresAt, 'Authorization expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(approvedAt)) {
    throw new Error('Authorization expires at or before it was approved, so it permits nothing and would refuse every use.');
  }

  const budget = input?.budget ?? {};
  const maxCostGbp = Number(budget.maxCostGbp);
  if (!Number.isFinite(maxCostGbp) || maxCostGbp < 0) throw new Error('Authorization budget maxCostGbp must be a number >= 0.');

  const draft = {
    schemaVersion: 1,
    authorizationVersion: AUTHORIZATION_VERSION,
    authorizationId: input.authorizationId ?? `authorization-${randomUUID()}`,
    projectId,
    operation,
    base: { kind: baseKind, digest: baseDigest },
    scope: {
      files: [...new Set(files.map((rule) => normalizeRule(rule, 'Authorization scope')))],
      environment,
      risk,
    },
    budget: {
      maxCostGbp,
      maxTokens: requireInteger(budget.maxTokens, 'Authorization budget maxTokens', 0),
      maxRuntimeMs: requireInteger(budget.maxRuntimeMs, 'Authorization budget maxRuntimeMs', 0),
      maxIterations: requireInteger(budget.maxIterations, 'Authorization budget maxIterations', 1),
    },
    singleUse: true,
    idempotencyKey,
    expiresAt,
    proposedBy,
    approval: { mode: 'explicit-local-operator', approvalId, approvedBy, approvedAt },
  };
  return { ...draft, authorizationHash: authorizationDigest(draft) };
}

/**
 * Are we both talking about the same untampered authorization?
 *
 * Identity only. It answers nothing about whether using it is allowed now, and
 * is separate because a caller has to establish identity before it can
 * truthfully report anything else — including that the authorization has
 * already been spent.
 */
export function assertActionAuthorizationIdentity(authorization, { projectId, operation, expectedHash }) {
  if (!authorization || typeof authorization !== 'object') refuse('unknown-authorization', 'No authorization was supplied for this operation.');
  if (actionAuthorizationHash(authorization) !== authorization.authorizationHash) {
    refuse('content-tampered', 'Authorization content no longer matches its immutable hash.');
  }
  if (!SHA256.test(String(expectedHash ?? '')) || expectedHash !== authorization.authorizationHash) {
    refuse('content-tampered', 'Authorization hash does not match the one the request names.');
  }
  if (authorization.projectId !== projectId) {
    refuse('wrong-project', `Authorization is for project ${authorization.projectId}, not ${projectId}.`);
  }
  if (authorization.operation !== operation) {
    refuse('wrong-operation', `Authorization permits ${authorization.operation}, not ${operation}.`);
  }
  return authorization;
}

/**
 * Is using it allowed, right now, for exactly this?
 *
 * Order matters. Terminal facts are reported before recoverable ones: a caller
 * told its base drifted will restore the base and try again, and no restoration
 * makes a consumed or revoked authorization usable. Reporting the recoverable
 * problem first would send somebody to fix the wrong thing.
 */
export function assertActionAuthorizationUsable(authorization, {
  projectId,
  operation,
  expectedHash,
  currentBaseDigest,
  environment,
  requestedScope = null,
  requestedBudget = null,
  consumedAt = null,
  revokedAt = null,
  now = new Date().toISOString(),
}) {
  const checked = assertActionAuthorizationIdentity(authorization, { projectId, operation, expectedHash });

  if (revokedAt) refuse('revoked', `Authorization ${checked.authorizationId} was revoked at ${revokedAt}.`);
  if (consumedAt) refuse('already-consumed', `Authorization ${checked.authorizationId} was already used at ${consumedAt}; single-use means once.`);
  if (Date.parse(now) >= Date.parse(checked.expiresAt)) {
    refuse('expired', `Authorization ${checked.authorizationId} expired at ${checked.expiresAt}.`);
  }
  if (environment !== undefined && environment !== checked.scope.environment) {
    refuse('wrong-environment', `Authorization is for the ${checked.scope.environment} environment, not ${environment}.`);
  }
  if (!SHA256.test(String(currentBaseDigest ?? '')) || currentBaseDigest !== checked.base.digest) {
    refuse('base-drifted', `The ${checked.base.kind} this authorization was granted against has changed since it was approved.`);
  }

  if (requestedScope) {
    const uncovered = scopeCovers(checked.scope.files, requestedScope);
    if (uncovered.length) refuse('scope-widened', `Authorization does not cover ${uncovered.join(', ')}.`);
  }

  if (requestedBudget) {
    const over = Object.entries(requestedBudget)
      .filter(([key, value]) => Object.hasOwn(checked.budget, key) && Number(value) > Number(checked.budget[key]))
      .map(([key, value]) => `${key} ${value} > ${checked.budget[key]}`);
    if (over.length) refuse('budget-exceeded', `Authorization budget does not cover ${over.join(', ')}.`);
  }

  return checked;
}
