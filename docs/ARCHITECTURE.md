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

Every generated app should eventually maintain a compact `.product/` directory:

```text
.product/
  manifest.json
  entities.json
  routes.json
  modules.json
  brand.json
  integrations.json
  decisions.json
  provenance.json
```

Agents read these summaries before exploring source code.
