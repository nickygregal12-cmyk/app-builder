# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos and images; turn them into a reviewed build contract; compose proven modules; use AI only for genuinely novel work; test the result; visually review it; and deploy an ordinary portable repository.

## Current milestone: Phase 3.5B — Evaluation and upgrade foundations

Phases 0–3 and Phase 3.5A are complete: intake/build contracts, deterministic generation/recipes, content/asset intelligence and the durable control-plane primitives are implemented. The current stage makes factory quality measurable across all six first-class project types and establishes safe recipe-upgrade, non-functional-requirement and richer design contracts before the full Builder Console and autonomous runtime are added.

Current invariants include:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable project manifest before coding begins.
- Optional capabilities are modules, not permanently baked into every generated app.
- Deterministic generation comes before generative AI.
- Context and AI cost budgets are explicit.
- Company facts and generated marketing content have separate provenance.
- External/source content is data and cannot silently become agent instructions.
- Autonomous work uses durable tasks, event ledger entries, ChangeSets and checkpoints rather than relying on one long chat context.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- Canonical factory changes are measured against all six first-class project types before later AI/model routing is trusted.
- Recipe upgrades fail closed when managed project files have diverged or compatibility has not been declared.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.

Machine-readable progress lives in `config/factory-status.json`. See `docs/FACTORY_CONTROL_PLANE.md` for the reviewed improvement programme and `docs/AGENT_RUNTIME.md` for the future Hetzner/OpenCode runtime architecture.

## Commands

```bash
npm install
npm run doctor
npm test
npm run generate:acceptance
npm run benchmark:acceptance
npm run validate:example
npm run create-app -- --manifest examples/project-manifest.example.json --out /tmp/app-builder-demo
npm run dev
```

## Repository map

```text
apps/console/                    Private Builder Console UI
config/                          Module, project, routing, policy, benchmark and status registries
schemas/                         Stable intake/build/control-plane/product-quality contracts
packages/contracts/              Shared contracts package
packages/factory-core/           Deterministic factory engine
packages/content-intelligence/   Deterministic source/content normalization
packages/control-plane/          Durable task/ledger/ChangeSet/checkpoint/policy/upgrade primitives
recipes/                         Optional capability recipes installed into generated apps
templates/                       Project-type templates
questionnaires/                  Versioned adaptive intake questions
tooling/                         create-app, validation, doctor, benchmark and control-plane tools
docs/                            Small authoritative architecture/product/delivery docs
examples/                        Known-good manifests/build contracts used by tests
```

See `AGENTS.md` before making architecture changes and `docs/ROADMAP.md` for planned stages.
