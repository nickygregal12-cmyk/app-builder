# Product Completeness and Professional-Finish Programme

Status: **cross-cutting acceptance programme for remaining product stages**.

Purpose: make App Builder finish the whole product a real multidisciplinary web/product team would finish, rather than stopping once the happy-path pages compile. This extends the existing launch-readiness, State Matrix, Journey Closure, RenderedEvidence, Visual Excellence, environment and release programmes; it does not create a parallel product authority.

The governing rule is conditional completeness:

> **Every relevant state, journey, recovery path and production surface must be deliberately implemented and proven. Irrelevant features must not be added merely because they sound professional.**

A static business page that renders immediately does not need a fake skeleton. A data-heavy application surface with noticeable asynchronous loading does need an intentional loading treatment. A cookie banner is not a universal decoration; privacy/consent surfaces are included only when the project's data processing, integrations, jurisdiction or requirements make them necessary.

## What is already covered

Existing factory work already prevents several common vibe-coding failure modes:

- launch-readiness treats an action targeting a missing internal route as a blocker;
- a missing deliberate not-found route is a launch finding;
- orphan/unreachable pages, placeholder copy, empty bindings and missing conversion paths are findings;
- `StateMatrixSpec` and `JourneyClosureEvidence` separate a rendered component from a proven user journey;
- RenderedEvidence captures responsive routes/states and records uncovered states rather than silently omitting them;
- Phase 6 already plans responsive/data/error/loading/empty/large-data stress, slow/offline/failing-API scenarios, accessibility, performance, security and deployment smoke tests;
- Phase 4E/7 already cover environment identity, deployment, monitoring/observability and release controls.

Do not duplicate those systems. The additions below make the remaining implicit professional-finish requirements explicit and assign them to the stages that can actually consume them.

## Phase 4C — presentation-state contracts

The Presentation Registry / Component Manifest / DesignSystemSpec work must model **stateful presentation**, not only the ideal loaded state.

For a component/surface that can enter them, its manifest should declare the supported visual/interaction states and the data/behaviour condition that makes each state reachable. Relevant state families include:

- initial/loading;
- empty/no-results;
- success/complete;
- recoverable error;
- terminal/unavailable error where applicable;
- validation/invalid;
- disabled/locked/read-only;
- permission/auth-required;
- stale/degraded/offline where the product can actually experience them;
- long-content/overflow and large-data variants where relevant.

Loading strategy must be deliberate:

- use a skeleton when asynchronous latency is meaningful and preserving the eventual content shape improves perceived stability;
- use progress/spinner/status text when work has no meaningful content-shaped placeholder;
- render immediately with no loading ornament when content is already available;
- skeletons inherit the actual component geometry/design tokens rather than becoming generic grey rectangles;
- loading UI must not create layout shift, false affordances or misleading fake content.

DesignLint should be able to catch impossible/unconsumed declared states and common state-design defects before AI visual review.

## Phase 4D — visual comparison must include non-happy states

Art-direction comparison and visual review must not judge only a fully populated desktop page.

For representative projects, the comparison/evidence surface should be able to show important declared states such as loading, empty, error, validation failure, locked/read-only and success at relevant mobile/desktop widths.

A visually impressive default state does not pass if its loading/error/empty treatments fall back to generic browser-looking or framework-default UI.

## Phase 4.2 / 4.3 — deterministic route and link integrity

Extend generated-product quality checks beyond declared CTA targets.

Before release, deterministic checks should prove where applicable:

- every internal navigation/footer/in-page link resolves to an intended route or approved redirect;
- no generated route is accidentally orphaned;
- the not-found/fallback route is deliberate and useful;
- redirects do not loop;
- canonical, sitemap and internal-link destinations agree;
- localized routes/hreflang remain internally coherent once localization exists;
- links emitted from structured content/collections are validated rather than trusted merely because their source string exists.

External-link availability may be reported separately because third-party availability is not under the generated app's control; do not make release depend on transient external outages unless the link is itself a required integration/journey.

## Phase 5 — specialists implement against completeness contracts

Frontend, UX, state-matrix, journey-closure and visual specialists must consume the declared state/journey contracts rather than inventing a different set of states from prompt intuition.

The runtime should route a missing or weak state to the role that owns the underlying problem:

- presentation/design-system issue -> design-system/frontend implementation;
- missing product behaviour -> product/domain implementation;
- missing evidence -> state-matrix/journey-closure/test specialist;
- visual quality issue -> art-direction/visual rework;
- environment/integration failure -> environment/integration owner.

AI should never add skeletons, modals, toasts, error screens or other patterns just to make an application look more "complete" when no reachable product state requires them.

## Phase 6 — executable product-completeness acceptance

Phase 6 is the main enforcement stage.

For each important journey/surface, derive the **relevant** state matrix and prove it with deterministic fixtures/browser execution where possible. Coverage should include, as applicable:

- loading and the selected loading strategy;
- loaded success;
- empty/no-results;
- validation errors;
- submitting/saving state;
- successful write/confirmation;
- recoverable write/network failure and retry;
- duplicate-submit prevention/idempotent interaction where relevant;
- permission/auth/role restrictions;
- disabled/locked/deadline states;
- stale/degraded/offline/failing-provider behaviour;
- slow API/network behaviour;
- missing/failed images or assets where a fallback is required;
- long text, extreme values and overflow;
- large lists/tables/data sets;
- mobile keyboard, focus and touch behaviour;
- reduced motion;
- browser navigation/back/refresh/deep-link behaviour where the journey depends on it.

### Forms and mutations

Any generated form or user mutation that the factory calls ready must have a complete lifecycle appropriate to its risk:

`idle -> validation -> submitting -> success OR recoverable failure`

plus server-side validation/authoritative rejection where the backend requires it.

Acceptance should cover field errors, focus/error announcement, disabled/submitting controls, repeated submission, network failure, success confirmation and preservation/loss of user-entered data according to an explicit policy.

### Link/route acceptance

Run deterministic internal-link/route integrity in CI/release acceptance, and browser-test the not-found/deep-link behaviour rather than merely checking that a route component exists.

### Visual acceptance

RenderedEvidence + the visual critic should judge the important non-happy states for hierarchy, legibility, brand/design consistency and recovery clarity. A generic framework error or unstyled loader is a visual defect even when functionally correct.

Missing proof remains distinct from a proven defect, preserving the existing launch-readiness principle.

## Phase 7 — launch-level finish and operational completeness

A release is not finished at `build succeeded`.

The launch/readiness workflow should explicitly check the project-appropriate subset of:

- domain, DNS, TLS and redirect behaviour;
- deliberate 404/not-found behaviour on the real host;
- final internal-link integrity on the deployed artifact;
- canonical/sitemap/robots/indexability consistency;
- page titles/descriptions/social metadata and generated social assets;
- favicon and appropriate browser/home-screen brand assets where applicable;
- analytics/observability configuration and a verification event/smoke path where enabled;
- production form/integration delivery rather than only local UI success;
- CSP/security headers and production environment identity;
- backup/rollback/checkpoint target for stateful or material releases;
- privacy policy, terms, cookie/consent controls, accessibility statement or other legal/compliance surfaces **only when the Build Contract, data processing, integrations or applicable requirements call for them**;
- production smoke tests of the primary journeys;
- a post-launch check that distinguishes deployment success from a healthy live product.

Do not fabricate legal language or imply compliance the factory has not established. Where specialist legal review is required, surface it as an explicit release dependency rather than generating confidence theatre.

## Benchmark expectation

The real-business corpus and the Football Predictor complex-app benchmark should both score product completeness separately from visual quality.

A build can therefore fail for different reasons:

- visually weak but functionally complete;
- visually strong but missing loading/error/permission/form states;
- functionally correct but inaccessible;
- complete in preview but misconfigured in production;
- correct happy path but broken deep links/404/recovery paths.

The long-run Gold Standard requires these dimensions to converge; a 9/10 hero does not compensate for an unfinished product.

## Non-goals

- no universal skeleton-loader rule;
- no universal cookie-banner rule;
- no PWA/offline requirement for projects that do not need it;
- no blanket animation/toast/modal requirements;
- no enormous checklist whose items are marked complete despite having no consumer;
- no claim that every external link must be continuously available;
- no replacement for State Matrix, Journey Closure, launch-readiness, DesignLint, RenderedEvidence or Phase 6 executable verification.

The factory's advantage should be **relevant completeness with evidence**, not feature checklist theatre.
