# Dedicated App Builder Agent Runtime

Status: **future architecture**. This document defines the target boundary; it does not make OpenCode or a Hetzner server a current runtime dependency.

## Goal

App Builder should eventually have its own dedicated long-running agent environment for website/application work, separate from any existing project-specific agent server.

The first intended deployment is a private service on the owner's Hetzner server using OpenCode as the initial agent-runtime implementation. The architecture must remain provider-neutral so OpenCode can be upgraded, replaced or complemented without changing generated applications or core factory contracts.

The runtime should let specialist agents work in bounded loops for long periods, hand work to other specialists, lose/compact conversation context safely, resume after interruption, run tests and browser checks, create checkpoints and continue until a clear success/stop condition is reached.

## Important sequencing: MCP before full runtime

The Phase 3.7 factory service/tool contract makes a smaller interoperability step useful before this hosted runtime exists.

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

## Dedicated Hetzner service

The intended hosted shape is separate from the Euro Predictor runtime:

```text
Hetzner
|
+-- existing project-specific runtime(s)
|
+-- app-builder-runtime
    +-- private API/control service
    +-- OpenCode runtime adapter
    +-- bounded worker pool
    +-- isolated project/task workspaces
    +-- preview proxy/ports
    +-- task/event/checkpoint persistence
    +-- scoped secret broker
    +-- environment/project identity map
    +-- logs/traces/usage accounting
```

The App Builder service may reuse proven operational patterns from other servers but must not inherit project-specific product logic, prompts, authorities or unrestricted permissions.

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