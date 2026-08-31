# Factory Control Plane

Status: **Phase 3.5 architecture plus Phase 3.8 correctness plan**.

The control plane sits between the deterministic App Factory Engine and later powerful AI/runtime integrations. Its job is to make autonomous work measurable, resumable, reversible, permissioned and provider-neutral before long-running agents are introduced.

Core invariant:

> **Sessions are disposable; project and task state is durable.**

A conversation transcript is never the source of truth for a build.

## Why this layer exists

The factory is already strong at deterministic intake, generation, content normalization, composition and now a service-backed durable ledger. Before autonomous coding expands, the repository needs control primitives whose semantics are actually proven rather than merely plausible.

A powerful agent is not a security boundary. File scope, environment identity, capability policy, secrets, database access and production approval remain deterministic control-plane concerns.

## Improvement plan and placement

| Improvement | Priority | Delivery stage | Acceptance direction |
| --- | ---: | --- | --- |
| ChangeSet path/scope correctness | 10/10 | Phase 3.8 before Phase 4 scale | Normalized, segment-correct glob semantics; sibling-prefix and traversal escapes fail closed; property-tested. |
| Factory evaluation harness / golden builds | 10/10 | Phase 3.5, expanded 5.5 and 8 | Every material factory/model/skill change can be compared against canonical project cases for correctness, quality, cost and intervention count. |
| Isolated execution sandbox abstraction | 10/10 | Phase 3.5 contract, Phase 4.5/5 runtime | Agents never require unrestricted host access; project work runs in disposable bounded workspaces behind an adapter. |
| Untrusted-content / prompt-injection boundary | 10/10 | Phase 3.5 before any AI context routing | External/user source material is data with `instructionAuthority: none`; only explicit factory/user authorities may issue instructions. |
| Canonical schema/types/runtime contracts | 10/10 | Phase 3.8 | Stable schemas generate shared types and drive runtime validation; structural validity is separate from buildability. |
| Executed database/RLS recipe tests | 10/10 | Phase 3.8 and generated-recipe release gates | Security behavior is tested against real local Postgres/Supabase auth contexts, not only SQL text shape. |
| Durable Build/Event Ledger | 9.9/10 | Phase 3.5/3.7 | Progress, cost, restore, handoff and later learning are projections of one structured event stream. |
| ChangeSet transaction contract | 9.8/10 | Phase 3.5, hardened 3.8 | Autonomous edits declare objective, allowed/forbidden scope and checks before mutation; scope escape stops the attempt. |
| Recipe upgrade/migration mechanics | 9.7/10 | Design in Phase 3.5, implementation before Phase 7 scale | Installed versions, user modifications and upgrade compatibility are machine-readable before many generated apps exist. |
| Agent capability permissions / approvals | 9.6/10 | Phase 3.5 | Read, write, process, browser, network, secrets, migrations and deploy actions are explicit; destructive/production actions require approval. |
| Operation-level Factory capability boundary | 10/10 | Phase 4.5 before Phase 5 | An autonomous task gains an operation from its policy and grant, never from the existence of an internal Factory HTTP route; `approvalRequired` is enforced before dispatch and every decision is durable. |
| MCP service adapter | 9.5/10 | Phase 3.8 interoperability | External coding clients call the same safe factory service/tool contract rather than reimplementing deterministic logic in prompts. |
| Evaluation-driven model routing | 9.5/10 | Phase 5 + 5.5 | Route by measured task-class quality/cost rather than a simple cheap/expensive heuristic. |
| Repo-local specialist Skills | 9.4/10 | Phase 4 groundwork, Phase 5 runtime | Small versioned skills have exact triggers, allowed tools, context requirements and acceptance checks; no load-all-skills behaviour. |
| Agentic browser layer on Playwright | 9.3/10 | Phase 4/5/6 | Deterministic Playwright remains the acceptance base; agents get bounded browser inspection and visual review workflows on top. |
| OTel-style agent/tool/model tracing | 9.2/10 | Event schema in 3.5, exporters in Phase 5 | Model/tool/test spans capture cost, tokens, latency, retries, cache hits and outcomes. |
| First-class non-functional requirements | 9.2/10 | Contracts/Phase 4 | Accessibility, performance, security, privacy, compatibility, localisation, operations and compliance become typed requirements. |
| Prompt/model/agent regression and red-team suite | 9.1/10 | Phase 5.5 | Prompt/model changes are evaluated; prompt injection and dangerous-tool behaviours are tested before promotion. |
| Rich Design Contract / DesignSystemSpec | 9.0/10 | Phase 4 | Typography, hierarchy, motion, density, responsive composition, imagery, component/token rules and reference intent are explicit. |
| Six-project + capability-intersection acceptance matrix | 8.8/10 | Phase 3.5 benchmark expansion, enforced before Phase 5 | All first-class project types plus risky recipe combinations generate/check/build; AI changes cannot hide regressions in untested classes. |
| Machine-readable roadmap/status source | 8.0/10 | Phase 3.5 | README/roadmap status is checked against one config authority to reduce documentation drift. |
| Specialist roles separated by decision boundary | 10/10 | Phase 3.8H registry, Phase 5 execution | Every role declares bounded reads/writes/skills/tools/mutation scope/budget and a named independent reviewer. |
| Reviewer independence (no self-approval) | 10/10 | Phase 3.8H | A creator cannot issue the verdict on its own artifact; reviewers own no mutation scope; the doctor rejects self-approving pipeline stages. |
| Handoff promotion contract | 9.8/10 | Phase 3.8H | A stage advances on artifacts, prerequisites, evidence, passed deterministic checks and an independent verdict — never because an agent said it was finished. |
| Typed rework routing | 9.7/10 | Phase 3.8H | Disagreement between specialists becomes a named failing criterion, a severity and an owning creator role rather than an argument. |
| Convergence engine | 10/10 | Phase 3.8H contracts, Phase 6 gate evidence | Every required gate is assessed; unrun gates never pass; failures route to their owner; a hard budget outranks a rework loop. |
| Skill promotion lifecycle | 8.8/10 | Phase 3.8H registry, Phase 5.5 harness | A skill is trusted only after recorded benchmark, quality, regression, token, runtime and cost evidence. |
| External source governance | 9.0/10 | Phase 3.8H | Third-party repositories stay prior art with `instructionAuthority: none` until pinned, licensed, security reviewed and granted to a named role. |

## Phase 3.5 delivery slices

3.5A (durable task, ledger, ChangeSet, checkpoint, trust and capability-policy contracts, loop budgets
and the fresh-session resume packet) and 3.5B (golden-build harness over all six canonical apps,
baseline scoring, recipe inventories, upgrade proposals, managed-file modification detection, NFR and
Design Contract groundwork) are delivered. `docs/ROADMAP.md` carries the one-line records; the
contracts themselves are in `schemas/` and `packages/control-plane/`.

### 3.5C — Sandbox and telemetry adapters ◐ Mostly landed early under Phase 4.5

Landed: the provider-neutral `ExecutionEnvironmentAdapter`, the local disposable/rootless implementation,
the resource/time/network/secrets policy contract, and the preview/artifact/checkpoint interface.

Still outstanding: event-to-trace mapping compatible with OpenTelemetry-style spans, and the explicit
boundary that keeps production deploy and production DB access out of an ordinary implementation task.

The first powerful hosted runtime remains deferred until Phase 5 so the factory proves product and safety boundaries before vendor/runtime coupling. Infrastructure landing promotes nothing: `config/runtime-readiness.json` is the deny-by-default gate, and no role is `runtimeReady`.

## Phase 4.5 — the agent capability boundary

`config/agent-capabilities.json` is the operation-level agent surface, and
`packages/control-plane/src/capabilities.js` is the code that enforces it. The
two exist because an internal Factory HTTP route existing was, until now, the
only thing standing between a task and an operation (issue #55).

The enforced path is:

```text
task policy (config/agent-policies.json)
  -> role capability projection (capabilitiesForRole)
  -> signed attempt-scoped grant
  -> trusted broker: authoriseAgentOperation
  -> approval / project / environment / budget check
  -> Factory operation
  -> durable allow-or-deny decision in the event ledger
```

Three properties make it a boundary rather than a convention.

**One registry, two surfaces.** The service tool contract in
`apps/service/src/tool-contract.js` stays the internal transport contract; the
capability registry is the narrower agent projection of it. The registry may be
stricter and never laxer, and every Factory operation must be either an agent
capability or an explicitly declared internal-only one. The rich Console
surface — element identity, asset decisions, design choices, section variants,
rendered evidence, product review, intake bundles and source governance — is
recorded as internal-only, each entry naming the fragment of
`apps/service/src/http.js` that serves it so the declaration is checked against
a real consumer rather than believed.

**Capabilities are operation-level.** A role receives an operation only when its
policy allows every action that operation needs *outright* — an approval-gated
action is not an allowed one — and it owns every mutation scope the operation
writes. A role scoped to `src/**` may write content overrides and may not run
generation, which also rewrites `public/**`. A role that owns no mutation scope
receives no mutating operation at all. `capabilitiesForRole` is the single
implementation, used both by the dry-run OpenCode projection and by grant
minting, so the projection cannot drift from the enforcement.

**Grants are minted by trusted code only.** A grant is a canonical-JSON payload
signed with HMAC-SHA256 by the control plane, carrying attempt, task, project,
role, policy, capability set, mutation scopes, approvals, environment, operation
budget, nonce and a bounded expiry. The worker holds a grant and never the key,
so it can present authority and cannot produce, widen, retarget or extend it.
Every refusal is one of the named `DENY_REASONS`; there is no default-allow
branch. `approvalRequired` is evaluated here before dispatch, not described in
descriptor metadata.

Decisions — allows as well as denies — are appended to the project's durable
event ledger as `agent.operation.allowed` / `agent.operation.denied`, so what an
attempt asked for and what it was refused survives the session.

## Correctness boundaries the control plane owns

Delivered as 3.8A–3.8C. Stated as invariants because they still govern every future change to these
surfaces, not as a plan.

**The ChangeSet file-scope matcher is segment-correct, never prefix-correct.** `src/**` matches inside
`src/` and not `src2/...`; `recipes/foo/**` does not match `recipes/foo-evil/...`; traversal, absolute
paths and ambiguous normalized forms are rejected before matching; allow/forbid conflicts fail closed;
and Windows and POSIX separator handling is deterministic. Held by adversarial cases plus `fast-check`
property tests, and by mutation coverage over `packages/control-plane/src/index.js`.

**Stable data contracts follow `JSON Schema -> generated TypeScript in packages/contracts -> Ajv
boundary validation`.** Transport frameworks, handwritten `.d.ts` files and utility validators must not
each become separate authorities. Buildability stays an explicit later check against the
module/adapter/template registries — a request can be structurally valid while its selected capability
is not ready.

**Executed database security is the acceptance gate.** Generated Supabase recipes are exercised in a
local database with authenticated test users; regex and static SQL checks remain smoke tests and cannot
be the final security gate. The matrix becomes durable benchmark evidence alongside build and browser
results.

## Phase 3.8H specialist-role addendum

The control plane now owns four additional deterministic primitives, implemented in
`packages/control-plane/src/roles.js`:

- `assertReviewIndependence` / `createReviewVerdict` — a creator cannot promote its own artifact, a
  rework verdict must name failing criteria, a severity and an owning role, and a blocked verdict
  must state what is missing;
- `evaluateHandoff` — stage promotion requires the declared artifacts, satisfied prerequisites,
  required evidence, passed deterministic checks (a `not-run` check blocks exactly like a failing
  one) and an independent verdict or explicit human approval;
- `evaluateConvergence` / `planRework` — every required gate is assessed, a below-threshold score is
  converted to a failure, an unrun gate never counts as a pass, failures route to the creator role
  that owns them, rework is ordered by severity, and a hard budget stop outranks a rework loop;
- `buildRoleContextPacket` / `assertMutationAllowed` — a role receives only the artifact kinds its
  role spec declares and may only declare the ChangeSet scope rules it owns.

The registries live in `config/agent-roles.json`, `config/agent-pipelines.json`,
`config/skill-registry.json` and `config/external-sources.json`, and the contracts in
`schemas/agent-role.schema.json`, `schemas/review-verdict.schema.json`,
`schemas/stage-handoff.schema.json`, `schemas/skill-registration.schema.json`,
`schemas/convergence-report.schema.json` and `schemas/external-source.schema.json`.

This is not a new orchestration layer. Roles execute inside the existing durable task, budget,
policy, ChangeSet, checkpoint and event model; they do not get their own scheduler, budgets or
permission system. See `docs/AGENT_SPECIALIST_ARCHITECTURE.md` and
`docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`.

### Resolving the next stage from durable state

`packages/control-plane/src/pipeline-state.js` adds the one primitive the rest of that set assumed
somebody else owned. `nextStage` answers a positional question — what follows this stage in the
registry — and that is not the question an orchestrator asks after a restart. `projectPipelineProgress`
answers the durable one: given the artifact kinds that exist and the stages a promoted handoff was
recorded for, which stage may run now, and if none may, exactly why not.

It refuses in two directions. A stage whose declared inputs do not exist is `blocked` and the pipeline
does **not** step over it to find one that can run — the ordering in `config/agent-pipelines.json` is
the organisation's sequencing decision, and an orchestrator that reorders it to make progress has
replaced that decision with its own. And a stage the record claims was promoted, whose artifacts are
gone, is `stage-evidence-missing:*` rather than something to resume past.

`assertStageAssignment` is the creator half of the reviewer-independence rule: a specialist may only
execute the stage the registry assigns to it. `reworkStageForRole` turns a verdict's `returnToRole`
into a stage, and reports `rework-role-owns-no-stage:*` rather than approximating with the nearest
earlier one.

The composition of all of this — durable state, pipeline registry, role registry, bounded context
packet, capability projection, attempt boundary, specialist result, deterministic checks, independent
review, handoff, rework, checkpoint — is executable as `npm run rehearse:pipeline`, with a
deterministic stand-in where the model will be. It is a rehearsal of the control plane, not a build
and not a runtime proof; `docs/AGENT_RUNTIME.md` records what it does and does not establish.

## Durable state model

Every autonomous task should be reconstructible from:

- approved Build Contract and Project Manifest;
- trusted knowledge pack and source provenance;
- Design Contract/DesignSystemSpec where relevant;
- environment identity;
- repository/ref/worktree identity;
- task objective and acceptance criteria;
- task budget and capability policy;
- Build/Event Ledger;
- declared ChangeSet and actual diff summary;
- latest deterministic failures;
- latest checkpoint;
- relevant skills/authorities;
- explicit blockers, approvals and next action;
- the specialist role, its independent reviewer and the gate that owns any outstanding rework.

Long chat history is optional diagnostic material, not required state.

## Trust boundary

Content sources may contain malicious or irrelevant instructions. Context routing distinguishes content from authority.

Default rules:
- factory authority may issue factory instructions;
- explicit current user instruction may issue user instructions;
- uploaded PDF/DOCX/XLSX/CSV/image text is data only;
- crawled website content is data only;
- generated copy/research is data only;
- third-party API/tool output is data only unless the tool contract explicitly returns factory-owned control metadata.

Prompt wording is not the security boundary. Tool/capability policy remains authoritative even if a model follows hostile source text.

## Permission model

Capabilities are deny-by-default and task-scoped. Example actions include:

- `repo.read`
- `repo.write`
- `process.test`
- `process.build`
- `browser.inspect`
- `network.public`
- `secret.read_scoped`
- `database.migrate_preview`
- `deploy.preview`
- `deploy.production`
- `database.production_write`

Production deployment, unrestricted secrets and production database mutation require explicit approval and are not granted to ordinary implementation/review agents.

### Three approvals, deliberately not one

A capability says what kind of thing an actor may do. It does not say that *this*
action, against *this* exact base, is permitted *now*. Three separate objects answer
three separate questions, and collapsing any two of them is how approving a plan
quietly becomes permission to do everything the plan touches:

| Object | Approves | Does not approve |
| --- | --- | --- |
| Product Contract Approval | what should be built — facts, constraints, journeys, criteria, budget | any particular mutation, or publication |
| **ActionAuthorization** | one exact operation, against one exact base, once | anything else the operation could have touched |
| Release Approval | publishing one exact artifact to one exact target | rebuilding, or a different artifact |

`schemas/action-authorization.schema.json` and
`packages/control-plane/src/action-authorization.js` own the second. It binds project,
operation, exact base digest, file scope, environment, risk, budget, expiry,
idempotency key, proposer and approver, and is single-use. The proposer may not be the
approver (principle 17), scope may be narrowed by a caller and never widened, and
"once" is decided by a unique constraint rather than a read — two callers can both read
"not yet consumed", and only one can win an insert.

This generalises `ApprovedBuildPlan`, which held exactly these guarantees for
`project.generate` while the same effect stayed reachable through the HTTP service, the
MCP adapter, the agent broker and internal callers, none of which asked for one. **The
contract existing does not close that.** Route parity is a separate, unfinished piece
of work: until every equivalent mutating route is proved — adversarially — to reach the
same decision, the guarantee is one route's guarantee. `tooling/action-authorization.test.mjs`
holds the contract; the parity tests do not exist yet.

## Environment boundary

Before the Console/runtime exposes powerful database/deploy operations, `development`, `preview` and `production` must be explicit identities.

Policy checks should be able to reason over:
- target environment;
- backend/deployment project id;
- database/migration state;
- secret scope;
- allowed action class;
- checkpoint/release identity.

An agent approved for `database.migrate_preview` must not gain production database authority because both environments use the same provider.

## MCP bridge before full agent runtime

The Phase 3.7 service tool descriptor allows interoperability earlier than Phase 5.

The MCP adapter should:
- call service-owned deterministic operations;
- preserve service/control-plane authz and task/event boundaries;
- expose safe project/build/preview/read operations first;
- never return raw secret values;
- avoid production deploy/database writes in the initial surface;
- remain replaceable and provider-neutral.

MCP does **not** own budgets, durable tasks, project truth or runtime scheduling. Those remain control-plane/service responsibilities.

## Benchmark philosophy

The benchmark must answer more than “did it compile?”. Canonical projects should ultimately score:

- generation/install/check/build correctness;
- required user journeys;
- module/security correctness including executed RLS where relevant;
- ChangeSet/path-policy correctness;
- accessibility and responsive behaviour;
- performance budgets;
- visual Design Contract/DesignSystemSpec adherence;
- dependency/lock-in hygiene;
- number of AI calls/retries;
- token and monetary cost;
- elapsed runtime;
- user intervention count;
- regressions versus the last accepted factory baseline.

## Recipe and presentation upgrade rule

Portable output remains non-negotiable, but portability must not make upgrades impossible. Generated projects should record installed recipe/presentation versions and managed-file provenance. Future upgrades propose a reviewed ChangeSet, detect user changes, reconcile compatible files safely and fail closed on ambiguous conflicts.

## Phase 4 implications

The Builder Console renders control-plane/service state rather than inventing parallel state. Build progress, cost, checkpoints, restore, approvals, failures and environment state are views/actions over durable contracts.

Phase 4 also introduces DesignSystemSpec and presentation-registry rules so visual editing and AI design work remain constrained by one coherent system.

## Phase 5 implications

AI orchestration consumes these contracts. It does not bypass them. Model/provider/runtime choices remain adapters. A strong model cannot grant itself broader permissions, increase its own budget, change environment authority or silently broaden a ChangeSet.

See `docs/AGENT_RUNTIME.md` for the dedicated Hetzner/OpenCode runtime and `docs/BEST_IN_CLASS_CAPABILITIES.md` for the broader reviewed capability plan.