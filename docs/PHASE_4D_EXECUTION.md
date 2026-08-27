# Phase 4D Execution Plan

Status: **active**. The only execution plan in this repository; a stage that closes loses its plan
rather than keeping it as a document that still reads like an instruction.

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

1. Candidates share the product truth exactly. Facts, routes, capabilities, claims, provenance and the
   Build Contract are frozen across a candidate set. A candidate that regenerates a fact is not a
   visual candidate.
2. Differences must be **structural** — hero strategy, section grouping and sequence, grid family,
   responsive composition, proof placement, motion language. A candidate that differs only in palette,
   radius or token values is a theme swap, and it is refused before it costs an evidence capture rather
   than after a critic has been paid to notice.
3. Every executable responsive or art-direction declaration names a renderer consumer, or it is
   explicitly non-executable. Phase 4C's invariant does not relax here.
4. A rejected candidate leaves evidence and metadata in factory state. It never becomes a second
   workspace the project has to keep alive.
5. Exactly one candidate can be promoted. If none is good enough, the answer is rework, not the least
   bad one. `deterministic-blocked` has no edge to `promoted`, and that absence is the point.
6. Do not build the comparison canvas, unless the ordinary Console proves it cannot do the comparison.
   It has not.
7. Do not widen agent credentials or autonomy for any part of this stage.

## What is left

Every slice is delivered except the verdict. 4D.3 (MessagingPlan) and the comparison canvas are
recorded as deferred with reviving conditions in `config/factory-status.json`. The machinery — the
promotion contract, reference analysis, asset readiness, `ResponsiveCompositionPlan`, the diversity
gate, comparable evidence, the scored review packet, the bounded rework plan and promotion — is built
and exercised on a real business.

**Outstanding: the independent visual verdict.** The packet scopes a critic to criteria that genuinely
need judgement, scores each against `gates.visual` in `config/agent-pipelines.json`, refuses to record
a below-bar score as a pass, allows a whole set to be sent back or rejected with nothing promoted, and
turns a rework verdict into a bounded plan with lineage that is refused if the composition hash moved.
No genuinely independent model runtime is enabled here, so no verdict has been issued. Restarting the
same model is not independence and is not done.

## Where the evidence is, and how a reviewer reaches it

`npm run acceptance:visual-candidates` leaves ordinary factory state at `.app-builder/visual-review` —
`service/` (the durable project, candidate set, review packets and captured PNGs), `workspaces/` (the
built candidates), `report.json` and `review-packets.json`. Deliberately not `.tmp/`: a reviewer told
the only copy of the evidence is under a build temp directory has been told to go hunting.

`npm run review:visual-candidates` points the ordinary Builder Console at exactly that state. Open
`http://127.0.0.1:5173/builder`, choose the project, and switch the stage from **preview** to
**compare**. The compare stage shows both candidates at once: the direction and its asset strategy; the
same route in both, switchable across six routes and desktop/tablet/mobile at full page height; the
structural axes that actually differ, computed rather than left to be spotted; the responsive plan
field by field; every DesignLint finding with the warnings the reviewer must answer by rule id; the
frozen truth and its baseline composition hash; the directions this project was refused and why; and
the scoped critic criteria stated as the questions they are.

Nothing there is a second design authority — all of it is read from the candidate set and the review
packet.

`writeVisualReviewPacket` additionally writes one self-contained directory with every capture beside
the record that explains it, opening from a `file://` URL with no script and no service. A review a
second person cannot reach is not an independent review; it is a private one.

### Recorded finding: reaching that view still costs a terminal

The comparison surface is right and the evidence is durable, but the route to both still runs through
a shell: clone or SSH, `npm install`, `npm run acceptance:visual-candidates`,
`npm run review:visual-candidates`, then a localhost URL. The owner is the reviewer, and the reviewer
is the one gate this phase waits on, so the cost of reaching the view is part of why the verdict stays
open.

The eventual shape is an ordinary secure browser surface: open it, pick the candidate or site, desktop
and mobile evidence directly there, Pass / Rework / Reject, verdict recorded durably. That is a
product-surface change and it is **not** in scope for the runtime lane; it is recorded here so the cost
is written down where the gate lives rather than rediscovered. It does not change this phase's state —
the verdict is outstanding for the reason it has always been outstanding, and no amount of review
ergonomics closes that.

## Exit gate

Phase 4D does not close until the factory can prove, on a real business rather than a synthetic
canonical app:

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

The nbm run proves clauses 1–6, 8, 10 and 12–14. Clause 7 has its contract and its packet but no
verdict; clause 9 has its mechanism but nothing has been promoted; clause 11 is therefore incomplete;
clause 15 is satisfied by recording the unexecuted independence rather than by executing it.
