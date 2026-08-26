# Roadmap

Current stage: **Phase 3.8 — Product proof and correctness hardening**.

Machine-readable progress authority: `config/factory-status.json`.

Detailed delivery specification: `docs/MASTER_PLAN.md`.

Cross-cutting authorities:
- product-proof and maturity programme: `docs/PRODUCT_PROOF_PROGRAMME.md`;
- visual quality: `docs/VISUAL_EXCELLENCE.md`;
- design intelligence: `docs/DESIGN_INTELLIGENCE.md`;
- professional completeness: `docs/PRODUCTION_COMPLETENESS.md`;
- engineering gates: `docs/ENGINEERING_QUALITY_PROGRAMME.md`;
- control plane: `docs/FACTORY_CONTROL_PLANE.md`;
- agent runtime: `docs/AGENT_RUNTIME.md`;
- genuine-business acceptance: `docs/GENUINE_BUSINESS_ACCEPTANCE.md`;
- complex-app benchmark: `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.

## Roadmap discipline

The factory has reached the point where architecture quality is ahead of the amount of real-world product proof. That is now a delivery risk in its own right.

Three rules govern the next stages:

1. **Do not advance a gate because the supporting architecture looks convincing.** Product gates require product evidence.
2. **Build the minimum visual/output machinery needed to make the next real-world benchmark meaningful, then freeze speculative architecture.**
3. **After the freeze, real project failures outrank roadmap enthusiasm.** Reusable defects exposed by the corpus are the work.

The preferred sequence after the current gate is:

`3.8E -> minimum 4C -> minimum 4D -> 4.2 static/content renderer -> product-proof freeze -> 10 real businesses -> rerun corpus -> competitive bake-off -> evidence-led expansion`.

Security/data-loss blockers may interrupt that sequence. Speculative architecture may not.

---

## Phase 0 — Foundation ✅ Complete

Delivered:
- repository boundaries and authorities;
- Project Manifest / Build Contract foundations;
- project-type/module registries;
- adaptive questionnaire contract;
- deterministic project skeleton;
- Builder Console shell;
- CI/doctor/contamination guard.

## Phase 1 — Intake and Build Contract ✅ Complete

Delivered:
- Quick / Standard / Thorough adaptive intake;
- project-type branching;
- company/business input;
- source references;
- ambiguity/blocker handling;
- reviewed Build Contract;
- Manifest generation;
- save/resume/export;
- browser acceptance.

## Phase 2 — Deterministic Project Generator ✅ Complete

Delivered:
- template/recipe/adapter contracts;
- deterministic planning/materialisation;
- fail-closed capability readiness;
- recipe dependency/conflict handling;
- Supabase/Netlify foundations;
- core recipes;
- handover/provenance;
- standalone generated-app checks.

The original neutral React/Vite template remains an engineering baseline, not proof that one renderer or one presentation family is suitable for every project class.

## Phase 3 — Content and Asset Intelligence ✅ Complete

Delivered:
- bounded existing-site crawl;
- document/spreadsheet/text extraction;
- trusted knowledge pack;
- fact provenance/confidence/verification;
- generated-copy separation;
- image/logo inventory and variants;
- duplicate/low-resolution signals;
- observed brand inputs;
- SEO/local-business inputs;
- content-addressed caching.

Existing brand observations are inputs to later `BrandSpec`; do not create a second extraction pipeline.

---

## Phase 3.5 — Factory Control Plane ✅ Foundation complete

Delivered:
- durable tasks/events/checkpoints;
- ChangeSet scope enforcement;
- source trust/instruction-authority boundary;
- deny-by-default capabilities;
- provider-neutral control plane;
- deterministic routing and specialist-role foundations;
- hosted runtime plan behind `AgentRuntimeAdapter`.

Deferred until pre-agent hardening:
- real task sandbox;
- resource/network/secret enforcement;
- trace/export mapping;
- production action enforcement.

## Phase 3.6 — Requirements-to-Product Composition ✅ Core complete

Delivered:
- richer Manifest/Build Contract;
- deterministic PageSpec/SectionSpec composition;
- trusted knowledge consumption;
- generated routes/navigation/content bindings;
- provenance-aware output.

### 3.6C / 3.8E — genuine real-business acceptance ⚠️ Still the active product gate

Synthetic canonical apps remain regressions, not proof.

The genuine gate requires:
- real business source material;
- real public site ingestion through the Factory path;
- replayable approved intake;
- Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview;
- RenderedEvidence;
- launch-readiness prediction;
- genuine human product review;
- actual meaningful manual edits counted and categorized;
- source/artifact hashes that match what the run really used.

Initial launchability threshold: **fewer than 20 meaningful manual edits**.

Mainstream website maturity target later: median **<=5 meaningful manual edits** with a growing untouched-launch share.

Do not mark this gate complete without the human judgement required by `docs/GENUINE_BUSINESS_ACCEPTANCE.md`.

## Phase 3.7 — Factory Service and Durable State ✅ Core complete

Delivered:
- private/local Factory service;
- durable projects/tasks/events/checkpoints;
- server-owned workspaces;
- generate/verify/preview operations;
- integration status without secret values;
- MCP/tool-facing operation contract;
- JSONL event ledger + SQLite read projection.

Durability follow-up before broad concurrency: make the ledger/projection relationship explicitly recoverable with sequence/reconciliation/rebuild semantics; see `docs/PRODUCT_PROOF_PROGRAMME.md`.

## Phase 3.8 — Product Proof and Correctness Hardening 🚧 Current

Delivered or substantially delivered:
- 3.8A ChangeSet path-policy correctness;
- 3.8B schema/type/runtime contract unification;
- 3.8C executed Supabase/RLS acceptance;
- 3.8D accessibility baseline;
- 3.8F bounded MCP adapter;
- 3.8H specialist architecture foundation;
- 3.8I routing/context discipline;
- 3.8J executable architecture/risk classification;
- 3.8K launch-readiness/state/journey product checks;
- Phase 4A and 4B Console slices built alongside the gate because the genuine proof must run through the product.

Active truth is defined only by `config/factory-status.json`.

Priority now: **close 3.8E honestly, fix reusable defects it exposes, then move to the minimum visual/output sequence below.**

---

# Phase 4 — Builder Console and Visual Product Quality

## Phase 4A — Complete usable vertical slice ✅ Complete

Delivered:
- create/open project;
- reviewed intake/Build Contract;
- service-owned ingestion;
- source governance;
- deterministic build;
- progress/events;
- preview lifecycle;
- responsive preview;
- build/checkpoint history.

## Phase 4B — Direct manipulation, sources and assets ✅ Core delivered

Delivered across 4B slices:
- Builder Element Identity;
- click-to-select and provenance-aware text editing;
- durable overrides;
- RenderedEvidence;
- asset-level rights decisions;
- focal-point crop/review;
- asset replacement lineage;
- real section variants;
- structured Design Contract controls;
- Product Opportunity Scout;
- source confidence/rights visibility.

Still intentionally deferred where there is no real consumer yet:
- generated-vs-supplied image alternatives;
- generation-forward asset modes;
- image generation itself.

No behavioural declaration should be added merely to make the contract look complete.

## Phase 4C — Design System Registry, BrandSpec and Art Direction ⬜ Next major visible-quality stage

This is the first stage in the post-3.8E minimum visual foundation.

Required minimum before the product-proof freeze:

### Presentation Registry
Keep capability recipes separate from presentation primitives/components/sections.

### `DesignSystemSpec`
Must cover and **compile into real generated output**:
- typography;
- colour;
- spacing;
- radius/shadow/elevation;
- icon system;
- primitives/components;
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
- source references/confidence;
- source-vs-generated asset policy.

### `ArtDirectionPlan`
Machine-readable visual strategy above SectionSpec:
- layout variance;
- motion intensity;
- information density;
- visual distinctiveness;
- restraint;
- narrative/attention sequence;
- page tempo;
- hero strategy;
- photography/editorial/product/UI emphasis;
- distinctive moments;
- desktop/mobile intent;
- conversion emphasis.

### `MotionContract`
Define entrances, scroll/transition language, interaction motion, limits, mobile reductions, reduced-motion behaviour and explicit no-motion zones.

### Component Manifest / Design Intelligence
Retrieve only a small relevant presentation set. Registered prior art is evidence/craft knowledge, never a universal style.

### DesignLint
Catch deterministic design-system/presentation defects before model critique.

Exit proof: at least one real generated project is materially driven by BrandSpec + ArtDirectionPlan + DesignSystemSpec rather than the old neutral default alone.

## Phase 4D — Controlled Visual Directions ⬜ Immediately after minimum 4C

Required minimum before the product-proof freeze:
- produce 2–4 genuinely different art-direction/layout candidates from the same product/content truth;
- not palette/radius swaps;
- responsive comparison;
- explicit promote/reject into durable BrandSpec/ArtDirectionPlan/Design Contract/composition state;
- rejected directions do not remain unofficial forks;
- at least one appropriate distinctive visual moment for premium marketing builds;
- curated visual regression contracts over a small approved surface set;
- independent visual critic only when a genuinely different eligible model/runtime actually runs.

A same-model persona is not an independent reviewer.

## Phase 4.2 — Static/Content Renderer and Web Output ⬜ Minimum renderer proof before freeze

Prove renderer-neutrality with a genuinely different output path.

Evaluate Astro first.

Default direction:
- marketing/content sites -> static/content-first renderer;
- SaaS/consumer/internal/AI apps -> application-oriented React renderer.

Priority additions:
- deterministic page metadata/canonicals/sitemap/robots;
- evidence-backed JSON-LD where appropriate;
- deterministic OG/social assets;
- static semantic icon pipeline using pinned Lucide SVGs rather than `lucide-react` by default;
- Pagefind only for compatible content-heavy builds;
- deterministic asset suitability/duplicate/undersized/bad-crop checks.

Do not wait for every mature website feature before beginning the real-world corpus.

---

# Product-Proof Freeze — 10 Real Businesses ⬜ First major evidence checkpoint

After minimum 4C + 4D + 4.2, pause speculative architecture and run the programme in `docs/PRODUCT_PROOF_PROGRAMME.md`.

Use at least ten deliberately different real businesses, including:
- local trade/project photography;
- professional consultancy;
- hospitality/restaurant;
- trust-heavy professional service;
- hotel/high-imagery case;
- text-heavy professional services;
- charity/community;
- catalogue/ecommerce-adjacent;
- editorial/content-heavy;
- unusual premium brand.

Freeze/replay approved inputs so later versions rerun the same truth.

Track:
- first-build success;
- launchability;
- predicted vs actual edits;
- edit categories;
- factual/source errors;
- imagery/crop failures;
- generic sections;
- visual hierarchy;
- mobile composition;
- journeys;
- accessibility/performance/SEO/security where relevant;
- cost/time/retries/interventions;
- art-direction acceptance;
- owner/stakeholder reaction.

During the freeze, normally implement **only reusable defects the corpus exposes** plus security/data-loss blockers.

## Project-class maturity tiers ⬜ Introduce with the corpus

Project classes/capability families must not all look equally proven.

Machine-readable levels:
- **Proven** — material real-project evidence, routinely excellent/low-intervention;
- **Supported** — known architecture and representative acceptance, but not enough corpus proof for "normally excellent";
- **Assisted engineering** — substantial specialist/human judgement expected;
- **Experimental** — novel/unproven, custom engineering/approval required.

Maturity affects autonomy, budget, review depth, launch confidence and one-prompt claims.

Synthetic build success does not promote a class to Proven.

## Anti-template diversity diagnostic ⬜ Introduce with the corpus

Compare unrelated builds using section sequence, hero family, layout/density, typography, component families, CTA structure, motion language and other useful structural/visual signals.

Flag suspicious similarity between unrelated businesses.

Start as evidence/diagnostic, not a hard CI gate. Remove repeatedly generic patterns rather than injecting uncontrolled randomness.

## Competitive bake-off ⬜ After the internal corpus stabilises

Use the same frozen brief/source pack in relevant current competitors and blind-review where practical.

Score:
- first-output visual/product quality;
- factual accuracy;
- mobile;
- functionality;
- accessibility;
- performance;
- manual edits;
- time;
- cost;
- portability;
- provenance/rights discipline where comparable.

Benchmark claims; do not chase every competitor feature.

---

## Phase 4E — Environments, Integrations and Release Controls ⬜ Planned

Introduce explicit development/preview/production identity and fail closed when the target is ambiguous.

Add:
- scoped secret/integration status;
- test/health/log views where safe;
- cost/trace views;
- preview/production controls with approvals;
- independent hosted-result verification.

### First-class `IntegrationSpec`

Serious application work should represent, where applicable:
- provider/capabilities;
- auth type/OAuth scopes;
- webhook events/verification;
- environment-specific credential identity without secret values;
- rate limits;
- retries;
- idempotency;
- data classes accessed;
- health check;
- test fixture;
- environment availability.

Build a small proven adapter set before any marketplace/catalogue ambition.

## Phase 4.3 — Mature Website-Builder Capabilities ⬜ Planned after evidence identifies the need

Candidate capabilities:
- `CollectionSpec` / CMS-style content;
- localization/`LocaleSpec`;
- Figma/design-system mapping;
- existing-repository adoption;
- deterministic SEO/AEO scanner;
- large-source upload transport when measured source sizes require it.

Do not implement all of these merely to complete a checklist before the ten-business proof.

## Phase 4.5 — Pre-Agent Hardening ⬜ Required before real autonomous workers

Current priority security invariant is issue #55:

`task policy -> scoped capability -> trusted runtime/broker -> approved Factory operation`

not:

`agent shell -> curl 127.0.0.1:4310 -> internal Factory route`.

Required before broad autonomy:
- real rootless/disposable task sandbox;
- host/private/network isolation;
- scoped short-lived task identity/capability grants;
- operation-level capability mapping;
- `approvalRequired` enforced before dispatch;
- secrets/resource restrictions;
- adversarial bypass tests;
- no public Factory/OpenCode exposure;
- re-run control-plane/RLS/accessibility/security properties under the real sandbox.

The already-proven OpenCode -> MCP -> Factory lane is the supported path; #55 makes the bounded path enforceable rather than merely conventional.

---

# Phase 5 — Low-Credit AI Orchestration and Dedicated Runtime ⬜ Planned

Do not start broad specialist execution until Phase 4.5 enforcement is proven.

Core runtime:
- provider-neutral `AgentRuntimeAdapter`;
- deterministic task/context router;
- registered specialist roles/pipelines as the only role taxonomy;
- disposable fresh session per role;
- durable stage handoffs/rework/convergence;
- reviewer independence enforced by control plane;
- isolated per-project/per-task workspaces;
- browser/visual workflows;
- clean-session/context-loss recovery;
- hard budgets.

## Durable worker execution

Long build/verify/model work must not be owned by an HTTP request or browser tab.

Direction:

`Factory API -> durable job scheduler -> ExecutionEnvironmentAdapter -> isolated worker -> durable progress/events/result`.

A small worker/process layer is preferred initially. Do not adopt Temporal/LangGraph without measured complexity that justifies them.

## Provider Capacity / Entitlement Broker

Running out of provider usage is a scheduling state, not a lost project.

Represent per provider/runtime where observable:
- subscription/free/included-credit/API/local entitlement type;
- current availability;
- known reset/capacity signal;
- cash cost;
- quota scarcity/shadow cost;
- task-class quality benchmark;
- tool/context capabilities;
- independence family;
- fallback eligibility.

Required durable outcomes include equivalents of:
- `waiting-for-capacity`;
- `provider-exhausted`;
- `fallback-selected`;
- `paused-by-budget`;
- `waiting-for-human-approval`;
- `retryable/interrupted`.

Routing target:

`deterministic -> proven free/cheap model -> premium model when needed -> independent reviewer where valuable -> paid overage only when authorised`.

Model choice is by task class/evidence, not a permanent vendor assignment to each role.

## Git-native task history

Long-term generated-project work should use ordinary task branches/worktrees as well as Factory checkpoints:

`main -> factory/task-<id> -> bounded change -> tests -> review -> checkpoint -> promote/merge`.

Git records **what changed**. Factory state records **why/how/under which policy/evidence/model/budget**.

## Ledger/projection recovery

If JSONL remains authoritative and SQLite remains a projection, add:
- monotonic event sequence;
- idempotent projection;
- startup reconciliation;
- rebuild command;
- proof that projection deletion/rebuild loses no authoritative history.

## Production data-change safety

Before autonomous live SaaS/database mutation, introduce a machine-readable data-change safety contract covering:
- additive/destructive/backfill/contract classification;
- compatibility;
- row impact;
- backup/restore evidence;
- deployment ordering;
- app/schema/data rollback or forward-repair;
- partial-deployment behaviour;
- environment identity;
- approvals.

Prefer expand -> migrate/backfill -> verify -> contract for high-risk changes.

---

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- task-class model benchmark scoreboard;
- cheapest model that clears the quality threshold;
- prompt/skill/model regressions;
- hostile-source/prompt-injection tests;
- dangerous-tool/permission-bypass tests;
- context-router leakage tests;
- independent-review evidence;
- skill promotion only on controlled comparison;
- image-provider quality/rights/cost evaluation where relevant.

Free models are candidates for routine task classes only after benchmark evidence shows they clear the required threshold.

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

- unit/integration/E2E/accessibility/performance/security gates feeding convergence;
- browser functional QA;
- runtime/DevTools debugging;
- deterministic SEO/AEO scanner;
- visual review against BrandSpec/ArtDirectionPlan/DesignSystemSpec/MotionContract;
- responsive/state/data/offline/failure stress cases;
- bounded correction loops;
- deployment smoke tests.

Professional completeness remains conditional: implement and prove every **relevant** state/journey, not a generic checklist of skeletons/toasts/modals.

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/TLS;
- redirects/canonicals/sitemap/robots;
- analytics/observability/feedback;
- production smoke/health;
- rollback/handover;
- reviewed recipe/presentation upgrades;
- approved asset/rights report;
- a small proven set of first-class integrations.

## Phase 7.5 — Experiments and Controlled Personalisation ⬜ Later

Only after analytics/privacy/deployment state is mature:
- versioned experiment contracts;
- attribution;
- reviewed winner promotion;
- reversible/privacy-compliant personalisation.

---

# Phase 8 — Evidence-Driven Factory Improvement and Gold Standard ⬜ Planned

The six canonical classes remain engineering regressions. Real maturity comes from a growing corpus.

Grow the initial ten-business checkpoint toward **30–50 varied real-world projects** across websites and later complex applications.

Track:
- build success;
- meaningful edits;
- untouched-launch share;
- factual/source accuracy;
- visual/mobile quality;
- accessibility/performance/SEO/security;
- functional journey success;
- time/cost/interventions;
- art-direction acceptance;
- asset/image failures;
- model/skill/router version outcomes.

### Gold Standard target for proven mainstream website classes

Target evidence, not a marketing label:
- >=98% build success without developer intervention;
- median <=5 meaningful manual edits before launch;
- growing material untouched-launch share;
- blind human visual/product average >=9/10;
- no unsupported factual claims;
- no serious/critical accessibility failures;
- agreed performance budgets pass;
- zero known critical/high security findings at release;
- all Build Contract acceptance journeys pass;
- generated repos independently clone/install/build;
- declared AI/tool budget holds.

Complex consumer/SaaS/AI applications have their own benchmark evidence. Website success does not automatically make them Proven.

The Football Predictor / Euro Predictor benchmark remains a long-run complex-app pressure test rather than a football template.

---

# Later backlog retained, not promoted

These are useful ideas but are deliberately not immediate prerequisites for the ten-business proof:

## Stakeholder review portal
Use ElementIdentity to attach external comments/change requests to exact rendered elements, produce proposed ChangeSets and keep repository/internal Factory state private.

## Streamed/resumable uploads
Move beyond browser/base64 transport only when real source sizes justify streaming/chunking/content-addressed storage.

## Generated-app agent interface
A later `agent-interface` capability may expose safe MCP/agent actions for the **generated application itself**. It is distinct from the App Builder MCP adapter.

## Native mobile
If native output is later claimed, introduce a separate Expo/React Native project class with native permissions/offline/secure-storage/signing/store/device-test contracts. Today's consumer-app means web application.

## Provider-neutrality proof beyond renderers
Later prove backend/deployment abstractions with genuinely different second implementations. Do this to validate contracts, not to offer a shallow catalogue of providers.

## Capability-driven service refactoring
`FactoryService` / `BuilderWorkspace` may be split as real capability boundaries diverge. Do not create a refactor programme based only on file length.

## Documentation generation
Move factual current-state prose toward generated sections sourced from `config/factory-status.json` and registries.

Rule: **humans write why; machines write what state things are in.**

Commercial/venture planning should live in a clearly routed area and stay out of normal factory-engineering context unless explicitly requested.

---

# Architectural restraints

Do not add by default:
- another orchestration framework;
- LangGraph/Temporal without measured need;
- Kubernetes/microservices;
- a vector database merely because it is fashionable;
- a plugin marketplace before integrations are proven;
- every AI model on every task;
- Tailwind/shadcn as a universal generated-app design identity;
- `lucide-react` when pinned static SVGs solve the generated-output need;
- a graph/index as repository truth;
- same-model personas labelled independent reviewers;
- uncontrolled `LESSONS.md` / `MEMORY.md` systems;
- screenshot-to-code as the design architecture.

Generated projects remain ordinary repositories and never require App Builder, MCP, OpenCode or Hetzner to operate.

---

# Immediate execution order

1. Keep `config/factory-status.json` truthful at 3.8E until NBM genuine-business acceptance really passes.
2. Finish the real NBM crawl/replay/review/evidence path.
3. In parallel, close #55 before any real autonomous agent gets shell/network authority.
4. Build the minimum 4C design/brand/art-direction contracts with real consumers.
5. Build the minimum 4D visual-direction comparison/promotion flow.
6. Prove the static/content renderer via Phase 4.2.
7. Enter the ten-business product-proof freeze.
8. Let corpus defects drive the next work.

This roadmap deliberately values **proof, simplification and operational hardening over adding more architectural surface area**.
