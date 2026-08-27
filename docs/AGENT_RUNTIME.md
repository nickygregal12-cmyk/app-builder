# Dedicated App Builder Agent Runtime

Status: **host infrastructure validated; autonomous runtime still deferred**. The isolated App Builder services now exist on the owner's existing Hetzner host, but this document still defines a future `AgentRuntimeAdapter`/sandbox/orchestration boundary. A live OpenCode endpoint is infrastructure, not permission to run broad autonomous loops.

## Goal

App Builder should eventually have its own dedicated long-running agent environment for website/application work. **Dedicated means logically and operationally isolated, not necessarily a second paid VM.** The initial deployment is co-located on the existing Hetzner host with a separate Linux identity, repository, state, resource slice, credentials and loopback services; it must remain separate from existing project-specific runtime state and authority.

OpenCode is the initial agent-runtime implementation endpoint. The architecture must remain provider-neutral so OpenCode can be upgraded, replaced or complemented without changing generated applications or core factory contracts.

The runtime should let specialist agents work in bounded loops for long periods, hand work to other specialists, lose/compact conversation context safely, resume after interruption, run tests and browser checks, create checkpoints and continue until a clear success/stop condition is reached.

## Important sequencing: MCP before full runtime

The Phase 3.7 factory service/tool contract makes a smaller interoperability step useful before broad autonomous runtime execution is enabled.

A Phase 3.8 MCP v2 adapter may expose safe deterministic factory operations to Codex/ChatGPT, Claude Code, OpenCode and other compatible clients:

```text
External coding client
      |
    MCP v2
      |
Factory service tool facade
      |
Factory/control-plane deterministic operations
```

This is deliberately **not** the autonomous runtime.

MCP may provide project/build/verify/preview/read operations, but it does not own:
- durable task truth;
- budgets/loop guards;
- specialist scheduling;
- sandbox lifecycle;
- environment/production authority;
- secret policy;
- checkpoints/recovery;
- production deployment approval.

Those remain service/control-plane/runtime responsibilities. MCP is another adapter.

## Core invariant: sessions are disposable; state is durable

An agent conversation is never the source of truth for a build.

A fresh agent session must be able to reconstruct the next useful action from persisted factory state:

- approved Build Contract and Project Manifest;
- project knowledge pack and trusted source provenance;
- Design Contract/DesignSystemSpec where relevant;
- explicit development/preview/production environment identity;
- current repository/ref/worktree;
- active task specification and acceptance criteria;
- Build/Event Ledger;
- declared ChangeSet and actual diff;
- latest deterministic test/CI/browser/database/accessibility failures;
- checkpoints and prior attempt summaries;
- relevant architecture/recipe/presentation/skill authorities;
- remaining cost/time/iteration budget;
- explicit blockers or approval gates.

Context compaction, model switches, server restarts and deliberate session replacement must therefore be normal supported operations rather than exceptional recovery paths.

## Architecture boundary

Introduce a provider-neutral `AgentRuntimeAdapter` owned by the App Factory control plane.

The initial implementation may use OpenCode, but the factory must not encode OpenCode-specific session IDs, prompts or tool semantics into generated projects or stable product contracts.

```text
Builder Console
      |
Factory Service / Control Plane
      |
      +-- Task / Event Ledger
      +-- Context Packet Builder
      +-- Policy + Approval Engine
      +-- Cost / Model Router
      +-- Checkpoint Store
      +-- Verification Gates
      +-- Environment Identity
      |
AgentRuntimeAdapter
      |
      +-- OpenCode adapter (initial Hetzner runtime)
      +-- future runtime adapters
      |
Isolated project workspace / sandbox
```

## Hetzner deployment boundary

The first hosted shape is **co-located on the existing Hetzner host but isolated from existing project-specific runtimes**:

```text
existing Hetzner host
|
+-- existing project-specific runtime(s)
|   +-- their own users/repos/state/services/credentials
|
+-- appbuilder runtime boundary
    +-- Linux user: appbuilder (non-sudo, no inbound SSH key)
    +-- /srv/app-builder/repository
    +-- /srv/app-builder/state + workspaces + checkpoints + artifacts
    +-- app-builder-runtime.slice CPU/memory/task limits
    +-- Factory service: 127.0.0.1:4310
    +-- OpenCode 1.18.14: 127.0.0.1:4097 + HTTP Basic Auth
    +-- rootless Podman groundwork for future task sandboxes
    +-- future AgentRuntimeAdapter / bounded worker pool
```

A second server is not a prerequisite. Move to a separate host only when measured CPU, memory, browser/database contention or a stronger security/operations requirement justifies a machine boundary.

The App Builder service may reuse proven operational patterns from other runtimes but must not inherit project-specific product logic, prompts, authorities, credentials or unrestricted permissions.

### What the boundary proves today, and what it does not

Three boundary lanes have been exercised and hold in CI; the dated run records live in Git. What they
established is stated as invariants, because that is what a later agent needs.

**Host boundary.** The factory runs as an unprivileged `appbuilder` account answering `/health` on
`127.0.0.1:4310`, with durable state and workspaces under `/srv/app-builder` rather than inside the Git
checkout, rootless Podman with non-overlapping subordinate UID/GID ranges, both services inside the App
Builder resource slice, neither endpoint publicly bound, and no sudo authority or inbound SSH key.
Provider credentials, autonomous scheduling and boot enablement remain deliberately absent.

**MCP lane.** The bounded agent-facing path runs end to end: OpenCode launches the `apps/mcp` stdio
adapter, the served tool list is exactly the declared bindings and nothing more, a bounded read journey
returns Factory-owned state, and the excluded capabilities are *absent* rather than merely unused — no
secret, filesystem, shell, fetch, deployment or database tool exists on the surface; an unregistered
tool name is rejected; a traversing or absolute project identifier is refused; ingestion refuses
non-`http(s)`, loopback and link-local destinations; and the adapter refuses to start against a
non-loopback origin. Every refusal lands in the durable event ledger, so the boundary is auditable
after the session ends. `npm run opencode:doctor` holds the configuration contract inside
`npm run check`; `npm run opencode:smoke` runs the live journey; `docs/MCP_ADAPTER.md` carries the
configuration.

The OpenCode `permission` block is client configuration, not enforcement. It is defence in depth only;
the capability broker is the boundary.

**Capability boundary.** The runtime-to-Factory boundary is enforced in code rather than described in
metadata:

```text
task policy (config/agent-policies.json)
  -> role capability projection (capabilitiesForRole)
  -> signed attempt-scoped grant
  -> trusted capability broker on a Unix socket
  -> authorisation: capability, project, environment, approval, budget
  -> Factory operation
  -> durable allow-or-deny decision in the event ledger
```

- `config/agent-capabilities.json` is the operation-level agent surface. Every Factory operation is
  either an agent capability or an explicitly declared internal-only one, recorded with the fragment of
  `apps/service/src/http.js` that serves it.
- `packages/control-plane/src/capabilities.js` mints and verifies grants and makes the single
  deny-by-default authorisation decision. `approvalRequired` is evaluated there, before dispatch.
- `apps/service/src/agent-broker.js` listens on a Unix socket, serves one endpoint for one method, and
  takes an operation *name* rather than a URL — so there is no path for a hostile caller to respell,
  re-encode or traverse.
- A role receives an operation only when its policy allows every action that operation needs outright
  **and** it owns every mutation scope the operation writes. A role that owns no mutation scope
  receives no mutating operation at all.

`tooling/agent-capability-boundary.test.mjs` is the acceptance: an internal-only operation is
unreachable even under the most privileged grant the system can mint; a forged, tampered, expired,
replayed, wrong-project or wrong-environment grant fails closed with a named reason; an approval-gated
operation without an approval is refused before the mutation; and every decision lands in the ledger.

**What must not be read into any of it.** No provider credential exists, so no model session has
invoked a Factory tool — only the transport, tool surface and adapter behaviour are evidenced. No role
is runtime-ready, no loop is scheduled, and no phase claim advances.


### The task sandbox: removing the route, not just the authority

The broker removes a task's *authority* to invoke an internal operation. It does
not by itself remove the *route*: a process sharing the host network namespace
can open a socket to `127.0.0.1:4310` whatever the broker thinks. Removing the
authority is therefore only half of it; the other half is an isolation contract.

`packages/control-plane/src/execution-environment.js` defines it, provider-
neutrally. An attempt runs rootless, with its own network, PID, IPC, UTS and
cgroup namespaces; no host namespace, no container control socket, no
`/srv/app-builder`, no `/etc/app-builder`, no published port, no added
capability, `no-new-privileges`, all capabilities dropped, a read-only root
filesystem, a `noexec` tmpfs, and bounded CPU, memory, PIDs and wall clock. The
only Factory reach is one bind-mounted Unix socket. `assertSpecIsolation` fails
closed on every widening rather than warning about it, and each branch of it is
a way a container has actually been escaped in the wild.

Network profile follows policy, not preference: a role gets
`public-egress-only` only when its policy allows `network.public` outright, and
everything else gets `none`. Even the egress profile keeps its own namespace and
the same forbidden destinations — the host control plane, private ranges and
link-local metadata.

`tooling/lib/sandbox-podman.mjs` is one runtime's spelling of that spec. Keeping
the translation in tooling rather than the control plane is what stops Podman
from becoming a stable requirement of the factory; a second runtime would be a
second translation, not a second definition of the boundary. It refuses an
unpinned image and refuses an argv carrying an isolation-breaking flag, whoever
added it.

`tooling/agent-sandbox.test.mjs` proves the property by connecting, not by
asserting about configuration. It starts the real Factory HTTP server, confirms
it answers on host loopback — without that the isolated failures would prove
nothing but a dead listener — then, from inside a fresh empty network namespace,
attempts `127.0.0.1:4310`, `localhost:4310`, `[::1]:4310` and every global
address the host holds. All are refused; the namespace sees only loopback; and
the broker still answers over the mounted socket, so the boundary is usable
rather than merely closed.

That namespace is the same kernel primitive rootless Podman's `--network=none`
creates. It is a faithful proof of the property and it is **not** a proof that
the hosted Podman installation is configured that way.
`ops/hetzner/verify-agent-boundary.sh` is that proof, it runs a real
`--network=none` container on the host, and it is the operator's to run.

### The attempt lifecycle

`packages/control-plane/src/attempts.js` owns what an attempt *is*. `createAttemptPlan` binds task,
attempt, project, environment, role, policy, projected operation capabilities, the signed grant,
workspace, context packet, budget, network profile, broker socket and pinned image in one place, and
each is a required input rather than something read from ambient host state.

```text
control plane
   |
ExecutionEnvironmentAdapter          packages/control-plane/src/execution-adapter.js
   |
ExecutionDriver (7 neutral verbs)    create start inspect collect signal remove list
   |
rootless Podman today                tooling/lib/execution-driver-podman.mjs
local process for the canary         tooling/lib/execution-driver-local.mjs
   |
isolated attempt
```

The grant is minted inside trusted control-plane code with a secret that never enters a sandbox, and
the durable record keeps its **fingerprint** rather than the token, so the ledger is auditable without
becoming a place to steal authority from. **It reaches the sandbox as a read-only mounted file, never
as `--env GRANT=...`**: on a shared host every other user can read the process table, and an
attempt-scoped bearer credential on a command line is a credential handed to everyone on the machine.

Three supervision properties are the reason the adapter exists:

- **a wall clock that does not depend on anyone waiting.** The bound is a referenced timer inside the
  adapter, so an attempt is stopped even when no caller is blocked on its exit;
- **disposal is not optional.** Every terminal path — a failed start and a cancelled attempt included —
  runs through `dispose`, which asks the driver to confirm removal and raises an orphan rather than
  assuming it;
- **restart recovery never guesses success.** `reduceAttemptEvents` rebuilds attempt state from the
  ordinary project ledger and `recover` reconciles it against the runtime: still running is adopted,
  gone is recorded `lost`, and a sandbox the ledger never mentioned is reported as an orphan. "We do
  not know" and "it worked" are different answers.

There is no second ledger. Attempt lifecycle events are ordinary control-plane events on the project's
existing stream, so cost, duration, capability decisions and attempt outcome stay reconcilable.

`npm run runtime:canary` and `tooling/runtime-lifecycle.test.mjs` prove the whole lifecycle **before
any model provider exists** — deliberately, because calling a model inside a sandbox nobody can start,
bound, cancel, collect and dispose of would produce output with no evidence. Where a network namespace
is unavailable every isolation claim is reported `unproven` and the test fails unless
`APP_BUILDER_ALLOW_UNPROVEN_ISOLATION=1` is set deliberately: a skipped proof under a green tick has
already cost this repository one false pass.

### The pinned task image

`config/task-images.json` is the only place a task image identity is declared. An attempt records the
image it ran **by content digest**, and three separate places refuse a floating tag: `podmanRunArgs`,
`assertPinnedImage` in the attempt record, and `resolveTaskImage`, which refuses an image whose digest
has not been recorded and returns the build command instead of something plausible.

`ops/images/app-builder-task/Containerfile` is minimal by intent — Node, npm, git, CA certificates —
because everything in a task sandbox is reachable by an untrusted task, and a tool added speculatively
is a tool an attempt can be steered into using. It runs as uid 1000, strips every setuid and setgid bit
so a future base-image change cannot quietly reintroduce an escalation route, carries no container
client and no `sudo`, works with a read-only root and a `noexec` /tmp, and declares no `ENTRYPOINT` —
the command an attempt runs is the adapter's to supply. Its base is pinned by a registry-resolved
digest recorded in the manifest, and a doctor checks the two agree.

Recording a built digest is a reviewed change on purpose: repointing a tag underneath a proven boundary
is what the pin exists to prevent. **The manifest's digest is `null` today**, so every attempt naming
`task-baseline` fails closed with the build command — the correct state, not an omission.
`ops/hetzner/build-task-image.sh` builds the image, runs the image-boundary checks against it, and
prints the digest with the exact edit to make.

### The public-egress network profile

`network=none` is the default. A few roles — research, brand research, source ingestion — have policies
that allow `network.public` outright, and this profile is the only way they get it. **Public egress
must not mean host-network access.**

`packages/control-plane/src/egress-policy.js` is the executable definition of the difference. It
classifies a destination and refuses everything that is not the public internet: the Factory control
plane, host loopback, RFC1918, link-local, cloud metadata, unique-local IPv6, carrier-grade NAT (where
Tailscale addresses live), and the host's own global addresses. It is code rather than a list in a
shell script because `127.0.0.1`, `127.1`, `0x7f.1`, `2130706433`, `::ffff:127.0.0.1` and `[::1]` are
the same destination, and a filter that knows only the first spelling is a filter a task can walk
around. A DNS name is never allowed on its own — it classifies as `dns-name` and must be resolved
first, because reporting an unresolved name as public is what makes DNS rebinding work.

Hosted enforcement is `ops/hetzner/install-egress-network.sh`: a bounded `app-builder-egress` bridge
with `isolate=true`, an nftables ruleset, and an anchor unit that keeps the rootless network namespace
(and therefore the ruleset) from being torn down when the last container exits.

`ops/hetzner/verify-egress-profile.sh` is the gate. It generates its forbidden-destination list from
the control-plane policy rather than restating it, proves the refusals from inside a real
`--network=app-builder-egress` container against a live Factory, and **also** proves public DNS and
HTTPS still work — a profile that reaches nothing has silently become `none`. It fails closed twice
over: the Podman driver refuses `public-egress-only` when the named network is absent, and again when
`/etc/app-builder/egress-profile.json` is missing, covers a different network, records a failure or has
lapsed. An untested, failed or stale filter is not a filter, and the driver never falls back to an
unfiltered network.

**The hosted filter is not proved yet.** CI proves the declaration, the resolver, the argv translation,
the destination policy and the fail-closed behaviour. It does not prove the hosted filter, and the two
must not be read as one.

### Nothing here promotes a role

All roles stay `runtimeReady: false`. `config/runtime-readiness.json` is the explicit promotion gate
and `packages/control-plane/src/runtime-readiness.js` enforces it deny-by-default across context
packet, operation set, environment profile, pinned image, lifecycle support, deterministic coverage,
convergence behaviour and one reviewed real model attempt. A test asserts that infrastructure evidence
alone still refuses promotion.

The two requirements that remain unmet for every role are the pinned image's host build digest with the
hosted egress attestation, and one bounded low-risk real-model canary. That canary's runbook — the
credential, the role, the kill switch, the hard budget and what counts as acceptance — is
`docs/MODEL_CANARY.md`, and nothing in this lane enables it automatically.


### The OpenCode adapter seam

OpenCode is the first runtime implementation, not the architecture. The seam it
will sit behind already exists and is deliberately small: `ExecutionDriver` is
seven verbs, and an `AgentRuntimeAdapter` for a model session belongs *inside*
an attempt, not beside it — the attempt is what is bounded, budgeted and
disposed of, and a model session that outlived its attempt would be outside
every guard in this document.

Two rules for when that adapter is written:

- **no runtime identifier reaches a stable contract.** An OpenCode session id
  belongs in an attempt's transient runtime state, never in a generated
  application, a project contract, a ChangeSet or a checkpoint. A future
  runtime must be substitutable without a migration;
- **no provider credential reaches a sandbox.** The same rule the capability
  grant already follows: the trusted side holds the key and the sandbox holds
  scoped authority. A provider key delivered into an attempt would undo the
  boundary #55 closed, by a different route.

No provider credential is introduced anywhere in this lane.

### Materialising roles into a runtime, later

`npm run agents:materialise` projects `config/agent-roles.json`, `config/agent-pipelines.json` and
`config/agent-policies.json` into the shape OpenCode agent definitions would take, optionally scoped
to one project class. It is a **dry run**: it prints, it refuses to write `opencode.json`, every
projected role carries `runtimeReady: false` with its blockers, and no role is promoted.

The projection is how the "two sources of truth" failure is avoided: registry roles become subagents
mechanically — no primary is invented — tools are derived deny-by-default from the role's capability
policy (an approval-gated action is not an enabled tool), and each role's Factory reach is its
operation-level capability set from `config/agent-capabilities.json`. That set comes from
`capabilitiesForRole`, the same function the trusted broker's grant minting uses, so the projection
cannot drift from what is actually enforced. Approval-gated capabilities are listed separately as
`approvalGatedMcpTools` rather than as enabled tools. When a runtime finally needs agent definitions,
it should generate them from the registry through this projection rather than maintain a second
hand-written taxonomy.

### OpenCode 2 evaluation

Checked 2026-08-26: no 2.x release of `opencode-ai` is published. `latest` is `1.18.23`; the only
non-1.x channels are `beta`, `next` and per-branch snapshots, all versioned `0.0.0-*`. A side-by-side
benchmark therefore has nothing stable to benchmark against and is **not** justified yet.

Revisit when a 2.x line is published as a stable dist-tag, and then only as a side-by-side install
(it ships as a separate binary) measuring the things that would actually change the
`AgentRuntimeAdapter`: whether subagent definitions can be generated from the role registry rather
than hand-written, whether its permission model enforces capability boundaries in the runtime instead
of the client configuration, and whether session lifecycle/compaction supports fresh-session-per-role
with durable resume. Adopt nothing beta-only into stable factory architecture, and keep 1.18.14 as
the validated runtime until the replacement passes the same lane smoke.

## Runtime adapter responsibilities

A future `AgentRuntimeAdapter` should support operations conceptually equivalent to:

- create/resume/terminate a runtime session;
- provide a bounded context packet and selected skills;
- select model/provider according to factory routing;
- stream structured progress and usage events;
- execute an approved task inside its assigned workspace;
- interrupt/cancel/pause;
- return tool/model/patch summaries;
- request another specialist or escalation;
- compact/end a session and persist an attempt summary;
- start a clean session from the latest durable checkpoint;
- report provider capacity exhaustion as structured state rather than losing the task.

It should not own project truth, permissions, budget rules, environment authority or deploy approval. Those remain control-plane/service responsibilities.

## Provider capacity and interruption recovery

One invariant governs this whole area: **provider quota exhaustion, model failure, a closed browser
and a dead model session are scheduling events, not project-loss events.** A task that cannot
continue right now is a task that waits, not a task that failed.

The durable shape is:

`running -> checkpoint durable state -> waiting-for-capacity -> approved fallback only if it clears the task's quality threshold -> otherwise resume later in a fresh session`

When capacity disappears mid-attempt:

1. persist the attempt summary, checkpoint, diff and test state;
2. record the attempt outcome honestly rather than as a failure of the work;
3. select another provider only when its measured capability clears the task's threshold and policy
   permits it — a cheaper model finishing a task it cannot do well is a worse outcome than waiting;
4. otherwise leave the durable task waiting for capacity;
5. resume later in a fresh session from Factory state.

The states this needs are ordinary durable task states, not a second lifecycle: waiting-for-capacity,
provider-exhausted, fallback-selected, paused-by-budget, waiting-for-human-approval and
interrupted/retryable. The Console stays usable while a task waits, and closing a browser tab never
kills a job.

### Capacity and entitlement in the model router

The model router therefore needs to know more than a price per token. Where observable, represent per
provider or runtime:

- authentication/entitlement type: subscription, free, included credit, paid API or local;
- current availability;
- quota or capacity signal, and any known reset;
- cash cost;
- quota scarcity — the shadow cost of spending a scarce included allowance;
- measured quality by task class;
- context and tool capabilities;
- independence family, so a second opinion is genuinely independent;
- fallback eligibility, and whether paid overage is authorised at all.

A subscription call can have zero incremental cash cost while still being expensive when the
remaining allowance is scarce, so the routing target is:

`deterministic -> proven free or cheap model -> premium model when task quality requires it -> genuinely independent reviewer where valuable -> paid overage only when explicitly authorised`.

Model choice follows task class and measured evidence. Do not permanently assign one vendor to one
role. Paid API spend remains separately budgeted and hard-disableable, per the budget rules the
control plane already enforces.

## Autonomous loop

A long-running task should operate roughly as:

```text
load durable task
-> evaluate stop/approval/environment conditions
-> resolve pipeline stage and specialist role from the role registry
-> build minimal role context packet (declared artifact kinds only)
-> choose model + skill packet for that role
-> start fresh/runtime session
-> declare ChangeSet
-> validate normalized file scope
-> implement bounded change
-> deterministic verification
-> independent reviewer issues a verdict (never the author)
-> evaluate handoff; promote only on artifacts + evidence + checks + verdict
-> record events/cost/diff/result
-> checkpoint
-> evaluate convergence and route any failing gate to its owning role
-> if complete: close task
-> if useful progress: schedule next attempt
-> if wrong specialist/model: hand off
-> if context is bloated: end session and restart clean
-> if repeated/no progress or budget exhausted: stop/escalate
```

No loop may continue merely because the model says it should. Deterministic loop guards remain authoritative.

## Specialist workers

Specialist roles are no longer a runtime-era sketch. They are registered in `config/agent-roles.json`
and routed by project class in `config/agent-pipelines.json`, with the deterministic primitives in
`packages/control-plane/src/roles.js`. The runtime's job is to **execute** that registry, not to
invent its own agent taxonomy.

Roles are permission profiles plus a small skill packet plus a bounded artifact surface — not
personalities with unlimited access. Each role declares its capability policy, context route and
ceiling, mutation scope, budget, stop criteria, escalation target and the independent reviewer that
must promote its work.

The runtime must therefore:

- resolve the pipeline for the project class rather than running one universal sequence;
- start a **fresh session per role**, so a specialist does not inherit an unrelated specialist's context;
- build the role's context packet with `buildRoleContextPacket` and pass nothing else;
- refuse a ChangeSet scope the role does not own;
- route the produced artifacts to the registered independent reviewer, never back to the author;
- persist a `StageHandoff` and only then advance;
- act on the `ConvergenceReport`: work the rework queue in severity order, re-entering the pipeline
  at the role that owns each failure;
- stop on convergence, a hard budget, or a genuine block — never because a model reported success.

See `docs/AGENT_SPECIALIST_ARCHITECTURE.md` and `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`.

## Genuine cross-model independence

The runtime is the first place where "independent review" can be made real rather than rhetorical.

A different persona on the same model is not an independent reviewer. For security, architecture,
release-critical, cross-layer, irreversible and high-cost decisions the `independent-second-opinion`
role should execute through a **different `AgentRuntimeAdapter` model or runtime** from the one that
produced the work, with fresh context, read-only access, a bounded diff and only the relevant
authority.

Requirements:

- the verdict records which model/runtime produced it, so independence is auditable rather than assumed;
- if no genuinely different runtime is available, the runtime records the skip and relies on native
  review and deterministic gates — it never relabels a same-model pass as independent;
- disagreement between reviewers is preserved in the evidence rather than resolved into a synthetic
  consensus;
- trivial or reversible changes do not buy this pass.

## Graph-assisted context discovery

Deferred deliberately. Once the repository has grown through specialist agents, the presentation
registry, design intelligence, multiple templates, recipes, runtime adapters, the Builder Console and
deployment machinery, an optional bounded graph query may sit between the deterministic route and the
file shortlist:

```text
task -> deterministic route -> optional bounded graph query -> shortlisted files
     -> exact symbol search -> small context packet -> specialist agent
```

Rules that make it safe to add later:

- a graph or index is **navigation evidence, never repository truth** — conclusions are verified in
  source, schemas and tests;
- the query stays inside the first-orientation token budget in `config/agent-routing.json`;
- generated graph output is local and disposable, never committed and never an authority;
- it never becomes a required dependency, a CI gate or a precondition for delivery. If it is
  unavailable or stale, the packet says so and the agent falls back to bounded search.

Do not adopt it while bounded search still answers the question.

## Compound learning at closeout

After substantial completed work the runtime may run the `compound-learning` role once. It asks
whether the work revealed a non-obvious, likely-to-recur lesson that is supported by evidence and not
already encoded, and whether recording it would reduce future work and context.

If any answer is no, it records nothing. If yes, it names the **narrowest existing durable home** —
a regression test or deterministic check first, then the governing architecture authority, then a
skill adapter or its evaluation, then the operations/control-plane authority — and the owning creator
role makes the change through the normal route. Temporary run facts stay in task/PR evidence.

It never creates a lessons file, a memory store or a parallel knowledge base. The target is better
future behaviour with **less** context, not accumulating prose.

## Context-loss recovery

At the end of each attempt, persist a compact structured attempt summary containing:

- objective attempted;
- decisions made and why;
- files actually changed;
- test/verification outcomes;
- remaining failures;
- assumptions that remain unverified;
- next recommended action;
- whether the next attempt should use the same or a different specialist/model;
- the current stage, its independent reviewer and the outstanding rework queue with owning roles;
- current cost/iteration totals;
- checkpoint/repo/environment reference.

The next session should consume this summary plus current machine state, not replay the full previous transcript.

## Isolation and secrets

Each task/project should use an isolated workspace behind the future `ExecutionEnvironmentAdapter` defined in the control-plane plan.

Requirements:

- bounded CPU/memory/runtime;
- project-specific filesystem/worktree;
- normalized/segment-correct ChangeSet file-scope enforcement;
- public network access only when task policy allows it;
- secrets injected only by scope and environment and only when required;
- no inheritance of unrelated project secrets;
- no ordinary agent access to production credentials;
- preview deployments separated from production approval;
- database migration permission bound to the intended environment;
- workspace/checkpoint can be destroyed without losing durable task state.

## Deterministic gates before model judgement

Before expensive AI review/fix loops, the runtime should consume factory-owned results for applicable checks such as:

- schema/Ajv boundary validation;
- typecheck/lint/unit/E2E;
- generated-app build;
- executed Supabase RLS/security tests;
- accessibility/axe gates;
- ChangeSet/path-policy validation;
- performance/security/static checks;
- DesignSystemSpec linting;
- browser smoke tests.

A model may interpret failures or propose fixes, but it does not decide whether a deterministic gate ran or whether a failed security boundary should be waived.

## Builder Console integration

The Console should eventually show the runtime as a controllable system rather than a black-box chat:

- active/queued/completed tasks;
- current specialist/model/skill set;
- progress/event timeline;
- current ChangeSet and diff scope;
- target environment;
- tests/browser/database/security/accessibility results;
- cost/time/iteration budget consumed;
- latest checkpoint;
- pause/cancel/resume/retry controls;
- handoff/escalation reason;
- approval requests for sensitive actions;
- restore from checkpoint;
- preview URL/artifacts.

## Success criteria before production use

Do not enable broad autonomous loops merely because OpenCode can run continuously. The hosted runtime is ready only when:

1. durable control-plane/service contracts are implemented and tested;
2. task state survives session deletion/restart;
3. ChangeSet scope matching has normalized segment-correct semantics and property/adversarial coverage;
4. untrusted source content cannot grant instruction authority or tools;
5. permissions are deny-by-default;
6. cost/time/iteration/no-progress loop guards work;
7. workspaces and secrets are isolated;
8. development/preview/production environment identity is explicit and policy-enforced;
9. canonical benchmark builds detect regressions;
10. deterministic checks run before expensive AI review;
11. database security recipes have executed acceptance where applicable;
12. production deploy/database actions require explicit approval;
13. generated apps remain independent of MCP/OpenCode/runtime infrastructure;
14. specialist roles execute from the registry in disposable per-role sessions rather than one long general-purpose session;
15. reviewer independence, handoff promotion and convergence stopping are enforced by the control plane rather than by prompt wording.

## Portability rule

Generated apps must never need OpenCode, the Hetzner control service, MCP, the Builder Console or App Builder packages to run in production. The runtime is development infrastructure only.

See `docs/BEST_IN_CLASS_CAPABILITIES.md` for the reviewed capability backlog and `docs/FACTORY_CONTROL_PLANE.md` for the deterministic safety/control contracts this runtime must obey.