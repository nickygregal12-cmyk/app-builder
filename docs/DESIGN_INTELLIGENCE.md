# Design Intelligence, Element Identity and Rendered Evidence

Status: **Phase 4C delivered; Phase 4D delivered except the visual verdict**. What was actually built, and what was deferred and why, is recorded in `docs/PHASE_4C_EXECUTION.md` and `docs/PHASE_4D_EXECUTION.md` — those are the implementation authority and this remains the specification. Three items specified below are deferred rather than built: the design-intelligence catalogue (section 1, no consumer), reference handling (section 4, no supplier) and MessagingPlan (section 5, no consumer). `config/factory-status.json` carries the reviving condition for each. This document specifies the design-side machinery the specialist
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

### ResponsiveCompositionPlan

Responsive behaviour is part of art direction rather than an after-the-fact media-query pass.
`ResponsiveCompositionPlan` should remain derived from / contained by `ArtDirectionPlan` so it does
not become a second visual authority.

Executable decisions may include:

- content ordering/grouping by viewport;
- section variant by viewport;
- hero simplification or re-composition;
- alternate asset crop/focal framing;
- column/grid collapse strategy;
- hover -> press/tap interaction substitution;
- mobile-specific CTA placement;
- decorative-layer reduction;
- typography, measure and density overrides.

A responsive declaration is not real until a selector/renderer consumes it and rendered evidence
proves the result at the intended viewport.

## 3. Typography as compiled design behaviour — Phase 4C/4D

Typography must be richer than a descriptive intent label. A derived `TypographySpec` should compile
BrandSpec/Design Contract choices into real generated output while keeping the Design Contract as
authority.

The executable shape should cover, where relevant:

- display/body family identities;
- weight/style and variable-font axes;
- fluid type scale;
- line-height and letter-spacing;
- reading measure;
- heading/body/label/button/nav roles;
- responsive typography overrides;
- preload/subsetting/loading strategy;
- font source/licensing class.

A font resolver must distinguish system/open-licensed fonts, owner-supplied licensed assets and
approved hosted sources. No generated repository should accidentally redistribute a commercial font
merely because the factory could read it.

As with every other 4C declaration, each executable TypographySpec field needs a real token/style/
component consumer or must remain non-executable.

## 4. Reference handling — Phase 4D

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

## 5. MessagingPlan as a bounded product input — Phase 4C/4D

Professional presentation depends on the story as well as the facts. Public-facing projects should be
able to derive a bounded `MessagingPlan` from approved requirements plus trusted claims.

It may describe:

- primary audience/problem;
- defensible value proposition;
- evidence-backed differentiators;
- proof requirements;
- likely objections and responses;
- CTA strategy;
- page-level narrative sequence;
- voice/tone constraints;
- claims that remain forbidden because source evidence is insufficient.

`MessagingPlan` is not a source of factual truth. It arranges permitted facts and claims into a
communication strategy, and must preserve the existing source/provenance boundary.

The composer and art-direction selector may consume it for hierarchy, proof placement, section order
and CTA treatment. It must not become an excuse for generic AI copy outside the knowledge/claims
boundary.

## 6. Deterministic DesignLint — Phase 4C

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

## 7. Component Manifest Protocol — Phase 4C

An agent should never read a whole component library to pick one component. Each presentation
component publishes a manifest:

`id`, `category`, `purpose`, `appropriateFor[]`, `avoidFor[]`, `propsSchema`, `variants[]`,
`states[]`, `responsiveRules`, `accessibilityContract`, `dependencies[]`, `tokens[]`,
`runtimeRequirements`, `examples[]`, `visualExamples[]`, `testStatus`, `accessibilityStatus`,
`visualReviewStatus`, `version`.

`runtimeRequirements` is the field that prevents a common failure: a technically correct import that
renders wrongly because a provider, global stylesheet, font or theme context was never wired.

`ComponentManifest` retrieval is what keeps the composition role inside its context ceiling.

## 8. Presentation Registry and controlled bespoke fallback — Phase 4C/4D

The Presentation Registry stays separate from the Capability Registry, as
`docs/BEST_IN_CLASS_CAPABILITIES.md` already requires. Entries such as `HeroEditorialV2`,
`PricingComparisonV2` or `FAQAccordionV3` carry preview, variants, tokens, allowed project classes,
tags, visual characteristics, dependencies, runtime requirements, accessibility and test evidence,
usage history and promotion status.

Registry entries are private and versioned. `21st-dev/registry` is prior art for the search, preview
and install lifecycle only; a public registry must never become a runtime dependency of a generated
app.

The registry is the default for solved visual problems, **not a ceiling on originality**. When an
ArtDirectionPlan requires a visual moment that no ready entry can satisfy, the selector must be able
to return `custom-presentation-required` rather than force a weak closest match.

A bounded custom presentation then flows through the ordinary system:

```text
ArtDirectionPlan
  -> Presentation Registry retrieval
  -> no adequate ready presentation
  -> custom-presentation-required
  -> bounded specialist implementation
  -> DesignSystemSpec / TypographySpec / MotionContract constraints
  -> PageSpec/SectionSpec + ElementIdentity
  -> responsive + accessibility + DesignLint
  -> RenderedEvidence
  -> independent visual review
```

A custom presentation stays project-local by default. It enters the registry only after repeated
successful evidence, explicit review, test/accessibility status and versioning. This prevents the
registry from turning the factory into a polished template generator.

## 9. Visual Asset Readiness and ImagePlan — Phase 4C/4D

Before art direction is finalised, the factory should determine whether the approved asset inventory
can actually support the intended visual story.

A Visual Asset Readiness result should classify coverage for hero, service/product, project/case-study,
people/team, decorative/illustrative and social imagery. When coverage is weak it must force an
explicit strategy:

- typography/graphic-led art direction;
- request more owner-approved assets;
- generate safe supporting imagery;
- use approved/licensed stock/library material where policy permits.

This feeds the existing provider-neutral `ImagePlan`, which assigns page/section image jobs, candidate
assets, crop/focal-point requirements, responsive variants, rights/provenance and approval state.
“No publishable imagery” is therefore a design input, not an accidental defect.

## 10. Design system compiles, it does not instruct — Phase 4C

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

TypographySpec, responsive composition and MotionContract follow the same principle: where they
claim executable behaviour they must compile/select real generated behaviour rather than exist as
prompt prose.

## 11. Builder Element Identity — Phase 4B, foundational

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

## 12. Rendered evidence and cross-browser portability — Phase 4B/4C/6

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

For professional-output claims, keep the full evidence matrix on the primary browser but add targeted
cross-browser smoke evidence across Chromium, WebKit and Firefox. Focus the secondary-browser matrix
on high-risk routes/states and on font metrics, viewport/sticky behaviour, overflow, image sizing,
form controls, motion and mobile Safari composition. Do not multiply every screenshot by every
browser without evidence that the cost is useful.

## 13. Portable design contract in the generated repository

A generated repository must remain understandable without the Builder Console. The compiled design
contract — tokens, visual rules, component decisions, motion rules, brand intent, approved sources
and rationale identifiers — travels with the repo inside the existing `.product/` provenance area
described in `docs/ARCHITECTURE.md`.

`AgentsORG/DESIGN` is registered as prior art for the portable-contract idea. Its `.design` directory
is not adopted, because a second design authority inside generated repositories is exactly what this
architecture is trying to prevent.

## 14. Visual comparison canvas — Phase 4D, last

The infinite comparison canvas for art-direction candidates, responsive boards, moodboards and
reference annotation is genuinely useful, and it is deliberately the **last** thing built.
`tldraw` and `quickdrawjs/quickdraw` are registered as candidates with licensing review outstanding.
No canvas dependency is added before `ArtDirectionPlan`, `RenderedEvidence` and `ElementIdentity`
exist, because a canvas with nothing durable to compare is a demo.

## 15. Anti-template diversity diagnostic — product-proof stage

A build can be individually polished while the factory as a whole remains obviously template-like. The
signals compared across unrelated corpus projects, and the rule that this starts as a diagnostic rather
than a threshold, are defined once in `docs/VISUAL_EXCELLENCE.md` §8. What belongs here is the machinery:
the comparison runs over the same structural signature and composition axes that `assessDiversity`
already computes within a candidate set, so cross-build diversity is measured with the same instrument as
within-set diversity rather than a second definition of "different".

## Placement summary

| Capability | Stage |
| --- | --- |
| Builder Element Identity, RenderedEvidence foundation | Phase 4B |
| Design-intelligence catalogue, ComponentManifest, Presentation Registry, DesignLint, DesignSystemSpec compilation, TypographySpec foundation, machine-readable ArtDirectionPlan, ResponsiveCompositionPlan foundation, MotionContract, runtime-aware component contracts | Phase 4C |
| Reference analysis, MessagingPlan use in creative direction, Visual Asset Readiness/ImagePlan decisions, art-direction candidates, controlled bespoke presentations, visual critic, comparison canvas, promote/reject evidence | Phase 4D |
| Cross-browser visual portability smoke | Phase 4D/6 |
| Anti-template diversity diagnostic across unrelated real projects | Product-proof corpus |
| Full gate evidence for every convergence gate | Phase 6 |
