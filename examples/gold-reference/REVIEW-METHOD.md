# How every score in this corpus was produced

## The rubric

`review-criteria.json` — the nine criteria from `tooling/lib/visual-candidates.mjs:82-92`,
verbatim, with the same `appliesTo` scoping the factory uses. It is committed here so that
every verdict in this corpus can be reproduced rather than taken on trust.

## The reviewer

Codex (OpenAI), invoked per prototype as:

```
codex exec --skip-git-repo-check --sandbox read-only -i <rendered images…>
```

with the criteria and the business brief on stdin. This satisfies the independence rule the
factory enforces in `assertIndependentReview` (`visual-candidates.mjs:291-312`), which
compares *vendor* rather than label: the prototypes were built by an Anthropic model and
reviewed by an OpenAI one.

The reviewer is given the business brief and the rendered pages. It is given no access to the
implementation, no statement of design intent, and no previous verdict — so it cannot be
anchored by what a previous round said or by what the work was trying to do.

## What it was given

Rendered captures only. Real pages in Chromium at 1920, 1440, 834 and 390, captured by
scroll-and-stitch, with tall pages cut into panels of at most four widths. Never a mock-up,
never a design file, and never a description of a page in place of the page.

## A scoping note that affects the numbers

`imagery-suitability` carries `appliesTo: "imagery"`, and the factory applies it only to
builds that publish photographs. **This corpus scored all three prototypes on all nine
criteria, including Plumbline, which publishes no photographs at all.** That was not the
factory's rule applied correctly; it was the whole rubric handed to the reviewer each time.

The effect is disclosed rather than corrected after the fact, because re-scoring to remove a
criterion the reviewer had already seen would not produce the score it would have given
without it. `FACTORY-GAP.md` recomputes the means over the eight criteria the factory is
scored on before making any comparison, and all three still pass.

## What is kept

Every verdict, including the failures. `marram/evidence/verdicts/` holds five, of which two
are `rework`. A corpus that keeps only its passing runs cannot be checked, and the failures
are where the two most useful findings came from.
