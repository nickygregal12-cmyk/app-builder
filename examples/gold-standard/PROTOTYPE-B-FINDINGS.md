# Prototype B — Interlock

Generation 2, site 2. A premium technical product website, built to test whether the
Nørreværk result depended on architecture handing us excellent photography.

**It did not.** This site has no photographs at all. Its visual material is the product.

---

## The result

Measured by the repository's own v2 instrument — `tooling/lib/codex-visual-reviewer.mjs`,
different vendor, bar withheld from the reviewer, ceilings from the reviewer's own
observations, pairwise against a benchmark chosen by problem shape.

| | v1 | v2 | v3 | v4 | v5 | v6 |
| --- | --- | --- | --- | --- | --- | --- |
| Mean | 8.615 | 8.846 | 8.923 | **9.000** | 8.923 | 8.923 |
| Floor | 7.5 | 8.0 | 8.0 | 8.0 | 8.0 | 8.0 |
| Holistic tier | strong-professional | exceptional | exceptional | exceptional | exceptional | exceptional |
| Benchmark gap | MATERIAL | MATERIAL | SMALL | MATERIAL | SMALL | MATERIAL |

Final criterion scores (v6):

| Criterion | Score | | Criterion | Score |
| --- | --- | --- | --- | --- |
| art-direction | 9 | | responsive-recomposition | 9 |
| business-specificity | 9.5 | | brand-fit | 9 |
| information-architecture | 8.5 | | commercial-clarity | 9 |
| visual-hierarchy | 8.5 | | ai-slop-resistance | 9.5 |
| typography | 8.5 | | memorability | 9 |
| composition-pacing | **8** | | | |
| visual-material | 9.5 | | | |
| interaction-craft | 9 | | | |

### Read this before reading the numbers

**The instrument has run-to-run noise of about ±0.08 on the mean and a whole step on the
benchmark gap.** v3, v5 and v6 are the same site to within one criterion and returned
8.923 / SMALL, 8.923 / SMALL, 8.923 / MATERIAL. v4 returned 9.000 / MATERIAL. Treating the
difference between 8.923 and 9.000 as movement would be reading noise as signal, and the
honest statement is that **this site sits at the 8.9–9.0 boundary**, not that it cleared or
missed a threshold.

Against the acceptance conditions set for this prototype, v6 meets every one except the mean:

- mean ≥ 9.0 — **8.923**, measured at 9.000 on one of six runs. At the boundary.
- floor ≥ 8.0 — met
- art-direction ≥ 9 — met
- business-specificity ≥ 9 — met at 9.5
- visual-material ≥ 9 — met at 9.5
- interaction-craft strong and evidenced — met at 9, on thirteen captured states
- responsive-recomposition ≥ 8.5 — met at 9
- ai-slop-resistance ≥ 9 — met at 9.5, and 10 on one run
- holistic tier exceptional or better — met
- benchmarkGap NONE or SMALL — **met on three of six runs**; MATERIAL on the other three

## What did not move

`composition-pacing` scored **8.0 on all six runs** and is the one criterion that resisted
every intervention. Four separate fixes were aimed at it — capping section padding, adding a
single large-type statement to break the two-column rhythm, splitting the eight rules into two
registers of different density, adding phase headings inside the step lists, and finally filling
the sticky column with the exposure profile. The score did not move once.

The final note explains why, and it is a real structural property rather than a defect that was
missed: *"several desktop and wide compositions leave conspicuously empty lower-left areas
beside long procedural columns; this expresses a sheet grid but occasionally feels
under-composed rather than tense."* A sticky drawing beside a long list produces empty space
under the drawing, and that is inherent to the layout that makes the artefact work. Fixing it
properly means a different relationship between the two columns, not more content in one of
them.

That is worth recording as a finding rather than grinding at: six attempts is enough evidence
that the remedy is architectural.

---

## The product

**Interlock** proves high-voltage switching schedules against a network model before anybody
opens a switch. Fictional company, real regulatory framework.

The hypothesis under test was that for a product site, **the product itself should be the
visual material**. So the site does not begin with marketing copy and a generic screenshot. It
begins with a network model, and everything on it is rendered from that model:

- `src/data/network.ts` — 21 plant items as a graph, with authored drawing geometry
- `src/lib/energise.ts` — reachability from source through closed plant; a transformer is an
  ordinary two-way edge, which is the whole point
- `src/lib/prove.ts` — walks a schedule through the model one operation at a time

**The refusal is computed, not asserted.** The draft schedule isolates transformer T2 at 33kV
and earths it, while T2 remains bolted to a backfed 11kV busbar through a breaker no step
opens. The solver finds an earth device closed onto a node still reachable from a source, and
walks the graph to report the live path: `T2 → T2-11-CB → BS-11 → T1-11-CB → T1 → T1-33-CB →
T1-33-DS → INC-1`. Nothing in the page says that; the model does.

The reviewer named the signature moment unprompted:

> "Selecting switching step 07 and watching the earth close onto a conductor that stays
> energised red while the interface names the exact live-through path and refuses the schedule."

### Art direction

**The site is a drawing sheet; the product is the drawing.** Warm paper rather than a dark
technical interface — this product's artefact is a document that gets printed, signed and
carried into a substation, and a dark theme would be borrowed atmosphere from developer
tooling. Colour is a legend and never decoration: red is energised, green is earthed, grey is
dead, and interactive elements get a blue that appears in no diagram so it can never be
misread. Every page carries a title block, because a drawing that circulates without its
provenance is dangerous, and that is also this company's entire argument.

Type is IBM Plex Sans, Condensed and Mono — chosen for engineering register, and pointedly not
Inter, which is the default grotesque of generated SaaS and therefore a decision not made.

### Routes

Five, each earning its place: `/` the claim and the failure · `/schedule` the proved sequence,
the permit and the generated restoration · `/proving` the eight refusal classes ·
`/model` the objection route, where the model is wrong · `/pilot` the conversion.

The conversion is not a trial signup. It is *"send us a schedule you have already approved and
we will prove it"* — £6,000, four weeks — which is the same shape as the product.

---

## Comparison with Nørreværk — provisional

Two prototypes is not a corpus, and everything here should be read as a hypothesis for
prototype 3 to test rather than as a capability.

### Common to both

1. **A computed artefact, not an illustration.** Nørreværk sized project frames by floor area;
   Interlock renders every network state from a solver. In both cases the reviewer scored
   `business-specificity` at 9.5 and named the derived artefact as the reason.
2. **A thesis stated in one sentence and held everywhere.** "Existing buildings as measured
   evidence"; "the site is a drawing sheet". Both scored art-direction 9 or above.
3. **The evidence run is part of the design.** Both needed several rounds where the harness,
   not the site, was the defect. Prototype B's first mobile capture was 614px wide on a 390px
   phone because a grid item's default minimum is its content.
4. **Interaction states must be captured or the criterion is scored on nothing.** Gen 1 lost
   half a point to this; prototype B captured thirteen states including a mid-transition frame
   and a reduced-motion pair, and scored 9.

### Domain-specific

1. **Nørreværk's visual material was photography; Interlock has none.** The substitute is not
   "more typography" — it is a *drawn artefact* with its own conventions. That worked, and it
   is not obviously generalisable to a business with neither photographs nor a drawable domain.
2. **Interlock's colour is semantic and therefore constrained.** Three colours are spoken for
   before any aesthetic decision is made. That is a much harsher constraint than Nørreværk's
   free hand, and it produced a stronger anti-slop score (9.5–10 against 9).
3. **The conversion differs in kind.** A paid survey and a paid proof are both "we do the thing
   before you buy the thing", which may be a pattern — or may be two instances of the same
   author's habit. Prototype 3 should not be steered toward it.

### What would be dangerous to promote into the factory now

- **"Compute the artefact from a model"** is the strongest common finding and the most
  dangerous to generalise. It worked twice because both domains had a computable structure.
  A factory rule that demanded one would produce contrived data models for businesses that
  have none.
- **The drawing-sheet and register languages are two data points, not a vocabulary.** Both are
  restrained, ruled, paper-grounded and monochrome-plus-accent. Two prototypes by one author
  converging on that is at least as likely to be an author signature as a capability, and
  promoting it would install exactly the house style the anti-slop criterion exists to catch.
- **Composition-pacing failed on both** — 8.0 here across six runs, and Nørreværk's own
  weakest area was pacing and expansive intervals. Two independent failures on the same
  criterion is the first genuine cross-prototype signal in this programme, and it is a signal
  about *composition at width*, which no amount of content specificity has fixed.

**Recommendation: do not integrate.** Continue to prototype 3 (commerce/editorial), which has
photography *and* a large information architecture, and will test whether the composition-pacing
weakness is domain-specific or ours.
