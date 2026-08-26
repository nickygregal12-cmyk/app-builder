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
 * Build the rootless podman argv for one attempt.
 *
 * `verb` is `run` for a one-shot invocation and `create` for the supervised
 * lifecycle, where the container must survive its own exit long enough for the
 * adapter to read the exit code and the structured result. A `--rm` container
 * that has already been reaped cannot be inspected, and an attempt whose
 * outcome cannot be inspected has no durable evidence.
 *
 * `image` is the caller's to supply and to have pinned by digest; this
 * function refuses a floating tag rather than producing an argv whose contents
 * can change under a proven boundary.
 */
export function podmanContainerArgs(spec, { image, command = [], name = null, verb = 'run', environment = {} } = {}) {
  assertSpecIsolation(spec);
  if (verb !== 'run' && verb !== 'create') throw new Error(`Unsupported podman verb: ${verb}`);
  if (typeof image !== 'string' || !image.includes('@sha256:')) {
    throw new Error('The task sandbox image must be pinned by digest; a floating tag can change under a proven boundary.');
  }

  const args = [
    verb,
    ...(verb === 'run' ? ['--rm'] : []),
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

  // Only non-secret co-ordinates reach the command line. The grant itself
  // arrives as the read-only file the spec mounts, and the signing key has no
  // representation here at all.
  args.push('--env', `${spec.factoryAccess.socketEnvironmentVariable}=${spec.factoryAccess.containerSocketPath}`);
  if (spec.factoryAccess.grantFile !== null && spec.factoryAccess.grantFile !== undefined) {
    args.push('--env', `${spec.factoryAccess.grantFileEnvironmentVariable}=${spec.factoryAccess.containerGrantPath}`);
  }
  // The model lane, when the spec has one, is exactly as much co-ordinate as
  // the Factory lane: the in-container socket path. No endpoint, no model name
  // and no credential has a representation here either.
  if (spec.modelAccess !== null && spec.modelAccess !== undefined) {
    args.push('--env', `${spec.modelAccess.socketEnvironmentVariable}=${spec.modelAccess.containerSocketPath}`);
  }
  const allowed = new Set(spec.environment?.allowed ?? []);
  for (const [key, value] of Object.entries(environment)) {
    // Deny-by-default, and the spec's own forbidden patterns are re-checked
    // here rather than trusted: this is the last place a secret could be
    // spelled onto a shared host's process table.
    if (!allowed.has(key)) throw new Error(`Refusing sandbox arguments: ${key} is not an allowed sandbox environment variable.`);
    for (const pattern of spec.environment?.forbiddenPatterns ?? []) {
      if (key.includes(pattern)) throw new Error(`Refusing sandbox arguments: ${key} matches the forbidden pattern ${pattern}.`);
    }
    args.push('--env', `${key}=${value}`);
  }
  args.push('--env-file', '/dev/null');

  args.push(image, ...command);
  return assertArgumentsPreserveIsolation(args);
}

/** The one-shot form, unchanged for callers that only need an argv. */
export function podmanRunArgs(spec, options = {}) {
  return podmanContainerArgs(spec, { ...options, verb: 'run' });
}

/** The supervised form the `ExecutionEnvironmentAdapter` lifecycle uses. */
export function podmanCreateArgs(spec, options = {}) {
  return podmanContainerArgs(spec, { ...options, verb: 'create' });
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
