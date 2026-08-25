# App Builder — Master Delivery Plan

## 1. Product goal

App Builder is a private, AI-first website and application factory for personal use. Its job is to turn rough real-world input into a tested, portable project while spending as little AI credit as practical.

The target end-state is:

1. provide an idea, company details, an existing URL, documents, spreadsheets, screenshots, logos and/or images;
2. answer an adaptive set of questions;
3. review a concise Build Contract before any expensive build starts;
4. let deterministic templates, recipes and tools create everything already solved by the factory;
5. use AI only for genuinely novel product, design, content or engineering work;
6. run deterministic quality gates first, then targeted AI review only where useful;
7. preview, edit, version and deploy from the Builder Console;
8. keep the generated application as a normal repository with no App Builder runtime lock-in;
9. feed evidence from completed projects back into reviewed, versioned improvements to the factory.

Core rule: **never spend AI tokens solving a problem the factory already knows how to solve deterministically.**

---

## 2. Operating principles

### Deterministic first
Schemas, templates, recipes, generators, static analysis, tests, linters, image tooling and deployment scripts should do repeatable work. AI is a fallback for ambiguity, novelty and judgement.

### Requirements before code
No coding agent should begin a substantial build while high-impact requirements remain unresolved. Intake produces a reviewed Build Contract first.

### Modules, not copied boilerplate
Reusable capabilities such as auth, organisations, uploads, email, admin, billing and analytics should become versioned recipes/packages rather than being regenerated per project.

### Small context packets
Agents receive only the product authority, manifest, relevant files, contracts and tests needed for the task. Whole-repository reads are exceptional.

### Portable outputs
Generated apps must remain ordinary repositories that can be maintained without the Builder Console.

### Evidence-driven improvement
The factory may propose improvements to questionnaires, recipes and defaults based on real project evidence. It must not silently self-modify.

### Cost is a product requirement
Each project and AI task should have an explicit cost mode/budget. The factory should prefer zero-cost deterministic work before model calls.

---

# Delivery milestones

## Phase 0 — Foundation ✅

### Purpose
Create a small, stable architecture before adding real product capability.

### Delivered
- root agent/engineering authority;
- App Factory Engine / Builder Console boundary;
- project-type registry;
- optional module registry;
- Project Manifest schema;
- Build Contract schema;
- company profile/provenance schema;
- adaptive questionnaire definitions;
- deterministic `create-app` skeleton;
- credit/context budget rules;
- repository contamination guard;
- CI, doctor, tests, typecheck and lint;
- minimal Builder Console shell;
- roadmap issues.

### Exit gate
Foundation checks and console build pass in CI. Completed.

---

## Phase 1 — Adaptive Intake and Build Contract

### Purpose
Make App Builder useful before it knows how to build full applications. The first real product should take a project from a blank session to a reviewed specification and machine-readable manifest.

### Build

#### 1. Intake session model
Create a stable session state containing:
- project type;
- questionnaire mode: Quick / Standard / Thorough;
- answers;
- defaults accepted;
- skipped/delegated answers;
- supplied source references;
- unresolved high-impact questions;
- questionnaire version;
- resulting Build Contract and manifest versions.

#### 2. Adaptive questionnaire engine
- merge base questions with project-type questions;
- support conditional questions;
- support defaults and `decide for me`;
- mark questions as quick/standard/thorough;
- distinguish blocking/high-impact questions from optional detail;
- avoid asking irrelevant questions;
- calculate completion and remaining blockers deterministically.

#### 3. Initial project-type discovery packs
Maintain specific question sets for:
- marketing/business website;
- B2B SaaS;
- consumer app;
- internal tool;
- content site;
- AI-first app.

#### 4. Company/business intake
Capture structured:
- identity/legal name;
- description;
- services/products;
- locations/service areas;
- contact details;
- conversion goal;
- existing website;
- brand/assets available;
- testimonials/accreditations/case studies;
- known factual claims and provenance.

#### 5. Input inventory contract
The intake should be able to record references to:
- URLs;
- logos and brand files;
- photos/images;
- screenshots/design references;
- PDFs/documents;
- spreadsheets/CSV;
- databases/APIs;
- other source material.

Phase 1 records these inputs; Phase 3 will deeply extract/classify them.

#### 6. Targeted follow-up model
Before AI is involved, deterministic rules identify missing high-impact information. Later a cheap model can generate a very small number of contextual follow-ups only where the structured questionnaire cannot resolve ambiguity.

#### 7. Build Contract generation
Generate a human-readable and machine-readable contract containing:
- project summary;
- target users;
- primary outcome;
- core journeys;
- major pages/surfaces;
- enabled modules;
- infrastructure choices;
- brand/design direction;
- known source inputs;
- explicit exclusions;
- acceptance criteria;
- unresolved blockers;
- estimated AI/cost mode.

#### 8. Approval gate
States:
`draft -> ready-for-review -> approved`

No substantial generator/AI build begins before approval unless the user explicitly chooses an exploratory prototype mode in a future phase.

#### 9. Manifest generation
Approved answers deterministically produce a valid Project Manifest using project-type defaults plus explicit user decisions.

#### 10. Intake feedback record
After a project, store:
- questions that were missing;
- answers later corrected;
- questions that were unnecessary;
- defaults accepted unchanged;
- architecture changes caused by discovery gaps.

The system can then propose a versioned questionnaire update.

### UI for Phase 1
The Builder Console should support:
- New Project start screen;
- project type selection;
- Quick / Standard / Thorough choice;
- step-by-step question flow;
- completion/progress view;
- defaults clearly shown;
- summary/build-contract screen;
- unresolved blocker panel;
- approve contract action;
- generated manifest preview/download view.

### Deterministic vs AI
**Deterministic:** question selection, defaults, validation, blockers, module selection, manifest generation, build-contract structure.

**AI later/optional:** very small targeted ambiguity follow-ups and concise copy cleanup. Phase 1 must work without any model call.

### Exit gate
A user can start a project in the console, complete a relevant questionnaire, review a Build Contract, approve it and receive a valid Project Manifest without an LLM call. Tests cover all six project types and all three intake depths.

---

## Phase 2 — Deterministic Project Generator and Recipes

### Purpose
Turn an approved manifest into a real runnable repository with almost no AI usage.

### Build
- production-ready neutral templates for each project type;
- recipe installer/remover;
- recipe compatibility/version metadata;
- generic React/TypeScript application shell;
- Supabase adapter;
- deployment adapters, initially Netlify;
- environment contract/validation;
- generic design-token system;
- reusable layout patterns;
- seed/scenario system;
- generated project documentation.

### First recipe set
Priority order:
1. auth;
2. profiles;
3. organisations/RBAC;
4. admin;
5. email;
6. uploads;
7. analytics;
8. observability;
9. notifications;
10. audit log;
11. lead generation;
12. SEO;
13. billing;
14. AI capability layer;
15. search;
16. PWA.

Recipes should carry their own schema/migrations, UI, services, tests and compatibility metadata where applicable.

### Exit gate
A valid manifest deterministically generates a runnable, tested repository containing only the selected capabilities and no domain-specific baggage.

---

## Phase 3 — Company, Content and Asset Intelligence

### Purpose
Allow the factory to build from messy real-world source material rather than requiring manually prepared content.

### Build
- URL/existing-site intake;
- document/PDF parsing pipeline;
- Word/text content intake;
- spreadsheet/CSV understanding pipeline;
- structured company knowledge pack;
- fact provenance and confidence;
- generated-copy separation;
- image/logo/screenshot asset inventory;
- image metadata, optimisation and responsive variants;
- duplicate/low-resolution detection;
- brand/reference analysis;
- SEO/local SEO research outputs;
- lead-generation content inputs;
- source caching so the same material is not repeatedly sent to AI.

### Knowledge pack outputs
- facts;
- brand;
- assets;
- content;
- references;
- requirements;
- research.

### Exit gate
A business pack containing a URL, logo, photos, PDF and spreadsheet can be normalised once into trusted structured inputs consumed by later build stages.

---

## Phase 4 — Full Builder Console

### Purpose
Turn the factory engine into a private Lovable/Bolt-style working environment.

### Build
- prompt/chat panel;
- drag-and-drop inputs;
- live desktop/tablet/mobile preview;
- click-to-select elements;
- click-to-edit text/assets/components;
- asset manager;
- build plan and agent-progress view;
- test/health view;
- versions/checkpoints/restore;
- connections/secrets status;
- database/log views;
- cost meter;
- preview deployment;
- production deployment controls.

### Important boundary
The console is a client of factory contracts. Generated projects never require the console to run.

### Exit gate
A project can be created, inspected, edited, versioned and preview-deployed from the Builder Console without needing a separate IDE for ordinary workflows.

---

## Phase 5 — Low-Credit AI Orchestration

### Purpose
Add AI where it creates value without turning the factory back into expensive repeated generation.

### Build
- product bootstrapper;
- deterministic task router;
- compact context packet builder;
- model router based on complexity/cost;
- per-task token/cost budgets;
- specialist roles for architecture, implementation, UX/design, content and review;
- machine-readable task outputs;
- bounded fix loops;
- cached project knowledge;
- prompt/version tracking;
- structured AI usage/cost telemetry.

### Default budgets
- routing/classification: deterministic or <=2k tokens;
- ordinary implementation: <=15k;
- complex feature/bug: <=35k;
- architecture/security review: <=60k.

### Exit gate
Every model call has a reason, scoped context and recorded cost. Common project generation remains mostly deterministic.

---

## Phase 6 — Quality and Autonomous Verification

### Purpose
Make a one-prompt build trustworthy enough to use rather than merely impressive.

### Build
- unit tests;
- integration tests;
- E2E journeys;
- accessibility gates;
- security checks;
- dependency checks;
- performance budgets;
- visual regression screenshots;
- mobile/tablet/desktop checks;
- empty/loading/error/large-data scenarios;
- slow/offline/failing-API scenarios where relevant;
- AI visual review only after deterministic checks;
- independent second-opinion review for material changes;
- bounded autonomous corrections;
- deployment smoke tests.

### Exit gate
The factory can produce a quality report where deterministic checks are green and any AI review findings are resolved or explicitly accepted.

---

## Phase 7 — Launch, Operations and Upgrade Propagation

### Purpose
Handle what happens after the code exists.

### Build
- domain/DNS/SSL checklist;
- redirect/canonical/sitemap/robots setup;
- analytics and observability activation;
- feedback intake;
- launch readiness report;
- production smoke checks;
- post-launch audit workflow;
- handover/architecture documentation;
- module version inventory per generated app;
- upgrade proposal/propagation mechanism;
- reusable pattern promotion workflow.

### Exit gate
A project can move from approved preview to production with a repeatable launch process and can later receive safe foundation upgrades.

---

## Phase 8 — Evidence-Driven Factory Improvement

### Purpose
Make every completed project reduce the work and AI spend required by the next one.

### Build
- project outcome/feedback records;
- question usefulness metrics;
- default acceptance rates;
- rework cause classification;
- token/cost/time metrics;
- recipe reuse metrics;
- candidate pattern promotion reports;
- questionnaire update proposals;
- benchmark suite across project categories;
- one-prompt build scorecard.

### Factory improvement rule
No automatic silent mutation. Evidence creates a proposed diff/version, which is reviewed and tested before adoption.

### Exit gate
Repeated builds measurably reduce manual intervention and AI cost without reducing quality.

---

# 3. Project templates targeted

The factory should eventually support these first-class modes:

1. **Marketing/business website** — public pages, company content, local SEO, leads, assets.
2. **B2B SaaS** — organisations, roles, data, admin, uploads, integrations, optional billing.
3. **Consumer app** — accounts, profiles, notifications, engagement and optional PWA.
4. **Internal tool** — authenticated workflow/data interfaces with minimal public surface.
5. **Content site** — publishing, SEO, structured content and analytics.
6. **AI-first app** — structured AI capability with budgets, evaluations and fallbacks.

Additional project types should only be added when their default architecture/question set is materially different.

---

# 4. Build lifecycle once complete

`Input -> Intake -> Build Contract -> Approval -> Manifest -> Deterministic Generation -> Novel AI Work -> Deterministic QA -> Targeted AI Review -> Preview -> Approval -> Production -> Monitor -> Improve Factory`

At every stage the system should persist structured state so a later agent does not need to rediscover decisions.

---

# 5. Cost-efficiency target

For ordinary business websites, target **~90% deterministic/reusable and ~10% generative** once the factory matures.

For custom SaaS applications, target **~60–75% deterministic/reusable and ~25–40% generative**.

These are direction-of-travel targets, not artificial quotas. Novel product logic should not be forced into generic recipes merely to improve the percentage.

---

# 6. Definition of a successful v1

App Builder v1 is successful when all of the following are true:

- a new project can start from a short idea plus optional real company/source material;
- the adaptive intake catches high-impact requirements before coding;
- the user approves a concise Build Contract;
- a manifest selects the correct project template and modules;
- a real repository is generated deterministically;
- generic capabilities are installed from proven recipes rather than regenerated;
- AI receives bounded context and explicit cost budgets;
- the application can be visually previewed and edited in the Builder Console;
- automated quality gates run before release;
- the project can be preview/production deployed;
- the output remains a normal repository;
- project evidence can improve future questionnaire defaults and reusable recipes through reviewed versioned changes.

---

# 7. Immediate execution order

Current work should proceed in this order:

1. **Phase 1A:** intake session contract + questionnaire engine.
2. **Phase 1B:** deterministic Build Contract and manifest generation.
3. **Phase 1C:** interactive Console questionnaire and approval flow.
4. **Phase 1D:** tests across six project types and three intake depths.
5. Merge Phase 1 only when CI is green and the end-to-end no-LLM intake flow works.
6. Begin Phase 2 with one neutral generated project and the smallest high-value recipe set.

This document is the human-readable delivery plan. `AGENTS.md` remains the root engineering authority; schemas/config remain the machine-readable authority for their respective contracts.