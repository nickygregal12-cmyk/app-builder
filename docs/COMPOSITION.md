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

## Compatibility

The low-level legacy generator remains available for recipe reconciliation and existing tests. The template includes an empty composition fallback, so direct low-level generation remains buildable. New official generation and all six canonical acceptance builds use the composed generator.
