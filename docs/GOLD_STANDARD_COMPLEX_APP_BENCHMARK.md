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

### B. Existing-repository adoption

Once existing-repository adoption is implemented, ingest the real Predictor repository and map its authorities, design system, domain boundaries, database contracts, tests and deployment without regenerating it.

Purpose: prove App Builder can safely understand and improve mature complex software.

## Representative greenfield journeys

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

## Required build sequence

A Predictor-class application must not go directly from questionnaire to bulk implementation.

Expected path:

`intake -> Build Contract -> domain/invariant specification -> lifecycle/state matrix -> data model + RLS plan -> journeys -> integration/freshness policy -> DesignSystemSpec + ArtDirectionPlan -> implementation plan -> deterministic recipes -> bounded custom AI work -> executed database/domain/browser tests -> RenderedEvidence -> independent review -> preview -> explicit release approval`

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

## Success criteria

Long-run success means a competent operator can provide a bounded product brief/source pack, answer a manageable set of product questions and receive a credible Predictor-class application without reproducing months of accidental trial-and-error.

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

## Relationship to other benchmarks

The real-world website corpus (NBM, MGB Decor and later varied businesses) proves that App Builder can create excellent, launch-ready websites.

This benchmark proves something different: that App Builder can design, architect, implement, verify and release a genuinely complex application.

Both are required before the factory can reasonably claim a best-in-class general website/application builder standard.
