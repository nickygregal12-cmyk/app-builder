# Deterministic Composition

Phase 3.6B joins approved Project Manifest v2 requirements and the trusted Phase 3 knowledge pack into stable product structure before any generative implementation work.

## Structural quality and layout selection

The `composition` role's `owns` list in `config/agent-roles.json` is the machine-readable statement of
what composition decides. Two consequences of it belong here, because they constrain this subsystem
rather than that registry entry.

**A schema-valid `PageSpec` is not a good layout.** Structural quality is judged, not asserted by the
producer: primary-task prominence, task-completion path, information hierarchy, scanability, critical
information visibility, cognitive load, navigation depth, grouping, the number of competing actions,
category expectations, responsive behaviour, accessibility implications and fit with the actual
journeys. That judgement belongs to the existing `ia-critic` and `ux-critic`, whose `mayNot` now names
the specific failure: passing a hierarchy because it is complete while a high-frequency task is buried
in it, or passing a composition because its `PageSpec` validates while the primary task is not visible
on the surface that owns it. No `composition-critic` exists, and one is added only if benchmark
evidence shows those two cannot reliably judge composition — another permanent reviewer is a cost paid
on every build.

**Layout family is selected from task shape, with project type as the fallback.**
`config/layout-patterns.json` maps each project type to a default — marketing to `public-marketing`,
B2B SaaS to `app-sidebar`, consumer to `app-focused`, internal tool to `app-dense`, content to
`editorial`, AI app to `workspace`. Those defaults stay, because a build must always be able to select
a family without spending a model call. They are not sufficient product reasoning: project type is a
weak proxy for what actually decides a layout, which is the shape of the work — the primary tasks and
how often they happen, whether anything is deadline-bearing, how many major surfaces exist, density and
data complexity, role complexity, context-switching frequency, whether the product is oriented to
creating, monitoring or browsing, how much mobile matters, the navigation depth the journeys imply, and
the business visual profile where relevant. The intended rule is `product/task shape -> layout
candidates`, with `project type -> layout` as the answer when that evidence is absent rather than as
the first answer.

For a contested surface — typically a home, dashboard or workspace — composition may produce two or
three materially different structural candidates and compare them on the criteria above before
typography, colour, motion and polish exist to obscure the difference, recording why the winner won.
Variants are produced because the surface is genuinely contested, never to fill a quota: a simple page
gets one confident composition.

`ResponsiveCompositionPlan` already carries mobile content order, navigation treatment, hero stacking,
density and motion, and the template reads them. What matters upstream is that the mobile composition
may legitimately change order, prominence, navigation method, density, progressive disclosure and
interaction pattern, because the same user goal can need a different spatial answer on a phone.
`desktop columns -> stacked mobile columns` is one valid outcome, never the definition.

## Contracts

- `ContentBinding` records value origin plus source/fact/entity IDs and whether the value was generated.
- `SectionSpec` records semantic section type, purpose, content bindings, actions and asset references.
- `PageSpec` records route, navigation, purpose, primary action and ordered section IDs.
- `composition.json` is the complete deterministic output plus warnings and a stable input/output hash.

## Supported path

`create-app` is the supported composed generation entrypoint:

```bash
npm run create-app -- --manifest project-manifest.json --knowledge-pack knowledge-pack.json --out ./generated/example
```

The knowledge pack is optional. Without one, composition uses approved Manifest v2 data and clearly marked deterministic defaults. It never treats generated defaults as source-backed claims.

Generated projects receive:

- `.app-builder/composition.json`
- `src/generated/composition.ts`
- standalone route/navigation/section rendering in the neutral template

The generated repository has no runtime dependency on `@app-builder/composition` or the App Builder factory.

## Provenance rule

Content priority is:

1. verified/user-provided knowledge-pack fact or entity;
2. approved Manifest v2 value;
3. deterministic default with `generated: true`.

Bindings retain the relevant `sourceIds`, `factIds` and `entityIds`. The rendered template exposes origin/generated state as non-visual `data-*` attributes so later Builder Console click-to-edit and provenance review can target stable bindings.

## Builder Element Identity

Direct manipulation needs to know exactly what a click landed on. Guessing a
source file from the DOM is how a visual editor starts writing patches into the
wrong place, so the factory does not guess: it records the answer at generation
time.

The template declares how it renders a composed section in the `presentation`
block of its `template.json` — a presentation component id and version per
section type, the element role each binding key plays, whether the component
renders section actions and assets, and the design tokens each role consumes.
That declaration plus the composition is enough to derive every addressable
element deterministically. `deriveElementIdentities` does it, and the result is
written to `.app-builder/element-identity.json` under the
`element-identity` contract family.

An element's address is `pageId/sectionId/elementKey`, where the element key is
one of `section`, `binding:<key>`, `action:<index>` or `asset:<assetId>`. The
identity it resolves to carries the whole chain: page and page path, section id,
type and variant, presentation component and instance, binding key, provenance
references, the artifact and JSON pointer the value lives at, the template's
declared editable properties and the design tokens in play.

The generated app renders only the coordinates — `data-section-id` and
`data-element-key`. Component ids, file locations, fact ids and source ids stay
in the index, which is builder metadata beside the composition rather than a
module the app imports, so a deployed site publishes none of it and a generated
repository stays portable.

Resolution has four outcomes and only one of them permits an edit:

- `resolved` — the build renders this element;
- `unknown` — a well-formed address this build does not render;
- `stale` — the composition has moved past the index the caller read;
- `malformed` — not an address at all.

`assertEditableElement` refuses everything but `resolved`, and refuses that too
unless the template declares the requested property editable for that element's
role. The service applies it to every new or changed content override, so an
edit with nowhere to land never reaches disk. Removals and unchanged entries
skip the check: a rebuild that drops a section must not be able to wedge the
whole edit record.

Identity is derived from the deterministic baseline rather than the edited
composition. A human sentence replaces a value without moving the element it
lives in, so writing copy leaves every address intact; whether a binding has
been overridden is read live from the composition at resolve time.

## Design Contract

Structured controls over the design decisions the factory already makes, not a
stylesheet someone can type into. Four controls: the brand accent, the measure,
the corner radius and the section rhythm.

Three of them take a value from a declared set, and a value outside it is
refused — as is a control the contract does not name, so arbitrary CSS cannot
arrive through the same door. The accent is the one free value, bounded by a
rule instead of a list: an accent that cannot carry the label placed on it at
4.5:1 is refused, because an unreadable primary action is a correctness problem
rather than a matter of taste.

The contract compiles. `compileDesignTokens` emits only custom properties the
stylesheet actually reads — `--color-accent`, `--layout-max-width`,
`--layout-radius` and `--section-space` — and a test asserts every compiled
property is one the template uses and has a default in the token file. A design
contract that does not compile is a prompt.

`density` used to be exactly that: named in every layout pattern and in
`schemas/design-contract.schema.json`, read by nothing. It now compiles to
`--section-space`, and the hero's variants scale that rhythm rather than
replacing it, so the design contract and a section's presentation compose.

Choices live in a durable `design-choices.json` and are applied over the
factory's own selection. The build records that selection separately as
`composedDesign`, so clearing a control returns it to what the factory chose
instead of freezing whatever was written last. Because the brand stylesheet is
generated, a compiled design reaches the running preview without a rebuild, and
recipe reconciliation keeps the recorded design rather than re-selecting it.

Full design-system authoring — palettes, type scales, component theming — is
Phase 4C. This is the bounded set that already compiles.

## Section presentation

A composed section can be shown more than one way, but only in the ways its
template actually implements.

`SectionSpec.variant` used to be close to decorative: the composer emitted
eleven values, the template rendered each as a `variant-<name>` class, and the
stylesheet styled one of them. A picker on top of that would have offered
choices that changed nothing.

The template now declares, per component, the variants it genuinely renders
differently, each with a label and what it is for. `Items` presents cards, a
list or feature columns according to the section's variant instead of guessing
from whether items happen to carry detail. A component that renders one way
declares no variants and is not offered, because a choice of one is not a
choice, and a variant the template does not declare is refused rather than
written into the composition as a class that styles nothing.

Because the variant is now authoritative, the composer records a truthful one:
it knows whether its items carry detail, so it says `cards` or `list`
accordingly.

Choices live in a durable `section-variants.json` and are replayed by
`applySectionVariants` over the deterministic composition, keeping what they
replaced in `variantOverriddenFrom` so the factory's own presentation is always
recoverable through `stripSectionVariants`. Nothing mutates the DOM: the choice
is recorded and the section recomposed, and because the preview renders the
workspace composition it appears without a rebuild.

Element identity is derived from a baseline with both this and content
overrides stripped, so choosing a presentation — like writing a sentence — does
not move any element address.

## Asset decisions

Composition places an asset only when someone has said it may be published.
That permission is per asset, not per source.

Source governance settles what the factory may read, before ingestion.
Approving a company's website as a source says nothing about whether its
photographs may be republished — those are usually a photographer's, not the
company's. So each ingested image carries its own decision, made after
ingestion and still changeable after a build, and an approval that outruns its
source's rights requires an explicit rights declaration for that asset alone.
Narrowing never does: refusing to publish something is always allowed.

Decisions live in a durable `asset-decisions.json` beside the knowledge pack
rather than inside it. The pack is derived truth about sources, and
`validateKnowledgePack` requires every asset's governance to match the source it
came from; a person overriding one photograph must not be able to rewrite that
derivation. `composeProject({ manifest, knowledgePack, assetDecisions })` reads
both and stays a pure function of its inputs, and the composition records
`input.assetDecisionsHash` so a decision made after a build reads as newer than
the build instead of being silently ignored.

Replacing a picture makes a new asset. Identity comes from bytes, so a
replacement cannot be the same asset, and treating it as one would mean carrying
a rights declaration made about a different photograph. It does not: the
declaration for the new picture arrives with it, and the crop review and focal
point start again because they described a different subject. The retired asset
records `supersededBy` and the replacement records `replaces`, so the lineage
survives even though the identity does not, and composition follows governance
without extra machinery — the retired picture leaves the build and the
replacement enters it because placement has always followed publishability.

Smart crops are withheld until reviewed. Sharp derives `hero-16x9`, `card-4x3`
and `square-1x1` with an attention heuristic and marks each
`reviewBeforePublish`. Those crops are copied into the generated repository only
once someone has approved them. The picture itself still publishes: the template
falls back to the widest responsive variant and the layout sets its own aspect
ratio, so an unreviewed crop costs a considered framing rather than the image.

A person can say where the subject is instead. Ingestion retains the original —
every derived file is a resize or a crop of it, and it stays factory-side
because it is not a variant. A focal point recorded in normalised coordinates
recomputes the three crops with a window clamped to the image, so a subject near
an edge moves the frame without running off it. Choosing a point returns
`cropReview` to pending: saying where the subject is and agreeing with the crop
are different judgements. The point is durable and re-applied after
re-ingestion, which regenerates derived files and would otherwise hand the
framing back to the heuristic.

## Rendered evidence

The launch-readiness audit reads composed output and says so plainly: it cannot
see rendered pixels. Rendered evidence is the other half.

`npm run check` passing and a production build succeeding say a project
compiles. They say nothing about what it looks like at 390px, or what an error
state shows a visitor. So capturing evidence points a real browser at the
service-managed preview — the same rendering a person reviews, not a separately
started server that might be serving something else — and records the result
under the `rendered-evidence` contract in service state, never inside the
generated repository.

The plan is deterministic and reuses Phase 3.8K's `deriveStateMatrix` rather
than deriving states again. It decides only which of those states a browser can
be pointed at:

- every route at desktop (1280), tablet (768) and mobile (390) — the same
  widths the Console previews at, so evidence and review are the same
  rendering;
- the critical interaction states the build actually has, reached through a
  closed registry of interactions rather than arbitrary scripting.

Everything else is recorded in `uncovered` with a reason, because a screenshot
set that quietly omits what it could not reach reads as complete coverage:

- `not-visually-provable` — a capture cannot establish that a write succeeds;
- `needs-a-deterministic-fixture` — an empty or long-content state needs a
  fixture composition the build does not carry;
- `capability-not-installed` — the section that state belongs to is not on that
  route.

`applyEvidenceToStateMatrix` raises only the viewport axis, where rendering at
that width *is* the proof. Every other state keeps `evidence: 'none'` and waits
for executable evidence, which is a different artifact produced by a different
role. Nothing lets a capture answer a journey step that `deriveJourneys` marks
`needs-executable-evidence`: a picture of an enquiry form is not proof that an
enquiry arrives.

Captures carry the element identity refs they show, so visual evidence and
Builder Element Identity address the same things.

Capture uses Chromium, loaded lazily so the service starts, generates, verifies
and previews on a host with no browser. `APP_BUILDER_BROWSER_EXECUTABLE` points
it at an existing Chromium where a host has one.

## Compatibility

The low-level legacy generator remains available for recipe reconciliation and existing tests. The template includes an empty composition fallback, so direct low-level generation remains buildable. New official generation and all six canonical acceptance builds use the composed generator.
