# Roadmap

Current stage: **Phase 2B — Backend foundation and core application recipes**.

The detailed delivery specification lives in `docs/MASTER_PLAN.md`. This file is the short progress view.

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

## Phase 2 — Deterministic Project Generator 🚧 Active

### Phase 2A — Generator core ✅ Complete

- versioned template and recipe contracts/registries
- neutral standalone React 19 / TypeScript / Vite template
- deterministic `create-app --plan` and real project materialisation
- fail-closed handling when a requested capability has no ready recipe
- recipe dependency/conflict resolution
- safe managed recipe add/remove reconciliation
- generated provenance records without runtime lock-in
- first ready recipes: feature flags and SEO defaults
- generated-app CI acceptance: independent install, check and production build

### Phase 2B — Backend foundation and core recipes 🚧 Active

Execution order:

1. define versioned environment/backend adapter contracts;
2. add the Supabase client/environment adapter as infrastructure selected by the manifest;
3. implement a real auth recipe;
4. implement profiles;
5. implement organisations, memberships and RBAC with explicit database/RLS contracts;
6. implement the generic admin foundation;
7. add uploads and email only after the shared backend contracts are stable;
8. prove a B2B SaaS manifest generates and builds with the selected backend/core recipes and no AI.

### Phase 2C — Project finishing system ⬜ Planned

- Netlify deployment adapter and environment handoff
- design tokens and reusable layout-pattern catalogue
- seed/scenario framework
- generated architecture/handover documentation
- multi-manifest acceptance across materially different project types

Phase 2 exit gate: a valid manifest deterministically generates a runnable, tested repository containing only selected capabilities and no domain-specific baggage.

## Phase 3 — Content and Asset Intelligence ⬜ Planned

- document/spreadsheet extraction pipeline
- asset classification and metadata
- image optimisation/cropping/responsive variants
- fact/content provenance
- brand and design-reference intake
- SEO/local SEO/lead-generation recipes

## Phase 4 — Full Builder Console ⬜ Planned

- chat/prompt panel
- live desktop/tablet/mobile preview
- click-to-edit
- asset manager
- build plan/progress
- versions/checkpoints
- integrations/secrets
- cost meter
- preview/production deploy controls

## Phase 5 — Low-Credit AI Orchestration ⬜ Planned

- product bootstrapper
- deterministic context router
- model router by task/cost
- specialist implementation/design/review agents
- compact project knowledge packets
- bounded autonomous fix loops

## Phase 6 — Quality System ⬜ Planned

- unit/integration/E2E/accessibility/performance/security gates
- visual review and screenshot regression
- second-opinion review
- responsive/data/error-state stress scenarios
- deployment smoke tests

## Phase 7 — Launch and Operations ⬜ Planned

- domain/DNS/SSL launch checklist
- analytics/observability/feedback
- post-launch audits
- upgrade propagation from factory modules to existing apps
- reusable pattern promotion workflow
- automatic handover documentation

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- analyse corrections and rework across projects
- propose versioned questionnaire improvements
- identify capabilities worth promoting into reusable recipes
- measure tokens/cost/time saved per project
- benchmark one-prompt builds across project categories
