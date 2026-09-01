# Integration plan

Ranked by what each item would settle, not by how much of it there is. Every item names the
evidence it rests on and what would falsify it.

## Classification

Findings are classified by *why* the factory does not already do the thing, because that
determines who fixes it and how much it costs:

| | class | meaning |
|---|---|---|
| **A** | Already specified and implemented | No gap. Do not re-build it. |
| **B** | Specified, not implemented | The contract exists in `docs/`; nothing consumes it. |
| **C** | Implemented, not reachable | The code exists; nothing routes to it. |
| **D** | Architectural constraint | Needs the component vocabulary to change. |
| **E** | Needs owner-supplied truth | No visual intervention can pay it. |
| **F** | Measurement defect | The harness is scoring itself. |
| **G** | Rejected | The corpus says do not do this. |

---

## 0 · Reconcile the recorded best score — **class F, ten minutes**

`config/factory-status.json` records `bestMean: 6.55, bestCriterionFloor: 4.8` for the visual
gate. `docs/PHASE_4D_VISUAL_DEBT.md:157` records **6.70 / 4.7** from the later §2b round, and
`docs/ROADMAP.md:176` also still carries 6.55. `PHASE_4D_VISUAL_DEBT.md:7-8` declares the
status file authoritative on disagreement, so the authoritative record is currently the stale
one.

Neither number changes any conclusion — both are far short of 8.5 — which is exactly why this
is worth ten minutes now rather than an argument later. The §2b round also has no committed
verdict JSON; v1–v4 and the static-renderer review do. Committing the §2b verdicts would make
the number checkable rather than quoted.

---

## 1 · Run the factory against the Ardwell & Roe intake — **decision-blocking; unclassifiable until run**

**Do this before anything else in this document.**

Every factory score on record is against nbm or MGB Decor, and nbm's approved intake carries
one Companies House description, an empty `trustSignals` array and no client-facing
proposition. So every recorded score confounds "the vocabulary is fixed" with "the truth is
thin", and `docs/PHASE_4D_VISUAL_DEBT.md` §2b says so explicitly.

`examples/visual-excellence/` already holds the Ardwell & Roe approved intake bundle, asset
plan and knowledge pack — 17 facts, 6 projects, 5 testimonials. Nothing needs to be authored.
Generate, render, and score with an independent critic against the unchanged gate.

**What it settles.** The empty cell in `FACTORY-GAP.md`. If the score sits near 6.7, §3's
finding is proven and the whole budget belongs on the vocabulary. If it rises materially,
intake is doing more damage than assumed and the questionnaire is the leverage.

**Cost.** One generation round plus one review. No new architecture.

**Falsified by.** A score materially above 6.7 that the reviewer attributes to composition
rather than to content richness.

**Which renderer.** Run it on `astro-static-content`, not the React template.
`config/renderers.json` gives marketing sites both, these prototypes are Astro static output,
and the static renderer's only independent review — 5.38 mean, 2.0 floor — carried the default
shell because no direction has ever been promoted to it. Running the React one instead answers
a question nobody asked.

---

## 2 · Ask what the business hands its customer — **class D, with a B component**

`FINDINGS.md` F1. In all three prototypes the signature is the artefact the business actually
produces, shown at full size: a photographic frame, a plant register, a migration plan.
Distinctiveness 8.8 / 9 / 9 against a factory number that has been flat at 4.3–5.4 through
every intervention tried so far.

Two parts, and the order matters:

- **B (cheap, do first).** A derivation stage that asks of the approved knowledge: *what does
  this business hand its customer, and is there enough structured data to show one at full
  size?* Ardwell & Roe's pack answers "a project, and there are six of them". This is a
  question about data the intake already carries, and nothing currently asks it.
- **D (expensive, gated on 1).** Something for the composition layer to render when the answer
  is yes, which by definition is not a card grid.

  **The existing bespoke-presentation lane cannot deliver this, and it is important not to
  assume it can.** §4's lane is deliberately CSS-only —
  `docs/VISUAL_EXCELLENCE.md:458`: *"It is a stylesheet and nothing else… a presentation
  needing new markup would need new bindings, and new bindings move the composition — so
  CSS-only is what makes 'preserves PageSpec, SectionSpec and content provenance' true by
  construction."* Its ChangeSet owns only `src/presentation/bespoke/`, and
  `registryPromotion.eligible` is hard-coded `false`.

  Every signature in this corpus needs new markup and new bindings. A plant register is a
  twelve-item collection with a latin name, a common name, a role, a tolerance and a
  twelve-cell season table per item; a plan is six statements with a verdict, a lock figure
  and a check id. No stylesheet over the existing seventeen section types produces either.
  So this is a **composition and binding** change, not a styling one — which is precisely
  what `docs/PHASE_4D_VISUAL_DEBT.md` §6 already scopes as the revival work: *"Art direction
  / DesignSystemSpec can select component implementations or component families, not merely
  token values and section presentations."*

  §6 proposes starting with the CTA block, the button and a per-direction display typeface,
  because those are what the critic named in all four of its reviews. The corpus suggests
  that ordering is too conservative to move `distinctiveness`: swapping a pill button for a
  square one leaves the page made of the same things. The evidence here points at the
  **collection primitive** — the one grammar every one of the seventeen section types
  ultimately renders — as the axis that would have changed these scores.

**Do not start with a component.** A new block type without the derivation stage produces a
differently-shaped generic section, which is the failure mode §3 already documents. And note
§11's constraint, which is correct and should hold: a one-off bespoke presentation is not
promoted to the registry on first use. Three prototypes made by one lead is not repeated
evidence for promoting anything.

**Falsified by.** A build that derives a signature artefact, renders it through a widened
collection primitive, and still scores under 6 on distinctiveness.

---

## 3 · Find out whether `ResponsiveCompositionPlan` reaches a renderer — **class B or C**

`docs/VISUAL_EXCELLENCE.md` §3 already specifies exactly the right thing: "alternate
order/grouping of section content", "different image crops/focal framing", "section variants
that deliberately differ by viewport", "mobile-specific CTA placement". The specification is
not the gap.

The same section states the requirement that decides this: *"Every executable responsive
declaration must have a renderer/selector consumer and rendered evidence."* Audit against that
requirement and classify each declared capability as A, B or C. The corpus evidence (F3) says
the payoff is real and that it is *recomposition* specifically — Marram's mobile register
scored 6.8 as two columns, 7.0 as uniform rows, and 8.0 recomposed with a lead plate per
chapter, same page and same reviewer.

**Note for the gate.** Horizontal overflow was zero in all three of those attempts. A
responsive check that asks "does it overflow" cannot see this difference at all; the small
viewport has to be *scored as a composition*.

**One value is already known and it is the whole finding in miniature.**
`MOBILE_SECTION_ORDER` in `tooling/lib/visual-direction.mjs:181` admits exactly two values:
`as-desktop` and `conversion-first`. Neither is a recomposition. A direction cannot express
"open each group with one item at full width and continue as records" because the axis has no
value for it — so §3's specified capability *"alternate order/grouping of section content"* is
class **B** at least here: specified in the document, and not expressible in the enum that
implements it.

**Falsified by.** An audit finding every declaration already consumed, in which case the gap
is in the generator's willingness to declare rather than in the renderer.

---

## 4 · Make the evidence pipeline prove it is not scoring itself — **class F**

Three harness defects in this corpus each cost designs marks they did not deserve, and one hid
a real defect: renders silently missing, images shipped undecoded as blank panels, and mobile
ribbons at an aspect ratio that makes body copy unreadable when fitted. In every case the
reviewer's report was accurate about the evidence and wrong about the site.

This is the third instance of the same class in this repository. §9 records the portability
lane's version — *"a suite whose projects share one viewport has not tested the breakpoints"* —
and the anti-template diagnostic's — *"a diagnostic whose failure mode is indistinguishable
from the finding it exists to detect will report that finding forever"*. Two one-off fixes and
a third arriving argues for a standing rule.

Concretely, before evidence may be submitted to a critic:

- assert the expected artefact count, and fail loudly on a short set rather than submitting it;
- assert every laid-out image has decoded, and name any that has not;
- assert no capture exceeds a legible aspect ratio without being panelled;
- record the harness version on the verdict, so scores from different harnesses are not
  compared.

The last one is what would have caught all three here: `marram/evidence/verdicts/README.md`
has to state in prose that v13–v18 are not comparable to v5–v12 on two criteria, because
nothing in the data records that the instrument changed.

**Cost.** Small, mechanical, and entirely inside the existing evidence lane.

---

## 5 · Separate a reviewer's defect from a reviewer's prescription — **class B**

§7's rework loop routes findings to `art-direction`, `design-system` or `composition` as work
to be done. Twice on Marram, doing what the reviewer asked made the score worse — the defect
("the mobile register is a long monotonous scroll") was real every time, and the implied fix
("make it denser") was wrong every time, at 6.8 and 7.0 against a 7.4 baseline.

The change is small: a rework ChangeSet should carry the defect it answers and the score
movement it produced, and a prescription measured worse should be recorded as tried. Without
it there is nothing to stop the next round proposing the same thing, which is what happened
here twice.

This strengthens rather than relaxes the independence requirement in §7, which the corpus
supports strongly: four times the reviewer caught something invisible to the person who made
it.

---

## 6 · Make "no suitable imagery" a route rather than a failure — **class D**

`FINDINGS.md` F6. Plumbline scores 9 on imagery-suitability while owning no asset of any kind
— no photograph, no illustration, no icon set, no web font. Every figure is drawn in HTML and
CSS from its own data file. Marram uses no photographs of gardens it cannot prove it grew.

Both refusals came from the business rather than from asset scarcity, and both produced a
stronger site than the photographic version would have. The `ImagePlan` in §5 maps each
section to the image job it needs; there is no job type for "this section is better served by
a figure drawn from the business's own structured data", and the composition layer has nothing
to render if there were.

Ranked below the items above because it is the largest gap between how easy it is to state and
how much it would change — and because item 1 may reorder everything under it.

---

## 7 · Carry the business's manner of speaking as a constrained input — **class B/E**

`FINDINGS.md` F5. "A garden that needs a hose in August was planted wrong in March." "Eight.
Not eighty." Brand-fit is 9.0 / 9 / 9 across the corpus, and the reviewer attributes it
repeatedly to the writing.

Not a tone slider. Two or three sentences the business would actually say, carried on the
intake as user-provided truth, from which the generator takes register. This is partly **E** —
it is the owner's voice and cannot be invented without inventing business claims, which is the
same wall §2b hits on nbm's `trustSignals`.

Related: the visual gate cannot currently fail a build for copy. Whether it should is a real
question and this corpus does not settle it.

---

## Rejected — **class G**

Recorded so they are not proposed again. Each is a thing that looks like an obvious
improvement and that the corpus measured as worthless or harmful.

- **Motion.** One 320ms opacity fade across three sites, disabled under
  `prefers-reduced-motion`. Nothing was ever marked down for lacking movement, and
  distinctive-moment scored 8.3–9 without any. §3's `MotionContract` is right to frame motion
  as restraint rather than as a feature list; the corpus supports that framing and supplies no
  evidence for building more of it.
- **Novel layout mechanics.** All three prototypes use a plain twelve-column grid. Nothing
  needed subgrid, scroll-driven animation or a bespoke layout engine.
- **More information per screen.** Three measured attempts, all worse. Every time "this page is
  long" was answered with "make it smaller", the score fell.
- **A bigger component library, as the first move.** This is the one worth stating plainly. The
  corpus was built to test whether the constraint is the vocabulary, and it supports that
  reading — but the fix that follows is *the ability to build the thing this business needs*,
  not more prebuilt things. §4's bespoke lane plus §11's evidence-driven promotion is already
  the correct shape: build it once for one business, promote only on repeated evidence. Three
  prototypes, made by one lead, is not repeated evidence for anything.
