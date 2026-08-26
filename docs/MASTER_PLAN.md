# App Builder — Master Delivery Plan

## 1. Product goal

App Builder is a private, AI-first website and application factory for personal use. Its job is to turn rough real-world input into a tested, portable project while spending as little AI credit as practical.

The target end-state is:

1. provide an idea, company details, an existing URL, documents, spreadsheets, screenshots, logos, images, design references and/or an existing repository;
2. answer an adaptive set of questions;
3. review a concise Build Contract before expensive build work starts;
4. normalize source material into trusted structured knowledge with provenance;
5. deterministically compose real routes/pages/screens, content bindings and content collections from approved requirements and trusted knowledge;
6. let templates, capability recipes, presentation registries and deterministic tools create everything already solved by the factory;
7. use AI only for genuinely novel product, design, content or engineering work;
8. run deterministic correctness/security/accessibility/quality gates first, then targeted AI review where useful;
9. preview, visually compare, directly edit, version and deploy from the Builder Console;
10. keep generated applications as ordinary repositories with no App Builder, MCP or agent-runtime lock-in;
11. expose deterministic factory operations through provider-neutral service/tool contracts so multiple coding clients can use the same factory;
12. feed evidence from completed projects back into reviewed, versioned improvements to questionnaires, composition, recipes, design-system rules and routing.

Core rule: **never spend AI tokens solving a problem the factory already knows how to solve deterministically.**

A second rule is equally important: **do not build more infrastructure while existing subsystems are not joined into a useful end-to-end product.**

A third rule now follows from the latest audit: **do not scale autonomous or visual-builder surface area on top of unproven contract/security boundaries. Correctness gates move earlier when they are cheap and deterministic.**

Detailed capability findings and adoption rules live in `docs/BEST_IN_CLASS_CAPABILITIES.md`. The deterministic engineering-gate programme lives in `docs/ENGINEERING_QUALITY_PROGRAMME.md`.

---

## 2. Operating principles

### Deterministic first

Schemas, generated types, validators, templates, registries, recipes, composers, generators, database tests, static analysis, accessibility tests, image tooling and deployment scripts should do repeatable work. AI is a fallback for ambiguity, novelty and judgement.

### One machine-readable contract authority

Where a stable JSON Schema exists, it should become the canonical machine-readable contract. Shared TypeScript types and runtime boundary validation should be generated/derived from it rather than independently re-encoding the same enums and rules.

Structural validity and buildability remain separate concepts: a request can be valid product intent while its selected adapter/capability is not yet ready.

### Requirements before code

No substantial build starts while high-impact requirements or capability-buildability decisions remain unresolved. Intake produces a reviewed Build Contract first.

### Preserve requirements; do not confuse them with recipes

A requested capability is product intent. A ready recipe is one deterministic implementation. Manifest/Build Contract must retain requirements even when no ready recipe exists, while generated modules remain fail-closed.

### Trusted facts stay facts

Source material may be normalized and bound into pages, structured data and collections, but source-backed facts retain provenance. Generated copy is separate and may not silently invent or strengthen factual claims.

### Capability and presentation reuse are distinct

Reusable capabilities such as auth, organisations, uploads, email, admin, billing and analytics belong in versioned capability recipes.

Reusable visual/product presentation belongs in versioned presentation primitives/components/sections governed by Design Contract/DesignSystemSpec. Avoid regenerating solved components from scratch.

### Small context packets

Agents receive only the product authority, manifest, relevant knowledge chunks, files, contracts, design-system records and tests needed for the task. Whole-repository reads are exceptional.

### Routing discipline scales with capability

More AI capability requires **stronger routing discipline**, not more loaded tools. The intended shape is:

`task -> smallest deterministic route -> minimal authorities -> minimal complementary skills -> specialist agent -> structured artifact -> independent review -> executable evidence -> typed rework if needed -> convergence -> release`

and never:

`task -> load every tool and skill -> one giant agent -> huge context -> self-review -> declare done`.

Installed is not loaded. A specialist carries at most one skill per load class, an ambiguous prompt orients rather than guessing a subsystem, and deterministic routing benchmarks with **positive and negative** triggers hold that contract in CI.

### Sessions are disposable; project state is durable

A chat/session is never the source of truth. Tasks, events, ChangeSets, checkpoints, repository state and summaries must let a clean session continue later.

### Portable outputs

Generated apps remain ordinary repositories that can be maintained without the Builder Console, MCP facade, App Builder runtime or OpenCode.

### Evidence-driven improvement

The factory may propose improvements to questionnaires, recipes, sections/components, composition rules, templates, skills and defaults from real project evidence. It must not silently self-modify.

### Cost and intervention are product requirements

Track AI spend, elapsed work and user intervention. For deterministic site-building progress, **meaningful manual edits required before launch** is a primary outcome metric.

### Environment identity is explicit

Development, preview and production must become explicit environment identities before powerful deployment/database controls are exposed. A preview build or agent must not reach production data because environment state was implicit.

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

## Phase 1 — Adaptive Intake and Build Contract ✅ Complete, extended by later contracts

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

Later contract migrations preserve richer requirements without replacing the intake principle.

---

## Phase 2 — Deterministic Project Generator and Recipes ✅ Complete

Delivered:
- versioned template/recipe/adapter contracts;
- neutral standalone React/TypeScript/Vite application template;
- deterministic generation and planning;
- fail-closed missing-capability handling;
- dependency/conflict resolution;
- recipe add/remove reconciliation;
- Supabase and Netlify adapters;
- auth/profiles/organisations/admin/uploads/analytics/observability/lead-generation/SEO and feature-flag foundations;
- layouts/design tokens/scenarios;
- generated handover/provenance state;
- byte-stability and standalone generated-app checks.

Continuing rule: a planned/unavailable module never becomes enabled merely because intake requested it.

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

---

## Phase 3.5 — Factory Control Plane ✅ Foundation Complete

### 3.5A — Durable control primitives ✅

- durable tasks and bounded loop guards;
- append-only JSONL Build/Event Ledger primitive;
- ChangeSets and file-scope validation;
- checkpoints/resume packets;
- source trust/instruction-authority boundary;
- deny-by-default capability policies;
- provider-neutral control-plane package;
- documented future Hetzner/OpenCode runtime behind `AgentRuntimeAdapter`.

### 3.5B — Evaluation and upgrade foundations ✅

- six canonical first-class generated applications independently install/check/build;
- structured deterministic benchmark reporting;
- recipe installation hash inventory;
- read-only upgrade planning;
- explicit upgrade compatibility metadata;
- fail-closed divergence detection;
- non-functional-requirements contract;
- richer Design Contract groundwork;
- machine-readable factory status and doc-drift checking.

### 3.5C — Sandbox/trace implementation ◐ Mostly landed early under Phase 4.5

Deferred at 3.5 and resumed ahead of schedule. Landed: the `ExecutionEnvironmentAdapter` and its local
and rootless-Podman drivers, the first disposable sandbox, resource/network/secret limits and the pinned
content-addressed task image with bounded public egress.

Still outstanding, tracked under Phase 4.5: the OTel-compatible trace export mapping and the hard
production write/deploy approval boundary. `docs/ROADMAP.md` sequences the rest.

---

## Phase 3.6 — Requirements-to-Product Composition ✅ Complete

### Phase 3.6A — Manifest and Build Contract v2 ✅ Complete

Manifest v2 preserves:
- audience/target users and roles;
- journeys/must-have actions;
- major pages/surfaces;
- core entities/data concepts;
- company identity, services, locations, contact and trust inputs;
- conversion goals;
- tenancy/integrations/upload/data-migration requirements;
- hard constraints, scale and sensitivity;
- source references and explicit exclusions.

Build Contract v2 additionally records capability readiness/custom-work/exclusions, infrastructure, design direction, AI/cost mode, blockers and acceptance criteria.

Approval rules remain fail-closed for unresolved high-impact/capability decisions.

### Phase 3.6B — Deterministic composition ✅ Complete

Delivered:
- stable `PageSpec`/`SectionSpec`/content-binding contracts;
- deterministic information architecture and section composition;
- Phase 3 knowledge-pack consumption;
- provenance/source/entity retention;
- explicit generated/default fallbacks;
- generated multi-page navigation/rendering;
- independent generated-app install/check/build acceptance.

The section renderer remains replaceable so later visual systems can improve presentation without rewriting product structure.

### Phase 3.6C — Real-business acceptance ✅ Closed by the accepted Phase 3.8E run

Keep the current Acme mixed-source fixture as a deterministic regression case.

The genuine product gate this stage left open was closed by the accepted NBM run; the immutable record is
`docs/PHASE_3_8E_ACCEPTANCE_RECORD.md` and the contract governing any rerun is
`docs/GENUINE_BUSINESS_ACCEPTANCE.md`. What it required:
- genuine existing business URL;
- genuine PDF/document material;
- genuine logo/photographs/assets;
- real intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview/deploy;
- visual/product quality review;
- meaningful manual edits counted and categorized;
- AI calls/tokens/cost, elapsed work, retries/interventions and quality failures recorded.

Initial target: **fewer than 20 meaningful manual edits before launchable quality**. The accepted run
came in at 0.

One accepted run proves the path works once. Turning it into repeatable evidence is the product-proof
freeze and the varied corpus, sequenced in `docs/ROADMAP.md`.

---

## Phase 3.7 — Factory Service and Real Ledger Integration ✅ Core exit complete

Delivered:
- `apps/service` private/local service workspace;
- bounded server-owned project workspaces;
- durable generation tasks/events/checkpoints;
- JSONL evidence plus SQLite read projection;
- project/task/event/checkpoint/metrics API;
- Manifest/knowledge/composition reads;
- independent install/check/build verification;
- service-owned preview lifecycle;
- integration configuration status without secret values;
- provider-neutral tool descriptor;
- service doctor and generated-app portability checks.

Continuing boundary: add service endpoints because a real Console/runtime workflow needs them, not because a large API looks comprehensive.

---

## Phase 3.8 — Product Proof and Correctness Hardening ✅ Complete

Closed 2026-08-26 when 3.8E passed against a real business. The immutable record is `docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`.

This phase captures newly identified work that is cheaper and safer to solve before the Builder Console and autonomous tool surface expand.

### 3.8A — ChangeSet file-scope correctness — P0

The control-plane path matcher guards an autonomous security boundary. Prefix-style semantics must not allow sibling paths such as `src2/...` to satisfy `src/**`.

Implement:
- repository-relative path normalization;
- rejection of traversal/absolute/ambiguous forms;
- segment-correct glob matching, preferring the Node 22 native matcher if suitable;
- explicit sibling-prefix/Windows/separator/allow-deny collision tests;
- `fast-check` property tests.

Exit gate: no textual-prefix scope escape.

### 3.8B — Canonical contract generation/validation — P0

Target architecture:

`/schemas -> generated packages/contracts TypeScript -> Ajv boundary validation`

Implement:
- JSON Schema as canonical machine-readable authority where available;
- generated shared TS types;
- Ajv at external/service/file boundaries;
- migration away from duplicated handwritten enums/runtime validators;
- `contracts:generate` and drift-check CI;
- structural validity separate from registry buildability/readiness.

Candidate tools:
- `ajv`;
- `json-schema-to-typescript` or a proven equivalent.

### 3.8C — Executed Supabase RLS acceptance — P0

Static SQL checks stay as fast smoke tests, but recipe correctness must also be executed.

Implement:
- local Supabase/Postgres generated-recipe test environment;
- `supabase test db`/pgTAP;
- Basejump test helpers where they reduce setup;
- actual authenticated test users;
- owner/admin/editor/member/viewer/anonymous matrices;
- cross-org read/write/update checks;
- executed RLS results as recipe readiness/release evidence.

### 3.8D — Accessibility baseline — P0/P1

Move deterministic accessibility earlier:
- `@axe-core/playwright` in canonical generated-app browser acceptance;
- serious/critical fail gates first;
- representative desktop/mobile acceptance;
- later AI/manual review only for judgement axe cannot make.

### 3.8E — Genuine business acceptance — P0/P1

Complete Phase 3.6C with real material. Prioritize fixes exposed by the generated result over speculative factory infrastructure.

### 3.8F — MCP v2 service adapter — P1

Expose safe deterministic operations through MCP:

`Codex / ChatGPT / Claude Code / OpenCode -> MCP adapter -> apps/service -> factory/control-plane`

Initial tools:
- project create/read;
- Manifest/knowledge/composition reads;
- generate/recompose/verify;
- preview lifecycle;
- task/event/checkpoint/metric reads.

Do not initially expose:
- production deploy;
- production database writes;
- raw secrets;
- arbitrary paths;
- unrestricted shell execution.

MCP is an adapter, not project truth. Use the current MCP TypeScript v2 server package when implemented.

### 3.8H — Specialist agent architecture foundation ✅ Complete

Delivered as a bounded architecture/contract foundation, not as a running agent system:

- `AgentRoleSpec` contract and a registry of specialist roles separated by decision boundary;
- project-class routing so a marketing site, a SaaS build and an internal tool run different specialists;
- deterministic **no-self-approval** enforcement: creators cannot promote their own artifacts and reviewers own no mutation scope;
- `HandoffContract` semantics — a stage advances on artifacts, evidence, passed deterministic checks and an independent verdict, never on an agent declaring itself finished;
- typed `ReviewVerdict` rework with a named owning role, severity and failing criteria;
- a deterministic convergence engine that assesses every required gate, routes each failure to the creator role that owns it and stops only on convergence, a hard budget or a genuine block;
- bounded per-role context packets and per-role capability/route ceilings;
- a skill registry with an evidence-driven promotion lifecycle;
- an external-source registry where registration is explicitly not adoption.

Architecture: `docs/AGENT_SPECIALIST_ARCHITECTURE.md` and `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`.
Design-side artifacts: `docs/DESIGN_INTELLIGENCE.md`.

This stage adds no new orchestration framework. It is a tighter expression of the existing control plane, and it did not
close the then-outstanding Phase 3.8E genuine-business product gate — that gate was closed later, by the accepted run.

### 3.8I — Routing discipline and agent operating-system hardening ✅ Complete

An audit against internal prior art found that App Builder had the stronger factory/control-plane architecture but the weaker **development-agent operating system**. Routing discipline is far cheaper to establish before the specialist system grows large.

Delivered:

- `RoutingBenchmarkCase` contract plus a deterministic benchmark of representative prompts with **positive and negative triggers**, run by `npm run agent:bench`;
- deterministic task routes mapping bounded natural-language intent to roles, authorities and a small skill set, with `npm run agent:route -- "TASK"` printing the first-orientation packet;
- first-orientation ceilings for candidate paths, authorities, selected roles, selected skills and packet bytes;
- skill **load classes and budgets** so complementary lenses compose instead of competing;
- ambiguous prompts stay unclassified so the next step is bounded orientation rather than an expensive guess;
- seven new specialist roles — state matrix, journey closure, product opportunity scout, differential reviewer, independent second opinion, environment guardian and compound-learning closeout — with the artifact kinds they exchange;
- `state-completeness` and `journey-closure` as required convergence gates in every project pipeline;
- conditional review routing driven by a deterministic `RiskClassification`, so ordinary presentation work never pays for adversarial security review.

Roles remain `planned`. This stage defines decision boundaries, routing and budgets; authoring the skill packets and executing the roles is Phase 4 groundwork and Phase 5 runtime work.


### 3.8J — Executable architecture and deterministic risk classification ✅ Complete

Turns two Phase 3.8I planning items into enforced behaviour:

- `npm run architecture` makes the dependency direction in `AGENTS.md` a blocking CI gate across eleven zones and seven rules, with a cycle check. It parses module specifiers and declared dependencies, so prose mentioning a package is not a violation and a deep relative path cannot dodge a package-name rule. `dependency-cruiser` was evaluated and deliberately not adopted.
- `config/risk-surfaces.json` plus `packages/control-plane/src/risk.js` classify a declared ChangeSet deterministically and return the conditional reviewers it must buy. An ordinary presentation change buys none; an auth, RLS, secrets, billing, capability-policy or production-deploy change buys the differential reviewer, the security reviewer, the environment guardian or an independent second opinion as the surface requires.

Neither displaced the then-outstanding 3.8E genuine-business product proof, which was closed later by the accepted run.


### 3.8K — Launch readiness: making the new tooling serve the product ✅ Complete

3.8H–3.8J improved how agents work on the factory. This points that machinery at what the factory produces, which is what Phase 3.8E is actually judged on.

- `npm run audit:launch` audits composed output before a human reviews it, predicting meaningful manual edits in the same category vocabulary 3.8E records, each naming the specialist role that owns the fix;
- `StateMatrixSpec` and `JourneyClosureEvidence` are derived deterministically from composed output, ranked by user risk rather than enumerated combinatorially;
- missing evidence is counted separately from defects, so the prediction stays trustworthy;
- `config/factory-benchmarks.json` records a measured predicted-edit ceiling per canonical project type and `generate:acceptance` fails when generated product gets worse;
- the 3.8E evidence records the audit taken at handover and the validator reports it against the real edit count, including how far the prediction was off. It is recorded, not enforced: while the factory is still being built a genuine run is expected to start from a build that still has known findings, and refusing it would make the proof unrunnable.

---

## Phase 4 — Full Builder Console 🚧 In progress

Begins after Phase 3.8 P0 correctness gates are closed or explicitly dispositioned.

### Phase 4A — Real service-backed vertical slice

Build a complete useful loop before adding every editor feature:
- project create/open;
- adaptive intake;
- real source/file ingestion through the service;
- reviewed Build Contract;
- deterministic build trigger;
- real task/event progress;
- service-managed live preview;
- desktop/tablet/mobile preview;
- checkpoint/version visibility.

### Phase 4B — Direct editing and assets

- **Builder Element Identity** — resolve a rendered element to page/section/component/instance,
  content bindings, source location, editable properties, provenance and design tokens before any
  visual editing is enabled; a visual edit that cannot resolve to an ElementIdentity is refused;
- click-to-select through stable PageSpec/SectionSpec identity;
- click-to-edit content/assets/components through the resolved binding, not through DOM guesswork;
- preserve source-vs-generated provenance;
- **RenderedEvidence foundation** — screenshots, interaction states and responsive captures become a
  first-class artifact, because a compiling build is not evidence that a visual change is correct;
- asset manager and replacement/crop choices;
- section/component variant selection;
- Design Contract editing;
- versions/checkpoint restore.

### Phase 4C — Design System Registry ✅ Complete (4C.6 conditionally deferred; see `docs/PHASE_4C_EXECUTION.md`)

Use shadcn's registry architecture as prior art, not as mandatory generated-app infrastructure.

Maintain separate but related registries:

**Capability Registry** — auth, organisations, uploads, billing, analytics, search, etc.

**Presentation Registry** — buttons, forms, cards, navigation, hero, pricing, FAQ, proof/testimonials, tables, dashboards, empty/loading/error states and section patterns.

A presentation item should declare stable version, files/targets, dependencies, tokens, content-binding contract, accessibility, responsive behavior, interaction states, variants, template compatibility, managed ownership and acceptance examples.

Introduce `DesignSystemSpec` covering:
- typography/color/spacing/radius/shadow tokens;
- icon system;
- allowed primitives/components;
- section families/variants;
- responsive/interaction states;
- motion and imagery rules;
- accessibility constraints;
- reference adopt/avoid intent.

Add deterministic design-system linting before AI visual review.

Phase 4C also introduces the design-intelligence layer specified in `docs/DESIGN_INTELLIGENCE.md`:

- a versioned, deterministically queryable design-knowledge catalogue feeding BrandSpec and ArtDirectionPlan;
- a **Component Manifest Protocol** so agents retrieve a small relevant component set instead of a whole library;
- runtime-aware component contracts, so a correct import cannot produce a broken render;
- **DesignLint** — deterministic visual-defect rules that run before expensive AI critique;
- `DesignSystemSpec` that **compiles** to tokens, CSS variables, theme config and component parameters
  rather than merely instructing a model;
- machine-readable `ArtDirectionPlan` dimensions (layout variance, motion intensity, information
  density, visual distinctiveness, restraint) instead of prompt adjectives.

### Phase 4D — Visual direction, responsive composition and candidate promotion 🚧 In progress (see `docs/PHASE_4D_EXECUTION.md`; the canvas is deferred because the Console does the comparison)

Best-in-class visual workflow:
- structured reference analysis: screenshots, moodboards, existing sites and design references become
  adopt/avoid observations feeding ArtDirectionPlan, never uncontrolled generated markup;
- bounded candidate design/layout variants from the same product/content truth;
- visual comparison canvas/workspace;
- desktop/tablet/mobile and hover/active states;
- explicit promote/reject into durable Design Contract/SectionSpec state;
- acceptance/rejection evidence retained;
- no hidden unofficial project forks.

### Phase 4E — Environments and release controls

Introduce first-class `development`, `preview`, `production` environment identity before powerful release controls.

Each environment records/references:
- deployment target;
- backend/database identity and migration state;
- integration/secret configuration status;
- allowed operations;
- preview/release URLs;
- release/checkpoint identity.

Then add:
- integrations/secrets status and approval UI;
- tests/health/database/log views where safe;
- cost/trace view;
- preview/production deployment controls with approval gates.

### Transport framework decision

Evaluate Hono only if real Console/service work demonstrates meaningful route/request/response duplication. Even if adopted, `packages/contracts` remains authoritative.

---

## Phase 4.2 — Generated-Product Quality Expansion ⬜ Planned

### Static/content-oriented second template — 10/10

The initial React/Vite template proves the application-template contract but should not become the only architectural output.

Evaluate Astro first for a static/content-first renderer.

Default direction:
- marketing/content sites -> static/content-first template;
- SaaS/consumer/internal/AI apps -> application-oriented React template.

Requirements:
- same Manifest/PageSpec/SectionSpec inputs;
- output remains portable;
- independent check/build/browser acceptance;
- host adapters remain separate.

### Static semantic icons — 8/10

Use pinned Lucide static SVG assets at factory/build time:
- semantic reviewed mappings for common intents;
- copy/inline only selected SVGs;
- no `lucide-react` dependency by default;
- allow project DesignSystemSpec to override icon sources/mappings.

### Static search — 8.5/10

Use Pagefind for compatible marketing/content projects:
- build-time indexing;
- no backend requirement;
- PageSpec/CollectionSpec-aware records where useful;
- dynamic application search remains a separate recipe/adapter path.

### Rich structured data — 8.5/10

Upgrade the existing shallow `WebSite` JSON-LD baseline using trusted knowledge and typed structures.

Derive only when evidence supports:
- Organization;
- LocalBusiness;
- Service;
- Person;
- FAQPage;
- Article;
- BreadcrumbList;
- WebSite.

Use `schema-dts` or equivalent typed schema support and prefer build-time HTML output for static projects.

### Deterministic OG/social imagery — 8/10

Use:

`DesignSystemSpec + page metadata + brand assets -> Satori SVG -> existing Sharp -> social image`

Do not add a second SVG rasterizer unless Sharp proves inadequate.

---

## Phase 4.3 — Mature Website-Builder Capabilities ⬜ Planned

### CMS/content collections — 9.5/10

Introduce provider-neutral `CollectionSpec`:
- collection id/type;
- fields/validation;
- references/relationships;
- slug strategy;
- draft/published state;
- SEO mapping;
- locale support;
- editor/author metadata where required.

Storage may be local/static, Supabase or a future CMS adapter.

### Localization — 9/10

Introduce `LocaleSpec`:
- primary/fallback locales;
- localized routes/slugs;
- localized content/bindings;
- localized assets;
- metadata/OpenGraph/hreflang;
- translation/review state.

AI translation is optional implementation, never the architecture.

### Figma/design-system mapping — 9/10

- import relevant design/token/component references;
- map known design components onto registered production components;
- unmatched elements become explicit novel/custom work;
- preserve ordinary repo diffs/PR ownership.

### Existing-repository adoption — 9/10

Support improving existing repos:
- read project authorities/framework/design system/components/backend/deployment;
- build an adoption inventory;
- map compatible factory gates/capabilities rather than regenerating;
- manage only explicitly adopted files;
- preserve Git history/project conventions.

### Deterministic SEO/AEO scanner — 8.5/10

Before public deployment audit:
- title/description/canonical;
- sitemap/robots/indexability;
- heading hierarchy;
- alt text;
- structured data;
- internal links;
- OpenGraph/social assets;
- local-business/service evidence where relevant.

AI SEO advice remains optional after deterministic findings.

---

## Phase 4.5 — Pre-Agent Hardening ◐ Partly landed ahead of its place in the sequence

Before broad autonomous tools:
- complete deferred Phase 3.5C sandbox abstraction;
- rootless sandbox implementation;
- fail-closed network/resource/secret policies;
- production action approvals;
- dead/orphan integration detection;
- safe three-way recipe/presentation upgrades;
- re-run ChangeSet/contract/RLS/accessibility properties under the real execution environment.

Candidate tooling where justified:
- `Knip`;
- `git merge-file`;
- rootless Podman behind `ExecutionEnvironmentAdapter`;
- other security tooling only when it beats existing deterministic checks.

---

## Phase 5 — Low-Credit AI Orchestration + Dedicated Runtime ⬜ Planned

Purpose: add AI orchestration after the deterministic factory is demonstrably useful and safety boundaries are proven.

Build:
- deterministic task/context router driven by `config/agent-roles.json` and `config/agent-pipelines.json`;
- measured model router by task class/quality/cost, selected per role;
- compact trusted context packets built by `buildRoleContextPacket`;
- versioned `SKILL.md` specialist skills authored against `config/skill-registry.json` and promoted only on evidence;
- specialist roles executed in **disposable per-role sessions** rather than one long general-purpose session;
- durable stage handoffs, typed rework routing and convergence-driven stopping;
- machine-readable outputs/ChangeSets;
- bounded fix/work loops;
- provider-neutral `AgentRuntimeAdapter`;
- dedicated App Builder runtime on Hetzner separate from project-specific automation;
- OpenCode as initial runtime implementation, not product dependency;
- clean-session/context-loss recovery;
- isolated project/task workspaces and scoped secrets;
- browser/visual workflows;
- structured usage/cost traces.

MCP provides earlier interoperability but does not replace runtime scheduling, sandboxing, specialist routing, recovery or hard-budget enforcement.

---

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- model/task benchmark scoreboard;
- cheapest model that clears quality threshold, escalating only on failure;
- prompt/skill/model regression cases;
- hostile-source/prompt-injection suites;
- tool/permission-bypass cases;
- context leakage tests;
- second-opinion agreement/disagreement metrics;
- evaluate Promptfoo mainly where it improves adversarial coverage.

---

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

Expand the earlier deterministic gates into the full release-quality system:
- unit/integration/E2E;
- accessibility;
- security/dependency/secret checks;
- performance budgets;
- visual regression against Design Contract/DesignSystemSpec;
- mobile/tablet/desktop;
- empty/loading/error/large-data;
- slow/offline/failing-API;
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
- module/recipe/presentation-registry version inventory;
- reviewed upgrade propagation;
- three-way managed-file reconciliation;
- reusable pattern promotion workflow.

---

## Phase 7.5 — Experiments and Controlled Personalization ⬜ Later

After analytics, privacy and deployment identity are mature:
- versioned experiment contracts;
- controlled A/B traffic allocation;
- attribution and sample-boundary integrity;
- reviewed winner promotion;
- conversion evidence persisted into factory improvement state;
- personalization only when explicit, measurable, privacy-compliant and reversible.

---

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- manual-edit/rework cause analysis;
- question usefulness/default acceptance metrics;
- capability/presentation/section reuse metrics;
- token/cost/time/intervention metrics;
- design-variant selection evidence;
- experiment results where enabled;
- questionnaire/composer/recipe/template/design-system proposals;
- model/skill/router comparisons against accepted baselines;
- one-prompt scorecard only after the deterministic pipeline is genuinely useful.

No silent self-modification. Evidence creates a proposed, versioned, regression-tested change.

---

# 4. First-class project modes

1. **Marketing/business website** — public pages, company content, local SEO, leads, assets; future static-first default.
2. **B2B SaaS** — organisations, roles, data, admin, uploads, integrations, optional billing/custom work.
3. **Consumer app** — accounts, profiles, engagement, notifications and optional PWA/custom work.
4. **Internal tool** — authenticated workflow/data interfaces with minimal public surface.
5. **Content site** — publishing/CollectionSpec structures, static search, SEO, analytics and localization where requested.
6. **AI-first app** — structured AI capability with budgets, evaluations and fallbacks.

Additional project types are added only when requirement/composition/architecture defaults are materially different.

---

# 5. Target build lifecycle

`Input -> Intake -> Build Contract -> Approval -> Manifest -> Ingest/Knowledge Pack -> Deterministic Composition -> Template/Recipe/Presentation Resolution -> Deterministic Generation -> Novel AI Work -> Deterministic QA -> Targeted AI Review -> Preview/Direct Edit/Variant Selection -> Approval -> Production -> Monitor/Experiment -> Improve Factory`

Structured state is persisted at every material transition.

---

# 6. Cost and usefulness targets

For ordinary business websites, directionally target **~90% deterministic/reusable and ~10% generative** once mature.

For custom SaaS applications, directionally target **~60–75% deterministic/reusable and ~25–40% generative**.

Do not optimize percentages at the expense of quality. Stronger metrics are:
- meaningful manual edits before acceptable launch;
- deterministic gates passed without intervention;
- reusable recipe/component/template coverage;
- AI cost/tokens per accepted outcome;
- elapsed work;
- number and cause of retries/interventions.

The first genuine real-business acceptance target remains fewer than **20 meaningful manual edits**.

---

# 7. What "finished" means

App Builder can absorb capability indefinitely, so "finished" has to be bounded or it moves forever.
It is bounded in three parts: a **finished core product**, an **evidence-earned maturity tier per project
class**, and an explicit list of **later expansion that does not block v1**. Sequencing between them is
`docs/ROADMAP.md`; this section is what those steps are aiming at.

## 7.1 The finished core product (v1)

v1 is finished when a real project can go end to end through all of the following, and the evidence says
it does so at the declared quality:

- **idea/source intake** — an idea plus optional company material, with adaptive intake catching
  high-impact requirements before coding;
- **Build Contract** — approved, machine-readable, preserving the real product intent, with buildability
  decided before generation;
- **trusted ingestion and provenance** — source material becomes a trusted knowledge pack; facts keep
  provenance and never silently become claims;
- **deterministic composition** — sensible routes, pages and screens bound to trusted content;
- **appropriate renderer selection** — a template chosen for the project rather than one shell forced on
  every project, which requires at least two genuinely different renderers to exist;
- **premium design and art direction** — a coherent compiled design system, more than one visual answer,
  and a promotion decision that is recorded rather than assumed;
- **source and asset rights** — rights, approval and use state resolved per asset, never inferred from
  public visibility;
- **portable generated repository** — an ordinary repository that clones, installs and builds with no App
  Builder dependency;
- **Builder Console preview, edit and version flow** — preview, direct edit with provenance, durable
  versions and checkpoint restore;
- **core deployment** — a generated project reaches a real environment through the product, with explicit
  environment identity;
- **deterministic QA** — correctness, security, accessibility and launch-readiness gates run before any
  expensive AI review;
- **real-business evidence** — the varied corpus in `docs/GENUINE_BUSINESS_ACCEPTANCE.md`, not one
  accepted run and not a synthetic fixture;
- **bounded agent-assisted novel work** — AI used where deterministic systems genuinely cannot resolve
  novelty, inside declared ChangeSets and hard budgets;
- **safe runtime boundaries** — sandboxed execution, deny-by-default capabilities and no self-approval;
- **cost and intervention visibility** — AI/tool cost, elapsed work, retries and human interventions
  visible per project rather than reconstructed afterwards.

Everything on that list has a home elsewhere in this repository. Nothing is added to it because it sounds
impressive, and nothing is removed from it to make v1 arrive sooner.

## 7.2 Class maturity — what v1 claims, per project class

v1 finished does not mean every project class is equally proven, and a class must not look proven merely
because a recipe or template exists for it. Each class carries a tier earned from recorded evidence. The
vocabulary is machine-readable and applies to project classes and capability families:

- **proven** — material real-project evidence shows the class routinely performs at the declared quality and intervention target;
- **supported** — known architecture, recipes and representative acceptance, but not enough corpus evidence for a "normally excellent" claim;
- **assisted-engineering** — the factory can architect and implement the class, but substantial specialist and human judgement is expected;
- **experimental** — novel or insufficiently proven; explicit approval and custom engineering required.

Maturity should influence autonomy, model/tool budget, verification depth, required human review, the confidence the Console shows and whether one-prompt quality claims are permitted. It is earned from recorded evidence and may regress when a benchmark exposes deterioration; a canonical synthetic app passing build and tests never promotes a class to `proven`. This tier vocabulary is the evidence-earned complement to the per-request supported-vs-custom classification in `docs/VISUAL_EXCELLENCE.md` §10, not a second system.

**No class is claimed at any tier today.** The corpus is what will earn the first ones.

## 7.3 Later expansion — outside v1 by decision

These are wanted, planned or plausible, and none of them blocks a finished core product. Putting them
here is what stops "finished App Builder" meaning "every conceivable software-building feature has
shipped":

- native mobile applications — a separate project class with its own contracts for permissions,
  notifications, device capabilities, deep links, offline state, secure storage, signing, store metadata
  and device testing, never the `consumer-app` web class relabelled;
- a large connector marketplace beyond the small set of integrations the factory claims as first-class;
- generated applications exposed as agent-accessible products (generated-app MCP/API);
- enterprise SSO and organisation-scale identity;
- broad marketplace and ecommerce depth;
- advanced experimentation and personalisation;
- the complex-application class at `proven`, whose bar is `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.

This bounds the product. It does not lower the bar: the core product list above is not negotiable, and a
class stays at the tier its evidence earns.

## 7.4 The original v1 success statement

Retained because it is what the earlier stages were measured against, and because 7.1 is its successor
rather than its replacement. App Builder v1 is successful when:
- a real project starts from an idea plus optional company/source material;
- adaptive intake catches high-impact requirements before coding;
- approved contracts preserve the real product intent;
- buildability decisions are known before generation;
- source material becomes a trusted knowledge pack;
- deterministic composition creates sensible routes/pages/screens and binds trusted content;
- an appropriate template is selected rather than forcing every project through one shell;
- a portable repository is generated;
- generic capabilities come from proven recipes;
- presentation follows a coherent design-system contract;
- the result can be previewed, edited, versioned and deployed through service/Console;
- automated correctness/security/accessibility/quality gates run before release;
- multiple coding clients can call safe deterministic factory operations through an interoperable adapter without becoming project truth;
- one genuine business build reaches acceptable launch quality with fewer than 20 meaningful manual edits (passed 2026-08-26 at 0 edits; the corpus in 7.1 is what turns it into repeatable evidence);
- project evidence feeds reviewed/versioned improvements.

Best-in-class capabilities such as CMS, localization, Figma mapping, existing-repo adoption and experiments may mature after the first useful v1 vertical slice, but their architecture is now planned so Phase 4 does not paint the system into a corner.

---

# 8. Sequencing

The ordered path from the current state to a finished core product is maintained once, in
`docs/ROADMAP.md`. This document deliberately keeps no second execution queue: an execution order that
lives in two places is an execution order that disagrees with itself as soon as one stage closes.

`config/factory-status.json` remains the machine-readable authority for what is current, complete and
outstanding.
