# Roadmap

Current stage: **Phase 3.5B — Evaluation and upgrade foundations**.

The detailed delivery specification lives in `docs/MASTER_PLAN.md`. The control-plane additions and reviewed improvement programme live in `docs/FACTORY_CONTROL_PLANE.md`; the dedicated future agent runtime is defined in `docs/AGENT_RUNTIME.md`.

Machine-readable progress authority: `config/factory-status.json`.

## Phase 0 — Foundation ✅ Complete

- repository boundaries and authorities
- project manifest/build-contract schemas
- project-type and module registries
- adaptive questionnaire contract
- deterministic `create-app` skeleton
- Builder Console shell
- CI, doctor and contamination guard

## Phase 1 — Intake and Build Contract ✅ Complete

- interactive Quick / Standard / Thorough questionnaire modes
- project-type branching and conditional questions
- company/business profile intake
- structured URL and file-metadata source references
- bounded ambiguity follow-up contract
- Build Contract review and targeted editing
- deterministic Project Manifest generation
- accepted-default/correction/missed-question evidence log
- local save/resume
- contract, manifest and full intake-bundle export
- Chromium end-to-end acceptance journey in CI

## Phase 2 — Deterministic Project Generator ✅ Complete

### Phase 2A — Generator core

- versioned template and recipe contracts/registries
- neutral standalone React 19 / TypeScript / Vite template
- deterministic `create-app --plan` and real project materialisation
- fail-closed handling when a requested capability has no ready recipe
- recipe dependency/conflict resolution
- safe managed recipe add/remove reconciliation
- generated provenance records without runtime lock-in
- first ready recipes: feature flags and SEO defaults

### Phase 2B — Backend foundation and core recipes

- Supabase infrastructure adapter with browser-safe environment contract
- auth recipe
- profiles recipe
- organisations/membership/RBAC recipe with explicit RLS contracts
- generic admin foundation
- security regression tests for RLS, privileged helpers and trusted admin metadata

### Phase 2C — Project finishing system

- Netlify deployment adapter, SPA fallback and baseline headers
- deterministic deployment fail-closed behavior
- six project-type layout patterns and neutral design-token system
- project-aware seed/scenario framework
- generated structured and human-readable handover documentation
- uploads, analytics, observability and Netlify lead-generation recipes
- ready-default invariant
- byte-stable generation checks
- six-project generation matrix
- independently installed/checked/built marketing and B2B generated apps in CI

Phase 2 exit gate is complete: a valid manifest can deterministically generate a runnable, tested repository containing only available selected capabilities and no domain-specific baggage.

## Phase 3 — Content and Asset Intelligence ✅ Complete

- deterministic text, Markdown, JSON, HTML and CSV extraction
- real PDF, DOCX and XLSX extraction
- bounded same-origin existing-site crawl with redirect/size/time/network safety gates
- content-addressed extraction cache keyed by bytes, MIME and extractor version
- provenance/confidence/verification-aware facts
- structured company profile with source-backed services, people, projects, testimonials, accreditations and service areas
- generated-copy separation: extracted facts never become invented marketing claims
- image/logo/screenshot inventory with dimensions, aspect ratio, alpha, dominant colour and low-resolution signals
- exact and normalized-visual duplicate signals
- responsive WebP/AVIF generation plus review-required hero/card/square crop candidates
- observed brand colours/fonts/titles/logo/screenshot candidates
- deterministic existing-site SEO snapshots and aggregate issue summary
- local-SEO inputs that use only source-backed locations/contact data
- lead-generation inputs from real contact methods, services and trust evidence
- bounded content-addressed AI-context chunks that deduplicate identical text across sources
- stable semantic knowledge-pack hash independent of warm/cold cache state
- `npm run ingest` CLI producing normalized sources, trusted knowledge pack, AI-context index, source-cache index and asset variants
- Phase 3 doctor enforcing exact extractor dependencies and preventing generated-app runtime coupling
- full mixed business-pack acceptance covering URL crawl, approved company data, PDF, spreadsheet, logo and project image

Phase 3 exit gate is complete: messy business/source material can be normalized once into trusted structured inputs without repeatedly parsing or later needing to resend entire source files to AI.

## Phase 3.5 — Factory Control Plane 🚧 Active

Purpose: make later AI/runtime autonomy measurable, resumable, reversible and permissioned before agents receive broad tools.

### Phase 3.5A — Durable control primitives ✅ Complete

- machine-readable factory status authority
- durable task contract with explicit time/token/cost/iteration/no-progress budgets
- structured Build/Event Ledger contract and JSONL persistence primitive
- ChangeSet declaration and fail-closed file-scope validation
- checkpoint + fresh-session resume packet contracts
- source/context trust boundary with `instructionAuthority`
- deny-by-default agent capability policies and approval-required actions
- provider-neutral control-plane package with no AI/runtime dependency
- six-project benchmark registry and deterministic scoring foundation
- Phase 3.5 doctor and regression tests
- dedicated future Hetzner/OpenCode runtime architecture documented behind provider-neutral adapters

### Phase 3.5B — Evaluation and upgrade foundations 🚧 Active

- runnable deterministic golden-build benchmark across all six first-class project types
- all six canonical projects generated, independently installed, checked and production-built in CI
- structured benchmark report with gate score, duration, AI cost and intervention count
- future release-quality benchmark profile reserved for browser/security/accessibility/performance/Design Contract gates
- capability-intersection cases registered for later activation
- recipe installation inventory contract with managed-file hashes
- fail-closed recipe-upgrade proposal contract
- managed-file divergence detection before upgrade
- same-major upgrades require explicit declared `compatibleFrom`; major versions and ambiguous changes require review
- recipe schema gains optional upgrade compatibility/migration metadata
- standalone non-functional-requirements contract covering accessibility, performance, security, privacy, compatibility, localisation, operations and compliance
- initial rich Design Contract covering personality, density, typography, hierarchy, colour, responsive composition, motion, imagery, interaction and reference adopt/avoid intent
- NFR/Design contracts remain separate from live manifest v1 until deterministic generator/intake adoption is explicitly implemented and migration-tested

Remaining within 3.5B:

- integrate managed-file hashes into generated recipe installation records
- add an explicit upgrade-proposal CLI/flow against a generated project
- add safe three-way upgrade/reconciliation mechanics for user-modified managed files
- activate high-value capability-intersection benchmark manifests when the currently planned recipes they require are ready
- define the reviewed migration path from Project Manifest / Build Contract v1 to v2 using the NFR and Design contracts

### Phase 3.5C — Sandbox and trace adapters ⬜ Planned

- provider-neutral `ExecutionEnvironmentAdapter`
- disposable local sandbox implementation for tests/development
- CPU/memory/runtime/network/secret policy contracts
- preview ports/artifacts/checkpoint interface
- OpenTelemetry-style event/trace mapping for model/tool/test/cost telemetry
- explicit production deploy/database approval boundary

Phase 3.5 exit gate: a task can be created, checkpointed, resumed in a fresh session, bounded by deterministic guards, prevented from escaping its declared ChangeSet/capabilities, measured against canonical factory benchmarks, and executed behind a sandbox abstraction without depending on a specific agent runtime.

## Phase 4 — Full Builder Console ⬜ Planned

- chat/prompt panel backed by durable control-plane tasks rather than ephemeral chat state
- drag-and-drop source intake backed by Phase 3 normalization and context trust labels
- live desktop/tablet/mobile preview
- click-to-select and click-to-edit text/assets/components
- asset manager
- build plan/progress rendered from the Build/Event Ledger
- versions/checkpoints/restore backed by control-plane checkpoints
- integrations/secrets status and approval UI
- test/health view
- model/tool/cost trace view
- preview/production deploy controls with approval gates
- adopt the rich Design Contract into Build Contract/intake and visual-review workflows
- repo-local specialist Skills registry/workflow groundwork
- Playwright-based agent browser inspection layered on deterministic E2E tests

## Phase 5 — Low-Credit AI Orchestration + Dedicated Agent Runtime ⬜ Planned

- product bootstrapper
- deterministic task/context router
- model router by measured task capability, quality threshold and cost
- compact project knowledge packets using Phase 3 chunk/cache identities and Phase 3.5 trust labels
- versioned repo-local specialist Skills with exact triggers/context/tool permissions/acceptance checks
- specialist implementation/design/backend/security/review roles
- machine-readable agent outputs and ChangeSets
- bounded autonomous fix/work loops controlled by Phase 3.5 guards
- provider-neutral `AgentRuntimeAdapter`
- dedicated App Builder service on Hetzner, separate from project-specific runtimes
- OpenCode as the initial runtime adapter, not a stable project dependency
- clean-session/context-loss recovery from checkpoints and attempt summaries
- isolated per-project/per-task workspaces and scoped secrets
- Playwright browser/visual agent workflows
- structured model/tool/test usage telemetry

## Phase 5.5 — AI Evaluation and Red-Team ⬜ Planned

- cross-model task-class benchmark scoreboard
- route to the cheapest model that clears the required quality threshold; escalate on failure
- prompt/skill/model regression tests in CI for bounded cases
- larger scheduled benchmark suites
- prompt-injection / hostile-source-content red-team cases
- dangerous-tool / permission-bypass tests
- context-router leakage tests
- second-opinion agreement/disagreement metrics
- evaluate an external evaluation tool such as Promptfoo only if it materially improves the existing harness; keep the benchmark contract provider-neutral

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

- unit/integration/E2E/accessibility/performance/security gates
- visual review and screenshot regression against the Design Contract
- independent second-opinion review for material changes
- responsive/data/error/loading/empty/large-data stress scenarios
- slow/offline/failing-API scenarios where relevant
- deterministic gates before expensive AI review
- bounded autonomous corrections through control-plane tasks/ChangeSets
- deployment smoke tests
- quality report tied to benchmark and trace data

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/SSL launch checklist
- redirect/canonical/sitemap/robots setup
- analytics/observability/feedback activation
- production smoke checks and launch readiness report
- post-launch audit workflow
- handover/architecture documentation
- recipe/module version inventory per generated app
- reviewed upgrade proposal/propagation mechanism using Phase 3.5 upgrade contracts
- safe migration/managed-file reconciliation
- reusable pattern promotion workflow
- automatic handover documentation

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- analyse corrections and rework across projects
- propose versioned questionnaire improvements
- identify capabilities worth promoting into reusable recipes
- measure tokens/cost/time saved per project
- benchmark one-prompt builds across project categories
- track user intervention count and rework causes
- compare model/skill/router versions against accepted benchmark baselines
- design/recipe/default promotion proposals from evidence
- no silent self-modification: improvements remain reviewed, versioned and regression-tested
