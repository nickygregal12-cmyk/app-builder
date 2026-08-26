# Deterministic Generator

Phase 2 turns an approved Project Manifest into an ordinary standalone repository.

## Boundary

App Builder is a factory, not a runtime framework. Generated projects contain a small `.app-builder/` provenance directory but do not depend on an `app-builder` npm package, the Builder Console, or factory source code.

## Renderer contract

Phase 4.2 stopped treating every product as the same architecture. A project type
selects a **renderer**, and the renderer names the template that implements it:

    approved product truth
        -> Manifest / Composition / PageSpec / SectionSpec
        -> DesignSystemSpec / BrandSpec / ArtDirectionPlan /
           ResponsiveCompositionPlan / MotionContract / Presentation Registry
        -> renderer selection
             |- static-content  (marketing / content sites)
             '- application     (SaaS / consumer / internal / AI)
        -> portable generated repository

`config/renderers.json` is the registry. Selection is a pure function of the
project type and the modules the manifest enables — never a prompt, a model or
free text — so the same approved truth always reaches the same renderer and a
rebuild is a rebuild rather than a re-roll. A capability override may move a
project to a renderer that can carry a capability it enabled (a marketing site
with a real authenticated area is an application with marketing pages); it may
never move one the other way.

A renderer renders decisions. It introduces no second composer, product schema,
content model, Design Contract, brand system, art-direction system, presentation
authority or source/provenance model.

## Template contract

A template owns the stable application shape, and implements exactly one
renderer. Versioned template metadata lives in `template.json`; its copyable
files live under `files/`.

Templates should contain only cross-project structure. They must not contain
company-specific or product-domain-specific logic.

Two things a template declares rather than assumes:

- `sharedFiles` — the design tokens and stylesheet, copied from
  `templates/shared/presentation/`. Every Phase 4C/4D decision reaches a page as
  a custom property or a class name, and both templates read the same ones. One
  source is what keeps two renderers from becoming two design systems.
- `generated` — where generated state is written and in which form. The recipe
  registry is the one generated artifact whose shape depends on what the
  renderer can execute.

## Recipe contract

A recipe is an optional capability that can be installed into multiple generated projects.

Each recipe declares its recipe/module id and semantic version, compatible templates, managed files, entry module, required/conflicting recipes, and optional package dependencies/devDependencies/scripts.

A recipe may also declare a `renderers` map: one implementation per renderer,
inheriting everything it does not restate. The capability is the same either
way — `seo` is page metadata in both — but the application renderer writes it
into `document.head` after booting and the static renderer generates it into
each route's document. A capability with no implementation for the selected
renderer is refused at generation, never substituted or silently dropped.

Recipe-managed files should remain narrowly namespaced so install/remove operations do not overwrite unrelated application work.

## Fail-closed generation

If a manifest enables a module that has no `ready` deterministic recipe, generation fails with an explicit list of missing modules. The factory must never claim a capability exists merely because its manifest flag is true.

## Generated provenance

Each generated project receives `.app-builder/manifest.json`, `.app-builder/project.json`, `.app-builder/recipes.json` and `.app-builder/template-package.json`. These records support later factory upgrades but are not runtime dependencies.

## Commands

Plan without writing:

```bash
npm run create-app -- --manifest examples/generator-project-manifest.json --plan
```

Generate:

```bash
npm run create-app -- --manifest examples/generator-project-manifest.json --out generated/example
```

Add/remove a ready recipe:

```bash
npm run recipe -- --project generated/example --add feature-flags
npm run recipe -- --project generated/example --remove feature-flags
```

The CI acceptance project proves that a generated repository can install its own dependencies, pass its own checks and build independently.
