# Roadmap

Current stage: **Phase 3 — Content and Asset Intelligence** (`Phase 3A` is in active development).

The detailed delivery specification lives in `docs/MASTER_PLAN.md`. The future dedicated agent-server architecture is defined in `docs/AGENT_RUNTIME.md`.

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

Phase 1 intentionally records file references/metadata only. Deep file parsing, storage and image processing remain Phase 3 responsibilities.

## Phase 2 — Deterministic Project Generator ✅ Complete

### Phase 2A — Generator core ✅ Complete

- versioned template and recipe contracts/registries
- neutral standalone React 19 / TypeScript / Vite template
- deterministic `create-app --plan` and real project materialisation
- fail-closed handling when a requested capability has no ready recipe
- recipe dependency/conflict resolution
- safe managed recipe add/remove reconciliation
- generated provenance records without runtime lock-in
- generated-app CI acceptance: independent install, check and production build

### Phase 2B — Backend foundation and core recipes ✅ Complete

- versioned environment/backend adapter contracts
- Supabase infrastructure adapter
- auth, profiles, organisations/memberships/RBAC and admin foundations
- uploads and shared application recipes
- generated B2B acceptance application

### Phase 2C — Project finishing system ✅ Complete

- Netlify deployment adapter and environment handoff
- design tokens and reusable layout-pattern catalogue
- seed/scenario framework
- generated architecture/handover documentation
- multi-manifest acceptance

Phase 2 exit gate: a valid manifest deterministically generates a runnable, tested repository containing only selected capabilities and no domain-specific baggage.

## Phase 3 — Content and Asset Intelligence 🚧 Active

- deterministic document/spreadsheet extraction pipeline
- existing-site/URL normalization
- asset classification and metadata
- image optimisation/cropping/responsive variants
- fact/content provenance and trust metadata
- source caching
- brand and design-reference intake
- complete business-pack acceptance flow
- AI-ready chunk/cache records without requiring AI for extraction
- SEO/local SEO/lead-generation inputs
- hostile/untrusted source handling before agent consumption

## Phase 3.5 — Factory Control Plane ⬜ Planned

Build the safety/state/evaluation layer before powerful autonomous coding loops:

- durable project/task state and Build/Event Ledger
- machine-readable ChangeSet + ChangeResult transactions
- checkpoints and restore
- isolated workspace/sandbox adapter
- task-level permissions and approval gates
- secret broker/scoped credentials
- explicit untrusted-content/instruction-authority model
- factory benchmark/evaluation harness across project types
- recipe version/upgrade/migration mechanics
- OpenTelemetry-style build/model/tool traces and cost accounting
- no-progress, repeated-failure and unexpected-wide-diff guards
- provider-neutral `AgentRuntimeAdapter`

This stage should make agent sessions disposable: a fresh worker must be able to resume from durable project state without replaying an entire conversation.

## Phase 4 — Full Builder Console ⬜ Planned

- chat/prompt panel
- live desktop/tablet/mobile preview
- click-to-edit
- asset manager
- build plan/progress backed by the event ledger
- versions/checkpoints/restore
- integrations/secrets
- cost and trace views
- current agent/specialist/task state
- pause/cancel/resume and approval controls
- preview/production deploy controls

## Phase 5 — Low-Credit AI Orchestration + Dedicated Agent Runtime ⬜ Planned

- product bootstrapper
- deterministic context router
- evaluation-driven model router by task/quality/cost
- repo-local specialist skill architecture
- specialist implementation/design/backend/content/security/review agents
- compact project knowledge/context packets
- bounded autonomous fix loops
- dedicated App Builder worker runtime on the owner's Hetzner server
- OpenCode as the initial `AgentRuntimeAdapter` implementation, not a hard dependency
- headless agent sessions and subagent handoffs
- deliberate context compaction/session replacement
- resume after context loss/process restart from ledger + checkpoint + failure state
- per-loop iteration/time/token/cost ceilings
- isolated per-project/per-task workspaces
- live worker events streamed to the Builder Console

See `docs/AGENT_RUNTIME.md` for the target architecture.

## Phase 5.5 — AI Evaluation and Red-Team ⬜ Planned

- prompt/model/agent regression suites
- cross-model task benchmarks
- routing quality thresholds
- prompt-injection/tool-misuse red-team scenarios
- knowledge-pack grounding/provenance evaluation
- nightly/periodic larger benchmark runs
- automatic detection of quality regressions before changing defaults

## Phase 6 — Quality System ⬜ Planned

- unit/integration/E2E/accessibility/performance/security gates
- visual review and screenshot regression
- second-opinion review
- responsive/data/error-state stress scenarios
- browser-agent exploratory QA after deterministic checks
- deployment smoke tests
- autonomous corrections only within control-plane limits

## Phase 7 — Launch and Operations ⬜ Planned

- domain/DNS/SSL launch checklist
- analytics/observability/feedback
- post-launch audits
- safe recipe/foundation upgrade propagation to existing apps
- reusable pattern promotion workflow
- automatic handover documentation
- dedicated agent-runtime operations/health/backup procedures

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- analyse corrections and rework across projects
- propose versioned questionnaire improvements
- identify capabilities worth promoting into reusable recipes
- measure tokens/cost/time saved per project
- compare specialist/model/skill effectiveness using real outcomes
- benchmark one-prompt builds across project categories
- improve defaults only through reviewed versioned changes
