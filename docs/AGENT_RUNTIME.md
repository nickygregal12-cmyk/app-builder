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

### Validated infrastructure milestone — 2026-08-26

The co-located infrastructure has been exercised on the real host and passed the intended boundary checks:

- the factory runs as `appbuilder` and answers `/health` on `127.0.0.1:4310`;
- factory durable state and workspaces resolve under `/srv/app-builder`, not inside the Git checkout;
- OpenCode `1.18.14` runs as `appbuilder` on `127.0.0.1:4097`;
- authenticated `/global/health` returns `200` and an unauthenticated request returns `401`;
- the existing project-specific OpenCode endpoint remains independently bound to its own loopback port;
- neither App Builder endpoint is publicly bound;
- the App Builder account has no sudo authority or inbound SSH key;
- rootless Podman and non-overlapping subordinate UID/GID ranges are available;
- both App Builder services run inside the App Builder resource slice;
- provider/model credentials, autonomous scheduling and boot enablement remain deliberately absent.

This milestone proves the **host boundary only**. It does not satisfy the autonomous-runtime success criteria below and does not advance the machine-readable product phase past its current genuine-business acceptance gate.

### Validated MCP lane milestone — 2026-08-26

The bounded agent-facing path has now been exercised end to end against a running factory service.
It was run on a development runtime with the same pinned OpenCode `1.18.14` and the same loopback
`127.0.0.1:4310` factory, not on the Hetzner host: the host re-run is the documented command in
`ops/hetzner/README.md` section 6a and is still outstanding. The lane under test is:

```text
OpenCode 1.18.14 (loopback, no provider credentials)
  -> opencode.json: one local MCP server, command ["npm","run","mcp"]
  -> apps/mcp stdio adapter (loopback service origin enforced)
  -> FACTORY_TOOLS-backed service operations
  -> durable Factory project/task/event/checkpoint state
```

What is proven:

- OpenCode launches the existing adapter and completes the MCP handshake (`opencode mcp list`
  reports `app-builder connected`; the loopback OpenCode server's `GET /mcp` agrees);
- the served tool list is exactly the declared bindings — 21 tools, no more;
- a bounded read journey (projects, project, Manifest, composition, tasks, events, checkpoints,
  metrics) and one safe deterministic operation (preview status) return Factory-owned state;
- the excluded capabilities are absent rather than merely unused: no secret, filesystem, shell,
  fetch, deployment or database tool exists on the surface; an unregistered tool name is rejected;
  a traversing or absolute project identifier is refused; ingestion refuses non-`http(s)`, loopback
  and link-local destinations; and the adapter refuses to start against a non-loopback origin;
- refusals land in the durable event ledger, so the boundary is auditable after the session ends.

`npm run opencode:doctor` holds the configuration contract in `npm run check`; `npm run opencode:smoke`
runs the live journey. `docs/MCP_ADAPTER.md` carries the configuration itself.

What is **not** proven, and must not be read into this milestone:

- no provider credential exists, so no OpenCode *model session* has invoked a Factory tool. Only the
  transport, tool surface and adapter behaviour behind that connection are evidenced;
- the OpenCode `permission` block is client configuration, not enforcement. It remains defence in
  depth only; the capability broker below is the boundary;
- no role is runtime-ready, no loop is scheduled and no phase claim advances.

### Validated capability-boundary milestone — 2026-08-26

The runtime-to-Factory capability boundary issue #55 describes is now enforced in
code rather than described in metadata. The enforced path is:

```text
task policy (config/agent-policies.json)
  -> role capability projection (capabilitiesForRole)
  -> signed attempt-scoped grant
  -> trusted capability broker on a Unix socket
  -> authorisation: capability, project, environment, approval, budget
  -> Factory operation
  -> durable allow-or-deny decision in the event ledger
```

What changed:

- `config/agent-capabilities.json` is the operation-level agent surface. Every
  Factory operation is either an agent capability or an explicitly declared
  internal-only one, and the rich Console routes are recorded as internal-only
  with the fragment of `apps/service/src/http.js` that serves each;
- `packages/control-plane/src/capabilities.js` mints and verifies grants and
  makes the single deny-by-default authorisation decision. `approvalRequired`
  is evaluated there before dispatch;
- `apps/service/src/agent-broker.js` is the trusted broker. It listens on a
  Unix socket, serves one endpoint for one method, and takes an operation
  *name* rather than a URL — so there is no path for a hostile caller to
  respell, re-encode or traverse;
- the coarse projection rule the #78 review recorded is gone. A role receives an
  operation only when its policy allows every action that operation needs
  outright and it owns every mutation scope the operation writes; a role that
  owns no mutation scope receives no mutating operation at all.

`tooling/agent-capability-boundary.test.mjs` is the acceptance. It proves, among
other refusals: an internal-only operation is unreachable even under the most
privileged grant the system can mint; a forged, tampered, expired, replayed,
wrong-project or wrong-environment grant fails closed with a named reason; an
approval-gated operation without an approval is refused before the mutation; a
narrowly-scoped mutation succeeds while the adjacent one stays forbidden; and
every decision lands in the durable ledger.

What this milestone does **not** yet prove, and must not be read as:

- the broker removes the *authority* to call an internal route; it does not by
  itself remove the *route*. A process that still shares the host network
  namespace can still reach `127.0.0.1:4310`. Closing that requires the task
  sandbox, and until it exists the boundary holds for a task that goes through
  the adapter and not for one with a shell on the host;
- no provider credential, schedule or runtime-ready role is introduced here.
  Every role remains `runtimeReady: false`.

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
- start a clean session from the latest durable checkpoint.

It should not own project truth, permissions, budget rules, environment authority or deploy approval. Those remain control-plane/service responsibilities.

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