# Platform Parity Programme

Status: **subordinate capability-planning detail** under `docs/MASTER_PLAN.md` and `docs/BEST_IN_CLASS_CAPABILITIES.md`.

This document does not advance `config/factory-status.json`, create a new product/design authority, or make a capability ready. It records the remaining product-surface work needed for App Builder to compete with the current class of AI builders and visual website platforms while preserving App Builder's stronger provenance, portability and safety boundaries.

The rule is not “copy every competitor feature”. Add a capability only when it materially improves one of these outcomes:

- prompt/brief to working product speed;
- professional visual quality;
- breadth of real applications the factory can finish without custom glue;
- non-technical editing and review;
- deployment/operations completeness;
- integration breadth;
- autonomous execution quality;
- generated-repository portability and owner control.

## Competitive product gap summary

The current architecture is already strong in source provenance, durable build state, deterministic generation, generated-repository portability, executable quality gates and bounded agent authority. The remaining parity gap is primarily **product completeness**, not another control-plane rewrite.

Leading builders currently make several workflows feel routine that App Builder still has only partly delivered or planned:

1. connect database/auth/storage/payments/email/third-party services from the same build flow;
2. branch or isolate work, preview it, review a diff and promote it without manual Git choreography;
3. visually edit layout, typography, responsive behaviour, assets and component choices with low friction;
4. invite a stakeholder to review/comment/approve a staged result;
5. publish to a custom domain with environment variables, logs, analytics, monitoring, rollback and staging visible in one place;
6. search the web or inspect reference sites during research and design;
7. keep CMS/localized content current after launch;
8. let bounded agents test, repair and maintain products after the initial build.

The following work closes those gaps without weakening the existing architecture.

---

# 1. Phase 1 / Phase 4D extension — first-class research and inspiration input

**§1.1 and §1.2 are delivered (4D.2).** The Builder Console's "Design inspiration" panel takes public
URLs, screenshots and a sentence; capture is a factory-side Chromium behind
`assertPublicEgressDestination` with every redirect hop re-classified; the analysis contract is
`schemas/visual-reference-analysis.schema.json`; and approved adopt/avoid traits steer the existing
ArtDirectionPlan. `docs/DESIGN_INTELLIGENCE.md` §4 owns the design of it and is the authority; what
remains below is the discovery half — §1.3, which needs a runtime-proven public-egress research role and
is deliberately not part of it. Figma references remain unimplemented and have no supplier.

## 1.1 “Sites/designs I like” intake

The Builder Console should make inspiration input easy enough for a non-designer to use.

Accept:

- public URLs;
- uploaded screenshots;
- moodboards/images;
- Figma references when available;
- optional natural-language notes such as “I like this site's typography but not its colours”.

Do not treat design references as company facts or as reusable source content.

Required flow:

`user reference -> trusted browser/reference capture -> VisualReferenceAnalysis -> adopt/avoid traits -> ArtDirectionPlan`

A reference should be able to influence dimensions independently:

- typography;
- layout/grid;
- spacing/density;
- imagery treatment;
- interaction/motion;
- navigation;
- colour relationships;
- visual mood/distinctive patterns.

The system must preserve the distinction between:

- **company/source truth** -> KnowledgePack;
- **market/competitor research** -> ResearchPack;
- **user design inspiration** -> reference-only visual evidence.

## 1.2 Trusted reference capture

Prefer a factory-owned browser capture path for supplied inspiration URLs rather than asking an untrusted coding sandbox to scrape arbitrary sites directly.

Capture, where useful:

- desktop/mobile screenshots;
- key navigation/open states;
- high-level DOM/layout metadata;
- URL, timestamp and content/evidence hashes.

Internet content has `instructionAuthority: none`. Text inside a reference website is data, not an instruction to an agent.

## 1.3 Research-agent execution

Once the runtime's `public-egress-only` profile is proven, promote a bounded research role through the ordinary runtime-readiness gate.

Research should support:

- company/sector research;
- competitors and category conventions;
- current technical documentation;
- design reference discovery;
- cited market evidence.

Prefer brokered/search tools where they give better provenance, allowlisting and rate control than unrestricted HTTP. General public egress remains available only to roles whose policy explicitly grants it.

---

# 2. Phase 4B / 4D extension — professional visual-editing parity

ElementIdentity gives App Builder a stronger editing foundation than DOM guessing. The remaining work is to make that power feel as immediate as mature visual builders.

Add, where supported by the presentation contract:

- drag/reorder sections through stable SectionSpec identity;
- duplicate/delete/hide section actions;
- swap compatible presentation variants/components;
- direct text editing with provenance preserved;
- typography role/family/scale controls constrained by TypographySpec;
- spacing/density/alignment controls constrained by DesignSystemSpec;
- responsive breakpoint preview and bounded per-breakpoint composition overrides;
- image replacement, crop, focal point and responsive asset choice;
- mobile/desktop visibility and interaction-language controls where the ResponsiveCompositionPlan permits them;
- component state preview for hover/focus/open/error/loading states;
- undo/redo and named checkpoint history;
- side-by-side before/after or candidate comparison.

Do not turn the Console into an unconstrained CSS editor by default. The normal path edits durable bindings/design contracts; explicitly custom code remains a separate advanced lane.

Exit evidence should include a non-technical user performing common visual corrections without editing source files.

---

# 3. Phase 4.3 / new Phase 4.4 slice — production application capability breadth

The existing capability registry has strong foundations but must gain enough real recipes that ordinary SaaS/consumer/internal-tool requests do not immediately fall into custom engineering.

Create a staged **Application Capability Expansion** programme after the immediate 4C/4D visual work and before claiming broad app-builder parity.

Prioritize capabilities by frequency and production risk.

## 3.1 Tier A — expected production primitives

Make these deterministic/provider-adapter capabilities where practical:

- transactional email;
- notifications/in-app notification centre;
- webhook receive/send;
- background jobs;
- scheduled/cron jobs;
- queues/retry/dead-letter handling where required;
- real-time subscriptions/events;
- file upload/download lifecycle beyond the existing baseline;
- audit/activity history for generated business applications;
- feature flags with environment-aware defaults;
- search implementations appropriate to static vs dynamic data.

Each capability needs:

- provider-neutral requirement contract;
- one proven adapter/recipe before `ready`;
- deterministic environment/secret requirements;
- test fixtures and failure states;
- independent generated-app portability;
- explicit cost/usage implications where relevant.

## 3.2 Billing and payments

Billing is too common to remain vague custom work.

Add a provider-neutral billing requirement/recipe boundary covering:

- one-time payments;
- subscriptions;
- plans/prices;
- checkout/customer portal;
- entitlement state;
- webhook reconciliation;
- failed-payment/cancellation states;
- test/sandbox vs production identities;
- refunds where the product requires them.

Stripe is a strong first adapter candidate, not the stable product contract.

Payment secrets and production account mutation remain approval-gated. Generated applications own their payment/provider account rather than making App Builder merchant of record unless a future business model explicitly changes that.

## 3.3 Auth/backend parity

Continue strengthening the existing Supabase path so an ordinary prompt can safely request:

- sign-up/login/password reset;
- OAuth/social auth where required;
- organisations/teams/invitations;
- RBAC;
- profiles;
- file storage;
- realtime;
- edge/server functions;
- admin workflows;
- migration/test/seed lifecycle.

Do not add a second backend merely for parity. Add another adapter only when a real benchmark demonstrates a project class the current provider cannot satisfy well.

---

# 4. Phase 4.4 — IntegrationSpec and connector platform

Integration breadth is one of the clearest practical gaps against leading builders.

Introduce a provider-neutral `IntegrationSpec` only when its first real consumers land. It should describe the integration requirement, not one vendor SDK.

Useful fields/concepts:

- integration id/type;
- connection owner (builder owner vs generated-app end user);
- auth method (OAuth/API key/webhook/etc.);
- requested scopes/permissions;
- read/write operations required;
- webhook/event subscriptions;
- environment-specific configuration;
- secret references, never secret values;
- connection health/status;
- rate-limit/retry expectations;
- data sensitivity;
- user-facing reconnect/disconnect behaviour;
- test/sandbox support;
- approval requirements;
- adapter/version identity.

## 4.1 Connection manager in Builder Console

Provide a simple Connections surface showing:

- configured / missing / unhealthy / expired;
- environments configured;
- scopes requested;
- reconnect/rotate/revoke;
- last successful check;
- which generated features depend on the connection.

## 4.2 End-user connections

Some products need the generated application's users to connect their own accounts. Model this separately from builder-owner secrets.

Examples include calendar, CRM, email, accounting or productivity integrations.

Requirements:

- per-user/tenant OAuth ownership;
- encrypted token storage in the generated product's backend;
- consent/scope display;
- revoke/reconnect;
- tenant isolation;
- background refresh where applicable;
- auditability.

## 4.3 Connector strategy

Do not attempt hundreds of hand-written connectors immediately.

Start with a small high-value adapter set driven by real builds, likely including categories such as:

- payments;
- transactional email;
- analytics;
- CRM;
- calendar/booking;
- communication;
- commerce;
- AI providers.

Where a standards-based MCP/API/automation adapter can expose a broad ecosystem safely, evaluate it as an implementation path while preserving `IntegrationSpec` as the product contract.

Every connector must be permission-scoped and observable; convenience must not create ambient credential access for autonomous agents.

---

# 5. Phase 4.3 / 4E — existing-product adoption/improvement and Git-native workflow

Existing-repository adoption is not only an import feature. It is the brownfield entry mode defined in `docs/MASTER_PLAN.md`: understand an existing product before changing it, then use the same bounded specialist, ChangeSet, evidence and review machinery to improve it without forcing it through greenfield defaults.

When an existing repository and/or live URL is supplied, the first significant mutation should be preceded by a **baseline and adoption map**. The exact evidence is risk/project dependent, but may include:

- repository identity and exact source revision;
- live/deployed URL and deployed revision when it can be established;
- framework, dependency, architecture, design-system, backend, data/auth and deployment shape;
- current source-of-truth/contract boundaries and known duplication/drift;
- representative user journeys and their current pass/fail/state coverage;
- desktop/mobile rendered evidence for relevant routes/states;
- browser/runtime console/network failures where relevant;
- accessibility, performance, security and SEO evidence where the requested improvement touches them;
- current tests/build/gates and obvious vacuity or missing-evidence risks;
- known-good behaviours that must be preserved;
- existing owner goals, complaints and accepted debt.

The URL and repository are complementary evidence. The repository explains implementation and architecture; the rendered product explains what a user actually experiences. A URL alone must not be used to invent deep architectural conclusions, and a repository alone must not be treated as proof that the shipped user journey works.

## 5.1 Diagnosis before mutation

A broad instruction such as “improve this site”, “take this product to the next level” or “fix this app properly” must route through product/opportunity diagnosis before implementation. Specialist findings are classified as:

- **keep** — current implementation/experience is sound and should be protected;
- **refactor** — behaviour is good but architecture/maintainability is weak;
- **redesign** — product behaviour is worth keeping but UX/visual presentation is weak;
- **replace** — an existing implementation is demonstrably worse than a bounded replacement;
- **remove** — capability/code no longer earns its complexity or harms the product;
- **add** — evidence supports a genuinely missing product capability.

This classification is a decision aid, not a licence for churn. “Replace” needs stronger evidence than “refactor”, and an adopted project must never be rewritten merely because the factory has a preferred template, library or recipe.

The specialist architecture should be used by decision boundary: product/IA/UX/design/architecture/security/performance agents receive only the evidence relevant to their question, and creators do not approve their own work. An architectural finding does not become a visual rewrite by accident, and a visual redesign cannot silently change domain rules.

## 5.2 Improvement Contract and bounded execution

Before material implementation, turn the approved diagnosis into a bounded improvement contract using existing project/task/Build Contract/ChangeSet primitives rather than inventing a second task system. It should identify:

- the baseline revision/evidence it compares against;
- intended outcomes and explicit non-goals;
- behaviours/invariants that must remain unchanged;
- accepted findings and their owning specialist/rework role;
- the files/capabilities/environments expected to change;
- the deterministic and independent-review evidence required before promotion;
- rollback/recovery expectations for risky changes.

Implementation uses isolated branches/worktrees and small ChangeSets. Large redesigns or architecture programmes are decomposed into reviewable slices with an executable journey or measurable product outcome, not one repository-wide autonomous rewrite.

## 5.3 Before/after evidence and convergence

Every accepted improvement slice should retain its baseline and record the delta. Compare only metrics relevant to the change, for example:

- critical journeys passed and state completeness;
- visual/mobile review scores and responsive evidence;
- accessibility violations;
- performance/bundle/Core Web Vitals evidence;
- security/architecture findings retired or introduced;
- source-of-truth/contract duplication removed;
- test non-vacuity and coverage of important invariants;
- manual edits/interventions/retries;
- elapsed time and AI/tool cost;
- changed LOC/dependency cost where useful;
- regressions against protected known-good behaviour.

“More code”, “new framework” or “agent says better” are not improvement metrics. A slice converges when its agreed outcome is better than or intentionally unchanged from baseline, required gates pass, and independent review accepts the result. Failed attempts remain attributable rather than being overwritten by the eventual pass.

## 5.4 Git-native workflow

The Console should eventually support:

- connect/import an existing repository;
- map its current framework/design/backend/deploy shape before mutation;
- create an isolated branch/worktree per significant AI task or candidate implementation;
- show changed files and human-readable ChangeSet summary;
- preserve commits and original authorship/history;
- open/update a pull request where GitHub is the selected collaboration system;
- rebase/refresh safely when base changes;
- detect conflicts rather than force-pushing through them;
- promote/merge only after required gates/review;
- continue to work when the repository is maintained outside App Builder.

Generated new projects should be able to opt into the same Git lifecycle after their initial materialisation.

The durable Factory ledger remains product execution evidence; Git is the source-code collaboration/history layer. Do not create two competing task truths.

## 5.5 Acceptance

Existing-product parity is not proven by successfully cloning a repository. A representative adoption must show:

`connect repo + URL -> freeze baseline -> map product/architecture/journeys -> specialist diagnosis -> approved improvement contract -> isolated ChangeSet -> preview -> deterministic gates -> independent review -> before/after evidence -> PR/merge -> release`

The long-horizon complex benchmark for this mode is the Existing-repository adoption path in `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`. It should prove that App Builder can find and safely improve the kinds of architectural, product and visual problems that otherwise accumulate through repeated prompt-led iteration, without introducing equivalent regressions or Predictor-specific factory hacks.

---

# 6. Phase 4E / 4F — collaboration, review and staging

A professional builder needs a review experience for people who are not editing code.

Add a bounded stakeholder-review layer after environment identity is real.

## 6.1 Staging/review links

- stable preview/staging URL per reviewable revision;
- explicit revision/checkpoint shown in the review surface;
- desktop/tablet/mobile switching;
- comments pinned to ElementIdentity/PageSpec/SectionSpec where possible;
- general page/project comments when a specific binding is impossible;
- approve/request-changes decision;
- resolved/unresolved discussion state;
- no reviewer access to secrets, source mutation or production controls unless separately authorized.

## 6.2 Internal branches and release promotion

Support a clear flow:

`work branch/checkpoint -> preview -> review -> required gates -> approved revision -> production release`

A design candidate and a code branch are not the same concept. Visual 4D candidates remain bounded evidence until promoted; implementation branches contain actual source changes.

## 6.3 Collaboration roles

For the private/personal v1, keep roles small:

- owner;
- editor/developer;
- reviewer/client.

Enterprise SSO/SAML/SCIM is explicitly later and should not distract from the core product unless a real deployment needs it.

---

# 7. Phase 4E / Phase 7 — deployment and operations console parity

Turn the existing Netlify/deployment primitives into a complete owner workflow rather than a collection of commands.

The Console should surface, per environment:

- deployment target/provider;
- current deployed revision;
- preview/staging/production URLs;
- custom domain status;
- DNS/SSL state;
- environment variable/secret readiness without exposing values;
- build/deploy status and logs;
- database/migration state;
- integration health;
- analytics status;
- error/observability status;
- uptime/health checks where configured;
- performance/Core Web Vitals summary;
- cost/usage summary;
- rollback target and release history.

## 7.1 Safe rollback

Release history should make rollback a first-class operation:

- identify the exact source revision/build/deployment/backend migration state;
- distinguish frontend rollback from irreversible database changes;
- require approval for production mutation;
- smoke-test after rollback;
- record the action in the durable event ledger.

## 7.2 Domain workflow

Move beyond a checklist when a deployment adapter can support it safely:

- attach custom domain;
- verify DNS state;
- SSL status;
- canonical host selection;
- redirect/www policy;
- preview vs production separation.

Provider-specific domain APIs remain adapters, not stable project contracts.

---

# 8. Phase 4.3 / 7 — CMS, content operations and localization parity

The existing `CollectionSpec` and `LocaleSpec` direction is correct. The missing parity requirement is the **editing/operations experience** around them.

CMS product surface should eventually provide:

- collection/table view;
- draft/published states;
- rich text/media/reference fields;
- create/edit/bulk actions;
- preview before publish;
- scheduled publication when a job capability exists;
- SEO fields;
- author/editor metadata where useful;
- import/export (CSV/Markdown where appropriate);
- content history/restore;
- role-aware editing;
- AI assistance that proposes/revises content without bypassing factual provenance.

Localization should provide:

- locale overview and completeness status;
- untranslated/needs-review/reviewed state;
- per-locale routes/slugs/metadata/assets;
- AI-assisted translation as an optional implementation;
- manual translation always able to override generated text;
- hreflang/canonical validation;
- translation updates triggered when source content changes.

The generated repository/content model must remain usable without the App Builder Console.

---

# 9. Phase 5 — real autonomous builder experience

The safe runtime foundation should culminate in a user experience comparable to leading autonomous builders while keeping App Builder's stricter authority model.

After the deterministic runtime canary and one reviewed real-model canary, add in order:

1. bounded research specialist with public-egress-only/tool-brokered research;
2. one low-risk implementation specialist;
3. browser-test/repair specialist loop;
4. creator -> independent reviewer -> typed rework loop;
5. parallel specialists only when their write scopes/artifacts are independent;
6. provider/model routing by measured task performance and cost;
7. durable background jobs/scheduled sessions;
8. interruption/restart/provider-capacity recovery;
9. visible progress, stop/cancel and hard cost budgets in the Console.

The target user experience becomes:

`brief -> research -> plan -> design -> build -> browser test -> fix -> review -> preview -> approval`

without granting one unrestricted model a host shell, production secrets or broad network access.

---

# 10. Phase 6 — browser/device and production-quality parity

Extend the existing QA plan with explicit cross-browser and deployment realism.

Required representative coverage:

- Chromium;
- WebKit;
- Firefox;
- mobile Safari-risk viewport/behaviour checks;
- responsive breakpoints;
- keyboard/focus;
- empty/loading/error/large-data;
- offline/slow/failing API;
- authenticated/unauthenticated/role states;
- integration unavailable/expired states;
- payment failure/cancel states where billing exists;
- background job retry/failure states;
- deploy smoke on the actual host/provider class.

Keep the full expensive matrix risk-based; do not blindly multiply every page by every browser/state.

---

# 11. Phase 7 / 8 — post-launch agents and product maintenance

Leading builders increasingly support maintaining a product, not only creating it. App Builder should eventually use its stronger provenance and review model here.

Possible bounded maintenance workflows:

- monitor error/performance/availability signals and propose a fix;
- identify broken integrations or expiring connection health and notify the owner;
- run scheduled SEO/AEO checks;
- update CMS content from owner-approved sources;
- propose dependency/recipe upgrades;
- review analytics/experiment evidence and suggest improvements;
- create a branch/ChangeSet, rerun gates and request approval;
- never silently push production changes.

A post-launch agent uses the same capability/grant/environment boundaries as a build agent. Production changes remain approval-gated.

---

# 12. Later optional parity — generated applications as agent-accessible products

Some generated applications may benefit from exposing their own bounded API/MCP surface so their end users can use them from AI clients or automation systems.

This is an **optional generated-app capability**, not an App Builder runtime dependency.

If implemented later:

- generate a provider-neutral tool/API contract from explicit application capabilities;
- require authentication/authorization per end user/tenant;
- never expose internal database or admin operations merely because they exist;
- add audit/rate-limit/revocation controls;
- keep generated apps independently deployable without the App Builder control plane.

Do not prioritize this before the core build/edit/deploy/integration experience is competitive.

---

# 13. Stage placement summary

| Capability | Intended stage |
| --- | --- |
| Inspiration URLs/screenshots + VisualReferenceAnalysis | **Delivered (4D.2).** See `docs/DESIGN_INTELLIGENCE.md` §4. |
| Research-agent public-web execution | Phase 5 after public-egress proof |
| Drag/reorder/component swap/responsive visual editing | Phase 4B/4D |
| CMS editing surface + content operations | Phase 4.3 |
| Localization workflow | Phase 4.3 |
| Existing-product baseline, diagnosis and improvement contract | Phase 4.3 |
| Existing repo import/adoption + bidirectional Git workflow | Phase 4.3/4E |
| Payment/billing recipe | Phase 4.4 |
| Email/notifications/webhooks/jobs/queues/realtime | Phase 4.4 |
| IntegrationSpec + Connections UI + end-user OAuth connections | Phase 4.4 |
| Stakeholder comments/review/approval | Phase 4E/4F |
| Branch/staging/release promotion workflow | Phase 4E/4F |
| Deployment/logs/domains/analytics/monitoring/rollback console | Phase 4E/7 |
| Cross-browser/device production matrix | Phase 6 |
| Autonomous research/build/test/review loops | Phase 5/5.5 |
| Post-launch maintenance agents | Phase 7/8 |
| Generated-app MCP/API exposure | Later optional |

## Dependency ordering within this programme

**This programme does not sequence itself.** The one ordered path from the current state to a finished
core product is `docs/ROADMAP.md`, and the stage placements above are where each capability lands on that
path — not a competing queue. In particular, the product-proof freeze comes **before** the Phase 4.3/4.4
capability breadth in this table, not after it: the corpus is what tells us which of these capabilities
real projects actually need.

What this programme does own is the dependency between its own items: connections before connectors,
environment identity before release promotion, baseline/adoption mapping before existing-product mutation, Git adoption before bidirectional workflow, and a real
egress proof before any research agent reaches the public web.

Do not delay the first real-project corpus until every late platform feature exists. Use maturity tiers: a project class can be proven for marketing/content sites before every SaaS integration capability is proven. But do not claim broad “best app builder” parity while common auth/billing/integration/deployment workflows still require bespoke manual glue.

---

# 14. Acceptance standard for class-level parity

A capability appearing in a plan is not parity. Before claiming App Builder is in the same product class as leading builders, require evidence that a non-specialist can complete representative journeys such as:

### Professional website

`brief + sources + inspiration URLs -> professional responsive site -> visual edit -> custom domain -> analytics/SEO/monitoring -> publish`

### B2B SaaS

`brief -> auth + organisation roles + database + file upload + email + billing + integration -> browser QA -> staging review -> deploy`

### Existing project

`connect repository + live URL -> freeze baseline -> inspect/adopt -> product/architecture/journey diagnosis -> approved improvement contract -> isolated branch/ChangeSet -> AI change -> preview -> deterministic gates -> independent review -> before/after evidence -> PR/merge -> deploy`

The pass is not “the repository imported” or “the PR merged”. Representative protected journeys must not regress, and the agreed outcome must be measurably better than the frozen baseline. For complex application adoption, use `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md` rather than inventing a second brownfield benchmark.

### Autonomous build

`brief -> bounded research -> plan -> build -> browser test -> independent review -> corrections -> approval`

Measure:

- first-build success;
- meaningful manual edits;
- user interventions;
- visual/product score;
- functional journeys passed;
- accessibility/security/performance;
- time and AI/tool cost;
- deploy success/rollback readiness;
- integration setup failures;
- generated-repository portability;
- operator confidence in understanding what changed and why.

For existing products also record the **before/after delta** and any regression against protected known-good behaviour; absolute scores without a baseline do not prove an improvement workflow.

The competitive target is not feature-count equality. It is that the common high-value journeys feel equally complete while App Builder retains stronger provenance, explainability, portability and bounded autonomy.