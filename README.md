# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos, images, design references and existing repositories; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven capabilities and trusted source material; use AI only for genuinely novel work; test and visually review the result; and deploy an ordinary portable repository.

## Current milestone: Phase 4D — Visual direction, responsive composition and candidate promotion

**Phase 3.8E genuine-business product proof passed on 2026-08-26.** The accepted NBM run used the real public site plus owner-approved company material, generated a source-backed v2 workspace, passed verification and rendered-evidence capture, and passed human review with 0 meaningful manual edits. The immutable acceptance record is in `docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`.

Phases 0–3, the Phase 3.5 control-plane foundation, deterministic composition, the Phase 3.7 factory service/tool boundary, Phase 3.8 correctness hardening and the Phase 4A/4B foundations are implemented. The Builder now supports durable approved-intake replay, governed source ingestion, versioned generated workspaces, service-managed preview, rendered evidence, content editing with element identity/provenance, presentation choices, asset governance and structured design controls.

Phase 4C closed on 2026-08-26 against its own completion gate, and it stayed narrow throughout. The existing Design Contract remains the design authority. Active design choices compile through a `DesignSystemSpec` intermediate representation before CSS is rendered, and that compiled spec is persisted into the ordinary generated repository as `.product/design-system.json` by the same writer that renders the stylesheet — so a repository someone walks away with carries the design it was actually built from, with no App Builder dependency. BrandSpec, ArtDirectionPlan and MotionContract now compile into that same spec: a build presents the colour and typeface its own source material showed, and the six canonical project types differ in ground, opening and movement rather than only in accent colour. A Presentation Registry, compiled from the components the template actually renders, now refuses a build whose section presentation it cannot satisfy. Deterministic DesignLint runs over the compiled design and composition before any browser opens, and its report travels inside rendered evidence, so a visual critic is never paid to re-derive what a rule already settled. Every exposed property has a real consumer and a behavioural test. 4C.6, the design-intelligence catalogue, is recorded as conditionally deferred rather than complete: no component is ready to query it.

Phase 4D is now active and most of its machinery is built. `npm run acceptance:visual-candidates` replays the owner-approved nbm intake, generates candidates over one frozen truth, builds and photographs each of them and stops where judgement is required — the factory created them, so the factory cannot promote one. Its job is to make the factory capable of more than one visual answer — several genuinely different art directions over the same frozen product truth, differing structurally rather than by theme, each with a real responsive implementation, compared on deterministic evidence plus independent judgement, with exactly one promoted into the ordinary generated repository.

The runtime-to-factory capability boundary is a separate workstream. Design work does not implicitly unlock broad autonomous runtime permissions.

Brand/source governance is explicit. Public company sites and exact public company profile URLs may inform brand/reference understanding, but publicly visible material is never assumed reusable: rights/use state, approval state, source role/channel and instruction authority are recorded, and only approved-for-use assets can become publishable factory assets.

The Acme mixed-source scenario remains valuable deterministic CI regression coverage, but it is explicitly synthetic and cannot substitute for the already-completed genuine-business acceptance record.

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
- A behaviour-changing registry/contract declaration must prove a real deterministic consumer or remain explicitly non-executable.

Machine-readable progress lives in `config/factory-status.json`, and `AGENTS.md` carries the authority map that says which document owns which decision. See `docs/ROADMAP.md` for where we are and what comes next in order, `docs/MASTER_PLAN.md` for the end state and what "finished" means, `docs/PHASE_4D_EXECUTION.md` for the bounded current execution order, `docs/BEST_IN_CLASS_CAPABILITIES.md` for the reviewed capability backlog, `docs/FACTORY_CONTROL_PLANE.md` for the control-plane programme, `docs/AGENT_SPECIALIST_ARCHITECTURE.md` and `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` for the specialist-agent organisation, `docs/DESIGN_INTELLIGENCE.md` for the design-side artifacts, `docs/ENGINEERING_QUALITY_PROGRAMME.md` for the deterministic engineering gates and tool responsibility map, and `docs/AGENT_RUNTIME.md` for the Hetzner/OpenCode runtime architecture.

## Run it yourself

```bash
npm install
npm run dev
```

That starts the factory service on `127.0.0.1:4310` and the Builder Console on `127.0.0.1:5173`. Node 22.13 or newer is the only prerequisite for local deterministic build/preview work; external integrations are only needed when a selected workflow actually calls them.

On the hosted Hetzner setup the Factory normally runs under systemd. Start only the Console when the service already owns port 4310 rather than launching a duplicate Factory with `npm run dev`.

In the Console you can today:

- work through the adaptive intake questionnaire and approve a Build Contract;
- replay a durable approved-intake bundle into a fresh run;
- create a durable project from the resulting Manifest;
- ingest real source material — company URLs to crawl, or logos, photos, documents and spreadsheets uploaded from your machine — with explicit rights/governance;
- generate the project, verify that it installs, checks and builds on its own, and open a service-managed preview at desktop, tablet and mobile widths;
- capture rendered evidence from that supported preview;
- watch durable tasks, event ledger entries, cost and build history;
- add more material later and rebuild into a fresh workspace version;
- edit bound content without losing provenance;
- choose supported presentation variants and structured design controls;
- govern ingested assets and publication decisions.

Generated projects are ordinary repositories. `.app-builder/workspaces/` holds local development outputs; copy a generated repository anywhere, `npm install && npm run dev`, and it runs with no dependency on the factory runtime.

Still planned: richer click-to-edit visual manipulation, a second static/content renderer, and deployment from the Console. Until the deployment product slice lands, a finished generated repository is deployed through its own ordinary platform workflow. The ordered path from here to a finished core product is the top of `docs/ROADMAP.md`.

## Commands

```bash
npm install
npm run doctor
npm run agent:route -- "Signup does not work"
npm run agent:bench
npm run rehearse:pipeline
npm test
npm run generate:acceptance
npm run benchmark:acceptance
npm run acceptance:synthetic-mixed-source
npm run acceptance:genuine-business:validate -- /path/to/genuine-business-evidence.json
npm run acceptance:genuine-business:packet -- --project <project-id> --out /path/to/packet
npm run audit:launch -- --project /path/to/generated-workspace --json
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
apps/mcp/                        Private MCP adapter over the bounded factory surface
config/                          Module, project, routing, policy, role, pipeline, skill, source, benchmark and status registries
schemas/                         Stable intake/build/control-plane/product-quality contracts
packages/contracts/              Shared/generated contracts target
packages/factory-core/           Deterministic factory engine
packages/content-intelligence/   Deterministic source/content normalization and asset governance
packages/control-plane/          Durable task/ledger/ChangeSet/checkpoint/policy/upgrade/routing/risk/capability primitives
recipes/                         Optional capability recipes installed into generated apps
templates/                       Project-type templates
questionnaires/                  Versioned adaptive intake questions
tooling/                         create-app, validation, doctor, benchmark, upgrade-plan and control-plane tools
docs/                            Authoritative architecture/product/delivery docs
examples/                        Known-good manifests/build contracts used by tests
```
