# Engineering Quality Programme

Status: **planning authority for deterministic engineering gates**. Nothing here is installed by
being written down, and no item becomes a blocking gate before it has been baselined against real
output.

`AGENTS.md` remains the root engineering authority. `docs/ROADMAP.md` owns stage sequencing,
`docs/BEST_IN_CLASS_CAPABILITIES.md` owns the capability register, `docs/VISUAL_EXCELLENCE.md` owns
the premium-visual programme and `docs/AGENT_SPECIALIST_ARCHITECTURE.md` owns the specialist-role
model. This document owns one question: **which deterministic checks the factory and its generated
projects should run, in what order, and what each of them proves.**

Two rules govern everything below.

1. **Deterministic before generative.** A check that a linter, a type system, a graph or a browser
   can perform must not be paid for with model tokens.
2. **A gate earns its place by catching something.** Adopt a tool when it removes repeated work or
   closes a correctness/security gap. Noisy heuristic output stays advisory until it is baselined.

## Tool responsibility map

Every tool answers exactly one question. An agent picks a tool by the question it has, never by the
name it recognises. Workflows that say "use all available tools" are forbidden: they are how context
budgets and credit disappear.

| Question | Tool | Lane |
| --- | --- | --- |
| What small context should this task load? | `npm run agent:route -- "TASK"` | bounded orientation |
| Which repository authority should I open next? | `AGENTS.md` → the routed authority | authority |
| Does the user journey actually work? | Playwright | functional acceptance |
| Why is the browser behaving like this? | Chrome DevTools / runtime diagnosis | development diagnosis |
| Did approved pixels move without approval? | curated visual contracts | blocking visual CI |
| Is the page fast enough? | Lighthouse-style budgets | performance CI |
| Are there serious/critical accessibility failures? | `@axe-core/playwright` | accessibility CI |
| Which exact symbol calls this? | symbol/code intelligence | semantic navigation |
| Which subsystems does this change touch? | graph-assisted navigation | architecture orientation |
| Is the dependency direction legal? | `npm run architecture` | blocking architecture CI |
| Is deterministic behaviour correct? | `node --test` unit/contract tests | CI |
| Do invariants survive a broad input space? | property tests | domain verification |
| Would a plausible mutation escape the tests? | mutation testing | test-strength verification |
| Is anything unused or orphaned? | dead-code/unused-dependency analysis | hygiene |
| Is the supply chain and workflow estate sound? | dependency review, secret scanning, SBOM, static analysis | security CI |
| Is tenant isolation real? | executed Supabase/pgTAP RLS acceptance | database security CI |
| Does this change need conditional review? | `RiskClassification` (`packages/control-plane/src/risk.js`) | deterministic review routing |
| Is the generated product worth launching? | `npm run audit:launch` | generated-product quality |
| Is durable state projection caught up and rebuildable? | ledger reconciliation/rebuild (Stage Q11 ✅) | durability |
| Is a production data change safe to run? | `DataChangeSafety` (`packages/control-plane/src/data-change.js`) | deployment/database safety |

Playwright and DevTools are deliberately different tools: Playwright proves **what a user can do**,
DevTools explains **why the browser behaves as it does**. A trace is not a passing journey, and a
green journey is not evidence that the page is fast or that the design did not regress. Keep those
acceptance dimensions separate.

## Programme stages

Sequencing follows `docs/ROADMAP.md` rather than tool enthusiasm, and nothing here displaces the active
product stage that `config/factory-status.json` records. A stage below is a specification, not a
statement about what is installed: check the status file before treating one as outstanding.

### Stage Q1 — architecture made executable ✅ Delivered

`AGENTS.md` stated the dependency direction in prose. Prose does not fail CI. It now does:
`npm run architecture`, inside `npm run check`, so every pull request runs it.

- `config/architecture-boundaries.json` — zones and the seven boundary rules, each with a reason;
- `tooling/architecture-boundaries.mjs` — the gate;
- `tooling/architecture-boundaries.test.mjs` — coverage, including a planted-violation case, because
  a gate that cannot fail is not a gate.

Enforced today: generated output stays portable (no App Builder package, app, or tooling reaches
`templates/`, `recipes/` or `adapters/`); the Console goes through the service instead of owning
generation, ingestion, composition or orchestration; MCP uses the service tool contract rather than
service internals; the control plane stays provider-neutral; contracts stay dependency-light;
composition stays a pure function; content intelligence does not depend on the interface that
displays it. The zone graph is checked for cycles.

**`dependency-cruiser` was evaluated and not adopted.** It expresses these rules well, but the gate
needed to read the workspace registries and resolve zone membership directly, the rules fit in a
dependency-free script, and `AGENTS.md` principle 6 asks that a new package solve a problem the
platform does not. A boundary checker that adds a dependency to argue for restraint is the wrong
shape. Revisit if the rules outgrow path and specifier matching.

Two things the first run found, both real, neither papered over:

1. **The Console imports `@app-builder/factory-core`** — mostly types, plus `buildProjectManifest`.
   That is deterministic *intake* logic in a dependency-free library, not generation or
   orchestration, so the rule records it as a permitted, named coupling with its limit stated.
   Silently dropping the rule or forcing an out-of-scope Console refactor would both have been worse.
2. **A `service -> tooling -> service` cycle** — an artefact of one zone conflating two things.
   `tooling/lib` is the deterministic factory implementation the service delegates to and imports
   nothing from `apps/`; the rest of `tooling` is CLIs, doctors and tests that legitimately read what
   they verify. Splitting the zone models the real architecture rather than excusing a cycle.

The parser is deliberately conservative: example import syntax inside a fixture counts as an edge, so
it fails closed rather than open. A fixture needing a forbidden specifier belongs in `tooling-cli`,
which is unconstrained by design.

### Stage Q2 — curated visual contracts (alongside Phase 4C/4D)

Do **not** screenshot everything. An unreviewed screenshot corpus produces noise, not confidence,
and the baseline becomes a rubber stamp.

Approve a small, intentionally stable surface set:

- critical Builder Console surfaces;
- Presentation Registry examples;
- approved `DesignSystemSpec` fixtures;
- selected art-direction reference pages;
- canonical generated-app fixtures.

Baseline changes are explicit and reviewed. Visual contracts answer "did approved pixels move?" and
nothing else; journey correctness stays with Playwright and design quality stays with the design
critic.

### Stage Q3 — component/state preview surface (alongside Phase 4C)

Once the Component Manifest Protocol, Presentation Registry and `StateMatrixSpec` exist, a
deterministic component preview surface becomes useful for variants, responsive states,
accessibility states, state-matrix fixtures, visual contracts and agent component discovery.

Evaluate Storybook against a lighter repo-native preview route. Adopt it only if it cleanly serves
the Component Manifest/Presentation Registry architecture — not because it is the conventional
answer. A preview surface that duplicates the registry becomes a second source of truth.

#### Storybook evaluation — 2026-08-26, not adopted

Evaluated once the Presentation Registry existed, as this stage required. **Not adopted**, and
this is a recorded decision rather than a deferral.

What Storybook would give this factory:

- a component/state matrix surface — but the registry already enumerates the twelve components
  and their variants, and the service-managed preview already renders a real generated app with
  real composed content;
- isolated interaction states — but rendered evidence already drives a real browser over the real
  build and captures the interaction states the state matrix names, including the failure states,
  which a story would have to reimplement as a fixture;
- visual regression fixtures — genuinely useful, and the part worth revisiting. It is not worth a
  Storybook installation on its own: the same fixtures can come from the registry plus the
  evidence capture that already exists.

What it would cost:

- a build, config and dependency surface in the factory that has to stay in step with the
  template's own Vite build;
- stories per component per variant, which is a **second declaration of what a component renders**
  beside the template and the registry — the exact duplication this stage warns against;
- a preview surface showing components against fixture content, next to a preview surface showing
  the real build against real source-backed content. Two answers to "what does this look like",
  and the fixture one is the less true.

Revisit only if curated visual regression contracts (Phase 4D) prove they need per-component
isolation that rendered evidence over a real build cannot provide.

### Stage Q4 — performance and payload budgets (alongside Phase 4.2/Phase 6)

Measure before optimising; no speculative performance work.

Budget dimensions: Core Web Vitals, JS payload, CSS payload, image payload, font payload,
per-route payload, critical rendering path and request count. Budgets are **per project class**: a
static marketing site and an authenticated data-heavy internal tool do not share a number.

Add bundle analysis for the Console, generated template families, registry component dependencies
and the design-system runtime, so a specialist or design addition cannot silently inflate every
generated app.

### Stage Q5 — design-token enforcement (alongside Phase 4C)

Once `DesignSystemSpec` compiles to tokens, deterministic rules should reject generated code that
bypasses the approved system: arbitrary colours, off-scale spacing/radii, unapproved font sizes,
ad-hoc z-index, unapproved motion durations/easing and raw hex values where a token exists.

Use the tooling appropriate to the generated stack. Stylelint is one candidate; a repo-native
DesignSystemLint over the compiled token set may be a better fit because it can read the spec
directly. Decide by which mechanism can see the token contract, not by convention.

### Stage Q6 — dead code and orphan detection (Phase 4.5)

Unused exports, unused dependencies, stale generated modules, abandoned recipes/components and dead
registry entries all cost context and credit.

Evaluate `Knip` for the factory itself and, where cheap, for generated-project verification. Keep it
**non-blocking until baselined** — a noisy first run that blocks CI teaches the team to ignore it.

### Stage Q7 — property-based testing (started; continue selectively)

**Adopted.** `fast-check` is a dev dependency and `tooling/change-set-scope.property.test.mjs`
covers ChangeSet path safety and scope matching — the highest-risk case, done first.

Extend it only where the input space is broad and an invariant is precise:

- manifest/schema validation and conversions;
- control-plane state transitions;
- deterministic routing predicates and context ceilings;
- composition and recipe resolution;
- id/path normalization;
- budget enforcement;
- permission matrices.

Do not use property tests where a handful of examples is clearer — ordinary UI components do not
need generated input.

### Stage Q8 — targeted mutation testing (Phase 4.5/Phase 6)

Mutation testing answers "would a plausible mutation escape the tests?". It is expensive and must
stay targeted at logic whose failure is severe:

- ChangeSet scope safety;
- control-plane approval rules and no-self-approval;
- rights/provenance logic;
- environment mutation guards;
- routing predicates;
- deployment safety checks;
- security-sensitive validation.

Run it scheduled, pre-release or on critical packages. Never across the whole monorepo on every PR.

### Stage Q9 — supply-chain and workflow hardening (staged across Phase 4.5/Phase 6)

The factory already pins dependencies and runs Renovate. The remaining exposure grows with external
skills, MCP, generated repositories, secrets, deployments and eventually hosted autonomous agents.

Priority order:

1. GitHub Actions safety — pinned actions, least-privilege tokens, workflow linting;
2. dependency review on pull requests;
3. secret-leakage prevention and scanning;
4. dependency updates (already in place; keep them reviewed);
5. SBOM/inventory generation for the factory and for generated repositories;
6. static security analysis where it beats the existing deterministic doctor checks.

Do not install every tool at once. Each addition must name the exposure it closes.

### Stage Q10 — consumer assertions for behavioural declarations (Phase 4.5)

A registry value that claims to change runtime or product behaviour must name, or be tested against,
a real consumer. The failures this exists for are already on record: `reviewBeforePublish`,
`SectionSpec.variant` and `density` were each declared before anything read them, and read as
implemented until someone checked.

The rule is deliberately narrow. Do **not** build a global test asserting that every JSON-schema
property appears somewhere in source: many contracts are transport or evidence records, and many
specialist skills are legitimately `planned` with `path: null` until Phase 5. A test that cannot tell
those apart produces noise, and noise gets suppressed.

Apply it where a declaration is a behavioural claim:

- presentation and design registries (Phase 4C);
- operation and capability registries (Phase 5);
- policy, routing and permission matrices.

The first executable instance is the agent capability boundary. `config/agent-capabilities.json`
declares which internal Factory routes exist for the Console and are never agent operations, and each
entry carries the literal fragment of `apps/service/src/http.js` that serves it;
`tooling/agent-capability-boundary.test.mjs` checks every one against the source. The same test
requires every declared capability to name a real operation in the service tool contract and a real
handler in the broker, so a capability nobody can perform fails rather than reassures. Follow that
shape — declaration names its consumer, test checks the consumer exists — rather than inventing a
new mechanism per registry.

### Stage Q11 — ledger and projection reconciliation ✅ delivered

The durability model treats the JSONL event ledger as authoritative evidence and SQLite as a read
projection. That is only safe if the projection is recoverable rather than dependent on two writes
always succeeding together. A crash between ledger append and projection insert must not create two
permanent truths.

It did. `recordEvent` appended to the ledger and then inserted into SQLite, and a process that died
between those two statements left an event that happened and a read model that had never heard of it.
Reopening the store noticed nothing at all: two events in the ledger, one in the projection, and every
later read, every cost total and every resume packet quietly short by one. It is reproducible in about
fifteen lines, which is what it took to find.

JSONL remains authoritative, and the stage's list is delivered:

- **a monotonic ledger sequence** — an event's sequence is its one-based position in the file. The
  ledger is append-only JSONL, so position already *is* the monotonic sequence; writing one into each
  line as well would create a second source of the same number, and two sources of one number are two
  numbers as soon as anything goes wrong;
- **an idempotent projection** — `ON CONFLICT(id) DO NOTHING`, so projecting an event the database
  already has is a no-op rather than a unique-constraint failure. Without it the recovery path becomes
  the thing that needs recovering;
- **a stored last-projected sequence** — `projection_state`, advanced only *after* the projection
  insert. A counter advanced optimistically would describe a projection that does not exist, which is
  worse than no counter;
- **startup reconciliation** — in the store's constructor, before anything can read a database that
  disagrees with the ledger. Ledger at 1827 and projection at 1821 replays 1822 to 1827;
- **`npm run ledger:rebuild`**, with `npm run ledger:check` reporting what reconciliation would do
  without doing it, because a store that is already consistent should not be rebuilt to find that out;
- **the acceptance test** — through the `FactoryService`, not the store: a real generation, the
  projection deleted outright, rebuilt, and every event and every derived total identical.

Two things the stage list did not ask for and the implementation needs.

A counter alone describes one shape of divergence. Two cheap checks decide whether replay is safe: the
projection must hold exactly that many rows, and the row at that sequence must be the ledger's event at
that position. A row deleted from the middle, a row the ledger never had, or a counter that outran the
table cannot be fixed by replaying, because `sequence` is assigned on insert and appending a missing
middle event would place it *after* events that came later. That case rebuilds, which is always
available precisely because the events table is derived from the ledger and nothing else.

And a rebuild resets the sequence counter, not only the rows. `AUTOINCREMENT` never reuses a value, so
a rebuilt projection would otherwise return the same events under different sequence numbers — and
`listEvents` takes `afterSequence`, so a Console polling from 3 would be handed everything again or
nothing at all, depending on which side of the shift it landed. Resetting makes the projection a
deterministic function of the ledger rather than of how many times it has been rebuilt.

What this deliberately does not claim: projects, tasks and checkpoints are written directly and are not
projections of the ledger, so the rebuild recovers exactly what the ledger is authoritative for. An
event naming a project the store does not have is reported as orphaned rather than inserted — a
foreign key that cannot resolve is a fact worth surfacing, not something reconciliation should invent a
project to satisfy.

If a later architecture chooses SQLite as the authoritative store instead, that is an explicit recorded
decision and migration, never accidental drift.

### Stage Q11b — a CSP a generated site can actually be served under ✅ delivered

The deployment adapters shipped four security headers and no Content-Security-Policy, which is the one
that stops an injected script running.

The reason it was missing is the reason it needed generating rather than declaring. A generated site's
own scripts are inline — a navigation disclosure, an analytics dispatch, an error reporter — so a
policy written into `netlify.toml` could only have allowed them with `'unsafe-inline'`, and a
`script-src` with `'unsafe-inline'` allows every injected script too. That is not a weaker CSP; it is
most of the CSP gone.

`tooling/generate-csp.mjs` runs as the adapter's `postbuild`, hashes every inline script and style the
publish directory actually carries, and writes `_headers`. `netlify.toml` keeps the headers that are
the same for every build; this writes the one that is not, and a test refuses a CSP in both places.

The generated output made a strict policy achievable rather than aspirational: no inline style
attributes, no external hosts, a same-origin form action. So the baseline is
`default-src 'self'` with `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and hashes
for exactly the scripts the page contains.

Verified in a browser against a server that actually sends the header, both ways round — the site's own
inline scripts run and the stylesheet applies with no violations, and an injected inline script does
not execute while a third-party `src` is refused. A policy proven only not to break the site is a
policy proven only to be inert.

A project that genuinely needs a third-party origin extends `csp.json` beside the script. It may name
an origin; it may not add `'unsafe-inline'` to `script-src`, and a directive the policy does not define
is a typo rather than a new rule. Both refusals are tested.

### Stage Q11c — three-way managed-file reconciliation ✅ delivered

An upgrade whose managed files someone had edited went to `review-required` and stopped. That is
fail-closed and correct as far as it goes, and it also meant the first person to fix a typo in a
generated file could never take an upgrade again — the recipe system's whole point, quietly lost to one
edit.

A three-way merge is the ordinary answer and it needs three inputs, one of which the factory did not
have. `ours` is what the project holds now; `theirs` is the new recipe version; `base` is the bytes the
recipe originally installed — and installation recorded only a hash, while the factory's own copy of an
old recipe version is gone once that recipe moves on. So `recordRecipeInstallations` now keeps the
installed bytes at `.app-builder/managed-baselines/<recipe>/<path>` beside the hash. A hash answers
"did this change?"; a merge has to know *from what*.

`git merge-file` does the merging rather than a hand-written diff3: it is what every developer's own
tooling already agrees with, its conflict markers are the ones they can read, and a merge algorithm is
not a thing to write twice. `--diff3` markers are used deliberately, so a reviewer can see what was
installed and therefore which side moved.

The reconciliation is a **proposal, never an application**. Planning an upgrade must not edit the
project it is planning for, so `-p` writes to stdout, the merged text is returned for review and
nothing is written. A conflict is not a failure of the mechanism — it is the answer, with the file
named and the hunks counted. A file the target dropped, one the project deleted, and a project
generated before baselines were kept are each reported as decisions rather than merged past.

### Stage Q12 — production data-change safety (before autonomous live data mutation)

Executed RLS acceptance proves tenant isolation. It does not prove that a migration is safe to run
against real data someone depends on. Those are separate questions, and the second one now has a
contract: `packages/control-plane/src/data-change.js`, covered by `tooling/data-change-safety.test.mjs`.

**Delivered — the decision.** `planDataChange` reads a proposed change into a classified plan and
`evaluateDataChangeSafety` returns one decision with named refusals. It is a pure function of
declared facts: no connection, no provider, no model, and no branch that returns `allowed` without
having passed every check. The ten questions a serious mutation has to answer before it runs are
each a refusal reason rather than a paragraph in a runbook, because a runbook cannot fail closed.

- **What changes** — a SQL reader, not a parser. It knows the shapes that lose data (`drop column`,
  `truncate`, an unbounded `delete`, a dropped policy, disabled RLS) and separates them from the
  `alter table` statements they resemble. A statement it does not recognise is `unclassified`, which
  is a refusal. A classifier that assumes what it cannot read is harmless is how a `drop table` ships
  as an additive change. Statement splitting handles string literals, nested block comments and
  dollar-quoted bodies, so a semicolon inside a trigger function is not a statement boundary.
- **Which environment** — the plan names its environment *and* its database, the executor supplies
  what is actually in front of it, and an operator registry says which database belongs to which
  environment. All three must agree: a preview plan whose database is registered to production is
  refused even though the plan and the executor agree with each other, because they can agree and
  both be wrong. That is the preview-hits-production class, closed by data rather than by care.
- **Is it destructive** — the plan is classified by its worst statement, never its average.
- **What data is affected** — `rowsAffected: null` and `rowsAffected: 0` are different answers. The
  first is "nobody looked", and for anything touching existing rows it is a refusal.
- **What backup exists, and how restore is proven** — these are deliberately two requirements. A
  snapshot id with a digest answers the first; only a performed, verified restore rehearsal bound to
  that snapshot answers the second. `backup: true` is a claim, not evidence. Snapshots also expire:
  restoring a snapshot older than the recovery window is a second data-loss event.
- **What runs first, what proves success, what happens when it does not** — named checks, not
  intentions, and an explicit answer for a failed verification.
- **What approval is required** — every production change, including an additive one; "it only adds
  a column" is an argument about blast radius, not about who decided to change production. An
  approval binds to a digest of the reviewed statements and target, so recapturing a snapshot does
  not invalidate it but editing, reordering, adding or retargeting a statement does. A proposer who
  is its own only approver is refused (AGENTS.md principle 17).

Migration order is part of safety rather than tidiness: a plan written against a schema the target
does not have was classified for a different database. Missing, unexpected and already-applied
migrations are each refused.

Requirements tighten with class and environment instead of being one fixed list, so an additive
change in development carries almost nothing and a destructive change in production carries
everything. `narrowing` and `contract` steps carry the recovery burden too — the first rejects rows
that already exist, the second removes the compatibility a rollback would need.

Prefer `expand -> deploy compatible code -> migrate/backfill -> verify -> contract later` over one
destructive migration.

**Outstanding — the evidence.** The contract refuses a change whose restore was never rehearsed. It
cannot itself rehearse one, and a migration that succeeded on a disposable test database is still not
backup, restore and rollback evidence for a real environment. Stage Q12 is not complete until an
executable acceptance produces a real restore rehearsal against an isolated database — seed, snapshot,
mutate destructively, restore, and prove the schema, the rows and the tenant-isolation invariants come
back — behind a provider-neutral seam, so the contract is fed by a performed restore rather than by a
hand-written fixture. Old-code/new-schema compatibility and partial-deployment behaviour remain
declared fields awaiting a deployment coupling to enforce them against.

## Explicit non-adoptions

- No blocking gate before its output has been baselined against real generated projects.
- No screenshot-everything visual suite.
- No repository-wide mutation testing on every pull request.
- No second design-system linter once `DesignSystemSpec` can be read directly.
- No security tool adopted because it is well known rather than because it outperforms an existing
  deterministic check.
- No developer tool becomes a runtime dependency of a generated application. Generated repositories
  remain ordinary repositories.
- No production data mutation approved because schema and RLS tests passed.
