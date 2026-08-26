/**
 * Rootless Podman translation of an `ExecutionEnvironmentSpec`.
 *
 * The spec is the boundary; this file is one runtime's spelling of it. Keeping
 * the translation here rather than in the control plane is what stops Podman
 * from becoming a stable requirement of the factory — a second runtime would be
 * a second translation of the same spec, not a second definition of isolation.
 *
 * The host groundwork this relies on already exists: `ops/hetzner/install-existing-host.sh`
 * installs rootless Podman and allocates non-overlapping subordinate UID/GID
 * ranges for the `appbuilder` user.
 */

import { FORBIDDEN_MOUNT_SOURCES, assertSpecIsolation } from '@app-builder/control-plane/execution-environment';

export const PODMAN_BINARY = 'podman';

/**
 * Arguments that would undo the boundary. They are checked on the produced
 * argv rather than merely avoided while writing it, because the failure mode
 * that matters is a later edit adding one back.
 */
export const FORBIDDEN_PODMAN_ARGUMENTS = Object.freeze([
  '--privileged',
  '--network=host',
  '--net=host',
  '--pid=host',
  '--ipc=host',
  '--userns=host',
  '--cap-add',
  '--security-opt=seccomp=unconfined',
  '--security-opt=label=disable',
  '--publish',
  '-p',
  '--add-host',
  '--device',
]);

function networkArguments(spec) {
  if (spec.network.profile === 'none') return ['--network=none'];
  // A role that legitimately needs the public internet still gets its own
  // network namespace on a bounded bridge, never the host's. The egress filter
  // that keeps it off the host control plane and private ranges is applied by
  // the named Podman network, which the host installer creates; the sandbox
  // cannot choose a different one.
  return ['--network=app-builder-egress'];
}

/**
 * Build the rootless `podman run` argv for one attempt.
 *
 * `image` is the caller's to supply and to have pinned by digest; this
 * function refuses a floating tag rather than producing an argv whose contents
 * can change under a proven boundary.
 */
export function podmanRunArgs(spec, { image, command = [], name = null } = {}) {
  assertSpecIsolation(spec);
  if (typeof image !== 'string' || !image.includes('@sha256:')) {
    throw new Error('The task sandbox image must be pinned by digest; a floating tag can change under a proven boundary.');
  }

  const args = [
    'run',
    '--rm',
    '--name', name ?? `app-builder-attempt-${spec.attemptId}`,
    '--userns=keep-id',
    '--user', '1000:1000',
    ...networkArguments(spec),
    '--pid=private',
    '--ipc=private',
    '--uts=private',
    '--cgroupns=private',
    '--security-opt=no-new-privileges',
    '--cap-drop=ALL',
    '--read-only',
    `--memory=${spec.limits.memoryMb}m`,
    `--cpus=${spec.limits.cpus}`,
    `--pids-limit=${spec.limits.pidsMax}`,
    `--timeout=${Math.ceil(spec.limits.wallClockMs / 1000)}`,
    '--workdir', spec.workspace.containerPath,
  ];

  for (const entry of spec.tmpfs ?? []) {
    args.push(`--tmpfs=${entry.target}:rw,noexec,nosuid,nodev,size=${entry.sizeMb}m`);
  }
  for (const mount of spec.mounts ?? []) {
    args.push('--volume', `${mount.source}:${mount.target}:${mount.mode},Z`);
  }

  // The grant is passed by value; the signing key stays with the broker and has
  // no representation here at all.
  args.push('--env', `${spec.factoryAccess.socketEnvironmentVariable}=${spec.factoryAccess.containerSocketPath}`);
  args.push('--env-file', '/dev/null');

  args.push(image, ...command);
  return assertArgumentsPreserveIsolation(args);
}

/**
 * Reject an argv that carries an isolation-breaking flag, whoever added it.
 */
export function assertArgumentsPreserveIsolation(args) {
  const joined = args.map(String);
  for (const forbidden of FORBIDDEN_PODMAN_ARGUMENTS) {
    for (const [index, value] of joined.entries()) {
      if (value === forbidden || value.startsWith(`${forbidden}=`)) {
        // `-p` as a bare token is the publish shorthand; the same two
        // characters inside a longer flag are not.
        throw new Error(`Refusing sandbox arguments: ${forbidden} at position ${index} would undo the task boundary.`);
      }
    }
  }
  for (const value of joined) {
    for (const forbidden of FORBIDDEN_MOUNT_SOURCES) {
      if (value.startsWith(`${forbidden}:`) && !value.startsWith('/run/app-builder/')) {
        throw new Error(`Refusing sandbox arguments: a mount of ${forbidden} would hand the task the host.`);
      }
    }
  }
  return joined;
}
