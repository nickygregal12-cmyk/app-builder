# Architecture

## Two-layer model

App Builder is intentionally split into two products inside one repository.

### 1. App Factory Engine

Responsible for deterministic work:

- intake/build-contract schemas
- project manifests
- project-type defaults
- optional module recipes
- templates and code generation
- context routing and cost budgets
- validation and quality gates
- deployment adapters
- provenance and project knowledge snapshots

The engine must be usable without the graphical console.

### 2. Builder Console

A private interface over the engine:

- prompt/chat and adaptive questionnaire
- file/image/document intake
- build contract review
- live desktop/tablet/mobile preview
- click-to-edit content/assets/components
- asset manager
- plan/progress view
- versions/checkpoints
- model routing controls
- integrations/secrets status
- logs/database views
- build and operating-cost visibility
- preview/production deployment

### Preview boundary

A generated preview is an ordinary dev server the factory owns. It binds
loopback only and is never exposed directly, because a factory-host address is
not reachable by a remote operator and a per-build tunnel is an operations
workaround, not a product.

The Console therefore never learns a preview's host or port. Operator-facing
preview state is a path — `/preview/<projectId>/` — which the Console serves
from its own origin and forwards to the factory service unchanged. The service
is the only component that maps that project to a loopback port, and it takes
the destination from its own preview state, so a caller can name a project but
never a host, a port or another local service. An unknown project, a stopped
preview or a stale one fails closed.

The preview process is launched with that same path as its base, so every
module, asset and route the generated app emits is already addressed through
the boundary. The base is a launch argument: the generated repository stays an
ordinary portable project that serves from the domain root everywhere else.

## Generated app flow

```text
messy input
  -> deterministic intake
  -> targeted AI follow-ups only where ambiguity matters
  -> reviewed build contract
  -> project manifest
  -> project template + optional recipes
  -> novel AI implementation only for gaps
  -> deterministic QA
  -> targeted AI visual/security review
  -> deploy ordinary repository
```

## Project knowledge snapshot

Build provenance a generated repository needs in order to be rebuilt or reconciled
lives in `.app-builder/` (manifest, project record, adapters, recipes, composition,
element identity, handover). That directory is the factory's own record of the build.

`.product/` is the compact, product-facing summary a person or an agent reads before
exploring source code. It is not aspirational any more, but it is small: it contains
what has a real producer and a real consumer today.

```text
.product/
  design-system.json   # compiled DesignSystemSpec: layout family, active controls, CSS tokens
```

`design-system.json` is the exact compiler output that `src/generated/brand.css` was
rendered from, written by the same call in both initial generation and a live Console
design edit. It is plain JSON with no App Builder import, so the repository stays an
ordinary one.

Further summaries (entities, routes, modules, integrations, decisions, provenance)
are named in the roadmap and are added when something produces and consumes them,
not before.
