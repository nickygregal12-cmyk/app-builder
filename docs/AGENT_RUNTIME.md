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

Conceptually:

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

## Control-plane responsibilities

### Durable task model

Each autonomous task should have a stable machine-readable record containing at minimum:

- task id and parent project/build;
- objective;
- acceptance criteria;
- priority and dependencies;
- allowed files/capabilities;
- requested specialist/skill profile;
- maximum iterations;
- maximum wall-clock/runtime budget;
- maximum AI cost/token budget;
- current state;
- current attempt;
- latest checkpoint;
- stop/escalation reason.

Suggested states:

`queued -> planning -> running -> verifying -> needs-fix -> blocked -> awaiting-approval -> complete -> failed -> cancelled`

### Build/Event Ledger

Every material action should append a structured event, for example:

- task started/resumed;
- context packet created;
- model selected;
- agent/session created;
- tool invoked;
- ChangeSet proposed/applied;
- files changed;
- test/browser/security gate passed or failed;
- checkpoint created;
- handoff requested;
- cost/token budget consumed;
- approval requested/granted/denied;
- task completed/stopped.

This ledger should power Console progress, resume, auditability, cost reporting and later factory-learning metrics.

### ChangeSet transaction

Before material edits, an autonomous worker should declare a bounded ChangeSet:

- objective;
- expected files/areas;
- forbidden areas;
- assumptions;
- migrations/environment implications;
- tests required;
- security/data impact;
- rollback/checkpoint.

Unexpected scope expansion should trigger re-planning rather than silently widening the edit.

### Context packet builder

The factory, not the agent, should determine the minimum useful context for each attempt. It should prefer structured state and targeted source slices over replaying old transcripts.

A resumed/fresh session should normally receive:

1. task objective and acceptance criteria;
2. current project/build authority;
3. relevant files/contracts/skills only;
4. latest diff/checkpoint;
5. latest failures/findings;
6. concise prior-attempt summary;
7. remaining loop/cost budget;
8. one explicit next decision/action.

## Autonomous loop model

A task loop should be controlled by the factory rather than by an unbounded prompt such as "keep going until done".

Recommended loop:

```text
Load durable task state
 -> build bounded context packet
 -> select specialist + model + permissions
 -> create/resume disposable agent session
 -> plan / declare ChangeSet
 -> execute one bounded attempt
 -> run deterministic verification
 -> append results to ledger
 -> checkpoint useful state
 -> if green: complete
 -> if fixable and budget remains: summarize failure and start next attempt
 -> if specialist help required: hand off to bounded child/sibling task
 -> if approval/risk/budget boundary reached: stop and escalate
```

The system should support deliberately starting a fresh session after a context threshold or failed approach. A new session should not have to rediscover the repository from scratch.

## Specialist workers

Initial App Builder-specific profiles should eventually include:

- planner/product-bootstrap worker;
- general implementation worker;
- frontend/UI implementation worker;
- visual/browser QA worker;
- backend/data/Supabase worker;
- content/asset worker;
- security reviewer;
- accessibility/performance reviewer;
- independent second-opinion reviewer;
- release/deployment worker.

Agents should load only the repo-local skills relevant to the task. They must not all receive the same broad tool permissions.

## Permissions and approvals

Permissions belong to the factory task and worker profile, not merely to the selected model.

Examples:

- planning/review: read-only by default;
- UI review: read + preview/browser/screenshot, no secrets or production writes;
- implementation: scoped repository write + tests, constrained package/network access;
- database worker: migration tooling only for the selected environment;
- release worker: preview deploy allowed; production deploy requires an explicit gate by default.

Secret access should be brokered and scoped to the task. Raw long-lived secrets should not be copied into prompts, ledgers or exported session transcripts.

## Untrusted source handling

Content ingested from websites, PDFs, DOCX, XLSX, screenshots and other external material is evidence/data, not agent instruction authority.

The runtime/context builder must preserve trust metadata and prevent source text from silently overriding factory/user instructions. Tool permissions remain the hard boundary if untrusted content contains prompt-injection text.

## Hetzner deployment target

The first dedicated runtime can live on the existing Hetzner server but should be a separate App Builder service stack from any Euro Predictor automation.

Preferred shape:

```text
Hetzner host
  app-builder-control-plane
  app-builder-worker-1..N
  opencode service/runtime adapter
  isolated project workspaces/sandboxes
  durable state store
  checkpoint/artifact store
  internal preview routing
  telemetry/log collector
```

Operational rules:

- bind runtime APIs to localhost/private networking unless a protected external endpoint is genuinely required;
- authenticate control-plane/runtime traffic;
- keep project workers isolated from one another;
- use per-task/workspace credentials where practical;
- apply CPU/RAM/disk/runtime/network limits;
- never mount unrelated repositories or host secrets into every worker;
- keep generated repositories portable and independent of this infrastructure.

OpenCode's headless server/SDK and project-defined primary/subagents make it a strong initial adapter, but the adapter boundary is mandatory.

## OpenCode adapter expectations

The first adapter should eventually support:

- create/list/stop sessions;
- send a bounded task/context packet;
- select a project-defined agent profile/model;
- stream events/output back to the Builder Console;
- capture usage/cost metadata;
- export/summarize session state before compaction or replacement;
- launch permitted subagents/specialists;
- cancel runaway attempts;
- associate runtime session ids with durable factory task/attempt ids;
- recover cleanly when an OpenCode process/session disappears.

OpenCode session history is useful evidence, but the factory ledger/checkpoint is the resume authority.

## Bounded-loop safety

Every loop must have explicit stop conditions. At minimum:

- iteration count;
- AI cost/token budget;
- wall-clock/runtime budget;
- repeated-identical-failure detector;
- no-progress detector;
- unexpected-wide-diff detector;
- destructive/security-sensitive action gate;
- production deployment gate.

A loop that exhausts its budget should produce a compact handoff containing what was tried, what changed, current failures and the best next action rather than simply stopping with lost context.

## Relationship to the roadmap

The foundation for this runtime belongs in a **Factory Control Plane** stage before powerful autonomous AI loops are enabled:

- durable task/event ledger;
- checkpoints;
- ChangeSet contract;
- permission/approval engine;
- sandbox/workspace abstraction;
- benchmark/evaluation harness;
- telemetry.

The full Hetzner/OpenCode worker runtime belongs with Low-Credit AI Orchestration after those controls exist.

The Builder Console should later provide:

- start/pause/cancel task;
- visible current specialist/model;
- live progress/events;
- current/remaining cost budget;
- current diff and verification state;
- handoffs/subtasks;
- checkpoints/restore;
- explicit approval requests;
- resume with fresh context/session.

## Success criteria

This capability is successful when an App Builder task can run across multiple disposable agent sessions on the dedicated server, survive context compaction/restarts, hand work between specialists, remain within explicit permissions/budgets, and finish with a verified ordinary repository without depending on one long conversation transcript.