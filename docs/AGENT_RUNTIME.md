# Dedicated App Builder Agent Runtime

Status: **future architecture**. This document defines the target boundary; it does not make OpenCode or a Hetzner server a current runtime dependency.

## Goal

App Builder should eventually have its own dedicated long-running agent environment for website/application work, separate from any existing project-specific agent server.

The first intended deployment is a private service on the owner's Hetzner server using OpenCode as the initial agent-runtime implementation. The architecture must remain provider-neutral so OpenCode can be upgraded, replaced or complemented without changing generated applications or core factory contracts.

The runtime should let specialist agents work in bounded loops for long periods, hand work to other specialists, lose/compact conversation context safely, resume after interruption, run tests and browser checks, create checkpoints and continue until a clear success/stop condition is reached.

## Core invariant: sessions are disposable; state is durable

An agent conversation is never the source of truth for a build.

A fresh agent session must be able to reconstruct the next useful action from persisted factory state:

- approved Build Contract and Project Manifest;
- project knowledge pack and trusted source provenance;
- current repository/ref/worktree;
- active task specification and acceptance criteria;
- Build/Event Ledger;
- declared ChangeSet and actual diff;
- latest deterministic test/CI/browser failures;
- checkpoints and prior attempt summaries;
- relevant architecture/recipe/skill authorities;
- remaining cost/time/iteration budget;
- explicit blockers or approval gates.

Context compaction, model switches, server restarts and deliberate session replacement must therefore be normal supported operations rather than exceptional recovery paths.

## Architecture boundary

Introduce a provider-neutral `AgentRuntimeAdapter` owned by the App Factory control plane.

The initial implementation may use OpenCode, but the factory must not encode OpenCode-specific session IDs, prompts or tool semantics into generated projects or stable product contracts.

```text
Builder Console
      |
Factory Control Plane
      |
      +-- Task / Event Ledger
      +-- Context Packet Builder
      +-- Policy + Approval Engine
      +-- Cost / Model Router
      +-- Checkpoint Store
      +-- Verification Gates
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

It should not own project truth, permissions, budget rules or deploy approval. Those remain control-plane responsibilities.

## Autonomous loop

A long-running task should operate roughly as:

```text
load durable task
-> evaluate stop/approval conditions
-> build minimal context packet
-> choose specialist + model + skills
-> start fresh/runtime session
-> declare ChangeSet
-> implement bounded change
-> deterministic verification
-> record events/cost/diff/result
-> checkpoint
-> if complete: close task
-> if useful progress: schedule next attempt
-> if wrong specialist/model: hand off
-> if context is bloated: end session and restart clean
-> if repeated/no progress or budget exhausted: stop/escalate
```

No loop may continue merely because the model says it should. Deterministic loop guards remain authoritative.

## Specialist workers

Initial specialist profiles should be small and role-specific, for example:

- planner/product bootstrapper;
- frontend implementation;
- backend/data implementation;
- browser/visual review;
- security review;
- performance/accessibility review;
- independent second-opinion review;
- release/preview verification.

Roles are permission profiles plus selected skills, not personalities with unlimited access.

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
- current cost/iteration totals;
- checkpoint/repo reference.

The next session should consume this summary plus current machine state, not replay the full previous transcript.

## Isolation and secrets

Each task/project should use an isolated workspace behind the future `ExecutionEnvironmentAdapter` defined in the control-plane plan.

Requirements:

- bounded CPU/memory/runtime;
- project-specific filesystem/worktree;
- public network access only when task policy allows it;
- secrets injected only by scope and only when required;
- no inheritance of unrelated project secrets;
- no ordinary agent access to production credentials;
- preview deployments separated from production approval;
- workspace/checkpoint can be destroyed without losing durable task state.

## Builder Console integration

The Console should eventually show the runtime as a controllable system rather than a black-box chat:

- active/queued/completed tasks;
- current specialist/model/skill set;
- progress/event timeline;
- current ChangeSet and diff scope;
- tests/browser/security results;
- cost/time/iteration budget consumed;
- latest checkpoint;
- pause/cancel/resume/retry controls;
- handoff/escalation reason;
- approval requests for sensitive actions;
- restore from checkpoint;
- preview URL/artifacts.

## Success criteria before production use

Do not enable broad autonomous loops merely because OpenCode can run continuously. The hosted runtime is ready only when:

1. Phase 3.5 control-plane contracts are implemented and tested;
2. task state survives session deletion/restart;
3. ChangeSet scope escape fails closed;
4. untrusted source content cannot grant instruction authority or tools;
5. permissions are deny-by-default;
6. cost/time/iteration/no-progress loop guards work;
7. workspaces and secrets are isolated;
8. canonical benchmark builds detect regressions;
9. deterministic checks run before expensive AI review;
10. production deploy/database actions require explicit approval.

## Portability rule

Generated apps must never need OpenCode, the Hetzner control service, the Builder Console or App Builder packages to run in production. The runtime is development infrastructure only.
