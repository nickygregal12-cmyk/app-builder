/**
 * Provider-neutral execution-environment contract for untrusted task attempts.
 *
 * This is the deferred `ExecutionEnvironmentAdapter` contract from the Phase
 * 3.5C plan, narrowed to the one job Phase 4.5 needs it for: describing an
 * isolation shape strong enough that a hostile task cannot reach the Factory's
 * internal listener at all.
 *
 * The capability broker removes a task's *authority* to invoke an internal
 * operation. It does not remove the *route*: a process that shares the host
 * network namespace can still open a socket to `127.0.0.1:4310`, whatever the
 * broker thinks. The spec below removes the route, so the two together mean a
 * task with a shell is bounded by the same rules as a well-behaved MCP client.
 *
 * Nothing here names Podman, Docker, systemd or a runtime. A spec is data; the
 * translation into one runtime's arguments lives in tooling, and a second
 * runtime would be a second translation of the same spec rather than a second
 * definition of the boundary.
 */

/**
 * `none` is the default and the preferred profile. A role that does not need
 * the public internet should not be able to reach it, and most roles do not.
 *
 * `public-egress-only` exists for the roles whose policy genuinely allows
 * `network.public` — research, brand research, source ingestion. It still must
 * not reach the host control plane, the host's own addresses, private ranges or
 * link-local metadata; those are named in `FORBIDDEN_EGRESS` and enforced by
 * the runtime translation, not left to the task.
 */
export const NETWORK_PROFILES = Object.freeze(['none', 'public-egress-only']);

export const FORBIDDEN_EGRESS = Object.freeze([
  '127.0.0.0/8',
  '::1/128',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  'fe80::/10',
  'fc00::/7',
]);

/**
 * Host paths a task sandbox must never be given, whatever else it mounts.
 * Each one is a way to become the host rather than to be isolated from it.
 */
export const FORBIDDEN_MOUNT_SOURCES = Object.freeze([
  '/var/run/docker.sock',
  '/run/docker.sock',
  '/run/podman/podman.sock',
  '/var/run/podman/podman.sock',
  '/srv/app-builder',
  '/srv/app-builder/state',
  '/etc/app-builder',
  '/etc/shadow',
  '/etc/sudoers',
  '/proc/sys',
  '/sys/fs/cgroup',
  '/dev',
  '/',
]);

export const DEFAULT_LIMITS = Object.freeze({ cpus: 2, memoryMb: 3072, pidsMax: 512, wallClockMs: 45 * 60 * 1000, tmpfsMb: 512 });

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

function absolutePath(value, label) {
  const candidate = text(value, label);
  if (!candidate.startsWith('/')) throw new Error(`${label} must be an absolute path.`);
  if (candidate.includes('..')) throw new Error(`${label} must not contain a parent-directory segment.`);
  return candidate;
}

function positive(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number.`);
  return parsed;
}

/**
 * A role gets the public internet only when its policy allows `network.public`
 * outright. An approval-gated or denied action is not a network profile.
 */
export function networkProfileForPolicy(policy) {
  const allowed = (policy?.allow ?? []).includes('network.public');
  const gated = (policy?.approvalRequired ?? []).includes('network.public');
  const denied = (policy?.deny ?? []).includes('network.public');
  return allowed && !gated && !denied ? 'public-egress-only' : 'none';
}

export function createExecutionEnvironmentSpec(input) {
  const networkProfile = text(input?.networkProfile ?? 'none', 'networkProfile');
  if (!NETWORK_PROFILES.includes(networkProfile)) throw new Error(`Unknown network profile: ${networkProfile}`);

  const limits = { ...DEFAULT_LIMITS, ...input?.limits };
  // Optional at the spec layer, which describes an isolation shape; required
  // at the attempt layer, which describes an execution that must be auditable.
  const grantFile = input?.grantPath === undefined || input?.grantPath === null
    ? null
    : absolutePath(input.grantPath, 'grantPath');

  // The model lane, and its absence.
  //
  // A model-powered attempt needs one more trusted socket than a deterministic
  // one: the gateway that holds the provider credential and makes the call on
  // the attempt's behalf. It is *not* the capability broker — the broker is the
  // Factory boundary, and every entry in config/agent-capabilities.json names a
  // real Factory operation — so putting model invocation there would place it
  // on the Factory's own surface.
  //
  // It is optional and absent by default, and that absence is the property
  // worth stating: with no `modelSocketPath`, this spec is identical to the one
  // it produced before the lane existed, mount for mount and variable for
  // variable. An attempt that was not explicitly given the lane cannot reach a
  // model at all, because there is nothing in its sandbox to reach.
  const modelSocket = input?.modelSocketPath === undefined || input?.modelSocketPath === null
    ? null
    : absolutePath(input.modelSocketPath, 'modelSocketPath');

  const spec = {
    schemaVersion: 1,
    attemptId: text(input?.attemptId, 'attemptId'),
    taskId: text(input?.taskId, 'taskId'),
    projectId: text(input?.projectId, 'projectId'),
    roleId: text(input?.roleId, 'roleId'),
    policyId: text(input?.policyId, 'policyId'),

    // Rootless, and every namespace the task could otherwise use to observe or
    // reach the host is its own. `network: 'private'` is the one that closes
    // issue #55's remaining route.
    isolation: {
      rootless: true,
      user: 'nonroot',
      network: networkProfile === 'none' ? 'none' : 'private',
      pid: 'private',
      ipc: 'private',
      uts: 'private',
      cgroup: 'private',
      hostNetwork: false,
      hostPid: false,
      hostIpc: false,
      hostUsers: false,
    },

    security: {
      privileged: false,
      noNewPrivileges: true,
      capabilitiesDropped: ['ALL'],
      capabilitiesAdded: [],
      readOnlyRootFilesystem: true,
      seccomp: 'runtime-default',
    },

    network: {
      profile: networkProfile,
      publishedPorts: [],
      forbiddenEgress: [...FORBIDDEN_EGRESS],
      // The Factory's own listener is never a legitimate destination for a
      // task, so it is named rather than merely covered by the loopback rule.
      forbiddenDestinations: [
        '127.0.0.1:4310',
        'localhost:4310',
        '[::1]:4310',
        'host.containers.internal:4310',
        'host.docker.internal:4310',
      ],
    },

    // The only Factory reach. One socket file, and no host, port or origin the
    // task could substitute for it.
    factoryAccess: {
      transport: 'unix-socket',
      brokerSocket: absolutePath(input?.brokerSocketPath, 'brokerSocketPath'),
      containerSocketPath: '/run/app-builder/broker.sock',
      grantEnvironmentVariable: 'APP_BUILDER_AGENT_GRANT',
      // The grant is delivered as a read-only file, not as an environment
      // variable on the runtime's command line. `podman run --env GRANT=...`
      // puts an attempt's bearer authority into the host process table, where
      // every other user of a shared host can read it; a 0600 file the
      // sandbox mounts is authority the sandbox holds and nobody else does.
      grantFile,
      containerGrantPath: '/run/app-builder/grant',
      grantFileEnvironmentVariable: 'APP_BUILDER_AGENT_GRANT_FILE',
      socketEnvironmentVariable: 'APP_BUILDER_AGENT_BROKER_SOCKET',
    },

    // The model lane, when there is one. It carries a socket and nothing else:
    // no key, no key path, no provider endpoint, no model name the sandbox
    // could substitute. The attempt presents the grant it already holds and
    // the trusted gateway decides — the same shape as the Factory lane, for
    // the same reason.
    modelAccess: modelSocket === null ? null : {
      transport: 'unix-socket',
      gatewaySocket: modelSocket,
      containerSocketPath: '/run/app-builder/model.sock',
      socketEnvironmentVariable: 'APP_BUILDER_MODEL_SOCKET',
    },

    mounts: [
      { source: absolutePath(input?.workspacePath, 'workspacePath'), target: '/workspace', mode: 'rw' },
      { source: absolutePath(input?.scratchPath, 'scratchPath'), target: '/scratch', mode: 'rw' },
      { source: absolutePath(input?.brokerSocketPath, 'brokerSocketPath'), target: '/run/app-builder/broker.sock', mode: 'rw' },
      ...(grantFile === null ? [] : [{ source: grantFile, target: '/run/app-builder/grant', mode: 'ro' }]),
      ...(modelSocket === null ? [] : [{ source: modelSocket, target: '/run/app-builder/model.sock', mode: 'rw' }]),
    ],
    tmpfs: [{ target: '/tmp', sizeMb: positive(limits.tmpfsMb, DEFAULT_LIMITS.tmpfsMb, 'tmpfsMb') }],

    limits: {
      cpus: positive(limits.cpus, DEFAULT_LIMITS.cpus, 'cpus'),
      memoryMb: Math.trunc(positive(limits.memoryMb, DEFAULT_LIMITS.memoryMb, 'memoryMb')),
      pidsMax: Math.trunc(positive(limits.pidsMax, DEFAULT_LIMITS.pidsMax, 'pidsMax')),
      wallClockMs: Math.trunc(positive(limits.wallClockMs, DEFAULT_LIMITS.wallClockMs, 'wallClockMs')),
    },

    // A task never receives a raw provider or application secret. The grant is
    // scoped authority, not a credential, and the broker holds the signing key.
    environment: {
      allowed: [
        'APP_BUILDER_AGENT_GRANT',
        'APP_BUILDER_AGENT_GRANT_FILE',
        'APP_BUILDER_AGENT_BROKER_SOCKET',
        // Present only when the lane is, and a socket path either way — never
        // a credential, an endpoint or a provider name.
        ...(modelSocket === null ? [] : ['APP_BUILDER_MODEL_SOCKET']),
        'APP_BUILDER_ATTEMPT_ID',
        'APP_BUILDER_WORKSPACE',
        'APP_BUILDER_SCRATCH',
        'APP_BUILDER_RESULT_FILE',
        'HOME',
        'PATH',
        'LANG',
        'TMPDIR',
      ],
      forbiddenPatterns: ['SECRET', 'TOKEN', 'PASSWORD', 'API_KEY', 'CREDENTIAL', 'ANTHROPIC', 'OPENAI', 'SUPABASE', 'NETLIFY', 'APP_BUILDER_AGENT_GRANT_SECRET'],
    },

    workspace: { containerPath: '/workspace', scratchPath: '/scratch', disposable: true },
  };

  return Object.freeze(assertSpecIsolation(spec));
}

/**
 * Fail closed on any spec that would reopen the boundary.
 *
 * This is not a lint. Every branch below is a way a task has actually escaped
 * a container in the wild — host namespaces, a container runtime socket, a
 * published port, an added capability, the host state directory — and a spec
 * that carries one is refused rather than warned about.
 */
export function assertSpecIsolation(spec) {
  const fail = (message) => { throw new Error(`Execution environment refused: ${message}`); };

  if (!spec?.isolation?.rootless) fail('the sandbox must be rootless.');
  for (const key of ['hostNetwork', 'hostPid', 'hostIpc', 'hostUsers']) {
    if (spec.isolation[key]) fail(`${key} would share a host namespace with the task.`);
  }
  for (const key of ['pid', 'ipc']) {
    if (spec.isolation[key] !== 'private') fail(`${key} namespace must be private.`);
  }
  if (!NETWORK_PROFILES.includes(spec.network?.profile)) fail(`unknown network profile ${spec.network?.profile}.`);
  if (spec.isolation.network === 'host') fail('the task must not share the host network namespace.');
  if ((spec.network.publishedPorts ?? []).length > 0) fail('a task sandbox publishes no port.');

  if (spec.security?.privileged) fail('privileged mode.');
  if (!spec.security?.noNewPrivileges) fail('no-new-privileges must be set.');
  if (!(spec.security?.capabilitiesDropped ?? []).includes('ALL')) fail('all capabilities must be dropped.');
  if ((spec.security?.capabilitiesAdded ?? []).length > 0) fail(`added capabilities: ${spec.security.capabilitiesAdded.join(', ')}.`);
  // A writable root is the same class of escape as the rest of this list. A
  // task that can write `/usr/local/bin/node` replaces the interpreter the next
  // attempt on that image runs, so the boundary has to be refused here rather
  // than only stated by the image the attempt happens to name.
  if (!spec.security?.readOnlyRootFilesystem) fail('the root filesystem must be read-only.');
  // Principle 12: durable state is authoritative and sessions are disposable.
  // A workspace that outlives its attempt is a second place an attempt's
  // decisions can live, and the one the ledger does not know about.
  if (!spec.workspace?.disposable) fail('the attempt workspace must be disposable.');

  for (const mount of spec.mounts ?? []) {
    const source = String(mount.source ?? '');
    if (!source.startsWith('/')) fail(`mount source ${source} is not an absolute path.`);
    if (source.includes('..')) fail(`mount source ${source} contains a parent-directory segment.`);
    // The broker socket, the attempt's own grant file and — when the lane is
    // enabled at all — the model gateway socket are the deliberate handles. The
    // exemption is matched on the *pair*: a mount is exempt only when it
    // carries the exact source the spec named for that target, so a hostile
    // edit cannot smuggle `/etc/shadow` through by borrowing the grant
    // target's name. A spec with no `modelAccess` exempts no model target, so
    // the lane cannot be reopened by naming its path.
    const exempt =
      (mount.target === spec.factoryAccess?.containerSocketPath && source === spec.factoryAccess?.brokerSocket) ||
      (mount.target === spec.factoryAccess?.containerGrantPath && spec.factoryAccess?.grantFile !== null && source === spec.factoryAccess?.grantFile) ||
      (spec.modelAccess !== null && spec.modelAccess !== undefined
        && mount.target === spec.modelAccess.containerSocketPath && source === spec.modelAccess.gatewaySocket);
    if (exempt) {
      if (mount.target === spec.factoryAccess?.containerGrantPath && mount.mode !== 'ro') {
        fail('the attempt grant must be mounted read-only.');
      }
      continue;
    }
    for (const forbidden of FORBIDDEN_MOUNT_SOURCES) {
      // `/` is in the list and is matched exactly by the first comparison, so
      // the host root needs no separate branch: mutation testing found the one
      // that was here could only run in the iteration where the line above had
      // already refused the same input.
      if (source === forbidden || (forbidden !== '/' && source.startsWith(`${forbidden}/`))) {
        fail(`mount of ${source} would hand the task ${forbidden}.`);
      }
    }
  }

  const allowed = new Set(spec.environment?.allowed ?? []);
  for (const name of allowed) {
    for (const pattern of spec.environment?.forbiddenPatterns ?? []) {
      if (name.includes(pattern)) fail(`environment variable ${name} matches the forbidden pattern ${pattern}.`);
    }
  }
  if (allowed.has('APP_BUILDER_AGENT_GRANT_SECRET')) fail('the grant signing key must never enter the sandbox.');

  for (const [key, value] of Object.entries(spec.limits ?? {})) {
    if (!Number.isFinite(value) || value <= 0) fail(`limit ${key} must be a positive bound, not ${value}.`);
  }
  if (spec.factoryAccess?.transport !== 'unix-socket') fail('the task reaches the Factory over a socket, never a network origin.');
  return spec;
}
