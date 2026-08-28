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
