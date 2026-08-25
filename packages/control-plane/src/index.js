import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const TASK_STATES = Object.freeze(['queued', 'running', 'blocked', 'awaiting-approval', 'succeeded', 'failed', 'cancelled']);
export const TRUST_LEVELS = Object.freeze(['factory-trusted', 'user-verified', 'user-supplied', 'external-trusted', 'external-untrusted', 'ai-generated']);
export const INSTRUCTION_AUTHORITIES = Object.freeze(['none', 'user', 'factory']);

const TRANSITIONS = Object.freeze({
  queued: new Set(['running', 'cancelled']),
  running: new Set(['blocked', 'awaiting-approval', 'succeeded', 'failed', 'cancelled']),
  blocked: new Set(['running', 'cancelled', 'failed']),
  'awaiting-approval': new Set(['running', 'cancelled', 'failed']),
  succeeded: new Set(),
  failed: new Set(['queued']),
  cancelled: new Set(['queued']),
});

export function stableHash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return createHash('sha256').update(text).digest('hex');
}

function requireText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function requireStringArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must be ${nonEmpty ? 'a non-empty ' : 'an '}array of non-empty strings.`);
  }
  return value.map((item) => item.trim());
}

function numeric(value, fallback, minimum = 0) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new Error(`Expected number >= ${minimum}.`);
  return parsed;
}

export function createTask(spec, now = new Date().toISOString()) {
  const objective = requireText(spec?.objective, 'Task objective');
  const projectId = requireText(spec?.projectId, 'Task projectId');
  const acceptanceCriteria = requireStringArray(spec?.acceptanceCriteria, 'Task acceptanceCriteria', { nonEmpty: true });
  const budget = spec?.budget ?? {};
  return {
    schemaVersion: 1,
    id: spec.id ?? `task-${randomUUID()}`,
    projectId,
    parentTaskId: spec.parentTaskId ?? null,
    objective,
    acceptanceCriteria,
    dependencies: requireStringArray(spec.dependencies ?? [], 'Task dependencies'),
    policyId: requireText(spec.policyId ?? 'implementation', 'Task policyId'),
    requestedSkills: requireStringArray(spec.requestedSkills ?? [], 'Task requestedSkills'),
    budget: {
      maxIterations: Math.trunc(numeric(budget.maxIterations, 8, 1)),
      maxRuntimeMs: Math.trunc(numeric(budget.maxRuntimeMs, 45 * 60 * 1000, 1000)),
      maxCostGbp: numeric(budget.maxCostGbp, 5, 0),
      maxTokens: Math.trunc(numeric(budget.maxTokens, 120000, 0)),
      maxNoProgressAttempts: Math.trunc(numeric(budget.maxNoProgressAttempts, 2, 1)),
    },
    state: 'queued',
    attempt: 0,
    latestCheckpointId: null,
    stopReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function transitionTask(task, nextState, details = {}, now = new Date().toISOString()) {
  if (!TASK_STATES.includes(nextState)) throw new Error(`Unknown task state: ${nextState}`);
  if (!TRANSITIONS[task.state]?.has(nextState)) throw new Error(`Invalid task transition: ${task.state} -> ${nextState}`);
  return {
    ...task,
    state: nextState,
    attempt: details.incrementAttempt ? task.attempt + 1 : task.attempt,
    latestCheckpointId: details.latestCheckpointId ?? task.latestCheckpointId ?? null,
    stopReason: details.stopReason ?? (['succeeded', 'queued', 'running'].includes(nextState) ? null : task.stopReason ?? null),
    updatedAt: now,
  };
}

export function createEvent(input, now = new Date().toISOString()) {
  const usage = input.usage ?? {};
  return {
    schemaVersion: 1,
    id: input.id ?? `event-${randomUUID()}`,
    type: requireText(input.type, 'Event type'),
    projectId: requireText(input.projectId, 'Event projectId'),
    taskId: input.taskId ?? null,
    parentEventId: input.parentEventId ?? null,
    correlationId: input.correlationId ?? null,
    actor: requireText(input.actor ?? 'factory', 'Event actor'),
    timestamp: now,
    payload: input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {},
    usage: {
      model: usage.model ?? null,
      inputTokens: Math.trunc(numeric(usage.inputTokens, 0, 0)),
      outputTokens: Math.trunc(numeric(usage.outputTokens, 0, 0)),
      costGbp: numeric(usage.costGbp, 0, 0),
      durationMs: Math.trunc(numeric(usage.durationMs, 0, 0)),
      cacheHit: Boolean(usage.cacheHit),
    },
  };
}

export async function appendEvent(filePath, event) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf8');
}

export async function readEvents(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function normalizedRepositoryPath(value) {
  const candidate = String(value ?? '').trim().replaceAll('\\', '/');
  if (!candidate || candidate.includes('\0')) return null;
  if (candidate.startsWith('/') || candidate.startsWith('//') || /^[A-Za-z]:\//.test(candidate)) return null;
  if (candidate.endsWith('/') || candidate.includes('//')) return null;
  const segments = candidate.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function normalizedScopeRule(value, label) {
  const candidate = String(value ?? '').trim().replaceAll('\\', '/');
  if (candidate === '*') return candidate;
  if (!candidate || candidate.includes('\0')) throw new Error(`${label} contains an invalid scope rule.`);
  if (candidate.startsWith('/') || candidate.startsWith('//') || /^[A-Za-z]:\//.test(candidate) || candidate.includes('//')) {
    throw new Error(`${label} must contain repository-relative scope rules.`);
  }

  let suffix = '';
  if (candidate.endsWith('/**')) suffix = '/**';
  else if (candidate.endsWith('*')) suffix = '*';
  else if (candidate.endsWith('/')) suffix = '/';

  const stem = suffix ? candidate.slice(0, -suffix.length) : candidate;
  if (!stem || stem.includes('*')) throw new Error(`${label} contains an unsupported scope rule: ${candidate}`);
  const segments = stem.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`${label} contains an unsafe scope rule: ${candidate}`);
  }
  return `${segments.join('/')}${suffix}`;
}

function scopeRules(value, label, options) {
  return requireStringArray(value, label, options).map((rule) => normalizedScopeRule(rule, label));
}

function scopeMatches(file, rule) {
  if (rule === '*') return true;
  if (rule.endsWith('/**')) {
    const directory = rule.slice(0, -3);
    return file === directory || file.startsWith(`${directory}/`);
  }
  if (rule.endsWith('*')) return file.startsWith(rule.slice(0, -1));
  if (rule.endsWith('/')) return file.startsWith(rule);
  return file === rule;
}

export function createChangeSet(input, now = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    id: input.id ?? `changeset-${randomUUID()}`,
    taskId: requireText(input.taskId, 'ChangeSet taskId'),
    objective: requireText(input.objective, 'ChangeSet objective'),
    expectedFiles: scopeRules(input.expectedFiles ?? [], 'ChangeSet expectedFiles'),
    allowedFiles: scopeRules(input.allowedFiles, 'ChangeSet allowedFiles', { nonEmpty: true }),
    forbiddenFiles: scopeRules(input.forbiddenFiles ?? [], 'ChangeSet forbiddenFiles'),
    acceptanceChecks: requireStringArray(input.acceptanceChecks, 'ChangeSet acceptanceChecks', { nonEmpty: true }),
    securityImpact: String(input.securityImpact ?? 'none').trim() || 'none',
    rollback: requireText(input.rollback, 'ChangeSet rollback'),
    createdAt: now,
  };
}

export function validateChangeSetResult(changeSet, actualFiles) {
  const originalFiles = [...new Set(requireStringArray(actualFiles, 'Actual files'))];
  const entries = originalFiles.map((original) => ({ original, normalized: normalizedRepositoryPath(original) }));
  const invalidPaths = entries.filter((entry) => entry.normalized === null).map((entry) => entry.original);
  const files = [...new Set(entries.filter((entry) => entry.normalized !== null).map((entry) => entry.normalized))];
  const forbiddenHits = files.filter((file) => changeSet.forbiddenFiles.some((rule) => scopeMatches(file, rule)));
  const outOfScope = [
    ...invalidPaths,
    ...files.filter((file) => !changeSet.allowedFiles.some((rule) => scopeMatches(file, rule))),
  ];
  const unexpectedFiles = changeSet.expectedFiles.length > 0
    ? [
        ...invalidPaths,
        ...files.filter((file) => !changeSet.expectedFiles.some((rule) => scopeMatches(file, rule))),
      ]
    : [];
  return {
    ok: forbiddenHits.length === 0 && outOfScope.length === 0,
    forbiddenHits,
    outOfScope,
    unexpectedFiles,
    invalidPaths,
  };
}

export function normalizeContextItem(item) {
  const kind = item.kind ?? 'source-data';
  let trustLevel = item.trustLevel ?? 'external-untrusted';
  let instructionAuthority = 'none';
  if (kind === 'factory-authority') {
    trustLevel = 'factory-trusted';
    instructionAuthority = 'factory';
  } else if (kind === 'user-instruction') {
    trustLevel = item.trustLevel ?? 'user-verified';
    instructionAuthority = 'user';
  } else if (kind === 'generated-data') {
    trustLevel = 'ai-generated';
  } else if (kind === 'source-data' && !item.trustLevel) {
    trustLevel = item.provenance === 'user-supplied' ? 'user-supplied' : 'external-untrusted';
  }
  if (!TRUST_LEVELS.includes(trustLevel)) throw new Error(`Unknown trust level: ${trustLevel}`);
  return {
    schemaVersion: 1,
    id: item.id ?? `context-${randomUUID()}`,
    kind,
    trustLevel,
    instructionAuthority,
    sourceId: item.sourceId ?? null,
    content: item.content,
    provenance: item.provenance ?? null,
  };
}

export function buildResumePacket(input) {
  const task = input.task;
  if (!task?.id) throw new Error('Resume packet requires a durable task.');
  return {
    schemaVersion: 1,
    projectId: task.projectId,
    task,
    buildContract: input.buildContract ?? null,
    manifest: input.manifest ?? null,
    knowledgePack: input.knowledgePack ? {
      semanticHash: input.knowledgePack.semanticHash ?? input.knowledgePack.hash ?? null,
      facts: input.knowledgePack.facts ?? [],
      requirements: input.knowledgePack.requirements ?? [],
      references: input.knowledgePack.references ?? [],
    } : null,
    checkpoint: input.checkpoint ?? null,
    changeSet: input.changeSet ?? null,
    failures: (input.failures ?? []).slice(0, 50),
    context: (input.context ?? []).slice(0, 100).map(normalizeContextItem),
    selectedSkills: requireStringArray(input.selectedSkills ?? [], 'Selected skills'),
    remainingBudget: input.remainingBudget ?? null,
    nextAction: input.nextAction ?? input.checkpoint?.nextAction ?? null,
  };
}

export function evaluateLoopGuard(input) {
  const task = input.task;
  const budget = task.budget;
  const checks = [
    [input.attempt >= budget.maxIterations, 'iteration-budget-exhausted'],
    [input.elapsedMs >= budget.maxRuntimeMs, 'runtime-budget-exhausted'],
    [input.spentGbp >= budget.maxCostGbp, 'cost-budget-exhausted'],
    [input.spentTokens >= budget.maxTokens, 'token-budget-exhausted'],
    [input.consecutiveNoProgress >= budget.maxNoProgressAttempts, 'no-progress-limit-reached'],
  ];
  const hit = checks.find(([condition]) => condition);
  return hit ? { stop: true, reason: hit[1] } : { stop: false, reason: null };
}

export function assertAgentActionAllowed(policy, action, approvedActions = []) {
  if (policy.deny?.includes(action)) return { allowed: false, requiresApproval: false, reason: 'explicitly-denied' };
  if (policy.approvalRequired?.includes(action) && !approvedActions.includes(action)) {
    return { allowed: false, requiresApproval: true, reason: 'approval-required' };
  }
  if (policy.allow?.includes(action)) return { allowed: true, requiresApproval: false, reason: null };
  return { allowed: false, requiresApproval: false, reason: 'deny-by-default' };
}

export function createCheckpoint(input, now = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    id: input.id ?? `checkpoint-${randomUUID()}`,
    projectId: requireText(input.projectId, 'Checkpoint projectId'),
    taskId: requireText(input.taskId, 'Checkpoint taskId'),
    repoRef: requireText(input.repoRef, 'Checkpoint repoRef'),
    commitSha: input.commitSha ?? null,
    changeSetId: input.changeSetId ?? null,
    summary: requireText(input.summary, 'Checkpoint summary'),
    filesChanged: requireStringArray(input.filesChanged ?? [], 'Checkpoint filesChanged'),
    failures: requireStringArray(input.failures ?? [], 'Checkpoint failures'),
    artifacts: requireStringArray(input.artifacts ?? [], 'Checkpoint artifacts'),
    nextAction: requireText(input.nextAction, 'Checkpoint nextAction'),
    createdAt: now,
  };
}

export function scoreBenchmark(result, weights) {
  const entries = Object.entries(weights ?? {});
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight || 0), 0);
  if (totalWeight <= 0) throw new Error('Benchmark weights must contain a positive total weight.');
  const earned = entries.reduce((sum, [gate, weight]) => sum + (result.gates?.[gate] === true ? Number(weight || 0) : 0), 0);
  return {
    score: Number(((earned / totalWeight) * 100).toFixed(2)),
    passed: earned === totalWeight,
    failedGates: entries.filter(([gate]) => result.gates?.[gate] !== true).map(([gate]) => gate),
    costGbp: numeric(result.costGbp, 0, 0),
    durationMs: Math.trunc(numeric(result.durationMs, 0, 0)),
    interventions: Math.trunc(numeric(result.interventions, 0, 0)),
  };
}
