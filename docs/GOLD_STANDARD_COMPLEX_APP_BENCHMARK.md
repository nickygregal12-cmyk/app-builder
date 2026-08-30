# Gold-Standard Complex Application Benchmark

Status: **future benchmark specification**. This document records the complex-application quality bar App Builder must eventually prove. It is not evidence that the current consumer-app recipe already supports this scope.

Tracking issue: #66 — `Use Euro-2028-Predictor as the gold-standard complex app benchmark`.

Reference product: `nickygregal12-cmyk/Euro-2028-Predictor`.

## Purpose

Use the Football Prediction Hub / Euro-2028-Predictor as the long-horizon gold-standard benchmark for App Builder's application capability.

The objective is **not** to teach the factory to clone one football product or create a `football-predictor` recipe. The objective is to prove that a simple, bounded product request can become a product of comparable or better complexity, architecture, visual quality and release safety with dramatically fewer accidental mistakes and much less manual iteration.

Marketing-site success must never be allowed to imply that this benchmark is passed.

## Why this is a useful benchmark

The reference product combines many of the hard problems a serious application builder must solve together:

- React/TypeScript application UI;
- Supabase/Postgres/Auth/RLS/RPC/Edge Functions/cron;
- Netlify deployment;
- multiple competitions and independently joined game types;
- Match Predictor scoring and deadlines;
- Last Man Standing lifecycle/progression;
- Predictor Championship progression and tables;
- private leagues, invitations and membership permissions;
- Match Centre and player/league insight;
- live/external football data with provisional-versus-official truth boundaries;
- admin/operator surfaces;
- feature-flagged journey replacement and rollback;
- development/preview/production separation;
- substantial domain, database, browser, accessibility and release verification;
- a premium mobile-first visual target rather than a generic CRUD dashboard.

It also contains valuable historical failure evidence that the factory should learn to prevent systematically rather than relearn project by project.

## Benchmark rule

Do not hard-code the reference application as a template.

Extract reusable capability families and contracts from the difficulty it exposes. Football-specific scoring, competition rules and progression remain project/domain logic generated for that build and independently verified.

Reusable families should ultimately include:

1. rich domain entities, relationships and invariant ownership;
2. lifecycle/state-machine contracts with guards and terminal states;
3. server-authoritative deadlines, locks, reveal and settlement rules;
4. groups, memberships, invitations, permissions and leaderboards;
5. scheduled/background jobs with idempotency, retries and observability;
6. external integrations/ingestion with provenance, freshness and correction policy;
7. realtime/live-update capability with stale/fallback behaviour;
8. database migrations plus executed RLS/RPC acceptance and non-vacuity tests;
9. journey-safe feature rollout/replacement and rollback seams;
10. admin/operational observability that distinguishes empty states from broken pipelines;
11. premium application presentation with materially good desktop/mobile composition;
12. explicit development/preview/production release identity and approval.

## Two benchmark modes

### A. Greenfield reconstruction

Build a new prediction platform from a bounded product pack derived from the reference product's approved requirements, product decisions, visual references and representative data — **without importing the existing implementation source code**.

Purpose: prove App Builder can architect and build a Predictor-class product from requirements.

Pixel-identical reproduction is not required. A cleaner architecture, clearer product or stronger visual result is preferred when supported by the requirements.

### B. Existing-repository adoption and improvement

Once the brownfield entry mode in `docs/PLATFORM_PARITY_PROGRAMME.md` §5 is implemented, ingest the real Predictor repository **and** inspect a representative deployed URL. Map its authorities, design system, domain boundaries, database contracts, tests, runtime/deployment shape and critical user journeys without regenerating it.

Purpose: prove App Builder can safely understand and measurably improve mature complex software rather than only generating clean new projects.

Before mutation, freeze a baseline tied to an exact source revision and, where determinable, deployed revision. The baseline should include the evidence relevant to the chosen improvement programme, such as:

- critical journeys/states and current failures;
- architecture/source-of-truth findings;
- database/security/release findings;
- representative desktop/mobile captures and independent visual/product scores;
- accessibility/performance/browser evidence;
- current tests and non-vacuity gaps;
- known-good behaviours that must not regress;
- intervention/rework burden for the same class of change.

Use the live URL and repository as complementary evidence: the repository explains implementation; the deployed product proves what users experience. Do not infer architecture from screenshots alone or user success from source code alone.

A broad instruction such as **“substantially improve this product”** should therefore produce diagnosis before implementation. Findings should be classified into keep/refactor/redesign/replace/remove/add, then converted into bounded improvement ChangeSets owned by the relevant specialist roles. The benchmark fails if App Builder simply rewrites the Predictor into its preferred stack or visual template.

Each accepted improvement slice must preserve its baseline and record before/after evidence. A successful PR/merge is insufficient: protected journeys must not regress, the intended architectural/product/visual outcome must improve measurably, and independent reviewers must accept the result.

This mode should deliberately test whether App Builder can discover and solve the kinds of problems that historically took repeated manual prompting and late audits to uncover, while creating fewer new regressions and materially less rework.

## Representative greenfield journeys

The first bounded slice should establish the reusable domain spine before expanding breadth:

`entity/fixture -> user decision/prediction -> server-authoritative deadline/lock -> official result -> settlement -> score -> leaderboard`

This is one vertical slice, not the whole reference product. It should pull only the generic lifecycle,
time-bound mutation, settlement and ranking contracts it proves it needs. Football naming, scoring and
competition rules remain benchmark-domain logic; they must not enter factory registries or recipes.
Email, billing, realtime, jobs and webhooks are not prerequisites unless the slice records a concrete
consumer and acceptance boundary for one.

The first serious benchmark iteration should prove enough vertical slices to establish the architecture:

- signup/sign-in/profile;
- competition discovery/following;
- joining at least two independent game types;
- entering predictions before a deadline;
- server-enforced lock and post-lock reveal;
- official-result settlement/scoring;
- standings/leaderboard;
- private league create/invite/join/comparison;
- match detail/context;
- admin/operations path;
- scheduled external-data ingestion;
- representative realtime/live update;
- development -> preview -> production release.

Full parity with every reference-product feature is not required initially. Increase scope only as reusable factory capabilities become proven.

## The frozen slice

The first bounded slice is frozen in `config/application-journey-benchmarks.json` and validated by
`tooling/application-journey-benchmark.test.mjs`. It holds the journey above still — states and
transitions with their authority, the server-authoritative lock, the provisional/official boundary,
the settlement identity key, the scoring rule's single source of truth, and a leaderboard ordering
that cannot end in a tie — together with the scenarios that make each of those non-vacuous.

The rules exist because a frozen benchmark that can quietly get easier is not frozen. Each one was
planted and observed to fail: a state added with no way out of it, the post-lock refusals deleted,
an isolation case whose competing identity is the owner themselves, a provisional result allowed to
settle, a settlement repeat pointed at a settlement that never happened, the unique key dropped from
the ordering chain, and a benchmark-domain term written into a factory recipe.

The last of those is the benchmark rule above, made mechanical: the benchmark declares its own
football vocabulary, and that vocabulary is checked against `config/`, `recipes/`, `schemas/`,
`packages/`, `templates/` and `adapters/`. Extracting reusable capability is a judgement; not
hard-coding the reference application is now a check.

## First measurement against the frozen slice

The slice has now been run twice against an unchanged contract. `config/application-journey-benchmarks.json`
was not edited between the two runs, which is the only thing that makes the second one worth reading.

**First pass — the browser half (PR #212).** Two meaningful interventions, both reusable factory
corrections in `recipes/scheduled-decisions`, neither a benchmark-domain hack:

1. *Every first decision was refused.* The recipe grants `update (choice)` on `scheduled_decisions`
   and nothing else, so an amendment can change the decision and can never move it to another entity
   or another person. The client used PostgREST's `.upsert()`, which compiles to
   `on conflict do update set` over every column in the payload — so it asked for update on
   `entity_id` and `identity_id` too, and was refused for the whole table before any row conflicted.
   The grant was right and the upsert was the thing that could not live with it; the client now
   inserts and treats the unique violation as an amendment. Two assertions hold the grant still,
   because PostgreSQL's own hint on that error tells the next person to widen it.
2. *The interface discarded the reason.* A refusal arrives carrying `message` on a plain object
   rather than as an `Error`, so an `instanceof Error` test fell through to a generic sentence for
   precisely the failures worth reading. This is what made the first defect expensive to find.

Both were invisible to SQL. The pgTAP suite passed every assertion on the run that failed in the
browser, which is the argument for the browser half existing at all: a policy the database enforces
correctly and no client can reach is a boundary that works and a product that does not.

**Rerun — identical contract, regenerated from scratch.** Zero interventions. The generated project
installs from its own lockfile, passes its own `tsc --noEmit`, builds to an identical bundle, and the
same 60 pgTAP assertions and 10 browser journeys pass without a correction.

What this does and does not say: two runs is a first data point about one slice, not a trend, and the
corrections were cheap because the boundary was already right. The measurement worth repeating is
whether the *next* unfamiliar journey costs fewer reusable corrections than this one did.

## Required build sequence

A Predictor-class application must not go directly from questionnaire to bulk implementation.

Expected greenfield path:

`intake -> Build Contract -> domain/invariant specification -> lifecycle/state matrix -> data model + RLS plan -> journeys -> integration/freshness policy -> DesignSystemSpec + ArtDirectionPlan -> implementation plan -> deterministic recipes -> bounded custom AI work -> executed database/domain/browser tests -> RenderedEvidence -> independent review -> preview -> explicit release approval`

Expected brownfield path:

`repo + URL -> baseline evidence -> architecture/product/journey map -> specialist diagnosis -> improvement contract -> isolated branch/worktree + bounded ChangeSets -> deterministic gates -> RenderedEvidence -> independent review -> before/after comparison -> approval -> merge/release`

A rule that is merely declared but has no authoritative consumer/test is a benchmark failure even if the UI appears correct.

## Failure classes App Builder should prevent

Use the reference project's history as regression inspiration, including:

- duplicated definitions of one business rule across SQL and TypeScript;
- identity keys that permit duplicate decisions/actions;
- state identities that prevent fresher data from producing a new valid result;
- tests that pass vacuously because the competing tenant/league/state is absent;
- UI that cannot explain whether an empty state means "nothing to show" or "pipeline broken";
- repository, development and production migration state drifting apart;
- visual redesigns accidentally changing domain/game rules;
- feature-flag cutovers leaving split ownership between old and new journeys;
- provisional provider data becoming confused with official domain truth.

Prefer deterministic contracts, generated tests and quality gates over documenting these as anecdotes.

## Visual benchmark

The benchmark fails if it produces a technically correct but generic AI/CRUD interface.

The output should feel like a premium consumer football product: strong hierarchy, team identity, fixture/game energy, clear deadline/live/settled states, rivalry/social context, meaningful motion, excellent mobile composition and deliberate use of wider desktop space.

The reference product is a quality floor and learning source, not a design to copy. App Builder should be capable of generating a better visual/product direction where evidence supports it.

For brownfield improvement, visual work must be judged against the frozen current product as well as the absolute quality bar. A redesign that is prettier but makes a journey less understandable, changes domain behaviour or introduces mobile regressions fails.

## Success criteria

Long-run greenfield success means a competent operator can provide a bounded product brief/source pack, answer a manageable set of product questions and receive a credible Predictor-class application without reproducing months of accidental trial-and-error.

Long-run brownfield success means the same operator can connect the existing Predictor repo and URL, give a high-level improvement objective, and receive a defensible programme of architectural/product/visual improvements that preserves known-good behaviour, requires materially less manual prompting/rework than the historical development process, and is proven by before/after evidence rather than agent confidence.

Judge the benchmark on:

- domain correctness and one source of truth for rules;
- executed security/RLS isolation;
- time/lock/reveal correctness;
- state and journey completeness;
- non-vacuous acceptance evidence;
- data provenance/freshness correctness;
- visual and mobile product quality;
- accessibility, performance and security;
- environment/release safety;
- interventions, retries, elapsed time, AI cost and rework;
- portable standalone repository output;
- reusable factory improvements rather than Predictor-specific hacks.

For brownfield mode additionally record:

- baseline vs final protected-journey results;
- baseline vs final relevant visual/mobile/accessibility/performance/security measures;
- architectural/contract findings retired versus introduced;
- regressions found during implementation;
- meaningful manual prompts/edits and rework avoided;
- whether the change remained bounded or expanded into unjustified rewrite churn.

## Relationship to other benchmarks

The real-world website corpus (NBM, MGB Decor and later varied businesses) proves that App Builder can create excellent, launch-ready websites.

This benchmark proves something different: that App Builder can design, architect, implement, verify and release a genuinely complex application — and, in brownfield mode, safely take responsibility for improving an existing one.

Both are required before the factory can reasonably claim a best-in-class general website/application builder standard.
