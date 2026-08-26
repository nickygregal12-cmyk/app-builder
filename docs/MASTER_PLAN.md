# App Builder — Master Delivery Plan

## 1. Product goal

App Builder is a private, AI-first website and application factory for personal use. Its job is to turn rough real-world input into a tested, portable project while spending as little AI credit as practical.

The target end-state is:

1. provide an idea, company details, an existing URL, documents, spreadsheets, screenshots, logos, images, design references and/or an existing repository;
2. answer an adaptive set of questions;
3. review a concise Build Contract before expensive build work starts;
4. normalize source material into trusted structured knowledge with provenance;
5. deterministically compose real routes/pages/screens, content bindings and collections from approved requirements and trusted knowledge;
6. let templates, capability recipes, presentation registries and deterministic tools create everything already solved by the factory;
7. use AI only for genuinely novel product, design, content or engineering work;
8. run deterministic correctness/security/accessibility/quality gates first, then targeted AI review where useful;
9. preview, visually compare, directly edit, version and deploy from the Builder Console;
10. keep generated applications as ordinary repositories with no App Builder, MCP or agent-runtime lock-in;
11. expose deterministic factory operations through provider-neutral service/tool contracts so multiple coding clients can use the same factory;
12. let durable tasks/checkpoints survive model/session/browser interruption;
13. feed evidence from completed real projects back into reviewed, versioned improvements to questionnaires, composition, recipes, presentation, design systems, routing and model choice.

Core rule: **never spend AI tokens solving a problem the factory already knows how to solve deterministically.**

Second rule: **do not build more infrastructure while existing subsystems are not joined into a useful end-to-end product.**

Third rule: **do not scale autonomous or visual-builder surface area on top of unproven contract/security boundaries.**

Fourth rule, added after the August 2026 clean-room audit: **once the minimum visual/output foundation is in place, stop expanding the architecture and force it through real projects until evidence proves what actually needs to change.**

That fourth rule corrects a real delivery risk: architecture/control-plane maturity is now ahead of the amount of real-world product proof. The response is not to discard the architecture; it is to make architecture earn its next extension through output evidence.

Supporting authorities:
- sequencing: `docs/ROADMAP.md`;
- product-proof freeze/maturity/corpus: `docs/PRODUCT_PROOF_PROGRAMME.md`;
- deterministic engineering gates: `docs/ENGINEERING_QUALITY_PROGRAMME.md`;
- premium visual programme: `docs/VISUAL_EXCELLENCE.md`;
- design intelligence: `docs/DESIGN_INTELLIGENCE.md`;
- professional completeness: `docs/PRODUCTION_COMPLETENESS.md`;
- control plane: `docs/FACTORY_CONTROL_PLANE.md`;
- agent runtime: `docs/AGENT_RUNTIME.md`;
- machine-readable delivery truth: `config/factory-status.json`.

---

## 2. Operating principles

### Deterministic first

Schemas, generated types, validators, templates, registries, recipes, composers, generators, database tests, static analysis, accessibility tests, image tooling and deployment scripts do repeatable work. AI handles ambiguity, novelty and judgement.

### One machine-readable contract authority

Where a stable JSON Schema exists, it is canonical. Shared TypeScript types and runtime validation derive from it rather than re-encoding enums/rules independently.

Structural validity and buildability remain separate: valid intent may request a capability the current factory cannot yet implement deterministically.

### Requirements before code

No substantial build starts while high-impact requirements or capability-readiness decisions remain unresolved. Intake produces a reviewed Build Contract first.

### Preserve requirements; recipes are implementations

A requested capability is product intent. A ready recipe is one implementation. Manifest/Build Contract preserve intent even when no ready recipe exists, while generated modules fail closed.

### Trusted facts stay facts

Source-backed facts retain provenance. Generated copy is separate and may not silently invent or strengthen factual claims.

### Capability reuse and presentation reuse are separate

Auth, organisations, uploads, email, billing, analytics etc. belong in capability recipes.

Visual/product presentation belongs in versioned presentation components/sections governed by Design Contract/DesignSystemSpec/BrandSpec/ArtDirectionPlan.

### Small context packets

Agents receive only the authority, artifacts, files, skills and evidence their task/role needs. Whole-repository reads are exceptional.

### Routing discipline scales with capability

More AI requires **stronger routing discipline**, not more loaded tools.

Target:

`task -> deterministic route -> minimal authorities -> minimal complementary skills -> specialist -> structured artifact -> independent review when required -> executable evidence -> typed rework -> convergence`.

Never:

`load everything -> giant context -> one general agent -> self-review -> declare done`.

### Sessions are disposable; project state is durable

A chat/model session is never project truth. Tasks, events, ChangeSets, git/worktree state, checkpoints, attempt summaries, evidence and budgets must let a clean session continue later.

Provider exhaustion, server restart and browser closure are expected conditions, not catastrophic failure modes.

### Portable outputs

Generated apps remain ordinary repositories maintainable without Builder Console, MCP, App Builder runtime or OpenCode.

### Evidence-driven improvement

The factory may propose improvements from project evidence. It never silently self-modifies.

### Cost and intervention are product requirements

Track AI/tool spend, elapsed work, retries and human intervention. Meaningful manual edits before launch are a primary product metric.

### Environment identity is explicit

Development, preview and production must have explicit identities before powerful deploy/database controls exist. Never infer environment from context.

### Product maturity is evidence-based

Synthetic canonical apps prove regression stability, not customer-ready maturity. Project classes advance through maturity only from real project evidence.

---

# 3. Delivery milestones

## Phase 0 — Foundation ✅ Complete

Delivered:
- root engineering authority;
- App Factory Engine / Builder Console boundary;
- project-type/module registries;
- Project Manifest and Build Contract foundations;
- adaptive questionnaires;
- deterministic skeleton;
- credit/context rules;
- contamination guard;
- CI/doctor/tests/typecheck/lint;
- initial Console shell.

## Phase 1 — Adaptive Intake and Build Contract ✅ Complete

Delivered:
- Quick / Standard / Thorough modes;
- conditional/versioned questionnaires;
- company/business intake;
- source-reference inventory;
- blocker/ambiguity follow-up;
- reviewed Build Contract;
- local save/resume/export;
- feedback/evidence records;
- browser acceptance.

## Phase 2 — Deterministic Project Generator and Recipes ✅ Complete

Delivered:
- template/recipe/adapter contracts;
- neutral standalone React/TypeScript/Vite application template;
- deterministic planning/materialisation;
- fail-closed capability readiness;
- dependency/conflict resolution;
- recipe reconciliation;
- Supabase/Netlify foundations;
- core auth/profile/org/admin/upload/analytics/observability/lead/SEO foundations;
- design-token/scenario groundwork;
- handover/provenance;
- standalone/byte-stability checks.

The original React/Vite template is an engineering baseline, not a claim that every website/application should use the same renderer/presentation system.

## Phase 3 — Company, Content and Asset Intelligence ✅ Complete

Delivered:
- bounded URL/existing-site intake;
- document/spreadsheet/text extraction;
- trusted knowledge pack;
- provenance/confidence/verification;
- generated-copy separation;
- image/logo/screenshot inventory;
- optimisation/responsive variants;
- duplicate/low-resolution signals;
- observed brand/reference inputs;
- SEO/local-business inputs;
- content-addressed caching;
- bounded AI-context chunks;
- synthetic mixed-source acceptance.

Existing brand observations feed later `BrandSpec`; do not create a parallel brand extraction system.

## Phase 3.5 — Factory Control Plane ✅ Foundation complete

Delivered:
- durable tasks/loop guards;
- append-only JSONL Build/Event Ledger primitive;
- ChangeSet scope validation;
- checkpoints/resume packets;
- source trust/instruction-authority boundary;
- deny-by-default capability policies;
- provider-neutral control-plane package;
- benchmark/upgrade foundations;
- machine-readable factory status;
- specialist-role/handoff/convergence foundations.

Deferred to Phase 4.5 immediately before real autonomous workers:
- `ExecutionEnvironmentAdapter`;
- rootless/disposable task sandbox;
- network/resource/secret enforcement;
- trace/export mapping;
- production action enforcement.

## Phase 3.6 — Requirements-to-Product Composition ✅ Core complete

Delivered:
- Manifest/Build Contract v2 intent preservation;
- PageSpec/SectionSpec/content-binding contracts;
- deterministic information architecture/composition;
- trusted knowledge consumption;
- source/entity provenance;
- explicit fallback/generated content;
- multi-page navigation/rendering;
- independent generated-app build acceptance.

### Phase 3.6C / 3.8E — genuine real-business acceptance ⚠️ Active product gate

Synthetic fixtures remain regressions only.

Required real evidence:
- real public company website;
- approved genuine supplied material;
- replayable approved intake;
- intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview/evidence;
- source/artifact hashes that match what the Factory really used;
- launch-readiness prediction;
- genuine human product review;
- meaningful manual edits counted/categorized;
- cost/time/retries/interventions recorded.

Initial target: **fewer than 20 meaningful manual edits before launchable quality**.

Mature mainstream-site target later: median **<=5** meaningful edits and a growing untouched-launch share.

## Phase 3.7 — Factory Service and Real Ledger Integration ✅ Core complete

Delivered:
- private/local service workspace;
- durable projects/tasks/events/checkpoints;
- server-owned workspaces;
- Manifest/knowledge/composition reads;
- generate/verify/preview lifecycle;
- integration status without secret values;
- provider-neutral tool descriptor;
- JSONL event evidence + SQLite read projection;
- portability checks.

Follow-up before broad concurrency: make ledger -> projection recovery explicit through sequence, reconciliation and rebuild evidence.

## Phase 3.8 — Product Proof and Correctness Hardening 🚧 Active

Delivered/substantially delivered:
- 3.8A ChangeSet file-scope correctness;
- 3.8B schema/type/runtime contract unification;
- 3.8C executed Supabase/RLS acceptance;
- 3.8D accessibility baseline;
- 3.8F bounded MCP adapter;
- 3.8H specialist-agent architecture foundation;
- 3.8I routing/context discipline;
- 3.8J executable architecture/risk classification;
- 3.8K launch-readiness/state/journey product checks.

### 3.8E — genuine business acceptance

Complete the NBM run through the real product and prioritize reusable defects it exposes over speculative infrastructure.

The approved NBM baseline is replayable. The original historical intake was never persisted and is unrecoverable; the versioned replacement baseline is the comparison authority for later reruns, not a reconstructed claim about the lost original.

The gate stays open until the real crawl/source evidence and human product review are complete.

### 3.8F / issue #71 — bounded OpenCode/MCP lane ✅ Readiness proof complete

The supported OpenCode -> MCP -> Factory path has been exercised on the real Hetzner host. OpenCode 1.18.14 reports `app-builder connected`; the hosted smoke passed and durable evidence was written under `/srv/app-builder/artifacts/`.

This proves transport/surface, not broad autonomy. Issue #55 remains the security boundary before workers with shell/network authority become runtime-ready.

---

# Phase 4 — Builder Console and Product Presentation

Phase 4A/4B were built alongside 3.8E because the genuine proof must run through the product, not a side CLI.

## Phase 4A — service-backed vertical slice ✅ Complete

Delivered:
- create/open project;
- adaptive intake/Build Contract;
- service-owned source ingestion;
- source governance;
- deterministic build;
- durable progress/events;
- service preview;
- desktop/tablet/mobile switching;
- checkpoint/version history.

## Phase 4B — direct editing and assets ✅ Core delivered

Delivered across slices:
- Builder Element Identity;
- click-to-select;
- provenance-aware text editing/durable overrides;
- RenderedEvidence;
- asset rights/governance;
- crop/focal-point/review;
- asset replacement lineage;
- section presentation variants;
- Design Contract editing;
- Product Opportunity Scout;
- source/asset state visibility.

Deferred until real generation consumers exist:
- generated-vs-supplied image alternatives;
- generation-forward asset modes;
- image-generation adapter.

## Phase 4C — Design System Registry, BrandSpec and Art Direction ⬜ First post-3.8E visible-quality stage

Use shadcn-style registry architecture as prior art, not mandatory generated-app infrastructure.

Maintain separate registries:
- **Capability Registry** — auth, orgs, uploads, billing, analytics, search, integrations etc.;
- **Presentation Registry** — primitives/components/sections/patterns/states.

### `DesignSystemSpec`

Cover and compile into actual output:
- typography/colour/spacing/radius/shadow;
- icons;
- allowed primitives/components;
- section families/variants;
- responsive/interaction states;
- imagery/motion rules;
- accessibility constraints.

### `BrandSpec`

Ground in supplied/observed evidence:
- palette/logo;
- typography intent;
- imagery/icon language;
- tone/voice;
- brand adjectives/anti-adjectives;
- source/confidence;
- source-vs-generated asset policy.

### `ArtDirectionPlan`

Sit above SectionSpec and represent:
- layout variance;
- motion intensity;
- information density;
- visual distinctiveness;
- restraint;
- narrative/attention sequence;
- page tempo;
- hero strategy;
- imagery/editorial/product/UI emphasis;
- distinctive moments;
- desktop/mobile intent;
- conversion emphasis.

### `MotionContract`

Define entrance/scroll/transition/interaction motion, limits, mobile reductions, reduced-motion behaviour and no-motion zones.

### Design intelligence and component manifests

- versioned deterministically queryable design catalogue;
- Component Manifest Protocol for small relevant retrieval;
- runtime-aware component contracts;
- DesignLint before model critique;
- no declaration without a real consumer.

Minimum exit proof before the product-proof freeze: at least one real generated site is materially driven by these contracts rather than the neutral default alone.

## Phase 4D — visual comparison and controlled directions ⬜ Immediately after minimum 4C

Required minimum:
- 2–4 genuinely different candidate art directions from the same truth;
- not colour/radius swaps;
- responsive comparison;
- explicit promote/reject;
- promoted direction becomes durable design state;
- rejected variants do not remain unofficial forks;
- at least one appropriate distinctive visual moment for premium marketing work;
- curated visual regressions over a small approved set;
- genuine independent visual review only when a different eligible model/runtime actually runs.

## Phase 4.2 — generated-product/static renderer proof ⬜ Before the product-proof freeze

Prove the renderer abstraction with a genuinely different static/content output. Evaluate Astro first.

Default direction:
- marketing/content -> static/content-first;
- SaaS/consumer/internal/AI -> application-oriented React renderer.

Priority additions:
- pinned static Lucide SVG pipeline, not `lucide-react` by default;
- Pagefind for compatible content-heavy builds;
- evidence-backed typed JSON-LD;
- deterministic OG/social images;
- page metadata/canonical/sitemap/robots;
- deterministic asset suitability/duplicate/undersized/bad-crop detection.

Do not wait for every mature website feature before beginning the corpus.

---

# Product-Proof Freeze — first 10 real businesses ⬜ Required evidence checkpoint

After minimum 4C + 4D + 4.2, temporarily freeze speculative architecture and execute `docs/PRODUCT_PROOF_PROGRAMME.md`.

The first corpus should deliberately include very different businesses, not ten brochure-site variations. Suggested coverage:

1. local trade/project photography/quote conversion — MGB Decor is the planned first example;
2. professional consultancy/restrained credibility — NBM is the first example;
3. restaurant/hospitality conversion;
4. trust-heavy professional service;
5. hotel/high-imagery project;
6. text-heavy professional services;
7. charity/community;
8. catalogue/ecommerce-adjacent;
9. editorial/content-heavy;
10. unusual premium brand that challenges default visual patterns.

Freeze/replay approved inputs for benchmark projects.

Track:
- first-build success;
- launchability;
- predicted vs actual edits;
- edit categories;
- unsupported/incorrect claims;
- missing source-backed content;
- imagery/crop failures;
- generic/repetitive sections;
- mobile/visual quality;
- journey failures;
- accessibility/performance/SEO/security where relevant;
- cost/time/retries/interventions;
- art-direction acceptance;
- owner/stakeholder reaction.

During the freeze, normally implement only:
- reusable defects exposed by the corpus;
- deterministic checks for real repeated failures;
- security/data-loss/durability blockers;
- measured cost/latency/intervention improvements.

The corpus later grows toward 30–50 real projects in Phase 8.

## Project-class maturity tiers

Introduce machine-readable maturity rather than treating six project labels as equally proven:

- **Proven** — material real-project evidence shows routine high-quality/low-intervention performance;
- **Supported** — known renderer/architecture/recipes and representative acceptance;
- **Assisted engineering** — substantial specialist/human judgement expected;
- **Experimental** — novel or insufficiently proven.

Maturity affects autonomy, model/tool budget, verification depth, human gates, Console confidence and one-prompt claims.

Synthetic canonical success cannot promote a class to Proven.

## Anti-template diversity diagnostic

Measure similarity between unrelated builds using section/component sequence, hero family, density, typography, CTA structure, motion and other useful structural/visual signals.

Start advisory. Baseline before setting thresholds. Retire generic patterns rather than injecting uncontrolled randomness.

## Competitive bake-off

After the internal corpus stabilises, compare identical frozen inputs with relevant current builders and blind-score where practical:
- first output;
- visual distinctiveness;
- factual accuracy;
- mobile/functionality;
- accessibility/performance;
- manual edits;
- elapsed time/cost;
- portability;
- provenance/rights discipline where comparable.

Benchmark claims; do not chase every competitor feature.

---

## Phase 4E — environments, integrations and release controls ⬜ Planned

Introduce explicit development/preview/production identity before powerful release controls.

Each environment records/references:
- deploy target;
- backend/database identity/migration state;
- integration/secret configuration status;
- allowed operations;
- preview/release URL;
- repository/deployed revision;
- rollback target.

Then add integrations/secrets status, health/log views, cost/trace and preview/production controls with approvals.

### First-class `IntegrationSpec`

For serious applications, represent where applicable:
- provider/capabilities;
- auth type/OAuth scopes;
- webhook events/verification;
- sandbox/production credential identity without secret values;
- rate limits;
- retry/idempotency;
- data classes accessed;
- secret requirements;
- health check;
- test fixture;
- environment availability.

Build a small proven adapter set before a marketplace/catalogue.

Provider-neutrality is proven by real second implementations, not interface names alone. The static renderer is the first such proof; later backend/deployment alternatives should be added only when they validate a real abstraction or meet a real project need.

## Phase 4.3 — mature website-builder capabilities ⬜ Planned from evidence

Candidate capabilities:
- provider-neutral `CollectionSpec` / CMS structures;
- `LocaleSpec` localization;
- Figma/design-system mapping;
- existing-repository adoption preserving Git history;
- deterministic SEO/AEO scanner;
- streamed/resumable source upload transport when measured file sizes justify it.

Do not complete this whole list before the ten-project proof merely because it is planned.

## Phase 4.5 — Pre-Agent Hardening ⬜ Required before real autonomous workers

Before a worker gets shell/network authority, close issue #55 and deferred 3.5C.

Required invariant:

`task policy -> scoped operation capability -> trusted runtime/broker -> approved Factory operation`

not:

`agent shell -> curl 127.0.0.1:4310 -> richer internal Factory route`.

Required:
- rootless/disposable task sandbox;
- host/private-network isolation;
- scoped task/attempt identity/capability grants;
- operation-level capability mapping;
- `approvalRequired` enforced before dispatch;
- resource/secret restrictions;
- adversarial bypass tests;
- no public service exposure;
- re-run ChangeSet/contract/RLS/accessibility/security properties under the real runtime.

OpenCode client permission settings are defence-in-depth, not the boundary.

---

## Phase 5 — Low-Credit AI Orchestration + Dedicated Runtime ⬜ Planned

Purpose: add AI execution after deterministic product/safety boundaries are useful and enforced.

Build:
- deterministic task/context router driven by existing role/pipeline registries;
- measured model router by task class/quality/effective cost;
- compact trusted context packets;
- versioned skills promoted only on evidence;
- disposable per-role sessions;
- durable stage handoffs/rework/convergence;
- machine-readable outputs/ChangeSets;
- bounded loops;
- provider-neutral `AgentRuntimeAdapter`;
- OpenCode as initial implementation, not product dependency;
- isolated project/task workspaces;
- browser/visual workflows;
- structured usage/cost traces.

### Durable worker execution

Long build/verify/model work must survive an HTTP/client/browser disconnect:

`Factory API -> durable job scheduler -> ExecutionEnvironmentAdapter -> isolated worker -> durable progress/events/result`.

Start with a small worker/process layer. Do not adopt Temporal/LangGraph without measured need.

### Provider Capacity / Entitlement Broker

Represent per provider/runtime where observable:
- subscription/free/included-credit/API/local entitlement;
- availability;
- quota/reset signal;
- cash cost;
- quota scarcity/shadow cost;
- task-class quality;
- context/tool capability;
- independence family;
- fallback eligibility;
- paid-overage permission.

Required durable states include equivalents of:
- waiting-for-capacity;
- provider-exhausted;
- fallback-selected;
- paused-by-budget;
- waiting-for-human-approval;
- retryable/interrupted.

Routing target:

`deterministic -> proven free/cheap model -> premium model when needed -> genuinely independent reviewer when valuable -> paid API only when authorised`.

A provider limit must checkpoint/handoff/wait; it must not freeze or lose the page/task.

### Git-native task history

Move generated-project evolution toward:

`main -> factory/task-<id> -> bounded change -> tests -> review -> checkpoint -> promote/merge`.

Git records **what changed**. Factory events/checkpoints record **why/how/under which task/policy/evidence/model/budget**.

### Ledger/projection reconciliation

If JSONL remains authoritative and SQLite a read projection, add monotonic sequence, idempotent projection, startup catch-up and rebuild proof (`npm run ledger:rebuild` or equivalent). A crash between append and projection insert must not leave permanent dual truth.

### Production data-change safety

Before autonomous live database mutation introduce a machine-readable safety contract covering:
- additive/destructive/backfill/contract classification;
- compatibility;
- row impact;
- backup/restore evidence;
- deployment ordering;
- app/schema/data rollback or forward-repair;
- partial-deploy behaviour;
- `EnvironmentIdentity`;
- approval.

Prefer `expand -> migrate/backfill -> verify -> contract` for high-risk changes.

MCP provides interoperability but does not replace scheduler, sandbox, capability enforcement, specialist routing, recovery or hard budgets.

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- model/task benchmark scoreboard;
- cheapest model that clears quality threshold;
- free-model candidates benchmarked before use on production task classes;
- prompt/skill/model regressions;
- hostile-source/prompt-injection suites;
- tool/permission bypass cases;
- context leakage tests;
- second-opinion agreement/disagreement metrics;
- controlled skill comparison before promotion;
- image-provider quality/cost/rights benchmarking where applicable.

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

Expand deterministic gates into full release quality:
- unit/integration/E2E;
- accessibility;
- security/dependency/secret checks;
- performance budgets;
- visual regression against BrandSpec/ArtDirectionPlan/DesignSystemSpec/MotionContract;
- mobile/tablet/desktop;
- relevant empty/loading/error/large-data/offline/provider-failure states;
- AI review only after deterministic checks;
- bounded corrections;
- deployment smoke tests.

Professional completeness is conditional: implement/prove every **relevant** state/journey, not a universal checklist of skeletons/toasts/modals.

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/TLS;
- redirects/canonical/sitemap/robots;
- analytics/observability;
- feedback;
- launch readiness;
- production smoke/health;
- post-launch audit;
- handover;
- recipe/presentation version inventory;
- reviewed upgrade propagation;
- three-way reconciliation;
- approved asset/rights report;
- small proven integration set.

## Phase 7.5 — Experiments and Controlled Personalization ⬜ Later

After analytics/privacy/deployment identity are mature:
- versioned experiment contracts;
- controlled traffic allocation;
- attribution/sample integrity;
- reviewed winner promotion;
- conversion evidence;
- reversible privacy-compliant personalization.

## Phase 8 — Evidence-Driven Factory Improvement and Gold Standard ⬜ Planned

The initial ten-business freeze grows toward roughly **30–50 varied real-world projects** spanning mainstream websites and later complex applications.

Track:
- first-build success;
- meaningful edits and edit cause;
- untouched-launch share;
- factual/source accuracy;
- visual/mobile quality;
- accessibility/performance/SEO/security;
- journey completion;
- time/cost/interventions;
- art-direction acceptance;
- asset/image failures;
- model/skill/router version outcomes.

Use the corpus to:
- improve questionnaires/composer/recipes/presentation;
- promote project classes through maturity tiers;
- retire generic/weak visual patterns;
- calibrate diversity diagnostics;
- decide which integrations/backends/deployment alternatives are worth proving;
- compare model/skill/provider versions against accepted baselines.

No silent self-modification. Evidence produces a proposed, versioned, regression-tested change.

The Football Predictor / Euro Predictor benchmark remains the long-run complex-app pressure test; it is not a football template.

---

# 4. First-class project modes and maturity

Current project intent classes:

1. **Marketing/business website** — public pages, company content, local SEO, leads, assets; static/content-first target renderer.
2. **B2B SaaS** — organisations, roles, data, admin, uploads, integrations, optional billing/custom work.
3. **Consumer web app** — accounts, profiles, engagement, notifications and optional PWA/custom work.
4. **Internal tool** — authenticated workflow/data interfaces with minimal public surface.
5. **Content site** — publishing/CollectionSpec structures, static search, SEO, analytics/localization where requested.
6. **AI-first app** — structured AI capability with budgets, evaluations and fallbacks.

Additional project classes are added only when requirements/composition/architecture defaults are materially different.

Each class/capability family should also carry evidence-based maturity:

- **Proven**;
- **Supported**;
- **Assisted engineering**;
- **Experimental**.

Do not imply equal maturity simply because the questionnaire lists six classes.

Native mobile is a future distinct class, not an implied capability of today's consumer web app.

---

# 5. Target build lifecycle

`Input -> Intake -> Build Contract -> Approval -> Manifest -> Ingest/Knowledge Pack -> Deterministic Composition -> Brand/ArtDirection/DesignSystem where relevant -> Template/Recipe/Presentation Resolution -> Deterministic Generation -> Novel AI Work -> Deterministic QA -> Targeted Independent Review -> Preview/Direct Edit/Variant Selection -> Approval -> Production -> Monitor -> Evidence -> Improve Factory`

Structured state is persisted at every material transition.

---

# 6. Cost and usefulness targets

For ordinary business websites, directionally target **~90% deterministic/reusable and ~10% generative** once mature.

For custom SaaS applications, directionally target **~60–75% deterministic/reusable and ~25–40% generative**.

Do not optimize percentages at the expense of quality. Stronger metrics are:
- meaningful manual edits before launch;
- first-build/untouched-launch success;
- deterministic gates passed without intervention;
- reusable recipe/component/template coverage;
- AI cost/tokens per accepted outcome;
- provider quota scarcity/effective cost;
- elapsed work;
- retries/interventions;
- owner/stakeholder quality reaction.

The first genuine business target remains <20 edits. Mainstream Proven website maturity later targets median <=5.

---

# 7. Definition of a successful v1

App Builder v1 is successful when:
- a real project starts from an idea plus optional company/source material;
- adaptive intake catches high-impact requirements;
- approved contracts preserve product intent;
- buildability decisions are known before generation;
- source material becomes a trusted knowledge pack;
- deterministic composition creates sensible real routes/pages/screens;
- an appropriate renderer/template is selected rather than forcing every project through one shell;
- presentation follows grounded BrandSpec/ArtDirectionPlan/DesignSystemSpec where relevant;
- a portable repository is generated;
- common capabilities come from proven recipes;
- the result can be previewed/edited/versioned through the Console;
- automated correctness/security/accessibility/quality gates run before release;
- multiple clients can call safe deterministic Factory operations through adapters without becoming project truth;
- one genuine business run passes the Phase 3.8E acceptance contract;
- the post-4C/4D/4.2 ten-business corpus begins producing repeatable evidence;
- project evidence feeds reviewed/versioned improvements.

Best-in-class is not claimed because the architecture is complete. It is earned when the corpus and competitive benchmarks show the output consistently deserves the claim.

---

# 8. Immediate execution order

1. **Finish Phase 3.8E/NBM honestly** — real Factory crawl, replayed approved intake, review packet/evidence, genuine human product review, actual meaningful edits.
2. **Close reusable 3.8E defects** rather than hand-editing generated output to make the number look good.
3. In parallel only where it removes a real Phase 5 prerequisite, **complete issue #55 runtime-to-Factory capability enforcement**; do not enable agents yet.
4. **Minimum Phase 4C** — BrandSpec, DesignSystemSpec, ArtDirectionPlan, MotionContract, Presentation Registry/Component Manifest, DesignLint, all with real consumers.
5. **Minimum Phase 4D** — 2–4 genuinely different visual directions, responsive comparison, promote/reject, bounded distinctive moments.
6. **Phase 4.2 static/content renderer MVP** — prove a genuinely different renderer and core web-output path.
7. Enter the **ten-real-business product-proof freeze** in `docs/PRODUCT_PROOF_PROGRAMME.md`.
8. Add project maturity and anti-template diagnostics from real corpus evidence; fix reusable defects the corpus exposes.
9. Rerun the same frozen inputs after meaningful factory changes.
10. Run the first blind competitive bake-off only after the internal corpus has a stable baseline.
11. Before broad autonomous execution, finish **Phase 4.5** sandbox/capability enforcement, durable worker execution, interruption/provider-capacity recovery and ledger/projection reconciliation.
12. Before live SaaS/database autonomy, add **production data-change safety** and first-class environment/integration contracts.
13. Let the corpus determine which mature website capabilities, backend/deployment alternatives, stakeholder workflow or later project classes are actually worth prioritising.

Security/data-loss blockers can interrupt this order. Speculative architecture cannot.

`AGENTS.md` remains the root engineering authority. `docs/ROADMAP.md` owns sequencing, `docs/PRODUCT_PROOF_PROGRAMME.md` owns the post-visual product-proof discipline, specialist/design/engineering/runtime documents own their domains, schemas/config are machine-readable contract authorities and `config/factory-status.json` is the machine-readable delivery status.
