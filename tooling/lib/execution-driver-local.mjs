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
    ['unshare', ['--net', '--']],
    ['unshare', ['--user', '--map-root-user', '--net', '--']],
    ['sudo', ['-n', 'unshare', '--net', '--']],
  ];
  for (const [binary, prefix] of candidates) {
    const probe = spawnSync(binary, [...prefix, 'true'], { stdio: 'ignore' });
    if (probe.status === 0) return { binary, prefix };
  }
  return null;
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
      const argv = runner ? [...runner.prefix, binary, ...rest] : [binary, ...rest];
      const executable = runner ? runner.binary : binary;
      const child = spawn(executable, argv, { cwd: entry.cwd, env: entry.environment, stdio: ['ignore', 'pipe', 'pipe'] });
      entry.child = child;
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
      entry.child.kill(signal === 'SIGKILL' ? 'SIGKILL' : 'SIGTERM');
      if (signal === 'SIGKILL' || graceMs <= 0) {
        entry.child.kill('SIGKILL');
        return;
      }
      // The grace is a courtesy; the kill is the guarantee.
      await Promise.race([
        entry.exited,
        new Promise((resolve) => { const timer = setTimeout(resolve, graceMs); if (typeof timer.unref === 'function') timer.unref(); }),
      ]);
      if (entry.running) entry.child.kill('SIGKILL');
      await entry.exited;
    },

    async remove(handle) {
      const entry = containers.get(handle);
      if (!entry) return;
      if (entry.running) {
        entry.child?.kill('SIGKILL');
        await entry.exited;
      }
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
