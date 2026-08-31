# Visual review rubric v1

One rubric, used by a human panel and by a model Critic, so their answers can be
compared at all. The criteria are not invented here: they are
`VISUAL_REVIEW_CRITERIA` in `tooling/lib/visual-candidates.mjs`, and the bar is
`gates.visual` in `config/agent-pipelines.json`.

**The bar.** Mean ≥ **8.5** across every criterion the artifact is scored on, and
**no single criterion below 6.5**. Both, because a strong average must not hide
one badly failing criterion.

**Do not move the bar after seeing the scores.** The factory's best independent
result to date is a mean of 6.55 with a floor of 4.8. That gap is the finding.
Lowering the threshold to make it look smaller would delete the only honest
measurement anybody has.

## Scoring anchors

Scores are on 0–10. Use the whole range; a rubric where everything lands between
6 and 8 has stopped distinguishing anything.

| Score | Meaning |
| --- | --- |
| 9–10 | Would stand next to the best work in this sector. A reader would assume a studio made it. |
| 8–8.9 | Professional and considered. Clears the bar. Nothing a paying client would send back. |
| 6.5–7.9 | Competent. Nothing wrong, nothing chosen. Below the bar. |
| 4–6.4 | Noticeably weak on this criterion. A client would comment on it unprompted. |
| 2–3.9 | Actively damaging to the business's case. |
| 0–1.9 | Broken or absent. |

## Criteria

Each is scored only where it applies — an internal tool is not judged on
conversion clarity, and a build with no photographs is not judged on whether its
photographs suit the business.

**brand-fit** — Does this read as *this* business, given the accent and
typographic voice its own material showed? Not "is it attractive": is it the
right attractive for a structural engineer, a bakery, a solicitor.

**visual-hierarchy** — On each page, does the eye reach the most important thing
first? A page where every element carries equal weight scores low even when
every element is well made.

**coherence** — Do the opening, the grid, the rhythm and the motion read as one
decision rather than several? Three good button styles are worse than one.

**distinctiveness** *(public sites)* — A considered site for this business, or a
template with its colours changed? The question that separates 7 from 9, and the
one the factory has consistently scored lowest on.

**credibility** *(public)* — Would the intended customer trust this business more
after seeing it than before? Includes whether the claims could be true.
Unsubstantiated superlatives, invented statistics and anonymous testimonials
lower this score however handsome the page.

**conversion-clarity** *(public)* — Is the next action obvious at every point a
visitor might be ready to take it? A site with no contact route, no price and no
stated service fails this regardless of composition. **This is the criterion a
polished, empty site is most likely to be over-scored on.**

**imagery-suitability** *(where imagery is published)* — Do the photographs suit
the business, and are they framed well at every width?

**responsive-quality** — Is the mobile rendering a designed composition, or the
desktop one with fewer columns? Score this only if you were shown mobile
evidence. If you were not, record that rather than guessing.

**distinctive-moment** *(public)* — Does the declared distinctive moment actually
land, and does it suit this business rather than decorate it?

## For human reviewers

1. Score independently, before discussion. Two reviewers who confer produce one
   opinion recorded twice.
2. Work from the blinded order (`npm run calibration:blind -- --seed <seed>`).
   Items are deliberately not grouped by stratum: three generic sites in a row
   teach you what the next answer is.
3. Write a sentence per criterion. A number with no sentence cannot be
   adjudicated later, and cannot be disagreed with.
4. You are not told which artifacts carry a planted defect. Some carry none.
5. Adjudicate disagreements by discussing the sentences, not by averaging the
   numbers.

## For a model Critic

The same rubric, plus the rules the pipeline already enforces:

- A creator never issues the verdict on its own work (principle 17).
- Score only the criteria the artifact was scoped against.
- Name the failing criteria explicitly. "Right verdict, wrong reason" is
  measured: `tooling/lib/critic-calibration.mjs` reports a Critic that failed an
  item without naming any of the criteria the defect actually sits in.
- Say when you were not shown the evidence a criterion needs, rather than
  scoring it anyway.

## What this rubric cannot do

It cannot make a score objective. Two qualified reviewers will disagree about
distinctiveness, and that disagreement is information rather than noise. The
rubric's job is to make them disagree about the same question.
