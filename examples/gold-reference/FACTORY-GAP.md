# Factory gap analysis

What the corpus shows about App Builder, tied to rendered evidence rather than to opinion.

Every score below was produced by the same class of independent reviewer against the same
nine criteria and the same gate — mean ≥ 8.5, every criterion ≥ 6.5.

| | mean | floor | distinctiveness | source |
|---|---|---|---|---|
| Factory, best recorded (`nbm editorial-authority`) | 6.70 | 4.7 | 5.4 | `docs/PHASE_4D_VISUAL_DEBT.md` §2b |
| Factory, `nbm structured-practice` | 6.58 | 4.2 | 4.8 | same |
| Factory, `nbm service-forward` | 6.10 | 4.6 | 4.8 | same |
| **Ardwell & Roe** (prototype) | **8.711** | **7.7** | **8.8** | `ardwell-roe/evidence/verdicts/v5.json` |
| **Marram** (prototype) | **8.556** | **8.0** | **9** | `marram/evidence/verdicts/v18.json` |
| **Plumbline** (prototype) | **8.667** | **8.0** | **9** | `plumbline/evidence/verdicts/v6.json` |

## The question the corpus was built to answer

> Is the visual ceiling Claude, or is it the current factory constraints?

**It is the constraints.** The same model, given the same business truth and a free hand,
clears a gate the factory has missed in every recorded round — and clears it in three
different sectors, twice on the first or near-first attempt.

`docs/PHASE_4D_VISUAL_DEBT.md` §3 had already reached this conclusion from the inside:

> The Presentation Registry is the visual ceiling. Art direction controls tokens and section
> presentations; it does not control the component vocabulary.

The corpus does not overturn that finding. It does something more useful: **it removes the
confound that made the finding arguable, and it puts a number on the headroom.**

## The confound, and why it mattered

§2b closes with an honest caveat that has been holding the conclusion back:

> Every candidate in every round of this session was told to add credentials, representative
> work, sectors, outcomes or client proof. nbm's approved intake carries one description —
> the Companies House record — an empty `trustSignals` array, and no client-facing
> proposition. […] the remaining distinctiveness and credibility headroom needs
> owner-supplied truth rather than another visual intervention.

That is correct, and it means every factory score in that document is confounded. A build can
score 5.4 on distinctiveness because the vocabulary is fixed, or because the business truth is
one Companies House line, and the recorded runs cannot separate the two.

**Ardwell & Roe removes one half of that confound.** Its business truth is not invented for
the prototype — `src/data/studio.ts` reads it from
`examples/visual-excellence/ardwell-roe-approved-knowledge.v1.json`, the factory's own
approved knowledge pack: 17 facts, 6 projects, 5 testimonials, 10 services, 5 people, all
`user-provided` at confidence 1. That is the opposite of nbm's intake. Given that truth and a
free hand, the score is **8.711 with distinctiveness at 8.8**.

## The experiment that has not been run, and should be first

The corpus establishes the ceiling for rich truth *without* the vocabulary. It does not
establish what the factory does with rich truth *within* it, because **the factory has never
been run against the Ardwell & Roe intake.** Every candidate in `PHASE_4D_VISUAL_DEBT.md` is
nbm or MGB Decor.

That leaves exactly one cell of the table empty, and it is the decisive one:

| | thin truth (nbm) | rich truth (Ardwell & Roe) |
|---|---|---|
| **factory vocabulary** | 6.70 / 4.7, distinctiveness 5.4 | **never run** |
| **free hand** | not built | 8.711 / 7.7, distinctiveness 8.8 |

Filling that cell is cheap — the intake bundle, the asset plan and the knowledge pack all
already exist in `examples/visual-excellence/` — and it decides how the remaining work should
be spent:

- If the factory scores near 6.7 on rich truth, the vocabulary is the whole constraint and
  §3's finding is proven. Spend the budget on the component vocabulary.
- If it scores materially higher, thin intake was doing more of the damage than assumed, and
  the intake questionnaire is where the leverage is.

**No amount of further prototyping answers this. Only running the factory does.** It is the
first recommendation in `INTEGRATION-PLAN.md` for that reason.

## Where the gap actually is, criterion by criterion

The corpus is not uniformly better. Reading the two sets against each other:

**`distinctiveness` (5.4 → 8.8/9/9) is the whole gap.** Everything else follows from it. The
factory's own §3 records this criterion as flat at 4.3–4.8 through a content fix, a moment
contract, an axis-rendering fix and an entirely new direction — it moved only when an
architectural assumption changed. The prototypes score 8.8–9 not because they are prettier
but because each is *unable to be about another business*: F1 in `FINDINGS.md`. A page built
around a plant register or a migration plan cannot be lifted onto another site. A page built
from a card grid and a dark closing rectangle is, by construction, liftable.

**`responsive-quality` is not where the gap looks like it is.** The factory records
7.3 / 7.5 / 5.9 — better than several of Marram's intermediate revisions (6.8, 7.0). The
prototypes reach 8.0–8.3, and the measured route there (F3) was *recomposition*, not more
breakpoints. This matters because `docs/VISUAL_EXCELLENCE.md` §3 already specifies
`ResponsiveCompositionPlan` with exactly the right capability list — "alternate order/grouping
of section content", "different image crops/focal framing", "section variants that
deliberately differ by viewport". **The specification is not the gap. The gap is whether any
of that reaches a renderer.** Every executable declaration is required to have a
renderer/selector consumer; that requirement is where to look.

**`credibility` is a truth problem, not a design problem, and the factory is right about it.**
Marram's credibility is capped by a mandatory `.invalid` domain and prototype disclosure, and
the reviewer marks it down for both — correctly. §2b's conclusion that this headroom needs
owner-supplied truth is supported by the corpus rather than contradicted by it.

## Two things the corpus found that the factory's harness would not have

Both are recorded in full in `marram/evidence/verdicts/README.md`.

1. **A measurement harness can silently score itself.** Three defects in the capture harness —
   an unbounded scroll loop that lost six of twenty-four renders, un-decoded AVIFs shipped as
   blank panels, and 390×8076 mobile ribbons that render body copy at two pixels once fitted —
   each cost the design marks it did not deserve, and one hid a real defect. The reviewer
   reported "empty beige placeholders" and "extremely small" metadata; both were true of the
   evidence and false of the site. `docs/VISUAL_EXCELLENCE.md` §9 already records a version of
   this lesson from the portability lane (*"a suite whose projects share one viewport has not
   tested the breakpoints"*) and from the anti-template diagnostic (*"a diagnostic whose
   failure mode is indistinguishable from the finding it exists to detect will report that
   finding forever"*). This is the same class of defect a third time, in the visual evidence
   pipeline, and it argues for a standing rule rather than a third one-off fix.

2. **A reviewer's defect is evidence; a reviewer's prescription is a hypothesis.** Twice on
   Marram, implementing the reviewer's stated direction — the mobile register is too long —
   made the score worse (7.4 → 6.8 → 7.0). The defect was real; the implied fix was wrong. The
   bounded rework loop in §7 currently routes findings to `art-direction`, `design-system` or
   `composition` as work to be done. It has no way to record that a prescription was tried and
   measured worse, so nothing stops the next round trying it again.

## What the corpus does *not* show

Stated because the value of this exercise depends on not overclaiming.

- **It does not show the factory can reach 8.5.** It shows the model can, unconstrained. Those
  are different claims, and the gap between them is exactly the integration work.
- **It does not isolate the vocabulary as the sole cause.** Ardwell & Roe had rich truth *and*
  a free hand. The empty cell above is what isolates it.
- **No prototype passed a factory gate.** Gates measure generated output. These were scored
  against the same criteria and thresholds by the same class of reviewer, which is a
  comparison, not a gate result.
- **Three prototypes is a small sample**, and all three were made by one lead with knowledge of
  what the reviewer had said about the previous one. That is a real source of correlation, and
  it is the reason `FINDINGS.md` states ideas rather than components.
