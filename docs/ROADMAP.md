# Roadmap

Current stage: **Phase 3 complete — Phase 4 is next**.

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

## Phase 4 — Full Builder Console ⬜ Planned

- chat/prompt panel
- drag-and-drop source intake backed by Phase 3 normalization
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
- compact project knowledge packets using Phase 3 chunk/cache identities
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
