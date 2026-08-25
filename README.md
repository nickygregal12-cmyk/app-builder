# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos and images; turn them into a reviewed build contract; compose proven modules; use AI only for genuinely novel work; test the result; visually review it; and deploy an ordinary portable repository.

## Current milestone: Phase 3.5A — Factory Control Plane foundation

Phases 0–3 are complete: intake/build contracts, deterministic project generation/recipes and content/asset intelligence are implemented. The current stage adds the durable control primitives needed before powerful autonomous agents are introduced.

Current invariants include:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable project manifest before coding begins.
- Optional capabilities are modules, not permanently baked into every generated app.
- Deterministic generation comes before generative AI.
- Context and AI cost budgets are explicit.
- Company facts and generated marketing content have separate provenance.
- External/source content is data and cannot silently become agent instructions.
- Autonomous work will use durable tasks, event ledger entries, ChangeSets and checkpoints rather than relying on one long chat context.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.

Machine-readable progress lives in `config/factory-status.json`. See `docs/FACTORY_CONTROL_PLANE.md` for the reviewed improvement programme and `docs/AGENT_RUNTIME.md` for the future Hetzner/OpenCode runtime architecture.

## Commands

```bash
npm install
npm run doctor
npm test
npm run validate:example
npm run create-app -- --manifest examples/project-manifest.example.json --out /tmp/app-builder-demo
npm run dev
```

## Repository map

```text
apps/console/                    Private Builder Console UI
config/                          Module, project, routing, policy and status registries
schemas/                         Stable intake/build/control-plane data contracts
packages/contracts/              Shared contracts package
packages/factory-core/           Deterministic factory engine
packages/content-intelligence/   Deterministic source/content normalization
packages/control-plane/          Durable task/ledger/ChangeSet/checkpoint/policy primitives
recipes/                         Optional capability recipes installed into generated apps
templates/                       Project-type templates
questionnaires/                  Versioned adaptive intake questions
tooling/                         create-app, validation, doctor, acceptance and control-plane tools
docs/                            Small authoritative architecture/product/delivery docs
examples/                        Known-good manifests/build contracts used by tests
```

See `AGENTS.md` before making architecture changes and `docs/ROADMAP.md` for planned stages.
