# Phase 4D visual excellence — unpaid quality debt

**Status: not passed. Deferred, not discharged.** The threshold is unchanged and no candidate has
reached it. This document exists so that later stages can proceed without the record being softened,
restated or quietly lost, and so that no future session has to re-derive it from four reviews.

`config/factory-status.json` holds the machine-readable form under `deferredCapabilities`. Where the
two disagree, the status file wins.

---

## 1. The gate, unchanged

| | |
| --- | --- |
| Gate | `gates.visual` in `config/agent-pipelines.json` |
| Required mean | **8.5** |
| Required criterion floor | **6.5** |
| Independent reviewer | required — no self-approval |
| Best recorded mean | **6.55** |
| Gap | **1.95 mean**, and four of eight criteria still under the floor |

Nothing in this deferral lowers `minimumScore` or `minimumCriterionScore`. Deferring an unpaid gate
and lowering it are different acts, and only the first one is happening here.

---

## 2. What was measured

Four independent reviews, all by an OpenAI GPT-5 `design-critic` that did not produce the work, over
the one frozen genuine business in the corpus (nbm, approved pack `e7c387bc`, 9 sources, 22 facts).
Scores are the reviewer's own, recomputed from the committed verdict files rather than restated.

| Review | Candidate | Verdict | Mean | Floor | distinctiveness | distinctive-moment | responsive-quality |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v1 | structured-practice | reject | 5.21 | 2.8 | 4.2 | 2.8 | 5.5 |
| v1 | editorial-authority | reject | 4.66 | 2.5 | 3.8 | 2.5 | 4.2 |
| v2 | structured-practice | rework | 6.14 | 4.6 | 4.8 | 4.6 | 5.9 |
| v2 | editorial-authority | rework | 5.91 | 3.5 | 4.8 | 3.5 | 4.6 |
| v3 | structured-practice | rework | 5.88 | 2.5 | 4.4 | 2.5 | 6.3 |
| v3 | editorial-authority | rework | 5.89 | 3.8 | 4.8 | 3.8 | 4.2 |
| v4 | structured-practice | rework | 6.05 | 2.8 | 4.3 | 2.8 | 6.3 |
| v4 | editorial-authority | **reject** | 5.74 | 3.2 | 4.5 | 3.2 | 5.8 |
| v4 | **schedule-register** | rework | **6.55** | **4.8** | **4.8** | **5.2** | **7.0** |

Evidence, all committed:

- `examples/genuine-business/nbm-visual-review-v1.verdicts.json`
- `examples/genuine-business/nbm-visual-review-v2.verdicts.json`
- `examples/genuine-business/nbm-visual-review-v3.verdicts.json`
- `examples/genuine-business/nbm-visual-review-v4.verdicts.json` — set `candidates-8caa9f3ee92885c0`

The best candidate recorded, `schedule-register`, scores `brand-fit 6.5, visual-hierarchy 7.3,
coherence 7.2, distinctiveness 4.8, credibility 6.8, conversion-clarity 7.6, responsive-quality 7.0,
distinctive-moment 5.2`.

---

## 2a. The 2026-08-31 reviews, and what they cost to fix

**Still not passed.** Two further independent reviews ran on 2026-08-31, both by
an OpenAI GPT-5 `design-critic` over evidence an Anthropic runtime produced. The
threshold is untouched; these are added because the record above is what a later
session reads instead of re-deriving it.

**The reviewer was never actually unavailable.** `config/factory-status.json`
records the independent verdict as blocked partly because "the only
different-vendor reviewer executes the Codex CLI, which is not installed on this
host". It is installed, at `/home/predictor/.local/bin/codex`, and authenticated;
`npm run review:codex -- --packet <dir> --authorise` runs end to end and produced
both reviews below. The host model-execution switch at
`/etc/app-builder/model-execution.json` is a different lane and is still
`enabled: false`; this reviewer is an operator tool driving a CLI, and it refuses
to run without `--authorise`. The status file's other two reasons stood: they
were the packet adapter, which the portable packet now satisfies, and cost.

| Review | Candidate | Verdict | Mean | Floor | distinctiveness | distinctive-moment |
| --- | --- | --- | --- | --- | --- | --- |
| v5 | editorial-authority | rework | 6.10 | 3.2 | 4.8 | 3.2 |
| v5 | structured-practice | rework | 5.94 | 2.8 | 4.5 | 2.8 |
| v5 | service-forward | rework | 5.56 | 4.0 | 4.5 | 4.0 |
| v6 | editorial-authority | rework | **6.31** | 3.5 | 4.8 | 3.5 |
| v6 | structured-practice | rework | 5.94 | 3.5 | 4.5 | 3.5 |
| v6 | service-forward | rework | **6.26** | 4.5 | 4.8 | 4.5 |

Between the two, three reusable defects the v5 critic named on *every* candidate
were fixed, and the same benchmark reran:

- **section rhythm was arithmetic, not taste.** `--section-space` was the padding
  on both sides of every section, so the gap a visitor sees was two of it. The
  relaxed density asked for 132px and produced 264px; measured gaps on the
  editorial candidate were 344, 300, 260 and 260px, and are now 206, 196, 156
  and 208. No direction could have tuned this, because every direction doubled
  whatever it asked for;
- **the action family never changed shape.** `.button` hard-coded a 999px
  capsule, so "pill buttons" — named in v4 and again in v5, after the action axis
  existed — was literally true of every treatment that was a box. Controls take
  `--layout-radius` now, which is the direction's own declaration;
- **conversion-first put the contact details before the offering** on a phone,
  and then repeated them in the footer. Two of three v5 verdicts said so in
  nearly the same sentence.

**The criterion floor rose on all three candidates** (2.8/3.2/4.0 → 3.5/3.5/4.5)
and two means rose materially. **`distinctiveness` did not move: 4.8, 4.5, 4.5 →
4.8, 4.5, 4.8.** That is the eighth and ninth consecutive measurement of the same
flat number, and it is consistent with §3 below rather than a refutation of it —
rhythm, shape and ordering are not what it is measuring.

### The anti-template diagnostic was measuring itself

§9 of `docs/VISUAL_EXCELLENCE.md` records the diagnostic's first run as "eight
builds, and eight of eleven signals were **uniform**", explained by no build
carrying a promoted direction. **That reading was an instrument defect.** The
diagnostic read `design.visualDirection`; every project record on disk carries
`visualDirectionId`. The read never matched, so `direction` was null for every
build ever measured, the signature fell back to the default dimensions, and the
tool reported `solid / panel / stacked / utility / neutral` over sets whose
builds demonstrably render an underlined ask, an editorial masthead and a serif
voice — then printed a confident explanation of its own null case. A diagnostic
whose failure mode is indistinguishable from the finding it exists to detect will
report that finding forever.

Fixed, and with the read exercised by a test that loads a record shaped the way
the generator writes one. Over the same three nbm candidates it now reports three
uniform signals rather than fourteen, and pairs differing in 10 to 13 of 16.

### What two businesses actually showed

Run over six builds — three nbm candidates and three MGB Decor candidates, two
unrelated companies — only two signals are uniform, and both honestly so: they
are both marketing sites, and both resolved the same typographic voice. Direction
selection is genuinely business-driven; MGB chose `schedule-register` where nbm
chose `structured-practice`, and each refusal names its reason.

**The convergence that remains is between businesses that land on the same
direction.** nbm's `editorial-authority` and MGB's `editorial-authority` differ in
**1 of 16 signals** — section sequence — and compile the *same* accent
`#315b72` and the same voice `humanist-sans`. That is close to this document's own
definition of a template, and it is the next architectural question: a direction
currently determines the whole vocabulary, and the business contributes content,
section order and nothing else a visitor can see.

It was not fixed here, for a reason rather than for lack of time. The accent is
`origin: "derived"` with empty `sourceIds` on both, and the cause is upstream:
nbm's approved knowledge pack carries `brand.colors: []` and
`brand.fontFamilies: []`, so BrandSpec is correctly falling back rather than
failing. Re-ingesting that pack would change the frozen truth every review in
this document was measured against, and the frozen-corpus protocol in
`docs/GENUINE_BUSINESS_ACCEPTANCE.md` makes that an owner decision, not a
repository edit. Whether a direction should be the sole determinant of vocabulary
is likewise an architecture decision, and deterministic composition is a
protected guarantee.

## 2b. The direction was the whole answer, and now it is not

**Still not passed.** The gate is unchanged at 8.5 mean and a 6.5 floor. The best
mean recorded here is now **6.70**, which is the highest in this document and
still 1.8 short.

§2a left the architectural question open: two unrelated businesses that chose the
same direction differed in 1 of 16 signals and compiled the same accent. That is
now answered, and the answer was not the brand colour.

**`deriveBusinessVisualProfile` read seven signals off the approved intake,
`scoreDirectionAgainstProfile` used them to rank the registry, and then the
profile was discarded.** `compileVisualDirection` was never given it. So the
business decided *which* theme and had no say in what that theme rendered, and a
direction was a complete prebuilt theme rather than a strategy. nbm and MGB Decor
disagree on three of seven readings — focused against broad service breadth,
information-led against work-led showcase intent, relaxed against compact content
density — and still received the same website.

A direction now declares which axes it will let a business move and to which
values (`adapts` in `config/visual-directions.json`). Bounded three ways: only
axes it names, only values it names, and every result validated on the scale the
registry already uses, so an adaptation cannot express anything a direction could
not have declared itself. The only input is the derived signal set, so a broad
service list moves a grid and an industry never does. What moved is recorded on
the compiled plan as `businessAdjustments`, with the signal that moved it.

| | before | after |
| --- | --- | --- |
| same direction, two businesses | 1 of 16 signals | **4 of 16** |
| nbm `editorial-authority` | 6.31 mean, 3.5 floor | **6.70 mean, 4.7 floor** |
| nbm `structured-practice` | 5.94 mean, 3.5 floor | **6.58 mean, 4.2 floor** |
| nbm `service-forward` | 6.26 mean, 4.5 floor | 6.10 mean, 4.6 floor |
| `distinctiveness` | 4.8 / 4.5 / 4.8 | 5.4 / 4.8 / 4.8 |
| `responsive-quality` | 7.4 / 6.1 / 5.9 | 7.3 / 7.5 / 5.9 |

`distinctiveness` moved for the first time since v2 — it had read 4.3–4.8 through
a content fix, a moment contract, an axis-rendering fix, an entirely new
direction, and the whole of §2a. It is still the weakest criterion and still the
reason the gate is unpaid, but it is no longer flat, and it moved in the round the
architectural assumption changed rather than in any of the rounds that adjusted
styling.

Two things the rendering caught that no test could. `.cta-section` hands its
actions inverse ink and the correction for the light closing compositions had
never listed `action-block`; the first business whose conversion emphasis moved
`editorial-authority` to a block ask got a closing call to action in near-white on
off-white. And the disclosed navigation panel stopped after its last destination,
so a slice of the page showed beneath it — two review rounds called that clipping
and collision before it was read correctly as a panel that should cover the screen
it was opened over.

**What is left is mostly not a design problem.** Every candidate in every round of
this session was told to add credentials, representative work, sectors, outcomes
or client proof. nbm's approved intake carries one description — the Companies
House record — an empty `trustSignals` array, and no client-facing proposition.
Writing any of it would be inventing business claims, so the remaining
distinctiveness and credibility headroom needs owner-supplied truth rather than
another visual intervention.

## 2c. Rich truth, measured — and what it changed

**Still not passed.** The gate is unchanged. What changed is that the confound §2b named is
gone: every score in this document until now was against nbm or MGB Decor, and nbm carries one
Companies House sentence and an empty `trustSignals` array. The Ardwell & Roe benchmark —
17 facts, 6 projects, 5 people, 5 testimonials, 4 awards and 17 governed synthetic
photographs — has now been generated, rendered and independently reviewed.

**It scores the same as thin truth.** Best candidate 6.64 mean / 5.8 floor against 6.70 / 4.7
on nbm; verdicts at `examples/visual-excellence/ardwell-roe-visual-review.v1.verdicts.json`.
Rich input did not raise the ceiling, which retires "the truth is thin" as the explanation.

**It got worse before it got better, and that is the finding.**

| run | best mean |
|---|---|
| rich truth, no imagery | 5.82 |
| rich truth, imagery ingested | 4.81 |
| after seven latent imagery defects fixed | 5.57 |
| after the information-architecture correction | 6.41 |
| after section-order adaptation | **6.64** |

A thin business hides a composition that cannot edit; a rich one exposes it. The factory
composed **31 sections over 9,217px** and the reviewer's language changed from "sparse" to
"reduce the copy density", "excessive empty space" and "effectively duplicate pages". The
largest single gain came from teaching the composer that *belonging on the site* and
*belonging on the home page* are different questions — home previews what a dedicated page
carries in full, a surface that composes nothing another page has not already said is not
published twice, and a business may promote the section it leads with. 31 sections to 26,
12,207px to 6,898px.

So the constraint is not only the component vocabulary this document has recorded since v2.
**It is also that the factory has no information architecture**: it knows what a business has
and not what a page is for. Both are now measured rather than argued.

The hand-built Gold Reference corpus at `examples/gold-reference/` scores 8.663, 8.500 and
8.625 on the comparable eight criteria over three sectors, which sets the ceiling this gap is
measured against. It is not factory output and never claims to be.

## 3. The finding that matters

Interventions targeted at named criteria moved those criteria. The gate did not move, because one
criterion never moved at all.

**`distinctiveness` has scored 4.8, 4.8, 4.4, 4.8, 4.3, 4.5, 4.8 across every candidate in every
review since v2 — through a content fix, a moment/variant contract, an axis-rendering fix and an
entirely new direction.** A number that flat under that much intervention is measuring something none
of the interventions touched.

> **The Presentation Registry is the visual ceiling. Art direction controls tokens and section
> presentations; it does not control the component vocabulary.**

A direction can restyle one set of primitives and reorder sections. It cannot change what the page is
made of. Every candidate therefore inherits substantially the same:

- button treatment (pill buttons);
- CTA component grammar (a dark closing rectangle);
- display typography family (a familiar sans-serif);
- common primitive vocabulary (thin dividers, one card grammar).

The v4 critic states it directly: *"Apart from numbered rows, the design relies on familiar
sans-serif headings, pill buttons, thin dividers and a dark CTA rectangle, producing a strongly
template-derived impression."* `schedule-register` could turn cards into ruled rows and still could
not choose a typeface or stop the closing ask being a dark rectangle.

This is why structurally different directions keep being described in nearly the same words. It is an
architectural finding, not a taste dispute, and **it is not another CSS pass.**

---

## 4. Phase 4.2A — static renderer visual parity, also unpaid

The static/content renderer was independently reviewed on 2026-08-28 and **did not pass**: rework,
mean **5.38**, floor **2.0** (`examples/genuine-business/nbm-static-renderer-review.v1.verdicts.json`,
set `static-evidence-0b3e91c4bef9da7f`). Against the application-rendered candidates in the same
session — 6.05, 5.74, 6.55 — the static rendering is **not** at least as good, so 4.2A does not close.

**A sequencing dependency was discovered and must be carried with the number.** Its distinctiveness
(3.0) and distinctive-moment (2.0) are the lowest recorded anywhere because *no candidate has ever
been promoted*, so the static build renders the **default presentation shell** rather than a promoted
visual direction. This verdict measures the static renderer carrying the default shell. It is not a
measurement of the static renderer carrying an approved direction, and it cannot be read as one.

What remains genuinely proven about 4.2A, and is not in dispute:

- zero client JavaScript;
- six route documents;
- deterministic, byte-stable generation;
- fail-closed renderer selection.

Its **visual parity** is unpaid, and that debt belongs to this document — i.e. to the visual-system
revisit — rather than to the renderer. Rerun it against a promoted direction once one exists.

---

## 5. Revival conditions

Phase 4D visual-excellence work revives when **at least one** of these is genuinely true. Wanting
another 0.3 points from another CSS adjustment is not one of them, and neither is a new opinion about
the same evidence.

### A. Corpus evidence
Several materially different real projects show whether component-vocabulary convergence is actually
cross-project rather than an artefact of one thinly-evidenced professional-services business.

### B. Component architecture earns the change
A later capability requires art direction / DesignSystemSpec to select project-specific component
implementations rather than only restyle one primitive set. Existing-design-system assimilation
(`docs/PLATFORM_PARITY_PROGRAMME.md` §5.2) is the most likely trigger, because an adopted product
arrives with a component vocabulary the factory did not choose.

### C. Pre-release qualification
**Mandatory.** Before App Builder claims best-in-class visual output, professional visual maturity, or
fully proven website generation, this gate must be revisited and paid. The claim cannot be made over a
deferred gate.

### D. New source or design evidence
A genuinely new benchmark materially changes what can be tested.

---

## 6. What the revival should build

When a real consumer proves it necessary — and not before, and not from nbm alone:

> **Art direction / DesignSystemSpec can select component implementations or component families, not
> merely token values and section presentations.**

Start with the two the critic named in all four reviews — the CTA block and the button — plus a
per-direction display typeface. Candidate axes: Button family, CTA composition, navigation primitive,
display typography strategy, Card/Panel grammar.

Whatever is built must preserve accessibility, semantic contracts, component identity, deterministic
validation and generated-repository portability. A vocabulary that is more distinctive and less
accessible has not paid this gate; it has moved the debt.

---

## 7. Related debt still open

Recorded here so it is not lost with the stage, and so none of it is mistaken for a blocker on
unrelated engineering:

- **Enquiry failure state** — modelled as an outcome and given no visual treatment. There is no status
  colour in the token set; adding one is a DesignSystemSpec change and belongs with the component
  work above.
- **Mobile navigation treatment** — clipping is fixed; `inline-wrap` shows all five destinations at
  390px and v4 calls the second row loose. Decide between a deliberate two-row bar and retiring the
  treatment in favour of disclosure. Decide it on the recorded evidence, not by adding a third
  scroller.
- **Captured evidence previews a dev server** — the specific defect (a `factory-meta` strip visible
  only in dev, photographed and reported by a paid reviewer) is fixed in both renderers. The general
  form is open: **no gate asserts that what is photographed is what ships.** This one is a
  quality-system gap rather than a visual one and does not need the visual revival to be worked on.
