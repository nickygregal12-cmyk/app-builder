/**
 * The provider-neutral `ExecutionEnvironmentAdapter` lifecycle.
 *
 * The isolation spec says what an attempt sandbox *is*; a runtime driver says
 * how one runtime spells it. Neither of them runs anything. This module is the
 * missing middle: the thing the control plane actually calls to prepare, start,
 * observe, bound, stop, collect and dispose of an attempt, and to work out what
 * happened after a restart.
 *
 * ```text
 * control plane
 *    |
 * ExecutionEnvironmentAdapter      <- this file: lifecycle, budgets, evidence
 *    |
 * ExecutionDriver                  <- rootless Podman today, another runtime later
 *    |
 * isolated attempt
 * ```
 *
 * Nothing below names Podman, a container, an image format or a provider. The
 * driver contract is deliberately small — seven verbs, all of them things any
 * plausible runtime can do — because every verb added here is a verb a future
 * runtime must implement before it can replace the current one.
 *
 * Two properties are worth stating because they are the point:
 *
 * **Disposal is not optional.** Every terminal path runs through `dispose`,
 * including the failure paths, and `dispose` verifies with the driver that the
 * sandbox is really gone. An attempt whose sandbox outlived it is an orphan
 * holding a workspace, a socket mount and a grant.
 *
 * **Evidence is written as it happens, not at the end.** A supervisor that
 * dies mid-attempt must leave behind enough durable events to tell an operator
 * what was running, so each transition is journalled before the next begins.
 */

import {
  ATTEMPT_EVENT_TYPES,
  attemptEventPayload,
  reduceAttemptEvents,
  transitionAttempt,
} from './attempts.js';

/**
 * The whole runtime contract.
 *
 * `collect` is separate from `inspect` on purpose: status must be cheap and
 * non-blocking so a supervisor can poll it, while collection waits for the
 * attempt to finish and returns its structured result.
 */
export const EXECUTION_DRIVER_METHODS = Object.freeze(['create', 'start', 'inspect', 'collect', 'signal', 'remove', 'list']);

export const DEFAULT_STOP_GRACE_MS = 10_000;

export function assertExecutionDriver(driver) {
  if (!driver || typeof driver !== 'object') throw new Error('An execution driver is required.');
  const missing = EXECUTION_DRIVER_METHODS.filter((method) => typeof driver[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(`Execution driver is missing required operations: ${missing.join(', ')}. A partial driver cannot bound an attempt.`);
  }
  const id = String(driver.id ?? '').trim();
  if (!id) throw new Error('An execution driver must name itself, so durable evidence records which runtime ran the attempt.');
  return driver;
}

class AttemptNotFound extends Error {
  constructor(attemptId) {
    super(`No live attempt ${attemptId}. Recover it from the durable ledger before operating on it.`);
    this.name = 'AttemptNotFound';
    this.attemptId = attemptId;
  }
}

export class ExecutionEnvironmentAdapter {
  /**
   * @param {object} options
   * @param {object} options.driver   runtime implementation of `EXECUTION_DRIVER_METHODS`
   * @param {object} options.journal  durable sink: `record({ type, projectId, taskId, payload, usage })`
   */
  constructor({ driver, journal, clock = () => new Date(), timers = globalThis, stopGraceMs = DEFAULT_STOP_GRACE_MS }) {
    this.driver = assertExecutionDriver(driver);
    if (typeof journal?.record !== 'function') {
      throw new Error('An execution adapter requires a durable journal. An attempt with no evidence is an attempt nobody can review.');
    }
    this.journal = journal;
    this.clock = clock;
    this.timers = timers;
    this.stopGraceMs = stopGraceMs;
    this.live = new Map();
  }

  attempts() {
    return [...this.live.values()].map((entry) => entry.attempt);
  }

  status(attemptId) {
    const entry = this.live.get(attemptId);
    if (!entry) return null;
    return { ...entry.attempt, handle: entry.handle };
  }

  async #journal(attempt, type, extra = {}, usage = {}) {
    await this.journal.record({
      type,
      projectId: attempt.projectId,
      taskId: attempt.taskId,
      actor: `execution-adapter:${this.driver.id}`,
      payload: attemptEventPayload(attempt, { driver: this.driver.id, ...extra }),
      usage,
    });
  }

  #require(attemptId) {
    const entry = this.live.get(attemptId);
    if (!entry) throw new AttemptNotFound(attemptId);
    return entry;
  }

  /**
   * Prepare the sandbox without running anything in it.
   *
   * Splitting preparation from start is what makes a failed start
   * distinguishable from a failed attempt: a sandbox that could not be created
   * never ran the task, and recording it as a task failure would be a lie in
   * the evidence.
   */
  async createAttempt(plan, { command = [], environment = {} } = {}) {
    const { attempt: initial, spec, grantToken } = plan;
    if (this.live.has(initial.attemptId)) throw new Error(`Attempt ${initial.attemptId} is already live.`);
    let attempt = initial;
    const entry = { attempt, spec, handle: null, timer: null, result: null };
    this.live.set(attempt.attemptId, entry);

    await this.#journal(attempt, ATTEMPT_EVENT_TYPES.created, { command });
    try {
      const handle = await this.driver.create({
        attempt,
        spec,
        image: attempt.image,
        command,
        environment,
        // The token crosses into the driver so the driver can place it where
        // the spec says — a read-only file the sandbox mounts. It is never
        // journalled, and the record carries only its fingerprint.
        grantToken,
      });
      entry.handle = handle ?? null;
      attempt = transitionAttempt(attempt, 'starting', { containerId: String(handle ?? '') || null }, this.clock().toISOString());
      entry.attempt = attempt;
      await this.#journal(attempt, ATTEMPT_EVENT_TYPES.starting);
      return attempt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempt = transitionAttempt(attempt, 'exited', { exitReason: 'start-failed', stopReason: message, exitCode: null, failures: [message] }, this.clock().toISOString());
      entry.attempt = attempt;
      await this.#journal(attempt, ATTEMPT_EVENT_TYPES.exited);
      await this.dispose(attempt.attemptId);
      throw error;
    }
  }

  /**
   * Start the attempt and arm its wall clock.
   *
   * The timeout is armed here rather than at creation because the bound is on
   * execution, and a sandbox that sat prepared for an hour has not spent any
   * of the task's runtime budget.
   */
  async start(attemptId) {
    const entry = this.#require(attemptId);
    await this.driver.start(entry.handle);
    entry.attempt = transitionAttempt(entry.attempt, 'running', {}, this.clock().toISOString());
    await this.#journal(entry.attempt, ATTEMPT_EVENT_TYPES.started);

    const bound = Math.min(entry.attempt.limits.wallClockMs, entry.attempt.budget.maxRuntimeMs);
    entry.timer = this.timers.setTimeout(() => {
      // A timeout must not depend on anyone awaiting the attempt. Nothing here
      // is awaited: the stop is fire-and-forget precisely so a supervisor that
      // stopped polling still gets its sandbox reclaimed.
      this.#stop(attemptId, 'timed-out', `Attempt exceeded its ${bound}ms wall clock.`).catch(() => {});
    }, bound);
    // Deliberately referenced. An unreferenced wall clock lets the supervisor's
    // event loop drain while an attempt is still running, and a bound that the
    // supervisor can exit before enforcing is not a bound — it is how a sandbox
    // outlives the process that was meant to reclaim it.
    return entry.attempt;
  }

  /** Non-blocking runtime status, reconciled against the driver. */
  async inspect(attemptId) {
    const entry = this.#require(attemptId);
    const observed = await this.driver.inspect(entry.handle);
    return { attempt: entry.attempt, runtime: observed };
  }

  /**
   * Wait for the attempt to finish and return its structured result.
   *
   * The driver returns bytes and an exit code; the interpretation is here, so
   * every runtime reports success and failure the same way.
   */
  async collect(attemptId) {
    const entry = this.#require(attemptId);
    if (entry.result) return entry.result;
    const collected = await this.driver.collect(entry.handle);
    return this.#settle(attemptId, collected);
  }

  async #settle(attemptId, collected) {
    const entry = this.#require(attemptId);
    if (entry.result) return entry.result;
    this.#disarm(entry);

    const exitCode = collected?.exitCode ?? null;
    const forced = entry.forcedReason ?? null;
    const reason = forced ?? (exitCode === 0 ? 'completed' : 'failed');
    const failures = [];
    if (collected?.stderr) failures.push(String(collected.stderr).slice(0, 4000));

    if (entry.attempt.state !== 'exited' && entry.attempt.state !== 'disposed') {
      entry.attempt = transitionAttempt(
        entry.attempt,
        'exited',
        {
          exitReason: reason,
          exitCode,
          stopReason: entry.forcedDetail ?? (reason === 'failed' ? `Attempt exited with code ${exitCode}.` : null),
          failures,
          usage: { durationMs: collected?.durationMs ?? 0 },
        },
        this.clock().toISOString(),
      );
      await this.#journal(entry.attempt, ATTEMPT_EVENT_TYPES.exited, { result: collected?.result ?? null }, { durationMs: collected?.durationMs ?? 0 });
    }

    entry.result = {
      attempt: entry.attempt,
      exitCode,
      exitReason: entry.attempt.exitReason,
      stdout: collected?.stdout ?? '',
      stderr: collected?.stderr ?? '',
      result: collected?.result ?? null,
      timedOut: entry.attempt.exitReason === 'timed-out',
      cancelled: entry.attempt.exitReason === 'cancelled',
    };
    return entry.result;
  }

  #disarm(entry) {
    if (entry.timer) {
      this.timers.clearTimeout(entry.timer);
      entry.timer = null;
    }
  }

  /**
   * Ask the attempt to stop, then make it stop.
   *
   * A cancel that only sends a polite signal is a cancel a hung task can
   * ignore. The grace period is the courtesy; the kill is the guarantee.
   */
  async #stop(attemptId, reason, detail) {
    const entry = this.live.get(attemptId);
    if (!entry || entry.attempt.state === 'exited' || entry.attempt.state === 'disposed') return entry?.attempt ?? null;
    this.#disarm(entry);
    entry.forcedReason = reason;
    entry.forcedDetail = detail;
    if (entry.attempt.state === 'running') {
      entry.attempt = transitionAttempt(entry.attempt, 'stopping', { stopReason: detail }, this.clock().toISOString());
      await this.#journal(entry.attempt, ATTEMPT_EVENT_TYPES.stopping, { requestedReason: reason });
    }
    try {
      await this.driver.signal(entry.handle, 'SIGTERM', { graceMs: this.stopGraceMs });
    } catch {
      // A signal to something already gone is not a failure to stop it.
    }
    try {
      const collected = await this.driver.collect(entry.handle);
      return (await this.#settle(attemptId, collected)).attempt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return (await this.#settle(attemptId, { exitCode: null, stderr: message })).attempt;
    }
  }

  /** Operator or control-plane cancellation. */
  async cancel(attemptId, detail = 'Attempt cancelled.') {
    return this.#stop(attemptId, 'cancelled', detail);
  }

  /** Unconditional stop, for shutdown and for reclaiming a wedged attempt. */
  async terminate(attemptId, detail = 'Attempt terminated.') {
    const entry = this.live.get(attemptId);
    if (!entry) return null;
    this.#disarm(entry);
    entry.forcedReason = entry.forcedReason ?? 'terminated';
    entry.forcedDetail = entry.forcedDetail ?? detail;
    try {
      await this.driver.signal(entry.handle, 'SIGKILL', { graceMs: 0 });
    } catch {
      // Already gone.
    }
    let collected = { exitCode: null };
    try {
      collected = await this.driver.collect(entry.handle);
    } catch {
      // A container that cannot be collected is still one that must be settled
      // and disposed of, or it becomes the orphan this lifecycle prevents.
    }
    return (await this.#settle(attemptId, collected)).attempt;
  }

  /**
   * Release the sandbox and everything the runtime holds for it.
   *
   * `dispose` is the only place an attempt leaves the live map, and it asks
   * the driver to confirm removal rather than assuming it. The confirmation is
   * the difference between "we called remove" and "there is no orphan".
   */
  async dispose(attemptId) {
    const entry = this.live.get(attemptId);
    if (!entry) return null;
    this.#disarm(entry);
    if (entry.attempt.state !== 'exited' && entry.attempt.state !== 'disposed') {
      await this.terminate(attemptId, 'Attempt disposed before it stopped.');
    }
    let removed = true;
    let removalError = null;
    try {
      if (entry.handle !== null) await this.driver.remove(entry.handle);
      const observed = entry.handle === null ? { exists: false } : await this.driver.inspect(entry.handle);
      removed = observed?.exists !== true;
    } catch (error) {
      removed = false;
      removalError = error instanceof Error ? error.message : String(error);
    }

    if (entry.attempt.state === 'exited') {
      entry.attempt = transitionAttempt(entry.attempt, 'disposed', {}, this.clock().toISOString());
      await this.#journal(entry.attempt, ATTEMPT_EVENT_TYPES.disposed, { removed, removalError });
    }
    this.live.delete(attemptId);
    if (!removed) {
      throw new Error(`Attempt ${attemptId} was not removed by the ${this.driver.id} runtime${removalError ? `: ${removalError}` : ''}. Treat it as an orphan.`);
    }
    return entry.attempt;
  }

  /** Stop and dispose of everything still live. Safe to call on shutdown. */
  async disposeAll() {
    const results = [];
    // Snapshot the keys: `dispose` removes from the same map being iterated.
    const pending = Array.from(this.live.keys());
    for (const attemptId of pending) {
      try {
        results.push({ attemptId, attempt: await this.dispose(attemptId), error: null });
      } catch (error) {
        results.push({ attemptId, attempt: null, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  /**
   * Work out what happened while this process was not running.
   *
   * The durable ledger says which attempts were alive; the runtime says which
   * sandboxes still are. Reconciling the two is the whole of recovery:
   *
   * - alive in the ledger and still running  -> `running`, adopt or stop it;
   * - alive in the ledger and gone           -> `lost`, and the ledger is
   *   corrected so the attempt does not read as if it were still working;
   * - gone in the ledger and still running   -> an orphan sandbox, reported by
   *   handle so it can be reclaimed.
   *
   * It never guesses success. An attempt whose outcome was never journalled
   * exits `lost`, because "we do not know" and "it worked" are different
   * answers and only one of them is honest.
   */
  async recover({ events = [] } = {}) {
    const reduced = reduceAttemptEvents(events);
    let runtimeAttempts = [];
    try {
      runtimeAttempts = (await this.driver.list()) ?? [];
    } catch (error) {
      return {
        driver: this.driver.id,
        runtimeReadable: false,
        detail: error instanceof Error ? error.message : String(error),
        attempts: reduced.map((attempt) => ({ attemptId: attempt.attemptId, ledgerState: attempt.state, runtime: 'unknown', outcome: 'unknown' })),
        orphans: [],
      };
    }
    const byAttempt = new Map(runtimeAttempts.filter((entry) => entry?.attemptId).map((entry) => [entry.attemptId, entry]));

    const attempts = [];
    for (const attempt of reduced) {
      const observed = byAttempt.get(attempt.attemptId) ?? null;
      byAttempt.delete(attempt.attemptId);
      if (!attempt.orphanCandidate) {
        attempts.push({ attemptId: attempt.attemptId, ledgerState: attempt.state, runtime: observed ? 'present' : 'absent', outcome: attempt.state === 'disposed' ? 'settled' : 'exited-not-disposed' });
        continue;
      }
      if (observed?.running) {
        attempts.push({ attemptId: attempt.attemptId, ledgerState: attempt.state, runtime: 'running', outcome: 'running', handle: observed.handle });
        continue;
      }
      const lost = { ...attempt, state: 'exited', exitReason: 'lost', stopReason: 'The supervisor restarted while this attempt was live; the runtime no longer holds it.' };
      await this.journal.record({
        type: ATTEMPT_EVENT_TYPES.recovered,
        projectId: attempt.projectId,
        taskId: attempt.taskId ?? null,
        actor: `execution-adapter:${this.driver.id}`,
        payload: { ...lost, driver: this.driver.id, recoveredFrom: attempt.state },
      });
      attempts.push({ attemptId: attempt.attemptId, ledgerState: attempt.state, runtime: observed ? 'present' : 'absent', outcome: 'lost' });
    }

    return {
      driver: this.driver.id,
      runtimeReadable: true,
      detail: null,
      attempts,
      // Sandboxes the ledger never mentioned. Reported rather than removed:
      // recovery observes, and reclaiming someone else's container is not an
      // observation.
      orphans: [...byAttempt.values()].map((entry) => ({ handle: entry.handle, attemptId: entry.attemptId ?? null, running: Boolean(entry.running) })),
    };
  }
}

export { AttemptNotFound };
