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

**The independent visual verdict has been issued, and it rejected both candidates.** The packet scopes
a critic to criteria that genuinely need judgement, scores each against `gates.visual` in
`config/agent-pipelines.json`, refuses to record a below-bar score as a pass, allows a whole set to be
sent back or rejected with nothing promoted, and turns a rework verdict into a bounded plan with
lineage that is refused if the composition hash moved. On 2026-08-28 an OpenAI GPT-5 `design-critic`
reviewed the set an Anthropic runtime had created and rejected both candidates —
`structured-practice` at a 5.21 mean, `editorial-authority` at 4.66, against a required 8.5 mean and a
6.5 per-criterion floor. The verdict is kept verbatim at
`examples/genuine-business/nbm-visual-review-v1.verdicts.json`.

That is the machinery working rather than failing: an independent reviewer found a defect the creator
had missed, and nothing was promoted.

**What the rejection was partly about was invalid evidence.** Both reviews lead with every route
rendering as the same page with Home selected. That was a capture defect. The candidates prerender to
`services/index.html`, and the evidence server served a path only when that path was itself a file, so
every route fell through to the shell and was photographed as the home document — 45 degenerate route
pairs per candidate. It is fixed in document resolution and proved by six distinct captures whose
rendered `data-page-id` matches the route requested.

**What is outstanding is the design work the capture fix does not answer.** A weak distinctive moment
(2.8 and 2.5), thin credibility material, and single-channel conversion are genuine findings about the
output, not about the photograph of it. Phase 4D now closes on a second independent verdict over
recaptured evidence, not on a first one existing.

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

The nbm run proves clauses 1–6, 10 and 12–14. Clause 7 is now exercised rather than only contracted:
an independent critic scored the scoped criteria and rejected both candidates. Clause 8 is **not** yet
proved — the captures were comparable in form but not in fact, because all six routes were the same
document; it is re-earned when the set is recaptured. Clause 9 has its mechanism and has now
demonstrated its harder half, that a set can be rejected with nothing promoted; a promotion still has
to happen. Clause 11 is therefore incomplete. Clause 15 no longer applies to the visual verdict, which
was executed, and remains the standing rule for anything else recorded as unexecuted.
