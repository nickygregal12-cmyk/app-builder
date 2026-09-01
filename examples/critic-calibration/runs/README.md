# Critic calibration runs

Recorded runs of a real Critic against CC2. Each pair is a `-codex.json` (what the
Critic said, with the blinding mapping) and a `-measurement.json` (what
`measureCalibration` made of it).

Reproduce with:

```bash
node tooling/critic-calibration-run.mjs --authorise --seed cc2-autumn-1
npm run calibration:score -- --verdicts <the run file>
```

`--authorise` has no default. The run calls a third-party provider and spends the
operator's credits.

---

## cc2-2026-09-01-codex — the first run

**Reviewer:** OpenAI Codex CLI 0.150.1, `--sandbox read-only`, one invocation per
artifact with no shared context between them.
**Seed:** `cc2-autumn-1`.
**Scored:** 18 of 28. The ten `cc-a*` genuine-business anchors reference verdicts
recorded under the v1 criteria; re-scoring them here would mix a fresh Critic's
numbers with old ones inside one stratum mean, so they are reported as not scored.

### Headline

| Metric | Result |
| --- | --- |
| False passes | **0** (0.0%) |
| Separation (undamaged − damaged) | **1.754** |
| Strata ranked in order | **yes** |
| Ordering assertions honoured | **all 5** |
| Scores of 9 or above awarded | **0** |
| Score spread | **5.35** (2.08 → 7.42) |

### Strata, in the order the corpus asserts

| Rank | Stratum | n | Mean |
| --- | --- | --- | --- |
| 1 | `T1-broken-amateur` | 3 | 3.564 |
| 2 | `T2-generic-template` | 12 | 4.881 |
| 3 | `T3-competent-commercial` | 1 | 5.423 |
| 4 | `T4-strong-professional` | 2 | 6.846 |

Monotonic, with no inversions.

### The two diagnostic pairs

**`cc-25` (7.42) vs `cc-24` (5.15) — 2.27 apart.** Same fictional firm, same
content, same words; the only variable is composition. The Critic can see
composition. On cc-24 it set every observation true — `templateDerived`,
`interchangeableBusiness`, `mobileIsStackedDesktop`, `noSignatureMoment`,
`typographyMerelyCompetent`, `genericDesignLanguage` — and scored
`ai-slop-resistance` 3.5, its lowest criterion. On cc-25 it named the signature
moment unprompted: *"the twelve-month accounting-year grid, with two shaded months
identifying when the client must supply records and attend the accounts meeting."*
That is the moment the fixture was built around, and nothing in the prompt
mentioned it.

**`cc-25` (7.42) vs `cc-20` (5.00) — 2.42 apart.** The anti-*"fancy = good"*
assertion. cc-20 has gradients, a glow, a product mockup and hover-lift cards;
cc-25 has no motion, no gradients, no photography and one accent. The Critic
preferred the quiet one by 2.4 points. It has not learned that finish means
quality.

### Two findings worth more than the numbers

**1. `cc-01`'s stratum is not supported by this run, and the label was already
inconsistent with the corpus's own semantics.**

cc-01 scored **6.27 — `competent`**, level with the agency-slop fixture, against a
corpus label of `T4-strong-professional`. The Critic called it `templateDerived`
and `typographyMerelyCompetent`, and found real mobile defects: *"conspicuous
wrapping problems in the navigation, phone number and contact metadata."*

The label is disputed rather than corrected, and the reason to be careful is that
it is being questioned *after* seeing a score — which is exactly what
`panel.v2.json` forbids doing to the bar. But the inconsistency predates the run:
cc-01 came from CC1's `excellent` stratum, and CC1's README says in terms that a
no-planted-defect item is *"**Not** a claim that they are excellent"*. Naming that
stratum `T4-strong-professional` in CC2 turned a statement about what was not
planted into a claim about quality. That was an authoring error in CC2.

It is left in place. The ordering assertions hold either way — T4 still outranks
T3 with cc-01 included — so nothing about this result depends on moving it. It is
marked `stratumDisputed` in the corpus and belongs to the human panel.

**2. `cc-08` cannot be tested from screenshots, and its stratum reflects a defect
the evidence cannot carry.**

cc-08 is a *functional* failure and sits in `T1-broken-amateur`. It scored 5.35,
above several T2 items. A still screenshot cannot show a form that does not
submit, so the Critic judged what it could see — a thin, template-looking page —
and scored it accordingly. This is an evidence-modality limit, not a Critic
failure, and the corpus now records which items are screenshot-testable.

The same applies to the two `wrong reason` findings the measurement reports
(cc-08, cc-09): both were correctly failed and both were failed on criteria other
than the one the corpus names. Part of that is the coarse v1→v2 criterion remap,
which folded `credibility`, `conversion-clarity` and content truth into a single
`commercial-clarity`.

### What this run does not establish

**That the Critic can recognise exceptional work.** It awarded no score of 9 or
above — and the corpus contains no artifact asserted to deserve one. `T5` and `T6`
are deliberately empty. Zero 9s over a corpus with no 9-class artifact is the
correct outcome, and it is *not* evidence that the top of the scale functions.

The ceiling is tested structurally by `tooling/visual-rubric.test.mjs`, which
asserts a verdict satisfying every condition does reach 10. Whether a Critic will
ever issue one, and whether it would be right to, needs work in that class to
exist and a panel to adjudicate it. Neither exists yet.
