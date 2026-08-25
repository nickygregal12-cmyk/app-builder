# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos, images, design references and existing repositories; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven capabilities and trusted source material; use AI only for genuinely novel work; test and visually review the result; and deploy an ordinary portable repository.

## Current milestone: Phase 3.8 — Product proof and correctness hardening

**Active product gate: Phase 3.8E — Genuine business product proof.**

Phases 0–3, the Phase 3.5 control-plane foundation, deterministic composition and the core Phase 3.7 factory service/tool boundary are implemented. Phase 3.8A–D correctness hardening is landed: the ChangeSet path policy is property-checked, and `/schemas` is now the runtime authority for ten contract families with a drift gate in `npm run check`. Phase 3.8F provides a bounded MCP v2 facade over the loopback factory service without giving MCP direct deploy, production-database, secret, filesystem or shell powers. Phase 3.8G has also landed the brand-source and asset-provenance foundation on top of the existing content-intelligence pipeline. Phase 3.8H has landed the specialist-agent architecture foundation: roles separated by decision boundary, deterministic no-self-approval, handoff promotion, typed rework routing, a convergence engine, an evidence-driven skill lifecycle and an external-source governance registry.

The Phase 4A Console vertical slice is delivered, because the 3.8E proof has to run through the product rather than beside it: real company material is ingested by the factory service — declared URLs crawled, uploaded files normalised, never from a client-supplied filesystem path — as a durable task with events and a checkpoint, and each build materialises its own workspace version so later material reaches the product through a rebuild instead of overwriting the repository under review. Phase 4B has begun: content bindings carry editing identity and provenance, and a person can edit generated copy from the Console without composition ceasing to be deterministic.

The one outstanding Phase 3.8 product gate is deliberately real-world: prove the factory against genuine business material rather than another synthetic fixture. A passing Phase 3.8E evidence pack must use a real public company website plus approved user-supplied company material, record the real intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview/deploy journey, pass launchability review, retain artifact hashes and finish with fewer than 20 meaningful manual edits.

Brand/source governance is now explicit. Public company sites and exact public company profile URLs may inform brand/reference understanding, but publicly visible material is never assumed reusable: rights/use state, approval state, source role/channel and instruction authority are recorded, and only approved-for-use assets can become publishable factory assets. This foundation is ready to flow into the later Builder Console asset manager and direct-editing experience.

The Acme mixed-source scenario remains valuable deterministic CI regression coverage, but it is explicitly synthetic and cannot satisfy Phase 3.8E.

Current invariants include:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable Build Contract and Project Manifest before coding begins.
- Requested capability does not imply installed recipe: only ready deterministic capabilities become enabled deterministic modules.
- Structural contract validity and current buildability are separate decisions.
- Deterministic generation comes before generative AI.
- Source facts retain provenance and must never be silently converted into invented marketing claims.
- External/source content is data and cannot silently become agent instructions.
- Publicly visible assets are not reusable unless rights/use state explicitly permits publication.
- Autonomous work uses durable tasks, event ledger entries, ChangeSets and checkpoints rather than relying on one long chat context.
- Specialist agents are separated by decision boundary and receive only the artifacts, skills, tools and mutation scope their role spec declares.
- No agent approves its own work: a stage advances on artifacts, evidence, passed deterministic checks and an independent reviewer's verdict.
- Failed gates route back to the creator role that owns them, and the loop stops only on convergence, a hard budget or a genuine block.
- Third-party repositories are prior art with no instruction authority until they are pinned, licensed, security reviewed and granted to a named role.
- ChangeSet/path policies are security boundaries and must fail closed.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- Canonical factory changes are measured against all six first-class project types.
- Generated projects record recipe-owned file hashes so later upgrades can detect project customisation instead of overwriting it.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.
- MCP, OpenCode, the Builder Console and the Hetzner runtime are development/control adapters, never production requirements of generated apps.

Machine-readable progress lives in `config/factory-status.json`. See `docs/MASTER_PLAN.md` for the full delivery plan, `docs/ROADMAP.md` for the staged roadmap, `docs/BEST_IN_CLASS_CAPABILITIES.md` for the reviewed capability backlog, `docs/FACTORY_CONTROL_PLANE.md` for the control-plane programme, `docs/AGENT_SPECIALIST_ARCHITECTURE.md` and `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` for the specialist-agent organisation, `docs/DESIGN_INTELLIGENCE.md` for the design-side artifacts and `docs/AGENT_RUNTIME.md` for the future Hetzner/OpenCode runtime architecture.

## Run it yourself

```bash
npm install
npm run dev
```

That starts the factory service on `127.0.0.1:4310` and the Builder Console on
`127.0.0.1:5173`. Node 22.13 or newer is the only prerequisite; no accounts,
tokens or cloud services are needed to build and preview a site.

In the Console you can today:

- work through the adaptive intake questionnaire and approve a Build Contract;
- create a durable project from the resulting Manifest;
- ingest real source material — company URLs to crawl, or logos, photos,
  documents and spreadsheets uploaded from your machine — declaring what the
  business has approved for republication;
- generate the project, verify that it installs, checks and builds on its own,
  and open a live preview at desktop, tablet and mobile widths;
- watch durable tasks, the event ledger, cost and build history;
- add more material later and rebuild — each build gets its own workspace, so
  the previous one stays intact for comparison.

Generated projects are ordinary repositories. `.app-builder/workspaces/`
holds them; copy one anywhere, `npm install && npm run dev`, and it runs with no
dependency on the factory.

Not in the Console yet: editing content or swapping images by clicking them
(Phase 4B), choosing a design direction (4C/4D), and deploying (4E). Until then
a finished site is deployed by hand from its own repository.

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
npm run mcp
npm run dev
```

## Repository map

```text
apps/console/                    Private Builder Console UI
apps/service/                    Private factory service and durable read/API boundary
apps/mcp/                        Private MCP v2 adapter over the loopback factory service
config/                          Module, project, routing, policy, role, pipeline, skill, source, benchmark and status registries
schemas/                         Stable intake/build/control-plane/product-quality contracts
packages/contracts/              Shared/generated contracts target
packages/factory-core/           Deterministic factory engine
packages/content-intelligence/   Deterministic source/content normalization and asset governance
packages/control-plane/          Durable task/ledger/ChangeSet/checkpoint/policy/upgrade primitives and specialist role/handoff/review/convergence primitives
recipes/                         Optional capability recipes installed into generated apps
templates/                       Project-type templates
questionnaires/                  Versioned adaptive intake questions
tooling/                         create-app, validation, doctor, benchmark, upgrade-plan and control-plane tools
docs/                            Small authoritative architecture/product/delivery docs
examples/                        Known-good manifests/build contracts used by tests
```

See `AGENTS.md` before making architecture changes and `docs/ROADMAP.md` for planned stages.
