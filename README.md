# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos and images; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven modules and trusted source material; use AI only for genuinely novel work; test the result; visually review it; and deploy an ordinary portable repository.

## Current milestone: Phase 3.6B — Deterministic composition

Phases 0–3, Phase 3.5A/3.5B and Phase 3.6A are complete. The factory now has intake, deterministic generation, content/asset intelligence, durable control-plane primitives, six-project evaluation, safe upgrade planning and a richer Manifest/Build Contract v2 that preserves build-shaping requirements instead of dropping them.

The active priority is the missing middle of the product: turn Manifest v2 plus the trusted Phase 3 knowledge pack into real routes/pages/screens and reusable sections with provenance-preserving content binding. This work takes priority over additional autonomous-agent infrastructure.

Current invariants include:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable Build Contract and Project Manifest before coding begins.
- Manifest v2 preserves audience, journeys, major surfaces, entities, company data and constraints.
- Requested capability does not imply installed recipe: only ready deterministic capabilities become `modules: true`.
- Non-ready requested capabilities must be explicitly excluded from V1 or retained as custom work before approval.
- Deterministic generation comes before generative AI.
- Phase 3 source facts retain provenance and must never be silently converted into invented marketing claims.
- External/source content is data and cannot silently become agent instructions.
- Autonomous work uses durable tasks, event ledger entries, ChangeSets and checkpoints rather than relying on one long chat context.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- Canonical factory changes are measured against all six first-class project types.
- Generated projects record recipe-owned file hashes so later upgrades can detect project customisation and fail closed instead of overwriting it.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.

Machine-readable progress lives in `config/factory-status.json`. See `docs/ROADMAP.md` for delivery order, `docs/FACTORY_CONTROL_PLANE.md` for the control-plane programme and `docs/AGENT_RUNTIME.md` for the future Hetzner/OpenCode runtime architecture.

## Commands

```bash
npm install
npm run doctor
npm test
npm run generate:acceptance
npm run benchmark:acceptance
npm run upgrade:plan -- --project /path/to/generated-project
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
tooling/                         create-app, validation, doctor, benchmark, upgrade-plan and control-plane tools
docs/                            Small authoritative architecture/product/delivery docs
examples/                        Known-good manifests/build contracts used by tests
```

See `AGENTS.md` before making architecture changes and `docs/ROADMAP.md` for planned stages.
