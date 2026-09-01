# Stage A synthesis — what five hand-built prototypes actually support

Stage A is complete. Five sites were built outside the factory path to answer one question:
*what can output look like when the current factory constraints are removed?*

They are evidence, not templates. This document reads the committed findings and verdicts of all
five, reconciles them where they disagree, and separates what the corpus supports from what is
one author's taste appearing five times.

**It corrects two conclusions the prototype documents reached about themselves.** Both are in
§3. A synthesis that only aggregated the individual claims would have carried both forward.

---

## 1. The corpus, and the one number comparison nobody may make

| | domain | mean | floor | tier | gap | runs |
| --- | --- | --- | --- | --- | --- | --- |
| **A — Nørreværk** | architecture / portfolio | **9.231** | 8.5 | exceptional | **NONE** | 15 |
| **B — Interlock** | technical SaaS / product | 8.923 | 8.0 | exceptional | SMALL–MATERIAL | 6 |
| **C — Marlpit** | commerce / editorial | **9.308** | **9.0** | exceptional | SMALL | 2 |
| **D — The Monitoring Gap** | research / data / long-form | 8.923 | 8.0 | exceptional | SMALL | 4 |
| **E — Hallowsand** | hospitality / luxury | 9.038 | 8.5 | exceptional | MATERIAL | 4 (+2 repeats) |

> **These numbers may not be compared with any recorded factory score.** A–E were scored on the
> v2 rubric (13 anchored criteria, undisclosed bar, ceilings, pairwise gap). Every factory figure
> in `docs/PHASE_4D_VISUAL_DEBT.md` and `examples/gold-reference/FACTORY-GAP.md` — 6.70 best,
> 5.38 for the static renderer — is on the earlier 8/9-criterion scale. The scales are not
> convertible and the earlier document says so.
>
> The valid factory-versus-freehand comparison is the one already recorded in `FACTORY-GAP.md`,
> which was made **within** the old scale: same business, same approved knowledge, same nine
> criteria, factory **6.644** against free-hand **8.711**. Stage A does not extend that
> comparison. It characterises the free-hand ceiling in more domains; it says nothing new about
> the size of the gap.

**Run-to-run noise is 0.038** on the mean, measured properly for the first time on E by reviewing
one byte-identical packet three times (9.038 / 9.077 / 9.077; nine of thirteen criteria
identical, four moved exactly one half-step). Earlier estimates of "±0.08" came from re-running
*different* packets and conflated noise with change. **Anything above ~0.1 is a regression to be
investigated, not a sample** — which is how E's 0.193 drop was correctly identified as a real
defect rather than attributed away.

---

## 2. Evidence matrix

Confidence is stated as **strong** (four or five prototypes, no contradiction), **moderate**
(three or more, or a controlled comparison), **weak** (two), **single** (one).

### L1 — The signature is the business's own artefact, computed rather than illustrated

| | |
| --- | --- |
| **Observation** | Each site has one object it would be absurd for another business to own, and in every case it is derived from a model rather than authored by hand: floor-area register (A), network solver (B), chromatic transform (C), coverage simulation (D), tidal ribbon (E). |
| **Supports** | A, B, C, D, E — all five. `business-specificity` 9.5 / 9.5 / **10** / 9.5 / 9.5, and in every case the reviewer named the computed artefact unprompted. |
| **Contradicts** | None. |
| **Confidence** | **Strong** — the single best-supported finding in the corpus. |
| **Reusable?** | The *question* is reusable. The artefacts are not. |
| **Blocking constraint** | Nothing in the factory asks "what does this business hand its customer, and can the site show one at full size?". Composition enumerates what the business *has*; it never derives what it *produces*. |
| **Smallest capability** | A derivation step over approved knowledge that proposes candidate artefacts with their data binding, and can return *none*. |
| **Proof needed** | A factory run on rich approved knowledge that proposes a defensible artefact for a business the author never saw, **and returns none for a business that has no computable structure**. The second half matters more than the first. |

### L2 — A one-sentence thesis, held everywhere

| | |
| --- | --- |
| **Observation** | "Existing buildings as measured evidence"; "the site is a drawing sheet"; "the site is painted"; "a document with its apparatus showing"; "the tide is the visual material". |
| **Supports** | A, B, C, D, E. `art-direction` ≥ 9 on all five. |
| **Contradicts** | None. |
| **Confidence** | **Strong** for the correlation. **Weak** for causation — a thesis is also what a competent author writes *after* deciding, so this may be a description of authored work rather than a mechanism. |
| **Reusable?** | Reusable as a constraint; the theses themselves are outputs. |
| **Blocking constraint** | Art direction is whole-site token selection. There is no artefact that states an intent and no check that any section honours it. |
| **Smallest capability** | A declared, single-sentence direction thesis carried as an input to section composition, and quoted back in the review packet. |
| **Proof needed** | Two builds of the same truth under different theses that differ *structurally*, not only in tokens. If they differ only in colour the thesis is decoration. |

### L3 — Pacing scores correlate with structural rhythm; the *capability* is the ability to vary it on purpose

| | |
| --- | --- |
| **Observation** | **In this corpus, composition-pacing scores correlate with how much a page's structural rhythm — its section shapes — varies across the sequence.** They do not correlate with how many decorative instruments are available. See §3.1. |
| **Supports** | A 9.5 (four band heights + photographic scale), C 9.0 (six painted grounds). |
| **Contradicts the older reading** | E 8.5 — strictly *more* instruments than D and identical score. B 8.0 across six runs on one section shape. |
| **Confidence** | **Moderate, and correlational only.** Five observations, one author, one reviewer, and the five sites differ in far more than their structural rhythm. **No causal claim is made and none is available from this corpus.** |
| **Reusable?** | The **capability** is reusable: page-level composition should be *able* to vary structural rhythm deliberately, according to what the narrative and the content need. The **correlation is not a rule**, and "vary the shape more" is not a design instruction. |
| **Blocking constraint** | Section presentations are selected per section with no model of the sequence, so a page cannot vary its rhythm on purpose even where the content plainly wants it — a long uniform register and a short argued case get the same treatment. The gap is the *absence of the control*, not the absence of a target value for it. |
| **Smallest capability** | A page-level composition plan that can assign a different section shape where the narrative calls for one, and that **records the shape sequence it chose** so the choice is reviewable. Deliberately **no minimum-variety assertion, no diversity score and no target count** — see the warning below. |
| **Proof needed** | The blinded identical-content experiment: two builds of the same content differing only in structural rhythm, reviewed blind. If pacing does not move, the correlation is not causal and the capability should be justified on narrative grounds alone or dropped. |

> **Why no minimum-variety rule.** An earlier draft of this entry proposed that the plan "assert
> a minimum variety across the sequence". That is a stronger claim than five correlated
> observations by one author can carry, and it is the precise mechanism by which this programme
> would install its next template: a floor of *N* distinct shapes per page is a quota, and a
> generator satisfying a quota produces variation that answers the metric rather than the
> content. It would also be indistinguishable, in the output, from the author signature §4 warns
> about.
>
> A uniform rhythm is sometimes right. Prototype D's report is a document, and a document that
> changed its shape every section would be worse, not better — the fact that it scored 8.5 rather
> than 9.5 is a cost that may well have been correctly paid. Nothing in the corpus distinguishes
> "uniform because unable" from "uniform because appropriate", and a quota assumes the first.
>
> If the blinded experiment shows shape variety itself causes the improvement, the contract can
> be strengthened then, on evidence. Until then the capability is *deliberate control*, and the
> only assertion is that the choice is recorded.

### L4 — Responsive means recomposed, not stacked

| | |
| --- | --- |
| **Observation** | Rearranged content per breakpoint, not scaled. A changes photographic *crop*; C's register becomes plate-plus-record; E's week row moves the ribbon to full width beneath its labels rather than squeezing it to 8rem. |
| **Supports** | A 9, B 9, C 9, D 9.5, E 9. The A-era corpus carries the **only controlled comparison in the whole programme**: same page, same reviewer, 6.8 (two columns) → 7.0 (uniform rows) → **8.0** (recomposed), 28% shorter with nothing shrunk. |
| **Contradicts** | None. |
| **Confidence** | **Strong**, and uniquely it has a controlled experiment behind it. |
| **Reusable?** | Reusable. |
| **Blocking constraint** | `docs/VISUAL_EXCELLENCE.md` §3 already specifies `ResponsiveCompositionPlan` with the right capability list, and it *is* partially consumed — but only as one custom property plus a row of class names. `responsiveCompositionTokens` in `tooling/lib/visual-direction.mjs` emits exactly `--mobile-section-space-scale`, and its own comment states the limit precisely: *"Order, navigation shape and which way the hero stacks are structural changes only a class can make."* So the plan reaches the renderer as a **label**, and whether any rearrangement happens depends on what a stylesheet does with that class. There is no per-breakpoint arrangement output. |
| **Smallest capability** | One renderer that honours a per-breakpoint arrangement for one section type. |
| **Proof needed** | A generated page whose small-viewport arrangement differs in *order or grouping*, not only in width — and a gate that scores the small viewport as a composition. Horizontal overflow was zero in all three failing attempts, so the current harness could not have found this. |

### L5 — Semantic colour: every colour means one thing, everywhere

| | |
| --- | --- |
| **Observation** | B: red energised, green earthed, grey dead, blue interactive-and-never-in-a-diagram. E: one ochre meaning "water over the road", never on links, buttons, headings or hover. C: the ground *is* the product. |
| **Supports** | B (`ai-slop-resistance` 9.5–10), C (10), E (9.5 in all five reviews), and A-era F4 (coherence 9/9/9). |
| **Contradicts** | Nothing — but see the style warning in §4: **four of five sites are monochrome-plus-one-accent**. |
| **Confidence** | **Strong** for the discipline. **Zero** for the palette. |
| **Reusable?** | The rule is reusable. The palette is author signature. |
| **Blocking constraint** | The design-system lint already proves every colour is a declared token. It cannot express that a token is *semantic* and must not appear in a decorative position. |
| **Smallest capability** | A palette contract splitting semantic from surface roles, enforced in the lint that already exists. |
| **Proof needed** | Cheap and mechanical. Adopt on the existing lint and see whether it ever fires on real output. |

### L6 — Refusing a medium is a design decision with a payoff

| | |
| --- | --- |
| **Observation** | B ships no photographs at all; its material is a drawn artefact. E ships five and refuses interiors entirely, opening on a chart. D has no photography and no colour-as-product. |
| **Supports** | B `visual-material` 9.5 with zero photographs; E 9.5 with a chart as its hero; A-era Plumbline scored imagery-suitability 9 owning no asset of any kind. |
| **Contradicts** | None — but A and C both *had* excellent imagery and also scored well, so this is "a viable route", not "the better route". |
| **Confidence** | **Strong** that no-imagery is viable. **None** that it is preferable. |
| **Reusable?** | Reusable as a route. |
| **Blocking constraint** | "No suitable imagery exists" is a failure state, not a route. The asset planner cannot conclude that a drawn figure from the business's own data beats a stock photograph. |
| **Smallest capability** | Let the asset plan return a *drawn-figure* decision with the data binding to render, and give composition something to render when it does. |
| **Proof needed** | One generated site that chooses no-imagery for a business with no photographable product and scores at least as well as the photographic variant. |

### L7 — Interaction states must be captured or the criterion is scored on nothing — and this now saturates

| | |
| --- | --- |
| **Observation** | 0 states → 6.5; 13 → 9; 19 → 9.5; 12 → 8.5; 18 → 8.5. |
| **Supports** | All five. The relationship is real at the bottom. |
| **Contradicts the simple reading** | It **saturates**. E captured 18 states and still scored 8.5, with every one of its four reviews capping the criterion the same way: *"the evidence is static, so transition quality, touch behaviour, tooltip keyboard operation and live-update smoothness cannot be judged."* |
| **Confidence** | **Strong** in both halves. |
| **Reusable?** | Reusable. |
| **Blocking constraint** | The evidence harness produces still frames only. Past roughly a dozen states the reviewer stops asking for more states and starts asking for *motion*, which a screenshot cannot carry. **This is a ceiling on the harness, not on the sites.** |
| **Smallest capability** | See §6 — a bounded before/action/after frame sequence with declared trigger metadata. |
| **Proof needed** | Re-review one existing packet with sequences added. If interaction-craft does not move, the ceiling was not the evidence. |

### L8 — A number may only be rendered with the basis it is measured against

| | |
| --- | --- |
| **Observation** | A-era F2: bars scaled to a *stated budget* rather than to the maximum in the set. D publishes its own control correlation (r = −0.19) beside its finding (r = +0.66). E prints the tide model's limits at the size of the table they qualify, not in a footer. |
| **Supports** | A-era (credibility 9.2 / 8 / 9), D, E. |
| **Contradicts** | None. |
| **Confidence** | **Moderate**. |
| **Reusable?** | Reusable, and it is a truth rule rather than a design rule. |
| **Blocking constraint** | The factory can refuse to render a claim it cannot substantiate. It has no concept of a claim's *denominator*. |
| **Smallest capability** | A knowledge-pack field carrying the basis, and a render rule that refuses a figure without one. |
| **Proof needed** | Mechanical. |

### L9 — The harness finds defects that reading the code does not

| | |
| --- | --- |
| **Observation** | Six on E alone: inverted tidal physics; a day-clipped list that corrupted four statistics and printed one headline backwards; a ribbon collapsing into a zero-width grid column twice in different ways; a status line overstating flood depth forty-fold; fourteen of fifteen interaction states silently dropped by one wrong manifest key. Plus D's 94,256px mobile table and B's 614px page on a 390px phone. |
| **Supports** | A, B, C, D, E. |
| **Contradicts** | None. |
| **Confidence** | **Strong**. |
| **Reusable?** | Reusable — and it is an argument about tooling, not design. |
| **Blocking constraint** | Several of these produced *no error*: the dropped states, the guessed-route filenames, the silent lockfile divergence. Silence is the failure mode. |
| **Smallest capability** | Completeness assertions on the evidence harness: declared routes vs captured routes, declared states vs packaged states, fail loudly on mismatch. |
| **Proof needed** | Cheap. Would have caught three of the six. |

### L10 — A reviewer's defect is evidence; a reviewer's prescription is a hypothesis

| | |
| --- | --- |
| **Observation** | A-era Marram: following "the mobile register is too long" by compressing scored *worse*, twice (7.4 → 6.8 → 7.0). D: implementing "give the wide canvas more room" cost 0.31 and dropped a whole tier; a controlled revert recovered it and proved the alignment half changed nothing. |
| **Supports** | A-era, D. Both are controlled. |
| **Contradicts** | None. |
| **Confidence** | **Moderate**, and it is the finding most likely to save money. |
| **Reusable?** | Reusable. |
| **Blocking constraint** | The bounded rework loop routes findings to a role as *work to be done*. It cannot record that a prescription was tried and measured worse, so nothing stops the next round trying it again. |
| **Smallest capability** | A rework ledger keyed by finding, recording attempt and measured delta. |
| **Proof needed** | Mechanical. |

---

## 3. Two corrections to the prototypes' own conclusions

A synthesis that aggregated the individual documents would have carried both of these forward.

### 3.1 "Composition-pacing is instrument-limited, not author-limited" — **not supported**

Prototype C concluded this, and prototype B supplied the premise: that pacing had "resisted every
intervention" on B and that pacing "was Nørreværk's weakest area too".

**The second half is false.** Prototype A's own committed verdicts show composition-pacing at
**8.5 → 9.0 → 9.5** across v9, v14 and v15. It was A's *joint-highest* criterion at the end, and
it moved twice under iteration. A's README names the mechanism: *"Four band heights instead of
one. Identical vertical rhythm caps composition regardless of how good the sections are."*

**Prototype E then disconfirms the instrument-count reading directly.** E has strictly more
pacing instruments than D — five photographs, a signature graphic at four densities, a full-bleed
comparison band, an inventory table — and scored **identically** to it. If pacing tracked
instrument count, E belonged between D and C. It did not move at all.

| | pacing | distinct section shapes | instruments |
| --- | --- | --- | --- |
| B — Interlock | **8.0** ×6 | one (sticky drawing + long column) | vertical space only |
| D — Monitoring Gap | **8.5** | one (rail + measure) | measure, margin, density, type |
| E — Hallowsand | **8.5** ×3 | one (rail + column) | all of D's, **plus** photography and a four-density graphic |
| C — Marlpit | **9.0** ×2 | six (a ground change per section) | painted fields |
| A — Nørreværk | **9.5** | four (band heights) + photographic scale | photography, register |

The reviewers' own language is consistent with the shape reading and was never told it. On B:
*"leave conspicuously empty lower-left areas beside long procedural columns… under-composed."*
On E, across three separate runs: *"the recurring side-note-plus-main-column construction becomes
predictable."*

**Restated, and carefully.** In this corpus composition-pacing **correlates with how many
distinct section shapes a page uses**, and does not correlate with how many decorative instruments
are available: adding instruments inside one repeated shape did not move it. Five observations,
one author, one reviewer, observational — **a correlation, not a mechanism.** The sites differ in
far more than their structural rhythm, and nothing here distinguishes a page that is uniform
because its composer could not vary it from one that is uniform because its content is a document
and uniformity is right. The reusable conclusion is therefore that composition should be *able* to
vary structural rhythm on purpose, not that it should be required to. See L3.

### 3.2 "The containment in `selectReference` runs the wrong way" — **partly wrong**

Prototype E reported that the benchmark selector tested substring containment backwards. The
defect is real and materially affects scores, but the diagnosis was not.

Reversing the direction fixes nothing: `"hospitality lettings and places to stay"` does not
contain `"hospitality and destination businesses"` either, and reversal leaves
`"architecture practice"` and `"developer and operations software"` still matching nothing.
E's probe appeared to demonstrate reversal only because it silently reduced the description to
its head noun first.

The real defect is exact substring matching over free text in **either** direction: four of six
committed packets scored zero on the term weighted highest, so selection fell through to design
anchors — the visual-similarity trap the module's own header warns against. Verified
independently and fixed separately in **PR #266**, kept deliberately out of the prototype stack
and since merged to `main` as `e19c88c`. The fix replaces prose matching with a declared closed
facet vocabulary, makes business relevance a gate rather than a term — so design anchors can
order references but never qualify one — and refuses an undefined business facet outright.

---

## 4. Author style that must not become a factory default

Five sites by one author with unlimited iteration. The following recur and are **outputs**, not
capabilities. Promoting any of them installs exactly the house style `ai-slop-resistance` exists
to catch.

| Recurring | Count | Why it must not be promoted |
| --- | --- | --- |
| Monochrome + one accent | **4 of 5** (all but C) | C broke it only because the domain was *chosen* to force it. A factory does not choose its briefs. |
| Paper-like ground | 4 of 5 | Off-white, warm grey, haar grey. A preference. |
| Hairline rules, ruled tables | 5 of 5 | Author signature, unmistakably. |
| Grotesque display type, tight tracking | 4 of 5 | E chose a grotesque display face *specifically to avoid* the category default. That is a reason to keep the decision, not the typeface. |
| Giant editorial opening statement | 5 of 5 | |
| Restraint as the answer | 5 of 5 | Never once tested against a business for which exuberance is correct. |
| "The conversion is the same shape as the product" | 4 of 5 (paid survey, paid proof, sample pot, 48-hour hold) | Reads as a pattern; is four instances of one author's taste. |
| Sticky diagrams, tide ribbons, colour fields, technical drawings, painted grounds | 1 each | Domain artefacts. Any of them as a preset would be the worst possible outcome of this programme. |

**The generative capability worth extracting is the one that made each appropriate** — the
derivation from business truth — not the artefact it produced.

---

## 5. The Stage B hypothesis, checked against the evidence

The working hypothesis was that the missing layers are approximately: approved business truth →
bounded product/content strategy → executable IA → page narrative → signature-artifact derivation
→ semantic composition → per-section art direction → bounded presentation selection/invention →
responsive recomposition → render/evidence → independent critique.

**Broadly confirmed, with three corrections.**

1. **"Executable IA" and "page narrative" are one thing, and the evidence for them is the
   strongest in the corpus but comes from the *factory* side, not the prototypes.** The rich-truth
   run composed 31 sections over 9,217px and the reviewer's language changed from "sparse" to
   "reduce the copy density… effectively duplicate pages". The largest single gain in that run
   was an IA correction (31 sections → 26, 12,207px → 6,898px, +0.6). The factory "knows what a
   business has and not what a page is for" — that sentence is the most load-bearing in
   `FACTORY-GAP.md` and Stage A does not contradict it.

2. **"Per-section art direction" understates it. The unit that matters is the section *shape*,
   and what is missing is the ability to choose it per section at all** (§3.1). A per-section art
   direction that varied tokens while every section kept the same shape would have produced
   prototype E, which scored 8.5 on pacing with more instruments than anything else in the
   corpus. Note that this is an argument for the *control*, not for a target value of it: the
   corpus shows structural rhythm correlating with pacing and cannot show that more rhythm causes
   better pacing. See the warning under L3.

3. **"Bounded markup/binding invention" is not evidenced as a bottleneck and should be
   deferred.** No prototype needed a novel layout mechanic. The A-era corpus records explicitly:
   *"All three use a plain twelve-column grid. Nothing needed subgrid tricks, scroll-driven
   animation, or a bespoke layout engine."* B, C, D and E are all CSS grid and flexbox. The
   ceiling was never expressive power.

### Capability specifications

Given at the depth the evidence supports. Where evidence is thin the entry says so rather than
inventing detail.

---

#### C1 — Signature-artefact derivation

| | |
| --- | --- |
| **Current failure** | Composition enumerates what a business *has*. Nothing asks what it *produces*. Distinctiveness sat flat at 4.3–4.8 through a content fix, a moment contract, an axis fix and an entirely new direction; it moved only when an architectural assumption changed. |
| **Evidence** | L1 — all five prototypes, `business-specificity` ≥ 9.5, artefact named unprompted every time. Against factory distinctiveness 5.4. |
| **General contract** | Given approved knowledge, propose zero or more candidate artefacts, each with: the facts it consumes, the claim it evidences, a declared data binding, and a stated reason it could not be about another business. **Returning none is a valid, expected answer.** |
| **Schema change** | `ArtefactProposal { id, claim, consumesFacts[], binding, whyNotTransferable, confidence }` on the composition input. |
| **Owner** | A derivation role between knowledge approval and composition. Not the renderer. |
| **Renderer change** | None initially — proposals bind to existing typed figures (C4). |
| **Acceptance** | The proposal names real fact IDs from the pack; the artefact renders from them; removing any consumed fact breaks it. That last is the machine-checkable form of "could not be about another business". |
| **Failure mode** | **Contrived artefacts for businesses that have none.** This is the one to fear. A rule that demands an artefact will manufacture a data model for a plumber. |
| **Migration risk** | Low if it may return none; severe if it may not. |
| **Minimum slice** | One business, one artefact family, and a second business where the correct output is *no artefact* and the run proves it. |

---

#### C2 — Executable IA and page narrative

| | |
| --- | --- |
| **Current failure** | No model of what a page is *for*. Sections are emitted because the business has the facts, so rich truth produced 31 near-duplicate sections. |
| **Evidence** | The factory's own rich-truth run (IA correction was its largest single gain). Prototype route counts are deliberate and small: A 5 route kinds, B 5, E 7 with the commercial route added only after a review found the path incomplete. E's `/crossing` exists because the crossing is the product; `/before-you-book` exists because the disadvantages *are* the product description. |
| **General contract** | A route plan where each route declares its job, its audience question, and the facts that may appear on it. A fact may appear on more than one route only with a stated reason. |
| **Schema change** | `RoutePlan { path, job, question, admissibleFacts[], narrativeOrder[] }`. |
| **Owner** | A strategy role before composition. |
| **Renderer change** | None. |
| **Acceptance** | Every route's job is distinct; no two routes admit the same fact set; total section count is bounded by the plan rather than by the fact count. **No target route count, no target section count and no shape quota appear anywhere in this capability** — the plan's job is to make structure follow the truth, in either direction. |
| **Failure mode** | A five-route template applied to every business — and its mirror image, a quota that makes every business produce *more* structure than it has content for. The mitigation is that route count is derived from the truth and that a plan producing **fewer** routes than the current default is a valid, expected output rather than a degenerate one. |
| **Migration risk** | High — this sits upstream of everything and changes what gets built. |
| **Minimum slice** | Re-run the existing rich-truth business through a route plan and compare section count and reviewer language against the recorded 31-section run. |

---

#### C3 — Deliberate control of structural rhythm

| | |
| --- | --- |
| **Current failure** | Presentations are chosen per section with no model of the sequence, so a page cannot vary its rhythm on purpose even where the content plainly wants it. The failure is the missing *control*, not a missing target value. |
| **Evidence** | L3 / §3.1, **correlational**. B 8.0 (one shape, six attempts), D 8.5, E 8.5 (one shape, most instruments in the corpus), C 9.0 (six grounds), A 9.5 (four band heights). |
| **General contract** | A page composition plan that may assign a section a *shape* — measure, ground, density, band height, full-bleed — **where the section's job calls for one**, and that records the sequence it chose. |
| **Schema change** | `SectionShape` enum + `CompositionPlan { sections: [{ shape, ground, band, becauseSectionJobIs }] }`. **No `varietyFloor` field.** Each shape choice carries the narrative reason for it, which is what makes the plan reviewable and what a quota would let it skip. |
| **Owner** | Composition. |
| **Renderer change** | Renderers must accept a shape and a ground per section rather than a whole-site theme. |
| **Acceptance** | Every shape choice names the section job that motivated it; the review packet records the shape sequence so a human can check it against the pacing score. **No minimum distinct-shape count is asserted** — a uniform sequence is a valid plan when every section has the same job, which is a document, and the corpus cannot distinguish "uniform because unable" from "uniform because appropriate". |
| **Failure mode** | Variety for its own sake. Alternating grounds arbitrarily is decoration and will read as such — and a diversity floor is the fastest way to manufacture it, because a generator satisfying a quota produces variation that answers the metric rather than the content. |
| **Migration risk** | Medium — touches every renderer. |
| **Minimum slice** | The blinded identical-content experiment: two builds differing only in structural rhythm, reviewed blind. That establishes whether the correlation is causal *before* any contract is strengthened. |

---

#### C4 — Typed, domain-neutral figure primitives

| | |
| --- | --- |
| **Current failure** | Nothing to render a derived artefact into, so C1 has no target. |
| **Evidence** | Reading the five artefacts *as types* rather than as designs: A is a proportional register (quantity → size), C is a computed swatch matrix (input → transformed output), D is a categorical grid + scatter + control, E is a state ribbon over time, B is a state graph. Four of the five are one of three shapes. |
| **General contract** | A small set of typed figures — proportional register, state-over-time band, categorical matrix, annotated series — each taking a data binding and a declared basis (L8), each with its own responsive recomposition (L4). |
| **Schema change** | Figure type registry with per-type binding contracts. |
| **Owner** | Renderer. |
| **Renderer change** | Substantial and additive. |
| **Acceptance** | Each figure renders from binding alone; each declares its basis; each recomposes rather than scales; the axis/legend survives at 390px. |
| **Failure mode** | **The registry becomes five presets and the factory produces tide ribbons for accountants.** The types must be shapes of *data*, never shapes of *site*. |
| **Migration risk** | Medium. |
| **Minimum slice** | One type — the proportional register is the best-evidenced and the least domain-specific. |

---

#### C5 — Responsive recomposition that reaches a renderer

| | |
| --- | --- |
| **Current failure** | `ResponsiveCompositionPlan` is specified in `docs/VISUAL_EXCELLENCE.md` §3 with the right capability list and **no renderer consumes it**. |
| **Evidence** | L4, including the programme's only controlled comparison (6.8 → 7.0 → 8.0). |
| **General contract** | Per-breakpoint arrangement — order, grouping, crop — as a first-class output. |
| **Schema change** | The plan exists; what is missing is an arrangement output rather than a class name. |
| **Owner** | Renderer + gate. |
| **Renderer change** | One renderer, one section type, to prove the path. |
| **Acceptance** | The small viewport is scored *as a composition*. Horizontal overflow was zero in all three of the failing attempts, so the existing check cannot see this. |
| **Failure mode** | Breakpoint proliferation. |
| **Migration risk** | Low if scoped to one section type. |
| **Minimum slice** | The existing spec, one renderer, one type. |

---

#### C6 — Semantic palette contract · C7 — Claim basis · C8 — Evidence completeness · C9 — Rework ledger

Four small mechanical capabilities, each with a clear contract and low risk: L5 (semantic vs
surface colour, enforced in the lint that already exists), L8 (a figure may not render without
its basis), L9 (declared routes/states vs captured routes/states, fail loudly), L10 (record that
a prescription was tried and measured worse). None is a research problem. All four are cheap and
should ride along with whichever slice goes first.

---

## 6. The first slice

**Recommendation: C2 — executable IA and page narrative.**

Not signature-artefact derivation, which is the more exciting result and the one the corpus
supports most strongly.

**Why.** The artefact finding is the strongest *description* of what good output has, and the
weakest *lever*, because it cannot be evaluated without somewhere to put the artefact (C4) and a
page worth putting it on (C2). Building C1 first means building a derivation whose output lands
in a 31-section page that the reviewer already calls "effectively duplicate pages" — the artefact
would be correct and invisible.

C2 is the only candidate where the failure is **already measured on factory output rather than
inferred from prototypes**: the rich-truth run's largest single gain was an IA correction, and its
reviewer language changed from "sparse" to "reduce the copy density" the moment truth got rich.
That is a controlled observation on the real system, which is a different quality of evidence from
five hand-built sites by one author.

It is also upstream of everything else, so getting it wrong later is far more expensive.

**Files and contracts likely to change**

- a new route-plan contract in `packages/contracts` (generated family)
- the composition input in the pipeline that currently enumerates facts into sections
- `config/agent-pipelines.json` — one new role between knowledge approval and composition
- the review packet, to carry the route plan so a reviewer can see what each route was *for*

**Deliberately unchanged**: renderers, the presentation registry, the v2 rubric, the visual gate
thresholds, art direction, asset planning.

**Synthetic acceptance fixture.** A business with rich approved knowledge and an obvious
narrative — enough facts to tempt the current composer into 25+ sections. Assert: every route's
job is distinct; no two routes admit the same fact set; section count is bounded by the plan.

**Negative / control fixture — the one that matters most.** A business with *thin* truth: one
Companies House line, empty trust signals, no client-facing proposition. The assertion is not
merely that the plan is different — it is that **the planner can choose LESS structure as readily
as more**. Concretely: the thin-truth plan must produce strictly fewer routes than the rich-truth
plan; it must produce fewer sections than the current composer emits for the same input; every
route it does produce must name the job that justifies it; and it must be able to return a
single-route plan without that being treated as a failure.

A capability that can only ever add structure is a template with a variable in it. If this
fixture cannot be made to pass without special-casing, C2 is wrong and should be abandoned rather
than tuned.

**Deterministic tests.** Route jobs distinct; fact admissibility respected; the same truth
produces the same plan; a fact appearing on two routes carries a reason; route count varies with
truth volume **in both directions**; a thin-truth plan is smaller than the current default output
rather than merely differently shaped.

**Visual before/after.** Re-run the recorded rich-truth business, which has a committed baseline
at 6.644 / 31 sections / 9,217px on the old scale. Compare section count, page height and
reviewer language. **Compare on the same scale as the baseline** — this is the one place a
factory-to-factory comparison is legitimate.

**How we stop it becoming another template.** The negative fixture above, plus a cross-build
check across the six canonical acceptance apps: if all six produce the same route shape, the
capability has failed even if every individual build improved.

That cross-build check is an **anti-template diagnostic, not a diversity target**. It asserts that
six materially different businesses do not converge on one shape; it does not ask any single plan
to hit a variety score, and nothing in C2 rewards a plan for being more varied than its content
warrants. The distinction is the same one L3 draws, for the same reason: a quota is satisfied by
producing variation that answers the metric rather than the business.

**Rollback boundary.** The route plan is an additional input. If absent or rejected, composition
falls back to current behaviour. One flag, one code path.

**What would tell us the hypothesis was wrong.** Section count falls, page height falls, and the
review score does not move — or moves down. That would mean the 31 sections were not the problem
and the constraint really is the component vocabulary, which is the competing hypothesis
`docs/PHASE_4D_VISUAL_DEBT.md` §3 has held all along.

---

## 7. Motion evidence

**Recommendation: do it first, before the C2 slice. It is small, and it is a measurement
prerequisite.**

The justification is measurement value, not novelty. `interaction-craft` is currently **unscorable
above about 8.5**: E captured 18 states and every one of its four reviews capped the criterion with
the same sentence — *"the evidence is static, so transition quality, touch behaviour, tooltip
keyboard operation and live-update smoothness cannot be judged."* A ceiling in the instrument means
any Stage B work that improves interaction cannot be measured, and unmeasurable improvement is how
this programme has repeatedly wasted rounds.

It is also the cheapest thing in this document, and it fixes a known blind spot: 14 of 15 states
were silently dropped from E's packet by one wrong manifest key.

**The smallest general addition**

Not video. A **frame sequence**: for each declared interaction, three stills — before, during,
after — plus a manifest entry carrying route, viewport, trigger, and what the interaction is
*for*. Three PNGs and four fields; no encoder, no player, no new artefact type in the review
packet beyond an ordered group.

- **Bounded by relevance, not by site.** Sequences are produced only for interactions the
  composition declares as load-bearing. A brochure site with a nav and a footer produces none, and
  that is the correct output.
- **A reduced-motion counterpart** for any sequence whose middle frame differs from its endpoints
  — which also makes the reduced-motion path evidence rather than an assertion.
- **Completeness assertion** (C8): declared interactions and packaged sequences must match, and
  the run fails loudly when they do not.

**Sequencing.** Motion evidence first because it is days rather than weeks, it unblocks
measurement of a criterion that is currently pinned, and it carries the C8 completeness assertion
that three of E's six defects needed. C2 second, with a measurement instrument that can see what
it changes.

---

## 8. Hypotheses rejected rather than generalised

Recorded because a synthesis that only lists what it believes is not evidence.

1. **"Composition-pacing is instrument-limited."** Contradicted by E (most instruments, no
   movement) and by A's own verdicts (pacing moved 8.5 → 9.0 → 9.5 under iteration). Replaced by
   the section-shape reading, §3.1.
2. **"The `selectReference` containment runs the wrong way."** Reversal fixes nothing; the defect
   is exact substring matching in either direction. §3.2, fixed in #266 (merged).
3. **"Motion does not matter."** The A-era corpus concluded this from three sites with one
   animation between them. It is now known to be an artefact of the harness: the criterion cannot
   exceed ~8.5 because the evidence is static. The old finding was true of what could be seen.
4. **"The conversion should be the same shape as the product."** Four of five, and no
   counterexample was ever attempted. Four instances of one author's instinct is not a pattern.
5. **"Rich business truth is the bottleneck."** Explicitly tested and refuted: the factory scored
   6.644 on rich truth against 6.70 on thin truth. Budget belongs on what the factory does with
   truth.
6. **"A bigger component vocabulary is the answer."** Not contradicted, but not supported either —
   no prototype needed a layout mechanic the factory lacks. All five are plain grid and flexbox.
   Deferred rather than rejected: it remains the competing hypothesis that the C2 slice tests.
7. **"Restraint is correct."** Five of five. Never tested against a business for which it is
   wrong, so it is currently indistinguishable from the author's taste.
8. **"The prototypes show the factory can reach this quality."** They show one model can,
   unconstrained, hand-built, with up to fifteen review rounds. The distance between that and a
   generated build is the entire Stage B programme.

---

## 9. Status

Stage A is frozen. No further bespoke prototypes.

Nothing in this document has been integrated into the factory, and none of it should be until
the first slice is measured on generated output on the scale its baseline was recorded on.
