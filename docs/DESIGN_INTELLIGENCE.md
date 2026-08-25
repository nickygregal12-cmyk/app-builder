# Design Intelligence, Element Identity and Rendered Evidence

Status: **planned for Phase 4B–4D**. This document specifies the design-side machinery the specialist
roles exchange. It is a detail document under `docs/VISUAL_EXCELLENCE.md` and
`docs/BEST_IN_CLASS_CAPABILITIES.md`.

It is explicitly **not** a design authority. `DesignSystemSpec` and the existing Design Contract
remain the only authorities for how a project looks. Everything here either feeds them, compiles from
them or checks against them.

## 1. Design-intelligence catalogue — Phase 4C

A model recalling design conventions from training is not a factory capability. A versioned,
queryable catalogue is.

Introduce `packages/design-intelligence` holding reviewed, versioned design knowledge with
deterministic retrieval (BM25-style keyword search is sufficient; no vector infrastructure is
justified at this size):

- industry/product-category classification;
- layout families and their appropriate information density;
- palette relationships and typography pairings;
- landing-page and application-shell patterns;
- trust/proof strategies by category;
- documented anti-patterns.

A query such as *marketing-site + legal practice + trust-first + older audience + supplied navy logo*
should deterministically return a layout family, density band, typography intent, palette
relationships, proof strategy, motion restraint level, CTA treatment and the anti-patterns to avoid.

Retrieval output is evidence for `BrandSpec` and `ArtDirectionPlan`. It never becomes the project's
design authority, and the catalogue's own prior art (`nextlevelbuilder/ui-ux-pro-max-skill`) is
registered as reference-only precisely because its bundled master design document would compete with
`DesignSystemSpec`.

## 2. Machine-readable art direction — Phase 4C/4D

`ArtDirectionPlan` must carry dimensions a deterministic check can read, not prompt adjectives:

- `layoutVariance` — how much section-to-section structure changes;
- `motionIntensity` — bounded by `MotionContract`;
- `informationDensity`;
- `visualDistinctiveness` — the anti-generic dimension;
- `restraintLevel`.

`ArtDirectionPlan` also carries the narrative sequence, attention hierarchy, hero strategy, imagery
emphasis and desktop/mobile composition intent already described in `docs/VISUAL_EXCELLENCE.md`.

Two to four genuinely different candidates are produced from the same product and content truth, and
`visual-critic` promotes exactly one. Candidates are evidence, not forks.

## 3. Reference handling — Phase 4D

A reference is evidence, not a template. "Linear-like density, Raycast-like polish, warmer and less
technical" must become structured intent before it touches a component:

```text
reference (screenshot / URL / moodboard / Figma export)
  -> Visual Reference Analysis
     -> normalized traits: layout, typography, spacing, motion, imagery, distinctive patterns
        -> adopt[] / avoid[] with confidence
           -> ArtDirectionPlan
```

Different references may inform different dimensions — one for IA, another for typography, another
for interaction, another for mood. Screenshot decomposition and asset-extraction techniques from
`abi/screenshot-to-code` are useful here; its generation architecture is explicitly not adopted,
because a screenshot must never become uncontrolled markup that bypasses PageSpec/SectionSpec
identity.

## 4. Deterministic DesignLint — Phase 4C

DesignLint catches repeatable visual mistakes **before** any expensive AI critique, in the same
spirit as typecheck before review. Candidate rules:

- excessive card nesting and rounded-rectangle monotony;
- arbitrary radii or spacing values outside the active scale;
- gradient overuse;
- the repeated icon-in-coloured-square pattern;
- excessive centre alignment;
- heading-hierarchy breaks;
- body text below the legibility floor;
- too much low-contrast muted text;
- layout monotony and identical density across every section;
- duplicated CTA and section structures;
- excessive or conflicting motion;
- obvious mobile cramping;
- unsuitable imagery (aspect, resolution, focal point);
- design-token bypass;
- any second, unapproved design system.

The intended quality stack is unchanged in principle and cheaper in practice:

```text
typecheck -> lint -> tests -> axe -> DesignSystemLint -> DesignLint
  -> browser QA -> performance -> then AI visual review
```

`DesignLintReport` is a required input to the `visual` gate, so the design critic spends its context
on judgement rather than on defects a rule could have caught.

## 5. Component Manifest Protocol — Phase 4C

An agent should never read a whole component library to pick one component. Each presentation
component publishes a manifest:

`id`, `category`, `purpose`, `appropriateFor[]`, `avoidFor[]`, `propsSchema`, `variants[]`,
`states[]`, `responsiveRules`, `accessibilityContract`, `dependencies[]`, `tokens[]`,
`runtimeRequirements`, `examples[]`, `visualExamples[]`, `testStatus`, `accessibilityStatus`,
`visualReviewStatus`, `version`.

`runtimeRequirements` is the field that prevents a common failure: a technically correct import that
renders wrongly because a provider, global stylesheet, font or theme context was never wired.

`ComponentManifest` retrieval is what keeps the composition role inside its context ceiling.

## 6. Presentation Registry — Phase 4C

The Presentation Registry stays separate from the Capability Registry, as
`docs/BEST_IN_CLASS_CAPABILITIES.md` already requires. Entries such as `HeroEditorialV2`,
`PricingComparisonV2` or `FAQAccordionV3` carry preview, variants, tokens, allowed project classes,
tags, visual characteristics, dependencies, runtime requirements, accessibility and test evidence,
usage history and promotion status.

Registry entries are private and versioned. `21st-dev/registry` is prior art for the search, preview
and install lifecycle only; a public registry must never become a runtime dependency of a generated
app.

## 7. Design system compiles, it does not instruct — Phase 4C

`DesignSystemSpec` must produce artifacts, not guidance:

```text
DesignSystemSpec
  -> design tokens
     -> CSS custom properties
     -> framework/theme configuration
     -> component parameters
     -> manifest/documentation data
```

`style-dictionary` is a registered candidate for this compilation step, as a factory-side build
dependency. Generated repositories receive compiled output, never the compiler.

## 8. Builder Element Identity — Phase 4B, foundational

This is the layer that makes direct manipulation safe, and it must exist before click-to-edit.

Clicking a price, a paragraph or an image in the Builder must resolve to a durable binding rather
than asking a model to inspect the DOM and guess where to edit:

```text
DOM element
  -> ElementIdentity
     -> pageId / sectionId / componentId / instanceId
     -> bindingIds[]
     -> sourceFile + sourceRange (where a file backs it)
     -> editableProperties[]
     -> provenanceRefs[] (source-backed fact vs generated copy)
     -> designTokenRefs[]
        -> bounded ChangeSet -> rerender -> deterministic checks -> independent review
```

`PageSpec` and `SectionSpec` already carry stable ids and content bindings, so half of this identity
exists today. What Phase 4B adds is component/instance identity, source-location mapping and the
editable-property surface.

`react-grab`, `Weblab` and `onlook-dev-ide` are registered as prior art for DOM/component/source
mapping. App Builder deliberately goes further than all three: the target is not "edit the source
under this pixel" but "edit the durable binding this pixel represents", so that an edit keeps its
provenance and flows through the ordinary ChangeSet path.

A visual edit that cannot resolve to an ElementIdentity is refused. It is not silently turned into a
free-form code change.

## 9. Rendered evidence — Phase 4B/4C

A visual change is not finished because the code compiles and tests pass.
`aa-on-ai/agentic-design-system` states the useful sequence: intent → context → implementation →
render → evidence → review → revision.

`RenderedEvidence` should carry:

- desktop screenshot;
- tablet screenshot where relevant;
- mobile screenshot;
- critical interaction states (hover, focus, open, error, empty, loading);
- `DesignLintReport`;
- axe results;
- performance evidence where relevant;
- reference comparison where a reference informed the work.

`RenderedEvidence` is a required input to the visual, functionality and responsive gates, and
`evaluateHandoff` blocks promotion when it is missing.

## 10. Portable design contract in the generated repository

A generated repository must remain understandable without the Builder Console. The compiled design
contract — tokens, visual rules, component decisions, motion rules, brand intent, approved sources
and rationale identifiers — travels with the repo inside the existing `.product/` provenance area
described in `docs/ARCHITECTURE.md`.

`AgentsORG/DESIGN` is registered as prior art for the portable-contract idea. Its `.design` directory
is not adopted, because a second design authority inside generated repositories is exactly what this
architecture is trying to prevent.

## 11. Visual comparison canvas — Phase 4D, last

The infinite comparison canvas for art-direction candidates, responsive boards, moodboards and
reference annotation is genuinely useful, and it is deliberately the **last** thing built.
`tldraw` and `quickdrawjs/quickdraw` are registered as candidates with licensing review outstanding.
No canvas dependency is added before `ArtDirectionPlan`, `RenderedEvidence` and `ElementIdentity`
exist, because a canvas with nothing durable to compare is a demo.

## Placement summary

| Capability | Stage |
| --- | --- |
| Builder Element Identity, RenderedEvidence foundation | Phase 4B |
| Design-intelligence catalogue, ComponentManifest, Presentation Registry, DesignLint, DesignSystemSpec compilation, machine-readable ArtDirectionPlan, MotionContract, runtime-aware component contracts | Phase 4C |
| Reference analysis, art-direction candidates, visual critic, comparison canvas, promote/reject evidence | Phase 4D |
| Full gate evidence for every convergence gate | Phase 6 |
