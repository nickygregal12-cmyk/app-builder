# Nørreværk against the Kononenko class — brutal read

Written before any code change, under the v2 rubric on `feature/visual-quality-resolution`.
No score from my own harness is cited as evidence for anything below; the diagnosis is from
looking at the renders in `evidence/v8/`.

## First, the thing I have to own

The re-evaluation in that PR says the old prompt disclosed the bar, and that three prototypes
came back at 8.50, 8.56 and 8.71 against a stated target of 8.5. I checked that against my own
harness rather than accepting it: **the bar-disclosing prompt is at
`tooling/lib/codex-visual-reviewer.mjs:221` — the factory's reviewer — and none of the three
prototype reviewers in `examples/gold-reference/*/review.mjs` mention 8.5 at all.**

That correction does not rescue anything. It relocates the contamination onto the *factory*
side of the comparison in `gold-reference/FACTORY-GAP.md`: the 6.70, 6.64 and 5.38 figures
were produced by a reviewer that was told the bar. And the substantive charge against my
numbers stands untouched — **five of the thirteen criteria were never put to my reviewer**
(`art-direction`, `information-architecture`, `typography`, `interaction-craft`,
`ai-slop-resistance`), the scale had no defined meaning, and no pairwise benchmark comparison
was ever made. Four of those five are precisely where this prototype is weakest, which is not
a coincidence: I was iterating against a rubric that could not see its own worst faults.

Today's session ran that same blind harness eight times, from 7.889 to 8.556. Those numbers
should be read as a record of what I was optimising, not as a measurement.

---

## The fifteen

### 1. First five seconds
**Weak.** You see a serif sentence four lines deep and a six-cell fact grid. You do not see a
building. For a practice whose entire argument is *buildings*, the first photograph arriving
below a statistics block is the wrong order. I took "photography is rationed on home" from the
reference study and applied it as "photography is deferred on home", which is not the same
decision.

### 2. Overall silhouette
**Generic.** Full-width band, full-width band, full-width band, at identical vertical padding
(`--band` on every section). The rubric names *identical section padding* as an AI-slop
signal, and this page has literally nothing else. `composition-pacing` says ten competent
sections with identical vertical rhythm is a 5 or 6 **regardless of how good each one is** —
that is this page.

### 3. Hero / opening
**This is a vague giant hero statement.** "A bureau for buildings that already exist." set at
200px is the first item on the anti-slop list. It reads as a tagline enlarged, not as a
composition. The reference class opens with the practice's *name* against hard credentialing
facts, and lets the positioning be a subordinate line. Mine inverts that and inflates the
soft half.

### 4. Typography
**Competent, not compositional — caps at 8, sits at about 7.** Two families, sane scale, sub-1
line heights. But the display face is `Times New Roman` as a system fallback, and every piece
of small text is the same 12.5px uppercase grey label. The rubric: *"An 8 shows craft in the
small text — metadata, captions, labels — not only the headline."* My metadata has no craft in
it; it is one label style applied eleven times.

### 5. Image scale and cropping
**Under-scaled.** Two frames run edge-to-edge; every other image sits inside a 30px gutter and
a 15-column span. The reference class runs project images at effectively full viewport with a
1.5% side margin. The three-ratio discipline is real and is working, but the *scale* is
timid — the largest index image is under half the viewport width.

### 6. Project presentation
**The clearest single miss.** The brief asks for *project metadata becoming composition rather
than small card text*. Mine is small card text: name, a grey sub-line, and an area figure set
at 16px hard right. The area range is 334 m² to 18,600 m² — a 55× spread that is the most
interesting fact in the data — and it is rendered as a caption. That number should be
compositional material at display scale, and is not.

### 7. Page rhythm
**One rhythm throughout.** No density change, no tension and release, no section that is
deliberately quiet or deliberately loud. The manifesto and the survey and the recognition list
all occupy the same measure at the same weight.

### 8. Information architecture
**Conventional.** Home / Work / Work detail / Bureau / Contact is the default architecture for
a practice site. Nothing is previewed in a way that earns a click; nothing is deliberately
withheld. The one editorial decision — three of five on home — is stated in a 12px label.

### 9. Navigation
**The strongest element.** `mix-blend-mode: difference`, no bar, no background, no scrim,
inverting over paper and over a dark photograph. This one is genuinely right and should
survive any redesign.

### 10. Detail route quality
**Half-built.** The full-bleed opening with the name below it works, and "next work" is right.
But the *pair* — the signature — is two prose columns at different heights with a photograph
under each. It is a layout, not a moment. The one idea nobody else could use is rendered as
the most ordinary thing on the page.

### 11. Mobile
**The most improved and probably genuinely an 8.** Authored crops from the three permitted
ratios, and weight carried by width — the 18,600 m² project bleeds past both margins, the
334 m² one is inset. That is a decision made for the phone. It is also the only part of this
prototype I would defend without qualification.

### 12. Micro-craft
**Thin.** A 1.03 image scale on hover and an underline that wipes in. Focus states are the
browser default plus an outline. The evidence captures no states at all, so under the rubric
this cannot be scored above what is visible — which is very little.

### 13. Business specificity
**Reasonable but layout-independent.** The proposition drives the "as found / as left" pair,
the "buildings on empty sites — None" fact, and "send us a building". Those are real. But the
*composition* would carry any architecture practice unchanged, and the rubric is explicit that
colour and copy changes are not specificity.

### 14. Memorability
**No signature moment on home, a weak one on detail.** Asked to name something belonging to
this site and no other, the honest answer is "the as-found/as-left pair", and then to admit it
looks like a two-column section. Under the rubric that observation caps `memorability` at 6.

### 15. AI-slop signals — the full list, unsoftened
Five of the named patterns are present and most are defaults rather than decisions:

1. **Vague giant hero statement** — the entire opening.
2. **Meaningless eyebrow text** — "SELECTED WORK", "PUBLISHED", "RECOGNITION", "THE SURVEY",
   "WORTH KNOWING". Some metadata labels earn their place; these are section titles in
   disguise.
3. **Generic KPI row** — six facts in six identical bordered cells is a stats grid with
   hairlines instead of cards.
4. **Identical section padding** — one `--band` value everywhere.
5. **Premium minimalism produced mainly by empty space** — named explicitly in the rubric, and
   a fair description of the voids between sections here.

---

## Honest position

Estimated under v2, and deliberately not run through my own compromised harness:

| criterion | est. | why |
| --- | --- | --- |
| art-direction | 7 | coherent, a point of view, but a sequence of components |
| business-specificity | 8 | proposition drives content, not composition |
| information-architecture | 7.5 | sensible routing, little visible editing |
| visual-hierarchy | 7.5 | clear first read, no modulation between pages |
| typography | 7 | competent; small text has no craft |
| composition-pacing | 6.5 | identical rhythm throughout |
| visual-material | 7.5 | good photographs, timidly scaled |
| interaction-craft | 6.5 | little, and little captured |
| responsive-recomposition | 8 | authored crops and weights |
| brand-fit | 8 | right register for the business |
| commercial-clarity | 7 | the survey is now stated properly |
| ai-slop-resistance | 6 | five named patterns, mostly defaults |
| memorability | 6.5 | nameable moment, ordinary execution |

**≈ 7.2 — professional, edging strong-professional.** Against targets of 9.0 mean, nothing
below 8, art-direction ≥ 9 and slop-resistance ≥ 9, this is not close, and the gap is not in
spacing or type sizes. It is that **the page is a stack of full-width bands with one rhythm,
and its most interesting material — a 55× range of building sizes and a genuinely unusual
proposition — is rendered as captions.**

## What a redesign has to change, not tune

1. **Kill the tagline hero.** Open on the practice, the facts and a building — the positioning
   line becomes subordinate, and something is *shown* in the first screen.
2. **Make the area figure compositional.** 18,600 and 334 set at display scale, as the
   organising material of the index rather than as right-aligned captions.
3. **Break the single band rhythm.** Sections need different densities and different heights,
   including at least one that is deliberately quiet and one that is deliberately loud.
4. **Rebuild the pair as a moment**, not two columns — the one thing this business owns.
5. **Delete four of the five eyebrow labels** and let position and scale do the work.
6. **Replace the six-cell fact grid** with something that is not a KPI row.
7. **Real fonts.** A system-fallback Times is not a typographic decision.

Nothing on that list is a spacing change, and none of it can be reached by iterating the
current composition — which is what the last eight rounds of this session were doing.
