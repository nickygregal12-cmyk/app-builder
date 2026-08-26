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

## 4C.2 — Persist the portable design artifact

Once 4C.1 is green, persist the compiled design system into the ordinary generated repository, preferably under the existing `.product/` provenance area rather than inventing a second metadata root.

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

## 4C.3 — BrandSpec, ArtDirectionPlan and MotionContract

Introduce these one at a time, not as a batch of decorative JSON.

### BrandSpec

Only fields with a concrete compiler/policy effect become executable. Examples include approved palette roles, typography intent that maps to actual font/token configuration, logo/asset publication policy and explicit brand constraints.

### ArtDirectionPlan

Machine-readable dimensions should include the planned 4C fields:

- `layoutVariance`;
- `motionIntensity`;
- `informationDensity`;
- `visualDistinctiveness`;
- `restraintLevel`.

A field is not selectable until a composer/selector/DesignLint rule actually consumes it.

### MotionContract

Motion values must map to real transition/animation parameters and reduced-motion behaviour. A motion label that changes no output is rejected by the same issue #58 invariant.

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
