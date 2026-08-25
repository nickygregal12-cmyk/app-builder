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

## Compatibility

The low-level legacy generator remains available for recipe reconciliation and existing tests. The template includes an empty composition fallback, so direct low-level generation remains buildable. New official generation and all six canonical acceptance builds use the composed generator.
