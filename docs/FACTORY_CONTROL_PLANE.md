# Factory Control Plane

Status: **Phase 3.5 architecture and delivery plan**.

The control plane sits between the deterministic App Factory Engine and later powerful AI/runtime integrations. Its job is to make autonomous work measurable, resumable, reversible, permissioned and provider-neutral before long-running agents are introduced.

## Why this phase exists

The factory is already strong at deterministic intake, generation and content normalization. Before adding a polished Builder Console and autonomous coding agents, the repository needs durable control primitives so an agent can fail, switch model, lose context, restart or hand off without losing project state or escaping its intended scope.

Core invariant:

> **Sessions are disposable; project and task state is durable.**

A conversation transcript is never the source of truth for a build.

## Improvement plan and placement

The following improvements were selected after reviewing the live repository and master plan. They are deliberately placed at the earliest stage where they reduce future risk or rework.

| Improvement | Priority | Delivery stage | Acceptance direction |
| --- | ---: | --- | --- |
| Factory evaluation harness / golden builds | 10/10 | Phase 3.5, expanded 5.5 and 8 | Every material factory/model/skill change can be compared against canonical project cases for correctness, quality, cost and intervention count. |
| Isolated execution sandbox abstraction | 10/10 | Phase 3.5 contract, Phase 5 runtime | Agents never require unrestricted host access; project work runs in disposable bounded workspaces behind an adapter. |
| Untrusted-content / prompt-injection boundary | 10/10 | Phase 3.5 before any AI context routing | External/user source material is data with `instructionAuthority: none`; only explicit factory/user authorities may issue instructions. |
| Durable Build/Event Ledger | 9.9/10 | Phase 3.5 | Progress, cost, restore, handoff and later learning are all projections of one structured event stream. |
| ChangeSet transaction contract | 9.8/10 | Phase 3.5 | Autonomous edits declare objective, allowed/forbidden scope and checks before mutation; scope escape stops the attempt. |
| Recipe upgrade/migration mechanics | 9.7/10 | Design in Phase 3.5, implementation before Phase 7 scale | Installed recipe versions, user modifications and upgrade compatibility are machine-readable before many generated apps exist. |
| Agent capability permissions / approvals | 9.6/10 | Phase 3.5 | Read, write, shell, browser, network, secrets, migrations and deploy actions are explicit capabilities; destructive/production actions require approval. |
| Evaluation-driven model routing | 9.5/10 | Phase 5 + 5.5 | Route by measured task-class quality/cost rather than a simple cheap/expensive heuristic. |
| Repo-local specialist Skills | 9.4/10 | Phase 4 groundwork, Phase 5 runtime | Small versioned skills have exact triggers, allowed tools, context requirements and acceptance checks; no load-all-skills behaviour. |
| Agentic browser layer on Playwright | 9.3/10 | Phase 4/5/6 | Deterministic Playwright remains the acceptance base; agents get bounded browser inspection and visual review workflows on top. |
| OTel-style agent/tool/model tracing | 9.2/10 | Event schema in 3.5, exporters in Phase 5 | Model/tool/test spans capture cost, tokens, latency, retries, cache hits and outcomes. |
| First-class non-functional requirements | 9.2/10 | Manifest/Build Contract v2 during Phase 3.5/4 | Accessibility, performance, security, privacy, compatibility, localisation, operations and compliance become typed requirements. |
| Prompt/model/agent regression and red-team suite | 9.1/10 | Phase 5.5 | Prompt/model changes are evaluated in CI/nightly suites; prompt injection and dangerous-tool behaviours are tested before promotion. |
| Rich Design Contract | 9.0/10 | Phase 4 | Typography, hierarchy, motion, density, responsive composition, imagery, interaction and reference-image intent are explicit rather than inferred from a shell preset. |
| Six-project + capability-intersection acceptance matrix | 8.8/10 | Phase 3.5 benchmark expansion, enforced before Phase 5 | All six first-class project types plus risky recipe combinations generate/check/build; AI changes cannot hide regressions in untested project classes. |
| Machine-readable roadmap/status source | 8.0/10 | Phase 3.5 | README/roadmap status is checked against one config authority to reduce documentation drift. |

## Phase 3.5 delivery slices

### 3.5A — Durable control primitives

- machine-readable factory status;
- durable task contract;
- Build/Event Ledger event contract;
- ChangeSet and result-scope validation;
- checkpoint contract;
- context-item trust/instruction-authority contract;
- agent capability policy registry;
- loop budgets and deterministic stop reasons;
- fresh-session resume packet builder;
- benchmark registry spanning all six project types;
- doctor/tests for the control-plane invariants.

### 3.5B — Evaluation and upgrade foundations

- runnable golden-build harness rather than registry-only cases;
- independently install/check/build all six canonical generated apps;
- capability-intersection benchmark cases;
- baseline score record including deterministic failures, user interventions and execution cost/time;
- recipe installed-version inventory;
- upgrade proposal contract;
- managed-file modification detection and three-way upgrade strategy;
- Project Manifest / Build Contract v2 non-functional requirement contracts;
- explicit design-contract schema groundwork for Phase 4.

### 3.5C — Sandbox and telemetry adapters

- provider-neutral `ExecutionEnvironmentAdapter`;
- local disposable implementation for development/tests;
- resource/time/network/secrets policy contract;
- preview port/artifact/checkpoint interface;
- event-to-trace mapping compatible with OpenTelemetry-style spans;
- no production deploy or production DB access from an ordinary implementation task.

The first hosted sandbox/runtime implementation is intentionally deferred until Phase 5 so this phase establishes contracts without prematurely binding the factory to one vendor.

## Durable state model

Every autonomous task should be reconstructible from:

- approved Build Contract and Project Manifest;
- trusted knowledge pack and source provenance;
- repository/ref/worktree identity;
- task objective and acceptance criteria;
- task budget and capability policy;
- Build/Event Ledger;
- declared ChangeSet and actual diff summary;
- latest deterministic failures;
- latest checkpoint;
- relevant skills/authorities;
- explicit blockers, approvals and next action.

Long chat history is optional diagnostic material, not required state.

## Trust boundary

Content sources may contain malicious or irrelevant instructions. Context routing must therefore distinguish content from authority.

Default rules:

- factory authority: may issue factory instructions;
- explicit current user instruction: may issue user instructions;
- uploaded PDF/DOCX/XLSX/CSV/image text: data only;
- crawled website content: data only;
- generated copy/research: data only;
- third-party API/tool output: data only unless the tool contract explicitly returns control metadata owned by the factory.

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

Production deployment, unrestricted secrets and production database mutation require an explicit approval gate and are not granted to ordinary implementation/review agents.

## Benchmark philosophy

The benchmark must answer more than “did it compile?”. Canonical projects should ultimately score:

- generation/install/check/build correctness;
- required user journeys;
- module/security correctness;
- accessibility and responsive behaviour;
- performance budgets;
- visual/design-contract adherence;
- dependency/lock-in hygiene;
- number of AI calls/retries;
- token and monetary cost;
- elapsed runtime;
- user intervention count;
- regressions versus the last accepted factory baseline.

Phase 3.5A establishes the registry and deterministic scoring contract. Later slices make every case fully runnable.

## Recipe upgrade rule

Portable output remains non-negotiable, but portability must not make upgrades impossible. Generated projects should record installed recipe versions and managed-file provenance. Future upgrades must propose a reviewed ChangeSet, detect user changes, migrate compatible files safely and fail closed on ambiguous conflicts.

## Phase 4 implications

The Builder Console should render control-plane state rather than invent parallel state systems. Build progress, cost, agent activity, checkpoints, restore, approvals and failures should all be views/actions over the ledger/task/checkpoint contracts.

Phase 4 should also introduce a richer Design Contract covering typography, colour semantics, hierarchy, spacing, motion, image direction, interaction feedback, responsive priorities and reference-image intent.

## Phase 5 implications

AI orchestration consumes these contracts. It does not bypass them. Model/provider/runtime choices remain adapters. A strong model cannot grant itself broader permissions, increase its own budget or silently broaden a ChangeSet.

See `docs/AGENT_RUNTIME.md` for the planned dedicated Hetzner/OpenCode runtime.
