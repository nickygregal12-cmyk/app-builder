/**
 * The one place a decision is taken about changing durable factory state.
 *
 * The approved-build-plan path is strong: it fingerprints every approved input,
 * freezes them, refuses when the project has drifted since approval, and can be
 * spent only once. It guarded `project.generate`. And `project.generate` was
 * also reachable by posting to the HTTP service, by an MCP tool, by a broker
 * operation and by any in-process caller, none of which asked for a plan — so
 * an owner could approve a contract, and the build that shipped could be one
 * that never went near it.
 *
 * The fix is not another check beside the existing one. It is that there is one
 * decision, every mutating operation goes through it, and the operations are
 * enumerated in `config/mutating-operations.json` rather than discovered by
 * reading the router. An operation with no entry is refused, so a new mutating
 * route cannot arrive unguarded — which is the property that keeps this closed
 * after everyone has forgotten why it was opened.
 *
 * Three things are worth being precise about.
 *
 * **There are three ways in, not five.** An HTTP request, a broker socket
 * message, and an in-process call. The Builder Console and the MCP adapter are
 * clients of the first two; they have no private door. A decision taken here is
 * therefore taken for all of them, and "the Console cannot bypass this" is a
 * fact about the topology rather than a check that has to be repeated.
 *
 * **The surface is observed, not claimed.** It comes from the entry point that
 * called `runOnSurface`, held in async-local storage for the life of that call.
 * A caller that could name its own surface could name a more privileged one.
 * Nothing untagged is trusted upward: the default is `internal`, which is the
 * least privileged interpretation, not the most.
 *
 * **`recorded` is a decision.** It is not the absence of one. The distinction
 * that matters downstream is which basis an artifact was produced under — an
 * approved plan, an ActionAuthorization, or ordinary workspace policy — and a
 * lifecycle that wants to know whether a revision may be released has to be
 * able to ask. So every outcome is written to the ledger before the operation
 * runs, and the basis travels with it.
 */

import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createEvent } from '@app-builder/control-plane';
import { AuthorizationError } from '@app-builder/control-plane/action-authorization';

const REGISTRY_URL = new URL('../../../config/mutating-operations.json', import.meta.url);

export const MUTATION_SURFACES = Object.freeze(['http', 'broker', 'internal']);
export const AUTHORIZATION_MODES = Object.freeze(['recorded', 'required', 'required-after-contract-approval']);

let cached = null;

export function readMutatingOperations() {
  if (!cached) {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_URL, 'utf8'));
    const operations = new Map();
    for (const operation of registry.operations) {
      if (operations.has(operation.id)) throw new Error(`config/mutating-operations.json declares ${operation.id} twice; two entries for one operation would be decided by read order.`);
      if (!AUTHORIZATION_MODES.includes(operation.authorization)) {
        throw new Error(`config/mutating-operations.json gives ${operation.id} an unsupported authorization mode: ${operation.authorization}`);
      }
      operations.set(operation.id, Object.freeze({ ...operation }));
    }
    cached = Object.freeze({ registry, operations });
  }
  return cached;
}

export function mutatingOperation(id) {
  return readMutatingOperations().operations.get(id) ?? null;
}

const surfaceStorage = new AsyncLocalStorage();

/**
 * Run an entry point's work with its surface attached. HTTP wraps a request,
 * the broker wraps an operation, and anything else is in-process by omission.
 */
export function runOnSurface(surface, callback) {
  if (!MUTATION_SURFACES.includes(surface)) throw new Error(`Unknown mutation surface: ${surface}`);
  return surfaceStorage.run(surface, callback);
}

export function currentSurface() {
  return surfaceStorage.getStore() ?? 'internal';
}

export class MutationRefused extends Error {
  constructor(refusal, message) {
    super(message);
    this.name = 'MutationRefused';
    this.refusal = refusal;
  }
}

/**
 * The synchronous half, for the two operations that have no ledger to write to.
 *
 * `project.create` creates the project every event stream is keyed on, and
 * `project.intake.approve` mints a bundle from an intake rather than acting on
 * a project at all. Neither has a stream to record a decision into at the
 * moment the decision is taken, and making them async to solve that would
 * change fifty call sites to record an event into nothing.
 *
 * So they are decided and not recorded, which the registry states outright. The
 * enforcement that matters is intact: an unregistered operation is refused, and
 * one that has been escalated to require an authorization is refused here too
 * rather than silently taking the synchronous path around it.
 */
export function assertMutationRegistered(operationId) {
  const operation = mutatingOperation(operationId);
  if (!operation) {
    throw new MutationRefused('unregistered-operation', `${operationId} is not a registered mutating operation. Register it in config/mutating-operations.json.`);
  }
  if (operation.authorization !== 'recorded') {
    throw new MutationRefused('authorization-required', `${operationId} requires an authorization and cannot be decided synchronously; it needs an operation that can record its decision.`);
  }
  return operation;
}

/**
 * Audit writes must never replace the decision they are about. A ledger failure
 * is already visible at the store boundary; letting it throw from here would
 * turn "refused: no authorization" into "refused: could not write an event".
 */
async function record(service, projectId, type, payload) {
  if (!projectId) return;
  try {
    await service.store.recordEvent(createEvent({ projectId, type, actor: 'factory-service', payload }));
  } catch {
    // Deliberately swallowed; see above.
  }
}

function hasApprovedContract(service, projectId) {
  if (!projectId || typeof service?.hasApprovedBuildPlan !== 'function') return false;
  try {
    return service.hasApprovedBuildPlan(projectId);
  } catch {
    // A project that cannot be read has not been shown to have an approved
    // contract, and this function only ever raises the bar, so failing closed
    // here would refuse operations on projects that do not exist yet.
    return false;
  }
}

/**
 * Decide, record, and return the basis.
 *
 * Returns `{ operation, surface, basis, authorizationId }`. Throws
 * `MutationRefused` — or the underlying `AuthorizationError` — rather than
 * returning a falsy result, because a caller that forgets to check a boolean is
 * exactly the bypass this exists to prevent.
 */
export async function decideMutation(service, operationId, projectId, options = {}) {
  const surface = currentSurface();
  const operation = mutatingOperation(operationId);

  if (!operation) {
    await record(service, projectId, 'mutation.refused', { operation: operationId, surface, refusal: 'unregistered-operation' });
    throw new MutationRefused('unregistered-operation', `${operationId} is not a registered mutating operation, so there is no decision to take about it. Register it in config/mutating-operations.json.`);
  }

  const mode = operation.authorization === 'required-after-contract-approval'
    ? (hasApprovedContract(service, projectId) ? 'required' : 'recorded')
    : operation.authorization;

  if (mode === 'recorded') {
    const decision = {
      operation: operation.id,
      surface,
      basis: operation.authorization === 'required-after-contract-approval' ? 'workspace-policy-before-contract-approval' : 'workspace-policy',
      risk: operation.risk,
      environment: operation.environment,
      authorizationId: null,
    };
    await record(service, projectId, 'mutation.decided', decision);
    return decision;
  }

  // `satisfiedBy` names an older, narrower authorization that already holds the
  // guarantees this decision would ask for. It is decided here so there is one
  // record; it is still a second document, and migrating it is named work.
  if (operation.satisfiedBy && options.satisfiedBy === operation.satisfiedBy) {
    const decision = {
      operation: operation.id,
      surface,
      basis: operation.satisfiedBy,
      risk: operation.risk,
      environment: operation.environment,
      authorizationId: options.authorizationId ?? null,
    };
    await record(service, projectId, 'mutation.decided', decision);
    return decision;
  }

  if (!options.authorization?.authorizationId) {
    const because = operation.authorization === 'required-after-contract-approval'
      ? `${projectId} has an approved build plan, so ${operation.id} is only reachable through it. Execute the approved plan instead of building around it.`
      : `${operation.id} requires an ActionAuthorization.`;
    await record(service, projectId, 'mutation.refused', {
      operation: operation.id, surface, refusal: 'authorization-missing', risk: operation.risk, environment: operation.environment,
    });
    throw new MutationRefused('authorization-missing', `Refused on the ${surface} surface: ${because}`);
  }

  // Delegated so the authorization's own semantics — identity, drift, expiry,
  // revocation, scope, budget and consume-once — are decided in one place
  // rather than re-implemented per operation.
  let permitted;
  try {
    permitted = await service.authorizeAction(projectId, {
      operation: operation.id,
      authorizationId: options.authorization.authorizationId,
      expectedAuthorizationHash: options.authorization.authorizationHash,
      currentBaseDigest: options.currentBaseDigest,
      environment: operation.environment,
      requestedScope: options.requestedScope ?? null,
      requestedBudget: options.requestedBudget ?? null,
      idempotencyKey: options.idempotencyKey ?? null,
    });
  } catch (error) {
    await record(service, projectId, 'mutation.refused', {
      operation: operation.id,
      surface,
      refusal: error instanceof AuthorizationError ? error.refusal : 'authorization-refused',
      risk: operation.risk,
      environment: operation.environment,
    });
    throw error;
  }

  const decision = {
    operation: operation.id,
    surface,
    basis: 'action-authorization',
    risk: operation.risk,
    environment: operation.environment,
    authorizationId: permitted.authorization.authorizationId,
  };
  await record(service, projectId, 'mutation.decided', decision);
  return decision;
}
