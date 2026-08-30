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
MGB Decor: WAITING on owner facts/rights, then runs PARALLEL through the current factory
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
6. Record factory-level reusable defects, fix only those, then rerun the identical frozen benchmark.
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
- rendered/product evidence receives independent review;
- the frozen rerun shows the reusable correction burden decreased.
**Then**
Advance requirement-coverage maturity using the precise requirements this slice exposed, then begin the accepted-artifact release stage. Larger capabilities remain evidence-triggered.
### Outcome B — second genuine-business proof

## [WAITING — OWNER INPUT] Stage: MGB Decor genuine-business case 2

**Outcome**
Run a materially different real business through the current factory to test whether NBM's visual convergence is factory-wide or case/source-specific.
**Why it matters**
NBM was a thin-imagery professional-services/provenance stress case. MGB is not merely “business #2”; it is the preferred falsification experiment for the hypothesis that one shared component vocabulary limits distinctiveness across businesses.
**Owner input required**

- approved factual source bundle;
- explicit asset-level publication/use rights for every intended logo/photo/customer/third-party asset.
Public website/social URLs are evidence locations, not republication permission. Accessible images do not become approved assets.
**Read before working**

1. `docs/GENUINE_BUSINESS_ACCEPTANCE.md`.
2. `docs/VISUAL_EXCELLENCE.md`.
3. GitHub issue #60.
**Do when unblocked**

1. Freeze approved facts, sources, assets and rights.
2. Run the current factory first—no pre-emptive Presentation Registry redesign.
3. Capture independent product/visual evidence and compare the failure mechanism with NBM.
4. Record score, criterion floor, distinctiveness, responsive quality, publishability, interventions,
   elapsed effort, cost and whether primitive-vocabulary convergence recurs.
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
### Brownfield adoption

`repo + optional URL -> frozen baseline -> understanding -> design-system assimilation -> diagnosis
-> Improvement Contract -> bounded ChangeSet -> evidence -> independent review -> before/after -> PR
-> release`
Read before mutate. Preserve `demonstrated`, `inferred`, `unproven` and `not-applicable`: a dependency, folder or file does not prove runtime behaviour. Predictor becomes a hard brownfield benchmark only after exact-revision behavioural and rendered baselines can protect known-good behaviour.
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
## EXPLICITLY NOT NOW

- another NBM visual/CSS loop or pre-evidence Presentation Registry redesign;
- a full automatic database migration/fleet system;
- email, billing, generic webhooks, queues/jobs, realtime or another backend without a real consumer;
- CMS/content collections, localisation, Figma import or hybrid SSR without a real project;
- another orchestration framework, more roles/providers merely because they exist, or broad runtime
  promotion before product proof;
- FactoryService, SQLite/event-ledger, project-type or whole-Console rewrites based on size/taste;
- a full typed-error migration, tiny-corpus intelligence dashboard or whole Predictor implementation.
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
