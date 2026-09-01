# Visual benchmark references

Five reference websites, recorded as **written analyses** rather than as copied
assets, used to anchor the top of the visual scale.

## Why this exists

Absolute scoring inflates. A reviewer looking at one competent site and asked for
a number out of ten has nothing to push against, and the number drifts upward —
which is how three prototypes with named, unfixed defects came back at 8.50, 8.56
and 8.71 against a bar of 8.5. Comparison is harder to inflate: *"is this stronger
than that, on typography?"* is a question with a wrong answer.

So a high-end verdict carries a pairwise comparison, and the aggregate becomes
`benchmarkGap`, which caps the overall score. A candidate whose benchmark gap is
`MATERIAL` or `LARGE` cannot be a 10.

## The question, and the question this must never become

**Never** *"does this look like Linear?"*

**Always** *"does this demonstrate a comparable level of authorship, craft,
hierarchy and product/design thinking, for its own problem?"*

The first question would teach the factory to produce Linear pastiches for
plumbers, and would mark down a restrained accountancy site for lacking Aman's
photography — photography an accountant has no reason to own. A candidate that is
stylistically nothing like its reference may legitimately be judged
`roughly-comparable`. A candidate that imitates the reference's style without its
substance should not be.

Two things keep this honest in code:

- `selectReference` in `tooling/lib/visual-benchmarks.mjs` picks on the shape of
  the **business problem**, not on visual similarity. A business no reference
  resembles is told so rather than given one.
- The dimensions compared are all decision-quality dimensions — authorship, craft,
  hierarchy, specificity — which a quiet site can win on.

## What is stored, and what deliberately is not

Stored: URL, date observed, quality class, a written analysis, the characteristics
that make it a reference, what it would score highly on, and — importantly — a
`notAModelFor` line saying who should *not* copy it.

Not stored: any proprietary source, markup, stylesheet, font or image. Putting
other people's design work in our git history to serve as our benchmark is a
licensing problem, and the written analysis carries the comparison anyway. The
comparison is about kinds of decision; the pixels would add risk and not evidence.

## Provenance, stated honestly

`observationBasis.kind` is `characterisation-from-prior-observation`. These
analyses were written from prior familiarity with the sites, **not** from a capture
session performed by this repository. They are good enough to anchor a comparison
about kinds of decision, and they are not a claim about what any of these sites
looked like on a specific date.

Every entry currently reads `confirmedByOwner: false`. A reviewer who needs the
current site should open the URL.

## The five, and what each anchors

| Reference | Anchors | Do not copy it for |
| --- | --- | --- |
| Kononenko | portfolio, editorial composition, imagery, architectural restraint | businesses with no photographable work |
| Linear | product storytelling, interface craft, SaaS sophistication | businesses with no software product |
| Aesop | commerce, editorial curation, restraint, large IA | small businesses with eight pages |
| AI in Design Report 2026 | data storytelling, editorial rhythm, dense information design | short marketing sites |
| Aman | luxury, imagery, atmosphere, premium restraint | any business without genuinely excellent photography |

The `notAModelFor` column is the one that prevents harm. Aman's language minus
Aman's imagery is the "minimal luxury slop" failure mode
(`examples/critic-calibration/fixtures/cc-21-luxury-slop.html`), and Linear's
language minus Linear's product is the "trade-business SaaSification" one
(`cc-23-trade-saasified.html`). Both are in the calibration corpus precisely
because borrowing a benchmark's style without its substance is the most likely way
this corpus could make the factory worse.
