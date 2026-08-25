# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos, images, design references and existing repositories; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven capabilities and trusted source material; use AI only for genuinely novel work; test and visually review the result; and deploy an ordinary portable repository.

## Current milestone: Phase 3.8 — Product proof and correctness hardening

**Active substage: Phase 3.8E — Genuine business product proof.**

Phases 0–3, the Phase 3.5 control-plane foundation, deterministic composition and the core Phase 3.7 factory service/tool boundary are implemented. Phase 3.8A–D correctness hardening is also now landed: ChangeSet path-scope correctness, schema-first Manifest validation/types, executed Supabase RLS acceptance and serious/critical generated-app accessibility gates.

The active product gate is now deliberately narrower: prove the factory against genuine business material rather than another synthetic fixture. A passing Phase 3.8E evidence pack must use a real public company website plus approved user-supplied company material, record the real intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview/deploy journey, pass launchability review, retain artifact hashes and finish with fewer than 20 meaningful manual edits.

The Acme mixed-source scenario remains valuable deterministic CI regression coverage, but it is explicitly synthetic and cannot satisfy Phase 3.8E. After the genuine-business proof, the remaining Phase 3.8 interoperability item is the bounded MCP service facade before wider Phase 4 expansion.

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
npm run acceptance:synthetic-mixed-source
npm run acceptance:genuine-business:validate -- /path/to/genuine-business-evidence.json
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
