# Prototype C — Marlpit

Generation 2, site 3. Commerce and editorial, with photography and a large catalogue.

Built to answer one question the programme had actually earned: **composition-pacing scored
lowest on both previous prototypes — 8.0 on Interlock across six runs, and pacing was
Nørreværk's weakest area too. Is that domain-specific, or is it ours?**

**It was ours, and it was a missing instrument.** Prototype C scored `composition-pacing` **9.0
on both runs, first time, without a single iteration aimed at it.**

---

## The result

| | v1 | v2 |
| --- | --- | --- |
| Mean | 9.385 | **9.308** |
| Floor | 9.0 | **9.0** |
| Holistic tier | exceptional | **exceptional** |
| Benchmark gap | MATERIAL | **SMALL** |

Final criterion scores (v2):

| Criterion | | Criterion | |
| --- | --- | --- | --- |
| art-direction | 9.5 | responsive-recomposition | 9 |
| business-specificity | **10** | brand-fit | 9.5 |
| information-architecture | 9 | commercial-clarity | 9 |
| visual-hierarchy | 9 | ai-slop-resistance | **10** |
| typography | 9 | memorability | 9.5 |
| composition-pacing | **9** | | |
| visual-material | 9 | interaction-craft | 9.5 |

### Every acceptance condition met

For the first time in this programme:

- mean ≥ 9.0 — **9.308**
- criterion floor ≥ 8.0 — **9.0**, the highest floor recorded
- art-direction ≥ 9 — 9.5
- business-specificity ≥ 9 — **10**
- visual-material ≥ 9 — 9
- interaction-craft strong and evidenced — 9.5, on nineteen captured states
- responsive-recomposition ≥ 8.5 — 9
- ai-slop-resistance ≥ 9 — **10**
- holistic tier exceptional or better — exceptional
- benchmarkGap NONE or SMALL — **SMALL**

**Read the two runs together, not the better one.** The mean fell from 9.385 to 9.308 while the
benchmark gap improved from MATERIAL to SMALL, and individual criteria moved both ways —
interaction-craft 9 → 9.5, visual-material 9.5 → 9, responsive 9.5 → 9. That is the same
run-to-run noise measured on prototype B (±0.08 on the mean, a whole step on the gap), and
reading the 9.385 as the result would be reading noise as signal.

---

## What answered the pacing question

Prototype B was monochrome. Its only pacing instrument was vertical space, and six attempts to
vary the rhythm with it — capped padding, a large-type statement, two densities of rule set,
phase headings, an exposure chart — moved the score not at all. The final note explained why,
structurally: a sticky drawing beside a long list leaves an empty lower-left, and no amount of
content fills it.

This site has a second instrument. It is a sequence of **painted fields**: a warm white opening,
a mid green for the light box, a near-black for the pigment argument, then thirty-six colours
edge to edge with no page margin at all, then a light ground for the paints, then a deep red for
the ask. Value and density change six times before the footer, and the change is carried by the
ground rather than by the gap between things.

The reviewer's note on the criterion is about density, not emptiness: *"the mobile catalogue and
technical records create prolonged stretches of similar density, and the recurring dark footer
can make several endings feel alike."* That is a different and much smaller problem than
under-composition.

**Provisional conclusion: composition-pacing on a monochrome site is limited by having one
instrument, not by the author.** That is a finding about technique and it is worth one more
prototype before it is trusted.

---

## The product, and why it forced a different site

**Marlpit** makes mineral paint — limewash, silicate, clay distemper and lime-casein — for
solid-wall and historic buildings, in thirty-six colours. Fictional company; the pigments, the
paint chemistry and the building science are real.

The domain was chosen for two reasons, and the second is about the programme rather than the
site.

**The product is colour**, so a site that rendered it as small squares on a white page would be
evading its own subject. Hence: no page ground, only painted sections, with the ink computed per
ground.

**A and B had both converged on the same author signature** — off-white, hairline-ruled,
monochrome with a single accent, restrained. A third would have proved a habit rather than a
capability. This domain refuses it.

### The computed artefacts

Three, and the discipline is the same one that produced the previous two prototypes' strongest
scores: nothing that could be hand-picked is.

- **The light box** renders each colour under four illuminants by a stated von Kries-style
  transform applied in linear light. Hand-picking those four would be exactly how a paint company
  fakes this, so they are computed — and the site says on the same screen that the result is an
  approximation, because the limitation *is* the argument for buying a sample pot.
- **Light reflectance** is relative luminance, derived from the colour. Thirty-six hand-typed LRVs
  would have been thirty-six numbers that flattered whatever they sat beside.
- **The ink** on every ground is chosen by measuring contrast against both inks and taking the
  better. The first version used `lrv > 42`, a threshold picked by eye, and it was wrong by more
  than twenty points — ten colours were being given the *worse* of the two inks at ratios under
  3:1.

That last one produced the most interesting constraint on the site. With one dark ink and one
light ink, the worst case sits where the two are equally bad, and **even pure black on pure white
only reaches 4.58:1 there**. Seven of the thirty-six cannot carry body copy at 4.5:1 and no
choice of inks fixes it. So prose sits only on grounds that clear the bar, swatch labels are set
at a size where 3:1 applies, and `ctest.mjs` fails the build if either rule is broken. A paint
made for a wall is not thereby a background for a paragraph.

---

## What the review asked for, and what changed

The v1 review's one `reference-substantially-stronger` was information architecture: *"Aesop
resolves a far larger catalogue... without losing findability."* Two things followed, and both
are real gaps rather than presentation fixes:

1. **No filtering** in a thirty-six item catalogue. Added on the two axes people actually arrive
   with — pigment family, and light reflectance band for "something light for a north room."
2. **No transactional control**, which for the commerce prototype was the largest miss. Added the
   sample box: a four-pot mechanic with a masthead count, a live region announcing each change,
   a refusal when full, and a box page that renders from storage — so its empty state is real
   rather than hypothetical.

Wide-width type was raised for the third time in this programme; it has now been a finding on all
three prototypes.

---

## Cross-prototype findings — three sites, still provisional

### Now supported by three

1. **Compute the artefact from the model.** Floor-area register, network solver, chromatic
   transform. All three scored 9.5 or 10 on business-specificity, and in all three the reviewer
   named the computed artefact as the reason.
2. **A one-sentence thesis, held everywhere.** "Existing buildings as measured evidence"; "the
   site is a drawing sheet"; "the site is painted". All three scored art-direction ≥ 9.
3. **Interaction states must be captured or the criterion is scored on nothing.** 0 states → 6.5;
   13 states → 9; 19 states → 9.5.
4. **Wide-width type is a persistent blind spot of mine.** Flagged on all three.

### Newly answered

5. **Composition-pacing is instrument-limited, not author-limited.** See above. This is the first
   question the programme posed in advance and then answered.

### Still one data point

6. **Chromatic art direction.** One site. Nothing to say about whether it generalises.
7. **A commerce mechanic that refuses to be a basket.** The sample box works and is right for this
   business. Whether "the conversion should be the same shape as the product" is a pattern or
   three instances of one author's taste is not yet decidable — though it is now three for three
   (paid survey, paid proof, sample pot).

### Still dangerous to promote

- **The house style did break.** Three sites, three genuinely different visual languages. That is
  the most reassuring result here and it is also the one most likely to be luck: I chose the
  domain *specifically* to break it. A factory does not get to choose its briefs.
- **Every one of these is hand-built by one author with unlimited iteration.** Nothing here has
  been produced under factory constraints, and the gap between "a person can do this" and "the
  system can do this" is the whole remaining programme.

**Recommendation: do not integrate.** Continue to prototype 4 (research/data), which has a large
IA and no photography and no colour-as-product — and which will test finding 5 properly, because
if pacing was an instrument problem then a data site with only typography and charts should
struggle again.
