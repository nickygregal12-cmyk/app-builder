# Phase 4D Execution Plan

Status: **active**, opened 2026-08-26 when Phase 4C closed.

Phase 4C gave the factory one good visual answer and made every part of it compile. Phase 4D is about
the fact that one answer is not a choice.

```text
same approved product/content truth
  -> 2-4 genuinely different art directions
     -> real responsive implementations
        -> deterministic checks
           -> RenderedEvidence
              -> independent visual judgement
                 -> exactly one promoted
                    -> an ordinary generated repository
```

## Non-negotiable rules

1. Candidates share the product truth exactly. Facts, routes, capabilities, claims, provenance and
   the Build Contract are frozen across a candidate set. A candidate that regenerates a fact is not a
   visual candidate.
2. Differences must be **structural**. Hero strategy, section grouping and sequence, grid family,
   responsive composition, proof placement, motion language. A candidate that differs only in
   palette, radius or token values is a theme swap, and it is refused before it costs an evidence
   capture rather than after a critic has been paid to notice.
3. Every executable responsive or art-direction declaration names a renderer consumer, or it is
   explicitly non-executable. Phase 4C's invariant does not relax here.
4. A rejected candidate leaves evidence and metadata in factory state. It never becomes a second
   workspace the project has to keep alive.
5. Exactly one candidate can be promoted. If none is good enough, the answer is rework, not the least
   bad one.
6. Do not build the comparison canvas first, or at all, unless the ordinary Console proves it cannot
   do the comparison.
7. Do not widen agent credentials or autonomy for any part of this stage.

## Slices

| slice | subject | state |
| --- | --- | --- |
| 4D.1 | Visual promotion contract, and DesignLint as a real promotion input | done |
| 4D.2 | Visual reference analysis | done — the supplier arrived |
| 4D.3 | MessagingPlan | **deferred** — no consumer |
| 4D.4 | Visual asset readiness as an art-direction input | done |
| 4D.5 | ResponsiveCompositionPlan | done |
| 4D.6 | 2-4 real candidates over one frozen truth, with a diversity gate | done |
| 4D.7 | Comparable rendered evidence per candidate | done |
| 4D.8 | Independent visual critic | contract, packet, scored bar and bounded rework loop done; **verdict outstanding** |
| 4D.9 | Promotion into the ordinary generated repository | mechanism done; awaiting 4D.8 |
| — | Visual comparison canvas | **deferred** — the Console does it |

## 4D.1 — the visual promotion contract — done

`schemas/visual-candidate-set.schema.json` and `tooling/lib/visual-candidates.mjs`.

The frozen truth is stated once for the set rather than per candidate, because candidates are only
comparable while they say the same thing. DesignLint severity now decides what a rule can decide:

| severity | effect on promotion |
| --- | --- |
| `violation` | cannot be promoted, and a verdict is refused outright. There is nothing judgement can add to "the accent is unreadable" |
| `warning` | reaches review, and the reviewer must speak to it by rule id. A reviewer may disagree with a warning; it may not be silent about one |
| `recommendation` | never blocks. "A dense internal tool is deliberately flat" stays a legitimate answer |

`deterministic-blocked` has no edge to `promoted` in the state machine, and that absence is the point.
Exactly one candidate reaches `promoted`, every sibling is closed in the same operation, and where none
has a passing review the answer is rework rather than the least bad one. AGENTS.md rule 17 is not
softened because the artifact is a picture.

## 4D.2 — visual reference analysis — done

Deferred at the start of this stage for a good reason: nothing supplied a reference the factory did not
already read, and inventing traits from a site nobody supplied would have been a fabricated observation.
The reviving condition recorded in `config/factory-status.json` was a supplied screenshot, moodboard or
approved reference URL *and* a direction-selection decision asset readiness and project type cannot make.
Both now exist, and it shipped.

`docs/DESIGN_INTELLIGENCE.md` §4 is the authority on the design. What matters for this stage record is
the two decisions that keep it inside 4D's own rules:

- a reference does not get a plan of its own. On a structural axis an avoided value refuses the
  direction with a recorded reason (`reference-avoids-trait`, alongside `imagery-not-available` and
  `no-distinctive-moment`); on a scaled one a preference overrides the registry's declared intent before
  `compileArtDirectionPlan` runs, so `restraintLevel` still clamps it and still records the clamp;
- a reference cannot reach a fact, a route, a binding, an asset's rights or a capability.
  `assertPresentationOnly` still runs over the result, and asset readiness and the distinctive-moment
  rule are evaluated *after* reference influence, so a reference can never argue a build into an
  imagery-led direction it has no photographs for.

## 4D.4 — asset readiness as an art-direction input — done

`tooling/lib/asset-readiness.mjs`. Resolved **before** directions are selected, which is the whole
point: the familiar failure is an imagery-led design chosen for a business with two logos and no
photography, discovered at review as a page of grey rectangles. An asset the business has not cleared
never counts towards coverage, so a direction can never be justified by a photograph nobody approved.

## 4D.5 — ResponsiveCompositionPlan — done

Part of the ArtDirectionPlan rather than beside it. Mobile content order, navigation treatment, hero
stacking, density and motion, each read by `templates/react-vite-neutral`. Exactly one of them
compiles to a custom property; the rest are structural changes only a class can make.

## 4D.6 — candidates, and refusing the ones that are not — done

`config/visual-directions.json` and `tooling/lib/visual-direction.mjs`. Four directions differing in
hero strategy, grid family, section order, closing-action placement, heading treatment and
distinctive moment — with a renderer or composer consumer for each.

`applyVisualDirection` is a permutation and a re-choice of presentations the template already renders.
`assertPresentationOnly` proves it rather than trusting the registry: pages, routes, section
membership, bindings, actions, asset ids and warnings all come through unchanged.

`structuralSignature` excludes every token, so two candidates that differ only in colour sign
identically. `assessDiversity` reads three independent planes — presentation sequence, composition
axes, responsive strategy — and requires two of them to differ. Two rather than a percentage, because
a percentage over incommensurable fields is a number invented to look rigorous. Two rather than three,
because an application surface is a real case where section order is not where the difference lives.

A distinctive moment that has nothing to render is refused. The nbm acceptance found that: a practice
with no photography was offered a direction whose memorable idea was a numbered index of its work.

## 4D.7 — comparable evidence — done

Every candidate is generated, installed, verified, built and photographed from its own built output,
at the same three viewports over the same routes, with the same DesignLint pass. A comparison between
a candidate photographed at three widths and one photographed at one is not a comparison.

## Where the evidence is, and how a reviewer reaches it

`npm run acceptance:visual-candidates` leaves ordinary factory state behind at
`.app-builder/visual-review` — `service/` (the durable project, candidate set, review
packets and captured PNGs), `workspaces/` (the built candidates), `report.json` and
`review-packets.json`. It is deliberately not `.tmp/`: a reviewer told the only copy of
the evidence is under a build temp directory has been told to go hunting.

`npm run review:visual-candidates` points the ordinary Builder Console at exactly that
state. Open `http://127.0.0.1:5173/builder`, choose the project, and switch the stage
from **preview** to **compare**.

The comparison renders in the builder stage rather than the activity sidebar. That is
not cosmetic. Two full-page captures cropped into a 330px column are not a comparison,
and the surface that could not do the job was the narrow one, not the ordinary one — so
the fix is the width the Console already has, not a canvas. The stage shows, for both
candidates at once:

- the direction, its id, its purpose and its asset strategy;
- the same route in both, switchable across the six routes and desktop/tablet/mobile,
  each capture scrollable at full page height rather than cropped to its fold;
- the structural axes that actually differ, computed rather than left to be spotted;
- the responsive plan field by field — mobile hero, navigation, mobile section order,
  density and motion — rather than the signature's packed comparison string;
- every DesignLint finding at every severity, with what the rule said, and the warnings
  the reviewer must speak to by rule id;
- the frozen truth every candidate shares, with the baseline composition hash;
- the directions this project was refused, and why;
- the scoped critic criteria from the review packet, stated as the questions they are.

Nothing there is a second design authority. The axes, the responsive plan, the lint
findings, the frozen truth and the criteria are all read from the candidate set and the
review packet that 4D.1, 4D.6 and 4D.8 already produce.

### Recorded finding: reaching that view still costs a terminal — 2026-08-27

The comparison surface is right and the evidence is durable, but the route to both still
runs through a shell: clone or SSH, `npm install`, `npm run acceptance:visual-candidates`,
`npm run review:visual-candidates`, then a localhost URL. The owner is the reviewer, and
the reviewer is the one gate this phase is waiting on, so the cost of reaching the view is
part of why the verdict stays open.

The eventual shape is an ordinary secure browser surface: open it, pick the candidate or
site, desktop and mobile evidence directly there, Pass / Rework / Reject, verdict recorded
durably. That is a product-surface change and it is **not** in scope for the runtime lane;
it is recorded here so the cost is written down where the gate lives rather than
rediscovered. It does not change this phase's state: the verdict is still outstanding for
the reason it has always been outstanding — the factory made the candidates, so the factory
cannot promote one — and no amount of review ergonomics closes that.

## 4D.8 — the independent critic — contract done, verdict outstanding

`visualReviewPacket` hands a critic what the rules already settled, the warnings it must address, and
a scoped set of criteria — brand fit, hierarchy, coherence, distinctiveness, credibility, conversion
clarity, imagery suitability, responsive quality, whether the distinctive moment lands. Every one of
them needs judgement; none can be settled from the compiled design and the composition, which is the
test a criterion has to pass to be on the list at all.

The packet now also carries the bar the answers are held to. `gates.visual.minimumScore` has been 8.5
in `config/agent-pipelines.json` since the convergence contract was written and governed a code path
nothing reached, because the candidate review produced no score. It does now: a verdict scores every
criterion it was scoped, and three things follow.

- **A below-bar verdict cannot be a pass.** A reviewer may score a candidate 7.2 and say so; what it
  may not do is call 7.2 a pass, because a pass is what promotion reads. `minimumCriterionScore` stops
  a strong average hiding one badly failing criterion.
- **A set can be decided with no winner.** "Both candidates are competent; neither clears the bar" is
  now recordable as `rework-required` or `rejected`, and neither is reachable until somebody has looked
  at every candidate in the set. Promotion answering only "which of these" is how a system ends up
  shipping the least bad one by default.
- **A rework verdict produces a bounded, targeted plan.** `schemas/visual-rework-plan.schema.json`
  carries the criteria that failed, the criteria that must survive, the specific axis changes that
  answer the failure, the frozen truth that may not move, and the iteration it belongs to. A revision
  keeps lineage back to the verdict and is refused if its composition hash moved. Where no axis the
  factory can tune would answer the failure, the plan classifies a `customPresentation` requirement
  instead — which is how the Presentation Registry stops being allowed to answer "the closest existing
  component".

**No genuinely independent model runtime is enabled in this repository.** Restarting the same model,
changing its temperature or sending it a second prompt would not be independence, and none of those is
done here. The contract is retained and the verdict is outstanding, recorded in
`outstandingProductGates` rather than simulated.

The review is also no longer local-only. `writeVisualReviewPacket` writes one directory — every capture
copied in beside the record that explains it, the frozen truth, the plans, the lint, the verdicts, the
criteria and the bar — with an index that opens from a `file://` URL with no script and no service. A
review a second person cannot reach is not an independent review; it is a private one.

## 4D.9 — promotion — done

Promotion writes an ordinary durable design choice and rebuilds. That is the whole mechanism, and it
is deliberately small: the repository that results is the project's own next build, not a candidate
workspace renamed. Every candidate workspace is removed afterwards, the promoted one included.

## The comparison canvas, and why there is not one

Section 17 of the stage brief says to prove the ordinary Console first. It was, and it can: the
candidate panel shows every candidate side by side, switches route and viewport over captured
evidence, names the axes that actually differ, shows the deterministic gate and what the reviewer must
address, exposes the scoped critic criteria, and promotes exactly one. tldraw was not installed,
because a dependency bought against a problem nobody has is a dependency that stays.

One usability failure was found and fixed, and it is worth recording precisely because it is the kind
of finding that gets read as an argument for a canvas. The panel rendered in the 330px activity
sidebar, which cropped two full-page captures into roughly 150px columns. That is not a comparison.
The failing surface was the narrow column, not the ordinary Console — the same panel in the builder
stage does the job — so the answer was the width the Console already had. A canvas would have bought a
dependency to solve a layout problem.

## 4D exit gate

Phase 4D does not close until the factory can prove, on a real business rather than a synthetic
canonical app:

The nbm genuine-business run (`npm run acceptance:visual-candidates`) proves clauses 1-6, 8, 10 and
12-14 today. Clause 7 has its contract and its packet but no verdict, clause 9 has its mechanism but
nothing has been promoted, clause 11 is therefore incomplete, and clause 15 is satisfied by recording
the unexecuted independence rather than by executing it.

1. one approved product/content truth produces at least two genuinely different visual directions;
2. the differences are structural, not theme swaps;
3. each candidate has a real responsive implementation;
4. every executable declaration has a real consumer;
5. DesignLint participates in promotion;
6. a deterministic violation prevents promotion;
7. visual judgement is scoped to genuinely subjective criteria;
8. candidate evidence is comparable;
9. exactly one candidate can be promoted;
10. rejected candidates do not become permanent forks;
11. a real-business project demonstrates the whole flow;
12. the promoted output is a standalone repository with no App Builder runtime dependency;
13. no rights, provenance or factual boundary is weakened;
14. no speculative design-intelligence catalogue was built without a real consumer;
15. any unexecuted independence requirement is recorded honestly rather than faked.
