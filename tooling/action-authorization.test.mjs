/**
 * One authorization decision, and every way somebody could get past it.
 *
 * `ApprovedBuildPlan` already held these guarantees for `project.generate`, and
 * the same effect was reachable through four routes that asked for nothing. So
 * this suite is almost entirely refusals, and each one is a route somebody
 * could otherwise take: a hash that no longer matches its content, an
 * authorization for a different project, a different operation, a different
 * environment, a base that moved, an expiry that passed, a revocation, a second
 * use, a scope quietly widened, a budget quietly raised, and a proposer
 * approving its own request.
 *
 * The race is tested rather than reasoned about. Two callers reading "not yet
 * consumed" and both proceeding is the failure single-use exists to prevent,
 * and a read-then-write cannot stop it — so the test spends one authorization
 * from several callers at once and asserts that exactly one wins.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateContract } from '@app-builder/contracts';
import {
  AUTHORIZATION_REFUSALS,
  AuthorizationError,
  actionAuthorizationHash,
  assertActionAuthorizationIdentity,
  assertActionAuthorizationUsable,
  mintActionAuthorization,
  ruleCovers,
  scopeCovers,
} from '@app-builder/control-plane/action-authorization';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import {
  approveActionAuthorization,
  authorizeAction,
  getProjectActionAuthorization,
  listProjectActionAuthorizations,
  revokeProjectActionAuthorization,
} from '../apps/service/src/action-authorization-service.js';

const BASE = 'a'.repeat(64);
const OTHER_BASE = 'b'.repeat(64);
const APPROVED_AT = '2026-01-01T00:00:00.000Z';
const EXPIRES_AT = '2026-01-01T01:00:00.000Z';
const DURING = '2026-01-01T00:30:00.000Z';
const AFTER = '2026-01-01T02:00:00.000Z';

function spec(overrides = {}) {
  return {
    projectId: 'project-1',
    operation: 'project.generate',
    base: { kind: 'project-state', digest: BASE },
    scope: { files: ['src/**', 'public/**'], environment: 'workspace', risk: 'medium' },
    budget: { maxCostGbp: 2, maxTokens: 50000, maxRuntimeMs: 900000, maxIterations: 3 },
    idempotencyKey: 'attempt-1',
    expiresAt: EXPIRES_AT,
    proposedBy: 'builder',
    approval: { mode: 'explicit-local-operator', approvalId: 'approval-1', approvedBy: 'owner', approvedAt: APPROVED_AT },
    ...overrides,
  };
}

function usage(overrides = {}) {
  return {
    projectId: 'project-1',
    operation: 'project.generate',
    currentBaseDigest: BASE,
    environment: 'workspace',
    now: DURING,
    ...overrides,
  };
}

function refusalOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof AuthorizationError, `expected an AuthorizationError, got ${error?.name}: ${error?.message}`);
    assert.ok(AUTHORIZATION_REFUSALS.includes(error.refusal), `${error.refusal} is not a declared refusal`);
    return error.refusal;
  }
  return assert.fail('expected a refusal and got none');
}

test('a minted authorization is contract-valid and binds everything it is about', () => {
  const authorization = mintActionAuthorization(spec());
  assert.deepEqual(validateContract('action-authorization', authorization), []);
  assert.equal(authorization.singleUse, true);
  assert.equal(authorization.base.digest, BASE);
  assert.equal(authorization.scope.environment, 'workspace');
  assert.equal(actionAuthorizationHash(authorization), authorization.authorizationHash);
  assert.deepEqual(
    assertActionAuthorizationIdentity(authorization, { projectId: 'project-1', operation: 'project.generate', expectedHash: authorization.authorizationHash }),
    authorization,
  );
});

test('a proposer cannot authorize its own request', () => {
  assert.equal(refusalOf(() => mintActionAuthorization(spec({
    proposedBy: 'model-builder',
    approval: { mode: 'explicit-local-operator', approvalId: 'approval-1', approvedBy: 'model-builder', approvedAt: APPROVED_AT },
  }))), 'self-approved');
});

test('minting refuses a document that could not be evidence later', () => {
  const cases = [
    [spec({ base: { kind: 'project-state', digest: 'not-a-digest' } }), /exact SHA-256 base digest/],
    [spec({ base: { kind: 'whatever', digest: BASE } }), /base kind is unsupported/],
    [spec({ scope: { files: [], environment: 'workspace', risk: 'low' } }), /an absent scope is not an unlimited one/],
    [spec({ scope: { files: ['../escape/**'], environment: 'workspace', risk: 'low' } }), /unsafe scope rule/],
    [spec({ scope: { files: ['/absolute/**'], environment: 'workspace', risk: 'low' } }), /repository-relative/],
    [spec({ scope: { files: ['src/**'], environment: 'the-internet', risk: 'low' } }), /environment is unsupported/],
    [spec({ scope: { files: ['src/**'], environment: 'workspace', risk: 'catastrophic' } }), /risk class is unsupported/],
    [spec({ operation: 'Project.Generate' }), /not a registered operation name/],
    [spec({ expiresAt: APPROVED_AT }), /permits nothing and would refuse every use/],
    [spec({ approval: { mode: 'implied', approvalId: 'a', approvedBy: 'owner', approvedAt: APPROVED_AT } }), /explicit local operator approval/],
    [spec({ budget: { maxCostGbp: -1, maxTokens: 0, maxRuntimeMs: 0, maxIterations: 1 } }), /maxCostGbp must be a number >= 0/],
    [spec({ budget: { maxCostGbp: 1, maxTokens: 0, maxRuntimeMs: 0, maxIterations: 0 } }), /maxIterations must be an integer >= 1/],
  ];
  for (const [input, expected] of cases) {
    assert.throws(() => mintActionAuthorization(input), expected, `minting should refuse ${JSON.stringify(input.scope ?? input.operation ?? input.expiresAt)}`);
  }
});

test('every way of presenting the wrong authorization is refused, and named', () => {
  const authorization = mintActionAuthorization(spec());
  const hash = authorization.authorizationHash;

  assert.equal(refusalOf(() => assertActionAuthorizationUsable(null, usage({ expectedHash: hash }))), 'unknown-authorization');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable({ ...authorization, scope: { ...authorization.scope, environment: 'production' } }, usage({ expectedHash: hash }))), 'content-tampered');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: OTHER_BASE }))), 'content-tampered');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, projectId: 'project-2' }))), 'wrong-project');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, operation: 'project.assets.replace' }))), 'wrong-operation');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, environment: 'production' }))), 'wrong-environment');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, currentBaseDigest: OTHER_BASE }))), 'base-drifted');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, now: AFTER }))), 'expired');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, revokedAt: DURING }))), 'revoked');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash, consumedAt: DURING }))), 'already-consumed');

  // The happy path, so the refusals above are refusals of something that works.
  assert.equal(assertActionAuthorizationUsable(authorization, usage({ expectedHash: hash })).authorizationId, authorization.authorizationId);
});

test('terminal facts are reported before recoverable ones', () => {
  // Told its base drifted, an operator restores the base and retries — and no
  // restoration makes a spent or revoked authorization usable. Reporting the
  // recoverable problem first sends somebody to fix the wrong thing.
  const authorization = mintActionAuthorization(spec());
  const both = usage({ expectedHash: authorization.authorizationHash, currentBaseDigest: OTHER_BASE, now: AFTER, consumedAt: DURING, revokedAt: DURING });
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, both)), 'revoked');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, { ...both, revokedAt: null })), 'already-consumed');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, { ...both, revokedAt: null, consumedAt: null })), 'expired');
});

test('scope can be narrowed and never widened', () => {
  assert.deepEqual(scopeCovers(['src/**'], ['src/pages/**', 'src/main.ts']), []);
  assert.deepEqual(scopeCovers(['*'], ['anything/**']), []);
  assert.deepEqual(scopeCovers(['src/pages/**'], ['src/**']), ['src/**'], 'asking for the parent of what was granted is widening');
  assert.deepEqual(scopeCovers(['src/**'], ['public/**']), ['public/**']);
  assert.deepEqual(scopeCovers(['src/main.ts'], ['src/main.ts']), []);
  assert.deepEqual(scopeCovers(['src/main.ts'], ['src/**']), ['src/**'], 'one file does not authorise its directory');

  // A prefix that is not a path boundary is not containment: `src/pages`
  // granted must not cover `src/pages-admin`.
  assert.equal(ruleCovers('src/pages/**', 'src/pages-admin/**'), false);
  assert.equal(ruleCovers('src/pages/**', 'src/pages/deep/**'), true);

  const authorization = mintActionAuthorization(spec());
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, usage({
    expectedHash: authorization.authorizationHash,
    requestedScope: ['src/**', 'infra/**'],
  }))), 'scope-widened');
  assert.doesNotThrow(() => assertActionAuthorizationUsable(authorization, usage({
    expectedHash: authorization.authorizationHash,
    requestedScope: ['src/pages/**'],
  })));
});

test('budget can be spent under and never over', () => {
  const authorization = mintActionAuthorization(spec());
  const at = (requestedBudget) => usage({ expectedHash: authorization.authorizationHash, requestedBudget });
  assert.doesNotThrow(() => assertActionAuthorizationUsable(authorization, at({ maxCostGbp: 1, maxTokens: 10 })));
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, at({ maxCostGbp: 2.5 }))), 'budget-exceeded');
  assert.equal(refusalOf(() => assertActionAuthorizationUsable(authorization, at({ maxIterations: 4 }))), 'budget-exceeded');
});

function manifest(slug) {
  return {
    schemaVersion: 2,
    project: { name: 'Authorization Test', slug, type: 'marketing-site', primaryGoal: 'Prove one authorization decision guards every route.' },
    audience: { summary: 'Test users', roles: [] },
    journeys: ['Read the generated site'],
    majorSurfaces: ['Home', 'Contact'],
    entities: [],
    company: { identity: { name: 'Authorization Test' }, services: ['Survey'], locations: ['Glasgow'], contactDetails: { email: 'hello@example.com' }, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: {
      hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '',
      integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [],
    },
    outOfScope: [],
  };
}

function factory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-authorization-'));
  const store = new FactoryStore({ stateRoot: path.join(root, 'state') });
  const service = new FactoryService({ store, workspacesRoot: path.join(root, 'workspaces') });
  const project = service.createProject({ id: 'project-1', manifest: manifest('authorization-test') });
  return { root, store, service, project, async close() { await service.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('the service mints, lists, revokes and spends an authorization exactly once', async () => {
  const harness = factory();
  try {
    const { service } = harness;
    const authorization = await approveActionAuthorization(service, 'project-1', spec());
    assert.deepEqual(validateContract('action-authorization', authorization), []);

    // One approval id is one approval, however many times the operator clicks.
    const again = await approveActionAuthorization(service, 'project-1', spec());
    assert.equal(again.authorizationId, authorization.authorizationId);
    assert.equal(listProjectActionAuthorizations(service, 'project-1').length, 1);

    const found = getProjectActionAuthorization(service, 'project-1', authorization.authorizationId);
    assert.equal(found.state.consumedAt, null);
    assert.equal(found.state.revokedAt, null);

    const permitted = await authorizeAction(service, 'project-1', {
      operation: 'project.generate',
      authorizationId: authorization.authorizationId,
      expectedAuthorizationHash: authorization.authorizationHash,
      currentBaseDigest: BASE,
      environment: 'workspace',
      now: () => new Date(DURING),
    });
    assert.equal(permitted.authorization.authorizationId, authorization.authorizationId);
    assert.equal(permitted.consumption.idempotencyKey, 'attempt-1');

    // Single use means once, including for the attempt that already used it.
    await assert.rejects(
      () => authorizeAction(service, 'project-1', {
        operation: 'project.generate',
        authorizationId: authorization.authorizationId,
        expectedAuthorizationHash: authorization.authorizationHash,
        currentBaseDigest: BASE,
        environment: 'workspace',
        now: () => new Date(DURING),
      }),
      // A sequential retry is caught by the recorded consumption before it ever
      // reaches the insert; the insert is what catches a simultaneous one, and
      // the race test below is where that path is exercised.
      (error) => error.refusal === 'already-consumed',
    );

    const types = service.listEvents('project-1').map((event) => event.type);
    assert.ok(types.includes('action-authorization.approved'));
    assert.ok(types.includes('action-authorization.permitted'));
    assert.ok(types.includes('action-authorization.refused'), 'a refusal is recorded as durably as a permission');
  } finally {
    await harness.close();
  }
});

test('exactly one of several simultaneous callers spends a single-use authorization', async () => {
  const harness = factory();
  try {
    const { service } = harness;
    const authorization = await approveActionAuthorization(service, 'project-1', spec());
    const attempt = (index) => authorizeAction(service, 'project-1', {
      operation: 'project.generate',
      authorizationId: authorization.authorizationId,
      expectedAuthorizationHash: authorization.authorizationHash,
      currentBaseDigest: BASE,
      environment: 'workspace',
      idempotencyKey: `racer-${index}`,
      now: () => new Date(DURING),
    });

    const outcomes = await Promise.allSettled([attempt(1), attempt(2), attempt(3), attempt(4)]);
    const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    assert.equal(winners.length, 1, 'a read-then-write would let more than one caller through here');
    for (const loser of outcomes.filter((outcome) => outcome.status === 'rejected')) {
      assert.equal(loser.reason.refusal, 'already-consumed');
    }
  } finally {
    await harness.close();
  }
});

test('a revoked authorization stays refused and cannot be revoked into life again', async () => {
  const harness = factory();
  try {
    const { service } = harness;
    const authorization = await approveActionAuthorization(service, 'project-1', spec());
    const revoked = await revokeProjectActionAuthorization(service, 'project-1', authorization.authorizationId, { revokedBy: 'owner', reason: 'Approved against the wrong base.' });
    assert.equal(revoked.revoked, true);
    assert.equal((await revokeProjectActionAuthorization(service, 'project-1', authorization.authorizationId, { revokedBy: 'owner' })).revoked, false, 'revoking twice is one revocation');

    await assert.rejects(
      () => authorizeAction(service, 'project-1', {
        operation: 'project.generate',
        authorizationId: authorization.authorizationId,
        expectedAuthorizationHash: authorization.authorizationHash,
        currentBaseDigest: BASE,
        environment: 'workspace',
        now: () => new Date(DURING),
      }),
      (error) => error.refusal === 'revoked',
    );

    await assert.rejects(
      () => revokeProjectActionAuthorization(service, 'project-1', 'authorization-does-not-exist-000000', { revokedBy: 'owner' }),
      (error) => error.refusal === 'unknown-authorization',
    );
  } finally {
    await harness.close();
  }
});

test('an authorization for one project is not an authorization for another', async () => {
  const harness = factory();
  try {
    const { service } = harness;
    const authorization = await approveActionAuthorization(service, 'project-1', spec());
    service.createProject({ id: 'project-2', manifest: manifest('other-project') });

    // Presented against the other project, it is not even findable — which is
    // the refusal, rather than a lookup that succeeds and a check that follows.
    await assert.rejects(
      () => authorizeAction(service, 'project-2', {
        operation: 'project.generate',
        authorizationId: authorization.authorizationId,
        expectedAuthorizationHash: authorization.authorizationHash,
        currentBaseDigest: BASE,
        environment: 'workspace',
        now: () => new Date(DURING),
      }),
      (error) => error.refusal === 'unknown-authorization',
    );
    assert.equal(getProjectActionAuthorization(service, 'project-2', authorization.authorizationId), null);
  } finally {
    await harness.close();
  }
});
