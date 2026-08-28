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

Sequencing, the current position and the completed ledger are maintained once, in `docs/ROADMAP.md`,
with the machine-readable state in `config/factory-status.json`. This document deliberately keeps no
second execution queue: an execution order that lives in two places disagrees with itself the moment
one stage closes.

---

# 4. Project classes and entry modes

Project class determines the product/architecture defaults:

1. **Marketing/business website** — public pages, company content, local SEO, leads, assets; future static-first default.
2. **B2B SaaS** — organisations, roles, data, admin, uploads, integrations, optional billing/custom work.
3. **Consumer app** — accounts, profiles, engagement, notifications and optional PWA/custom work.
4. **Internal tool** — authenticated workflow/data interfaces with minimal public surface.
5. **Content site** — publishing/CollectionSpec structures, static search, SEO, analytics and localization where requested.
6. **AI-first app** — structured AI capability with budgets, evaluations and fallbacks.

Additional project types are added only when requirement/composition/architecture defaults are materially different.

Separately, every class may enter through one of two **entry modes**:

- **greenfield build** — no implementation is treated as authoritative; the ordinary intake/build lifecycle creates a new portable repository;
- **existing-product adoption/improvement** — an existing repository and/or live URL is treated as evidence to understand before mutation. The factory freezes a baseline, maps current architecture/product/journeys, records what is known-good, diagnoses opportunities and defects, and proposes bounded changes that preserve history and are judged by before/after evidence.

Entry mode must not become a second project-class taxonomy. An adopted marketing site is still a marketing site; an adopted B2B SaaS is still B2B SaaS. Existing-product mode also must not imply “rewrite using App Builder defaults”: the factory explicitly classifies findings into **keep / refactor / redesign / replace / remove / add**, and replacement requires evidence that preserving the existing implementation is the worse option.

---

# 5. Target build lifecycle

Greenfield lifecycle:

`Input -> Intake -> Build Contract -> Approval -> Manifest -> Ingest/Knowledge Pack -> Deterministic Composition -> Template/Recipe/Presentation Resolution -> Deterministic Generation -> Novel AI Work -> Deterministic QA -> Targeted AI Review -> Preview/Direct Edit/Variant Selection -> Approval -> Production -> Monitor/Experiment -> Improve Factory`

Existing-product lifecycle reuses the same contracts/gates after an adoption stage rather than bypassing them:

`Repo/URL -> Baseline Evidence -> Product/Architecture/Journey Map -> Specialist Diagnosis -> Improvement Contract -> bounded branch/ChangeSet -> deterministic QA -> targeted independent review -> Before/After Evidence -> approval -> release -> monitor`

The baseline should capture only evidence relevant to the product and requested improvement, but may include the exact source revision, deployed URL/revision where known, representative journeys and screenshots, architecture/contract findings, browser/runtime failures, accessibility, performance, security, visual/mobile quality, test status and current intervention/rework burden. A broad instruction such as “improve this product” routes to diagnosis/opportunity work first; it does not grant an implementation role permission to rewrite the repository.

Structured state is persisted at every material transition.

---

# 6. Cost and usefulness targets

The deterministic/generative target ratios and the credit-efficiency rules that hold them live once in
`docs/CREDIT-EFFICIENCY.md`. Do not optimize percentages at the expense of quality. Stronger metrics
are:
- meaningful manual edits before acceptable launch;
- deterministic gates passed without intervention;
- reusable recipe/component/template coverage;
- AI cost/tokens per accepted outcome;
- elapsed work;
- number and cause of retries/interventions.

For existing-product work also record the delta from baseline: defects removed without regressions, journeys improved, architecture/quality findings retired, manual rework avoided and any metric that materially motivated the change. A change that increases code churn without improving the agreed baseline is not progress.

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
- **existing-product adoption/improvement** — an existing repo/URL can be baselined, mapped and changed through isolated Git/ChangeSet work without erasing history or known-good behaviour, with before/after evidence showing whether the change actually improved the product;
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

## 7.4 What the earlier stages were measured against

7.1 is the successor to the original v1 success statement, not a replacement for it: every clause of
the original is carried above, in stricter form. The one fact that does not survive as a requirement is
the result — a genuine business build reaching acceptable launch quality in fewer than 20 meaningful
manual edits, **passed 2026-08-26 at 0 edits** (`docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`). One run is not
evidence; the corpus in 7.1 is what turns it into repeatable evidence.

Best-in-class capabilities such as CMS, localisation, Figma mapping, existing-repository adoption and
experiments may mature after the first useful v1 vertical slice. Their architecture is planned in
`docs/PLATFORM_PARITY_PROGRAMME.md` so Phase 4 does not paint the system into a corner.

---

# 8. Sequencing

The ordered path from the current state to a finished core product is maintained once, in
`docs/ROADMAP.md`. This document deliberately keeps no second execution queue: an execution order that
lives in two places is an execution order that disagrees with itself as soon as one stage closes.

`config/factory-status.json` remains the machine-readable authority for what is current, complete and
outstanding.
