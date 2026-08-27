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

What is still planned is the rest of the wiring: gate results are supplied by callers today, and the
Phase 6 quality programme is what makes every gate produce its own deterministic evidence. The
rehearsal supplies none, which is why it always reports `converged: false` with `gate-not-run` even
after promoting every stage.
