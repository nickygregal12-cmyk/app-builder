/**
 * A local-process execution driver.
 *
 * This is the runtime the deterministic canary uses, and it exists for one
 * reason: the full attempt lifecycle — create, start, bound, cancel, collect,
 * dispose, recover — has to be provable on an ordinary developer machine and
 * in CI, where no container runtime is installed. Proving the *lifecycle*
 * without a container runtime is legitimate; proving the *isolation* without
 * one is not, so this driver is explicit about which of the two it delivers.
 *
 * `isolationMode` is that honesty, and it is reported rather than assumed:
 *
 * - `network-namespace` — the attempt runs inside a fresh, empty network
 *   namespace, the same kernel primitive rootless Podman's `--network=none`
 *   creates. The claim "the attempt could not reach the Factory listener" is
 *   genuinely proved.
 * - `none` — no namespace was available. The lifecycle is still exercised end
 *   to end, and every isolation claim is recorded as unproven. It is never
 *   silently downgraded into a pass.
 *
 * This driver is not a production runtime. It gives an attempt no filesystem,
 * PID, IPC or user isolation, so it must not be used to run untrusted work.
 * `execution-driver-podman.mjs` is the runtime for that.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_DRIVER_ID = 'local-process';

/**
 * Find a way to run a command in a fresh, empty network namespace.
 *
 * Same ordering and same rationale as the sandbox acceptance: the privileged
 * fallback is a stronger proof rather than a weaker one, because a probe
 * running as root that still cannot reach the Factory says more than an
 * unprivileged one that cannot.
 */
export function detectNetworkIsolation() {
  const candidates = [
    // `unshare` execs the command, so the attempt process *is* the child and
    // the supervisor can signal it directly.
    { binary: 'unshare', prefix: ['--net', '--'], privileged: false },
    { binary: 'unshare', prefix: ['--user', '--map-root-user', '--net', '--'], privileged: false },
    // `sudo` does not exec: it forks, and the attempt runs as root underneath
    // it. A non-root supervisor cannot signal either of them — `kill` returns
    // EPERM — so stopping one needs the same privilege that started it.
    { binary: 'sudo', prefix: ['-n', 'unshare', '--net', '--'], privileged: true },
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate.binary, [...candidate.prefix, 'true'], { stdio: 'ignore' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

/**
 * Stop an attempt and everything it started.
 *
 * Two failure modes this exists for, both of which leak a sandbox that
 * outlives the attempt that owned it — the exact orphan the lifecycle claims
 * to prevent:
 *
 * 1. **an intermediate process.** Where the runner forks rather than execs,
 *    signalling the child kills the wrapper and leaves the attempt running.
 *    So the attempt is started in its own process group and the *group* is
 *    signalled.
 * 2. **a more privileged attempt.** Where the runner is `sudo`, the group runs
 *    as root and an unprivileged supervisor's `kill` returns EPERM. So the
 *    signal is delivered with the same privilege that started it.
 */
function signalGroup(entry, signal) {
  const pid = entry.child?.pid;
  if (!pid) return;
  // Node's process API wants `SIGTERM`; `/bin/kill` wants `-TERM`. Passing one
  // spelling where the other is expected throws, and a throw that is caught
  // and ignored means nothing was signalled at all — which is indistinguishable
  // from a task that refused to stop.
  const nodeSignal = signal.startsWith('SIG') ? signal : `SIG${signal}`;
  const killSignal = nodeSignal.slice(3);

  if (entry.privileged) {
    // Best effort: a signal to something already gone is not a failure to stop
    // it. The group first, then the leader, because `sudo` is the leader and
    // the attempt is underneath it.
    spawnSync('sudo', ['-n', 'kill', `-${killSignal}`, '--', `-${pid}`], { stdio: 'ignore' });
    spawnSync('sudo', ['-n', 'kill', `-${killSignal}`, '--', String(pid)], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, nodeSignal);
    return;
  } catch {
    // No process group to signal — fall through to the child itself.
  }
  try {
    entry.child.kill(nodeSignal);
  } catch {
    // Already gone.
  }
}

function hostPath(spec, target) {
  return spec.mounts.find((mount) => mount.target === target)?.source ?? null;
}

/**
 * Environment for the attempt.
 *
 * Deny-by-default and built from the spec's allow-list, never inherited from
 * the supervisor. A driver that passed `process.env` through would hand every
 * provider credential on the host to the task, whatever the spec said.
 */
function sandboxEnvironment(spec, attempt, { workspace, scratch, grantFile, resultFile, extra }) {
  const allowed = new Set(spec.environment?.allowed ?? []);
  const candidate = {
    HOME: scratch,
    PATH: '/usr/local/bin:/usr/bin:/bin',
    LANG: 'C.UTF-8',
    TMPDIR: scratch,
    APP_BUILDER_ATTEMPT_ID: attempt.attemptId,
    APP_BUILDER_WORKSPACE: workspace,
    APP_BUILDER_SCRATCH: scratch,
    APP_BUILDER_RESULT_FILE: resultFile,
    APP_BUILDER_AGENT_BROKER_SOCKET: hostPath(spec, spec.factoryAccess.containerSocketPath),
    ...(grantFile ? { APP_BUILDER_AGENT_GRANT_FILE: grantFile } : {}),
    ...extra,
  };
  const environment = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (value === null || value === undefined) continue;
    if (!allowed.has(key)) throw new Error(`Local driver refuses ${key}: it is not an allowed sandbox environment variable.`);
    for (const pattern of spec.environment?.forbiddenPatterns ?? []) {
      if (key.includes(pattern)) throw new Error(`Local driver refuses ${key}: it matches the forbidden pattern ${pattern}.`);
    }
    environment[key] = String(value);
  }
  return environment;
}

export function createLocalExecutionDriver({ nodeExecutable = process.execPath, isolation = undefined } = {}) {
  const runner = isolation === undefined ? detectNetworkIsolation() : isolation;
  const containers = new Map();
  let counter = 0;

  return {
    id: LOCAL_DRIVER_ID,
    isolationMode: runner ? 'network-namespace' : 'none',
    isolationRunner: runner,

    async create({ attempt, spec, command, environment = {}, grantToken }) {
      const workspace = hostPath(spec, spec.workspace.containerPath);
      const scratch = hostPath(spec, spec.workspace.scratchPath);
      if (!workspace || !scratch) throw new Error('The attempt spec must mount a workspace and a scratch directory.');
      fs.mkdirSync(workspace, { recursive: true });
      fs.mkdirSync(scratch, { recursive: true });

      // The grant is written where the spec says it is mounted, owner-only.
      // It never becomes a command-line argument, because a shared host's
      // process table is readable by every other user on it.
      let grantFile = spec.factoryAccess.grantFile ?? null;
      if (grantFile) {
        if (!grantToken) throw new Error('The spec mounts an attempt grant but no grant token was supplied.');
        fs.mkdirSync(path.dirname(grantFile), { recursive: true });
        fs.writeFileSync(grantFile, grantToken, { mode: 0o600 });
        fs.chmodSync(grantFile, 0o600);
      }

      const resultFile = path.join(scratch, 'attempt-result.json');
      fs.rmSync(resultFile, { force: true });
      const handle = `${LOCAL_DRIVER_ID}-${attempt.attemptId}-${(counter += 1)}`;
      containers.set(handle, {
        handle,
        attemptId: attempt.attemptId,
        command: command.length > 0 ? command : [nodeExecutable, '-e', 'process.exit(0)'],
        environment: sandboxEnvironment(spec, attempt, { workspace, scratch, grantFile, resultFile, extra: environment }),
        cwd: workspace,
        resultFile,
        grantFile,
        child: null,
        running: false,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
        stdout: '',
        stderr: '',
        exited: null,
      });
      return handle;
    },

    async start(handle) {
      const entry = containers.get(handle);
      if (!entry) throw new Error(`Unknown attempt handle: ${handle}`);
      const [binary, ...rest] = entry.command;
      // `sudo` resets the environment. Everything the attempt is told about
      // itself — its broker socket, its grant *path*, its workspace, where to
      // write its result — arrives as environment, so under the privileged
      // runner the attempt would start knowing nothing and exit 0 having done
      // nothing. That reads as a completed attempt while every boundary check
      // silently did not run.
      //
      // So under a sanitising runner the environment is re-established inside
      // the elevated process with `env`, which depends on no sudoers
      // configuration. These values do land on the command line, which is why
      // the allow-list in `sandboxEnvironment` is a hard refusal rather than a
      // filter: only non-secret co-ordinates can ever be here, and the grant
      // itself is a mounted file, never one of them.
      const inner = runner?.privileged
        ? ['env', ...Object.entries(entry.environment).map(([key, value]) => `${key}=${value}`), binary, ...rest]
        : [binary, ...rest];
      const argv = runner ? [...runner.prefix, ...inner] : [binary, ...rest];
      const executable = runner ? runner.binary : binary;
      // `detached` makes the attempt a process-group leader, so a cancel can
      // signal the whole group rather than only whatever the supervisor
      // happens to be holding a handle to.
      const child = spawn(executable, argv, { cwd: entry.cwd, env: entry.environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
      entry.child = child;
      entry.privileged = Boolean(runner?.privileged);
      entry.running = true;
      entry.startedAt = new Date().toISOString();
      child.stdout.on('data', (chunk) => { entry.stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { entry.stderr += chunk.toString('utf8'); });
      entry.exited = new Promise((resolve) => {
        child.on('exit', (code, signal) => {
          entry.running = false;
          entry.exitCode = code === null ? (signal ? 128 : null) : code;
          entry.finishedAt = new Date().toISOString();
          resolve(entry.exitCode);
        });
        child.on('error', (error) => {
          entry.running = false;
          entry.exitCode = null;
          entry.stderr += `\n${error.message}`;
          entry.finishedAt = new Date().toISOString();
          resolve(null);
        });
      });
      return handle;
    },

    async inspect(handle) {
      const entry = containers.get(handle);
      if (!entry) return { exists: false, running: false, exitCode: null };
      return { exists: true, running: entry.running, exitCode: entry.exitCode, startedAt: entry.startedAt, finishedAt: entry.finishedAt };
    },

    async collect(handle) {
      const entry = containers.get(handle);
      if (!entry) throw new Error(`Unknown attempt handle: ${handle}`);
      if (entry.exited) await entry.exited;
      let result = null;
      try {
        result = JSON.parse(fs.readFileSync(entry.resultFile, 'utf8'));
      } catch {
        // A task that produced no structured result is not an error here. The
        // adapter decides what an exit code means; the driver only reports.
        result = null;
      }
      const started = entry.startedAt ? Date.parse(entry.startedAt) : null;
      const finished = entry.finishedAt ? Date.parse(entry.finishedAt) : null;
      return {
        exitCode: entry.exitCode,
        stdout: entry.stdout,
        stderr: entry.stderr,
        result,
        durationMs: started !== null && finished !== null ? Math.max(0, finished - started) : 0,
      };
    },

    async signal(handle, signal = 'SIGTERM', { graceMs = 0 } = {}) {
      const entry = containers.get(handle);
      if (!entry?.child || !entry.running) return;
      signalGroup(entry, signal === 'SIGKILL' ? 'KILL' : 'TERM');
      if (signal === 'SIGKILL' || graceMs <= 0) {
        signalGroup(entry, 'KILL');
        await entry.exited;
        return;
      }
      // The grace is a courtesy; the kill is the guarantee.
      await Promise.race([
        entry.exited,
        new Promise((resolve) => { const timer = setTimeout(resolve, graceMs); if (typeof timer.unref === 'function') timer.unref(); }),
      ]);
      if (entry.running) signalGroup(entry, 'KILL');
      await entry.exited;
    },

    async remove(handle) {
      const entry = containers.get(handle);
      if (!entry) return;
      if (entry.running) {
        signalGroup(entry, 'KILL');
        await entry.exited;
      }
      // A descendant that outlived the group kill would still hold the
      // inherited pipes, and an open pipe from a live process keeps the
      // supervisor's event loop alive indefinitely. Releasing them means a
      // leak shows up as an orphan report rather than as a hung process.
      for (const stream of [entry.child?.stdout, entry.child?.stderr]) {
        try {
          stream?.removeAllListeners('data');
          stream?.destroy();
        } catch {
          // Already closed.
        }
      }
      entry.child?.unref();
      // The grant dies with the attempt. Leaving it on disk would leave a
      // usable bearer credential behind a disposed sandbox.
      if (entry.grantFile) fs.rmSync(entry.grantFile, { force: true });
      containers.delete(handle);
    },

    async list() {
      return [...containers.values()].map((entry) => ({ handle: entry.handle, attemptId: entry.attemptId, running: entry.running }));
    },
  };
}
