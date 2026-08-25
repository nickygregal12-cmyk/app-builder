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

Detailed capability findings and adoption rules live in `docs/BEST_IN_CLASS_CAPABILITIES.md`.

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

### 3.5C — Sandbox/trace implementation ⏸ Deferred

Resume immediately before powerful autonomous execution in Phase 5.

Deferred:
- `ExecutionEnvironmentAdapter`;
- first rootless/disposable sandbox;
- resource/network/secret limits;
- preview/artifact interface;
- OTel-compatible trace export mapping;
- hard production write/deploy approval boundary.

---

## Phase 3.6 — Requirements-to-Product Composition ✅ Core complete, product proof still open

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

### Phase 3.6C — Real-business acceptance ⚠️ Synthetic regression exists; genuine gate outstanding

Keep the current Acme mixed-source fixture as a deterministic regression case.

Still required:
- genuine existing business URL;
- genuine PDF/document material;
- genuine logo/photographs/assets;
- real intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview/deploy;
- visual/product quality review;
- meaningful manual edits counted and categorized;
- AI calls/tokens/cost, elapsed work, retries/interventions and quality failures recorded.

Initial target: **fewer than 20 meaningful manual edits before launchable quality**.

This remains an honest product gate even though later service infrastructure has already been built.

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

## Phase 3.8 — Product Proof and Correctness Hardening 🚧 Active

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

This stage adds no new orchestration framework. It is a tighter expression of the existing control plane, and it does not
close the outstanding Phase 3.8E genuine-business product gate.

---

## Phase 4 — Full Builder Console ⬜ Planned

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

### Phase 4C — Design System Registry

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

### Phase 4D — Visual canvas and controlled variants

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

## Phase 4.5 — Pre-Agent Hardening ⬜ Planned

Before broad autonomous tools:
- complete deferred Phase 3.5C sandbox abstraction;
- rootless sandbox implementation;
- fail-closed network/resource/secret policies;
- production action approvals;
- dead/orphan integration detection;
- CSP baseline in deployment adapters;
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

# 7. Definition of a successful v1

App Builder v1 is successful when:
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
- one genuine business build reaches acceptable launch quality with fewer than 20 meaningful manual edits;
- project evidence feeds reviewed/versioned improvements.

Best-in-class capabilities such as CMS, localization, Figma mapping, existing-repo adoption and experiments may mature after the first useful v1 vertical slice, but their architecture is now planned so Phase 4 does not paint the system into a corner.

---

# 8. Immediate execution order

1. **Close ChangeSet path-scope correctness** and add property tests.
2. **Unify schema/types/runtime validation** around canonical schemas + generated contracts + Ajv.
3. **Add executed Supabase RLS acceptance** using local Supabase/pgTAP test users.
4. **Add the axe accessibility baseline** to generated-app browser acceptance.
5. **Run the genuine Phase 3.6C business build** and record meaningful edits/cost/time/interventions.
6. **Add the MCP v2 adapter** over the existing service tool boundary.
7. Begin **Phase 4A service-backed Console vertical slice**.
8. In parallel only where it directly improves generated output, prove the **static/content second template** and its Pagefind/structured-data/social-image path.
9. Build the **Design System Registry + DesignSystemSpec + Component Manifest + DesignLint** before scaling AI-generated visual variation, and land **Builder Element Identity** before enabling direct manipulation.
10. Complete environments/direct editing/visual variants, then mature CMS/localization/Figma/existing-repo adoption.
11. Complete sandbox/security hardening before broad autonomous agents.
12. Add the Hetzner/OpenCode runtime and low-credit AI orchestration only after deterministic product/safety boundaries prove useful.

`AGENTS.md` remains the root engineering authority. `docs/AGENT_SPECIALIST_ARCHITECTURE.md`, `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` and `docs/DESIGN_INTELLIGENCE.md` are detail documents under these authorities and never override them. Schemas/config are machine-readable authorities for their contracts; `config/factory-status.json` is the machine-readable delivery status. `docs/BEST_IN_CLASS_CAPABILITIES.md` records the reviewed capability recommendations and explicit non-adoptions.