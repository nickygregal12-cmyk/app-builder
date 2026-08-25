# Roadmap

Current stage: **Phase 3.8 — Product proof and correctness hardening**.

Implementation has reached the Phase 3.7 service/tool-boundary exit, but two things must be true before broad Phase 4 work accelerates:

1. the genuine real-business `<20 meaningful edits` product proof still has to be completed using real source material rather than only the synthetic Acme regression fixture;
2. newly identified correctness/security gaps should be closed while the surface area is still small.

The detailed delivery specification lives in `docs/MASTER_PLAN.md`. The best-in-class capability register lives in `docs/BEST_IN_CLASS_CAPABILITIES.md`. The control-plane programme lives in `docs/FACTORY_CONTROL_PLANE.md`; the dedicated future agent runtime is defined in `docs/AGENT_RUNTIME.md`.

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
- neutral standalone React/TypeScript/Vite template
- deterministic `create-app --plan` and real project materialisation
- fail-closed handling when a requested capability has no ready recipe
- recipe dependency/conflict resolution
- safe managed recipe add/remove reconciliation
- generated provenance records without runtime lock-in

### Phase 2B — Backend foundation and core recipes

- Supabase infrastructure adapter with browser-safe environment contract
- auth, profiles and organisations/RBAC recipes
- generic admin foundation
- static SQL/RLS security regression checks

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

## Phase 3.5 — Factory Control Plane ✅ Foundation Complete

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

Deferred scope:
- provider-neutral `ExecutionEnvironmentAdapter`
- disposable/rootless sandbox implementation
- CPU/memory/runtime/network/secret policies
- preview/artifact/checkpoint interface
- OTel-compatible trace export mapping
- explicit production deployment/database approval boundary

## Phase 3.6 — Requirements-to-Product Composition ✅ Core complete; real-world proof remains open

### Phase 3.6A — Manifest and Build Contract v2 ✅ Complete

- Manifest v2 preserves audience, journeys, entities and major surfaces
- preserves company identity/services/locations/contact/trust/conversion intent
- preserves roles, tenancy, integrations, existing-data/upload and hard constraints
- requested capabilities separated from installed deterministic recipes
- unavailable requested capabilities require explicit exclude/custom-work decisions
- v1 manifests remain readable for backwards compatibility

### Phase 3.6B — Deterministic composition ✅ Complete

- stable `PageSpec`, `SectionSpec` and content-binding/provenance contracts
- deterministic information architecture and section composition
- trusted Phase 3 knowledge becomes a real generation input
- source-backed facts retain provenance/source/entity ids
- fallback/generated content remains explicitly marked
- real generated navigation/routes/sections
- generated apps independently install/check/build

### Phase 3.6C — Real-business acceptance ⚠️ Synthetic regression complete; genuine product gate outstanding

The existing Acme mixed-source acceptance remains valuable as a reproducible regression test, but it is synthetic. Complete the original product gate with:

- a genuine existing business URL;
- genuine company document/PDF source material;
- genuine logo/photos/assets;
- real intake -> Build Contract -> Manifest -> ingestion -> composition -> generation -> verification -> preview/deploy;
- visual/product review rather than only compile/build correctness;
- meaningful manual edits counted and categorized;
- deterministic/AI cost, elapsed work and interventions recorded.

Initial target: fewer than **20 meaningful manual edits** between generated output and a launchable result.

## Phase 3.7 — Factory Service and Real Ledger Integration ✅ Core exit complete

The service boundary now exists and owns durable project operations needed before the full Console becomes a real client.

Delivered/core exit:
- `apps/service` private/local service boundary;
- project/workspace lifecycle;
- Manifest/knowledge/composition reads;
- deterministic generation through the service;
- independent generated-project install/check/build verification;
- service-owned preview lifecycle;
- JSONL event evidence plus SQLite read projection;
- project/task/event/checkpoint/metric queries;
- integration configuration status without returning secret values;
- provider-neutral factory tool descriptor;
- service doctor and portability checks.

Further service capabilities should be added only when Phase 4 actually needs them rather than speculatively expanding the API.

## Phase 3.8 — Product Proof and Correctness Hardening 🚧 Current

Purpose: close high-value correctness gaps discovered by the audit and establish the few foundations that are cheaper to solve before the Builder Console becomes large.

### 3.8A — ChangeSet path-policy correctness — P0

- replace prefix-like scope matching with normalized, segment-correct glob semantics;
- reject absolute/traversal/ambiguous repository paths before matching;
- prefer Node 22 native glob matching if it satisfies the required contract;
- add adversarial examples for sibling-prefix escape (`src/**` must not match `src2/...`);
- add `fast-check` property tests around allow/deny/expected-file policy behavior.

Exit gate: autonomous ChangeSet scope cannot be escaped via textual path-prefix collisions.

### 3.8B — Schema/type/runtime contract unification — P0

Target:

`JSON Schema -> generated packages/contracts types -> Ajv boundary validation`

- make `/schemas` canonical for machine-readable data contracts;
- generate TypeScript contracts rather than maintaining overlapping handwritten declarations;
- remove hand-duplicated validator enums/rules as each schema moves to Ajv;
- add deterministic contract-generation/drift CI;
- keep structural validity separate from adapter/module buildability.

Candidate tooling:
- `ajv`;
- `json-schema-to-typescript` or the best equivalent proven against current schemas.

### 3.8C — Executed Supabase security acceptance — P0

- keep cheap static SQL smoke tests;
- add local Supabase/pgTAP execution for generated database recipes;
- use `supabase test db` and Basejump test helpers where useful;
- authenticate as actual test users and prove cross-organisation isolation;
- cover owner/admin/editor/member/viewer and anonymous cases;
- make executable RLS behavior part of recipe readiness/release acceptance.

### 3.8D — Accessibility baseline — P0/P1

- add `@axe-core/playwright` to canonical generated-app browser acceptance;
- establish deterministic serious/critical accessibility gates before later AI review;
- cover representative mobile/desktop layouts.

### 3.8E — Genuine business product proof — P0/P1

Complete Phase 3.6C honestly and feed observed edit categories back into composer/templates/recipes before major Phase 4 polish.

### 3.8F — MCP interoperability facade — P1

Expose the existing safe factory service tool contract through MCP v2:

`Codex / ChatGPT / Claude Code / OpenCode -> MCP adapter -> apps/service -> deterministic factory`

Initial surface:
- project create/read;
- Manifest/knowledge/composition reads;
- generate/recompose/verify;
- preview start/status/stop;
- events/tasks/checkpoint/metrics reads.

Do not expose production deploy/database writes, raw secrets, arbitrary filesystem paths or unrestricted shell execution.

MCP remains an adapter rather than a new source of factory truth.

## Phase 4 — Full Builder Console ⬜ Planned

Begins after the Phase 3.8 P0 gates are addressed. Build the Console as a client of `apps/service` rather than expanding browser-only state.

### Phase 4A — First complete usable vertical slice

- create/open project;
- adaptive intake and source ingestion through the service;
- reviewed Build Contract;
- trigger deterministic build;
- visible task/event progress;
- service-managed live preview;
- desktop/tablet/mobile preview switching;
- checkpoint/version visibility.

### Phase 4B — Direct manipulation and assets

- click-to-select/edit through PageSpec/SectionSpec identity;
- text/content editing with provenance awareness;
- component/section variant selection;
- asset manager/replacement/crop selection;
- explicit generated-vs-source-backed content state;
- Design Contract editing.

### Phase 4C — Design System Registry and `DesignSystemSpec`

Use shadcn registry architecture as prior art, not as a mandatory runtime dependency.

Create distinct but related registries:
- capability recipes;
- presentation primitives/components/sections.

`DesignSystemSpec` should cover:
- typography/color/spacing/radius/shadow tokens;
- icon system;
- allowed primitives/components;
- section families and variants;
- responsive and interaction states;
- motion/imagery rules;
- accessibility constraints.

Add deterministic design-system linting so later AI cannot silently invent a second design system.

### Phase 4D — Visual design canvas and controlled variants

- bounded candidate design/layout variants from the same product/content truth;
- large/infinite comparison canvas or equivalent workspace;
- responsive and interaction-state preview;
- explicit promote/reject flow into durable design/composition state;
- variant decisions recorded as evidence rather than accumulating unofficial forks.

### Phase 4E — Environments, integrations and release controls

Introduce explicit **development / preview / production** environment identity:
- deployment/backend identities;
- scoped secrets/integrations;
- migration state;
- allowed actions;
- preview/release URLs/checkpoints.

Then add:
- integrations/secrets status and approval UI;
- test/health/log views where safe;
- cost/trace view;
- preview/production deploy controls with approval gates.

### Hono decision point

Evaluate Hono only if Console/service development begins duplicating route/request/response types. Do not rewrite the service merely to adopt it; `packages/contracts` remains authoritative.

## Phase 4.2 — Generated-Product and Web-Builder Quality Expansion ⬜ Planned alongside/after early Console

### Static/content template — 10/10 priority

Prove the template contract with a genuinely different static/content-oriented renderer. Evaluate Astro first.

Default direction:
- marketing/content sites -> static/content-first template;
- SaaS/consumer/internal/AI apps -> application-oriented React template.

### Presentation/output additions

- static semantic icon pipeline using pinned Lucide SVG assets, not `lucide-react` by default;
- Pagefind search recipe for compatible marketing/content builds;
- knowledge-derived typed JSON-LD (`Organization`, `LocalBusiness`, `Service`, `FAQPage`, `Article`, breadcrumbs etc. where evidence supports it);
- deterministic OG/social images with Satori + existing Sharp;
- page-level SEO/meta output appropriate to the selected template.

## Phase 4.3 — Mature Website-Builder Capabilities ⬜ Planned

### CMS/content collections

Introduce provider-neutral `CollectionSpec`:
- fields/validation;
- relationships;
- slugs;
- draft/published state;
- SEO mapping;
- locale support.

Backends may be local/static, Supabase or future CMS adapters.

### Localization

Introduce `LocaleSpec` for:
- primary/fallback locales;
- localized routes/slugs/bindings/assets;
- localized metadata/OpenGraph/hreflang;
- translation/review state.

### Figma/design import and mapping

- import design-system/token/component references;
- map known design components to registered production components;
- retain unmatched design pieces as explicit novel/custom work;
- keep resulting code changes ordinary repository diffs/PRs.

### Existing-repository adoption

- inventory the existing framework, design system, components, backend and deployment;
- map factory capabilities/gates onto the repo rather than regenerating it;
- manage only explicitly adopted files/components;
- preserve Git history and project authorities.

### Deterministic SEO/AEO scanner

Audit public builds for metadata, canonicals, headings, alt text, structured data, internal links, social assets, sitemap/robots/indexability and relevant local-business/service signals before deployment.

## Phase 4.5 — Pre-Agent Hardening ⬜ Planned

Resume deferred 3.5C immediately before powerful autonomous agents are enabled:

- execution sandbox abstraction and first rootless implementation;
- secret/network/resource restrictions;
- trace/export mapping;
- production action approval boundary;
- dead/orphan integration detection (`Knip` where justified);
- CSP baseline in deployment adapters;
- safe three-way recipe reconciliation (`git merge-file` where useful);
- re-run all ChangeSet/contract/RLS/accessibility properties under the real sandbox/tool runtime.

## Phase 5 — Low-Credit AI Orchestration + Dedicated Agent Runtime ⬜ Planned

- product bootstrapper only where deterministic systems cannot resolve novelty;
- deterministic task/context router;
- model router by measured task capability, quality threshold and cost;
- compact trusted context packets;
- versioned `SKILL.md` specialist skills;
- implementation/design/backend/security/review specialists;
- machine-readable outputs and ChangeSets;
- bounded autonomous work/fix loops;
- provider-neutral `AgentRuntimeAdapter`;
- dedicated App Builder service on Hetzner, separate from project-specific runtimes;
- OpenCode as initial runtime implementation rather than stable product dependency;
- clean-session/context-loss recovery;
- isolated per-project/per-task workspaces and scoped secrets;
- browser/visual agent workflows.

MCP delivers early interoperability, but it does **not** replace the later runtime's sandboxing, scheduling, specialist routing, resumability and hard-budget responsibilities.

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- task-class model benchmark scoreboard;
- cheapest model that clears quality threshold, escalating on failure;
- prompt/skill/model regression tests;
- hostile-source/prompt-injection cases;
- dangerous-tool/permission-bypass tests;
- context-router leakage tests;
- second-opinion agreement metrics;
- evaluate Promptfoo specifically where it materially improves red-team coverage.

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

- full unit/integration/E2E/accessibility/performance/security gates;
- screenshot/visual review against Design Contract/DesignSystemSpec;
- independent second-opinion review for material changes;
- responsive/data/error/loading/empty/large-data stress scenarios;
- slow/offline/failing-API scenarios;
- Lighthouse-style performance budgets;
- Semgrep/Gitleaks-style security/secret gates where they outperform bespoke doctor checks;
- bounded autonomous correction through control-plane tasks;
- deployment smoke tests.

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/SSL launch checklist;
- redirect/canonical/sitemap/robots setup;
- analytics/observability/feedback activation;
- production smoke checks and launch readiness report;
- post-launch audit workflow;
- handover/architecture documentation;
- reviewed recipe/module/presentation-registry upgrade propagation;
- safe three-way managed-file reconciliation;
- reusable pattern promotion workflow.

## Phase 7.5 — Experiments and Controlled Personalization ⬜ Later

After analytics, privacy and deployment state are mature:
- versioned experiment/variant contracts;
- A/B traffic allocation and attribution;
- reviewed winner promotion;
- conversion evidence captured into the factory improvement system;
- personalization only when explicit, measurable, privacy-compliant and reversible.

## Phase 8 — Evidence-Driven Factory Improvement ⬜ Planned

- analyse manual edits and rework across projects;
- propose versioned questionnaire improvements;
- identify capabilities worth promoting into reusable recipes/sections/components;
- measure tokens/cost/time saved;
- track design-variant acceptance/rejection evidence;
- track experiment outcomes where enabled;
- benchmark one-prompt builds only after the deterministic pipeline is genuinely useful;
- compare model/skill/router versions against accepted baselines;
- no silent self-modification: every improvement remains reviewed, versioned and regression-tested.

## Architectural follow-ups to preserve

- add short ADRs for durable-state choice, control-plane ownership, template strategy, backend defaults, deployment defaults and environment identity;
- do not adopt `lucide-react` as a default generated dependency when static SVG copying solves the need;
- do not add another SVG rasterizer while Sharp satisfies the social-image pipeline;
- do not make Hono authoritative for contracts;
- evaluate `@mozilla/readability` against real crawled sites before adopting it;
- do not adopt Temporal/LangGraph/large orchestration frameworks unless measured complexity later justifies them;
- generated projects remain ordinary repositories and never require the Builder Console, MCP server or Hetzner/OpenCode runtime to operate.