# CC1 — Critic calibration corpus

Twenty-two artifacts and one question:

> If a model sat in the Critic's seat, would it pass a site that is beautifully
> composed and says nothing?

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

- **planted defect** (20 items) — built with a specific defect, or independently
  reviewed below the bar. A Critic that passes one is wrong, and no agreement
  about its exact score is needed to say so.
- **no planted defect** (2 items) — nothing was planted. *Not* a claim that they
  are excellent or should pass.

The second group exists to catch the degenerate Critic. A Critic that rejects
everything scores a perfect zero false-pass rate and has learned nothing. The
pair gives **separation**: does it score the undamaged artifacts above the
damaged ones? A blanket rejector separates by zero.

Both degenerate Critics are held as tests.

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

`panel.v1.json` is committed empty, on purpose, so the shape is reviewed before
anybody's time is spent producing scores that do not fit it. It needs:

- two or more qualified reviewers who did not create these artifacts;
- a commitment to the blinded order before scoring, and to the 8.5/6.5 bar
  before scores are seen.

Neither is engineering. The corpus, the rubric, the blinding and the measurement
all run today; what they lack is people.
