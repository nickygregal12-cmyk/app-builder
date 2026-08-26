# Deterministic Composition

Phase 3.6B joins approved Project Manifest v2 requirements and the trusted Phase 3 knowledge pack into stable product structure before any generative implementation work.

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
