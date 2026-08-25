# Best-in-Class Capability Plan

Status: **planning authority for capability improvements**. This document records the high-value findings from repository audit and current web-builder prior art. It does not make any dependency or capability ready by itself.

The governing rule remains: adopt a tool, library or product pattern only when it removes repeated work, closes a correctness/security gap, or materially improves generated-product quality. App Builder should not accumulate dependencies simply because leading builders use them.

## 1. Immediate correctness work — P0

### 1.1 ChangeSet path/scope hardening — 10/10

The current control-plane scope matcher is security-sensitive. Before autonomous mutation grows, replace prefix-like matching with normalized, segment-correct glob semantics and reject path traversal/absolute-path edge cases before matching.

Plan:
- normalize repository-relative paths before policy checks;
- reject `..`, absolute paths, invalid separator tricks and ambiguous path forms;
- prefer the Node 22 native glob matcher when it satisfies the required semantics rather than adding a dependency;
- add adversarial unit tests for `src/**` vs `src2/**`, sibling-prefix collisions, Windows separators, repeated separators and overlapping allow/deny rules;
- add `fast-check` property tests around allowed/forbidden/expected file matching;
- keep fail-closed ChangeSet behavior.

Acceptance: no path outside the declared file scope can be accepted because it shares a textual prefix with an allowed path.

### 1.2 One contract source of truth — 10/10

Manifest/build/service contracts must stop drifting between JSON Schema, handwritten TypeScript and handwritten runtime validators.

Target architecture:

`JSON Schema -> generated TypeScript contracts -> Ajv boundary validation`

with **buildability/readiness kept separate from structural validity**.

Plan:
- make `/schemas` the canonical machine-readable contract source;
- generate shared types into `packages/contracts`;
- validate external/service/file boundaries with Ajv using the repository's JSON Schema dialect;
- remove duplicated enums and validation logic from handwritten validators as migrations complete;
- add `contracts:generate` and `contracts:check` so CI fails on generated-contract drift;
- preserve the difference between valid user intent and currently supported implementation: a schema may represent a deployment/capability that the adapter registry later marks unavailable/custom-work.

Candidate tooling:
- `ajv`;
- `json-schema-to-typescript` or an equivalent schema-to-TypeScript generator, selected after a small proof against the current schemas.

### 1.3 Executed Supabase RLS tests — 10/10

Static regex tests remain useful smoke checks, but they are not proof of tenant isolation.

Plan:
- run generated Supabase migrations in a local Supabase/Postgres test environment;
- use pgTAP through `supabase test db`;
- use Basejump Supabase test helpers where they materially simplify user creation/auth context;
- prove user/org matrices by actually authenticating as specific users;
- cover owner/admin/editor/member/viewer, unauthenticated access, cross-org reads/writes and update `WITH CHECK` behavior;
- make executable RLS acceptance part of the recipe release gate for profiles/organisations/admin where relevant.

Acceptance: a user from organisation A cannot read or mutate protected organisation B data in an executed database test.

### 1.4 Accessibility baseline earlier than Phase 6 — 9/10

Accessibility is deterministic and cheap enough to run during generated-app acceptance rather than waiting for the later autonomous-quality phase.

Plan:
- add `@axe-core/playwright` to canonical generated-app browser acceptance;
- fail on agreed serious/critical violations first, then tighten the baseline as false positives are understood;
- run responsive checks at representative desktop/mobile widths;
- keep manual/AI accessibility judgement for issues that axe cannot establish.

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

## 7. Tooling decisions explicitly not made

Do **not** adopt these by default merely because they appeared in research:
- `lucide-react` as a generated runtime dependency;
- a second SVG rasterizer while Sharp already solves the output need;
- Hono before transport duplication justifies it;
- large orchestration frameworks such as Temporal/LangGraph while the existing control-plane primitives remain sufficient;
- a proprietary design/runtime format that makes generated repositories dependent on App Builder.

## 8. Recommended implementation order

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
10. create Presentation Registry + DesignSystemSpec;
11. add static semantic icon pipeline;
12. add deterministic design-system linting;
13. build visual variant/canvas workflow;
14. add explicit environment model.

### P3 — mature web-builder capabilities
15. add CollectionSpec/CMS workflow;
16. add localization contract;
17. add Figma/design-system mapping;
18. add existing-repo adoption;
19. add deterministic SEO/AEO audit.

### P4 — optimization loop
20. experiments/A-B testing;
21. controlled personalization;
22. feed measured results into reviewed/versioned factory improvements.

The dedicated Hetzner/OpenCode autonomous runtime remains later than these foundational safety/product joins. MCP provides early interoperability without making OpenCode or any model provider the source of project truth.