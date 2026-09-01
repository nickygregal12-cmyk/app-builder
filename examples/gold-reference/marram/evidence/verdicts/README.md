
## Harness changes, and why they were made

Three defects in the capture harness were found by reading its own output against the
rendered pages. All three had been costing the design marks it did not deserve, and one had
been hiding a real defect. They are recorded here because changing what a reviewer sees
between revisions is exactly the kind of thing that should never happen quietly.

1. **Unbounded scroll loop** (before v7). `scrollHeight` was re-read each iteration and lazy
   images add height as they load, so tall pages never converged. Six of twenty-four mobile
   renders were simply missing.
2. **`decode()` on hidden images, then a blanket 4s race** (v7–v12). A `loading="lazy"` image
   inside a `display:none` container never begins fetching, so its `decode()` never settles;
   the first fix hung the run, and the second fix let two 1920px AVIF plates through
   undecoded. The reviewer scored v12's imagery 7 and cited "empty beige panels" — correctly,
   on the evidence it was given. The harness now polls for `naturalWidth > 0` with a 20s
   budget and *names* anything still blank in `problems.json`.
3. **1:20 mobile ribbons** (through v12). A 390×8076 full-page capture renders body copy at
   two or three pixels once fitted into a viewing pane. The reviewer called mobile metadata
   and navigation "extremely small" in three consecutive revisions of pages whose type was
   getting larger each time. Tall captures are now cut into panels of at most four widths,
   with the full ribbon kept alongside so nothing is cropped out of the record.

None of these changed a single line of the site's own CSS or markup. The v13 scores are
therefore not comparable to v5–v12 on `responsive-quality` or `imagery-suitability`, and the
earlier numbers are kept above rather than restated.

## Result

Marram reaches the gate at **v18: mean 8.556, lowest criterion 8.0, verdict `pass`**
(threshold: mean ≥ 8.5, every criterion ≥ 6.5, independent reviewer, different vendor).

| rev | mean | floor | note |
|-----|------|-------|------|
| v3  | 8.54 | 7.4 | first strong state |
| v5  | 8.57 | 6.8 | two-column mobile register — worse |
| v6  | 8.44 | 7.0 | horizontal mobile rows — worse |
| v7  | 8.33 | 7.0 | reverted to single column; chaptering not yet added |
| v10 | 8.44 | 7.0 | chapters, stewardship ledger, header CTA |
| v12 | 8.11 | 7.0 | mobile recomposed; harness shipped two undecoded plates |
| v13 | 8.00 | 6.0 | mobile ribbons segmented → responsive 7→8; imagery hit by blank plates |
| v15 | 8.11 | 6.8 | stitched capture fixed the plates → imagery 6→9; stitch seam duplicated panels |
| v18 | **8.556** | **8.0** | seam fixed, `Offer` component, spacing trimmed — **pass** |

Two design changes did most of the work, and neither was a style change:

- **Chaptering the register** by how long each plant holds. Twelve identical tall cards read
  as catalogue inventory; three named passages read as a studio that specifies by season.
- **Recomposing rather than stacking on mobile.** Each chapter opens with its plate at full
  width and continues as records — plate left, identification right, evidence beneath. Two
  earlier attempts answered "this is a long scroll" by making everything smaller and scored
  6.8 and 7.0. The page got 28% shorter with nothing shrunk.

### A ceiling that is not a defect

The reviewer marks credibility down for the `.invalid` email domain and the footer's
prototype disclosure, and is right that both would cost trust on a live site. Both are
required here: the corpus rules forbid a fictional studio that could be mistaken for a real
one. The score is accepted rather than bought back by removing them.
