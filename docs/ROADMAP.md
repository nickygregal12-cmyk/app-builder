# Roadmap

The **sequencing authority**: where we are, what is blocked, what comes next and what evidence closes
each step.

`config/factory-status.json` is the machine-readable authority for the current phase, active stage,
outstanding gates and deliberate deferrals. This document does not restate that state; where the two
disagree the status file wins. What "finished" means is `docs/MASTER_PLAN.md` §7.

---

## Current position

**Phase 4D — Visual direction, responsive composition and candidate promotion.** Active.

**One thing blocks advancement, and it is not a capability**: a visual verdict from someone who did not
produce the work. Rule 17 forbids the factory promoting its own output, no genuinely independent model
runtime is enabled here, and restarting the same model is not independence. It is a person or a
provider, so **no amount of building closes it**. It appears as three outstanding gates in
`config/factory-status.json` because a candidate set, a static rendering and a bespoke presentation each
need one.

Everything the blocker does not touch has been built. The professional-output completeness gate in
`docs/VISUAL_EXCELLENCE.md` §9 is down to that single row.

**Safe parallel work while it is blocked** — none of it is a prerequisite for the corpus:

- the runtime-readiness evidence in `config/runtime-readiness.json` (items 6–7 below);
- the deterministic gate stages still open in `docs/ENGINEERING_QUALITY_PROGRAMME.md` (item 8);
- specification-only work for Phase 4.3/4.4 capabilities, in their own authorities.

---

## Immediate programme

### 1. Independent visual verdict on the Phase 4D candidate set

- **Status:** blocked, machinery complete.
- **Why now:** nothing in the product path advances past it. No ordinary build carries a promoted
  visual direction, so the direction machinery 4D built is unused — which is what the anti-template
  diagnostic reported on its first run.
- **Exit evidence:** a scored verdict against `gates.visual` in `config/agent-pipelines.json` for every
  candidate in the set. `npm run acceptance:visual-candidates` produces the evidence;
  `npm run review:visual-candidates` opens the Console over it.
- **Blocked by:** a reviewer who did not create the work.
- **Next:** promote or rework per the verdict.

### 2. Independent visual verdict on the static rendering of nbm

- **Status:** blocked, evidence complete.
- **Why now:** it closes Phase 4.2A and makes the two-renderer claim real rather than asserted.
- **Exit evidence:** a reviewer states whether the static nbm site is at least as good as the
  application-rendered one. `npm run acceptance:static-renderer` leaves the captures at
  `.app-builder/static-renderer` and stops.
- **Blocked by:** the same reviewer as item 1.
- **Next:** Phase 4.2A closes.

### 3. Close Phase 4D

- **Status:** waiting on items 1–2.
- **Why now:** the exit gate is otherwise satisfied.
- **Exit evidence:** every clause of the Phase 4D exit gate discharged, with 4D.3 (MessagingPlan) and
  the comparison canvas recorded as deferred rather than done.
- **Blocked by:** items 1–2.
- **Next:** the product-proof freeze opens.

### 4. Product-proof freeze — the first varied real-business corpus

- **Status:** next major evidence checkpoint. Opens when item 1 closes.
- **Why now:** the output machinery is complete enough that further extension is speculation. Principle
  22: real product evidence, not roadmap enthusiasm, chooses what expands next.
- **Exit evidence:** deliberately varied real businesses run through the same product path under
  `docs/GENUINE_BUSINESS_ACCEPTANCE.md`, with per-project measurements and the anti-template diversity
  diagnostic owned by `docs/VISUAL_EXCELLENCE.md` §8. Includes MGB Decor (issue #60).
- **Blocked by:** item 1.
- **Next:** item 5.

**Allowed during the freeze:** a reusable defect the corpus exposed; a deterministic check for a real
observed failure; a contract, recipe, renderer or presentation improvement real output proved
insufficient; a security, data-loss, durability or runtime blocker; a measured cost, latency or
intervention bottleneck. **Paused during the freeze:** new orchestration frameworks, further role
proliferation, a new project class without corpus evidence, provider integrations with no live use
case, framework rewrites, and anything wanted because it sounds impressive.

### 5. Fix only the reusable defects the corpus exposes, then rerun the frozen inputs

- **Status:** waiting on item 4.
- **Exit evidence:** the same frozen briefs and source packs rerun and compared; per-class maturity
  tiers (`docs/MASTER_PLAN.md` §7.2) earned from what the corpus recorded. No class is claimed at any
  tier today.
- **Blocked by:** item 4.
- **Next:** items 9–11 sequence by what the corpus measured.

### 6. Pinned task-image host digest and hosted egress attestation

- **Status:** open, and safe to do now — it is a safety boundary rather than a product surface.
- **Why now:** it is the deny-by-default evidence a role must carry before it can ever be
  `runtimeReady`, and it does not compete with the visual gate.
- **Exit evidence:** the digest recorded in `config/task-images.json` through a reviewed change, and the
  hosted boundary proof re-run with that image present. `packages/control-plane/src/runtime-readiness.js`
  refuses a promotion without it. Authority: `docs/AGENT_RUNTIME.md`.
- **Blocked by:** host access. **Next:** item 7.

### 7. One bounded low-risk real-model canary, reviewed

- **Status:** open, runbook complete.
- **Why now:** it is the last unmet runtime-readiness requirement, and nothing is `runtimeReady` until
  one bounded real attempt has been run and reviewed.
- **Exit evidence:** the `code-reviewer` canary executed and reviewed under the hard budget and both
  halves of the kill switch. Runbook: `docs/MODEL_CANARY.md`. State: `config/runtime-readiness.json`.
- **Blocked by:** item 6. **Next:** one genuinely runtime-ready role.

### 8. Remaining deterministic gate stages

- **Status:** open, and safe to do beside the visual gate.
- **Why now:** each is cheaper before the surface it guards grows.
- **Exit evidence:** the stage's own acceptance in `docs/ENGINEERING_QUALITY_PROGRAMME.md` — Q2 curated
  visual contracts, Q3 component/state preview, Q5 token enforcement,
  Q7 property tests, Q10 consumer assertions, Q12 production data-change safety (required before any
  autonomous mutation of real production data), and the remaining supply-chain hardening.
- **Blocked by:** nothing. **Next:** they feed Phase 6.

### 9. Phase 4.3 — mature website-builder capabilities

- **Status:** planned, specified. **Why now:** only after the corpus says which of them real projects
  actually needed.
- **Exit evidence:** per-capability acceptance in `docs/PLATFORM_PARITY_PROGRAMME.md` §8 and §5.
  Covers CMS/content collections, localisation, Figma/design import, existing-repository adoption,
  the deterministic SEO/AEO scanner and mature source-upload transport.
- **Blocked by:** item 5. **Next:** item 10.

### 10. Phase 4.4 — high-value application capabilities

- **Status:** planned, specified. **Why now:** these separate a generated brochure site from a
  generated product.
- **Exit evidence:** the integration acceptance standard in `docs/PLATFORM_PARITY_PROGRAMME.md` §3, §4
  and §14 — transactional email, notifications, webhooks, jobs/cron/queues, realtime, billing, and
  `IntegrationSpec` with the connection manager. None may be claimed first-class without it.
- **Blocked by:** item 5. **Next:** item 11.

---

## Later programme

Ordered, and none of it blocks v1. Each links to the authority that owns its detail; this document
owns only the order.

1. **Phase 4E/4F — environments, Git/staging, stakeholder review and release UX.** Explicit
   development/preview/production identity that fails closed when a target is ambiguous, then the
   collaboration surface on top of it. → `docs/PLATFORM_PARITY_PROGRAMME.md` §5–§7.
2. **Phase 5 — bounded specialist AI orchestration** on the dedicated runtime, with disposable
   per-role sessions, durable handoffs and provider-neutral adapters. → `docs/AGENT_RUNTIME.md`,
   `docs/AGENT_SPECIALIST_ARCHITECTURE.md`, `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`.
3. **Phase 5.5 — model/skill evaluation and red team**, including the controlled skill comparison that
   is the only promotion method. → `docs/AGENT_RUNTIME.md`, `config/skill-registry.json`.
4. **Phase 6 — production-quality, cross-browser, security and performance verification.**
   → `docs/ENGINEERING_QUALITY_PROGRAMME.md`, `docs/PRODUCTION_COMPLETENESS.md`,
   `docs/VISUAL_EXCELLENCE.md` §7.
5. **Phase 7 — deployment, operations, upgrade propagation and post-launch.**
   → `docs/PLATFORM_PARITY_PROGRAMME.md` §7 and §11, `docs/PRODUCTION_COMPLETENESS.md`.
6. **Phase 7.5 — experiments and controlled personalisation**, only once analytics, privacy and
   deployment state are mature. → `docs/PLATFORM_PARITY_PROGRAMME.md`.
7. **Phase 8 — evidence-driven factory improvement**, where the corpus becomes the input that decides
   which patterns are promoted and which retired. → `docs/VISUAL_EXCELLENCE.md` §11.
8. **The complex-app maturity programme**, culminating in the Predictor-class benchmark.
   → `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md` (issue #66).

Later expansion deliberately outside v1 — native mobile, a large connector marketplace, generated apps
as agent-accessible products, enterprise SSO, marketplace/ecommerce depth — is listed once in
`docs/MASTER_PLAN.md` §7.3 and is not sequenced here.

---

## Sequencing discipline

1. **A product gate needs product evidence.** Convincing architecture is not proof that real businesses
   like the output. A stage advances on artifacts, evidence, deterministic checks and an independent
   verdict, never on how complete the design looks.
2. **Build the minimum output machinery that makes the next real-world benchmark meaningful, then stop
   extending it.** The completeness list is `docs/VISUAL_EXCELLENCE.md` §9, not a licence to keep adding
   contracts.
3. **After that gate, real project failures outrank roadmap enthusiasm.**

Security, data-loss and durability blockers may interrupt this sequence. Speculative architecture may
not.

---

## Completed programme

A compact ledger. Implementation detail lives in the commits, the merged pull requests, the tests and
the code; it is not restated here. `config/factory-status.json` holds the machine-readable list.

- ✅ **Phase 0** — repository boundaries, manifest/build-contract schemas, registries, `create-app`
  skeleton, Console shell, CI and contamination guard.
- ✅ **Phase 1** — adaptive Quick/Standard/Thorough intake, company profile, source references,
  reviewed Build Contract, deterministic Manifest, save/resume, export, Chromium acceptance journey.
- ✅ **Phase 2** — versioned template/recipe contracts, neutral React/Vite template, fail-closed
  capability resolution, Supabase/auth/profiles/organisations/admin recipes, Netlify adapter, six
  layout patterns, handover docs, byte-stable generation.
- ✅ **Phase 3** — deterministic extraction across text/HTML/CSV/PDF/DOCX/XLSX, bounded same-origin
  crawl, content-addressed cache, provenance-aware facts, asset inventory, brand observations,
  knowledge-pack hash, `npm run ingest`.
- ✅ **Phase 3.5A/3.5B** — durable task/ledger/ChangeSet/checkpoint primitives, `instructionAuthority`
  trust boundary, deny-by-default capability policies, provider-neutral control-plane package, six
  canonical benchmark cases, recipe upgrade proposals, NFR and Design Contract groundwork.
- ◐ **Phase 3.5C** — sandbox and trace adapters, mostly landed early through Phase 4.5 work. What
  remains is items 6–7 above plus trace/export mapping.
- ✅ **Phase 3.6** — Manifest/Build Contract v2, `PageSpec`/`SectionSpec`/content-binding contracts,
  deterministic information architecture, trusted knowledge as a real generation input. 3.6C was closed
  by the accepted Phase 3.8E run.
- ✅ **Phase 3.7** — `apps/service` boundary, project/workspace lifecycle, service-owned generation and
  preview, JSONL event evidence with a SQLite read projection, provider-neutral tool descriptor.
- ✅ **Phase 3.8A** — segment-correct ChangeSet path policy; no textual-prefix scope escape survives the
  adversarial or the `fast-check` property cases.
- ✅ **Phase 3.8B** — `JSON Schema -> packages/contracts types -> Ajv boundary validation` for nine
  contract families, with `npm run contracts:check` failing on schema-hash or generated-type drift.
  Remaining schemas stay listed in `config/contract-families.json` with a recorded reason.
- ✅ **Phase 3.8C** — executed Supabase security acceptance; generated RLS policies are exercised
  against real authenticated users across roles and cross-organisation isolation.
- ✅ **Phase 3.8D** — `@axe-core/playwright` accessibility baseline in canonical browser acceptance,
  with deterministic serious/critical gates before any AI review.
- ✅ **Phase 3.8E** — genuine business product proof, passed 2026-08-26 at 0 meaningful manual edits.
  Immutable record: `docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`.
- ✅ **Phase 3.8F** — MCP v2 facade over the bounded factory surface. It exposes no production deploy,
  database write, raw secret, arbitrary path or shell execution, and it is an adapter, never factory
  truth.
- ✅ **Phase 3.8G** — brand-source and asset-provenance foundation, extending the existing
  content/asset intelligence rather than adding a second extraction subsystem. Asset rights/use state
  means "publicly visible" never silently means "approved to republish".
- ✅ **Phase 3.8H** — specialist agent architecture: role registry, project-class pipelines,
  deterministic no-self-approval, `HandoffContract`, typed rework, and a convergence engine that refuses
  to call an unrun gate a pass.
- ✅ **Phase 3.8I** — routing discipline: deterministic routing benchmarks with positive **and negative**
  triggers, bounded task routes that leave broad prompts unclassified, first-orientation context
  ceilings, and per-load-class skill budgets. Installed is not loaded.
- ✅ **Phase 3.8J** — `npm run architecture` makes the dependency direction a blocking gate, and
  `config/risk-surfaces.json` makes conditional review genuinely conditional: an ordinary CSS or
  documentation change buys no adversarial reviewer.
- ✅ **Phase 3.8K** — `npm run audit:launch` predicts manual edits in the same vocabulary as the
  acceptance schema and names the owning role; `StateMatrixSpec` and `JourneyClosureEvidence` are
  derived deterministically; canonical generation gates on a measured predicted-edit ceiling per
  project type that is lowered as the factory improves and never raised to pass a regression.
- ✅ **Phase 4A** — the first complete usable vertical slice: service-owned ingestion, durable ingestion
  tasks, versioned workspaces, visible task/event progress, service-managed preview and build history.
- ✅ **Phase 4B** — direct manipulation: Builder Element Identity that fails closed when a rendered
  element does not resolve, `RenderedEvidence` that records what a capture could not establish rather
  than omitting it, per-asset publication governance, focal-point cropping, section presentation
  selection, structured Design Contract editing, provenance-preserving text editing replayed over fresh
  composition, and asset replacement where no permission is inherited across a swap. Project asset
  policy modes were deliberately not implemented.
- ✅ **Phase 4C** — Design System Registry: a `DesignSystemSpec` compiler IR persisted into the generated
  repository as `.product/design-system.json`; BrandSpec, ArtDirectionPlan and MotionContract compiling
  into it; a Presentation Registry compiled from what the template actually renders that refuses a build
  it cannot satisfy; and deterministic DesignLint carried inside rendered evidence. 4C.6 is
  conditionally deferred. Storybook was evaluated and not adopted.
- ✅ **Phase 4.2A** — the static/content renderer: a second genuinely different renderer with
  deterministic, fail-closed selection, producing six route documents and zero client JavaScript for
  the same business the application renderer serves with one document. Its independent visual review is
  item 2 above.
- 🚧 **Phase 4D** — visual direction, responsive composition and candidate promotion. Machinery
  complete; items 1 and 3 above are what remain.
- ◐ **Phase 4.5** — pre-agent hardening, landed ahead of its place in the sequence: the execution
  sandbox and its rootless implementation, secret/network/resource restrictions, the supervised attempt
  lifecycle, the pinned content-addressed task image with bounded public egress, and the deny-by-default
  capability broker. The registered specialist pipeline is now executable end to end with a
  deterministic stand-in where the model will be (`npm run rehearse:pipeline`) — a rehearsal of the
  control plane, not a build, not a runtime proof and not product evidence. **No role is
  `runtimeReady`**; items 6–7 above are what that costs.

---

## Deferred / conditional

`config/factory-status.json` `deferredCapabilities` is the only backlog for conditionally deferred
work, and it is the sole place a reviving condition is recorded. No document keeps a second one.
Currently deferred: the design-intelligence catalogue (4C.6), MessagingPlan (4D.3) and the visual
comparison canvas.

Two conditional decisions are not stages and live here:

- **Hono** — evaluate only if Console/service development begins duplicating route/request/response
  types. Do not rewrite the service to adopt it; `packages/contracts` remains authoritative.
- **Comparative competitor evidence** — once the internal corpus is stable enough for the comparison to
  mean anything, the same frozen brief may be run through relevant current builders and scored blind.
  The purpose is to test the best-in-class claim, not to chase competitor features.

---

## Architectural follow-ups to preserve

Standing constraints. Each one exists because the obvious alternative was considered and rejected.

- add short ADRs for durable-state choice, control-plane ownership, template strategy, backend
  defaults, deployment defaults and environment identity;
- do not adopt `lucide-react` as a default generated dependency when static SVG copying solves the need;
- do not add another SVG rasterizer while Sharp satisfies the deterministic social-image pipeline;
- image-generation providers remain factory adapters, not generated-app dependencies;
- social/profile enrichment prefers exact URLs, official surfaces and authorised connectors rather than
  platform-bypass scraping;
- publicly visible assets retain rights/use state and are never assumed approved for republication;
- do not make Hono authoritative for contracts;
- evaluate `@mozilla/readability` against real crawled sites before adopting it;
- do not adopt Temporal/LangGraph/large orchestration frameworks unless measured complexity justifies
  them;
- generated projects remain ordinary repositories and never require the Builder Console, MCP server or
  Hetzner/OpenCode runtime to operate;
- external repositories in `config/external-sources.json` stay prior art until pinned, licensed,
  security reviewed and granted to a named role; no agent fetches a mutable branch at run time;
- do not add a canvas dependency before a concrete comparison task proves the Console cannot do it;
- do not adopt a screenshot-to-code architecture; references become structured adopt/avoid observations;
- routing benchmark ceilings are context-efficiency guards: expand one task's context deliberately
  rather than raising a global ceiling;
- a graph/index layer is navigation evidence and never repository authority, a required dependency or a
  CI gate;
- do not claim independent review when both reviewers run on the same model or runtime;
- do not create a second memory/lessons documentation system; one fact gets one home;
- do not start a refactor programme because a file is large; extract by product capability when
  divergence actually appears;
- do not treat the `consumer-app` web class as native-mobile support.
