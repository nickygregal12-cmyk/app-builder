# Roadmap

This is the **sequencing authority**. `config/factory-status.json` is the machine-readable current
state; `docs/MASTER_PLAN.md` defines the destination. A change to what comes next must update the
status file in the same pull request.

## Current position

**Phase 4.4 — product proof through high-value application capability. Active.**

The factory generates portable websites and stateful B2B application output. Auth, profiles,
organisations, role-aware records, organisation-owned uploads, in-app notifications and admin have
real generated consumers. Database security exercises generated schema on real PostgreSQL/Supabase
infrastructure. Capability integrity distinguishes requested, registered, resolvable, generated,
consumed and proved states. These are foundations, not proof that every listed capability or project
class is first-class.

The largest uncertainty is repeatability: **can the factory produce genuinely excellent finished
products across materially different real cases?** Product and release evidence therefore outrank
generic platform breadth. Phase 4.4 is not a walk down a feature list.

Closed facts that must not be reopened as gaps:

- rendered evidence is bound to the served build; accepted-build promotion remains open;
- read-only brownfield profiling is accepted, but diagnosis and mutation are unattempted;
- capability resolution and a real generated admin consumer have landed.

Still unpaid or blocked:

- Phase 4D visual quality failed at best mean **6.55** and floor **4.8**, against 8.5/6.5. It is
  deferred, not passed or waived. `docs/PHASE_4D_VISUAL_DEBT.md` owns its evidence and revival rules.
- Static-renderer visual parity remains unpaid for the related reason recorded there.
- MGB Decor is blocked only by owner-supplied facts and explicit asset-level usage approval. Public
  availability is not republication permission. This blocks that case, not engineering.
- Recipe-managed files have safe upgrade planning; persistent database state does not have equivalent
  evolution semantics.
- No project class has earned a maturity tier from repeatable real-project evidence.

## Immediate outcomes

These are parallel proof tracks. A change enters one only when it closes the named gap or a real case
pulls it.

### Outcome A — quality truth closure

1. Make database-bearing recipe version changes fail closed when persistent evolution is unmodelled.
   The result is `review-required / database-evolution-unmodelled`, never false `ready`.
2. Complete derived requirement coverage through existing Build Contract, Manifest, capability,
   consumer and evidence identities. Keep `unconsumed` distinct from `implemented-unproven`; do not
   create a second requirements authority.
3. Preserve the CI gate truth loop: missing, malformed, wrong-build and unresolved evidence fails
   closed; measured product failure remains failure rather than becoming fake-green CI. The command
   exists, but CI does not call it yet.
4. Restore root reproducibility: `package-lock.json` is absent and gitignored, and CI uses
   `npm install`; a fresh checkout therefore cannot use root `npm ci`.

**Exit evidence:** planted tests kill false upgrade readiness and both requirement-coverage failure
classes; ordinary CI proves the registered producer/resolver loop; a tracked lockfile makes fresh
root `npm ci` succeed. Authorities:
`docs/ENGINEERING_QUALITY_PROGRAMME.md` and `docs/PLATFORM_PARITY_PROGRAMME.md`.

### Outcome B — second genuine-business proof

Run MGB Decor through the current factory when approved inputs exist. Freeze owner-supplied facts and
asset-level rights first; do not crawl public/social URLs or infer rights. Its purpose is to learn
whether NBM's fixed-component-vocabulary ceiling is factory-wide or partly case-specific. Fix only
reusable defects exposed by frozen evidence, then rerun the same inputs. Do not regenerate or polish
NBM merely to chase 8.5, and do not redesign the Presentation Registry before evidence earns it.

**Blocked by:** owner input only. **Exit evidence:** a second varied case through
`docs/GENUINE_BUSINESS_ACCEPTANCE.md`, including rights provenance, meaningful-edit count, launch and
visual evidence, independent review and the cross-case anti-template diagnostic.

### Outcome C — bounded serious-application benchmark

Use the Predictor-class benchmark as pressure, not as a request to clone Predictor or complete every
Phase 4.4 capability. The first greenfield slice is:

`entity/fixture -> user decision/prediction -> server-authoritative deadline/lock -> official result
-> settlement -> score -> leaderboard`

Factory seams stay domain-neutral; football-specific rules stay in benchmark domain code. Pull only
the lifecycle, time, settlement, leaderboard, scenario-data and evidence machinery the slice needs.
Email, billing, realtime, jobs and webhooks enter only with a concrete consumer and acceptance boundary.

**Exit evidence:** non-vacuous database/domain/browser acceptance across multiple identities and
states, rendered evidence and independent review, in an ordinary portable repository. Authority:
`docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.

### Outcome D — accepted build to release

Prove the smallest professional release chain on the simplest real product that benefits:

`exact accepted revision/artifact -> preview -> evidence/review -> explicit approval -> production
promotion -> smoke/health verification -> release record -> rollback target`

Production is never “whatever is in the current editor or worktree”. Static sites do not need database
branching. Stateful evidence may later earn revision-bound backend identity, migration state, scenario
data, environment-scoped secrets and integration isolation.

**Exit evidence:** one real generated product promotes an identified accepted artifact, records the
result and verifies or rolls it back without ambiguous environment identity. Authorities:
`docs/PLATFORM_PARITY_PROGRAMME.md` and `docs/PRODUCTION_COMPLETENESS.md`.

## Explicitly not now

- more NBM CSS iteration or Presentation Registry redesign before revival evidence;
- generic completion of email, billing, realtime, jobs, webhooks or the Phase 4.4 list;
- a full database fleet-migration system before a deployed stateful product needs it;
- CMS, localisation, Figma, hybrid SSR or static-search extras without a real consumer;
- brownfield mutation before exact-revision behavioural and rendered baseline evidence;
- another orchestration framework, more roles/providers or provider activation without measured need;
- FactoryService, Console, SQLite/event-ledger or project-class rewrites based on size or taste;
- a visual canvas, Factory Intelligence dashboard or new planning/findings authority.

Security, data-loss and durability blockers may interrupt the sequence. Architecture aesthetics and
capability wishlists may not.

## Later order

1. **Phase 4E/4F:** environment identity, Git/staging, review and release UX, pulled by Outcome D.
2. **Phase 5/5.5:** bounded specialist execution, then model/skill evaluation. Operator agents remain
   separate from factory model/API workers; provider continuity is parallel infrastructure, not
   product sequencing authority.
3. **Phase 6:** production-quality cross-browser, accessibility, performance, security and journey
   verification.
4. **Phase 7:** deployment, operations, upgrade propagation and post-launch work earned by deployed
   products.
5. **Phase 8:** evidence-driven factory improvement once the corpus supports promotion decisions.

Later expansion outside v1 lives only in `docs/MASTER_PLAN.md` §7.3.

## Completed programme

Implementation history lives in Git, merged pull requests, tests and acceptance records.
`config/factory-status.json` carries completed-stage ids. In summary:

- Phases 0–3 established contracts, generation, ingestion and provenance.
- Phases 3.5–3.8 established control-plane boundaries, the service/Console path, real-business
  acceptance and deterministic engineering gates.
- Phases 4A–4C established composition, renderers, design machinery, evidence and independent review.
- Phase 4D machinery was built and measured; its quality verdict failed and remains unpaid.
- Phase 4.3 delivered SEO/AEO, application metadata correctness and read-only brownfield profiling;
  CMS, localisation and Figma remain genuinely unbuilt and deferred.
- Phase 4.4 delivered the initial multi-tenant application foundations named above. It is active, not
  complete.

## Drift control

Every pull request that materially changes what comes next updates this file and
`config/factory-status.json` together. A completed “Next” statement is removed or advanced in that
change. `tooling/roadmap-status-consistency.test.mjs` enforces easy machine/prose contradictions; review owns
whether the proposed sequence is the right one.
