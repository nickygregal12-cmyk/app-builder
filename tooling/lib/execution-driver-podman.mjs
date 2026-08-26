/**
 * Rootless Podman execution driver.
 *
 * The runtime half of the `ExecutionEnvironmentAdapter` lifecycle for the one
 * runtime the factory actually has. It implements the same seven neutral verbs
 * any driver implements, and it holds every Podman-specific fact — the binary,
 * the verbs, the JSON shapes, the container naming — so the control plane holds
 * none of them.
 *
 * The isolation itself is not decided here. `podmanCreateArgs` translates the
 * spec, refuses an unpinned image and refuses an argv carrying an
 * isolation-breaking flag; this file supervises what that argv produced.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { PODMAN_BINARY, podmanCreateArgs } from './sandbox-podman.mjs';

const run = promisify(execFile);

export const PODMAN_DRIVER_ID = 'rootless-podman';
export const ATTEMPT_NAME_PREFIX = 'app-builder-attempt-';

function hostPath(spec, target) {
  return spec.mounts.find((mount) => mount.target === target)?.source ?? null;
}

async function podman(binary, args, { timeoutMs = 120_000 } = {}) {
  try {
    const { stdout, stderr } = await run(binary, args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? (error.message ?? ''), code: error.code ?? null };
  }
}

/**
 * A public-egress attempt must not fall back to whatever network happens to
 * exist. If the bounded egress network is absent, the profile is unavailable
 * and the attempt is refused — a role whose policy grants the public internet
 * gets the *filtered* internet or none.
 */
async function assertEgressNetworkAvailable(binary, network) {
  const result = await podman(binary, ['network', 'exists', network], { timeoutMs: 15_000 });
  if (!result.ok) {
    throw new Error(
      `The ${network} egress network is not present, so the public-egress-only profile is unavailable. `
      + 'Run ops/hetzner/install-egress-network.sh on the host, then ops/hetzner/verify-egress-profile.sh. '
      + 'Refusing rather than falling back to an unfiltered network.',
    );
  }
}

export function createPodmanExecutionDriver({ binary = PODMAN_BINARY, egressNetwork = 'app-builder-egress', requireEgressAttestation = true, attestationPath = '/etc/app-builder/egress-profile.json' } = {}) {
  const handles = new Map();

  return {
    id: PODMAN_DRIVER_ID,
    isolationMode: 'rootless-container',

    async create({ attempt, spec, command, environment = {}, grantToken }) {
      const workspace = hostPath(spec, spec.workspace.containerPath);
      const scratch = hostPath(spec, spec.workspace.scratchPath);
      if (!workspace || !scratch) throw new Error('The attempt spec must mount a workspace and a scratch directory.');
      fs.mkdirSync(workspace, { recursive: true });
      fs.mkdirSync(scratch, { recursive: true });

      if (spec.network.profile === 'public-egress-only') {
        await assertEgressNetworkAvailable(binary, egressNetwork);
        if (requireEgressAttestation) assertEgressAttestation({ attestationPath, network: egressNetwork });
      }

      const grantFile = spec.factoryAccess.grantFile ?? null;
      if (grantFile) {
        if (!grantToken) throw new Error('The spec mounts an attempt grant but no grant token was supplied.');
        fs.mkdirSync(path.dirname(grantFile), { recursive: true });
        fs.writeFileSync(grantFile, grantToken, { mode: 0o600 });
        fs.chmodSync(grantFile, 0o600);
      }

      const resultFile = path.join(scratch, 'attempt-result.json');
      fs.rmSync(resultFile, { force: true });
      const name = `${ATTEMPT_NAME_PREFIX}${attempt.attemptId}`;
      const args = podmanCreateArgs(spec, {
        image: attempt.image.pinned,
        command,
        name,
        environment: {
          APP_BUILDER_ATTEMPT_ID: attempt.attemptId,
          APP_BUILDER_WORKSPACE: spec.workspace.containerPath,
          APP_BUILDER_SCRATCH: spec.workspace.scratchPath,
          APP_BUILDER_RESULT_FILE: `${spec.workspace.scratchPath}/attempt-result.json`,
          ...environment,
        },
      });

      const created = await podman(binary, args);
      if (!created.ok) throw new Error(`podman create failed for ${attempt.attemptId}: ${created.stderr.trim()}`);
      const containerId = created.stdout.trim().split(/\s+/).pop();
      if (!containerId) throw new Error(`podman create produced no container id for ${attempt.attemptId}.`);
      handles.set(containerId, { containerId, attemptId: attempt.attemptId, name, resultFile, grantFile, startedAt: null });
      return containerId;
    },

    async start(handle) {
      const entry = handles.get(handle);
      const started = await podman(binary, ['start', handle]);
      if (!started.ok) throw new Error(`podman start failed for ${handle}: ${started.stderr.trim()}`);
      if (entry) entry.startedAt = new Date().toISOString();
      return handle;
    },

    async inspect(handle) {
      const result = await podman(binary, ['inspect', '--type', 'container', '--format', '{{.State.Running}} {{.State.ExitCode}} {{.State.StartedAt}} {{.State.FinishedAt}}', handle], { timeoutMs: 30_000 });
      if (!result.ok) return { exists: false, running: false, exitCode: null };
      const [running, exitCode, startedAt, finishedAt] = result.stdout.trim().split(/\s+/);
      return {
        exists: true,
        running: running === 'true',
        exitCode: running === 'true' ? null : Number(exitCode),
        startedAt: startedAt ?? null,
        finishedAt: finishedAt ?? null,
      };
    },

    async collect(handle) {
      const entry = handles.get(handle);
      // `podman wait` blocks until the container stops and prints its exit
      // code. The wall clock is the adapter's to enforce; this is deliberately
      // unbounded so a cancel is what stops an attempt, not a racing timeout
      // that would leave the container running.
      const waited = await podman(binary, ['wait', handle], { timeoutMs: 0 });
      const exitCode = waited.ok ? Number(waited.stdout.trim()) : null;
      const logs = await podman(binary, ['logs', handle], { timeoutMs: 60_000 });
      let result = null;
      if (entry?.resultFile) {
        try {
          result = JSON.parse(fs.readFileSync(entry.resultFile, 'utf8'));
        } catch {
          result = null;
        }
      }
      const observed = await this.inspect(handle);
      const started = observed.startedAt ? Date.parse(observed.startedAt) : null;
      const finished = observed.finishedAt ? Date.parse(observed.finishedAt) : null;
      return {
        exitCode: Number.isFinite(exitCode) ? exitCode : observed.exitCode,
        stdout: logs.stdout ?? '',
        stderr: logs.stderr ?? '',
        result,
        durationMs: Number.isFinite(started) && Number.isFinite(finished) && finished > started ? finished - started : 0,
      };
    },

    async signal(handle, signal = 'SIGTERM', { graceMs = 0 } = {}) {
      if (signal === 'SIGKILL') {
        await podman(binary, ['kill', '--signal', 'SIGKILL', handle], { timeoutMs: 30_000 });
        return;
      }
      await podman(binary, ['stop', '--time', String(Math.max(0, Math.ceil(graceMs / 1000))), handle], { timeoutMs: graceMs + 60_000 });
    },

    async remove(handle) {
      const entry = handles.get(handle);
      await podman(binary, ['rm', '--force', '--volumes', handle], { timeoutMs: 60_000 });
      if (entry?.grantFile) fs.rmSync(entry.grantFile, { force: true });
      handles.delete(handle);
    },

    /**
     * Every attempt container this runtime holds, whether or not this process
     * created it. Recovery after a restart depends on seeing containers a
     * previous supervisor left behind, so the query is by name prefix rather
     * than from the in-memory map.
     */
    async list() {
      const result = await podman(binary, ['ps', '--all', '--format', 'json', '--filter', `name=^${ATTEMPT_NAME_PREFIX}`], { timeoutMs: 60_000 });
      if (!result.ok) throw new Error(`podman ps failed: ${result.stderr.trim()}`);
      let rows = [];
      try {
        rows = JSON.parse(result.stdout || '[]');
      } catch {
        throw new Error('podman ps did not return JSON.');
      }
      return rows.map((row) => {
        const name = (row.Names ?? [])[0] ?? row.Name ?? '';
        return {
          handle: row.Id ?? row.ID ?? name,
          attemptId: name.startsWith(ATTEMPT_NAME_PREFIX) ? name.slice(ATTEMPT_NAME_PREFIX.length) : null,
          running: String(row.State ?? '').toLowerCase() === 'running',
        };
      });
    },
  };
}

/**
 * The egress profile is usable only where it has been proved on the host.
 *
 * A named Podman network existing says nothing about whether it can reach the
 * Factory listener, the host's private addresses or a cloud metadata endpoint.
 * `ops/hetzner/verify-egress-profile.sh` answers that from inside a real
 * container and writes this attestation when it passes. No attestation means
 * the answer is unknown, and unknown fails closed.
 */
export function assertEgressAttestation({ attestationPath, network, now = new Date() }) {
  let attestation;
  try {
    attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));
  } catch {
    throw new Error(
      `No egress-profile attestation at ${attestationPath}, so public egress is unproven on this host. `
      + 'Run ops/hetzner/verify-egress-profile.sh and re-run. Refusing rather than assuming the filter is in place.',
    );
  }
  if (attestation?.network !== network) {
    throw new Error(`The egress attestation at ${attestationPath} covers ${attestation?.network}, not ${network}.`);
  }
  if (attestation?.result !== 'passed') {
    throw new Error(`The egress attestation at ${attestationPath} does not record a pass (${attestation?.result}).`);
  }
  const verifiedAt = Date.parse(attestation?.verifiedAt ?? '');
  if (!Number.isFinite(verifiedAt)) throw new Error(`The egress attestation at ${attestationPath} has no verifiedAt timestamp.`);
  const maxAgeMs = Number(attestation?.maxAgeDays ?? 30) * 24 * 60 * 60 * 1000;
  if (now.getTime() - verifiedAt > maxAgeMs) {
    throw new Error(`The egress attestation at ${attestationPath} is older than ${attestation?.maxAgeDays ?? 30} days. Re-run ops/hetzner/verify-egress-profile.sh.`);
  }
  return attestation;
}
