# Prototype A — Nørreværk

A fictional architecture bureau that works only on buildings that already exist. Built to test
whether the corpus can reach the quality class of the strongest contemporary architecture and
portfolio sites, measured by the v2 rubric rather than by a bespoke harness.

## Result

Reviewed by the repository's own reviewer — anchored score bands, bar not disclosed, ceilings
applied, pairwise comparison against `vb-kononenko`.

| | |
| --- | --- |
| Mean | **9.231** |
| Lowest criterion | **8.5** (interaction-craft) |
| Holistic tier | **exceptional** |
| Benchmark gap | **NONE** |
| Ceilings triggered | none |
| Pairwise | 4 candidate-stronger, 4 roughly-comparable, **0 reference-stronger** |

`ai-slop-resistance` scored **10** — the rubric's rarest band.

Every programme target is met: mean ≥ 9.0, no criterion below 8.0, business-specificity ≥ 9,
art-direction ≥ 9, responsive ≥ 8.5, ai-slop ≥ 9, gap no worse than SMALL.

## The signature

> "The Work register draws six project frames and comparison bars in proportion to floor area,
> making the portfolio physically express the scale of the buildings being preserved."
> — the reviewer, naming it unprompted

The bureau's projects run 334 m² to 18,600 m². Every frame in the register is sized by √area,
so the index *is* the range rather than mentioning it, and the mapping is declared on the page
because a figure drawn to a scale the reader cannot check is decoration. No business without a
wide size range could use this composition — which is the test the previous corpus failed.

## Routes

`/` · `/work` · `/work/<six projects>` · `/bureau` · `/survey`

The condition survey has its own route because it is the commercial product; "Contact" hid the
one proposition that distinguishes this bureau behind a generic noun.

## Evidence

- `evidence/v15/` — 10 routes at 1920, 1440, 834 and 390, scroll-and-stitch, tall pages panelled
- `evidence/states/` — 12 interaction states: hover, focus, keyboard traversal, reduced-motion,
  touch-held, active navigation
- `evidence/verdicts/` — every run, including the ones that did not pass

## What the scores cost

Six evaluator runs. The path was 8.577 → 8.846 → 9.038 → 9.000 → 8.923 → 9.038 → **9.231**, and
two of those steps were backwards because fixing one thing exposed another. What moved it:

1. **Real typefaces.** The first version set its display face in system Times.
2. **The register.** Metadata became the composition instead of a right-aligned caption.
3. **Killing the tagline hero and the six-cell fact grid** — both on the anti-slop list, both
   defaults rather than decisions.
4. **Four band heights instead of one.** Identical vertical rhythm caps composition regardless
   of how good the sections are.
5. **Clamping the fluid root.** At 834px the root was 0.52px and the smallest metadata computed
   to **6.5px** — measured, not guessed, and the single worst defect in the build.
6. **Capturing interaction states.** `interaction-craft` was 6.5 purely because static
   screenshots show none; the touch capture then found a real fixed-nav collision on mobile.

## Imagery

Every frame is a CC BY 2.0 photograph of an existing building by another architect, credited on
the page and recorded in `src/assets/provenance.json`. The bureau, its projects and the
interventions described are invented. Nothing is claimed as owned.
