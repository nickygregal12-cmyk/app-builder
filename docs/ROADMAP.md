# Roadmap

Current stage: **Phase 3.8 — Product proof and correctness hardening**. The Phase 4A Console vertical slice is delivered.

The Phase 3.8 correctness gates are closed except the genuine real-business product proof (3.8E), which needs actual company material and a human product review rather than more infrastructure. The Phase 4A slice was built alongside it because that proof has to run through the product — real intake, real source ingestion, real generation — not through a CLI beside it.

Phase 4B and later Console work should not accelerate until 3.8E has actually been run against a real business and its findings fed back.

The detailed delivery specification lives in `docs/MASTER_PLAN.md`. The best-in-class capability register lives in `docs/BEST_IN_CLASS_CAPABILITIES.md`. The cross-cutting premium-quality programme lives in `docs/VISUAL_EXCELLENCE.md`. The deterministic engineering-gate programme lives in `docs/ENGINEERING_QUALITY_PROGRAMME.md`. The control-plane programme lives in `docs/FACTORY_CONTROL_PLANE.md`; the dedicated future agent runtime is defined in `docs/AGENT_RUNTIME.md`.

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

The existing Phase 3 brand observations are the base for later BrandSpec/asset intelligence; do not create a second parallel brand-extraction pipeline.

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

Initial target: fewer than **20 meaningful manual edits** between generated output and a launchable result. This target should tighten toward <=5 median edits for proven mainstream website classes as the real-world corpus grows.

## Phase 3.7 — Factory Service and Real Ledger Integration ✅ Core exit complete

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

Purpose: close high-value correctness gaps discovered by audit/review and establish the few foundations that are cheaper to solve before the Builder Console becomes large.

### 3.8A — ChangeSet path-policy correctness ✅ Complete

Delivered:
- segment-correct repository path semantics instead of textual-prefix matching;
- canonical repository-relative paths and Windows separator normalization;
- fail-closed rejection of traversal/absolute/ambiguous paths;
- unsafe/unsupported declared scope rules rejected before work starts;
- adversarial sibling-prefix regression tests;
- `fast-check` property tests over allow/deny/expected-file behavior, separator
  canonicalisation, traversal rejection and forbidden-scope precedence.

The exit gate is met: no textual-prefix scope escape survives either the
hand-written adversarial cases or the generated property cases.

### 3.8B — Schema/type/runtime contract unification ✅ Core contract families complete

Target architecture:

`JSON Schema -> generated packages/contracts types -> Ajv boundary validation`

Delivered:
- `/schemas` is the runtime validation authority;
- `config/contract-families.json` declares which schemas are generated families and which are explicitly deferred, so a new schema forces a migration decision;
- `@app-builder/contracts` compiles every family with Ajv and exports `validateContract`/`assertContract` for service, tooling and package boundaries;
- schema-derived TypeScript is generated per family with a root-type barrel;
- nine families are migrated: Project Manifest, Build Contract, Intake Session, Knowledge Pack, Composition, Control Task, Build Event, Checkpoint and ChangeSet;
- duplicated validation enums/rules have been removed from the handwritten Manifest and Knowledge Pack validators, which now keep only relational and governance rules JSON Schema cannot express;
- `npm run contracts:check` fails on schema-hash or generated-type drift and runs inside `npm run check`;
- structural validity remains separate from adapter/module buildability.

Remaining schemas stay listed as pending with a recorded reason. Migrate them when they become real exchanged boundaries rather than attempting a risky all-at-once rewrite; `schemas/genuine-business-acceptance.schema.json` also needs its draft-07 dialect migrated first.

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

In addition to correctness, record brand/asset shortcomings, generic-design issues, image gaps, copy/messaging edits and responsive/visual edits so the later Visual Excellence programme is evidence-led.

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

### 3.8H — Specialist agent architecture foundation ✅ Complete

Delivered as contracts, registries and deterministic primitives — not as a running agent system:

- `AgentRoleSpec` (`schemas/agent-role.schema.json`) and a registry of specialist roles separated by
  decision boundary (`config/agent-roles.json`);
- project-class routing and required convergence gates (`config/agent-pipelines.json`), so an
  internal tool is not routed through brand, marketing, research or SEO specialists;
- deterministic **no-self-approval**: a creator cannot issue the verdict on its own artifact, a
  reviewer owns no repository mutation scope, and the doctor rejects any pipeline stage that would
  let a role approve itself;
- `HandoffContract` semantics via `evaluateHandoff` — required artifacts, prerequisites, evidence,
  passed deterministic checks and an independent verdict, or the stage does not advance;
- typed rework (`schemas/review-verdict.schema.json`) with named failing criteria, severity and an
  owning creator role, so backward routing is data rather than argument;
- a deterministic convergence engine (`schemas/convergence-report.schema.json`) that assesses every
  required gate, converts a below-threshold score into a failure, refuses to call an unrun gate a
  pass, orders rework by severity and lets a hard budget stop outrank a rework loop;
- bounded per-role context packets and per-role capability/route ceilings;
- an evidence-driven skill promotion lifecycle (`config/skill-registry.json`);
- an external-source governance registry (`config/external-sources.json`) where registration is
  explicitly not adoption.

Architecture: `docs/AGENT_SPECIALIST_ARCHITECTURE.md`, `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`.
Primitives: `packages/control-plane/src/roles.js`. Coverage: `tooling/agent-architecture.test.mjs`
and the extended control-plane doctor.

This foundation does not close the outstanding Phase 3.8E genuine-business product gate, and it adds
no new orchestration framework.

### 3.8I — Routing discipline and agent operating-system hardening ✅ Complete

Audit finding this closes: the factory had the stronger control plane, but the weaker
*development-agent operating system*. More AI capability requires stronger routing discipline, and
that is far cheaper to establish before the specialist system grows large than afterwards.

Delivered as deterministic contracts and executable acceptance:

- **Deterministic routing acceptance benchmarks** — `schemas/routing-benchmark-case.schema.json`
  and `config/agent-routing-benchmarks.json` hold representative prompts with **positive and
  negative triggers**. A route that selects the right specialist but also drags in an expensive
  irrelevant one fails. `npm run agent:bench` runs them; `npm run agent:route -- "TASK"` prints the
  packet. Primitives live in `packages/control-plane/src/routing.js`.
- **Task routes** (`taskRoutes` in `config/agent-routing.json`) map bounded natural-language intent
  to specialist roles, canonical authorities and a small skill set. Broad words such as
  `refactor this component` or an ordinary `architecture review` deliberately stay **unclassified**
  so the next step is bounded orientation rather than an expensive guess.
- **First-orientation context ceilings** — candidate paths, authorities, selected roles, selected
  skills and deterministic packet bytes. These are context-efficiency guards: a real task expands
  deliberately after the first packet instead of raising a global ceiling.
- **Skill load budgets** — every registered skill declares a `loadClass`
  (navigation/process/domain/specialist/review/critic) and a role packet normally carries at most
  one per class, so complementary lenses compose instead of competing. Installed is not loaded, and
  the doctor and tests enforce it.
- **New specialist roles** registered in `config/agent-roles.json`: `state-matrix`,
  `journey-closure`, `product-opportunity-scout`, `differential-reviewer`,
  `independent-second-opinion`, `environment-guardian` and `compound-learning`, with the
  `StateMatrixSpec`, `JourneyClosureEvidence`, `ProductOpportunityReport`, `RiskClassification`,
  `EnvironmentIdentity` and `CompoundLearningCandidate` artifact kinds they exchange.
- **New convergence gates** — `state-completeness` and `journey-closure` are now required in every
  project pipeline, because a compiling build is not evidence that a journey is finished.
- **Conditional review routing** — the risk-sensitive roles are `onDemandRoles`, selected by a
  deterministic `RiskClassification`, so an ordinary CSS change never pays for adversarial security
  review while an auth/RLS/secrets/deployment change does.

Roles remain `planned`: this stage defines the decision boundaries, routing and budgets. Authoring
their `SKILL.md` packets and executing them is Phase 4 groundwork and Phase 5 runtime work.

### 3.8J — Executable architecture and deterministic risk classification ✅ Complete

Phase 3.8I recorded these as planning. This stage makes both executable, and neither displaces the
outstanding 3.8E genuine-business proof or the Console work.

**Architecture boundaries are now a blocking gate.** `AGENTS.md` stated the dependency direction in
prose; `npm run architecture` now enforces it inside `npm run check`, so CI rejects an illegal edge.
Seven rules cover generated-output portability, the Console/service boundary, the MCP adapter
boundary, control-plane provider-neutrality, dependency-light contracts, composition purity and
content-intelligence independence, plus a cycle check over the zone graph. It parses module
specifiers and declared dependencies rather than scanning for substrings, so a deep relative path
cannot dodge a package-name rule and a package named in prose is not a violation.
`dependency-cruiser` was evaluated and deliberately not adopted; see
`docs/ENGINEERING_QUALITY_PROGRAMME.md` for that decision and for the two real findings the first
run surfaced.

**Conditional review is now genuinely conditional.** 3.8I registered `differential-reviewer`,
`independent-second-opinion` and `environment-guardian` but nothing could select them.
`config/risk-surfaces.json` and `packages/control-plane/src/risk.js` classify a declared ChangeSet
against eleven risk surfaces and the requested capability actions, and return the reviewers the
change must buy. Severity is the highest matched surface, never an average; independent review is
bought at the threshold the registry names rather than by anyone's sense of importance; and an
ordinary presentation or documentation change returns no reviewers at all, which is what keeps the
expensive lenses affordable. A model does not decide whether a risky surface was touched.

Two false positives were found and fixed while building it, both of which would have defeated the
purpose: a design-token file matched the authentication `token` signal, and a JSON Schema contract
matched the *database* schema surface. Matching is now word-accurate and both cases are held by
tests.

### 3.8K — Launch readiness: making the new tooling serve the product ✅ Complete

Phases 3.8H–3.8J built a stronger *development-agent operating system*. None of it changed what the
factory produces, and 3.8E is judged on exactly that. This stage points the machinery at generated
product.

**`npm run audit:launch -- --project <dir>` audits composed output before a human sees it.** Every
finding uses the same category vocabulary as `manualEdits` in
`schemas/genuine-business-acceptance.schema.json` and names the specialist role that owns the fix, so
a predicted edit is actionable rather than a complaint. It catches unresolved bindings, placeholder
copy, generated claims with no source, heroes with no imagery, dead internal links, unreachable
pages, a missing not-found route, no conversion path, and unresolved or custom capabilities.

**`StateMatrixSpec` and `JourneyClosureEvidence` are now derived deterministically**, not left as
registry entries waiting for an agent. State axes come from what a surface actually exposes — a page
with no capture surface has no write axis — and are ranked by user risk rather than enumerated
combinatorially. Journeys are derived from composed output rather than a manifest field that is often
absent, with each step marked proven, unproven, or needing executable evidence.

**Missing proof and a defect are counted separately.** A high-risk state with no fixture is a gap in
the factory's evidence, not an edit a person makes to the site. Merging them would inflate the
prediction into a number nobody could trust.

**Canonical generation now gates on product quality.** `config/factory-benchmarks.json` records a
predicted-edit ceiling per project type, measured rather than guessed, and `generate:acceptance`
fails when output gets worse. Ceilings are lowered as the factory improves and never raised to make a
regression pass.

**Phase 3.8E is served without being gated.** `launchReadiness` on the acceptance evidence records
the audit taken at handover, and the validator reports it alongside the real edit count, including
how far the prediction was off. It is deliberately **recorded, not enforced**: the factory is still
being built, so a genuine run is expected to start from a build that still carries known findings.
Refusing such a run would make the proof unrunnable and would reward omitting the field over
recording it honestly. The value is that a reviewer knows what the factory already knew, and that
prediction accuracy becomes measurable. Tightening this into a gate is a decision for after the
first real run, not before it.

Current canonical baselines: marketing-site 10, content-site 8, b2b-saas 13, consumer-app 15,
internal-tool 15, ai-app 15 predicted edits. Every one is below the 20-edit target and every one is
worth reducing. These ceilings gate **synthetic canonical fixtures**, where they can only catch a
regression; they are not a quality bar applied to a real business build.

### 3.8G — Brand-source and asset-provenance foundation — P1/P2

Extend the existing content/asset intelligence rather than creating a second extraction subsystem.

Plan:
- accept company-uploaded logos, photos, screenshots and brand guidelines as first-class assets;
- treat the existing company website as a primary brand/content source;
- accept exact user-provided public company profile URLs (for example Facebook, Instagram, LinkedIn) as optional enrichment sources;
- prefer authorised APIs/connectors when available and do not build platform-bypass scraping as a dependency;
- support explicitly reviewed public discovery only where permitted and useful;
- derive palette/logo/typography/imagery/tone/navigation/style signals with confidence and source references;
- introduce asset-rights/use status so "publicly visible" never silently means "approved to republish";
- preserve `instructionAuthority: none` for all imported external content.

## Phase 4 — Full Builder Console ⬜ Planned

Begins after the Phase 3.8 P0 gates are addressed. Build the Console as a client of `apps/service` rather than expanding browser-only state.

### Phase 4A — First complete usable vertical slice ✅ Complete

Delivered:
- create/open project;
- reviewed Build Contract from adaptive intake;
- service-owned source ingestion: declared URLs are crawled and uploaded files
  are normalised by the service, never by the browser, and never from a
  client-supplied filesystem path;
- ingestion runs as a durable task with events, a checkpoint and an additive
  knowledge pack that becomes a real generation input;
- source rights/approval state is declared by the operator and visible in the
  Console — a public page stays reference-only until someone says otherwise;
- intake-declared sources that have not been ingested are shown as outstanding;
- trigger deterministic build;
- material can still arrive after a build: each build materialises its own
  workspace version, so a rebuild never overwrites the repository someone is
  reviewing, and the Console says when the live build no longer reflects the
  ingested knowledge;
- visible task/event progress;
- service-managed live preview, stopped automatically before a rebuild;
- desktop/tablet/mobile preview switching;
- checkpoint and build-version history, with the live build marked.

The `state-matrix` and `journey-closure` specialists registered in Phase 3.8I get their first real
inputs from this slice: it is what makes a `StateMatrixSpec` and a `JourneyClosureEvidence` ledger
possible to produce and check against a real build.

### Phase 4B — Direct manipulation, brand sources and assets 🚧 In progress

Delivered:
- **Builder Element Identity**: a rendered element resolves deterministically to
  project, page, section, presentation component, component instance, content
  binding, provenance references, artifact location, editable properties and
  design tokens, and anything that does not resolve fails closed;
- click-to-select through PageSpec/SectionSpec identity: every rendered binding
  carries its section id, binding key and provenance, and a preview opened by
  the Console reports selections to it;
- Console selection inspection: the resolved identity of whatever was clicked,
  with editing offered only where the template declares an editable property;
- **RenderedEvidence**: browser captures of every route at desktop, tablet and
  mobile plus the critical interaction states a build has, with the states a
  capture cannot establish recorded as uncovered rather than omitted;
- **asset-level governance**: each ingested image carries its own publication
  decision, an approval beyond its source's rights needs a declaration about
  that asset, and unreviewed smart crops are withheld;
- text editing with provenance awareness — an edited binding becomes `human`,
  keeps what it replaced in `overriddenFrom`, and can be reverted to the
  generated value;
- edits are durable and replayed over freshly composed output, so a rebuild
  picks up new source material without discarding hand-written copy;
- a saved edit reaches the running preview without a rebuild, because the
  workspace composition module is what the preview renders;
- first-class company image/logo/document upload (delivered in 4A);
- import exact existing-site sources through the service (delivered in 4A);
- source confidence, provenance and asset-rights state shown per source;
- governed source decisions before ingestion.

Composition stays a pure function of manifest and knowledge. Edits live beside
it rather than inside it, which is what keeps generation deterministic while
still allowing a person to write the words.

**Builder Element Identity is in place (4B.1).** The template declares how it
renders each composed section — presentation component id/version, the element
role each binding plays, which structural elements exist, and the design tokens
each role consumes — and `deriveElementIdentities` turns that plus the
composition into `.app-builder/element-identity.json`. Every rendered element
resolves to page, page path, section, section type/variant, presentation
component, component instance, binding key, provenance references, artifact
location and design tokens.

The chain is DOM -> ElementIdentity -> PageSpec -> SectionSpec -> component
instance -> binding -> durable edit. The preview reports coordinates only —
page id, section id, element key — and the service resolves them against the
durable index, so component ids, file locations, fact ids and source ids never
reach published HTML and the index is not a module the generated app imports.
Resolution has four outcomes and only one of them permits an edit: `resolved`,
`unknown`, `stale` and `malformed`. `saveOverrides` refuses any new or changed
edit whose target does not resolve to an element whose template-declared
editable properties include `text`; removals and unchanged entries still apply,
so a rebuild that drops a section cannot wedge the whole edit record.

Identity is derived from the deterministic baseline rather than the edited
composition, so writing a sentence does not move any address; live provenance
(`human`, `overridden`) is overlaid at resolve time from the composition the
preview is actually rendering.

`editableProperties` is deliberately narrow: only text bindings declare one
today, because text editing is the only durable mutation the factory can
currently perform. Component, asset and design edits widen those declarations
in 4B.3–4B.5 rather than being inferred.

**RenderedEvidence is in place (4B.2).** `npm run check` and a green build say
a project compiles; they say nothing about what it looks like. Capturing
evidence points a real browser at the service-managed preview — the same
rendering a person reviews — and records desktop, tablet and mobile captures of
every route, plus the critical interaction states the build actually has, as a
durable artifact under the `rendered-evidence` contract.

Two rules keep it honest. A capture is visual evidence and nothing else: each
one states what it proves, and nothing in the pipeline lets a picture answer a
journey step that `deriveJourneys` marks as needing executable evidence. And
coverage is stated rather than implied: every state Phase 3.8K's state matrix
names either has a capture or appears in `uncovered` with the reason —
`not-visually-provable` for a write succeeding, `needs-a-deterministic-fixture`
for an empty or long-content state, `capability-not-installed` where the
section does not exist on that route. `applyEvidenceToStateMatrix` raises only
the viewport axis, because that is the one axis where the picture is the proof.

Interactions come from a closed registry rather than arbitrary scripting; it
holds one entry today, the enquiry form's failed-submission appearance, which
exists only on builds that have that section.

Evidence lives in service state, never inside the generated repository, so the
portable output stays a product rather than a product plus its review history.
`APP_BUILDER_BROWSER_EXECUTABLE` points capture at an existing Chromium where a
host has one.

**Asset-level governance is in place (4B.3a).** Source governance answers "may
we read this?" and is settled before ingestion. Assets carry their own question
— "may we publish this particular picture?" — which can only be asked once the
assets exist, and stays askable afterwards, including after a build, because
that is when someone looking at the site notices the photograph that should not
be on it.

Approving a source is not approving every asset derived from it. An approval
that outruns its source's rights needs an explicit rights declaration for that
asset alone, made once, by a person, and never inferred from the asset being
publicly visible. That is what stops one click on a public site turning it into
a republishable bucket, and it is the asset-level flow `source-governance.js`
has been deferring to. Narrowing — reject, do not use — never needs a
declaration.

Decisions live in a durable `asset-decisions.json` beside the knowledge pack
rather than inside it. The pack is derived truth about sources and every asset
in it must still agree with the source it came from; a person overriding one
photograph is a different kind of statement and does not get to rewrite that
derivation. Composition reads both, records which decisions produced it in
`input.assetDecisionsHash`, and the Console says when a decision has left the
live build behind.

**Smart crops now mean something.** Every attention-derived crop has always
carried `reviewBeforePublish: true` and nothing read it. Unreviewed crops are
now withheld from the generated repository: the full image still publishes,
because the template falls back to the widest responsive variant and the layout
sets its own aspect ratio, so an unreviewed crop costs a considered framing
rather than the picture.

The Console shows the inventory — provenance, source, channel, dimensions, low
resolution, variant and crop counts, exact and visual duplicates — with what
each asset inherited and what a person decided kept apart, so an asset nobody
has looked at cannot read as one that was approved.

Remaining:
- asset manager: replacement, crop and focal-point selection (4B.3b);
- comparing supplied and generated alternatives (needs generation first);
- section/component variant selection;
- project asset policy modes;
- Design Contract editing;
- **Product Opportunity Scout** for existing-app improvement: a broad prompt such as "improve this
  page" resolves to at most three ranked, materially different opportunities grounded in the current
  implementation, not to a default redesign;
- **State Matrix foundation**: derive the real state axes a capability exposes, remove impossible
  combinations, rank by user risk and give the important states deterministic fixtures;
- **Journey Closure workflow**: prove entry, prerequisites, primary action, validation, authoritative
  write/read, observable success, refusal, retry/recovery, persistence, deep links, back/return,
  mobile/desktop, keyboard/accessibility, reduced motion, rollout state and executable acceptance
  evidence. A component existing is not journey-completion evidence.

Original scope for reference:
- **Builder Element Identity** before any click-to-edit is enabled: resolve a rendered element to
  page/section/component/instance identity, content bindings, source location, editable properties,
  provenance references and design tokens, and refuse a visual edit that cannot resolve to one;
- **RenderedEvidence** as a first-class artifact: desktop/tablet/mobile captures plus critical
  interaction states, because a compiling build is not evidence that a visual change is correct;
- click-to-select/edit through PageSpec/SectionSpec identity;
- text/content editing with provenance awareness;
- component/section variant selection;
- first-class company image/logo/document upload;
- import exact existing-site and approved/public company profile sources through the service;
- show source confidence, provenance and asset-rights/use state;
- asset manager/replacement/crop/focal-point selection;
- mark assets approved, suggested, generated, rejected or "do not use";
- compare supplied and generated alternatives;
- explicit generated-vs-source-backed content state;
- project asset policy modes:
  - supplied only;
  - supplied + optimise;
  - supplied + generate gaps;
  - generation-forward;
- Design Contract editing.

### Phase 4C — Design System Registry, BrandSpec and art direction

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

Engineering gates that belong with this stage are specified in `docs/ENGINEERING_QUALITY_PROGRAMME.md`:
component/state preview surface (evaluate Storybook against a repo-native preview route, adopt only
if it serves the Component Manifest/Presentation Registry cleanly), design-token enforcement, and the
foundations of curated visual contracts.

Add the design-intelligence layer specified in `docs/DESIGN_INTELLIGENCE.md`:
- a versioned, deterministically queryable design-knowledge catalogue feeding BrandSpec/ArtDirectionPlan;
- a **Component Manifest Protocol** so agents retrieve a small relevant component set, not a library;
- runtime-aware component contracts (providers, global CSS, fonts, theme context);
- **DesignLint** deterministic visual-defect rules ahead of AI critique;
- `DesignSystemSpec` that compiles to tokens/CSS variables/theme config/component parameters.

Introduce a machine-readable `BrandSpec` grounded in supplied/observed evidence:
- approved/observed palette and logo assets;
- typography intent;
- imagery and icon language;
- tone/voice examples;
- brand adjectives/anti-adjectives;
- reference sources and confidence;
- source-vs-generated asset policy.

Introduce `ArtDirectionPlan` above individual SectionSpecs, with machine-readable dimensions
(`layoutVariance`, `motionIntensity`, `informationDensity`, `visualDistinctiveness`, `restraintLevel`)
rather than prompt adjectives, plus:
- narrative/emotional sequence;
- attention hierarchy;
- page tempo/density changes;
- hero strategy;
- photographic/editorial/product/UI emphasis;
- distinctive moments;
- restraint rules;
- desktop/mobile composition intent;
- conversion emphasis appropriate to the business category.

Introduce `MotionContract`:
- entrances, scroll and page transitions;
- hover/focus/press language;
- hero/parallax/background allowances;
- stagger/density limits;
- mobile reductions;
- reduced-motion behavior;
- explicit no-motion zones.

### Phase 4D — Visual design canvas and controlled art-direction variants

- produce 2–4 genuinely different bounded candidate art directions/layouts from the same product/content truth;
- ingest moodboards, screenshots, existing sites and design references into normalized traits and
  adopt/avoid intent rather than blindly copying them, and never into uncontrolled generated markup;
- large/infinite comparison canvas or equivalent workspace;
- responsive and interaction-state preview;
- explicit promote/reject flow into durable BrandSpec/ArtDirectionPlan/Design Contract/composition state;
- variant decisions recorded as evidence rather than accumulating unofficial forks;
- require at least one appropriate distinctive visual moment for premium marketing builds while preserving restraint;
- curated visual regression contracts over a small approved surface set — never screenshot
  everything, and never let a passing journey stand in for "the design did not regress";
- an independent visual critic on a different model or runtime for release-critical visual decisions.

### Phase 4E — Environments, integrations and release controls

Introduce explicit **development / preview / production** environment identity:
- deployment/backend identities;
- scoped secrets/integrations;
- migration state;
- allowed actions;
- preview/release URLs/checkpoints.

Give the `environment-guardian` role a machine-readable `EnvironmentIdentity` card that must resolve
before any environment-sensitive mutation: project, target environment, deploy target/site,
repository revision, hosted revision, production revision, whether production mutation is authorised,
secret availability, whether provider/API use is authorised, database target, migration/version
identity and rollback target.

Never infer that development equals production, that preview equals production, that repository state
equals deployed state, or that "deploy" means production. **Fail closed when target identity is
ambiguous.** Verify a hosted result independently before recording it; a repository-only change never
updates hosted truth.

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
- page-level SEO/meta output appropriate to the selected template;
- deterministic asset suitability/quality scoring, responsive crop variants and focal-point metadata;
- detect duplicate, undersized, badly-cropped and obviously unsuitable assets before AI image generation is considered.

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
- dead/orphan integration detection (`Knip` where justified), non-blocking until baselined;
- targeted mutation testing of ChangeSet scope, approval rules, no-self-approval, rights/provenance,
  environment guards, routing predicates and deployment safety — scheduled or pre-release, never
  repository-wide on every pull request;
- staged supply-chain hardening per `docs/ENGINEERING_QUALITY_PROGRAMME.md`;
- CSP baseline in deployment adapters;
- safe three-way recipe reconciliation (`git merge-file` where useful);
- re-run all ChangeSet/contract/RLS/accessibility properties under the real sandbox/tool runtime.

## Phase 5 — Low-Credit AI Orchestration + Dedicated Agent Runtime ⬜ Planned

- product bootstrapper only where deterministic systems cannot resolve novelty;
- deterministic task/context router;
- model router by measured task capability, quality threshold and cost;
- compact trusted context packets;
- versioned `SKILL.md` specialist skills authored against `config/skill-registry.json`, promoted only on recorded evidence;
- the registered specialist roles executed in **disposable per-role sessions** rather than one long general-purpose session;
- durable stage handoffs, typed rework routing and convergence-driven stopping;
- reviewer independence enforced by the control plane, not by prompt wording;
- machine-readable outputs and ChangeSets;
- bounded autonomous work/fix loops;
- provider-neutral `AgentRuntimeAdapter`;
- dedicated App Builder service on Hetzner, separate from project-specific runtimes;
- OpenCode as initial runtime implementation rather than stable product dependency;
- clean-session/context-loss recovery;
- isolated per-project/per-task workspaces and scoped secrets;
- browser/visual agent workflows;
- **graph-assisted context discovery** — once the repository has grown through specialist agents,
  the presentation registry, design intelligence, multiple templates, recipes, runtime adapters, the
  Builder Console and deployment machinery, add an optional bounded graph query between the
  deterministic route and the file shortlist:
  `task -> deterministic route -> optional bounded graph query -> shortlisted files -> exact symbol
  search -> small context packet -> specialist agent`.
  Indexes and graphs are **navigation evidence, never repository truth**, the query stays inside the
  first-orientation token budget, and the layer must not become a required dependency or CI gate.
  Do not adopt it while bounded search still answers the question;
- **genuinely independent second opinions** — for security, architecture, release-critical,
  cross-layer, irreversible or high-cost decisions, the reviewer runs on a different model or
  runtime with fresh context, read-only access and a bounded diff. A different persona on the same
  model is not independence, and the skip is reported rather than disguised. Preserve disagreement
  instead of manufacturing consensus, and do not buy this for trivial changes;
- **compound learning closeout** — after substantial completed work, encode a genuinely reusable,
  evidence-backed lesson in the narrowest existing durable home (regression test or deterministic
  check, then architecture authority, then skill adapter/evaluation, then operations authority) or
  record nothing. Never `LESSONS.md`, `MEMORY.md` or any other uncontrolled documentation dump. The
  aim is better future behaviour with **less** context.

### Phase 5 visual/content specialists

Add specialists only after the deterministic BrandSpec/asset/design contracts exist:

- **art-direction specialist** — proposes bounded ArtDirectionPlan candidates, not arbitrary redesigns;
- **messaging/positioning specialist** — keeps facts, permitted claims, messaging, voice and conversion strategy separate;
- **image-planning specialist** — creates a provider-neutral `ImagePlan` per page/section;
- **image generation/edit adapter** — factory-side only; selectable provider(s), no generated-app runtime dependency;
- **asset selection specialist** — ranks supplied/approved assets before generating replacements;
- **visual second opinion** — independently reviews whether the proposed design is distinctive, appropriate and on-brand.

`ImagePlan` should record purpose, subject/composition, aspect ratio, real-vs-generated requirement, candidate supplied assets, brand references, focal point/safe zones, responsive variants, provenance/rights, approval state and generation/edit cost/history.

Generated imagery must not misleadingly imply real staff, completed projects, customers, premises or products when those things are not real/approved.

MCP delivers early interoperability, but it does **not** replace the later runtime's sandboxing, scheduling, specialist routing, resumability and hard-budget responsibilities.

## Phase 5.5 — AI Evaluation and Red Team ⬜ Planned

- task-class model benchmark scoreboard;
- cheapest model that clears quality threshold, escalating on failure;
- prompt/skill/model regression tests;
- hostile-source/prompt-injection cases;
- dangerous-tool/permission-bypass tests;
- context-router leakage tests;
- second-opinion agreement metrics;
- skill/agent evaluation lab: benchmark cases, quality scores, regressions, false positives, token,
  runtime, cost and context footprint per skill version, with promotion only one lifecycle state at a time;
- controlled skill comparison as the promotion method: the **same task and the same authority/context
  packet**, baseline without the candidate skill versus with it, measuring correctness, scope
  discipline, root-cause quality, evidence quality, trigger accuracy, false-positive and
  false-negative routing, token/context cost, runtime, cost and regressions. A skill is never
  promoted because its markdown sounds intelligent, and a skill that helps one prompt while
  triggering on unrelated work has failed;
- routing regression coverage: every new or changed skill adds positive **and** negative cases to
  `config/agent-routing-benchmarks.json` before promotion;
- image-model/provider benchmark by task class, quality, acceptance rate and cost;
- generated-image rights/provenance/policy tests;
- evaluate Promptfoo specifically where it materially improves red-team coverage.

## Phase 6 — Quality and Autonomous Verification ⬜ Planned

- full unit/integration/E2E/accessibility/performance/security gates feeding the convergence gate registry;
- a dedicated browser functional QA specialist and a separate runtime/DevTools debugging specialist;
- Lighthouse-style deterministic performance budgets as the performance gate's check;
- a deterministic SEO/AEO scanner as the SEO gate's check;
- a fresh-context red-team pass before the release decision;
- screenshot/visual review against Design Contract/DesignSystemSpec/BrandSpec/ArtDirectionPlan;
- independent second-opinion review for material changes;
- render representative widths around 375px, 430px, tablet, laptop, desktop and wide desktop where useful;
- review hierarchy, attention, whitespace, density and repetitive section rhythm;
- review mobile composition rather than only responsive correctness;
- review CTA visibility and conversion flow;
- review typography consistency/legibility;
- review image relevance, crop/focal-point quality and responsive crop safety;
- detect face/text/logo distortion and implausible/misleading synthetic imagery;
- review motion restraint and reduced-motion behavior against MotionContract;
- responsive/data/error/loading/empty/large-data stress scenarios;
- slow/offline/failing-API scenarios;
- Lighthouse-style performance budgets;
- Semgrep/Gitleaks-style security/secret gates where they outperform bespoke doctor checks;
- the staged deterministic gates in `docs/ENGINEERING_QUALITY_PROGRAMME.md`: architecture dependency
  gates, curated visual contracts, per-project-class performance and payload budgets, dead-code
  analysis, property tests, targeted mutation testing and supply-chain hardening;
- bounded autonomous correction through control-plane tasks;
- deployment smoke tests.

Visual findings should become structured bounded ChangeSets with a limited correction pass rather than an unbounded "make it prettier" loop.

## Phase 7 — Launch, Operations and Upgrade Propagation ⬜ Planned

- domain/DNS/SSL launch checklist;
- redirect/canonical/sitemap/robots setup;
- analytics/observability/feedback activation;
- production smoke checks and launch readiness report;
- post-launch audit workflow;
- handover/architecture documentation;
- reviewed recipe/module/presentation-registry upgrade propagation;
- safe three-way managed-file reconciliation;
- reusable pattern promotion workflow;
- approved brand/asset usage report so generated/supplied/public assets remain traceable;
- common integration acceptance for the small set of integrations the factory claims as first-class rather than a shallow catalogue of hundreds.

## Phase 7.5 — Experiments and Controlled Personalization ⬜ Later

After analytics, privacy and deployment state are mature:
- versioned experiment/variant contracts;
- A/B traffic allocation and attribution;
- reviewed winner promotion;
- conversion evidence captured into the factory improvement system;
- personalization only when explicit, measurable, privacy-compliant and reversible.

## Phase 8 — Evidence-Driven Factory Improvement and Gold Standard ⬜ Planned

- analyse manual edits and rework across projects;
- propose versioned questionnaire improvements;
- identify capabilities worth promoting into reusable recipes/sections/components;
- measure tokens/cost/time saved;
- track design/art-direction variant acceptance/rejection evidence;
- track asset problems and generated-image acceptance/rejection reasons;
- track experiment outcomes where enabled;
- benchmark one-prompt builds only after the deterministic pipeline is genuinely useful;
- compare model/skill/router/image-provider versions against accepted baselines;
- retire repeatedly weak/generic visual patterns rather than only adding new ones;
- no silent self-modification: every improvement remains reviewed, versioned and regression-tested.

### Real-world benchmark corpus

The six canonical project classes remain engineering regressions. Build a separate corpus that grows toward roughly **30–50 varied real-world projects** across local services/trades, professional services, hospitality, health, property/construction, charity, SaaS/B2B, AI products, creator/editorial, ecommerce/brands and internal applications.

Track per project:
- first-build success;
- meaningful manual edits before acceptable launch;
- visual/product and mobile scores;
- content accuracy/unsupported claims;
- accessibility/performance/SEO/security;
- functional journey success;
- elapsed time and AI/model/tool cost;
- human interventions;
- accepted/rejected art-direction variants;
- asset issues and generated-image acceptance rate.

### Long-run 10/10 Gold Standard

For **supported mainstream website classes**, target measurable evidence rather than a marketing label:

- >=98% build success without developer intervention;
- median <=5 meaningful manual edits before launch;
- a growing material share launchable untouched;
- blind human visual/product review average >=9/10;
- no unsupported factual claims;
- no serious/critical accessibility failures;
- agreed Core Web Vitals/performance budgets pass;
- zero known critical/high security findings at release;
- all Build Contract acceptance journeys pass;
- generated repos independently clone/install/build;
- AI/model/tool cost stays within the declared budget.

A project outside the proven envelope must be classified honestly as factory-supported, supported with custom implementation, specialist/novel engineering required, or unsupported/approval-required. Do not pretend a standard business site and highly bespoke WebGPU/multiplayer/creative software have the same expected first-pass reliability.

## Architectural follow-ups to preserve

- add short ADRs for durable-state choice, control-plane ownership, template strategy, backend defaults, deployment defaults and environment identity;
- do not adopt `lucide-react` as a default generated dependency when static SVG copying solves the need;
- do not add another SVG rasterizer while Sharp satisfies the deterministic social-image pipeline;
- image-generation providers remain factory adapters, not generated-app dependencies;
- social/profile enrichment must prefer exact URLs, official/public surfaces and authorised connectors rather than platform-bypass scraping;
- publicly visible assets retain rights/use state and are never assumed approved for republication;
- do not make Hono authoritative for contracts;
- evaluate `@mozilla/readability` against real crawled sites before adopting it;
- do not adopt Temporal/LangGraph/large orchestration frameworks unless measured complexity later justifies them;
- generated projects remain ordinary repositories and never require the Builder Console, MCP server or Hetzner/OpenCode runtime to operate;
- external repositories in `config/external-sources.json` stay prior art until pinned, licensed, security reviewed and granted to a named role; no agent fetches a mutable branch at run time;
- do not add a canvas dependency (tldraw, quickdraw or otherwise) before `ArtDirectionPlan`, `RenderedEvidence` and `ElementIdentity` exist;
- do not adopt a screenshot-to-code generation architecture; references become structured adopt/avoid observations;
- routing benchmark ceilings are context-efficiency guards: expand a single task's context deliberately rather than raising a global ceiling;
- a graph/index layer is navigation evidence and never becomes repository authority, a required dependency or a CI gate;
- do not claim independent review when both reviewers run on the same model or runtime;
- do not create a second memory/lessons documentation system; one fact gets one home.
