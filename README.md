# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos, images, design references and existing repositories; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven capabilities and trusted source material; use AI only for genuinely novel work; test and visually review the result; and deploy an ordinary portable repository.

## Current milestone: Phase 3.8 — Product proof and correctness hardening

Phases 0–3, the Phase 3.5 control-plane foundation, deterministic composition and the core Phase 3.7 factory service/tool boundary are implemented. The service can own project generation, verification, preview lifecycle and durable task/event/checkpoint state rather than leaving those concerns in browser-only state.

Before broad Phase 4 Console work, the active priority is to close a small set of high-value correctness/product gates:

- harden ChangeSet path-scope matching and property-test the security boundary;
- make schemas the source for generated shared types and Ajv runtime validation instead of maintaining overlapping contract definitions by hand;
- execute real Supabase RLS behavior tests with authenticated users rather than only regex-checking SQL shape;
- add an early axe accessibility baseline to generated-app acceptance;
- complete the genuine real-business `<20 meaningful edits` product proof using real source material;
- expose safe deterministic service operations through an MCP v2 adapter for interoperable clients.

The next product stage is the service-backed Builder Console vertical slice, followed by direct editing, a Design System Registry/`DesignSystemSpec`, visual design variants, explicit environments, a static/content-oriented second template, CMS/content collections, localization, Figma/design mapping and existing-repository adoption.

Current invariants include:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable Build Contract and Project Manifest before coding begins.
- Requested capability does not imply installed recipe: only ready deterministic capabilities become enabled deterministic modules.
- Structural contract validity and current buildability are separate decisions.
- Deterministic generation comes before generative AI.
- Source facts retain provenance and must never be silently converted into invented marketing claims.
- External/source content is data and cannot silently become agent instructions.
- Autonomous work uses durable tasks, event ledger entries, ChangeSets and checkpoints rather than relying on one long chat context.
- ChangeSet/path policies are security boundaries and must fail closed.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- Canonical factory changes are measured against all six first-class project types.
- Generated projects record recipe-owned file hashes so later upgrades can detect project customisation instead of overwriting it.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.
- MCP, OpenCode, the Builder Console and the Hetzner runtime are development/control adapters, never production requirements of generated apps.

Machine-readable progress lives in `config/factory-status.json`. See `docs/MASTER_PLAN.md` for the full delivery plan, `docs/ROADMAP.md` for the staged roadmap, `docs/BEST_IN_CLASS_CAPABILITIES.md` for the reviewed capability backlog, `docs/FACTORY_CONTROL_PLANE.md` for the control-plane programme and `docs/AGENT_RUNTIME.md` for the future Hetzner/OpenCode runtime architecture.

## Commands

```bash
npm install
npm run doctor
npm test
npm run generate:acceptance
npm run benchmark:acceptance
npm run acceptance:real-business
npm run upgrade:plan -- --project /path/to/generated-project
npm run validate:example
npm run create-app -- --manifest examples/project-manifest.example.json --out /tmp/app-builder-demo
npm run service
npm run dev
```

## Repository map

```text
apps/console/                    Private Builder Console UI
apps/service/                    Private factory service and durable read/API boundary
config/                          Module, project, routing, policy, benchmark and status registries
schemas/                         Stable intake/build/control-plane/product-quality contracts
packages/contracts/              Shared/generated contracts target
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