# Deterministic Generator

Phase 2 turns an approved Project Manifest into an ordinary standalone repository.

## Boundary

App Builder is a factory, not a runtime framework. Generated projects contain a small `.app-builder/` provenance directory but do not depend on an `app-builder` npm package, the Builder Console, or factory source code.

## Template contract

A template owns the stable application shape. Versioned template metadata lives in `template.json`; its copyable files live under `files/`.

`config/templates.json` selects one ready default template for each project type.

Templates should contain only cross-project structure. They must not contain company-specific or product-domain-specific logic.

## Recipe contract

A recipe is an optional capability that can be installed into multiple generated projects.

Each recipe declares its recipe/module id and semantic version, compatible templates, managed files, entry module, required/conflicting recipes, and optional package dependencies/devDependencies/scripts.

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
