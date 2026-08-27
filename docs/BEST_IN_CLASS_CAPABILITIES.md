# Best-in-Class Capability Plan

Status: **planning authority for capability improvements**. This document records the high-value findings from repository audit and current web-builder prior art. It does not make any dependency or capability ready by itself.

The governing rule remains: adopt a tool, library or product pattern only when it removes repeated work, closes a correctness/security gap, or materially improves generated-product quality. App Builder should not accumulate dependencies simply because leading builders use them.

## 1. Immediate correctness work — P0 ✅ delivered

All four shipped as Phase 3.8A–3.8D. They are recorded here only so the register does not read as
though they are still open; the acceptance each was held to is now a test.

- **1.1 ChangeSet path/scope hardening** — normalized, segment-correct semantics with traversal,
  absolute and ambiguous forms rejected before matching. *No path outside the declared file scope can
  be accepted because it shares a textual prefix with an allowed path*, held by adversarial cases and
  `fast-check` property tests.
- **1.2 One contract source of truth** — `JSON Schema -> packages/contracts types -> Ajv boundary
  validation`, with `npm run contracts:check` failing CI on generated-contract drift. Structural
  validity stays separate from buildability: a schema may represent a capability the adapter registry
  later marks unavailable or custom-work.
- **1.3 Executed Supabase RLS tests** — pgTAP through `supabase test db`, authenticating as real
  users. *A user from organisation A cannot read or mutate protected organisation B data in an
  executed database test.*
- **1.4 Accessibility baseline earlier than Phase 6** — `@axe-core/playwright` in canonical
  generated-app browser acceptance, failing on serious/critical violations at representative desktop
  and mobile widths. Manual and AI judgement stay for what axe cannot establish.

## 2. Interoperability and deterministic tool surface — P1

### 2.1 MCP v2 facade over `apps/service` — 9.5/10

MCP should expose the real factory service, not shell wrappers around duplicated prompt logic.

Target:

`Codex / ChatGPT / Claude Code / OpenCode / other MCP clients -> MCP adapter -> apps/service tool contract -> factory/control plane`

Initial safe tools should cover:
- project create/read;
- manifest/knowledge/composition reads;
- deterministic generate/recompose operations;
- project verification;
- preview start/status/stop;
- task/event/checkpoint/metric reads.

Do not expose through the initial MCP surface:
- production deploy;
- production database writes;
- arbitrary filesystem paths;
- raw secret values;
- unrestricted shell execution.

Use the current MCP TypeScript v2 server package when implementation begins. Keep MCP as an adapter; stable factory contracts remain provider-neutral.

### 2.2 HTTP framework decision — Hono 7/10, conditional

Do not rewrite `apps/service` merely to adopt a framework. Evaluate Hono when the Phase 4 Console starts duplicating request/response types or route plumbing.

Adopt only if it demonstrably reduces transport boilerplate while keeping `packages/contracts` as the contract authority. Hono RPC types must not become another independent source of truth.

## 3. Generated-product architecture — P1/P2

### 3.1 Second static/content-oriented template — 10/10

One React/Vite SPA template is not the ideal output for every project class.

Plan:
- preserve the application-oriented React template for SaaS, consumer, internal-tool and AI-app modes;
- add a genuinely different static/content-oriented template for marketing and content-heavy sites after the current composition contract is stable;
- evaluate Astro first because static HTML is the default while React islands can still handle interactive sections;
- prove the template contract with the same Manifest/PageSpec/SectionSpec inputs and independent acceptance gates;
- keep output portable and host-adapter-neutral.

Expected benefit:
- better crawlability and page-level metadata;
- smaller default JS payload;
- easier build-time structured data/social assets/search;
- clearer separation between content sites and application shells.

### 3.2 Static search with Pagefind — 8.5/10

For marketing/content sites, a backend search service should not be the default.

Plan:
- make Pagefind a deterministic search recipe for compatible static/content templates;
- generate/index records from PageSpec/CollectionSpec/content outputs;
- keep Supabase or other backend search as a separate architecture for dynamic application data;
- mark `search` ready by implementation path rather than pretending one implementation fits every project type.

### 3.3 Rich structured data — `schema-dts` 8.5/10

The existing SEO recipe has only a shallow `WebSite` JSON-LD baseline. Upgrade it using trusted knowledge rather than generated claims.

Deterministically derive where evidence supports it:
- `Organization`;
- `LocalBusiness`;
- `Service`;
- `Person`;
- `FAQPage`;
- `Article`;
- `BreadcrumbList`;
- `WebSite`.

Use typed schema structures as a factory/build-time dependency, and prefer build-time HTML output on static templates.

### 3.4 Deterministic social/OG imagery — Satori + existing Sharp — 8/10

Plan:
- render page/project social-card layouts from Design Contract tokens, brand assets and page metadata;
- use Satori for deterministic HTML/CSS -> SVG generation;
- reuse the factory's existing Sharp dependency for raster output unless a demonstrated limitation requires another renderer;
- generate per-page 1200x630 assets without an AI/image-generation call.

### 3.5 Static icon pipeline — Lucide static assets — 8/10

Do not add `lucide-react` to generated applications by default.

Plan:
- use a pinned Lucide/static icon source in the factory;
- map semantic intents such as trust/location/phone/email/security/analytics to reviewed icon choices;
- copy or inline only the selected SVGs into the generated repository;
- retain accessible labels/hidden semantics where icons communicate meaning;
- let DesignSystemSpec override mappings when a project supplies its own icon system.

## 4. Design-system intelligence — P2, major differentiator

### 4.1 Design System Registry — 10/10

Use shadcn's registry model as architectural prior art, not as a mandatory generated-app dependency.

Separate two related registries:

**Capability Registry**
- auth;
- organisations;
- uploads;
- billing;
- analytics;
- search;
- notifications;
- etc.

**Presentation Registry**
- buttons;
- inputs/forms;
- cards;
- navigation;
- heroes;
- pricing;
- FAQ;
- testimonial/proof blocks;
- dashboard shells;
- tables;
- empty/loading/error states;
- content/editorial patterns.

A presentation registry item should be able to declare:
- stable id/version;
- files and generated targets;
- package dependencies if unavoidable;
- required design tokens;
- supported content-binding contract;
- accessibility requirements;
- responsive behavior;
- interaction states;
- variants;
- allowed child/primitives;
- compatibility with templates/project types;
- managed-file ownership and upgrade rules;
- visual/acceptance examples.

### 4.2 `DesignSystemSpec` — 10/10

Extend the existing Design Contract with a machine-readable design-system layer covering:
- typography scale and font roles;
- color/token roles;
- spacing/radius/shadow scales;
- icon system;
- primitives and allowed components;
- section families/variants;
- interaction states;
- responsive rules;
- motion rules;
- imagery rules;
- accessibility constraints;
- adopt/avoid reference intent.

This must constrain both deterministic renderers and later AI work so a model cannot silently create a second design system.

### 4.3 Deterministic design-system linting — 9/10

Add checks that can reject:
- arbitrary colors outside a locked token set;
- arbitrary spacing/radius values when a scale is active;
- forbidden typography variants;
- duplicate local components when a registry component exists;
- unapproved icons;
- inaccessible state combinations.

AI visual review comes after these deterministic checks.

### 4.4 Visual Design Canvas and controlled variants — 10/10

The Builder Console should eventually let users explore several candidate layouts without fragmenting project truth.

Plan:
- produce bounded candidate design/composition variants from the same PageSpec/content facts;
- show them on an infinite/large visual canvas or comparable comparison surface;
- support desktop/tablet/mobile and hover/active state previews;
- select/promote one variant into the durable Design Contract/SectionSpec state;
- record why variants were accepted/rejected as evidence;
- avoid silently maintaining divergent unofficial copies of the product.

## 5. Builder Console product depth — P2/P3

### 5.1 Environment model — 10/10

Introduce explicit development/preview/production environment identity before deploy controls become powerful.

Each environment should own or reference:
- deployment target;
- backend/project identity;
- database migration state;
- integration configuration status;
- scoped secrets;
- allowed actions;
- preview URL;
- release/checkpoint identity.

A preview agent/project must not accidentally operate against production data because environment identity was implicit.

### 5.2 First-class CMS/content collections — 9.5/10

A content-site mode needs structured content, not only page sections.

Introduce a `CollectionSpec` covering:
- collection id/type;
- fields and validation;
- references/relationships;
- slug strategy;
- draft/published state;
- SEO mapping;
- locale support;
- author/editor metadata where relevant.

Storage may be local/static, Supabase or a future CMS adapter. The content model stays provider-neutral.

### 5.3 Localization as a contract — 9/10

Introduce `LocaleSpec` for:
- primary/fallback locales;
- localized page routes/slugs;
- localized bindings/content records;
- localized images/assets where required;
- metadata/OpenGraph/hreflang;
- translation status and review state.

AI translation is an optional implementation mechanism, not the architecture.

### 5.4 Figma/design import and component mapping — 9/10

Later Phase 4 should support importing design reference data into Design Contract/DesignSystemSpec rather than blindly generating code from screenshots.

Goal:
- map known Figma/design components/tokens onto registered production components;
- preserve project-owned components;
- record unmatched/novel design pieces as explicit custom work;
- keep changes flowing back through ordinary repo diffs/PRs.

### 5.5 Existing-repository adoption mode — 9/10

App Builder should eventually improve existing repositories as well as create new ones.

Flow:
- inspect repository authorities/framework/contracts;
- identify existing design system/components/data/backend/deployment;
- create an adoption inventory rather than regenerating the app;
- map compatible factory capabilities/quality gates onto the repo;
- introduce managed ownership only for explicitly adopted files/components;
- preserve normal Git history and project conventions.

## 6. SEO/AEO, experimentation and continuous improvement — P3/P4

### 6.1 Deterministic SEO/AEO scanner — 8.5/10

Before deploy, audit generated public sites for:
- page titles/descriptions;
- canonical URLs;
- robots/sitemap consistency;
- heading hierarchy;
- alt text coverage;
- structured data validity/presence;
- internal links;
- social metadata/assets;
- indexability mistakes;
- local-business/service evidence where applicable.

Keep AI-generated SEO advice optional and downstream of deterministic findings.

### 6.2 Controlled experiments/A-B testing — 8.5/10

After analytics and stable deployment are mature:
- define experiment/variant contracts;
- route traffic safely;
- preserve attribution and sample boundaries;
- promote a winner through a reviewed change rather than silent runtime mutation;
- record conversion evidence into the factory improvement system.

### 6.3 Personalization — 8/10, later

Only after experiments/analytics/privacy rules are mature. Personalization should be explicit, measurable and reversible, not hidden generative page mutation.

## 7. Specialist-agent capabilities — P2, differentiator

The specialist-agent organisation, its handoff/rework/convergence contracts and its design-side
artifacts are specified in `docs/AGENT_SPECIALIST_ARCHITECTURE.md`,
`docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` and `docs/DESIGN_INTELLIGENCE.md`. The capability-level
findings that justify them:

### 7.1 Roles separated by decision boundary — 10/10

Agents named after languages cannot be reviewed meaningfully. Agents that own a decision can. The
registry in `config/agent-roles.json` gives each role bounded reads, writes, skills, tools, mutation
scope, budget and a named independent reviewer.

### 7.2 No self-approval — 10/10

Delivered in Phase 3.8H and enforced deterministically rather than by prompt wording.

### 7.3 Convergence engine — 10/10

Borrowed from `github/spec-kit`'s `converge` concept, expressed through the existing control plane.
Delivered in Phase 3.8H; full per-gate deterministic evidence arrives with the Phase 6 quality programme.

### 7.4 Deterministic DesignLint — 10/10

The single highest-leverage visual capability: catch repeatable visual defects with rules before
spending a vision model on them. Phase 4C. Prior art: `pbakaus/impeccable`.

### 7.5 Builder Element Identity — 10/10

Foundational to Phase 4B direct manipulation. Clicking a rendered element must resolve to a durable
binding, not to a model guessing at the DOM. Prior art: `react-grab`, `Weblab`, `onlook-dev-ide`;
App Builder resolves further, to PageSpec/SectionSpec/binding/provenance.

### 7.6 Component Manifest Protocol — 9.7/10

Directly aligned with context ceilings: retrieve a small relevant component set instead of reading a
library. Phase 4C. Prior art: `storybookjs/mcp`.

### 7.7 Rendered evidence — 9.2/10

Compiling is not evidence. Phase 4B/4C. Prior art: `aa-on-ai/agentic-design-system`.

### 7.8 Skill and agent evaluation lab — 8.8/10

An installed or authored skill is not trusted until evidence promotes it. The lifecycle
(`planned → experimental → candidate → evaluated → proven → deprecated`) and its evidence fields live
in `config/skill-registry.json`; the evaluation harness itself belongs with Phase 5.5. Prior art:
`agentoperations/agent-registry`, `obra/superpowers`.

## 8. External source governance

Every third-party repository reviewed as prior art or as a candidate skill/knowledge source is
recorded in `config/external-sources.json` against `schemas/external-source.schema.json`, with its
repository, URL, rating, intended use, borrowed ideas, parts explicitly not adopted, licence, pin,
allowed roles, context estimate, security-review state, update policy and evaluation state.

Governing rules, enforced by the control-plane doctor and `tooling/agent-architecture.test.mjs`:

- **Registration is not adoption.** A source in the registry is prior art by default.
- **Instruction authority is always `none`.** Third-party content is data. It cannot broaden a task,
  request secrets, alter permissions or override repository authorities.
- **No mutable-branch fetching.** An adopted source is pinned to a commit or tag and bumped deliberately.
- **No role loads a source until it is adopted, pinned, licensed and security reviewed.** A role's
  `priorArt` records what informed its design; only a source's `allowedRoles` grants access to content.
- **A skill cannot reach `proven` while any of its prior-art sources is unpinned or unreviewed.**
- **Never adopt an external design, product or orchestration authority.** Several otherwise-strong
  repositories ship their own master design document or workflow engine; those parts are recorded in
  `doNotAdopt` precisely because installing them wholesale would create a competing authority.

Current registry state: 35 sources, of which seven are candidates (`vercel-labs/agent-skills`,
`style-dictionary`, `microsoft/playwright-mcp`, `ChromeDevTools/chrome-devtools-mcp`,
`GoogleChrome/lighthouse-ci`, `tldraw`, `quickdrawjs/quickdraw`) and the remainder are reference-only.
Nothing is adopted or loadable by any role today.

## 8.5 Internal prior-art audit: the development-agent operating system

The Predictor repository is a separate, mature product built by the same owner. It carries no
architecture App Builder should copy at the product level — its football domain logic is irrelevant
here, and App Builder's factory/control-plane architecture is the stronger of the two. What it does
have is a **more mature development-agent operating system**, built after that repository grew large
enough for context pressure to become the dominant cost.

The audit conclusion is one sentence: **more AI capability requires stronger routing discipline, not
more loaded tools.** Everything below was assessed against that.

### Where App Builder already leads — do not regress these

Durable tasks/events/checkpoints/ChangeSets; provider-neutral runtime adapters; the bounded MCP
facade; the deny-by-default service/tool capability model; generated-repository portability; the
genuine-business evidence model; source/asset provenance and rights state; executed Supabase RLS
acceptance; generated-app axe checks; the factory benchmark harness; canonical schemas with generated
contracts; and the role/pipeline/gate/convergence model from Phase 3.8H. Where the prior art has an
older equivalent, App Builder keeps its own.

### Mechanisms adopted

Adopted from the prior art, with the home that owns each. **Delivery status is deliberately not
recorded here** — `config/factory-status.json` and `docs/ROADMAP.md` own that, and a second status
column is a second thing to keep true.

| Mechanism | Score | Home |
| --- | --- | --- |
| Deterministic routing acceptance benchmarks with positive **and** negative triggers | 10/10 | `config/agent-routing-benchmarks.json`, `npm run agent:bench` |
| First-orientation context ceilings (paths, authorities, roles, skills, packet bytes) | 10/10 | `packet` in `config/agent-routing.json` |
| Skill role/load budget — installed is not loaded | 10/10 | `loadClass` + `skillLoadBudget` |
| Immutable external skill-source registry (pin, licence, security review, allowed roles) | 10/10 | `config/external-sources.json` |
| Skill evaluation with baseline-vs-candidate comparison | 10/10 | `config/skill-registry.json` |
| Journey Closure specialist and gate | 10/10 | `journey-closure` role/gate |
| State Matrix specialist and gate | 9.8/10 | `state-matrix` role/gate |
| Genuinely independent second opinion (different model/runtime) | 9.8/10 | `independent-second-opinion` role |
| Conditional differential review driven by risk classification | 9.8/10 | `config/risk-surfaces.json`, `packages/control-plane/src/risk.js` |
| Architecture dependency gate | 9.7/10 | Stage Q1 |
| Curated visual regression contracts | 9.7/10 | Stage Q2 |
| Compound learning closeout | 9.6/10 | `compound-learning` role |
| Graph-assisted repository navigation | 9.5/10 | `docs/AGENT_RUNTIME.md`, deliberately later |
| Environment contract guardian and `EnvironmentIdentity` | 9.5/10 | `environment-guardian` role |
| Tool responsibility map — one question per tool | 9.4/10 | `docs/ENGINEERING_QUALITY_PROGRAMME.md` |
| Product Opportunity Scout for broad prompts | 9.4/10 | `product-opportunity-scout` role |
| Lighthouse-style performance and payload budgets | 9.3/10 | Stage Q4 |
| Component/state preview surface (evaluate Storybook) | 9.2/10 | Stage Q3, conditional |
| Supply-chain and workflow hardening, staged | 9.2/10 | Stage Q9 |
| Design-token enforcement beyond DesignLint | 9/10 | Stage Q5 |
| Dead-code/unused-dependency analysis | 8.8/10 | Stage Q6 |
| Property-based testing (`fast-check`) | 8.7/10 | Stage Q7 |
| Targeted mutation testing | 8.4/10 | Stage Q8 |
| Bundle analysis | 8.4/10 | Stage Q4 |

### Adaptations, not copies

- The prior art routes prompts to **skills**; App Builder routes them to **roles** that then carry a
  bounded skill packet, because App Builder's decision boundaries and reviewer independence already
  live at role level.
- Its skill-source registry uses `routed` / `conditional-review` / `catalogue-only` modes. App
  Builder expresses the same distinction through `adoption` plus `allowedRoles`: a source with no
  allowed roles is catalogue-only by construction, and conditional review is expressed by the role
  being an `onDemandRole` rather than a pipeline stage.
- Its graph/symbol/context-pack tool split assumes a large existing repository. App Builder plans the
  same layer but deliberately later: adopting a graph tool now would add a dependency to answer a
  question that bounded search still answers.

### Deliberately rejected

- **Copying any product-domain skill, prompt, workflow or authority.** The contamination guard exists
  for this reason.
- **A repository-wide "load every tool" workflow.** Tools are selected by the question at hand.
- **Making a graph or index authoritative.** Graph output is navigation evidence; source, schemas and
  tests remain truth.
- **A parallel memory/lessons documentation tree.** Compound learning writes into an existing durable
  home or writes nothing.
- **Adopting a tool per capability wholesale.** Every engineering-gate item carries an evaluation step
  and an explicit "adopt only if it beats the existing deterministic check" condition.
- **Multi-persona review presented as independence.** Independence requires a different model or
  runtime; when none is available the skip is reported.

## 9. Tooling decisions explicitly not made

Do **not** adopt these by default merely because they appeared in research:
- `lucide-react` as a generated runtime dependency;
- a second SVG rasterizer while Sharp already solves the output need;
- Hono before transport duplication justifies it;
- large orchestration frameworks such as Temporal/LangGraph while the existing control-plane primitives remain sufficient;
- a proprietary design/runtime format that makes generated repositories dependent on App Builder;
- a screenshot-to-code generation architecture that bypasses PageSpec/SectionSpec identity;
- a third-party master design document, workflow engine or agent registry as a second authority;
- an infinite canvas dependency before the contracts it would compare exist;
- loading every registered skill into every agent;
- a graph/index tool as a required dependency, CI gate or repository authority;
- a second memory/lessons documentation tree;
- multi-persona review on one model presented as an independent second opinion;
- repository-wide mutation testing, or any blocking gate whose output has not been baselined.

## 10. Priority bands

**This register does not sequence delivery.** `docs/ROADMAP.md` owns the ordered path; the bands below
are the relative priority of the items *within this register*, and several of the P0/P1/P2 entries have
since shipped. Read a band as "how much this is worth", not as "what to do next", and check
`config/factory-status.json` before treating any line here as outstanding.

### P0 — before broad Phase 4 work
1. harden ChangeSet path matching and add property tests;
2. unify schema/types/runtime validation;
3. execute real Supabase RLS tests;
4. add generated-app accessibility baseline;
5. complete the genuine real-business acceptance and measure meaningful edits.

### P1 — service/interoperability/output foundations
6. add MCP v2 facade over the service tool contract;
7. prove a static/content-oriented second template;
8. add Pagefind static search where appropriate;
9. upgrade structured data and deterministic OG/social assets.

### P2 — Builder Console differentiators
10. land Builder Element Identity and the RenderedEvidence foundation before enabling direct manipulation;
11. create Presentation Registry + DesignSystemSpec + Component Manifest Protocol;
12. add the design-intelligence catalogue;
13. add static semantic icon pipeline;
14. add deterministic design-system linting and DesignLint;
15. build visual variant/canvas workflow last, after its contracts exist;
16. add explicit environment model.

### P3 — mature web-builder capabilities
17. add CollectionSpec/CMS workflow;
18. add localization contract;
19. add Figma/design-system mapping;
20. add existing-repo adoption;
21. add deterministic SEO/AEO audit;
22. wire every convergence gate to its own deterministic evidence.

### P4 — optimization loop
23. build the skill/agent evaluation lab and promote skills on recorded evidence;
24. experiments/A-B testing;
25. controlled personalization;
26. feed measured results into reviewed/versioned factory improvements.

The dedicated Hetzner/OpenCode autonomous runtime remains later than these foundational safety/product joins. MCP provides early interoperability without making OpenCode or any model provider the source of project truth.