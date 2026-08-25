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

Playwright and DevTools are deliberately different tools: Playwright proves **what a user can do**,
DevTools explains **why the browser behaves as it does**. A trace is not a passing journey, and a
green journey is not evidence that the page is fast or that the design did not regress. Keep those
acceptance dimensions separate.

## Programme stages

Sequencing follows the roadmap rather than tool enthusiasm. Nothing here displaces the outstanding
Phase 3.8E genuine-business product gate or the active Phase 4 source-ingestion and Console work.

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

## Explicit non-adoptions

- No blocking gate before its output has been baselined against real generated projects.
- No screenshot-everything visual suite.
- No repository-wide mutation testing on every pull request.
- No second design-system linter once `DesignSystemSpec` can be read directly.
- No security tool adopted because it is well known rather than because it outperforms an existing
  deterministic check.
- No developer tool becomes a runtime dependency of a generated application. Generated repositories
  remain ordinary repositories.
