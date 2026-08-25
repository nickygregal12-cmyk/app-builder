# App Builder — Master Delivery Plan

## 1. Product goal

App Builder is a private, AI-first website and application factory for personal use. Its job is to turn rough real-world input into a tested, portable project while spending as little AI credit as practical.

The target end-state is:

1. provide an idea, company details, an existing URL, documents, spreadsheets, screenshots, logos and/or images;
2. answer an adaptive set of questions;
3. review a concise Build Contract before any expensive build starts;
4. normalise source material into trusted structured knowledge with provenance;
5. deterministically compose real routes/pages/screens and content bindings from the approved requirements and trusted knowledge;
6. let templates, recipes and tools create everything already solved by the factory;
7. use AI only for genuinely novel product, design, content or engineering work;
8. run deterministic quality gates first, then targeted AI review only where useful;
9. preview, edit, version and deploy from the Builder Console;
10. keep the generated application as a normal repository with no App Builder runtime lock-in;
11. feed evidence from completed projects back into reviewed, versioned improvements to the factory.

Core rule: **never spend AI tokens solving a problem the factory already knows how to solve deterministically.**

A second rule is now equally important: **do not build more factory infrastructure while the existing subsystems are not joined into a useful end-to-end product.**

---

## 2. Operating principles

### Deterministic first
Schemas, templates, recipes, composers, generators, static analysis, tests, linters, image tooling and deployment scripts should do repeatable work. AI is a fallback for ambiguity, novelty and judgement.

### Requirements before code
No substantial build starts while high-impact requirements or capability-buildability decisions remain unresolved. Intake produces a reviewed Build Contract first.

### Preserve requirements; do not confuse them with recipes
A requested capability is product intent. A ready recipe is one possible deterministic implementation. Manifest/Build Contract must retain requirements even when no ready recipe exists, while generated `modules` remain fail-closed.

### Trusted facts stay facts
Source material may be normalised and bound into pages, but source-backed facts must retain provenance. Generated copy is separate and may not silently invent or strengthen factual claims.

### Modules and sections, not copied boilerplate
Reusable capabilities such as auth, organisations, uploads, email, admin, billing and analytics become versioned recipes. Reusable product presentation becomes versioned section/page composition primitives rather than being regenerated from scratch.

### Small context packets
Agents receive only the product authority, manifest, relevant knowledge chunks, files, contracts and tests needed for the task. Whole-repository reads are exceptional.

### Sessions are disposable; project state is durable
A chat/session is never the source of truth. Tasks, events, ChangeSets, checkpoints, repository state and summaries must let a clean session continue later.

### Portable outputs
Generated apps remain ordinary repositories that can be maintained without the Builder Console or App Builder runtime.

### Evidence-driven improvement
The factory may propose improvements to questionnaires, recipes, composition rules, skills and defaults from real project evidence. It must not silently self-modify.

### Cost and intervention are product requirements
Track AI spend, elapsed work and user intervention. For deterministic site-building progress, **meaningful manual edits required before launch** is a primary outcome metric.

---

# 3. Delivery milestones

## Phase 0 — Foundation ✅ Complete

Delivered:
- root engineering authority;
- App Factory Engine / Builder Console boundary;
- project-type and optional-module registries;
- Project Manifest and Build Contract schemas;
- adaptive questionnaire definitions;
- deterministic `create-app` skeleton;
- credit/context rules;
- contamination guard;
- CI, doctor, tests, typecheck and lint;
- minimal Builder Console shell.

---

## Phase 1 — Adaptive Intake and Build Contract ✅ Complete, extended by 3.6A

Delivered:
- Quick / Standard / Thorough modes;
- conditional/versioned questionnaires for six project types;
- company/business intake;
- source-reference inventory;
- deterministic blocker and ambiguity-follow-up model;
- review/approval flow;
- local save/resume and portable export bundle;
- feedback/evidence records;
- Chromium end-to-end intake acceptance.

Phase 3.6A upgrades the outputs to the richer v2 contracts required by the real composition pipeline.

---

## Phase 2 — Deterministic Project Generator and Recipes ✅ Complete

Delivered:
- versioned template/recipe/adapter contracts;
- neutral standalone React/TypeScript/Vite template;
- deterministic generation and planning;
- fail-closed missing-capability handling;
- dependency/conflict resolution;
- recipe add/remove reconciliation;
- Supabase and Netlify adapters;
- auth/profiles/organisations/admin/uploads/analytics/observability/lead-generation/SEO and feature-flag foundations;
- layouts/design tokens/scenarios;
- generated handover/provenance state;
- byte-stability and standalone generated-app checks.

Important continuing rule: a planned/unavailable module never becomes an enabled deterministic recipe merely because intake requested it.

---

## Phase 3 — Company, Content and Asset Intelligence ✅ Complete

Delivered:
- URL/existing-site intake and bounded crawl;
- PDF/DOCX/XLSX/text/HTML/CSV extraction;
- structured company knowledge pack;
- fact provenance/confidence/verification;
- generated-copy separation;
- image/logo/screenshot inventory;
- metadata, optimisation and responsive variants;
- duplicate/low-resolution signals;
- brand/reference observations;
- SEO/local-SEO and lead-generation inputs;
- content-addressed source/extraction caching;
- bounded AI-context chunks;
- deterministic mixed business-pack acceptance.

Knowledge-pack outputs are not complete until a later stage consumes them. Phase 3.6B is responsible for that join.

---

## Phase 3.5 — Factory Control Plane ✅ Foundation Complete

### 3.5A Durable control primitives ✅

- durable tasks and bounded loop guards;
- append-only JSONL Build/Event Ledger primitive;
- ChangeSets and file-scope validation;
- checkpoints/resume packets;
- source trust / instruction-authority boundary;
- deny-by-default capability policies;
- provider-neutral control-plane package;
- documented future Hetzner/OpenCode runtime behind `AgentRuntimeAdapter`.

### 3.5B Evaluation and upgrade foundations ✅

- six canonical first-class generated applications independently install/check/build;
- structured deterministic benchmark reporting;
- recipe installation hash inventory;
- read-only upgrade planning;
- explicit upgrade compatibility metadata;
- fail-closed divergence detection;
- non-functional-requirements contract;
- richer Design Contract groundwork;
- machine-readable factory status and doc-drift checking.

### 3.5C Sandbox/trace implementation ⏸ Deferred

Do not build this merely because the control-plane design exists. Resume it immediately before powerful autonomous execution in Phase 5.

Deferred:
- `ExecutionEnvironmentAdapter`;
- first rootless/disposable sandbox;
- resource/network/secret limits;
- preview/artifact interface;
- OTel-compatible trace export mapping;
- hard production write/deploy approval boundary.

---

## Phase 3.6 — Requirements-to-Product Composition 🚧 Active

This phase fixes the load-bearing gap between intake, knowledge extraction and generation.

### Phase 3.6A — Manifest and Build Contract v2 ✅ Complete

Manifest v2 preserves:
- audience/target users;
- user roles;
- journeys/must-have actions;
- major pages/surfaces;
- core entities/data concepts;
- company identity and factual description;
- services/products;
- locations/service areas;
- public contact details;
- trust/proof inputs;
- conversion goals;
- tenancy;
- integrations;
- upload/data migration requirements;
- hard constraints, scale and sensitivity;
- source references;
- explicit exclusions.

Build Contract v2 additionally records:
- requested capabilities;
- deterministic ready modules;
- custom-work capabilities;
- excluded capabilities;
- unresolved capability decisions;
- infrastructure choice;
- design direction;
- AI/cost mode;
- blockers and acceptance criteria.

Approval rules:
- unresolved high-impact questions block approval;
- a requested non-ready capability blocks approval until explicitly marked `exclude` or `custom-work`;
- custom work remains visible product intent but does not become `modules: true`;
- existing v1 manifests remain readable for backwards compatibility.

### Phase 3.6B — Deterministic composition 🚧 Current

#### Contracts
Create stable:
- `PageSpec`;
- `SectionSpec`;
- content-binding/provenance contract;
- navigation/information-architecture contract;
- composition output/version record.

A `PageSpec` should minimally describe:
- stable id;
- route/path;
- navigation label/order/visibility;
- page purpose;
- audience/primary action;
- ordered section ids;
- SEO/meta intent where relevant.

A `SectionSpec` should minimally describe:
- stable id;
- section type;
- purpose;
- source/content bindings;
- actions/links;
- asset references;
- provenance/source ids;
- generated/default copy flags;
- display/variant hints without hard-coding a single aesthetic.

#### Reusable section library
Initial deterministic primitives should cover:
- hero;
- service/product grid;
- feature/value proposition;
- proof/trust;
- projects/case studies;
- people/team;
- locations/service areas;
- FAQ;
- content/index cards;
- contact/lead action;
- generic CTA;
- application dashboard/workspace summaries where appropriate.

#### Composer
Build a deterministic composer that consumes:
- approved Manifest v2;
- Build Contract v2;
- Phase 3 trusted knowledge pack;
- project-type defaults;
- available section/layout contracts;
- ready recipe capabilities.

It should produce:
- real page/surface information architecture;
- route/navigation definitions;
- ordered sections;
- source-backed content bindings;
- explicit placeholders/default generated text only where no trusted content exists;
- composition warnings for missing content or unsupported requirements;
- a stable composition record for later editing/versioning.

#### Knowledge-pack join
The composer is the first production consumer of Phase 3 knowledge:
- facts are bound by stable source/provenance ids;
- services/locations/people/projects/testimonials are selected from trusted records;
- assets are selected from the asset inventory rather than rediscovered;
- no source text can grant itself instruction/tool authority;
- no inferred marketing superlative is created from a factual source record.

#### Generated application integration
The neutral template gains:
- real routing/navigation;
- renderer(s) for PageSpec/SectionSpec;
- composition data under generated/project-owned state;
- no App Builder runtime dependency.

The section renderer should be replaceable so later visual design can improve without rewriting product structure.

#### Testing
Cover:
- all six project types;
- marketing site with company/services/locations/trust/contact;
- B2B SaaS with entities/roles/workspace surfaces;
- content site with index/detail surfaces;
- empty/missing source content fallbacks;
- provenance preservation;
- no invented factual claims;
- byte-stable composition for identical inputs;
- generated apps still install/check/build independently.

Exit gate: Manifest v2 + trusted knowledge pack produce a real navigable product foundation, not a generic hero and recipe list.

### Phase 3.6C — Real-business acceptance ⬜ Next

Run a genuine end-to-end build using:
- a real business URL;
- real PDF/document material;
- real logo and photographs;
- real company facts.

Flow:
`intake -> Build Contract v2 -> Manifest v2 -> ingest -> knowledge pack -> compose -> generate -> check/build -> preview/deploy`

Record:
- meaningful manual edits required before acceptable launch;
- categories/reasons for those edits;
- AI calls/tokens/cost if any;
- elapsed execution/work;
- retries/interventions;
- quality gate failures.

Initial outcome target: **fewer than 20 meaningful manual edits before the result is launchable.**

The first real build is a product gate, not a demo. Its evidence may change later roadmap priorities.

---

## Phase 3.7 — Factory Service and Real Ledger Integration ⬜ Planned

The full Console cannot be a browser-only SPA. Build the factory backend before expanding UI.

### `apps/service`
Provide a typed private HTTP/API boundary over:
- factory-core;
- content-intelligence;
- composition;
- generator/recipes;
- control-plane.

Capabilities:
- create/open project workspace;
- store/fetch approved contracts/manifests;
- ingest uploaded/source material;
- compose/recompose;
- generate/update project;
- start/stop preview;
- filesystem operations within project scope;
- git/checkpoint/version operations;
- run doctor/check/test/build;
- preview deployment;
- read integration/secret status without returning secret values.

### Real ledger wiring
Every actual workflow should emit events, including:
- intake approved;
- ingestion started/source normalised/ingestion completed;
- composition started/page composed/composition completed;
- generation started/recipe installed/generation completed;
- check/test/build started/completed/failed;
- checkpoint created;
- deploy requested/completed/failed.

Keep JSONL as append-only evidence. Add a SQLite projection/read model for:
- project/task history;
- events since checkpoint;
- cost/time/intervention summaries;
- benchmark deltas;
- current progress/status;
- Console queries.

### Agent/tool bridge
Expose deterministic factory operations through a provider-neutral tool boundary. Evaluate:
- a small MCP facade for deterministic factory commands;
- interoperable `SKILL.md` files for specialist workflows.

Do not let prompts reimplement deterministic factory logic.

Exit gate: the Console and future runtimes have one backend/source of state, and real factory operations exercise the event ledger.

---

## Phase 4 — Full Builder Console ⬜ Planned

Begins after `apps/service` exists.

Build:
- prompt/chat panel backed by durable project/task state;
- drag/drop real ingestion;
- desktop/tablet/mobile live preview;
- click-to-select/edit through stable PageSpec/SectionSpec identities;
- asset manager;
- build plan/progress from ledger events;
- versions/checkpoints/restore;
- integrations/secrets status;
- tests/health/database/log views where safe;
- cost/trace view;
- Design Contract editing;
- preview/production deploy controls with approval gates.

Important boundary: the Console is a client of the factory service. Generated apps never require it to run.

---

## Phase 4.5 — Pre-Agent Hardening ⬜ Planned

Before giving autonomous agents broad tools:
- complete deferred Phase 3.5C sandbox abstraction;
- rootless sandbox implementation first;
- fail-closed network/resource/secret policies;
- production action approvals;
- property tests for security-sensitive glob/scope, questionnaire and module-routing functions;
- dead/orphan integration detection;
- accessibility baseline in generated acceptance apps;
- CSP baseline in deployment adapters;
- remove schema/type drift by generating shared contract types and validating boundaries from schemas.

Candidate tooling, only where it earns its dependency cost:
- `fast-check`;
- `Knip`;
- `@axe-core/playwright`;
- `git merge-file` for three-way recipe reconciliation;
- Ajv plus schema-derived TypeScript;
- rootless Podman behind `ExecutionEnvironmentAdapter`.

---

## Phase 5 — Low-Credit AI Orchestration + Dedicated Runtime ⬜ Planned

Purpose: add AI after the deterministic factory can already produce a useful product.

Build:
- deterministic task/context router;
- measured model router by task class/quality/cost;
- compact trusted context packets;
- versioned `SKILL.md` specialist skills;
- specialist product/design/implementation/backend/security/review roles;
- machine-readable outputs/ChangeSets;
- bounded fix/work loops;
- provider-neutral `AgentRuntimeAdapter`;
- dedicated App Builder runtime on Hetzner separate from project-specific automation;
- OpenCode as initial runtime implementation, not product dependency;
- clean-session/context-loss recovery;
- isolated per-project workspaces and scoped secrets;
- browser/visual workflows;
- structured usage/cost traces.

Default principle: model calls are justified by novelty or judgement, not used as wrappers around deterministic commands.

---

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- model/task benchmark scoreboard;
- cheapest model that clears quality threshold, escalating only on failure;
- prompt/skill/model regression cases;
- hostile-source/prompt-injection suites;
- tool/permission-bypass cases;
- context leakage tests;
- second-opinion agreement/disagreement metrics;
- evaluate Promptfoo mainly for adversarial/prompt-injection suites if it improves coverage.

---

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

- unit/integration/E2E gates;
- accessibility gates;
- security/dependency/secret checks;
- performance budgets;
- visual regression and Design Contract review;
- mobile/tablet/desktop checks;
- empty/loading/error/large-data scenarios;
- slow/offline/failing-API cases;
- AI review only after deterministic checks;
- bounded autonomous corrections;
- deployment smoke tests.

Candidate tools when justified:
- Lighthouse CI;
- Semgrep;
- Gitleaks;
- targeted browser/visual review.

---

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/SSL checklist;
- redirects/canonical/sitemap/robots;
- analytics/observability activation;
- feedback intake;
- launch readiness report;
- production smoke checks;
- post-launch audits;
- handover/architecture documentation;
- module/recipe version inventory;
- reviewed upgrade propagation;
- three-way managed-file reconciliation;
- reusable pattern promotion workflow.

---

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- manual-edit/rework cause analysis;
- question usefulness/default acceptance metrics;
- recipe/section reuse metrics;
- token/cost/time/intervention metrics;
- questionnaire/composer/recipe improvement proposals;
- model/skill/router comparisons against accepted baselines;
- one-prompt scorecard only after the deterministic pipeline is genuinely useful.

No silent self-modification. Evidence creates a proposed, versioned, regression-tested change.

---

# 4. First-class project modes

1. **Marketing/business website** — public pages, company content, local SEO, leads, assets.
2. **B2B SaaS** — organisations, roles, data, admin, uploads, integrations, optional billing/custom work.
3. **Consumer app** — accounts, profiles, engagement, notifications and optional PWA/custom work.
4. **Internal tool** — authenticated workflow/data interfaces with minimal public surface.
5. **Content site** — publishing/content structures, SEO and analytics.
6. **AI-first app** — structured AI capability with budgets, evaluations and fallbacks.

Additional project types are added only when their requirement, composition or architecture defaults are materially different.

---

# 5. Target build lifecycle

`Input -> Intake -> Build Contract -> Approval -> Manifest -> Ingest/Knowledge Pack -> Deterministic Composition -> Deterministic Generation/Recipes -> Novel AI Work -> Deterministic QA -> Targeted AI Review -> Preview/Edit -> Approval -> Production -> Monitor -> Improve Factory`

Structured state is persisted at every material transition.

---

# 6. Cost and usefulness targets

For ordinary business websites, directionally target **~90% deterministic/reusable and ~10% generative** once mature.

For custom SaaS applications, directionally target **~60–75% deterministic/reusable and ~25–40% generative**.

Do not optimise percentages at the expense of product quality. The stronger near-term metric is:

> **How many meaningful manual edits are required between generated output and an acceptable launch?**

The first real-business acceptance target is fewer than 20.

---

# 7. Definition of a successful v1

App Builder v1 is successful when:
- a real project starts from an idea plus optional company/source material;
- adaptive intake catches high-impact requirements before coding;
- the approved Build Contract retains the real requirements rather than dropping them;
- buildability decisions are known before generation;
- real source material becomes a trusted knowledge pack;
- deterministic composition creates sensible routes/pages/screens and binds trusted content;
- a real repository is generated from that composition;
- generic capabilities come from proven recipes;
- the result can be previewed, edited and deployed through the factory service/Console;
- automated quality gates run before release;
- the output remains an ordinary portable repository;
- one real-business build can reach acceptable launch quality with fewer than 20 meaningful manual edits;
- project evidence feeds reviewed versioned improvements.

---

# 8. Immediate execution order

1. Complete and merge **Phase 3.6A Manifest/Build Contract v2** with green CI.
2. Implement **Phase 3.6B deterministic composition** and make Phase 3 content intelligence a real production input.
3. Run **Phase 3.6C real-business end-to-end acceptance** and record manual edits/cost/time/interventions.
4. Build **Phase 3.7 `apps/service` + real ledger/SQLite projection**, then expose deterministic operations through a tool/MCP boundary where useful.
5. Build the full **Phase 4 Console** as a client of that service.
6. Complete sandbox/security hardening before broad autonomous agents.
7. Add the Hetzner/OpenCode runtime and low-credit AI orchestration only after the deterministic product pipeline proves useful.

`AGENTS.md` remains the root engineering authority. Schemas/config are the machine-readable authority for their contracts; `config/factory-status.json` is the machine-readable delivery status.
