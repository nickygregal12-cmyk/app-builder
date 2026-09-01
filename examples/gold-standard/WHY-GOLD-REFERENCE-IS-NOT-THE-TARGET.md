# Why the Gold Reference corpus is not the target

The three prototypes in `examples/gold-reference/` pass the repository's visual gate — 8.663,
8.500 and 8.625 on the comparable eight criteria, independently reviewed, against a factory
best of 6.644 on the same business and the same truth. That result stands, and it is worth
what it cost: it proves the ceiling is the factory's constraints rather than the model.

**It is not the standard this programme targets.** The owner reviewed those sites manually and
rejected them as a Gold Standard, and on re-inspection that judgement is correct. This file
records why, specifically, because "make it better" is not an instruction anyone can act on.

The gate they passed measures whether a site is *competent, coherent and appropriate*. It does
not measure whether a site is *authored*. All three are tasteful, restrained, professional and
clean — which the new brief names explicitly as the thing to reject.

---

## Ardwell & Roe — against a Kononenko-class reference

**The work index is a card grid wearing a different coat.** Four projects, alternating
left/right, image beside metadata, every entry the same height, the same crop scale, the same
components in the same order. Alternating the side is not composition; it is a zigzag
template. A premium architecture site gives its projects *unequal* weight — one at full bleed,
one as a pair, one as a detail crop — because the projects are not equally important and the
page should say so.

**Photography does not dominate; it negotiates.** After the hero, no image exceeds roughly
half the measure. The largest project image is about 45% of viewport width. In the reference
class the image *is* the page: full-bleed, edge-to-edge, frequently 100vh, occasionally
bleeding under type. Here photography is placed politely beside paragraphs.

**The outcome figure became a template slot.** "First submission", "Less glass", "3 weeks
early", "1.9 m³/h·m²" — four projects, four identical devices, same position, same size, same
rule above. Invented once as an editorial idea, repeated four times it is a component.

**The rhythm is metronomic.** Section, hairline rule, section, hairline rule, at near-identical
intervals for the length of the page. There is no acceleration, no held pause, no moment where
the page changes register.

**It reproduces the exact pattern the factory was criticised for.** A dark testimonial panel
followed by a dark closing call-to-action rectangle. `docs/PHASE_4D_VISUAL_DEBT.md` §3 names
"a dark closing CTA rectangle" as one of the four primitives that make every factory candidate
read as template-derived. The prototype built one by hand.

**Dead space with nothing in it.** A large empty band sits between the fact table and "Selected
work". Empty space is a material only when something is being held apart; here it is a gap.

Verdict: a good editorial website. Not a Kononenko-class website.

---

## Marram — against an Aesop-class reference (curation and restraint)

**The register is the strongest idea in the corpus and is still rendered as a grid.** On
desktop it is four equal columns of identical cells: same plate ratio, same crop, same
metadata block, same season bar. Twelve equal things in a grid is the definition of the
pattern the programme is trying to escape, however good the underlying idea is.

**Every image is the same size and the same shape.** Twelve plates, one aspect ratio, one
scale. No plate is ever given a page to itself. The one genuinely distinctive artefact in the
corpus is never shown at the scale that would make it a moment.

**The site is one column of full-width horizontal bands.** Hero, register, gardens, quote,
offer, footer. That silhouette is shared with the other two prototypes.

**The mobile recomposition — a lead plate per chapter, then compact records — is the single
best piece of design in the corpus**, and it is the thing worth carrying forward. It is also
the only place in three sites where a different arrangement was authored rather than a
stacking rule applied.

Verdict: one excellent idea, presented at uniform scale in a uniform grid.

---

## Plumbline — against a Linear-class reference

**The product does not work; it is a static table.** The brief for this class requires that a
visitor understand the software partly by seeing it operate — state, sequence, before/after,
interaction. Plumbline shows one artefact, once, static. A reviewer can read it. Nobody can
watch it do anything.

**One surface, not a product.** A tool of this kind has a CLI, a pull-request comment, a plan
history, a policy configuration, a diff. The site depicts exactly one of those. Linear-class
means several believable surfaces at several scales, each earning its place.

**The silhouette is the generic one with rules instead of cards.** Hero, artefact, three
statistics, two-column, two-column, closing ask, footer. Removing card borders and adding
hairlines does not change the sequence, and the sequence is what reads as generic.

**A large void in the hero.** The right column holds a short caption and then roughly 400px of
nothing above the plan. That is not restraint.

**Typography is one grotesque at three sizes.** There is no typographic authorship — no scale
contrast worth the name, no second voice, no moment where type carries the page.

Verdict: a clean technical landing page. Not a product story.

---

## What all three share, which is the real finding

Put the three home pages side by side and remove the wordmarks. They differ in colour and in
typeface. They do **not** differ in:

- **silhouette** — all three are a single column of stacked full-width horizontal bands;
- **image scale** — no prototype ever gives an image the full viewport after its hero;
- **collection presentation** — all three render their main collection as a uniform repeating
  module at one scale;
- **section rhythm** — all three alternate content band and hairline rule at even intervals;
- **hierarchy within a collection** — in all three, every item gets equal visual weight;
- **the closing move** — all three end with a heading, a sentence and a button.

That is one design system in three palettes. By the diversity test in the new brief — remove
the logos, and if they look like variants of one system, the stage has failed — the Gold
Reference corpus fails, and it fails for a reason worth naming precisely:

> **Each prototype authored a distinctive *artefact*, and then laid that artefact out with the
> same generic *page grammar*.** The register, the frame and the plan are genuinely different
> ideas. The pages that contain them are the same page.

The corpus proved the model can invent a signature object. It did not prove the model can
compose a page around one. **That is the actual capability this programme has to establish**,
and it is why the targets are raised to a 9.0 mean, an 8.0 floor and 9.0 on distinctiveness:
those numbers are not reachable by a better artefact inside the same silhouette.

---

## What carries forward

Not everything here is a failure, and the new prototypes should inherit:

- **The signature-artefact question** (`gold-reference/FINDINGS.md` F1) — ask what the business
  hands its customer. It was right; it was just not enough on its own.
- **Marram's mobile recomposition** — a lead item at full width, then records. The only
  authored responsive decision in the corpus, and it moved a criterion 7.0 → 8.0.
- **Arithmetic attached to claims** (F2) — Plumbline's lock bars drawn against a stated budget
  rather than the worst value in the set.
- **The evidence discipline** — independent, different-vendor review; failing verdicts kept;
  harness defects disclosed. `gold-reference/REVIEW-METHOD.md` stands unchanged.
- **The harness itself** — the scroll-and-stitch capture and panel segmentation in
  `gold-reference/marram/capture.mjs` and `shrink.mjs` are reused here rather than rewritten.
