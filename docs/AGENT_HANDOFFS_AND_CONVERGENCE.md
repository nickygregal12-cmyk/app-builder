# Agent Handoffs, Typed Rework and Factory Convergence

Status: **foundation landed (Phase 3.8H), full gate coverage arrives with the Phase 6 quality
programme**.

This document defines how work moves between specialists and how the factory decides it is finished.
It is a detail document under `docs/FACTORY_CONTROL_PLANE.md`; the primitives live in
`packages/control-plane/src/roles.js` and the contracts in `schemas/review-verdict.schema.json`,
`schemas/stage-handoff.schema.json` and `schemas/convergence-report.schema.json`.

## Artifacts, not transcripts

Specialists never hand each other a conversation. They exchange durable artifacts declared in the
`artifacts` block of `config/agent-roles.json`, each of which is either produced deterministically by
the factory or written by exactly the roles that declare it in `writes`.

The dependency order the registry encodes:

```text
IntakeBrief
  -> ResearchPack -> ProductDecision -> ProductSpec
     -> InformationArchitectureSpec -> UXFlowSpec
        -> ContentSpec / MarketingContentSpec
        -> BrandSpec -> ArtDirectionPlan (+ ImagePlan)
           -> DesignSystemSpec / MotionContract / ComponentManifest
              -> PageSpec / SectionSpec
                 -> ChangeSet -> RenderedEvidence
                    -> DesignLint / Accessibility / Performance / SEO / Security reports
                       -> ReviewVerdict -> StageHandoff -> ConvergenceReport -> ReleaseDecision
```

A pipeline stage's `requires` list is the subset of its role's `reads` that the pipeline actually
produces, and the doctor and tests reject any pipeline where a stage requires an artifact no earlier
stage produces.

Some artifacts have schemas today (`PageSpec`, `SectionSpec`, `ChangeSet`, `ReviewVerdict`,
`StageHandoff`, `ConvergenceReport`, plus the existing manifest/build-contract/knowledge-pack
family). The specification-layer artifacts are declared in the registry with `status: "planned"` and
gain schemas as each matures. Declaring the dependency order first is deliberate: schemas written
before the artifact is understood become drift, not authority.

## The handoff contract

An agent saying it is finished does not advance a stage. `evaluateHandoff` promotes a stage only when
every one of these holds:

1. every artifact the stage declares in `produces` exists, **and nothing outside it does** — `produces`
   is an output scope, not a minimum;
2. every prerequisite artifact the stage declares in `requires` is available;
3. every required evidence item exists;
4. every required deterministic check ran and passed — a `not-run` check blocks exactly like a
   failing one;
5. an independent reviewer issued a passing verdict for this stage, or a human approved it where the
   pipeline names `human` as the reviewer.

Any failure produces a typed blocker (`missing-artifact:*`, `undeclared-artifact:*`,
`missing-prerequisite:*`,
`missing-evidence:*`, `check-not-run:*`, `check-failed:*`, `review-verdict-missing`,
`wrong-reviewer:*`, `self-approval-rejected`, `verdict-stage-mismatch:*`, `verdict-blocked`,
`human-approval-required`) and `nextStageId` stays null. A promoted handoff records who approved it.

## Typed rework and backward routing

Disagreement between specialists is data, not argument. A `ReviewVerdict` is one of:

- `pass`;
- `pass-with-observations`;
- `rework-required`;
- `blocked`.

A `rework-required` verdict must name at least one failing criterion, a severity above `none`, and a
`returnToRole` that is not the reviewer. A `blocked` verdict must state what is missing outside the
reviewer's control. A passing verdict may not carry failing criteria. These are enforced at
construction, so a vague complaint cannot become a stage decision.

This is what routes work backwards through the organisation:

| Finding | Returns to |
| --- | --- |
| "The IA prevents recovery from this workflow." | `information-architect` |
| "Content hierarchy cannot support the intended layout." | `ux-interaction` or the content author |
| "Required service-area evidence is absent." | `marketing-content` |
| "This capability needs a different auth architecture." | `solution-architect` |
| "Correct, but generic and low-distinctiveness." | `art-direction` |

## The convergence engine

`evaluateConvergence` assesses every gate a pipeline requires and produces a `ConvergenceReport`. The
gate registry lives in `config/agent-pipelines.json`; the seventeen registered gates are product,
information-architecture, ux, content, brand, architecture, design-system, visual, functionality,
responsive, accessibility, performance, seo, security, provenance, tests and launchability.

Each gate declares who evaluates it (a reviewer role, or `deterministic`), which deterministic checks
belong to it, which evidence it requires, and which **creator** role owns its rework. A gate may
carry a minimum score — the visual gate requires 8.5 — and a passing status with a below-threshold
score is converted to a failure rather than accepted.

A report looks like this:

```text
product            PASS
information-arch   PASS
ux                 PASS
content            PASS
brand              PASS
design-system      PASS
visual             FAIL   7.4 < 8.5      -> art-direction
functionality      PASS
responsive         PASS
accessibility      PASS
performance        PASS
seo                PASS
security           FAIL   missing-csp    -> frontend-implementation
provenance         PASS
tests              PASS
launchability      FAIL   no-rollback    -> product-specification
```

Rules the engine enforces:

- a gate that has not run is never treated as passing, and `converged` stays false;
- a failing gate with no owning creator role in the pipeline is a registry error, not a warning;
- `planRework` orders the queue blockers first, then major, then minor; observations never force
  another iteration on their own;
- a hard budget stop (`cost-budget-exhausted`, `iteration-budget-exhausted`, and the rest, produced
  by the existing `evaluateLoopGuard`) outranks an ordinary rework loop, so the factory stops
  spending rather than looping on an unreachable gate.

The loop therefore stops for exactly one of three deterministic reasons: it converged, a hard budget
was exhausted, or it is blocked on something no role in the pipeline can resolve.

## Where a gate result comes from

Gate results used to be supplied by callers, which meant every one of them was `not-run` and the
engine's refusal was the only thing the convergence contract had ever demonstrated. The translation
from a producer's artifact to a gate status now lives in one place —
`packages/control-plane/src/gate-evidence.js`, reading the registry in `config/gate-producers.json` —
and `npm run gates:evidence` runs it over a real build of the frozen nbm intake.

The registry names, per deterministic check, the real producer that answers it, the artifact that
producer leaves, the field carrying that artifact's build reference, and which of the producer's
findings fail the check. Eleven checks are registered today against eight producers: the launch
readiness audit answers `fact-provenance-check`, the asset-rights audit answers `asset-rights-check`,
the compiled DesignLint report answers both `design-lint` and `design-system-lint`, the payload
budget answers `performance-budgets`, the tree-wide credential scan answers `secret-scan`,
`npm audit` over the tree the project installs answers `dependency-audit`, the SEO/AEO scanner
answers `seo-aeo-scanner`, and the generated project's **own** `typecheck`, `lint` and `test`
scripts answer the three checks named after them.
The last five need the project installed and built, because a payload, a dependency tree, a test
run or a document head measured from source is a measurement of the wrong thing. Three declared
checks have no producer and are listed as such: `e2e-tests`, `axe-serious-critical` and
`executed-rls-acceptance`. The first two need a browser and a served build, which the Playwright
lanes own; the third needs a live Postgres with the generated policies applied, which is the
`database-security` CI job's.

### What `axe-serious-critical` is actually waiting for

Not an artifact any more. The accessibility lane was already running real axe passes over
composition-derived routes at two viewports; what it produced was a Playwright attachment, which a
person can open and a gate cannot resolve. `npm run test:e2e:accessibility` now also writes
`.app-builder/accessibility/report.json` — bound to the `compositionHash` of the project it audited,
with coverage recorded as a grid of route by viewport, and a declared route the lane did not audit
emitted as a `critical` finding so that an audit of nothing cannot read as a clean pass.

It is still unregistered, and the reason is worth stating because it applies to `e2e-tests` equally.
`evaluateEvidenceIntegrity` fails on any registered check that resolves `not-run`, and
`npm run gates:evidence` exits non-zero when integrity fails. That command builds the NBM
genuine-business project; the accessibility lane audits the generated acceptance marketing site. Two
builds, two composition hashes — so a registered check would resolve to `evidence-for-another-build`
on every run and take the `verify` job with it.

That is not a sequencing problem and no reordering of CI fixes it. **A browser-lane check can be
registered only once its lane and `gates:evidence` audit one build**, which is a decision about what
the accessibility gate measures rather than something a producer entry can express. Until then the
check stays on the unanswered list, where it belongs, and the artifact waits for it —
`tooling/axe-evidence.test.mjs` holds that artifact to the contract it will have to satisfy on the
day the two lanes agree.

`seo-aeo-scanner` reads the **built documents** rather than the composition, for the same reason the
payload budget does: what a renderer emits is a separate fact from what a composer decided, and only
the first is what a crawler receives. It records findings and no score — `gates.seo` sets
`minimumScore: null` — and it deliberately does not fail a build for not knowing its own deployment
URL, because a canonical link is a claim about where a site lives and the factory refuses to invent
one. That refusal is recorded as an advisory limit.

What the resolver refuses, all of it as `not-run` rather than a pass:

- an artifact that is absent, unreadable, or has no findings array;
- an artifact recording no build reference, so nothing ties it to a build;
- an artifact whose build reference is not this build's — which is the same refusal as staleness;
- an artifact produced for another project, refused before its contents are read, so another
  project's defect is never this build's failure either;
- a check no producer answers, and a gate that declares no deterministic check at all.

Two things deterministic evidence may never buy. A gate declaring `requiresIndependentReviewer`
stays `not-run` until a verdict exists however many of its checks pass, because rule 17 is not
something evidence can settle. And a gate whose `requiredEvidence` is absent stays `not-run` too:
there is nothing for the reviewer to look at.

On the current nbm build, `provenance` is a genuine deterministic **pass** — the first required gate
to reach a real status from real evidence — `design-system`, `visual` and `performance` have every
declared check answered and wait only on a verdict, `security` has two of its three answered and
`tests` three of its four, each one producer short of being decidable. Convergence is `false` with
`gate-not-run`, which is correct and is expected to stay that way until the Phase 6 quality
programme gives the remaining checks producers and a reviewer issues the verdicts.

Two numbers in that report are worth reading rather than skimming. The asset-rights pass is over
**0 assets published**, and the generated project's test suite is **1 test**. Both are true, both are
weak, and both are visible because a check may declare where its producer records how many subjects
it examined.

A pass over nothing is still a pass and hides that, so a check may declare the field where its
producer records how many subjects it examined. The report prints it beside the status: the
asset-rights pass on the nbm build is `over 0 assets published by this build`, which is true, weak,
and visible.

## The copyback, and why it names no vendor

A stage handoff is between *roles*. A copyback is between *workers* — the report a session ends with
so that whoever picks the task up next can start without reconstructing anything.

It has one design rule, and it is the same one that makes `assertReviewIndependence` possible: the
worker is a variable. Claude Code is the current primary development agent, Codex CLI is the declared
fallback when its allowance is exhausted (`ops/hetzner/README.md` §7a), and a gateway-driven
specialist is a third. All three end a session by writing the same shape, because a report whose
structure depends on who wrote it is a report the next worker has to translate before they can use it.

```text
Repository        starting main SHA -> ending main SHA
Worktree/branch   where the work is, and whether it is finished with
PRs               merged, open
Stage             the current stage in the durable task record
What changed      the claim
Evidence          where that claim can be checked
Tests             what ran, what passed, what did not
Provider          which worker and model produced this
Attempts          providers tried and why any were refused, if routed
Cost              what it spent, if anything
Since last        what moved since the previous copyback
Blockers          what is in the way
Next              the highest-value next action
```

Two of these rows are worth arguing for.

**Provider and attempts** are recorded because "which model wrote this" is evidence about the work,
in the way `assertIndependentReview` already depends on: a verdict from the runtime that produced the
work is not independent of it, and a copyback that does not say who wrote it cannot be checked for
that later. `Attempts` carries refusals as well as the call that succeeded — a task that fell through
to a second provider, or waited because no eligible one was available, should say so, because a quiet
downgrade is the failure mode worth being able to find afterwards. No attempt record may carry
credential material; the gateway's journal takes the same position for the same reason.

**Since last** exists because a copyback is read by someone who has the previous one. Restating the
whole history each time buries the delta that is the actual news.

What a copyback is *not* is an authority. It is a claim about a moving thing, written at a moment
that has passed — the same hazard `docs/AGENT_RUNTIME.md` names about snapshots of hosted state. The
branch, the durable task record and the ledger are the thing itself. A worker resuming from a
copyback should read it for orientation and then go and look, and a copyback that disagrees with the
repository is wrong by construction.

## Relationship to spec-driven prior art

The specify → plan → tasks → implement ordering, cross-artifact consistency analysis and the
`converge` idea come from `github/spec-kit` (registered in `config/external-sources.json` as
reference-only). App Builder borrows the convergence concept and the discipline of specifying before
implementing. It does not adopt Spec Kit's workflow engine: durable tasks, budgets, ChangeSets,
checkpoints and policy already live in the control plane, and a second orchestrator would be a
competing authority.

## What is executable today

`evaluateHandoff`, `createReviewVerdict`, `assertReviewIndependence`, `evaluateConvergence`,
`planRework`, `buildRoleContextPacket`, `assertMutationAllowed`, `selectPipeline` and `nextStage` are
implemented and covered by `tooling/agent-architecture.test.mjs`.

Those primitives are now also *composed*. `npm run rehearse:pipeline` walks a registered pipeline end
to end with a deterministic stand-in where the specialist will be, so the ordering between them is
something that has run rather than something the architecture asserts. Its evidence and its refusals
are described in `docs/AGENT_RUNTIME.md`; the one control-plane primitive it needed and did not find
is `projectPipelineProgress` in `packages/control-plane/src/pipeline-state.js`, which answers "which
stage may run now, given what durably exists" — the question `nextStage` does not ask, because
`nextStage` is positional and durable state is not.

Two rules were tightened by walking it. A stage's `produces` is now an output *scope* rather than a
minimum: an artifact outside it is an `undeclared-artifact:*` blocker, on the same reasoning that
makes a file outside `allowedFiles` a ChangeSet scope escape. And a stage recorded as promoted whose
artifacts are no longer present is `stage-evidence-missing:*` — a hole in the record to be refused,
not resumed onto.

`resolveGateResults` and the producer registry are implemented and covered by
`tooling/gate-evidence.test.mjs`; `npm run gates:evidence` composes them over a real build. What is
still planned is the rest of the producers — ten declared checks have none, and the Phase 6 quality
programme is what gives them one. The rehearsal supplies no gate results at all, which is why it
still reports `converged: false` with `gate-not-run` after promoting every stage: it produces
artifact identities rather than a build, and there is nothing for a producer to read.
