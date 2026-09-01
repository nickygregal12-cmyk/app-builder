# Factory gap analysis

What the corpus shows about App Builder, tied to rendered evidence rather than to opinion.

Every score below was produced by an independent reviewer from a different vendor against the
criteria in `tooling/lib/visual-candidates.mjs:82-92` and the gate in
`config/agent-pipelines.json` `gates.visual` — `minimumScore` 8.5, `minimumCriterionScore` 6.5.
Both sides were scored on the same scale. **They were not scored on the same number of
criteria**, and the section below adjusts for that before drawing any conclusion.

| | mean | floor | distinctiveness | source |
|---|---|---|---|---|
| Factory, best recorded (`nbm editorial-authority`) | 6.70 | 4.7 | 5.4 | `docs/PHASE_4D_VISUAL_DEBT.md` §2b |
| Factory, `nbm structured-practice` | 6.58 | 4.2 | 4.8 | same |
| Factory, `nbm service-forward` | 6.10 | 4.6 | 4.8 | same |
| Factory, **static renderer** (`astro-static-content`) | **5.38** | **2.0** | **3.0** | `examples/genuine-business/nbm-static-renderer-review.v1.verdicts.json` |
| Factory, **rich truth** (`Ardwell & Roe`, `schedule-register`) | **6.64** | **5.8** | **6.1** | run in #254/#256; see the experiment section below |
| **Ardwell & Roe** (prototype) | 8.711 | 7.7 | 8.8 | `ardwell-roe/evidence/verdicts/v5.json` |
| **Marram** (prototype) | 8.556 | 8.0 | 9 | `marram/evidence/verdicts/v18.json` |
| **Plumbline** (prototype) | 8.667 | 8.0 | 9 | `plumbline/evidence/verdicts/v6.json` |

### Two adjustments before these rows may be compared

**The criterion sets differ, and the difference favours the prototypes.**
`reviewCriteriaFor` in `tooling/lib/visual-candidates.mjs:95-104` applies
`imagery-suitability` only when the build publishes photographs, so every factory verdict on
record is a mean over **eight** criteria. The prototypes were scored over **nine**, and
imagery-suitability was their highest or near-highest criterion (9.1 / 9 / 9). Recomputing the
prototype means over the same eight criteria the factory was scored on:

| | 9-criterion mean (as reviewed) | **8-criterion mean (comparable)** | floor |
|---|---|---|---|
| Ardwell & Roe | 8.711 | **8.663** | 7.7 |
| Marram | 8.556 | **8.500** | 8.0 |
| Plumbline | 8.667 | **8.625** | 8.0 |

All three still clear 8.5 and the 6.5 floor on the comparable basis, so the conclusion holds —
but Marram clears it by exactly nothing, and the unadjusted figures should not be quoted
against factory numbers without this correction.

**The right comparator is the static renderer, not the React one.** These prototypes are
Astro 7.2.7 static output, which is what `astro-static-content` emits. The factory's own static
renderer was independently reviewed at **5.38 mean, 2.0 floor, distinctiveness 3.0** — a
3.2-point gap on the comparable basis rather than 1.9. That row carries a caveat the
documentation is careful about and so should this: it was rendering the default shell, because
no visual direction has ever been promoted to the static renderer
(`docs/PHASE_4D_VISUAL_DEBT.md` §4). It is a floor, not a like-for-like build.

### The record, reconciled

`config/factory-status.json` recorded `bestMean: 6.55, bestCriterionFloor: 4.8` — the v4
`schedule-register` result — while `docs/PHASE_4D_VISUAL_DEBT.md` recorded 6.70 / 4.7 from the
later §2b round and `docs/ROADMAP.md` also carried 6.55. Since the status file is the
authoritative record on disagreement, the authoritative number was the stale one.

Both are corrected here, and the rich-truth round is now recorded in
`docs/PHASE_4D_VISUAL_DEBT.md` §2c with its verdicts committed at
`examples/visual-excellence/ardwell-roe-visual-review.v1.verdicts.json`, so every number this
document quotes is checkable rather than quoted.

## The question the corpus was built to answer

> Is the visual ceiling Claude, or is it the current factory constraints?

**It is the constraints.** The same model, given the same business truth and a free hand,
clears a gate the factory has missed in all seven recorded rounds — and clears it in three
different sectors, twice on the first or near-first attempt.

This is the evidence the deferral asked for. `config/factory-status.json` defers stage 4D with
the reason *"Measured and failed; one business is insufficient to generalise the fixed
component-vocabulary hypothesis"*, and revives on, among other conditions, *"materially new
evidence appears"*. Three materially different businesses, independently reviewed, is that.

It is **not** the other revival condition in the same field — *"several materially different
projects show a cross-project ceiling"* — because that one asks for factory builds and this
corpus contains none. The distinction matters and is the reason item 1 below is a generation
run rather than another prototype.

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

## The experiment that had not been run — now run, in #254 and #256

This section previously said the decisive cell was empty and had to be filled before anything
else in `INTEGRATION-PLAN.md`. It has been filled. The prediction it made was well-formed and
the answer is unambiguous.

| | thin truth (nbm) | rich truth (Ardwell & Roe) |
|---|---|---|
| **factory vocabulary** | 6.70 / 4.7, distinctiveness 5.4 | **6.64 / 5.8, distinctiveness 6.1** |
| **free hand** | not built | 8.711 / 7.7, distinctiveness 8.8 |

The factory scores **the same on rich truth as on thin truth**, within the noise of the
instrument. That is the first branch of the prediction this section wrote, so the conclusion it
committed to in advance is the one that holds: *thin intake was not doing the damage, and the
budget belongs on what the factory does with truth rather than on getting more of it.*

**The route to that number matters as much as the number.** The rich run did not start near
6.7 and it did not arrive there by better styling:

| run | best mean | what changed |
|---|---|---|
| rich truth, no imagery | 5.82 | the asset bytes had never been produced |
| rich truth, imagery ingested | 4.81 | *worse* — seven latent defects, including a build that published no `<img>` at all |
| after those seven fixes | 5.57 | imagery-suitability 0 → 7.0 |
| after the information-architecture correction | 6.41 | 31 sections → 26, 12,207px → 6,898px |
| after section-order adaptation (#256) | **6.64** | imagery-suitability 3.5 → 7.1 on the direction that had buried the work |

Two findings fall out of that sequence, and neither was visible before the cell was filled.

**Rich truth made the site worse before it made it better.** A thin business hides a
composition that cannot edit; a rich one exposes it. The factory composed every section it
could and every item in each — 31 sections over 9,217px — and the reviewer's language changed
from "sparse" to "reduce the copy density", "excessive empty space", "effectively duplicate
pages". The constraint the corpus was built to isolate is real, but it is not only the
component vocabulary: **it is also that the factory has no information architecture.** It knows
what a business has and not what a *page* is for.

**Seven of the defects were invisible without imagery.** Asset sources that could not be
registered once bytes existed; a wide-crop test that read only optimiser variants; ingested
assets that declared no file, so `materializeAssets` copied nothing; no path for bytes to reach
a replayed bundle; role-blind placement that opened the page with the wordmark and put the
founders' portraits under "Recent work"; nine-field records rendered whole; a token declared
twice that broke the hero scrim. Every one is in `#254`. The prototypes could not have found
them, because a hand-built site never exercises that path — which is an argument for keeping
both corpora rather than either.

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
- **It does not isolate the vocabulary as the sole cause**, and running the factory on the same
  rich truth showed why: the factory reached 6.64 there, level with its 6.70 on thin truth, and
  the largest single gain in that run came from an information-architecture correction rather
  than from any component. Vocabulary is a constraint; composition is at least as large a one.
- **It did not predict the seven imagery defects.** A hand-built site never exercises asset
  ingestion, materialisation or role-aware placement, so the corpus could not have found them
  and did not. That is an argument for keeping both corpora rather than choosing between them.
- **No prototype passed a factory gate.** Gates measure generated output. These were scored
  against the same criteria and thresholds by the same class of reviewer, which is a
  comparison, not a gate result.
- **Three prototypes is a small sample**, and all three were made by one lead with knowledge of
  what the reviewer had said about the previous one. That is a real source of correlation, and
  it is the reason `FINDINGS.md` states ideas rather than components.
