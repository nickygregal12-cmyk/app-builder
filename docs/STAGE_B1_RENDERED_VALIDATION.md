# Stage B1 rendered validation

#270 landed SitePlan and proved it at composition level. It explicitly did not answer the question
it was built for: **does executable IA improve the rendered factory output?**

This is that experiment. It is not B2, and no B2 capability is implemented.

Branched from `d68710df95f2dd8f644de7bebcac5652f4b09a1d` (main, immediately after #270).

---

## 1. Method

One variable. Same approved truth (Ardwell & Roe — the practice behind the historical
duplicate-page criticism), same renderer, same visual-direction machinery, same three directions
offered on both sides, same evaluator, same viewports. The only difference is whether
`composeProject` received a SitePlan, switched by an environment flag so both sides are built by
the same binary.

Both sides were rendered and captured in full by `tooling/visual-candidate-acceptance.mjs`, which
is the lane CI already runs. Both were then reviewed by the repository's own Codex reviewer, one
packet at a time. Nothing in either packet says *current*, *planned*, *old*, *new*, *experiment* or
*site plan* — verified by grep — and both sides carry the same three direction labels, so the
comparison is paired by direction and the reviewer had no way to know which side it was looking at.

**No attempt was made to beautify the planned side.**

## 2. Structure

| | current | planned |
| --- | --- | --- |
| routes (excluding `/404`) | 6 | **5** |
| total sections | 25 | **21** |
| routes with a purpose that is not the fallback sentence | **1 / 6** | **5 / 5** |
| routes carrying identical content | none | none |
| repeated content on a page | none | none |

```
current   /  8   /work 4   /studio 5   /expertise 3   /approach 2   /contact 3
planned   /  8   /services 3   /work 4   /people 3   /proof 3
```

## 3. Rendered height, desktop, full page

Per candidate, because the three directions differ in density.

| direction | current | planned |
| --- | --- | --- |
| service-forward | 19,093px | 17,035px |
| immersive-lead | 17,532px | 16,395px |
| schedule-register | 18,666px | 17,313px |

Reported per route as well as in total in `examples/stage-b1-rendered/measurements.txt`, so a
worse individual route cannot hide inside a smaller whole-site figure. No planned route is longer
than its current counterpart carrying the same material.

## 4. The blinded review

Paired by direction. Thirteen criteria; the ones the hypothesis is about, plus the ones that moved.

| direction | | IA | pacing | commercial | art-dir | business-spec | ai-slop | memorability | **mean** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| service-forward | current | 6 | 5 | 6.5 | 5.5 | 5.5 | 4.5 | 4.5 | 5.423 |
| | **planned** | **7** | 5 | 6.5 | 5.5 | **6** | 4.5 | 4.5 | **5.538** |
| immersive-lead | current | 5.5 | 5 | 6 | 5 | 5 | 3.5 | 4 | 5.077 |
| | **planned** | **6.5** | **5.5** | **6.5** | 5 | 5 | **4** | 4 | **5.308** |
| schedule-register | current | 6.5 | 5.5 | 6 | 6.5 | 6.5 | 7 | 6 | 6.192 |
| | **planned** | 6.5 | **6.5** | **6.5** | **7.5** | **7.5** | **8** | **7** | **6.846** |

**Set mean 5.564 → 5.897, +0.333.**

**The planned side is not worse on a single criterion in any of the three pairs.** Information
architecture +1.0 on two of three; composition-pacing improves on two and holds on the third;
commercial clarity improves on two and holds on the third. Both sides returned `REWORK` on all
three candidates.

### The dead route, named without being asked

Blocking on **all three** current reviews and on **none** of the planned ones:

> *"The Approach route contains no explanation of the practice's approach and functions only as a
> contact prompt."*
> *"Give the Approach route substantive approach or process content, or remove the route."*

`/approach` is the two-section hero-and-CTA page the old composer published because the manifest
declared the surface. The planner declined to build it, and three independent reviews of the
current side asked for exactly that outcome. That is the clearest single confirmation in this
experiment, and it was unprompted.

## 5. What did not move, and it is the whole result

`visual-material` scored **4 / 3.5 / 4.5** on the current side and **4 / 3.5 / 4.5** on the planned
side. Identical. It is the lowest criterion on both, and the first blocking finding on **all six**
reviews:

> *"The architecture practice's work is never shown through photography, drawings, plans or other
> relevant visual evidence."*
> *"Show the practice's architecture through appropriately art-directed project imagery, drawings,
> details or other genuine visual evidence; text-only project registers are insufficient for this
> business."*

The obvious explanation would be missing assets. It is not that. Both packets record:

> `assetReadiness: { strategy: "imagery-viable", supportsImageryLed: true,`
> `strategyReason: "17 publishable photographs, 1 of them wide enough to open a page." }`

**Seventeen publishable photographs, and both sides render a gallery section.** The capture at
`examples/stage-b1-rendered/planned-work-desktop.png` shows what the `/work` page of an
architecture practice actually looks like: six numbered cards of *text* — name, description,
location, category, year — and not one image.

The plan distinguishes `/services`, `/work` and `/proof`; the presentation renders all three
through the same `item-grid`. The semantic distinction the plan makes is real and the renderer
cannot express it.

## 6. Which outcome

**Outcome A and Outcome C at once**, which the interpretation rules did not anticipate and which is
the honest reading of the numbers.

**A — C2 survived rendered testing.** IA improved or held everywhere, pacing improved or held
everywhere, commercial clarity improved or held everywhere, no criterion regressed, structure is
less duplicated, heights are lower, and a dead route the reviewers independently asked to be
removed was never built. No unsupported content appeared: every route's factual content is bound to
approved truth by the validator that shipped in #270.

**C — and it was not the binding constraint.** The gain is +0.333 on a set mean of 5.6, and every
candidate on both sides still returns `REWORK` on the same first objection. The constraint that
actually caps this build is that semantically different jobs collapse into one presentation
primitive, and that is now measured rather than inferred: the assets are present and publishable,
the plan names the distinction, and the page is text where photographs belong.

## 7. B2 recommendation

**Presentation vocabulary — semantic figure capabilities.** It now has direct rendered evidence
rather than a Stage A prior: six independent reviews naming the same first objection, an asset
inventory that proves scarcity is not the cause, and a capture showing an architecture practice's
work page as a list of paragraphs.

To be explicit about what it is not: not twenty-five new components, and not an architecture
template, a SaaS template or any other. The unit is a **semantic capability** — *project evidence*
is a different job from *service catalogue* is a different job from *proof register* — and the
question to answer first is which of those genuinely need distinguishable presentation and which
are the same job wearing different labels.

Signature-artefact derivation (the other candidate) remains well-supported by Stage A and is now
clearly downstream of this: an artefact derived from business truth still has to render, and today
it would render as an item-grid.

## 8. Defects this experiment exposed

Three, all of which cost a render to find and none of which any count would have shown.

**The composition is derived twice.** `factory-service.frozenProductTruth` composes the frozen
product truth, and `composed-generator.generateComposedProject` composes again for the workspace
that is actually built. Only the second reaches a page. The first run of the planned side was
byte-identical to the current side because the plan had been supplied to the first one only.

**`distinctive-moment-not-renderable` is emitted and forbidden.** `visual-direction.mjs` refuses a
direction with that reason; `visual-candidate-set.schema.json` did not list it, so any build that
triggered it failed contract validation rather than recording a refusal. Latent on main, hit here
because the planned composition initially had no gallery for a moment to render into. Added to the
enum.

**The planner had no way to ask for imagery.** The truth families in `planSite` are the things a
business *lists*, and its photographs are not a list — so a practice with seventeen approved assets
published none, and two directions were refused as unrenderable. Fixed by making assets a bindable
family. This is the one that matters most as a lesson: at composition level the planned path looked
strictly better while quietly deleting the photography, and only rendering it showed that.

## 9. Reproducing

```
APP_BUILDER_RUNTIME_VENDOR=app-builder APP_BUILDER_RUNTIME_MODEL=deterministic-composition \
  node tooling/visual-candidate-acceptance.mjs \
    --bundle examples/visual-excellence/ardwell-roe-approved-intake.v1.json \
    --knowledge examples/visual-excellence/ardwell-roe-approved-knowledge.v1.json \
    --out .app-builder/b1-current

APP_BUILDER_EXPERIMENT_SITE_PLAN=1 APP_BUILDER_RUNTIME_VENDOR=app-builder \
  APP_BUILDER_RUNTIME_MODEL=deterministic-composition \
  node tooling/visual-candidate-acceptance.mjs ... --out .app-builder/b1-planned

npm run experiment:b1-rendered -- .app-builder/b1-current .app-builder/b1-planned
npm run review:codex -- --packet .app-builder/b1-<side>/packet --out .../verdicts.json --authorise
```

The flag is off by default and is not a capability a project can request. It is an experiment
switch with a result now recorded, and it should be removed or promoted deliberately rather than
left to accumulate.

## 10. Not done

**The thin control was not run.** NBM would have answered whether a genuinely small business
becomes appropriately small without feeling incomplete, and it is a second full render plus three
more Codex reviews. The rich case answered the question this experiment existed for; the thin case
is cheap to add and is recorded here as outstanding rather than quietly skipped.
