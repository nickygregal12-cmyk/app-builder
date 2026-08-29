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
   And a gate must be shown failing before its passing means anything — see
   [Could this gate pass without exercising anything?](#could-this-gate-pass-without-exercising-anything).

A third rule applies to every important quality claim: **evidence must prove what it measured.** The
subject, build/artifact, environment and relevant coverage must be attributable; stale, wrong-build,
wrong-route or vacuous evidence is not rescued by being well-formed. Individual historical defects are
closed where their tests say so; this is the invariant that prevents the same class returning through
a different producer.

### Root install reproducibility — bounded open defect

The root `package-lock.json` is absent and gitignored, and CI uses `npm install`. A fresh checkout
therefore cannot use `npm ci` to reproduce the root dependency graph. This is an engineering-quality
defect, not visual or product-proof work: close it with a tracked lockfile and a fresh-checkout `npm ci`
proof, without broadening it into a dependency-management programme.

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
| Which approved requirement has no implementation consumer or proof? | derived requirement coverage | release integrity |
| What should this ChangeSet verify first? | deterministic change-impact map | change planning |
| Is the dependency direction legal? | `npm run architecture` | blocking architecture CI |
| Is deterministic behaviour correct? | `node --test` unit/contract tests | CI |
| Do invariants survive a broad input space? | property tests | domain verification |
| Would a plausible mutation escape the tests? | `npm run mutation:strength` (Stage Q8 ✅) | targeted test-strength CI |
| Is anything unused or orphaned? | `npm run orphans` (Stage Q6 ✅) | blocking hygiene CI |
| Is the workflow estate sound? | `tooling/lib/workflow-security.mjs` (Stage Q9 ✅) | blocking security CI |
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
- a preview surface showing components against fixture content, next to a preview surface showing the
  real build against real source-backed content. Two answers to "what does this look like",
  and the fixture one is the less true.

Revisit only if curated visual regression contracts (Phase 4D) prove they need per-component
isolation that rendered evidence over a real build cannot provide.

### Stage Q4 — payload budgets ✅ delivered (bytes, documents and requests); lab metrics still open

`npm run audit:payload` (`tooling/payload-budget.mjs` over `tooling/lib/payload-budget.mjs`)
generates a canonical project per class, **installs and builds it as an ordinary repository**, and
measures what the build asks a visitor to download. Building is the point: a payload budget measured
from source is a budget on the wrong number. It is not in `npm run check` — six installs and six
builds is minutes, and a gate that slow in the inner loop gets skipped — so it has its own command
and writes `.app-builder/payload/report.json`.

**The measured baseline, recorded before any threshold was written** (2026-08-27, canonical fixtures):

| class | renderer | js | css | route documents | max requests/route |
| --- | --- | --- | --- | --- | --- |
| marketing-site | static | **0** | 22,403 | 4 | 1 |
| content-site | static | **0** | 22,403 | 3 | 1 |
| b2b-saas | application | **426,670** | 23,753 | 1 | 2 |
| consumer-app | application | 426,013 | 23,766 | 1 | 2 |
| internal-tool | application | 424,720 | 23,753 | 1 | 2 |
| ai-app | application | 425,796 | 23,753 | 1 | 2 |

Two numbers are worth saying out loud. The static renderer genuinely ships **zero** client
JavaScript, so `maxBytes.js: 0` is now what enforces the 4.2A claim rather than a sentence in a
document — an island that needs a script is a reviewed change to that line. And the application shell
is **426KB of JavaScript before a project adds anything**: framework, router and generated modules.
That is a finding rather than a comfortable number, recorded so the next thing to inflate it has to
say so; tightening it is Phase 6 work with a real profile behind it, not a guess today.

`config/payload-budgets.json` holds, per class, what was measured, what budget was set and the
**headroom sentence** saying what allowed the gap. Budgets cover only what a class controls — shared
js and css, one document at a time, requests per route, and a floor on route documents. Total bytes
and total HTML scale with how many pages a project has, which is the project's property and not the
class's, so a class budget on them would punish a large site and excuse a small one. The floor is why
a static class emitting one document fails: that is an application shell wearing a static renderer.

`performance-budgets` is now a **registered gate producer**. `npm run gates:evidence` installs and
builds the nbm project and the `performance` gate's only deterministic check is answered from that
build — the first gate evidence in the repository that required a real build to exist.

**CI closure remains open.** The command and resolver are real, but `.github/workflows/ci.yml` does not
invoke `npm run gates:evidence`. Until it does, ordinary CI proves the producer and resolver separately
through tests but does not prove every registered deterministic producer resolves its artifact in the
workflow. Closing this means running the existing command and failing closed on missing, malformed,
wrong-build or unresolved evidence; it does not mean weakening an unpaid product gate.

**Still open:** Core Web Vitals and other lab metrics, image and font budgets with real assets behind
them (both fixtures currently ship neither), and bundle analysis for the Console itself. Each needs a
consumer before it needs a threshold.

`tooling/payload-budget.test.mjs` plants a regression for every dimension — including the one that
catches a static class rendering as a shell — asserts every committed budget sits above the
measurement it names, and asserts the two renderers are budgeted as the different shapes they are.

### Stage Q5 — design-token enforcement ✅ delivered (colour and token resolution)

`npm run lint:design-system` (`tooling/design-system-lint.mjs` over `tooling/lib/design-system-lint.mjs`)
runs inside `npm run check`. With no argument it lints what the factory ships into somebody else's
repository — every stylesheet under `templates/` and `recipes/`; given a directory it lints a real
generated project against that project's own compiled tokens.

**Measured before any rule was written**, which is what decided the scope: **eighteen** colour
literals on the shipped surface and **two** references to custom properties nothing declared.
Fifteen of the eighteen were one file. `recipes/auth/files/src/features/auth/auth.css` carried a
complete parallel palette — a warm off-white page, a near-black primary button, five greys — so
every generated project with sign-in showed its users a first screen in a brand the rest of the site
had never heard of. It now reads `--color-accent` and `--color-accent-contrast` like everything else,
which does change how that screen looks: it looks like the project.

The other three were the template's own. A hero scrim written as two `rgb(10 12 14 / …)` literals is
now `--color-scrim`, declared as channels so a section can set its own opacity. And the mobile
disclosure nav referred to `--shadow-raised` and `--radius-md`, neither of which existed — so on
every build ever generated, the inline fallback *was* the value and the token was decoration. Both
are declared now, at exactly the values those fallbacks held, so nothing moved and a brand can reach
them.

**Two rules, and the second is why this is not Stylelint.**

| rule | what it stops |
| --- | --- |
| `raw-colour` | a colour written into a rule rather than into a token — the same value whatever brand the build resolved |
| `undeclared-token` | a `var(--x)` no stylesheet declares, which renders its fallback forever while looking like a token |

`undeclared-token` is a question about *this repository's* token contract. A generic linter would
have to be configured with the answer, which is the same fact stated twice — principle 6.

**Where a colour may be written is the whole rule.** A literal is allowed inside a custom-property
declaration and nowhere else, because that is what a token is: `--color-accent: #315b72` is the brand
written down and `background: #315b72` is a rule deciding for itself. That needs no allowlist of
blessed files, which matters because the file declaring a project's accent (`src/generated/brand.css`)
is generated per project and would otherwise have to be guessed. `rgb(var(--color-scrim) / 24%)` is
allowed for the same reason it has to be: it is the intended way to vary a token, and forbidding it
would push authors back to the literal.

**Deliberately not rules.** Font size and spacing. The scale is seven steps and the template
legitimately sets `.74rem` on an eyebrow; flagging those would be wrong far more often than right,
and a rule that is wrong a third of the time teaches the reader to skim. Nor does this judge *which*
token a declaration should hold — whether a project-local property may exist at all is the
bespoke-presentation lane's rule, and that lane already refuses one the compiled `DesignSystemSpec`
does not emit.

`tooling/design-system-lint.test.mjs` plants a violation and a near-miss for each rule — the
near-miss being the expensive half — and asserts the shipped surface clean alongside a floor on how
much of it was read, because a walk that found nothing would also report nothing.

### Stage Q6 — dead code and orphan detection ✅ delivered (module reachability)

`npm run orphans` (`tooling/orphan-modules.mjs` over `tooling/lib/module-graph.mjs`) runs inside
`npm run check` and is **blocking from the first day** — a deliberate departure from "non-blocking
until baselined", because that rule exists to stop a noisy first run teaching everyone to ignore the
gate, and this first run was empty rather than noisy. A gate that starts at zero has nothing to
absorb.

The enduring part is how this repository reaches a module, which is the part a checker has to get
right:

1. `import` / `export … from`;
2. `import()`;
3. a **path literal** — `tooling/lib/canary-worker.mjs` and `tooling/lib/model-canary-worker.mjs` are
   spawned as subprocesses and imported by nothing;
4. a **tool's own entry** — `vite.config.ts` is read by Vite, and `apps/console/index.html` names the
   Console's real entry module in a script tag.

A naive checker reports (3) and (4) as dead, plus every `.d.ts`: 23 false positives against zero true
ones at the baseline. `recipes/`, `templates/` and `adapters/` are out of scope — those files are
copied into someone else's repository and are reachable from there; `npm run doctor` validates their
manifests, and reporting them here would report that the factory does not import the code it ships.

`tooling/orphan-modules.test.mjs` plants an orphan, plants an orphan that *imports a live module* (the
case a reference count gets wrong), and plants each of the four reference kinds and each
false-positive class. It asserts the repository's own zero alongside a floor on how many modules and
entry points the walk found, because a checker that discovered nothing would also report no orphans.

**`Knip` was evaluated and not adopted.** Reaching the same answer with it needs workspace entries, a
production/test split and configured exceptions for the path-spawned workers — configuration encoding
the same four rules the check encodes directly, with a dependency and a config file on top. Principle
6 asks that a new package solve a problem the platform does not, and the measured problem was zero
findings across four reference kinds.

**Not covered, deliberately:** unused *exports within* a reachable module (needs real symbol
resolution to avoid noise) and unused dependencies (measured clean; its only hits were implicit type
packages). Both become worth revisiting if the reachability answer ever stops being zero.

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

### Stage Q8 — targeted mutation testing ✅ delivered (six safety targets)

Mutation testing answers "would a plausible weakening escape the tests?". It is expensive, so
`npm run mutation:strength` runs against six modules and nothing else, in its own CI job:

| target | why it is worth the runtime |
| --- | --- |
| `packages/control-plane/src/capabilities.js` | grant verification, environment scoping, approval, attempt budget |
| `packages/control-plane/src/egress-policy.js` | which destinations count as the public internet |
| `packages/control-plane/src/index.js` | ChangeSet scope enforcement, loop-guard budgets, the policy check — AGENTS.md principles 13 and 15 *are* these functions |
| `apps/service/src/agent-broker.js` | where a grant is presented and an operation dispatched — the decision obeyed rather than made |
| `packages/control-plane/src/risk.js` | what buys adversarial review, and what does not |
| `packages/control-plane/src/data-change.js` | Stage Q12 production data-change refusals |

**No tool was adopted.** `tooling/lib/mutation-harness.mjs` is about 160 lines: it generates
mutations from ten operators, each naming a *weakening* rather than an arbitrary edit — an `&&` that
becomes `||`, a comparison that widens by one, a required flag that stops being required — runs the
target's own tests against each, and restores the file in a `finally`. Sites inside comments,
strings, template literals and regular expressions are skipped, because a survivor that means nothing
teaches the reader to skim the list. A mutation runner earns a dependency when it does something this
cannot; for six files and ten operators, it did not.

**There is no score.** A percentage says nothing about severity: eighteen survivors in argument
shuffling are fine and one survivor that widens a budget is a defect. Every survivor is printed with
its line and its weakening, and the command fails while any survivor is unaccounted for. All seven
targets currently kill every mutation the registry does not account for: 383 generated, zero
unaccounted survivors. The defects the runs exposed are closed by tests, in the tests — a chain of
`or`s is only proven by the input that trips each link, a budget checked on two branches needs both
branches exercised, and a limit nobody can reach is a limit nobody has tested.

**Equivalent mutations are recorded, not suppressed.** Each entry in `tooling/lib/mutation-targets.mjs`
carries the reason it cannot change behaviour. `tooling/mutation-strength.test.mjs` requires every
recorded id to still be a real mutation site, so an equivalence cannot outlive the line it excused and
hand its exemption to whatever lands there next. That test also runs inside `npm run check` and covers
what would make a mutation run lie: a generator that quietly produces nothing, a registry naming tests
that do not import their target, and a planted fixture where the harness must report exactly one
survivor and leave the file byte-identical afterwards.

**A verdict is not allowed to be a property of its caller.** Run from inside `node --test`, mutant
tests inherited `NODE_TEST_CONTEXT` and reported themselves as nested tests rather than as runs with
their own verdict. The child environment is now sanitised.

**Nor of the machine it ran on.** The same failure in a different disguise cost a red `main`: the
model-canary kill-switch test asserted a check that only exists when the worker reaches the gateway
before the switch watcher cancels its attempt. Both routes refuse the call, which is the property
under test, but only one of them produces a boundary grade — so on a loaded runner the assertion read
a property of `undefined` while the boundary it exists to prove was intact. It now asserts what holds
on both routes, and requires the absence of the grade to be explained by a recorded cancellation
rather than tolerated. Reproduced deterministically with `node --test --test-concurrency=24`, which is
worth remembering as the way to make a scheduling-dependent test admit it.

**The last open target is closed.** `packages/control-plane/src/execution-environment.js` is in the
registry: 55 generated, 55 killed, no recorded equivalences. Remeasured after the hosted task-image
work it had 11 survivors rather than the 17 recorded earlier — that work killed six on its way past
— and closing the rest found four things, three of which are not tests:

- **Two invariants nothing refused.** `readOnlyRootFilesystem` and `workspace.disposable` were set by
  the spec and asserted by nothing, so `assertSpecIsolation` accepted a spec carrying a writable root
  or a workspace that outlives its attempt. Both are the same class as the escapes already on that
  list — a task that can write `/usr/local/bin/node` replaces the interpreter the next attempt runs —
  so both are now refusals with their own planted widening.
- **The exemption pairs were half-tested.** The broker socket, the grant file and the model gateway
  socket are exempt from the forbidden-mount list as `(target, source)` *pairs*, and only the passing
  half had been exercised. Borrowing a handle's target for `/etc/shadow` is refused, a spec with no
  grant file exempts no grant target, and a spec with no model lane exempts no model target whether
  the lane is absent as `null` or missing from the spec entirely.
- **The forbidden list forbids what is under it**, and only its exact paths had been tested, so half
  of that comparison was unproven. `/etc/app-builder/agent-boundary.json` and `/proc/sys/kernel` are
  now refused, and an unrelated absolute path still is not.
- **One branch was dead.** `/` is an ordinary entry in the forbidden list and is matched exactly by
  the comparison above it, so the separate host-root branch could only run in the iteration where
  that comparison had already refused the same input. Deleted; the refusal is unchanged and now has
  one spelling rather than two.

**The gate could pass doing nothing, and now cannot.** A kill is inferred from a failing exit status,
so a target whose tests were *already* red kills every mutation and reports a perfect score for a file
nothing is defending. It is reachable by ordinary means — break a test while editing the module — and
it happened during this very run. The harness now runs the unmutated tests first and refuses the
target if they do not pass, with the failing subtests in the message; `tooling/mutation-strength.test.mjs`
plants a red fixture and requires the refusal, and requires the module to be untouched afterwards.

### Stage Q9 — supply-chain and workflow hardening (priority 1 delivered)

The remaining exposure grows with external skills, MCP, generated repositories, secrets, deployments
and eventually hosted autonomous agents. Priority order, with where each one stands:

**1. GitHub Actions safety ✅ delivered.** `tooling/lib/workflow-security.mjs` holds seven rules,
checked by `tooling/workflow-security.test.mjs` inside `npm run check`. Each names a real way a
workflow becomes a way into the repository rather than a style preference:

| rule | what it stops |
| --- | --- |
| `action-not-pinned` | somebody else's mutable tag running with your token |
| `checkout-persists-credentials` | the workflow token left in `.git/config` for every later step |
| `permissions-not-declared` | inheriting whatever the repository default happens to be — a change that appears in no diff of this file |
| `permissions-write-all` | a declaration that declares nothing |
| `pull-request-target-used` | repository secrets on a fork-controlled trigger |
| `untrusted-interpolation-in-run` | a branch name or PR title substituted into a shell command before the shell sees it |
| `secret-interpolated-into-run` | a secret in the process table, in `set -x` output and in the echoed failure |

The estate passed all seven on the first run, which is exactly why they were written now: a check
adopted while everything passes costs nothing to satisfy, and one adopted after something has gone
wrong arrives with a backlog and an exception list. So the evidence is the planted half — every rule
has a fixture that violates it and must be reported, including the one the two existing rules never
had: **remove an action's pin and the check fails**. A workflow gate that has only ever been run
against sound workflows proves the workflows are sound and says nothing about the gate.

The rules read text rather than parsed YAML, deliberately: no dependency, and the thing being
checked *is* the text — a rule that only holds after a parser has normalised the file is a rule
about the parser. Comment stripping is quote-aware in both directions, so a `#` inside a `run:`
string cannot hide the rest of the block and a pinned action's `# v7` note is not read as its ref.

**2. Exact versions ✅ delivered; dependency review next.** `package-lock.json` is deliberately not
committed, so a range is resolved fresh on every install: the tree a contributor tested is not the
tree CI installs, and neither is the tree the next contributor gets. The failure mode is quiet until
it is not — a pull request in this programme passed `npm run check` locally against `oxlint@1.71`
and failed hosted CI on a rule added in `1.80`, same declared dependency, different resolved
version, one cycle lost. The supply-chain form of the same gap is worse than a lost cycle: a
compromised patch release of any permitted range lands without anybody choosing it.

Twenty ranges across four manifests are now exact — three in the root, six in the Console, and
eleven in the two templates, which is where it matters most: `templates/` is copied into somebody
else's repository, and a generated app that resolves its own toolchain fresh on every install is not
the reproducible ordinary repository `AGENTS.md` principle 9 promises. `tooling/dependency-pinning.test.mjs`
keeps them exact, and refuses a caret, a tilde, a wildcard, a tag, a comparator and a git specifier
as planted fixtures — a `@app-builder/*` workspace link is the one spelling that cannot drift and is
the only exemption. Renovate's `rangeStrategy` is now `pin`, so an update arrives as a proposed exact
version in a diff rather than as a silent resolution.

Proven by regenerating all six canonical acceptance apps from the pinned templates and running the
full benchmark: 6/6 install, check and build at 100%.

With declarations exact, a manifest diff now means something. GitHub's own
`dependency-review-action` now compares every pull request with its base and blocks newly introduced
high or critical vulnerabilities. It is pinned to an immutable full commit SHA, runs with
`contents: read`, receives no secret and does not comment on the pull request. License policy,
Dependabot/Renovate behaviour, SBOM generation and static analysis remain separate decisions rather
than scope smuggled into one supply-chain PR. `dependencyReviewFindings` keeps that boundary
executable and its tests plant a missing action, non-PR trigger, weakened threshold, widened license
scope and secret reference so the clean workflow is not vacuous evidence.

**3. Secret-leakage scanning ✅ delivered.** `tooling/model-execution-doctor.mjs` already asked this
of the six files the model lane owns, by shape rather than by variable name, because the failure it
catches is somebody pasting a working key into a config "just to test it". That reasoning was right
and its scope was not: the same paste lands just as easily in a recipe, a template, a fixture or an
adapter's `.env.example` — the files that get copied into somebody else's repository.

`tooling/lib/secret-scan.mjs` asks it of the whole tree, and the design constraint is signal rather
than coverage. Every rule matches a shape that is a credential and is not anything else: `AKIA`
followed by sixteen uppercase characters is not a word, a PEM private-key banner is not a sentence.
There is deliberately **no entropy heuristic and no `password =` rule** — both find hundreds of
things in a real repository, and a scanner people learn to ignore is worse than none. Ordinary text
that resembles a credential is asserted *not* to be a finding, alongside the planted ones.

The rule that matters most here has no prefix to match on. A Supabase service-role key is an
ordinary-looking JWT that bypasses row-level security, so it is found by base64-decoding the payload
and reading what it claims — and the `anon` and `authenticated` keys a generated app is *supposed*
to carry are asserted not to be findings, because a scanner that refuses the key the product needs
is a scanner that gets turned off.

A tracked `.env` file that is not `.env.example` is a finding, and `.env.example` carrying a value
rather than a name is too: an example with a value in it is the shape a real one gets copied into.

No tool was adopted. A scanner is regular expressions over files; the interesting part is which
expressions, not whose package they arrived in — and none of the maintained options would have
supplied the service-role rule, which is the one specific to this stack.

Every rule has a planted fixture, **assembled from fragments at run time** so that no file in this
repository ever contains a contiguous string shaped like a live credential. A single-line marker,
`not-a-real-credential`, excuses its own line and nothing else — deliberately not a path allow-list,
because a fixture should say so where a reviewer reading the diff sees it. The current tree scans
clean.

**4. Dependency updates.** Renovate is in place; keep them reviewed.

**5. SBOM.** Worth generating deterministically for the factory and for a generated repository once
versions are exact; an SBOM of floating ranges describes a build nobody performed.

**6. Static security analysis.** Only where it beats the deterministic checks already here. Not
evaluated.

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

The higher-level form of the same failure exists at the product boundary: a requirement can survive
intake into the Build Contract/Manifest and still never acquire an implementation consumer or a piece
of executable proof. That is the class exposed by `manifest.constraints.hard`: preserving a string in
machine-readable state is necessary and still not evidence that the build obeys it.

#### Derived requirement coverage

Extend Q10 into a **derived Requirement Coverage Ledger** for approved requirements where the product
claims behavioural effect. It is not a second requirements document and must not be hand-maintained.
Derive it from the existing Build Contract/Manifest requirement identities plus the contracts,
capability/architecture decisions, ChangeSets, consumers and gate/journey evidence that already exist.

For each material requirement, the derived view should be able to distinguish at least:

- **proven** — a real implementation consumer exists and named executable evidence demonstrates the
  relevant behaviour;
- **implemented-unproven** — a consumer exists but the required evidence is absent, stale or did not
  exercise the declared behaviour;
- **unconsumed** — the requirement is preserved but no implementation/planning consumer can be found;
- **not-applicable** — the approved architecture made the requirement irrelevant to this generated
  surface, with that decision attributable rather than inferred after the fact.

Where implementation is not the disposition, the same derived view must retain an approved reason:
explicitly deferred, unsupported/custom work required, intentionally superseded, or rejected/out of
scope. Generated scope needs the same traceability back to approved product intent; a capability must
not appear merely because a model assumes projects of that class usually contain it.

A must-have/hard requirement that is `unconsumed` or `implemented-unproven` cannot be presented as
satisfied merely because the project builds or an agent says it handled it. Existing Build Contract
severity/approval semantics decide whether that state blocks release; the coverage mechanism does not
invent a second priority vocabulary.

Traceability should be useful in both directions:

`requirement -> architecture/capability/implementation consumer -> tests/gates/journeys -> evidence`

and:

`changed consumer/evidence -> which approved requirements may have lost proof?`

Do not require every wording-level preference to acquire a dedicated test. Start with hard constraints,
security/data/auth requirements, critical journeys, selected product capabilities and other requirements
whose omission would materially change the delivered product. Expand only when real builds show a
class of requirement is being dropped silently.

The first acceptance should plant both failure classes: one hard requirement with no consumer and one
with a consumer but vacuous/missing evidence. The gate must report different states, then become green
only when the real consumer/evidence is added. `manifest.constraints.hard` is a natural first real
consumer case; do not create a synthetic coverage system while that known gap remains unresolved.

The second instance is the gate-producer registry, and it is the pattern applied to a registry the
same week it landed. `config/gate-producers.json` makes five claims about things outside itself per
entry — the module that implements a producer, the contract it validates against, the file it writes,
the command that writes it, and the list of checks nothing answers — and four of them were prose.
`tooling/gate-producer-consumers.test.mjs` resolves each: the implementation module must exist and
export the symbols named, the contract path must exist, the artifact must be a JSON file under the
evidence directory, the command must be a script `package.json` defines, and
`tooling/gate-evidence.mjs` must actually publish every registered producer — a producer nothing
publishes can only ever resolve to `artifact-missing`.

The strongest of the five is the last. `unregistered.checks` is a list of *gaps*, and a list of gaps
that drifts is worse than no list because it reads as a survey. It is now required to be exactly the
declared checks with no producer, computed from the gate registry rather than compared against a
second copy of the same opinion, and every deterministic check any gate declares has to appear on one
side or the other. A check that is neither answered nor recorded as unanswered is a gap nobody knows
about.

The first executable instance is the agent capability boundary. `config/agent-capabilities.json`
declares which internal Factory routes exist for the Console and are never agent operations, and each
entry carries the literal fragment of `apps/service/src/http.js` that serves it;
`tooling/agent-capability-boundary.test.mjs` checks every one against the source. The same test
requires every declared capability to name a real operation in the service tool contract and a real
handler in the broker, so a capability nobody can perform fails rather than reassures. Follow that
shape — declaration names its consumer, test checks the consumer exists — rather than inventing a
new mechanism per registry.

The product-capability form now has a small derived primitive in
`tooling/lib/capability-integrity.mjs`. It accepts the Build Contract/Manifest request, module and
recipe registries, generated recipe record, runtime consumers and executable evidence already
produced by a build, and derives `requested`, `registered`, `resolvable`, `generated`, `consumed` and
`proved`. It owns none of those facts. Planted acceptance distinguishes an absent implementation,
broken dependency closure, generated-but-unconsumed module and unsupported proof claim. It is not yet
in the blocking check: applying it to canonical B2B output found the existing `admin` recipe is
installed by default but only exports helpers no generated runtime invokes. Make that capability a
real surface/consumer (or remove the default claim) before promoting this audit to a global gate.

### Stage Q10b — deterministic change-impact map (Phase 5/6; activate on a real complex/brownfield consumer)

Graph-assisted navigation should eventually answer more than “which files are nearby?”. Before a
material ChangeSet, derive a conservative **Change Impact Map** from facts the factory already owns:
changed paths/symbols, module/import relationships, contract/schema ownership, capability/recipe
registries, route/page/journey identities, risk surfaces and registered gate/test producers.

The useful output is not an omniscient dependency graph. It is a bounded answer to:

- which subsystems/contracts/capabilities are plausibly affected;
- which approved requirements or protected journeys depend on those consumers;
- which fast deterministic checks should run during the inner repair loop;
- which browser/database/state fixtures are relevant;
- which specialist/independent reviews the existing risk policy requires;
- which impacts remain unknown and therefore require broader verification.

For example, changing an authoritative scoring/settlement module in a Predictor-class product should
be able to pull in settlement invariants, standings/points journeys and the relevant database/domain
tests without loading the entire repository into the implementation agent. Conversely, a typography
change should not buy database/security work merely because those systems exist in the same project.

Fail conservative: an unknown edge broadens the verification set; it never silently removes a required
gate. The map accelerates development and improves context selection, but it **does not replace** the
full merge/release suite the project's risk and Build Contract require.

Do not build a separate semantic graph platform up front. Start from the module graph, existing
registries and durable product identities already present; add richer symbol/code intelligence only
when a real benchmark demonstrates that path/import-level impact is too coarse. The first worthwhile
benchmark is the existing-product Predictor mode, where the success metric is fewer unnecessary files
tokens/tests per bounded change **without** an increase in regressions or missed required evidence.

### Stage Q11 — ledger and projection reconciliation ✅ delivered

The durability model treats the JSONL event ledger as authoritative evidence and SQLite as a read
projection. That is only safe if the projection is recoverable rather than dependent on two writes
always succeeding together. A crash between ledger append and projection insert must not create two
permanent truths.

A crash between ledger append and projection insert did exactly that, and reopening the store noticed
nothing: two events in the ledger, one in the projection, and every later read, cost total and resume
packet quietly short by one.

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

**Delivered — the evidence.** The contract refuses a change whose restore was never rehearsed, so
something has to perform one. `npm run acceptance:data-recovery` does, against a real disposable
PostgreSQL cluster, in the `database-security` job.

`packages/control-plane/src/data-recovery.js` owns what a rehearsal must prove and never opens a
connection, writes SQL or knows what a dump file is; `tooling/lib/postgres-recovery-adapter.mjs` is
the PostgreSQL implementation and `tooling/lib/disposable-postgres.mjs` the throwaway cluster. The
stable App Builder concept is "capture, damage, restore, compare" — a second provider is a second
adapter, not a second definition of recovery. Snapshot and restore go through `pg_dump`/`pg_restore`
rather than a bespoke export, because a recovery test that exercises a hand-written export path
proves the hand-written path works, which is not the question anybody has in an incident.

The acceptance installs the real `profiles` and `organisations` recipe SQL, seeds it, snapshots,
then destroys: truncates memberships, drops a column, drops a select policy and disables row-level
security on organisations. It restores and compares a schema fingerprint (columns, types,
constraints, indexes, the RLS flag, every policy expression) plus declared invariants — row counts,
referential integrity, an md5 of the stored values, and isolation measured *as an `authenticated`
caller with that user's claim*. A catalog row saying a policy exists is not the same fact as that
policy still limiting what a caller can read, and the organisation invariant is the one that fails
**open**: disabling RLS moves no row, so every count-based check is unmoved by it, and only that
invariant goes from one organisation to two.

Most of the design is refusing to be fooled by its own happy path, because that is the failure this
stage is named after. Three scenarios run alongside the real one and are each required to fail: a
destructive step that changes nothing (`damage-ineffective` — restoring it would prove nothing), an
adapter that reports a restore it did not perform (`invariant-not-restored`), and a rehearsal against
an empty database (`baseline-empty` — a restore of nothing is indistinguishable from a successful
restore of everything). The verified rehearsal's evidence is then fed straight into
`evaluateDataChangeSafety`, which must accept it and must refuse all three, so the two halves of this
stage cannot drift into unrelated programmes sharing a number. An absent database is an exit code,
never a skip.

`tooling/data-recovery.test.mjs` covers the orchestration inside `npm run check` with fake adapters,
including the ones that lie: a restore that returns the rows but not the isolation is not a restore.

**Outstanding.** Old-code/new-schema compatibility and partial-deployment behaviour remain declared
fields awaiting a deployment coupling to enforce them against, and no runtime dispatches a mutation
through this contract yet — nothing autonomously mutates a database today, which is why that is a
sequencing item rather than a gap. The contract and its evidence are what had to exist first.

## Could this gate pass without exercising anything?

A gate that exercises nothing and a gate that passes look identical from outside. That is not a
hypothetical: `npm run lint` in a generated app was green for a while because it was linting zero
files, and nothing noticed. So every gate here carries a second question beside "does it pass".

The three gates a generated repository ships were measured against the six canonical acceptance apps
and answer differently:

| gate | self-guarding? |
| --- | --- |
| `typecheck` | yes — `tsc` with no inputs is `error TS18003` and exit code 2 |
| `lint` | today — `oxlint` with no matching path exits 1 with "No files found to lint" |
| `test` | **no** — `node --test` against a glob that matches nothing exits 0 and reports `# tests 0` |

`lint`'s answer is the uncomfortable one. It self-guards because of the behaviour of the current
release of somebody else's tool, and that behaviour is precisely what was different when this defect
last shipped. So both are checked in `tooling/lib/generated-gate-vacuity.mjs` and enforced as two
benchmark gates in `npm run benchmark:acceptance`:

- **`testsExecuted`** reads the project's own TAP summary rather than its exit status. Zero tests is
  a failure, and so is a run that printed no summary at all — a runner that did not report is as
  unproven as a run of nothing.
- **`lintScope`** reads the paths out of the project's own `lint` script and counts lintable files
  under each one, so the answer does not depend on a linter's release notes. Per path rather than in
  total: a script naming `src` and `tooling` that finds files in only one of them has had its scope
  silently halved while the total stayed positive, which is the shape the original defect took.

Both were proven by planting the defect in a real generated app rather than only in a fixture:
deleting `tooling/project.test.mjs` from the content-site app failed `content-canonical` on
`testsExecuted`, and pointing the marketing-site app's lint script at its `docs/` directory failed
`marketing-basic` on `lintScope`. `tooling/generated-gate-vacuity.test.mjs` covers the same rules
against planted fixtures inside `npm run check`, including the one that would otherwise pass: an
empty path among populated ones.

## Explicit non-adoptions

- No blocking gate before its output has been baselined against real generated projects.
- No `Knip`: the reachability baseline is zero and the four reference kinds this repository uses fit
  in a dependency-free check (Stage Q6).
- No screenshot-everything visual suite.
- No repository-wide mutation testing on every pull request, and no mutation-testing dependency: the
  harness is three targets and ten weakening operators (Stage Q8).
- No second design-system linter once `DesignSystemSpec` can be read directly.
- No security tool adopted because it is well known rather than because it outperforms an existing
  deterministic check.
- No developer tool becomes a runtime dependency of a generated application. Generated repositories
  remain ordinary repositories.
- No production data mutation approved because schema and RLS tests passed.
