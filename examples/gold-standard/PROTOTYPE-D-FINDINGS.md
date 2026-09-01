# Prototype D — The Monitoring Gap

Generation 2, site 4. Research, data and editorial. Large information architecture, no
photography, no colour-as-product.

Built to test one thing: **prototype C recovered composition-pacing from 8.0 to 9.0 by changing
the ground under each section. Was that the instrument, or was it C?** Narrow the instruments to
typography, measure, density and chapter pacing and see whether the score falls again.

**It fell, partly. composition-pacing = 8.5.**

---

## The experiment

| Prototype | Pacing instruments available | composition-pacing |
| --- | --- | --- |
| B — Interlock | vertical space only (monochrome, one ground) | **8.0** across six runs |
| D — The Monitoring Gap | measure, margin, density, typographic scale | **8.5** |
| C — Marlpit | all of the above, plus a change of ground per section | **9.0** across two runs |

Monotonic across three sites, in the predicted direction, on a criterion that resisted five
direct interventions on prototype B. That is the first result in this programme that behaves like
a measurement rather than an observation.

**What it does not establish.** Three points, one author, one reviewer, and the three sites differ
in far more than their pacing instruments. The ordering is consistent with the hypothesis and does
not isolate it.

---

## The result

Four runs, and the middle two are a regression rather than noise — see below.

| | v1 | v2 | v3 | v4 |
| --- | --- | --- | --- | --- |
| Mean | 9.038 | 8.731 | 8.731 | **8.923** |
| Floor | 8.5 | 8.0 | 8.0 | **8.0** |
| Tier | exceptional | strong-professional | strong-professional | **exceptional** |
| Gap | SMALL | MATERIAL | LARGE | **SMALL** |
| composition-pacing | 8.5 | 8.0 | 8.0 | **8.5** |

Final criterion scores (v4):

| Criterion | | Criterion | |
| --- | --- | --- | --- |
| art-direction | 9 | responsive-recomposition | **9.5** |
| business-specificity | **9.5** | brand-fit | 9 |
| information-architecture | 9 | commercial-clarity | **8** |
| visual-hierarchy | 8.5 | ai-slop-resistance | **9.5** |
| typography | 9 | memorability | 9 |
| composition-pacing | **8.5** | | |
| visual-material | 9 | interaction-craft | 8.5 |

Against the acceptance conditions carried forward: mean ≥9.0 **missed at 8.923**; floor ≥8.0 met;
art-direction ≥9 met; business-specificity ≥9 met; visual-material ≥9 met; responsive ≥8.5 met at
9.5; ai-slop ≥9 met at 9.5; holistic exceptional met; gap SMALL met. **Eight of ten.**

## The regression, and how it was caught

This is the most useful thing in the run and it is not a design finding.

After v1 the review asked, for the fourth prototype running, for a larger wide-screen canvas and
larger small text. The change made it worse: the mean fell 0.31, the tier dropped a whole step
and the benchmark gap widened. That is four times the run-to-run noise measured on prototypes B
and C, so it was investigated rather than attributed.

Two causes, one obvious and one not:

1. A `justify-content: start` left-aligned the whole document inside the widened sheet, putting
   roughly eight hundred pixels of nothing down the right-hand side of a 1920 screen. Visible
   immediately in a manual capture. Fixed in v3.
2. Fixing it changed nothing — v3 scored identically to v2 on all thirteen criteria. So the
   remaining cause was the widening itself: a 40rem measure with 20.5px body gives about fifty
   characters a line, not sixty-six, and the report's whole legibility rests on that measure.

**v4 reverted the tokens and kept the two genuine additions, and the score returned.** That is a
controlled step, not a guess, and it is the only reason this document can say the drop was a
regression rather than a bad sample.

**The lesson generalises past this prototype:** "the reviewer asked for a bigger canvas" is not a
change; it is a hypothesis, and a wider canvas can be implemented in ways that make every
criterion it was meant to help score worse.

## What the report is

**The Monitoring Gap 2026**, published by Stell, a fictional freshwater data unit. Storm overflows
are fitted with monitors; the counts are what everybody quotes; a monitor that is offline records
an absence rather than a zero. The report joins spill counts to monitor availability across twelve
catchments and sixty months.

Every figure is simulated and the front page says so.

### The generator, and the draft that failed its own control

Each catchment gets a latent discharge rate — the events that occur — and, drawn independently, a
coverage profile. Reported ≈ latent × coverage. The finding therefore emerges from observing a
process through an incomplete instrument rather than being asserted.

The first draft of the catchment table did not survive that claim. Every badly-monitored
catchment had also been given a high latent rate, correlating the two at **r = −0.87** — the
finding typed straight into the inputs. A probe script caught it before anything was built on it.
The control now runs on every build and is published on the method page: **r = −0.19** for
coverage against the underlying rate, against **r = +0.66** for coverage against the reported
figure.

### The 94,000-pixel page

The data chapter rendered all 720 rows and the capture measured the result: **94,256 pixels of
table on a phone**, roughly two minutes of scrolling. The fix is editorial rather than technical —
all rows ship for no-JS and find-in-page, and the script collapses to one catchment on load — but
it is worth recording that a comment in the source had already defended the original as
"pagination is an interface protecting itself." It was wrong, and the harness found it.

---

## Cross-prototype findings — four sites

### Supported by all four

1. **Compute the artefact from the model.** Floor-area register, network solver, chromatic
   transform, coverage simulation. All four scored ≥9.5 on business-specificity and in every case
   the reviewer named the computed artefact.
2. **A one-sentence thesis, held everywhere.** All four scored ≥9 on art-direction.
3. **Interaction states must be captured or the criterion is scored on nothing.** 0 → 6.5,
   13 → 9, 19 → 9.5, 12 → 8.5. The relationship holds, and D's lower count is a domain property:
   a report has fewer interactions than a catalogue, and pretending otherwise would have meant
   inventing some.
4. **Wide-width composition is a persistent blind spot of mine.** Flagged on all four, and on the
   fourth I made it worse trying to fix it.

### Newly supported

5. **Composition-pacing is instrument-limited.** Three points, monotonic. The strongest
   cross-prototype result so far and still not isolated.
6. **The harness finds defects manual review does not.** The 614px mobile page on B, the
   94,256px page here, the r = −0.87 control failure — all three were found by running a check,
   not by looking.

### Still unsafe to generalise

- **The house style.** Four sites: paper/serif restraint, drawing sheet, painted fields, report
  with a margin. Three of the four are monochrome-plus-one-accent, and D reverted to that palette
  after C broke it. I chose C's domain specifically to break the habit; a factory does not choose
  its briefs, and three of four is closer to a habit than four of four would have been reassuring.
- **Every prototype is hand-built by one author with unlimited iteration and a review loop.**
  Nothing has been produced under factory constraints. The gap between "a person can do this with
  six review rounds" and "the system can do this" remains the whole programme.
- **One reviewer, one vendor.** Every score in this programme comes from the same critic.

**Recommendation: do not integrate.** Prototype 5 (hospitality/luxury) is the last of the planned
sequence and the one that most directly tests the house-style question — it has photography and
atmosphere and no data, which is the furthest from D's register the programme has gone.
