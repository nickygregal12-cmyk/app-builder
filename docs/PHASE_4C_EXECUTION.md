# Phase 4C Execution Plan

Status: **active**.

Phase 4C starts only after the genuine-business gate passed. This document turns the broader design-intelligence plan into an implementation order that preserves the repository's existing authorities and the behavioural-consumer invariant from issue #58.

## Non-negotiable rules

1. The existing Design Contract remains the design authority. New structures may derive from it, compile it, constrain it or review it; they must not become a second competing design system.
2. A declaration that claims to change product/runtime behaviour must prove a real deterministic consumer, or be explicitly marked non-executable/planned so the Console cannot offer it as working behaviour.
3. Do not add a generic source-text scanner for registry fields. Tests must prove behaviour changes when declarations change.
4. Do not seed registries with components the factory does not actually render today.
5. Do not add a public component registry as a generated-app runtime dependency.
6. Do not adopt Storybook by default. Evaluate it only after the repo-native preview/manifest path proves a concrete gap it would solve better than the existing product.
7. Do not open broad autonomous runtime permissions as part of design work.

## 4C.1 — DesignSystemSpec compiler IR

First slice: establish a real compiler stage between the existing Design Contract and generated CSS.

The active structured design controls already have real meaning:

- `accentColor` -> `--color-accent`;
- `maxWidth` -> `--layout-max-width`;
- `radius` -> `--layout-radius`;
- `density` -> `--section-space`.

`tooling/lib/design-choices.mjs` now derives a `DesignSystemSpec` compiler IR from those existing decisions. `renderBrandCss`, which is used by initial generation and live Console design edits, renders through that IR. Focused tests prove every active control changes output the renderer consumes and that a declaration claiming a different design authority is refused.

This is intentionally an intermediate step rather than a new schema/registry explosion. The representation should prove itself in the existing product path before it is promoted into another exchanged contract family.

### 4C.1 acceptance

- existing generated CSS remains deterministic;
- every active control changes a consumed token;
- the renderer consumes compiler output rather than bypassing it;
- invalid/non-authoritative compiler output fails closed;
- no new runtime dependency is added to generated repositories.

## 4C.2 — Persist the portable design artifact — done

The compiled design system is persisted into the ordinary generated repository at
`.product/design-system.json`, the product-facing summary area described in
`docs/ARCHITECTURE.md`. `.app-builder/` remains the factory's build record; the two are
not duplicated, because `project.json` and `handover.json` name the portable artifact by
path rather than repeating it.

`writeDesignArtifacts` in `tooling/lib/design-choices.mjs` is the single writer: it
compiles the DesignSystemSpec once and writes `.product/design-system.json`,
`src/generated/brand.css` and `src/generated/design.ts` from that one compilation.
Initial generation (`tooling/lib/generator.mjs`) and a live Console design edit
(`FactoryService.rewriteWorkspaceDesign`) both call it, so the stylesheet cannot describe
a design the portable artifact does not.

`tooling/design-system-portability.test.mjs` proves the artifact equals the compiler
output for the live design, that the stylesheet renders from the persisted spec, that a
live edit rewrites both, that clearing a human override returns that control to the
factory-composed value, that a rebuild reproduces the artifact from durable choices
without rewriting the previous workspace, that recipe reconciliation does not reset it,
and that no `@app-builder/*` dependency reaches the generated package.

The shape is not yet a contract family. It has one producer and one renderer inside the
factory; promoting it to a schema is worth doing when a second consumer needs to validate
it at a boundary.

Target shape should include at least:

- schema/version marker;
- reference back to the Design Contract authority/version;
- selected layout family;
- active structured controls;
- compiled token values;
- rationale/provenance identifiers where they already exist.

Acceptance must prove that:

- the persisted artifact matches the exact values used to generate CSS;
- a live design edit updates both renderer output and the portable artifact;
- a rebuild reproduces the same artifact from the durable design choices;
- an ordinary generated repo remains usable without App Builder runtime dependencies.

Only after the shape has a real consumer and stable semantics should it be promoted to a formal contract family/schema if that boundary is useful.

## 4C.3 — BrandSpec, ArtDirectionPlan and MotionContract — done

All three landed together because all three compile into the same token set and the same
`DesignSystemSpec`; splitting them would have meant landing a contract whose only consumer
was the next pull request. `tooling/art-direction.test.mjs` covers them.

### BrandSpec — live

`tooling/lib/brand-spec.mjs`. Resolves the two presentation inputs the design system
compiles: the accent colour and the typography voice. It does not extract anything — Phase 3
already records the hex colours and font families a company's own pages use, with sources,
in the knowledge pack's `brand` block, and this reads that rather than adding a second
extraction pipeline.

Three origins stay apart, and `sourceIds` is non-empty only for an observation:

- `supplied` — stated in the manifest (`brand.accentColor`, `brand.typographyVoice`);
- `observed` — read from the company's material, with the sources named;
- `derived` — the factory's own default, with nothing behind it.

An observed colour has to actually be a colour (a channel spread of at least 24) and carry a
readable label, so the greys and near-whites a stylesheet is full of cannot stand in for a
brand. A font family nothing here can resolve is not guessed at: the voice stays derived.
Every voice is a system stack, so a serif business reads as one without the generated app
downloading a font. A human accent override is recorded as `accent.overridden` beside the
unchanged origin, so choosing a colour never rewrites what the sources showed.

Consumers: `--color-accent`, `--font-display`, `--font-body`, all read by
`templates/react-vite-neutral/files/src/styles.css`.

### ArtDirectionPlan — live

`tooling/lib/art-direction.mjs`. The intent is declared per layout pattern in
`config/layout-patterns.json`; the plan is compiled from it. Each dimension has a consumer:

| dimension | consumer | observable behaviour |
| --- | --- | --- |
| `informationDensity` | the existing density control | `--section-space` |
| `layoutVariance` | `--section-alt-ground` | whether, and how strongly, a page changes ground as it scrolls |
| `visualDistinctiveness` | `--hero-scale`, `--display-measure` | how much room the opening claims |
| `motionIntensity` | the MotionContract | every motion token |
| `restraintLevel` | the ceiling in `compileArtDirectionPlan` | reduces the three above and records each cut in `clamped[]` |

`informationDensity` is named rather than duplicated: the density control already is that
dimension, so there is one place a rhythm can be changed. `restraintLevel` can only reduce —
a ceiling never raises a quiet plan — and what it cut is part of the output rather than a log
line, so a reviewer can tell a build that was asked to be quiet from one that was cut back.

The six canonical project types now differ in composition rather than colour: an internal
tool sits on one ground with a 1.05 hero, a content site changes ground on the muted surface,
a marketing site opens at 1.65.

### MotionContract — live

`tooling/lib/motion-contract.mjs`. Four bands (`none`, `subtle`, `moderate`, `expressive`)
replacing the `.18s`, `.5s` and `1.03` scale that were typed into the stylesheet. Each band
compiles `--motion-duration-fast`, `--motion-duration-slow`, `--motion-ease`,
`--motion-hover-lift` and `--motion-decorative-scale`, and every transition in the template
reads them.

`prefers-reduced-motion` is not a band. It is required at every intensity and the template's
reduced-motion block stands regardless. Decorative movement — movement with no interaction
behind it — is refused below `moderate` rather than merely made small.

### Not delivered here

No Console control was added for art direction or motion. The dimensions are factory
decisions today; exposing them as human choices belongs with the presentation registry that
decides what a person is offered.

## 4C.4 — Component Manifest Protocol and Presentation Registry

Seed from presentation components/section variants the factory actually renders now.

Every manifest entry must describe the real implementation, including:

- id/category/purpose;
- supported project classes;
- variants and states;
- responsive rules;
- accessibility contract;
- dependencies;
- token dependencies;
- runtime requirements;
- test/accessibility/visual-review status;
- version.

The Presentation Registry remains separate from the Capability Registry. A registered presentation must have a renderer/selector path and focused invariant coverage showing that its supported variant produces a real, distinct rendered state.

## 4C.5 — Deterministic DesignLint

Add cheap deterministic checks before expensive AI visual review. Initial rules should focus on defects the current template/composer can actually produce and that can be tested without subjective judgement, for example:

- token bypass;
- arbitrary radii/spacing outside the active scale;
- heading hierarchy violations;
- legibility floors;
- low-contrast muted text where deterministically measurable;
- repeated section/CTA structures when composition data proves monotony;
- excessive/conflicting motion relative to MotionContract;
- mobile layout constraints the generated structure can deterministically expose.

`DesignLintReport` then becomes part of rendered visual evidence and a prerequisite input to the visual gate.

## 4C.6 — Design-intelligence catalogue

Introduce `packages/design-intelligence` only when there is a consumer ready to query it. Start with reviewed deterministic data and BM25-style keyword retrieval; vector infrastructure is not justified at the planned catalogue size.

Retrieval informs BrandSpec/ArtDirectionPlan. It never becomes project design authority.

## 4C completion gate

Phase 4C is not complete merely because schemas/registries exist. It is complete when the main design declarations used by the product have real deterministic consumers, the portable design contract survives generated-repo handoff, presentation selection is registry-backed without fictional entries, DesignLint participates in evidence, and the behaviour is protected by focused tests.

Phase 4D remains the place for reference analysis, multiple art-direction candidates, visual critic promotion/rejection and comparison canvas work.
