# Roadmap

Current stage: **Phase 3.6B — Deterministic composition**.

The detailed delivery specification lives in `docs/MASTER_PLAN.md`. The control-plane programme lives in `docs/FACTORY_CONTROL_PLANE.md`; the dedicated future agent runtime is defined in `docs/AGENT_RUNTIME.md`.

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

### Phase 2B — Backend foundation and core recipes

- Supabase infrastructure adapter with browser-safe environment contract
- auth, profiles and organisations/RBAC recipes
- generic admin foundation
- RLS/security regression tests

### Phase 2C — Project finishing system

- Netlify deployment adapter, SPA fallback and baseline headers
- six project-type layout patterns and neutral design-token system
- project-aware seed/scenario framework
- structured/human-readable handover documentation
- uploads, analytics, observability and lead-generation recipes
- ready-default invariant and byte-stable generation

## Phase 3 — Content and Asset Intelligence ✅ Complete

- deterministic extraction for text/Markdown/JSON/HTML/CSV/PDF/DOCX/XLSX
- bounded same-origin existing-site crawl with network/resource safety gates
- content-addressed extraction cache
- provenance/confidence/verification-aware facts
- source-backed company profile
- generated-copy separation from extracted facts
- image/logo/screenshot inventory, duplicate signals and responsive variants
- observed brand inputs
- SEO/local-SEO/lead inputs
- bounded AI-context chunks and semantic knowledge-pack hash
- `npm run ingest` CLI
- Phase 3 doctor and mixed business-pack acceptance

Phase 3 exit gate is complete: messy source material can be normalized once into trusted structured inputs without repeatedly reparsing or resending whole files to AI.

## Phase 3.5 — Factory Control Plane ✅ Foundation Complete

Purpose: establish the minimum durable safety/evaluation layer needed later without allowing control-plane work to outrun the actual product pipeline.

### Phase 3.5A — Durable control primitives ✅ Complete

- durable task contract with time/token/cost/iteration/no-progress budgets
- Build/Event Ledger JSONL primitive
- ChangeSet declaration and file-scope validation
- checkpoints and fresh-session resume packets
- source trust boundary with `instructionAuthority`
- deny-by-default agent capability policies and approval-required actions
- provider-neutral control-plane package
- future Hetzner/OpenCode runtime documented behind `AgentRuntimeAdapter`

### Phase 3.5B — Evaluation and upgrade foundations ✅ Complete

- six canonical project types generated and independently installed/checked/built
- structured deterministic benchmark report with score/duration/cost/intervention fields
- recipe installation inventories with managed-file hashes
- read-only `upgrade:plan`
- fail-closed upgrade proposal contract
- explicit recipe upgrade compatibility metadata
- non-functional-requirements contract
- rich Design Contract groundwork
- status/progress drift checks

### Phase 3.5C — Sandbox and trace adapters ⏸ Deferred until before Phase 5

Do not expand autonomous-runtime infrastructure while the factory still lacks end-to-end composition and a service layer. Return to this immediately before broad agent execution.

Deferred scope:
- provider-neutral `ExecutionEnvironmentAdapter`
- disposable/rootless sandbox implementation
- CPU/memory/runtime/network/secret policies
- preview/artifact/checkpoint interface
- OTel-compatible trace export mapping
- explicit production deployment/database approval boundary

## Phase 3.6 — Requirements-to-Product Composition 🚧 Active

Purpose: join Phases 1–3 into one actual product pipeline. This is the current highest-value work.

### Phase 3.6A — Manifest and Build Contract v2 ✅ Complete

- Manifest v2 preserves audience/target users
- preserves journeys / must-have actions
- preserves entities/data concepts
- preserves company identity, services, locations, contacts, trust and conversion goals
- preserves roles, tenancy, integrations, existing-data/upload and hard constraints
- introduces deterministic major pages/surfaces with explicit override
- Build Contract v2 contains the full build-shaping structure promised by the product specification
- requested capabilities separated from installed deterministic recipes
- approval checks module readiness before generation
- unavailable requested capabilities must be explicitly excluded or retained as custom work
- v1 manifests remain readable/valid for existing generated examples
- Console displays buildability decisions before approval

### Phase 3.6B — Deterministic composition 🚧 Active

Build the missing middle of the factory:

- `PageSpec` contract for route/path/title/purpose/navigation/section order
- `SectionSpec` contract for section type, content bindings, actions, assets and provenance
- reusable section library covering at minimum:
  - hero
  - service/product grid
  - proof/trust
  - projects/case studies
  - people/team where relevant
  - locations/service areas
  - FAQ
  - contact/lead action
  - generic CTA
  - feature/value-proposition sections for application products
- deterministic information-architecture composer from Manifest v2
- consume Phase 3 trusted knowledge pack rather than leaving it orphaned
- bind source-backed facts into sections while retaining source/provenance ids
- never transform extracted facts into unsupported marketing claims
- deterministic fallback copy only where explicitly labelled generated/default content
- real router/navigation generation in the React template
- generated `PageSpec`/`SectionSpec` records retained for handover and later click-to-edit
- composition tests across all six first-class project categories
- capability-intersection composition cases

Exit gate: a valid Manifest v2 plus knowledge pack produces a real navigable multi-page/multi-surface application foundation rather than a generic shell with recipe names.

### Phase 3.6C — Real-business end-to-end acceptance ⬜ Next

Use genuine business material rather than synthetic fixtures:

- one real existing business URL
- real document/PDF source material
- real logo/photos/assets
- complete intake -> manifest -> ingestion -> composition -> generation -> build -> deploy flow
- record manual edits required before acceptable launch
- record deterministic/AI cost, elapsed work and interventions
- first target: fewer than **20 meaningful manual edits** between generated output and a launchable result
- capture every edit category as evidence for recipes/questionnaire/composer improvements

This is the honest V1 product gate. Progress toward fewer manual edits is a primary factory metric alongside test/benchmark scores.

## Phase 3.7 — Factory Service and Real Ledger Integration ⬜ Planned after composition

Purpose: give the Builder Console and future agents one real backend instead of parallel browser/runtime state.

### Service layer

- add `apps/service`
- typed HTTP/API contract over `factory-core`, `content-intelligence`, generator and `control-plane`
- project/workspace lifecycle endpoints
- intake/manifest/knowledge-pack/composition endpoints
- spawn/manage preview processes
- filesystem/project operations behind explicit capability boundaries
- git/checkpoint/version operations
- test/build/deploy operations
- secret/integration status without leaking values to browser clients

### Durable state

- keep JSONL as append-only/writable event evidence
- project/query/read model into SQLite unless evidence shows another store is needed
- events from real `create-app`, `ingest`, composition, tests and deployments
- cost/time/intervention projection per project
- events-since-checkpoint and task-progress queries
- Builder Console must render this state rather than invent parallel local state

### Agent/tool bridge

- expose deterministic factory operations through a provider-neutral tool contract
- evaluate a small MCP server/facade so OpenCode/Claude/Codex can call the real factory instead of reimplementing commands in prompts
- use interoperable `SKILL.md` format for repo-local specialist skills rather than inventing a proprietary skill format

## Phase 4 — Full Builder Console ⬜ Planned

Begins only after the service layer exists.

- chat/prompt intake over durable project/task state
- drag-and-drop source ingestion through `apps/service`
- live desktop/tablet/mobile preview
- click-to-select and click-to-edit text/assets/components using PageSpec/SectionSpec identity
- asset manager
- build plan/progress from the real Event Ledger
- versions/checkpoints/restore
- integrations/secrets status and approval UI
- test/health view
- cost/trace view
- preview/production deploy controls with approval gates
- Design Contract editing/review
- Playwright-based browser inspection layered on deterministic E2E tests

## Phase 4.5 — Pre-Agent Hardening ⬜ Planned

Resume the deferred 3.5C work immediately before powerful autonomous agents are enabled:

- execution sandbox abstraction and first rootless implementation
- secret/network/resource restrictions
- trace/export mapping
- production action approval boundary
- property tests for security-sensitive scope/question/module routing
- dead/orphan integration detection

Tooling to adopt/evaluate here where justified:
- `fast-check` for scope/question/module property tests
- `Knip` for orphan/dead integration detection
- `@axe-core/playwright` for deterministic accessibility gates
- `git merge-file` for safe three-way recipe upgrades
- schema-derived TypeScript + Ajv to remove duplicated hand-written contract types
- CSP baseline in deployment adapters

## Phase 5 — Low-Credit AI Orchestration + Dedicated Agent Runtime ⬜ Planned

- product bootstrapper only where deterministic composition cannot resolve novelty
- deterministic task/context router
- model router by measured task capability, quality threshold and cost
- compact knowledge/context packets using Phase 3 identities and trust labels
- versioned `SKILL.md` specialist skills
- implementation/design/backend/security/review specialists
- machine-readable outputs and ChangeSets
- bounded autonomous work/fix loops
- provider-neutral `AgentRuntimeAdapter`
- dedicated App Builder service on Hetzner, separate from project-specific runtimes
- OpenCode as initial runtime implementation rather than stable product dependency
- clean-session/context-loss recovery
- isolated per-project/per-task workspaces and scoped secrets
- browser/visual agent workflows

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- task-class model benchmark scoreboard
- cheapest model that clears quality threshold, escalating on failure
- prompt/skill/model regression tests
- hostile-source/prompt-injection cases
- dangerous-tool/permission-bypass tests
- context-router leakage tests
- second-opinion agreement metrics
- evaluate Promptfoo specifically where it materially improves red-team coverage

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

- unit/integration/E2E/accessibility/performance/security gates
- screenshot/visual review against Design Contract
- independent second-opinion review for material changes
- responsive/data/error/loading/empty/large-data stress scenarios
- slow/offline/failing-API scenarios
- Lighthouse-style performance budgets
- Semgrep/Gitleaks-style security/secret gates where they outperform bespoke doctor checks
- bounded autonomous correction through control-plane tasks
- deployment smoke tests

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/SSL launch checklist
- redirect/canonical/sitemap/robots setup
- analytics/observability/feedback activation
- production smoke checks and launch readiness report
- post-launch audit workflow
- handover/architecture documentation
- reviewed recipe/module upgrade propagation
- safe three-way managed-file reconciliation
- reusable pattern promotion workflow

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- analyse manual edits and rework across projects
- propose versioned questionnaire improvements
- identify capabilities worth promoting into reusable recipes/sections
- measure tokens/cost/time saved
- benchmark one-prompt builds only after the deterministic pipeline is genuinely useful
- track user intervention count and causes
- compare model/skill/router versions against accepted baselines
- no silent self-modification: every improvement remains reviewed, versioned and regression-tested

## Architectural follow-ups to preserve

- add short ADRs for durable-state choice, control-plane ownership, template strategy, backend defaults and deployment defaults
- prove the template contract with a genuinely different second template after composition is stable; a static/content-oriented template is a strong candidate
- evaluate `@mozilla/readability` against real crawled sites before adopting it
- do not adopt Temporal/LangGraph/large orchestration frameworks unless measured complexity later justifies them
