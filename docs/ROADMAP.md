# Roadmap

The **sequencing authority**: where we are, what is blocked, what comes next and what evidence closes
each step.

`config/factory-status.json` is the machine-readable authority for the current phase, active stage,
outstanding gates and deliberate deferrals. This document does not restate that state; where the two
disagree the status file wins. What "finished" means is `docs/MASTER_PLAN.md` §7.

---

## Current position

**Phase 4.3 — mature website-builder capabilities, with the real-business corpus open beside it.** Active.

### The sequencing change of 2026-08-28

Phase 4D visual excellence **failed its gate and is now deferred rather than treated as a global
dependency.** This is a change of sequencing, not of standard:

- it is **not** passed, **not** waived, and its threshold is **unchanged** at 8.5 mean / 6.5 floor;
- four independent reviews recorded a best mean of **6.55**, and every verdict is preserved;
- the debt, the architectural finding and the **revival conditions** are in
  `docs/PHASE_4D_VISUAL_DEBT.md`, with the machine-readable form in `config/factory-status.json`
  under `deferredCapabilities`;
- **Phase 4.2A**'s static-renderer *visual parity* is deferred the same way and for a related reason:
  it was reviewed at mean 5.38, but against the **default presentation shell**, because no direction
  has ever been promoted for it to present by.

Why it was deferred rather than iterated again: the finding is that the **Presentation Registry** is
the ceiling — art direction owns tokens and section presentations and does not own the component
vocabulary — so distinctiveness never moved off ~4.8 through four rounds of intervention. Fixing that
means letting a direction select component implementations, which is a design-system change that
would be **badly designed from one thinly-evidenced business**. It needs the corpus and application
evidence that the stages below produce. Iterating CSS against a fixed vocabulary was returning less
each round while blocking work that does not depend on it.

**What this does and does not unblock.** Items 4, 5, 9 and 10 below no longer wait on the visual
verdict. Security, data-loss, durability and production boundaries are untouched and retain veto
power — nothing in this change makes them deferrable. Before App Builder claims best-in-class visual
output, professional visual maturity or fully proven website generation, the 8.5 gate must be
revisited and paid; that pre-release qualification is revival condition C and is mandatory.

**The one genuine blocker in the active stage is owner-only** and stops nothing else: the corpus needs
a second real business, and what is missing is an explicit asset-level rights approval, not code. See
item 4.

---

## Immediate programme

### 1–3. Phase 4D visual excellence and Phase 4.2A visual parity — deferred, unpaid

- **Status:** **measured, failed, deferred.** Not passed, not waived, threshold unchanged. These three
  items were the chain that blocked everything below them, and they no longer do.
- **What was measured:** four independent `design-critic` verdicts on the candidate set (best mean
  **6.55** against 8.5, best floor 4.8 against 6.5) and one on the static rendering (**5.38**, floor
  2.0). Every verdict file is committed under `examples/genuine-business/`. The reviewer requirement
  was satisfied — all three surfaces have now been reviewed by someone who did not produce them — so
  what is outstanding is the **quality**, not the reviewer.
- **Why deferred rather than iterated:** the ceiling is the Presentation Registry, not the art
  direction. See `docs/PHASE_4D_VISUAL_DEBT.md` for the finding, the full score history and the four
  revival conditions.
- **Revives when:** corpus evidence shows the convergence is cross-project; or a later capability needs
  direction-selectable component implementations; or **before any public claim of visual maturity**
  (mandatory); or genuinely new benchmark evidence appears. **Not** because another CSS pass might add
  0.3 points.
- **Next:** nothing waits on these. Items 4–10 proceed.

### 4. Product-proof corpus — real businesses, running now rather than after the visual gate

- **Status:** **open**, and deliberately no longer a freeze that waits on item 1. The corpus is partly
  what is needed to solve the visual system intelligently later, so making it wait on the visual system
  was circular.
- **Why now:** one project cannot distinguish a factory defect from a source ceiling. Principle 22:
  real product evidence, not roadmap enthusiasm, chooses what expands next.
- **First calibrated case — done and frozen:** nbm, a thin-assets / professional-service /
  provenance-stress case. Frozen intake, KnowledgePack `e7c387bc`, 9 sources, 22 facts, source hashes,
  rights limitations, five independent verdicts, responsive and launch-readiness results. **Do not
  regenerate it** unless a reusable factory change needs regression testing.
- **Blocked by — OWNER INPUT ONLY, and it blocks nothing else:** a second genuine business. The nearest
  candidate is MGB Decor (issue #60), which already has owner-supplied first-party source *locations*.
  It is not usable yet: issue #60 states explicitly that authoritative source locations grant **no**
  republication rights to any photograph, customer image, logo or third-party asset, and no
  asset-level approval exists in the repository. **The precise owner action needed** is an explicit
  asset-level rights approval plus the owner-supplied facts, frozen in the shape
  `examples/genuine-business/nbm-approved-intake.v1.json` already defines. Do not crawl those profiles.
  Do not infer approval from a URL being public. Never fabricate owner approval.
- **Exit evidence:** deliberately varied real businesses through the same product path under
  `docs/GENUINE_BUSINESS_ACCEPTANCE.md`, with per-case measurements and the anti-template diversity
  diagnostic owned by `docs/VISUAL_EXCELLENCE.md` §8.
- **Next:** item 5. Per-case metrics accumulate as data; **no Factory Intelligence dashboard** is built
  on one case.

**Allowed during the freeze:** a reusable defect the corpus exposed; a deterministic check for a real
observed failure; a contract, recipe, renderer or presentation improvement real output proved
insufficient; a security, data-loss, durability or runtime blocker; a measured cost, latency or
intervention bottleneck. **Paused while the corpus runs:** new orchestration frameworks, further role
proliferation, a new project class without corpus evidence, provider integrations with no live use
case, framework rewrites, and anything wanted because it sounds impressive.

### 5. Fix only the reusable defects the corpus exposes, then rerun the frozen inputs

- **Status:** waiting on item 4 producing a second case.
- **Exit evidence:** the same frozen briefs and source packs rerun and compared; per-class maturity
  tiers (`docs/MASTER_PLAN.md` §7.2) earned from what the corpus recorded. No class is claimed at any
  tier today.
- **Blocked by:** item 4, which is owner-blocked. This does **not** propagate to items 9–10 any more:
  capability work with a real consumer today proceeds without waiting for the corpus to name it.
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
  visual contracts, Q3 component/state preview,
  Q7 property tests, Q10 consumer assertions, Q12 production data-change safety (required before any
  autonomous mutation of real production data), and the remaining supply-chain hardening.
- **Blocked by:** nothing. **Next:** they feed Phase 6.

### 9. Phase 4.3 — mature website-builder capabilities — **ACTIVE**

- **Status:** **active.** This is the current stage.
- **Why now:** the corpus can no longer say which capabilities are needed on its own timetable, because
  it is owner-blocked on a second business. The rule that replaces "wait for the corpus" is narrower
  and still evidence-bound: **implement the capability that has a real consumer today**, not the whole
  §13 table because it is listed.
- **What the inventory found (2026-08-28):** most of the table is genuinely absent rather than partly
  built — no localisation beyond one NFR schema field, no content collections beyond a questionnaire,
  no Figma import, no brownfield reader. **The exception with a real consumer is the deterministic
  SEO/AEO scanner:** `config/gate-producers.json` lists `seo-aeo-scanner` under `unregistered`, meaning
  a registered gate names the check and no producer answers it, so that gate can never resolve on it.
  Close that first. Read-first brownfield profiling (`docs/PLATFORM_PARITY_PROGRAMME.md` §5.1) is the
  next strongest candidate and is strategically valuable for the later Predictor-class benchmark.
- **Exit evidence:** per-capability acceptance in `docs/PLATFORM_PARITY_PROGRAMME.md` §8 and §5. A
  capability is not claimed because a dependency or a plan exists.
- **Blocked by:** nothing. **Next:** item 10.

### 10. Phase 4.4 — high-value application capabilities

- **Status:** planned, specified, and **no longer gated behind item 5.** **Why now:** these separate a
  generated brochure site from a generated product, and a serious application benchmark is what
  produces the application evidence the deferred visual work needs (revival condition A/B).
- **Dependency order:** auth / organisations / RBAC → database + RLS → profiles/admin → email →
  uploads → notifications → webhooks → jobs/retries → billing → realtime if earned. Not one PR.
- **Exit evidence:** the integration acceptance standard in `docs/PLATFORM_PARITY_PROGRAMME.md` §3, §4
  and §14 — transactional email, notifications, webhooks, jobs/cron/queues, realtime, billing, and
  `IntegrationSpec` with the connection manager. None may be claimed first-class without it, and a
  package dependency existing is not evidence.
- **Blocked by:** the 4.3 capabilities that a chosen benchmark actually consumes. **Next:** item 11.

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
Currently deferred: the design-intelligence catalogue (4C.6), MessagingPlan (4D.3), the visual
comparison canvas, the four 4.2B–4.2E static extras — and, since 2026-08-28, **Phase 4D visual
excellence** and **Phase 4.2A static-renderer visual parity**.

Those last two are a different kind of entry and are marked as such in the status file by an
`unpaidGate` block. Everything else here is a capability nobody built because nothing reads it yet.
4D and 4.2A were built, were measured against `gates.visual` by an independent reviewer, and
**failed** — best mean 6.55 and 5.38 against a required 8.5. They are set down so unrelated work can
proceed, not resolved. `config/factory-status.json` carries their thresholds, their measured results
and their cited evidence; `tooling/deferred-gate-honesty.test.mjs` and `npm run control-plane:doctor`
refuse a deferral whose recorded best result reaches its threshold, so this distinction cannot be
edited away quietly. The narrative is in `docs/PHASE_4D_VISUAL_DEBT.md`.

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
