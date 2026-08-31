# App Builder Roadmap

This is the repository's **execution spine**. `config/factory-status.json` is machine-readable current state; specialist documents own depth; `docs/MASTER_PLAN.md` owns the destination.
## START HERE

### What App Builder is

App Builder is a private AI-first website and application factory. It turns ideas, businesses, existing repositories, URLs and source material into structured requirements, portable repositories, independently verified product evidence and, eventually, safely released and maintained products with progressively less human steering.
Its advantage is not raw code generation. It is:
`requirements + provenance + deterministic composition + reusable recipes/invariants + bounded autonomy + real generated-product evidence + learning that improves future builds`
### Programme thesis

The factory architecture is stronger than the amount of exceptional finished-product quality proved so far. The programme therefore shifts from **factory-building to factory-using**. A new capability is normally earned by a real benchmark, a genuine-business failure, a production/release need or a demonstrated reusable defect—not by appearing in a parity list.
### How to use this roadmap

For ordinary work, do not read the documentation tree. Read `AGENTS.md` and this file, then only the one to three authorities in the current Stage Card. Expand only when evidence proves another authority is needed.
Statuses are deliberately small:

- **NOW** — highest-value task, executable immediately;
- **NEXT** — becomes executable when the preceding main-track stage closes;
- **PARALLEL** — independent of the main track;
- **WAITING — OWNER INPUT** — only the owner can unblock it;
- **DEFERRED — REVIVAL CONDITION REQUIRED** — important debt, deliberately inactive;
- **LATER** — real work whose prerequisites have not earned it.
### Current phase and priority

**Phase 4.4 — product proof through high-value application capability. Active.**

> **NOW: run the bounded serious-application benchmark.**
The three bounded truth/safety stages are merged, so the next highest-value work is making one difficult product journey reveal which reusable application primitives the factory actually lacks.
## EXECUTION MAP

```text
database-upgrade honesty (done)
  -> gate-evidence CI truth (done)
  -> reproducible root npm ci (done)
  -> bounded serious-application benchmark (NOW)
  -> fix smallest reusable failures
  -> rerun the frozen benchmark
  -> mature requirement coverage
  -> accepted artifact -> release -> verification -> rollback
  -> only then earn larger migration/autonomy work
MGB Decor: owner facts/rights supplied; frozen prototype input runs PARALLEL through the current factory
Provider/operator continuity: PARALLEL infrastructure, never the product sequence
```
### Outcome A — quality truth closure

Completed: database-bearing upgrades fail closed as `database-evolution-unmodelled` (PR #201).

Completed: ordinary CI runs the integrated producer → resolver → convergence lane and fails evidence-system integrity without weakening measured product gates.

Completed: the root lockfile is tracked and every workflow installs with `npm ci`, so a fresh checkout reproduces the exact dependency graph instead of resolving a new one (`tooling/root-install-reproducibility.test.mjs` keeps it closed).

### Outcome C — bounded serious-application benchmark

## [NOW] Stage: Bounded serious-application benchmark

**Outcome**
One portable generated application proves this domain journey against a real generated backend:
`scheduled entity -> user decision -> authoritative deadline/lock -> official result -> deterministic settlement -> persisted score -> leaderboard`
**Why now**
This makes a difficult product journey reveal which reusable application primitives the factory actually lacks. It is not “continue Phase 4.4 capabilities” and not a rebuild of the whole Euro 2028
Predictor.
**Prerequisites**

- the three bounded truth/safety stages above are merged;
- ~~freeze a bounded benchmark contract and representative scenario data~~ — done: `config/application-journey-benchmarks.json`, held still by `tooling/application-journey-benchmark.test.mjs`. The journey, lifecycle, lock authority, official/provisional boundary, settlement identity key, scoring rule and leaderboard ordering are frozen, and the benchmark's domain vocabulary is checked against every factory surface.
- ~~make the frozen contract executable against a generated backend~~ — done: the `scheduled-decisions` recipe supplies the reusable spine, `.tmp/generated-acceptance-journey-benchmark` is a generated project that installs it, and `tooling/application-journey-benchmark-acceptance.sql` runs every frozen scenario against real PostgreSQL inside the existing `database-security` job. The scoring rule is *not* in the factory: the recipe ships `app_domain.score_decision` and `app_domain.max_decision_points` as functions that raise, and `tooling/application-journey-benchmark-domain.sql` is the benchmark product's own replacement.
**Read before working**

1. `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.
2. `docs/PRODUCTION_COMPLETENESS.md`.
3. `docs/ENGINEERING_QUALITY_PROGRAMME.md` — requirement coverage and database evidence.
**Do**

1. ~~Specify authoritative domain state, lifecycle transitions and official/external truth boundary.~~ — done. `public.scheduled_entity_state` derives `scheduled`/`locked` from the stored deadline and the server clock, so no scheduler has to fire for a lock to take effect; `awaiting-official`, `settled` and `voided` move only through privileged transitions. `confirmed` is the only official result status.
2. ~~Enforce the deadline server-side and refuse post-lock mutation.~~ — done, and in the database rather than at the edge: a trigger refuses a late decision whatever the role, and the update policy keeps the window condition in `with check` so a late amendment raises instead of silently changing nothing. A closed window cannot be reopened.
3. ~~Settle deterministically and idempotently; persist score and expose a leaderboard/read model.~~ — done. The frozen identity key is a unique constraint, so a repeat settlement creates nothing rather than relying on application-level idempotence; a correction settles under a new version and the superseded scores stay on record. The leaderboard's `board_position` is a window function whose ordering ends in the unique identity, so it cannot tie.
4. ~~Exercise real identities, isolation and non-vacuous pre-lock/locked/settled scenarios.~~ — done. Four competitors inside one organisation, which is the axis this shape gets wrong; each isolation assertion is made while the data it must not reach exists.
5. ~~Prove the **browser** journey against the generated backend.~~ — done. The recipe now ships the section the composer places rather than a typed client surface, and `tests/generated-app/scheduled-decisions.spec.ts` drives the journey through the generated application against the same Supabase stack the pgTAP suite runs on. The lifecycle state the interface renders comes from `public.scheduled_entity_board`, which derives it server-side from the stored deadline, so no control is offered for a window the database has already closed. The reveal is asserted the honest way: signed in as one competitor, another competitor's open decision — which the seed demonstrably created — must be absent from the page, and present once the entity settles.
6. ~~Record factory-level reusable defects, fix only those, then rerun the identical frozen benchmark.~~ — done. Two reusable defects, both in `recipes/scheduled-decisions` and both invisible to SQL: a client upsert that asked for privileges the deliberately narrow column grant withholds, so every first decision was refused; and an interface that discarded the database's stated reason for a refusal. The frozen contract was not edited, and the rerun cost zero interventions. The measurement is recorded in `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.
**Do not**

- rebuild auth, profiles, organisations, records, RLS, uploads, notifications or admin;
- introduce football-specific factory recipes/contracts;
- add email, billing, realtime, jobs, queues, generic webhooks or another backend unless this journey
  proves a concrete consumer and acceptance boundary;
- attempt the whole Predictor.
**Evidence that closes this stage**

- ~~pre-lock success and post-lock refusal are executable~~;
- ~~repeated settlement is idempotent and official result correction follows an explicit policy~~;
- ~~scores/leaderboard are deterministic and persisted~~;
- ~~isolation is tested with real competing identities/data, not vacuously~~;
- ~~the generated repository installs, checks, builds and runs independently~~ — the benchmark project installs from its own lockfile, passes its own `tsc --noEmit`, builds, and is the repository the browser journey is served from;
- rendered/product evidence receives independent review — **the evidence now exists; the verdict does not.** This criterion was open for a reason that had nothing to do with reviewers: the lane photographed only failures, kept traces only for failures and reported to a terminal, so a green run produced nothing and the CI step published an empty directory under `if-no-files-found: warn`. The lane now photographs every journey, records what the browser reported — uncaught exceptions, console errors, requests that never completed, responses at 400 or worse — and fails a journey that took one it did not declare, so a passing journey can no longer be a page that threw. `npm run evidence:generated-app` assembles the captures, the classified signals and the written reason for every signal a declaration excused into one portable packet. The packet states `serverMode: development` and `depictsShippingArtifact: false` through the same helper the rendered-evidence path uses, because this lane serves the generated project's Vite dev server: it is local-browser product evidence and is not evidence about a deployed artifact. What remains is the independent verdict over that packet. That was previously written down as "an operator action because it spends credits", which was true and incomplete: there are three blockers, and only one of them belongs to the owner.
  1. *The host switch is off.* `/etc/app-builder/model-execution.json` reads `{"enabled": false}`, and `config/model-execution.json` requires both it and the repository key to say enabled before any provider call. **Owner action.**
  2. *There is no reviewer on this host.* `tooling/lib/codex-visual-reviewer.mjs` stamps `REVIEWER_VENDOR = 'openai'` because it executes the Codex CLI, and that CLI is not installed. Anthropic cannot substitute: the producer of this evidence is Claude, and a same-vendor review is not the independence rule 17 asks for. **Owner action** — install and authenticate the CLI, then `npm run review:codex -- --packet <dir> --authorise`.
  3. *The reviewer cannot read this packet yet.* It consumes a visual-candidate packet — candidates scored against `CRITERION_EVIDENCE` at desktop/tablet/mobile — and the journey packet is a different artifact: journeys, classified signals, one viewport. **Engineering, not authorisation.** Authorising the first two would not by itself produce a verdict, and this is the piece to build before asking anyone to spend anything.
  Stated this way so the owner is asked for exactly the two things only they can do, and the third stops being invisible behind them;
- ~~the frozen rerun shows the reusable correction burden decreased~~ — first pass cost two reusable factory corrections, the rerun against the unedited contract cost none. Two runs of one slice is a first data point, not a trend.
**Then**
Advance requirement-coverage maturity using the precise requirements this slice exposed, then begin the accepted-artifact release stage. Larger capabilities remain evidence-triggered.
### Outcome B — second genuine-business proof

## [PARALLEL] Stage: MGB Decor genuine-business case 2

**Outcome**
Run a materially different real business through the current factory to test whether NBM's visual convergence is factory-wide or case/source-specific.
**Why it matters**
NBM was a thin-imagery professional-services/provenance stress case. MGB is not merely “business #2”; it is the preferred falsification experiment for the hypothesis that one shared component vocabulary limits distinctiveness across businesses.
**Owner input status — supplied for prototype work**
The owner supplied approved facts, prototype intent, and asset-level prototype rights over a logo and two project photographs. The frozen input is
`examples/genuine-business/mgb-approved-intake.v1.json`, and it is deliberately a **prototype/product-proof** input rather than a launch input: production contact details are clearly labelled placeholders, no review or project evidence was supplied, the approved asset bytes were never handed over and no domain is owned. Every one of those gaps is recorded in the bundle as intake feedback, and none of them blocks generation, review or reusable factory correction.
Public website/social URLs remain evidence locations, not republication permission. Accessible images do not become approved assets, and a rights declaration without bytes is not an ingested asset.
Promotion of an accepted MGB build to a real public launch still requires the production items above; that is a launch condition, not a proof condition.
**Read before working**

1. `docs/GENUINE_BUSINESS_ACCEPTANCE.md`.
2. `docs/VISUAL_EXCELLENCE.md`.
3. GitHub issue #60.
**Do**

1. ~~Freeze approved facts, sources, assets and rights~~ — done: `examples/genuine-business/mgb-approved-intake.v1.json`, regenerated byte-for-byte by its builder and held still by `tooling/mgb-corpus-intake.test.mjs`.
2. ~~Run the current factory first—no pre-emptive Presentation Registry redesign~~ — done: the frozen input generated, installed, checked, built and captured across desktop, tablet and mobile without a Presentation Registry change.
3. Capture independent product/visual evidence and compare the failure mechanism with NBM. **Outstanding.** The operator who authored the input and ran the build cannot issue its verdict (principle 17), so the run so far records measured observations, not scores.
4. Record score, criterion floor, distinctiveness, responsive quality, publishability, interventions,
   elapsed effort, cost and whether primitive-vocabulary convergence recurs.
5. Fix the reusable defects the run exposed, then rerun the identical frozen input and compare.
**Evidence that closes this stage**

- a replayable approved intake/source pack with asset-level rights;
- a genuine-business acceptance packet and independent review;
- a conclusion that distinguishes case-specific source limits from repeated factory-wide convergence.
**Then**
If convergence recurs, the Phase 4D component-family revival is earned. If it does not, do not rebuild the Presentation Registry merely because NBM struggled.
## PRODUCT-PROOF TRACK A: Genuine websites

### NBM context capsule

NBM proved ingestion, KnowledgePack/provenance, deterministic composition, an ordinary generated repository, supported preview/evidence, launch audit and owner acceptance with **0 meaningful manual edits**. It did **not** prove best-in-class visual generation.
Independent visual review reached best mean **6.55** and distinctiveness around the mid-4s. The formal gate remains **mean ≥ 8.5 and every criterion ≥ 6.5**. Therefore `0 edits` does not mean `excellent design`; optimise for resources/interventions required to reach independently accepted quality.
Visual candidates once omitted the accepted KnowledgePack. That defect was fixed and source fidelity improved, but visual quality still failed. Do not reopen the fixed bug or begin another NBM CSS loop.
### Phase 4D state

**DEFERRED — REVIVAL CONDITION REQUIRED. Unpaid, not passed, abandoned or globally blocking.**
The current hypothesis is that art direction changes tokens, layout and section presentation while still inheriting one primitive/component vocabulary. That may explain repeated pill buttons, CTA blocks, dividers and display treatment, but one business cannot prove it cross-project.
Do not invent a “Design Grammar” subsystem. If MGB repeats the mechanism, begin with the smallest component-family experiment (for example button, CTA or display-type treatment) and rerun frozen MGB.
Authority: `docs/PHASE_4D_VISUAL_DEBT.md`.
Reviewer independence is already required. Reviewer calibration is separate: before scores support a professional-maturity claim, calibrate the critic against excellent human work, competent commercial work, generic templates and weak/polished-generic AI output. This does not block current application work. Authority: `docs/VISUAL_EXCELLENCE.md`.
## PRODUCT-PROOF TRACK B: Serious applications

The Predictor-class benchmark is the long-term pressure test, in bounded vertical slices. Existing application foundations are reused, not rebuilt. Factory contracts remain domain-neutral while project rules remain project code.
For each run record: accepted/publishable result, independent product/visual result, deterministic first-pass failures, unconsumed material requirements, owner decisions, meaningful interventions, rework loops, elapsed time, AI/tool cost and post-launch defects where applicable.
The optimisation target is **Accepted Quality Efficiency**. Zero edits to a 6.5-quality result is not better than two interventions to a 9-quality result.
## [PARALLEL] Provider and operator continuity

Operator tools (Claude Code, Codex CLI, OpenCode) work in controlled development worktrees. Factory model/API workers are separately governed by role, provider readiness, data class, capability, privacy, cost and the master switch. Codex/ChatGPT OAuth—especially `~/.codex/auth.json`—must never become factory gateway credentials.
Every fallback provider is evaluated from scratch. Quota failure grants no inherited authority and no privacy downgrade. If none qualifies, the durable result is `waiting-for-provider`; secrets are never a routable data class. This lane may improve in parallel but never replaces product proof.
Read only `docs/AGENT_RUNTIME.md` and `config/provider-profiles.json` for provider work.
## LATER LIFECYCLE

### Requirement coverage maturity

`material requirement -> explicit consumer/disposition -> evidence`
Valid outcomes include implemented/proven, implemented/evidence-outstanding, unsupported/custom, deferred, excluded or superseded by an approved decision. Silent loss is invalid; so is generated scope added only because a model assumes that project class usually contains it. Extend existing Build
Contract, Manifest, capability-integrity, composition, journey and evidence contracts rather than creating a giant parallel requirements platform.
### Outcome D — accepted build to release

`source revision -> build artifact -> preview -> evidence -> independent review -> approved revision
-> production promotion -> smoke/health verification -> release record -> rollback target`
Production is explicit promotion of the accepted identity, never whatever is open in a worktree. A stateful product may later require backend identity, migration state, scoped secrets, integration environment and scenario data. A static site does not need database branching.
### Outcome-first structure — owner intent over owner solution

Principle 24 says the factory may supersede an owner's *proposed solution* when evidence supports a
better one, and must obey facts, business rules and anything marked non-negotiable. Today only the
principle exists. What is missing is the machinery that makes it real, and the proof that it works.

The whole programme is sequenced by dependency, not by appetite. Each stage is earned by the one
before it; none of it displaces the current `NOW`.

**A — intake semantics.** Extend the Build Contract/intake session so an owner statement carries a
classification (`fact`, `goal`, `business-rule`, `hard-requirement`, `constraint`, `preference`,
`reference`, `suggested-solution`, `open-question`) rather than arriving as undifferentiated prose,
and so a `suggested-solution` is a falsifiable hypothesis with an inferred goal, an affected journey
and the evidence that would settle it. Add the deviation record — suggestion, inferred goal, evidence,
selected solution, why it is better, confidence, whether owner approval is genuinely required — for
material divergences only. The escalation policy that says which decisions the factory owns outright
and which it must genuinely ask about is written in `docs/PRODUCT.md`; this stage is the machinery that
enforces it, not a second copy of it. Extend the existing contracts; do not start a second intake
system.

**B — IA capability.** `information-architecture` is a planned placeholder with a null path. Build it,
give it frozen benchmark cases across simple marketing, professional services, B2B SaaS, internal tool,
consumer app, information-heavy dashboard, multi-context product, mobile-first product and brownfield
redesign, and evaluate it on quality, task-path and hierarchy correctness, reviewer agreement,
regressions, tokens, runtime and cost. Complete the Rampstack prior-art evaluation already scoped in
`config/external-sources.json`. Add category-convention evidence only where deterministic knowledge is
insufficient, and never as a stored per-industry template.

**C — structural composition.** Decide whether a `CompositionPlan`/`WireframeSpec` between
`InformationArchitectureSpec`/`UXFlowSpec` and `PageSpec`/`SectionSpec` materially improves reasoning,
review and testability — and drop it if it does not. `yhassy-wireframe-skill` is registered as prior art
for exactly that question. Replace project-type-only layout defaults with selection from task shape:
primary tasks, frequency, urgency, surface count, density, switching frequency, create/monitor/browse
orientation, mobile importance and navigation depth, keeping the deterministic fallbacks. Produce two or
three materially different structural candidates for hard surfaces only, and compare them on hierarchy
before any styling exists.

**D — structural quality enforcement.** A gate that can fail a technically valid but structurally weak
composition, extending the existing IA/UX critics before anyone adds a `composition-critic`. Plus
deterministic StructuralLint for the defects that are not matters of taste: no visible primary task,
several competing primary actions, a high-frequency task buried behind secondary navigation, orphan
routes, duplicated destinations, a mobile composition that is only the desktop order stacked, a required
surface missing from the hierarchy.

**E — anti-vibe proof.** The benchmark that decides whether any of this worked. Bad-owner-suggestion
resistance: hide a high-frequency destination under More, add widgets to fix a hierarchy problem, three
equal cards where one action should dominate, a state library the state complexity does not warrant, a
modal where the task wants a page, "modern" as gradients and glass. Each case must distinguish goal
understood, weak proposal rejected, sound proposal kept, hard requirement obeyed and preference respected
where alternatives are equivalent. The *routing* half of this is already executable and does not need
this stage: `config/agent-routing.json` now carries `information-architecture` and
`structural-composition` lanes, and three cases in `config/agent-routing-benchmarks.json` hold that an
owner's navigation placement reaches the information architect rather than an implementer, that "add
more widgets above the fold" reaches composition rather than art direction, and that a named state
library stays unclassified. What stage E adds is the behavioural half, which needs executing roles. Its
twin matters as much: ambiguity cases where the factory must ask because it genuinely cannot know,
scored on unnecessary questions as well as missed ones. Then human
steering burden as a tracked metric, optimised against accepted quality rather than to zero.

**F — brownfield structure.** Extend the sequence below so structural diagnosis precedes mutation:
routes and screens, navigation graph, key journeys, rendered desktop/mobile baseline, IA diagnosis,
composition diagnosis, protected behaviours, then the bounded change. This is the path for a product
whose problem is "everything exists but it is badly organised".

**G — Console visibility.** Make the factory's reasoning inspectable — goal, owner suggestion, decision,
reason, confidence, and whether the owner is genuinely needed — plus a structural preview before
expensive stages. Visibility and optional intervention, not another mandatory human gate.

**Adaptive questionnaire.** Sequenced with A because it is the same problem at the front door. The
existing questionnaire already has typed questions, `when` conditionals, defaults, `depth` and `impact`,
and its own principles already promise "allow explicit decide-for-me answers". Four questions do offer
one — `tenant_model` and `billing_model` in `b2b-saas`, `payment_model` in `consumer-app`, `authors` in
`content-site` — and what happens when an owner picks it is the sharper finding: `decide for me` is in
`AMBIGUOUS_VALUES`, so `buildAmbiguityFollowUpRequest` returns a required follow-up asking the owner
the same question again, reason "High-impact answer is explicitly ambiguous", while the literal string
stays in the durable contract and `tenant_model` silently behaves as individual-user. Delegation is
currently read as confusion. That is principle 24 inverted at the front door, and it is the first thing
this lane fixes. Beyond it: scenario-card and ranking question types, a first-class `recommend` answer,
answer provenance separating owner-selected from factory-recommended and factory-inferred, dependency
invalidation when an earlier answer changes, and contradiction detection before the build starts. Every
one of those needs a Console renderer to be real; adding the fields alone would be a knob nothing reads.
The point is token efficiency as much as usability: `accessModel = public-marketing-private-app` is a
value the pipeline can act on deterministically, where the prose it replaces has to be re-interpreted by
a model on every read.

One sequencing constraint holds this lane closed until Outcome B's comparison is taken, and it is
mechanical rather than a preference. The two frozen genuine-business intakes are replayed against the
questionnaire they were approved on: `detectIntakeBundleDrift` raises `questionnaire-version-changed`
at **blocking** severity whenever the version moves, and both bundles record `1.3.0`. Every change
above alters the questions, so it bumps that version and makes both frozen inputs un-replayable until
they are re-approved — and rerunning an unedited frozen input is Outcome B's whole method. When this
lane does open, re-approving both bundles is part of the same change rather than a follow-up.

### Brownfield adoption

`repo + optional URL -> frozen baseline -> understanding -> design-system assimilation -> IA and
composition diagnosis -> Improvement Contract -> bounded ChangeSet -> evidence -> independent review
-> before/after -> PR -> release`
Read before mutate. Preserve `demonstrated`, `inferred`, `unproven` and `not-applicable`: a dependency, folder or file does not prove runtime behaviour. Structural diagnosis is part of understanding, not part of the change: a navigation graph, the key journeys and a rendered desktop/mobile baseline are what let a redesign be judged against the product it replaced. Predictor becomes a hard brownfield benchmark only after exact-revision behavioural and rendered baselines can protect known-good behaviour.
### Static versus application rendering

Use the static/content renderer for public marketing/content sites needing crawlable route documents.
The SPA renderer is valid for authenticated/stateful applications; one crawlable SPA document is an architectural trade-off, not automatically a bug. Investigate hybrid/SSR only when one real product needs both substantial public multi-route content and stateful application behaviour. Static renderer engineering correctness and its unpaid visual parity are separate facts. Authority:
`docs/RENDERER_SELECTION.md`.
## REVIVAL / DECISION TRIGGERS

| Evidence trigger | Decision unlocked |
| --- | --- |
| MGB reproduces NBM component-vocabulary convergence | Test the smallest Presentation Registry/component-family expansion |
| Serious benchmark requires an unsupported capability | Build the smallest reusable capability with that consumer/evidence |
| First deployed stateful app needs schema evolution | Design automatic database migration from that real transition |
| One product needs public crawlable routes plus substantial authenticated behaviour | Investigate hybrid/SSR architecture |
| Measured CI feedback/resource pain | Optimise or split CI around the measured bottleneck |
| A real remote Factory service is required | Design an authenticated remote boundary |
| Several corpus cases can support comparison | Add richer factory-learning metrics, not a dashboard before data |
| A professional visual-maturity claim approaches | Calibrate visual reviewers against reference and expert-human evidence |
| A build obeys a weak owner suggestion that a specialist should have superseded | Start the outcome-first programme at stage A rather than fixing that build |
| An owner statement's classification changes what the factory should do with it | Extend the Build Contract with owner-input semantics |
| A structurally weak composition passes every existing gate | Add the composition gate and the StructuralLint rules that would have caught it |
| A frozen IA benchmark case exists that the planned skill cannot answer | Build the `information-architecture` skill against it |
| A real project's visual result is measurably limited by missing publishable imagery, or the governed input path cannot meet the Ardwell & Roe asset floor | Implement the smallest `AssetCandidate` lane and run the §2.1.3 provider benchmark per task class |
| A real project's ingestion fails on the existing crawler — client-rendered page, linked PDF, unrecoverable structure | Evaluate a structured extraction backend behind `normalizeWebsite`, against the browser tooling already registered |
| A real product is released against a named accepted revision | Build the `ProductBehaviourEvidence` return path so the factory can learn from what users did |
## EXPLICITLY NOT NOW

- another NBM visual/CSS loop or pre-evidence Presentation Registry redesign;
- a full automatic database migration/fleet system;
- email, billing, generic webhooks, queues/jobs, realtime or another backend without a real consumer;
- CMS/content collections, localisation, Figma import or hybrid SSR without a real project;
- another orchestration framework, more roles/providers merely because they exist, or broad runtime
  promotion before product proof;
- FactoryService, SQLite/event-ledger, project-type or whole-Console rewrites based on size/taste;
- a full typed-error migration, tiny-corpus intelligence dashboard or whole Predictor implementation;
- an image, vector, editing or video generation lane, a hosted crawler, or a behaviour-analytics adapter. Contracts,
  benchmarks and provider candidates are placed in `config/capability-providers.json` and the authorities it names,
  and every one of them is deferred with a revival condition above. Product proof outranks provider shopping: a
  capability is implemented when a benchmark or a real project has created the consumer, not when the API looks good.
These may be valuable later. They are not earned now.
## DURABLE GUARDRAILS

- **Proof of proof:** a quality claim identifies the correct subject, build/artifact, environment and
  meaningful coverage. Stale, mismatched, wrong-route and zero-subject evidence is refused.
- **No lost requirements:** every material requirement gets an explicit consumer/disposition and
  evidence; every generated capability traces to approved product intent.
- **Deterministic first:** rules and executable gates settle what they can before model judgement.
- **No privacy downgrade:** provider fallback re-evaluates policy from scratch or waits.
- **Read before mutate:** brownfield understanding and a frozen baseline precede diagnosis/mutation.
- **Portable output:** generated products remain ordinary repositories without App Builder runtime.
- **No self-approval:** creators do not issue final promotion verdicts.
### Shared-host/worktree safety

Operator/development checkouts may live under `/home/predictor/app-builder-bootstrap` with worktrees in
`/home/predictor/app-builder-worktrees/`. The isolated service tree is `/srv/app-builder/repository`, owned by constrained user `appbuilder`. They are intentionally separate; do not sudo around ownership because a path differs from expectation.
One mutable agent equals one branch/worktree. Never clean, reset, stash, switch or overwrite another session's tree. When main moves: fetch, rebase your own branch, rerun relevant checks, dispatch exact-head
CI and merge only that tested head. Avoid overlapping full browser/database/mutation suites on the shared host where practical. Full runbook: `ops/hetzner/README.md`.
## OWNER INPUT QUEUE

| Item | Needed | When supplied |
| --- | --- | --- |
| MGB Decor | Approved fact bundle and explicit per-asset publication/use rights | Freeze intake and run the current factory as the parallel visual falsification experiment |
## SPECIALIST AUTHORITY INDEX

| Working on | Read |
| --- | --- |
| Current state/sequence | `config/factory-status.json`, this roadmap |
| Owner intent vs owner solution | `AGENTS.md` principle 24, then this roadmap's outcome-first stages |
| IA, composition structure, anti-vibe benchmarks | This roadmap's outcome-first stages, `config/agent-roles.json`, `config/skill-registry.json` |
| Database/file upgrade lifecycle | `docs/PLATFORM_PARITY_PROGRAMME.md`, `packages/control-plane/src/upgrades.js` |
| Engineering gates/evidence/requirements | `docs/ENGINEERING_QUALITY_PROGRAMME.md` |
| MGB/genuine-business acceptance | `docs/GENUINE_BUSINESS_ACCEPTANCE.md` |
| Visual quality/Phase 4D | `docs/VISUAL_EXCELLENCE.md`, `docs/PHASE_4D_VISUAL_DEBT.md` |
| Serious application benchmark | `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md` |
| Release/environments/completeness | `docs/PLATFORM_PARITY_PROGRAMME.md`, `docs/PRODUCTION_COMPLETENESS.md` |
| Brownfield adoption | `docs/PLATFORM_PARITY_PROGRAMME.md` §5 |
| Renderer selection | `docs/RENDERER_SELECTION.md` |
| Providers/model execution | `docs/AGENT_RUNTIME.md`, `config/provider-profiles.json` |
| Hetzner/worktree operations | `ops/hetzner/README.md` |
| Long-term destination | `docs/MASTER_PLAN.md` |
## STAGE COMPLETION PROTOCOL

When a stage closes:

1. prove its acceptance criteria;
2. merge the exact tested head under current CI rules;
3. update its specialist authority only if durable truth changed;
4. update `config/factory-status.json` when machine current state materially changes;
5. advance this roadmap's single `NOW` and name what became executable;
6. remove completed execution prose instead of accumulating a diary;
7. leave history in Git, merged PRs and evidence records.
`tooling/roadmap-status-consistency.test.mjs` catches easy phase/outcome contradictions. Human review still owns whether the sequence is correct.
