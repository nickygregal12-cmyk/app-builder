# The corpus

Three hand-built websites for three invented companies, made to answer one question the
factory cannot answer about itself: **is the visual ceiling Claude, or is it the current
factory constraints?**

None of these was produced by App Builder. Every one is Astro 7.2.7 static output, which is
what the `astro-static-content` renderer emits, so no difference between a prototype and a
generated build can be attributed to the framework.

## The three

| | **Ardwell & Roe** | **Marram** | **Plumbline** |
|---|---|---|---|
| Sector | Architecture practice | Coastal planting studio | Database tooling (B2B SaaS) |
| Sells | Judgement, over months | A priced first visit | A trial, self-serve |
| Reader | A client choosing a collaborator | A homeowner who has lost two schemes | A staff engineer who has had the outage |
| Ground | Warm paper | Wet earth, near-black | Cold paper, light and dark |
| Type | Editorial serif + mono | Display serif + mono | Grotesque + mono, no serif |
| Imagery | Monochrome architectural photography | Hand-coloured botanical plates | **None.** Diagrams drawn from data |
| Signature | The frame, art-directed per viewport | The plant register | The plan, as live HTML |
| **Result** | **8.71 / 7.7** | **8.556 / 8.0** | **8.667 / 8.0** |
| Revisions to pass | 5 | 18 | 1 |

Gate: `config/agent-pipelines.json` `gates.visual` — mean ≥ 8.5 and every criterion ≥ 6.5,
scored by an independent reviewer from a different vendor with no sight of the implementation.

Those means are over nine criteria. Every factory verdict on record is over **eight**, because
`imagery-suitability` only applies to a build that publishes photographs. On the comparable
eight the prototypes are 8.663, 8.500 and 8.625 — all still passing, but `FACTORY-GAP.md`
makes the adjustment before drawing any conclusion, and so should anyone quoting these.

## Why these three and not three of anything

The set is chosen so that a shared silhouette would be visible. If three sites built by the
same model for three different businesses came out looking like each other, that is the
finding — and it is the finding the factory's own benchmark keeps producing. So the three
are pulled apart on every axis a reviewer can see:

- **What does the persuading.** Ardwell & Roe persuades with photographs. Marram cannot use
  photographs of gardens it has not grown, so it persuades with a register and a maintenance
  ledger. Plumbline persuades with the product's own output and uses no imagery at all.
- **What the reader is being asked for.** A conversation, a £450 commitment, and a
  self-serve trial are three different conversion problems, and each site is shaped by its
  own rather than by a common "CTA" pattern.
- **Where the difficulty is.** Prototype 1 tests whether a photographic editorial site can
  reach the bar. Prototype 2 tests a business whose conversion is load-bearing and whose
  imagery is not photographic. Prototype 3 tests the most templated category on the web,
  which is where the factory scores worst on distinctiveness.

## What is in each directory

```
<prototype>/
  BRIEF.md or BUSINESS.txt   the invented business, and the design problem it poses
  ASSETS.md                  every image, its licence, and where it came from
  src/                       the site
  evidence/<rev>/            rendered captures at 1920, 1440, 834 and 390
  evidence/verdicts/         every independent review, including the failing ones
  evidence/verdicts/README   the score history and what each change was answering
```

The failing verdicts are kept deliberately. A corpus that shows only the passing run is a
corpus that cannot be checked.

## Rendered evidence

Every capture is a real page rendered in Chromium at four viewports, not a mock-up. Tall
pages are cut into panels of at most four widths, with the full ribbon kept alongside —
a 390×8076 capture is unreadable once fitted to a viewing pane, and an independent reviewer
marked the same submission down for "extremely small" type three revisions running on pages
whose type was getting larger each time.

Three defects in the capture harness were found this way and are documented in
`marram/evidence/verdicts/README.md`. All three had been costing designs marks they did not
deserve; one was hiding a real defect. They are recorded because changing what a reviewer
sees between revisions must never happen quietly.

## Reading the results

The headline is not that three prototypes passed. It is the shape of the gap:

- Both sides were scored by the same class of independent reviewer against the same scale and
  the same thresholds — on eight criteria for the factory and nine here, adjusted above.
- The largest single gap is **distinctiveness**, which is the criterion that measures whether
  a site looks like it belongs to its business rather than to a component library. It is the
  criterion the factory's own record shows flat at 4.3–5.4 through every intervention tried.
- Nothing here needed a technology the factory lacks. Every one of these sites is static HTML
  and CSS generated from a data file at build time. What they had that a generated build does
  not is the ability to put new markup on the page for one business — which the existing
  bespoke lane deliberately forbids, for reasons that are good and are not about ambition.

That is what `FINDINGS.md` and `FACTORY-GAP.md` are about.
