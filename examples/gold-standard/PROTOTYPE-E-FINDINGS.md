# Prototype E — Hallowsand

Generation 2, site 5, and the last of the planned sequence. Hospitality and luxury, benchmark
class Aman. One house on a fictional tidal island off Northumberland, let by the week, where the
causeway floods twice a day and being cut off is the product.

Built to answer two questions the programme had left open.

**The house-style question.** Four sites in, three had settled on monochrome-plus-one-accent, and
the brief for this one is the category where that habit is most dangerous: the benchmark
reference file itself warns that *"Aman's language minus Aman's imagery is the 'minimal luxury
slop' fixture"*, and that fixture exists in this repository's calibration corpus as
`cc-21-luxury-slop.html`. Build the obvious version of this brief and you have built your own
test case.

**The pacing question.** Prototype C recovered composition-pacing from 8.0 to 9.0 by changing the
ground under each section; D narrowed the instruments and got 8.5. Did the score track the
*number* of pacing instruments, or one instrument in particular?

---

## The result

**Mean 9.038, floor 8.5, holistic tier exceptional, verdict pass, benchmark gap MATERIAL.**

Repeated twice more on the identical packet: 9.077, 9.077.

| | v1 | v2 | v3 | v4 | v4 ×2 more |
| --- | --- | --- | --- | --- | --- |
| Mean | 8.654 | 8.962 | 8.769 | **9.038** | 9.077, 9.077 |
| Floor | 6.5 | 8.0 | 8.0 | **8.5** | 8.5, 8.5 |
| Tier | strong-professional | exceptional | exceptional | **exceptional** | exceptional |
| Verdict | rework | pass | pass | **pass** | pass |
| Gap | MATERIAL | MATERIAL | MATERIAL | **MATERIAL** | MATERIAL |

Final criterion scores (v4):

| Criterion | | Criterion | |
| --- | --- | --- | --- |
| art-direction | 9 | visual-material | **9.5** |
| business-specificity | **9.5** | interaction-craft | 8.5 |
| information-architecture | 9 | responsive-recomposition | 9 |
| visual-hierarchy | 9 | brand-fit | 9 |
| typography | 9 | commercial-clarity | 9 |
| composition-pacing | **8.5** | ai-slop-resistance | **9.5** |
| memorability | 9 | | |

Against the acceptance conditions carried forward: mean ≥9.0 **met**; floor ≥8.0 met at 8.5;
art-direction ≥9 met; business-specificity ≥9 met at 9.5; visual-material ≥9 met at 9.5;
responsive ≥8.5 met at 9; ai-slop ≥9 met at 9.5; holistic exceptional met; gap SMALL or NONE
**missed at MATERIAL**. **Nine of ten**, and the best result in the programme.

The tenth is discussed below and is substantially not a judgement about this website.

---

## Run-to-run noise, measured properly for the first time

Three reviews of the **byte-identical packet**:

| | v4 | repeat 1 | repeat 2 | spread |
| --- | --- | --- | --- | --- |
| Mean | 9.038 | 9.077 | 9.077 | **0.038** |
| Criteria that moved | — | 2 | 3 | 0.5 each |

Nine of thirteen criteria were identical across all three runs. The four that moved
(information-architecture, visual-hierarchy, brand-fit, memorability) moved by exactly one
half-point step, never more.

This is the first properly controlled noise figure in the programme — earlier estimates came
from re-running *different* packets — and it is the number that makes the next section
interpretable.

## The v2 → v3 drop, and why it was a regression

Between v2 and v3 the mean fell 0.193 while the criterion I had set out to fix (commercial-clarity)
rose. That is the same shape as prototype D's regression, and at **five times the measured noise**
it was investigated rather than attributed to sampling.

It was real, and the reviewer named it: the new availability inventory on `/enquire` was a
seven-column table inside a horizontally scrolling container, which on a phone put **price and
status — the two columns somebody scanning availability is actually looking for — off the
right-hand edge**. A horizontally scrolling table is not responsive design; it is a desktop table
in a smaller box. Recomposing each row into a labelled block took responsive-recomposition from
8 back to 9 and carried four other criteria with it.

**The generalisable point:** adding a route to fix one criterion can lose more elsewhere than it
gains. The fix was correct and the implementation of it was not, and only a controlled noise
figure made those two separable.

---

## The experimental question, with four points now

| Prototype | Pacing instruments | composition-pacing |
| --- | --- | --- |
| B — Interlock | vertical space only | **8.0** |
| D — The Monitoring Gap | measure, margin, density, type | **8.5** |
| E — Hallowsand | all of D's, plus photography and a computed graphic at four densities | **8.5** |
| C — Marlpit | all of D's, plus **a change of ground per section** | **9.0** |

**The instrument-count hypothesis does not survive.** E has strictly more pacing instruments than
D — five photographs, a signature graphic object rendered at four densities, a full-bleed
comparison band, an inventory table — and scored identically to it. If pacing tracked the number
of instruments available, E should have sat between D and C. It did not move at all.

**What still discriminates across all four points is one instrument: whether the ground changes.**
C is the only site that changes the surface under the reader between sections, and C is the only
site that reached 9.0. E holds a single ground throughout — haar grey, with the ochre reserved as
a state rather than a surface — and landed exactly where D did.

The reviewer's own reasons are consistent with that reading without being told it. Across three
runs it gave the same two: *"wide layouts leave more inert space than productive tension"* and
*"the exceptionally long season, crossing and enquiry pages eventually become repetitive."* Both
are what a change of ground addresses and neither is what another chart addresses.

**What this does not establish.** Four points, one author, one reviewer, and the four sites differ
in far more than their pacing instruments. E's single ground was a deliberate art-direction
choice made for colour-system reasons, not an experimental control, so the comparison is
observational. It is now a sharper hypothesis than it was — *changing the ground* rather than
*having more instruments* — and it is still not isolated.

---

## The benchmark gap, and a demonstrated evaluator defect

The gap has been MATERIAL in all five reviews, and the reason is largely not about this website.

The site was compared against **Aesop**. Three of the six dimensions Aesop won were decided on
the size of its estate:

> "a much larger and more varied commercial estate" · "a much larger catalogue, editorial library
> and store network" · "a broader set of mature commerce behaviours"

Those are true statements about Aesop and they are not judgements about the quality of this
website's decisions. A one-property letting cannot close them by being better designed; it would
have to become a different business.

**Aman is in the corpus** and is explicitly `appropriateFor: "hospitality and destination
businesses"`. It scored **zero** and was never in contention. `benchmark-selection-probe.mjs`
demonstrates why:

```
selectReference scores each reference as   anchorHits * 2 + kindHit * 3
kindHit = reference.appropriateFor.some((entry) => entry.includes(candidateBusinessKind))
```

The containment runs the wrong way. A reference describes a category broadly — "hospitality and
destination businesses" — and a candidate describes itself specifically — "hospitality lettings
and places to stay". The longer, more specific string is being looked for inside the shorter,
more general one, so the term can only fire when the declared kind happens to be a literal
substring of a reference phrase. The probe's output:

```
"hospitality lettings and places to stay"      MATCHES NOTHING
"research, reports and data-led publications"  matches vb-ai-in-design-report
"electrical infrastructure"                    MATCHES NOTHING
"paint and pigment manufacture"                MATCHES NOTHING
"hospitality"                                  matches vb-aman
```

The term weighted highest (3, against 2 for an anchor) is the term that almost never fires, so
selection collapses onto anchor keywords. Three of the four earlier prototypes in this programme
declared business kinds that also score zero on it, so this has been silently active throughout.

Testing containment in both directions selects `vb-aman` at score 3 over `vb-aesop` at 2.

**The evaluator has not been changed.** The instruction is that it stays frozen unless a defect is
demonstrated, *and* that it must not be altered because a prototype scored lower than hoped. Both
apply here simultaneously, and the second is why this ships as a probe that prints evidence
rather than as a patch: a fix authored by the site being measured, which would move that site's
own benchmark comparison, is precisely the change an owner should have the chance to refuse.
The finding is recorded; the decision is not mine.

**What that leaves.** Even against the right reference the gap would probably not be NONE, and
the two reasons the reviewer gave that are *not* about scope — attenuated wide layouts and
repetition across long pages — are the same two that hold composition-pacing at 8.5. Those are
real and they are this site's.

---

## The anti-slop position, and what it cost

`ai-slop-resistance` scored 9.5 in every one of the five reviews — the most stable criterion in
the run. Three deliberate refusals, each with a price:

1. **The hero is a chart, not a photograph.** The front page opens on a fortnight of computed day
   ribbons in which the fifty-minute tidal drift appears as a diagonal running down the page.
   Cost: no atmospheric opening image, in a category where that is the convention.
2. **The display face is not a serif.** Instrument Sans sets the headlines. A high-contrast
   display serif at 88px is the loudest signal of the luxury-letting category. Cost: less
   immediate "expensive" affect.
3. **No interior photography at all.** The house page is a surveyor's list — measurements,
   orientation, and which rooms can see the road. Cost: the thing most visitors want to see.

And the ground is haar, the cold grey-green sea fog of that coast, rather than the warm beige the
category shares. It is less appetising and it is the colour of the actual weather.

**The signature is the day ribbon**, and it is the strongest object the programme has produced:
one horizontal bar per day, ochre where the water is over the road, drawn from the tidal model at
four densities — a day, a week, a fortnight, and the whole 210-day season as a wall. The reviewer
named it unprompted as the site's describable signature. It cannot be lifted onto another
property, because its shape is a function of that property's tide and almost no property has one.

**Colour is a system, not a palette.** The ochre means exactly one thing everywhere: water over
the road. It is never on links, buttons, headings or hover. That is worth stating plainly for the
house-style question: **four of five prototypes are now monochrome-plus-one-accent.** The habit is
not broken. What is different here is that the accent is not an accent — it is a state — and that
is a smaller claim than "we varied the palette".

---

## What the harness caught that reading the code did not

Six defects, all found by running something rather than by looking at source.

1. **The tidal physics were inverted.** The first `tide.ts` put the causeway limit *below* mean sea
   level, which produces a model where a bigger tidal range keeps the crossing open *longer* —
   the opposite of every tidal causeway there is. A road sits high in the tidal frame. Caught by
   the probe as a backwards spring–neap cycle before anything was built on it.
2. **The day-clipped bar list corrupted four separate statistics.** `Day.bars` is cut at midnight,
   which is right for drawing a day and wrong for counting anything. It broke the shut-hours
   total, the longest closure, the mean crossing length and the spring-versus-neap comparison —
   each in a different direction, and one of them **printed the headline backwards** (neap weeks
   appearing to have *shorter* crossings, because two of every three neap bars are a midnight
   fragment). Patching each occurrence is how the fourth one happened; it was fixed by renaming
   the field to `bars`, documenting it as draw-only, and building one season-wide list of whole
   crossings that every statistic reads from.
3. **The ribbon rendered as a 6.5rem smudge wherever it had no labels** — the entire weeks list,
   the three front-page cards, the single-day ribbon. Invisible in the markup, instant in a
   capture: with no label element there was no cell to fill the label column.
4. **The same bug again, differently.** At mobile width the season scale hid its labels with
   `display: none`, which removes the grid item just as effectively, putting **1,260 pixels of
   blank page** in the middle of the crossing route and collapsing the hour axis into the string
   "2000". The reviewer found it and scored responsive-recomposition 6.5. Fixed structurally by
   placing the bar in the last column explicitly, so nothing the label does can displace it.
5. **The live status line overstated the flood by forty times.** "3.43m over the road" was the
   tide *height*; the road floods at 3.35m, so the water was eight centimetres deep.
6. **Fourteen of fifteen interaction states were silently dropped from the review packet**
   because the manifest was written with a `what` key where the reader expects `state`. No error,
   no warning — the reviewer would have scored interaction-craft on one screenshot and been right
   to mark it down.

**And three claims written before they were measured, all of which had to come down.** The
spring–neap difference was drafted as "fourteen and a half hours a day against shut for over
ten"; the model says 9h45 against 10h08. Then "a full hour off each crossing"; it is 34 minutes
across a week and 53 at the extremes. The pricing discount followed the claim down from 12% to
8%, because pricing a difference larger than the one you are selling turns an honest trade into a
gimmick. **The temptation each time was to raise `S2_AMP` until the sentence became true.** The
constituent ratio is about a third, which is what that coast actually has; changing it to make
marketing copy work would be writing the conclusion into the inputs — the exact mistake prototype
D made and caught. None of the three claims reached a page.

---

## Cross-prototype findings — five sites

### Supported by all five

1. **Compute the artefact from the model.** Floor-area register, network solver, chromatic
   transform, coverage simulation, tidal model. All five scored ≥9.5 on business-specificity, and
   in every case the reviewer named the computed artefact.
2. **A one-sentence thesis, held everywhere.** All five scored ≥9 on art-direction.
3. **Interaction states must be captured or the criterion is scored on nothing.** 0 → 6.5,
   13 → 9, 19 → 9.5, 12 → 8.5, 18 → 8.5. The relationship holds at the bottom and saturates at
   the top: past a dozen states the reviewer stops asking for more states and starts asking for
   *motion*, which a screenshot cannot carry. Every run of this prototype capped
   interaction-craft with some form of "the evidence is static, so transition quality cannot be
   judged." **That is a ceiling on the harness, not on the site**, and it is the clearest
   candidate for the next piece of tooling: capture video, or stop scoring what cannot be seen.
4. **Wide-width composition is a persistent blind spot of mine.** Flagged on all five. Two
   separate passes at it here — centring prose blocks rather than widening the measure, and
   adding a full-width comparison band — improved it and did not close it.

### Newly supported

5. **Composition-pacing tracks one instrument, not the count.** Four points; the instrument is a
   change of ground. Sharper than the prototype-D formulation and still observational.
6. **Run-to-run noise is 0.038 on an identical packet**, with four criteria capable of moving a
   half-step. Anything above ~0.1 is a regression to be investigated, not a sample.
7. **The benchmark-gap metric penalises small-scope businesses structurally**, and separately,
   reference selection has a demonstrated substring-direction defect that has been active across
   the whole programme.

### Still unsafe to generalise

- **The house style.** Five sites: paper/serif restraint, drawing sheet, painted fields, report
  with a margin, tide table. Four of five are monochrome-plus-one-accent. The one that broke the
  habit is also the only one that reached 9.0 on composition-pacing, which is either a real
  relationship or the same site being good twice, and five points cannot tell those apart.
- **Every prototype is hand-built by one author with unlimited iteration and a review loop.**
  This one took five review rounds. Nothing has been produced under factory constraints, and the
  gap between "a person can do this with five rounds" and "the system can do this" remains the
  whole programme.
- **One reviewer, one vendor.** Every score in this programme comes from the same critic. The
  noise figure above measures that critic's self-consistency, which is not the same as accuracy,
  and no blinded human adjudication has been run.

**Recommendation: do not integrate.** The planned sequence is complete. What the five sites now
support is a set of hypotheses about *how* to build well, not a demonstration that the factory
can. The two things worth doing before any integration are the ones the programme has exposed
rather than assumed: capture motion so interaction-craft stops being scored on stills, and put
the benchmark-selection defect in front of the owner.
