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

## Phase 3.5 delivery slices

### 3.5A — Durable control primitives ✅

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
- doctor/tests for control-plane invariants.

### 3.5B — Evaluation and upgrade foundations ✅

- runnable golden-build harness;
- independently install/check/build all six canonical generated apps;
- capability-intersection benchmark foundations;
- baseline score record including deterministic failures, user interventions and execution cost/time;
- recipe installed-version inventory;
- upgrade proposal contract;
- managed-file modification detection;
- non-functional and Design Contract groundwork.

### 3.5C — Sandbox and telemetry adapters ⏸ Deferred

- provider-neutral `ExecutionEnvironmentAdapter`;
- local disposable/rootless implementation;
- resource/time/network/secrets policy contract;
- preview/artifact/checkpoint interface;
- event-to-trace mapping compatible with OpenTelemetry-style spans;
- no production deploy or production DB access from an ordinary implementation task.

The first powerful hosted runtime remains deferred until Phase 5 so the factory proves product and safety boundaries before vendor/runtime coupling.

## Phase 3.8 correctness addendum

The live audit identified boundaries that must be tightened before broad autonomous/Console surface area grows.

### ChangeSet path normalization and glob semantics

The file-scope matcher must be **segment-correct**, not merely prefix-correct.

Required behavior:
- `src/**` matches files inside `src/`;
- `src/**` does not match `src2/...`;
- `recipes/foo/**` does not match `recipes/foo-evil/...`;
- traversal (`../`), absolute paths and ambiguous normalized forms are rejected before matching;
- allow/forbid conflicts fail closed;
- Windows and POSIX separator handling is deterministic.

Prefer Node 22 native glob matching if it satisfies the contract. Use `fast-check` to generate adversarial path/rule cases after explicit examples are fixed.

### Canonical contract boundary

Stable data contracts should follow:

`JSON Schema -> generated TypeScript in packages/contracts -> Ajv boundary validation`

Do not let transport frameworks, handwritten `.d.ts` files and utility validators each become separate authorities.

Buildability remains an explicit later check against module/adapter/template registries.

### Executed database security

Generated Supabase recipes must be exercised in a local database with authenticated test users. Regex/static SQL checks remain useful smoke tests but cannot be the final security acceptance gate.

The database security matrix should become durable benchmark evidence alongside build/browser results.

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
- explicit blockers, approvals and next action.

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