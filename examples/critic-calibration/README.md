# CC2 — Critic calibration corpus

Twenty-eight artifacts and two questions:

> If a model sat in the Critic's seat, would it pass a site that is beautifully
> composed and says nothing?

> And would it call a polished generic site **exceptional**?

The second question is new, and CC1 could not ask it.

```bash
npm run calibration:corpus                          # composition and gaps
npm run calibration:blind -- --seed autumn-1        # blinded order for reviewers
npm run calibration:score -- --verdicts <file>      # measure a Critic's answers
```

This is evaluation material. It holds no promotion authority, reviews nothing
and gates nothing — `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` owns what a verdict
may do.

## Why the headline number is separation, not agreement

The obvious measurement is "how close were the Critic's scores to the right
ones?", and there are no right ones. Nobody has adjudicated a score for any
artifact here. That needs a panel of qualified reviewers working blind, which is
an owner action, and a calibration that invented its reference scores would be
measuring a Critic against this repository's opinion.

So the corpus asserts only what is knowable without a panel:

- **planted defect** — built with a specific defect, or independently reviewed
  below the bar. A Critic that passes one is wrong, and no agreement about its
  exact score is needed to say so.
- **no planted defect** — nothing was planted. *Not* a claim that they are
  excellent or should pass.

The second group exists to catch the degenerate Critic. A Critic that rejects
everything scores a perfect zero false-pass rate and has learned nothing. The
pair gives **separation**: does it score the undamaged artifacts above the
damaged ones? A blanket rejector separates by zero.

Both degenerate Critics are held as tests.

## The failure CC1 was blind to

Separation is a *floor* test, and it is satisfied by a Critic that has no ceiling
at all. A Critic that scores the generic template 8.6 and the excellent fixture
9.9 separates by 1.3, passes CC1 handsomely, and has just called a bootstrap-era
theme with its colours changed "strong professional work". That is the exact
miscalibration the visual gate turned out to have, and the corpus built to detect
miscalibration could not see it.

You can reproduce this. Score every non-broken item 8.8 and every broken one 3.5:
CC1's metrics come back `separation 0.636, discriminates: true`. CC2 fails the
same verdicts on four ordering assertions.

## The second dimension: quality strata

| Stratum | Items | Meaning |
| --- | --- | --- |
| `T1-broken-amateur` | 3 | Something failed that any viewer would notice. |
| `T2-generic-template` | 22 | Generic or AI slop. **May be highly polished.** |
| `T3-competent-commercial` | 1 | Complete, plain, unremarkable — a legitimate place to be. |
| `T4-strong-professional` | 2 | Clearly authored and refined. |
| `T5-exceptional-agency` | **0** | Nothing here is asserted to be here. |
| `T6-benchmark-class` | **0** | Nothing here is asserted to be here. |

The top two strata are **deliberately empty**. Labelling our own fixture
benchmark-class would make the top of the scale a measurement of our own opinion,
which is the thing the whole exercise is trying to stop.
`examples/visual-benchmarks/references.v1.json` anchors that end instead, as
written analyses of external work rather than as scoreable artifacts.

The strata are an **order**, not a scale. The corpus asserts rankings, never
numbers, because nobody has adjudicated a score for anything in it.

## The ordering a Critic must reproduce

```
T2-generic-template      >  T1-broken-amateur
T3-competent-commercial  >  T2-generic-template
T4-strong-professional   >  T3-competent-commercial
cc-25                    >  cc-24
cc-25                    >  cc-20
```

The last two are the diagnostic ones.

**`cc-25` vs `cc-24`** is the same fictional accountancy practice, the same
content, the same words. The only variable is composition: cc-24 wraps every
concept in an elevated rounded rectangle so nothing can be more important than
anything else; cc-25 has a ground plane, a published fee table, a year calendar
and typographic craft. A Critic that cannot separate this pair cannot see
composition, and its scores everywhere else are unreliable for the same reason.

**`cc-25` vs `cc-20`** is the anti-*"fancy = good"* assertion. cc-20 has
gradients, shadows, a product mockup and a glow; cc-25 has no motion, no
gradients, no photography and one accent used sparingly, and it is better work. A
Critic that prefers cc-20 has learned finish rather than quality — which is as
broken as passing a defective site, and considerably harder to notice.

## The AI-slop fixtures

Five artifacts covering modern generated-design failure modes, all deliberately
**well executed**. The test is meant to be hard: none of them is broken, and a
Critic that rejects them for defects has got the right answer for the wrong
reason.

| Fixture | Failure mode |
| --- | --- |
| `cc-20-saas-slop` | Polished generic SaaS. Gradient headline, icon triplet, fake logo wall, invented KPIs, generic dashboard. |
| `cc-21-luxury-slop` | Minimal luxury. Whitespace, serif, beige — and it never says what is sold, to whom, or at what price. |
| `cc-22-agency-slop` | "We create meaningful experiences" at 168px with accomplished motion and no proposition. |
| `cc-23-trade-saasified` | A two-van roofing contractor presented as a venture-backed software product. |
| `cc-24-card-soup` | Everything in an elevated rounded rectangle. No ground plane, therefore no hierarchy. |

`cc-22` honours `prefers-reduced-motion` and its motion is genuinely well made.
That is deliberate: *"motion is not craft"* has to survive contact with good
motion, or it is just a bias against animation.

## The bar

Mean ≥ **8.5**, every criterion ≥ **6.5** — copied from `gates.visual` in
`config/agent-pipelines.json`, and asserted against it by
`tooling/critic-calibration.test.mjs`. If the gate moves, the test fails rather
than this corpus quietly measuring against a bar nobody uses.

The bar is not lowered because the factory's best result to date is 6.55 with a
floor of 4.8. That gap is the finding.

## What is in it

| stratum | n | provenance |
| --- | --- | --- |
| below-bar-anchor | 10 | real reviewed candidates |
| polished-commercially-weak | 2 | synthetic |
| excellent, acceptable, mediocre-generic | 3 | synthetic |
| deliberately-broken | 1 | synthetic |
| accessibility, functional, content-truth, hierarchy-IA, mobile, design-system | 6 | synthetic |

Four items are **held out**, including both polished-but-weak fixtures and the
tightest real anchor. They are not for tuning a Critic prompt against.

### The ten real anchors

References, not copies, into `examples/genuine-business/*.verdicts.json` — the
nbm candidates a different-vendor critic reviewed between 4.66 and 6.55, every
one below the bar. A test recomputes each recorded mean and floor from the
verdict file, so an anchor cannot drift away from the review it cites.

`cc-a09` is the tightest: 6.55 mean, 4.8 floor, the best independent result
`config/factory-status.json` records. A Critic that passes it has moved the bar
rather than met it.

### The twelve synthetic fixtures

Single self-contained HTML documents, fictional businesses, each declaring
`SYNTHETIC` in the file itself — not only in the manifest, because a fixture
that travels without its label is one screenshot away from being somebody's
evidence. A test enforces it.

The two that matter most are `cc-05` and `cc-06`: the same commercial emptiness
in opposite visual languages, one a confident modern agency page and one a
restrained editorial studio. Paired deliberately — a Critic that only recognises
the failure in one aesthetic has learned the aesthetic rather than the failure.

## What a run looks like

Against a simulated Critic that rewards polish:

```
  scored        22/22
  false passes  3 (15.0%)
     cc-05 [polished-commercially-weak] scored 8.9 — …never says what the company does…
     cc-06 [polished-commercially-weak] scored 8.9 — …beautiful and commercially inert…
     cc-09 [content-truth-failure]      scored 8.9 — …handsome, and the copy is the problem.
  separation    2.575  (undamaged 8.5 vs damaged 5.925)
  wrong reason  cc-11: failed on [distinctiveness], defect sits in [responsive-quality]
  human agreement: unavailable
```

"Wrong reason" is the subtler measurement: a Critic that fails the mobile
fixture because it finds the site generic reached the right verdict from a
reading that will not generalise.

## What this corpus is not

It is not evidence about what App Builder produces. Twelve of its artifacts were
written to contain the defect they are graded on, and the businesses in them do
not exist. Nothing in a calibration run may be cited as a measurement of the
factory's output quality.

It also does not calibrate anything by existing. It is the material and the
measurement; running a real Critic against it needs live model execution, which
`config/factory-status.json` records as disabled pending an owner action.

## Still needed from a person

`panel.v2.json` is committed empty, on purpose, so the shape is reviewed before
anybody's time is spent producing scores that do not fit it. It needs:

- two or more qualified reviewers who did not create these artifacts;
- a commitment to the blinded order before scoring, and to the 8.5/6.5 bar
  before scores are seen.

Neither is engineering. The corpus, the rubric, the blinding and the measurement
all run today; what they lack is people.
