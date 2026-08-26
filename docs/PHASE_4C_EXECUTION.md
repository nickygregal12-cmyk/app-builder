# Phase 4C Execution Plan

Status: **complete**, closed 2026-08-26. 4C.6 is conditionally deferred rather than delivered; see below.

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

## 4C.4 — Component Manifest Protocol and Presentation Registry — done

`config/presentation-manifest.json` and `tooling/lib/presentation-registry.mjs`.
`tooling/presentation-registry.test.mjs` covers them.

The registry is **compiled, not authored**. The template keeps its declaration of each
component's id, version, binding roles and the variants it renders; the manifest adds only
what a template cannot express — what renders a component (`template` or `recipe`), what a
build must have wired for it to render correctly, and which design tokens its own
appearance depends on. Variants are read from the template rather than restated, so there
is one place a presentation can be added.

Compilation fails closed both ways: a manifest entry naming a component the template does
not render is refused, and a rendered component nothing describes is refused. That is what
keeps it from becoming a catalogue of components that do not exist.

It stays separate from the capability registry. Recipes decide what a generated app can
**do**; this decides how its surfaces may be **shown**. They meet in exactly one place — a
section whose component a recipe owns — and that meeting is now checkable.

### Consumers, and what they found

**Generation audit.** `generateComposedProject` audits every composed section against the
registry and refuses a build it cannot render. This caught a real quiet failure: an
`enquiry-form` section whose `lead-generation` recipe was never installed still renders, as
a heading with nothing under it. The composer and the renderer agreed only because both
happened to key off the same module name in two separate places.

**Variant validity.** The same audit caught the composer naming presentations the template
never implemented — `accent` on a call to action, `prose` on a passage, `panel` on the
enquiry form. They reached `.app-builder/composition.json`, `src/generated/composition.ts`
and element identity, and styled nothing. Those sections now compose as `default`. The fix
is in the composer, not in the artifacts it produced.

**Console offering.** `sectionVariantOptions` and `chooseSectionVariant` go through the
registry, so a component described but not `ready` is offered to nobody.

**Token dependency.** Every `ready` component declares the tokens its appearance depends on,
and a test proves each resolves against either the compiled DesignSystemSpec or the
template's own defaults. A component depending on `--hero-scale` is stating a dependency on
the design system compiling it; without the check, the compiler could stop emitting it and
the component would render against an unresolvable property.

### Not in the manifest, deliberately

`accessibilityContract`, `responsiveRules`, `propsSchema`, `examples`, `visualExamples` and
the review-status fields the protocol names are **not** here. Accessibility is already
covered behaviourally by the axe gate over a real build, and the rest have no deterministic
consumer today. DesignLint (4C.5) is the consumer that would give responsive and
accessibility obligations meaning; they belong there, with rules that read them, rather than
here as prose nothing checks.

An art-direction dimension list per component is also absent: the token list already states
which dimensions a component responds to (`--hero-scale` is `visualDistinctiveness`), and
restating it would be two places to disagree.

An asset requirement on the gallery was written and then removed. A gallery composes with no
pictures at all where it only points at where the work lives, so the requirement could never
fail — and a requirement nothing can fail is not a requirement. An unrecognised requirement
is now reported rather than assumed met, so the manifest cannot quietly declare a dependency
nothing knows how to check.

### Storybook — evaluated and not adopted

Recorded in `docs/ENGINEERING_QUALITY_PROGRAMME.md`, Stage Q3. The registry enumerates the
components, the service-managed preview renders the real build, and rendered evidence
already drives a real browser over real interaction states. Stories would be a second
declaration of what each component renders, beside the template and the registry. Revisit
only if Phase 4D's visual regression contracts prove they need per-component isolation.

## 4C.5 — Deterministic DesignLint — done

`tooling/lib/design-lint.mjs`, covered by `tooling/design-lint.test.mjs`. The report is
part of `RenderedEvidence`.

The point is cost and reliability, in that order. A visual critic asked to look at a page
will spend tokens reporting that an accent is unreadable or that four sections in a row look
the same — things a rule decides from the compiled design and the composition, for nothing,
every time, with the same answer. No browser, no screenshot, no model: it runs before
evidence capture is worth paying for.

### Rules

| rule | severity | what it decides |
| --- | --- | --- |
| `accent-contrast` | violation | the accent is unreadable on a ground the build actually prints it on |
| `reduced-motion-required` | violation | the motion contract, or the template's reduced-motion block, stopped honouring `prefers-reduced-motion` |
| `repetitive-section-presentation` | warning | three or more consecutive sections presented identically |
| `competing-primary-actions` | warning | more than two sections on a page each rendering a primary action |
| `uniform-page-rhythm` | recommendation | a long page that never changes ground |

`accent-contrast` is the one worth explaining. The Design Contract already refuses an accent
that cannot carry its own label, but that check measures against white, and neither ground
the accent is printed on is white. The tinted one is 9% of the accent itself mixed into the
page, which costs a real amount of contrast: **292 of the accents that pass the input gate
fail on it**, and they are ordinary brand blues and teals — exactly what reading a company's
own site now yields since 4C.3. A build that never puts the accent on that ground is not
held to it.

### Severity is not decoration

- `violation` — a defect. Something is unreadable, or an invariant broke. `clean` is false.
- `warning` — probably wrong, worth a person's attention.
- `recommendation` — a suggestion, and being ignored is a legitimate outcome. A dense
  internal tool is deliberately flat; `uniform-page-rhythm` must never fail it.

All six canonical project types and the synthetic mixed-source build lint clean, which is
the test that keeps a rule from crying wolf.

### What the rules deliberately do not judge

`aiReviewCandidates` names what still needs judgement — brand fit, visual hierarchy,
distinctiveness, and imagery suitability where the build publishes photographs. This is the
other half of the point: a critic handed "review this page" re-derives what the rules already
settled, while a critic handed a scoped list spends its budget on the questions that need it.

### Two rules written and removed

A `missing-page-opening` rule was written and dropped: every composed page opens with a hero,
so it could never fire. An `action-label-contrast` rule was dropped for restating the input
gate. Neither belonged; a rule nothing can fail is not a rule.

## 4C.6 — Design-intelligence catalogue — conditionally deferred

`packages/design-intelligence` was **not** built, and the stage is recorded in
`config/factory-status.json` under `deferredCapabilities` rather than under `completedStages`.

The rule this stage was written with is that the catalogue is introduced only when a consumer is
ready to query it. Nothing here is. BrandSpec resolves its two inputs from the knowledge pack's own
`brand` observations; ArtDirectionPlan reads the intent declared per layout pattern in
`config/layout-patterns.json`; the Presentation Registry is compiled from the components the template
actually renders. None of them has a question that a pattern catalogue would answer, so building one
now would produce a package with a producer and no reader — which is exactly the failure the
behavioural-consumer invariant exists to prevent.

What would revive it is a real component asking "which reviewed design patterns fit this
project/industry/intent?" and deterministic config being unable to answer. When that happens the
consumer is documented first, and only the smallest lexical catalogue it needs is implemented: BM25 or
keyword retrieval, no vector store, no embedding infrastructure, no broad generic design corpus.
Retrieval would inform BrandSpec and ArtDirectionPlan; it would never become project design authority.

Deferring it is the successful outcome of a conditional stage, not an omission.

## 4C completion gate — satisfied

Phase 4C is not complete merely because schemas/registries exist. It is complete when the main design
declarations used by the product have real deterministic consumers, the portable design contract
survives generated-repo handoff, presentation selection is registry-backed without fictional entries,
DesignLint participates in evidence, and the behaviour is protected by focused tests.

Each clause is met by 4C.1–4C.5:

| gate clause | met by |
| --- | --- |
| design declarations have real deterministic consumers | 4C.1 renders CSS through the compiler IR; 4C.3 gives every art-direction and motion dimension a token the template reads |
| the portable design contract survives generated-repo handoff | 4C.2 — `.product/design-system.json`, written by the same writer that renders the stylesheet, with no `@app-builder/*` dependency reaching the generated package |
| presentation selection is registry-backed without fictional entries | 4C.4 — compilation fails closed both ways, and the audit refuses a build whose section presentation cannot be satisfied |
| DesignLint participates in evidence | 4C.5 — the report travels inside `RenderedEvidence` |
| behaviour is protected by focused tests | `tooling/design-system-portability.test.mjs`, `tooling/art-direction.test.mjs`, `tooling/presentation-registry.test.mjs`, `tooling/design-lint.test.mjs` |

Phase 4D is the place for reference analysis, multiple art-direction candidates, responsive
composition, visual critic promotion/rejection and comparison canvas work. Its implementation order is
`docs/PHASE_4D_EXECUTION.md`.
