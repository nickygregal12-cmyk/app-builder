# Dedicated App Builder Agent Runtime

Status: **host infrastructure and bounded OpenCode/MCP lane validated; autonomous runtime still deferred**. The isolated App Builder services exist on the owner's existing Hetzner host, and the bounded OpenCode -> MCP -> Factory lane has now been exercised there. This document still defines a future `AgentRuntimeAdapter`/sandbox/orchestration boundary. A live OpenCode endpoint is infrastructure, not permission to run broad autonomous loops.

`docs/PRODUCT_PROOF_PROGRAMME.md` now carries the evidence-led sequencing rule: runtime architecture may progress concurrently where it removes a real Phase 5 prerequisite, but it must not displace the minimum 4C/4D/4.2 product-quality sequence and the subsequent real-project freeze.

## Goal

App Builder should eventually have its own dedicated long-running agent environment for website/application work. **Dedicated means logically and operationally isolated, not necessarily a second paid VM.** The initial deployment is co-located on the existing Hetzner host with a separate Linux identity, repository, state, resource slice, credentials and loopback services; it must remain separate from existing project-specific runtime state and authority.

OpenCode is the initial agent-runtime implementation endpoint. The architecture must remain provider-neutral so OpenCode can be upgraded, replaced or complemented without changing generated applications or core factory contracts.

The runtime should let specialist agents work in bounded loops for long periods, hand work to other specialists, lose/compact conversation context safely, resume after interruption, run tests and browser checks, create checkpoints and continue until a clear success/stop condition is reached.

A further practical invariant is now explicit: **provider quota exhaustion, model failure, a closed browser and a dead model session are scheduling events, not project-loss events.**

## Important sequencing: MCP before full runtime

The Phase 3.7 factory service/tool contract makes a smaller interoperability step useful before broad autonomous runtime execution is enabled.

The Phase 3.8 MCP adapter exposes safe deterministic factory operations to compatible coding clients:

```text
External coding client
      |
    MCP
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
- production deployment approval;
- provider-capacity decisions.

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
- current provider/capacity state where available;
- explicit blockers or approval gates.

Context compaction, model switches, quota exhaustion, server restarts and deliberate session replacement must therefore be normal supported operations rather than exceptional recovery paths.

## Architecture boundary

Introduce a provider-neutral `AgentRuntimeAdapter` owned by the App Factory control plane.

The initial implementation may use OpenCode, but the factory must not encode OpenCode-specific session IDs, prompts or tool semantics into generated projects or stable product contracts.

```text
Builder Console
      |
Factory Service / Control Plane
      |
      +-- Task / Event Ledger
      +-- Durable Job Scheduler
      +-- Context Packet Builder
      +-- Policy + Approval Engine
      +-- Cost / Model / Capacity Router
      +-- Checkpoint Store
      +-- Verification Gates
      +-- Environment Identity
      |
AgentRuntimeAdapter
      |
      +-- OpenCode adapter (initial Hetzner runtime)
      +-- future runtime adapters
      |
ExecutionEnvironmentAdapter
      |
Isolated per-attempt worker / project workspace
```

Long-running build/model/test work must not be owned by an HTTP request or browser tab. The desired execution shape is:

`Factory API -> durable job -> scheduler -> ExecutionEnvironmentAdapter -> isolated worker -> durable progress/events/result`.

A small durable process/worker layer is enough initially. Do not adopt Temporal/LangGraph merely to obtain this shape.

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
- provider/model credentials, autonomous scheduling and broad agent execution remain deliberately absent.

This milestone proves the **host boundary only**. It does not satisfy the autonomous-runtime success criteria below and does not advance the machine-readable product phase past its current genuine-business acceptance gate.

### Validated MCP lane milestone — 2026-08-26 ✅ Hosted proof complete

PR #78 established the bounded OpenCode-side configuration, deterministic doctor, MCP smoke, exclusion tests and dry-run role materialisation. Issue #71 was then completed with the missing proof on the actual Hetzner host.

Hosted evidence:

```text
OpenCode 1.18.14
  -> opencode.json: one local MCP server, command ["npm","run","mcp"]
  -> apps/mcp stdio adapter
  -> FACTORY_TOOLS-backed service operations
  -> durable Factory project/task/event/checkpoint state
```

The real-host smoke passed **44 checks / 30 MCP operations** against existing durable Factory state and wrote evidence to:

`/srv/app-builder/artifacts/opencode-mcp-smoke.json`

OpenCode itself also reported:

`app-builder connected`

What is proven:

- OpenCode launches/connects to the existing adapter;
- the served tool list is exactly the declared bounded bindings;
- bounded project/Manifest/composition/task/event/checkpoint/metric/preview/integration reads return Factory-owned state;
- excluded secret/filesystem/shell/unrestricted-fetch/deployment/database capabilities are absent or refused;
- unregistered tools are rejected;
- traversing/absolute/empty project ids are rejected;
- ingestion refuses `file://`, loopback and link-local targets;
- the adapter refuses a non-loopback Factory origin;
- refusals are visible in durable Factory events.

What is **not** proven, and must not be read into this milestone:

- no provider credential is enabled for broad autonomous work;
- OpenCode client permissions are defence-in-depth configuration, not the security boundary;
- a process on the same host can still reach `127.0.0.1:4310` directly unless sandbox/runtime enforcement prevents it;
- no specialist role is runtime-ready and no autonomous loop is scheduled.

That direct-bypass gap is issue #55 and is the exact security prerequisite before a real worker may receive shell/network authority.

### Materialising roles into a runtime, later

`npm run agents:materialise` projects `config/agent-roles.json`, `config/agent-pipelines.json` and
`config/agent-policies.json` into the shape OpenCode agent definitions would take, optionally scoped
to one project class. It is a **dry run**: it prints, it refuses to write `opencode.json`, every
projected role carries `runtimeReady: false` with its blockers, and no role is promoted.

The projection is how the "two sources of truth" failure is avoided: registry roles become subagents
mechanically — no primary is invented — and tools are derived deny-by-default from Factory policy.

Before any role becomes runtime-ready, coarse mutation filtering must be replaced by **operation-level capability mapping**. A role having some mutation scope must never imply that it receives every mutating MCP/Factory operation.

### OpenCode 2 evaluation

Checked 2026-08-26: no stable 2.x release of `opencode-ai` is published. Keep 1.18.14 as the validated runtime until a stable alternative can be benchmarked against the same lane/security/resume requirements.

Revisit only when a stable candidate materially improves:
- registry-generated subagents without a second taxonomy;
- runtime-enforced permissions/capabilities;
- fresh-session-per-role lifecycle;
- durable resume/compaction;
- operational reliability.

Do not adopt beta-only runtime behaviour into stable Factory contracts.

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
- report provider/capacity exhaustion as structured state rather than losing the task.

It should not own project truth, permissions, budget rules, environment authority or deploy approval. Those remain control-plane/service responsibilities.

## Provider Capacity / Entitlement Broker

The model router needs an explicit capacity/entitlement layer so included subscriptions, free providers, included credits and paid APIs can be used efficiently without making the runtime fragile.

Represent per provider/runtime, where observable:

- provider/runtime id;
- authentication/entitlement type: subscription, free, included credit, API, local;
- current availability;
- known quota/reset signal;
- cash cost;
- quota scarcity/shadow cost;
- task-class benchmark quality;
- context/tool capabilities;
- independence family;
- fallback eligibility;
- whether paid overage is authorised.

The router should optimise for effective cost, not nominal API price alone:

`effective cost = cash cost + quota scarcity + latency/failure risk + context cost`.

A subscription call may have zero incremental cash cost while still being expensive when the remaining weekly/session allowance is scarce.

Target routing pattern:

`deterministic -> proven free/cheap model -> premium model when task quality requires it -> genuinely independent reviewer when valuable -> paid overage only when explicitly authorised`.

Model choice is by task class and measured quality, not by permanently assigning Claude/OpenAI/free providers to fixed roles.

### Required durable capacity states

Use stable equivalents of:

- `waiting-for-capacity`;
- `provider-exhausted`;
- `fallback-selected`;
- `paused-by-budget`;
- `waiting-for-human-approval`;
- `retryable` / `interrupted`.

If Claude/OpenAI/free-provider capacity disappears mid-task:

1. persist attempt summary/checkpoint/diff/test state;
2. mark the attempt outcome honestly;
3. select another provider only if its measured capability clears the task threshold and policy permits it;
4. otherwise leave the durable task waiting for capacity;
5. resume later in a fresh session from Factory state.

The Builder Console remains usable while the task waits; closing the browser never kills the job.

## Autonomous loop

A long-running task should operate roughly as:

```text
load durable task
-> evaluate stop/approval/environment/capacity conditions
-> resolve pipeline stage and specialist role from the role registry
-> build minimal role context packet (declared artifact kinds only)
-> choose eligible provider/model + skill packet
-> create durable attempt
-> start fresh runtime session in isolated execution environment
-> declare ChangeSet
-> validate normalized file scope and operation capabilities
-> implement bounded change
-> deterministic verification
-> independent reviewer issues a verdict when required (never the author)
-> evaluate handoff; promote only on artifacts + evidence + checks + verdict
-> record events/cost/diff/result
-> checkpoint
-> evaluate convergence and route any failing gate to its owning role
-> if complete: close task
-> if useful progress: schedule next attempt
-> if provider exhausted: fallback if eligible, otherwise wait for capacity
-> if wrong specialist/model: hand off
-> if context is bloated: end session and restart clean
-> if repeated/no progress or budget exhausted: stop/escalate
```

No loop may continue merely because the model says it should. Deterministic loop guards remain authoritative.

## Specialist workers

Specialist roles are registered in `config/agent-roles.json` and routed by project class in `config/agent-pipelines.json`, with the deterministic primitives in `packages/control-plane/src/roles.js`. The runtime's job is to **execute** that registry, not invent its own agent taxonomy.

Roles are permission profiles plus a small skill packet plus a bounded artifact surface — not personalities with unlimited access. Each role declares its capability policy, context route and ceiling, mutation scope, budget, stop criteria, escalation target and the independent reviewer that must promote its work.

The runtime must therefore:

- resolve the pipeline for the project class rather than running one universal sequence;
- start a **fresh session per role**, so a specialist does not inherit unrelated context;
- build the role's context packet with `buildRoleContextPacket` and pass nothing else;
- refuse a ChangeSet scope the role does not own;
- expose only operation-level Factory capabilities the role/task actually owns;
- route produced artifacts to the registered independent reviewer, never back to the author;
- persist a `StageHandoff` and only then advance;
- act on the `ConvergenceReport` in severity/ownership order;
- stop on convergence, a hard budget, provider-capacity block or genuine external block — never because a model reported success.

Do not run all registered roles for every project. Routing by project class/risk is a primary cost-control mechanism.

See `docs/AGENT_SPECIALIST_ARCHITECTURE.md` and `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`.

## Genuine cross-model independence

The runtime is the first place where "independent review" can be made real rather than rhetorical.

A different persona on the same model is not an independent reviewer. For security, architecture,
release-critical, cross-layer, irreversible and high-cost decisions the `independent-second-opinion`
role should execute through a **different eligible model/runtime family** from the one that produced
the work, with fresh context, read-only access, a bounded diff and only the relevant authority.

Requirements:

- the verdict records model/runtime family so independence is auditable;
- if no genuinely different eligible runtime is available, record the skip and rely on deterministic/native review;
- never relabel a same-model pass as independent;
- preserve disagreement rather than manufacturing consensus;
- trivial/reversible changes do not buy this pass.

## Graph-assisted context discovery

Deferred deliberately. Once the repository has grown through specialist agents, the presentation registry, design intelligence, multiple templates, recipes, runtime adapters, Builder Console and deployment machinery, an optional bounded graph query may sit between the deterministic route and the file shortlist:

```text
task -> deterministic route -> optional bounded graph query -> shortlisted files
     -> exact symbol search -> small context packet -> specialist agent
```

Rules:

- graph/index is **navigation evidence, never repository truth**;
- query stays inside the first-orientation token budget;
- generated graph output is local/disposable, never committed authority;
- it never becomes a required dependency/CI gate;
- stale/unavailable graph falls back to bounded source search.

Do not adopt it while bounded search still answers the question.

## Compound learning at closeout

After substantial completed work the runtime may run the `compound-learning` role once. It asks whether the work revealed a non-obvious, likely-to-recur lesson supported by evidence and not already encoded, and whether recording it would reduce future work/context.

If any answer is no, record nothing. If yes, name the **narrowest existing durable home** — regression test/deterministic check first, then governing authority, then skill/evaluation, then operations/control-plane authority — and route the change normally.

Never create a lessons file, memory store or parallel knowledge base. The target is better future behaviour with **less** context.

## Context-loss and interruption recovery

At the end of each attempt, and before any deliberate provider/session handoff where possible, persist a compact structured attempt summary containing:

- objective attempted;
- decisions made and why;
- files actually changed;
- current git/worktree/diff state;
- test/verification outcomes;
- remaining failures;
- assumptions unverified;
- next recommended action;
- same/different specialist recommendation;
- current stage/reviewer/rework queue;
- current cost/token/iteration totals;
- provider/capacity outcome;
- checkpoint/repo/environment reference.

The next session consumes this summary plus current machine state, not the full transcript.

For abrupt crashes, the supervisor should reconstruct as much as possible from durable Factory events, workspace/repo state, latest checkpoint and completed tool results, mark the prior attempt interrupted/retryable, then start a fresh attempt rather than trying to resurrect an opaque model conversation.

## Isolation, capabilities and secrets

Each task/project should use an isolated workspace behind the `ExecutionEnvironmentAdapter`.

Requirements:

- bounded CPU/memory/PIDs/runtime;
- project-specific filesystem/worktree;
- normalized/segment-correct ChangeSet file-scope enforcement;
- no host network namespace for untrusted workers;
- public network access only when task policy allows it;
- no reachability to Factory internal HTTP merely because it is on host loopback;
- scoped/attempt-bound Factory operation capabilities rather than one broad credential;
- secrets injected only by scope/environment/need;
- no inheritance of unrelated project secrets;
- no ordinary agent access to production credentials;
- preview deployments separated from production approval;
- database migration permission bound to intended environment;
- workspace/checkpoint can be destroyed without losing durable task state.

Issue #55 is the acceptance gate for the runtime-to-Factory capability boundary. OpenCode `permission` settings alone do not satisfy it.

## Deterministic gates before model judgement

Before expensive AI review/fix loops, consume factory-owned results for applicable checks such as:

- schema/Ajv boundary validation;
- typecheck/lint/unit/E2E;
- generated-app build;
- executed Supabase RLS/security tests;
- accessibility/axe gates;
- ChangeSet/path-policy validation;
- capability/approval/environment enforcement;
- performance/security/static checks;
- DesignSystemSpec linting;
- browser smoke tests.

A model may interpret failures or propose fixes, but it does not decide whether a deterministic gate ran or whether a failed security boundary should be waived.

## Builder Console integration

The Console should eventually show the runtime as a controllable durable system rather than a black-box chat:

- active/queued/waiting/completed tasks;
- current specialist/model/skill set;
- provider/capacity state;
- progress/event timeline;
- current ChangeSet and diff scope;
- target environment;
- tests/browser/database/security/accessibility results;
- cost/time/token/iteration budget consumed;
- latest checkpoint;
- pause/cancel/resume/retry controls;
- handoff/escalation reason;
- approval requests for sensitive actions;
- restore from checkpoint;
- preview URL/artifacts.

A page refresh, browser close, provider exhaustion or model crash must not lose the task.

## Success criteria before production use

Do not enable broad autonomous loops merely because OpenCode can run continuously. The hosted runtime is ready only when:

1. durable control-plane/service contracts are implemented and tested;
2. task state survives session deletion/restart/browser closure;
3. ChangeSet scope matching has normalized segment-correct semantics and property/adversarial coverage;
4. untrusted source content cannot grant instruction authority or tools;
5. permissions/capabilities are deny-by-default and operation-level;
6. `approvalRequired` is enforced before dispatch rather than being metadata only;
7. cost/time/iteration/no-progress loop guards work;
8. workspaces, host reachability and secrets are isolated;
9. development/preview/production environment identity is explicit and policy-enforced;
10. canonical benchmark builds detect regressions;
11. deterministic checks run before expensive AI review;
12. database security recipes have executed acceptance where applicable;
13. production deploy/database actions require explicit approval and later data-change safety evidence;
14. generated apps remain independent of MCP/OpenCode/runtime infrastructure;
15. specialist roles execute from the registry in disposable per-role sessions rather than one long general-purpose session;
16. reviewer independence, handoff promotion and convergence stopping are enforced by the control plane rather than prompt wording;
17. durable worker execution survives an HTTP/client disconnect;
18. provider exhaustion produces waiting/fallback state rather than lost work;
19. fallback routing respects task-class quality thresholds and explicit cash budgets;
20. the ledger/projection durability story can reconcile/rebuild after interruption.

## Portability rule

Generated apps must never need OpenCode, the Hetzner control service, MCP, the Builder Console or App Builder packages to run in production. The runtime is development infrastructure only.

See `docs/PRODUCT_PROOF_PROGRAMME.md` for the post-visual product-proof freeze, `docs/BEST_IN_CLASS_CAPABILITIES.md` for the reviewed capability backlog and `docs/FACTORY_CONTROL_PLANE.md` for the deterministic safety/control contracts this runtime must obey.
