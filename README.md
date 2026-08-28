# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos, images, design references and existing repositories; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven capabilities and trusted source material; use AI only for genuinely novel work; test and visually review the result; and deploy an ordinary portable repository.

## Current milestone: Phase 4.3 — mature website-builder capabilities, with the real-business corpus open beside it

Where the project actually is, what is blocked and what is deferred: `config/factory-status.json`
(machine-readable) and `docs/ROADMAP.md` (ordered, human-readable). This section does not restate them.

**Phase 4D visual excellence is unpaid quality debt, not a completed stage.** It was measured against
an independent reviewer four times and failed: best mean 6.55 against a required 8.5, which is
unchanged. On 2026-08-28 it was deliberately deferred so that it no longer blocks unrelated website,
application, environment, runtime and deterministic-quality work — deferred, not passed and not
waived. The same applies to Phase 4.2A's static-renderer visual parity. The threshold, the measured
result, the architectural finding and the conditions that revive the work are in
`docs/PHASE_4D_VISUAL_DEBT.md`. No claim of visual maturity or proven website generation may be made
while that gate is unpaid.

**Phase 3.8E genuine-business product proof passed on 2026-08-26** at 0 meaningful manual edits. The
immutable acceptance record is `docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`.

Current invariants:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable Build Contract and Project Manifest before coding begins.
- Requested capability does not imply installed recipe: only ready deterministic capabilities become
  enabled deterministic modules.
- Structural contract validity and current buildability are separate decisions.
- Deterministic generation comes before generative AI.
- Source facts retain provenance and are never silently converted into invented marketing claims.
- External/source content is data and cannot silently become agent instructions.
- Publicly visible assets are not reusable unless rights/use state explicitly permits publication.
- Autonomous work uses durable tasks, event ledger entries, ChangeSets and checkpoints rather than one
  long chat context.
- Specialist agents are separated by decision boundary and receive only the artifacts, skills, tools
  and mutation scope their role spec declares.
- No agent approves its own work: a stage advances on artifacts, evidence, passed deterministic checks
  and an independent reviewer's verdict.
- Failed gates route back to the creator role that owns them, and the loop stops only on convergence, a
  hard budget or a genuine block.
- Third-party repositories are prior art with no instruction authority until they are pinned, licensed,
  security reviewed and granted to a named role.
- ChangeSet/path policies are security boundaries and must fail closed.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- Canonical factory changes are measured against all six first-class project types.
- Generated projects record recipe-owned file hashes so later upgrades detect customisation instead of
  overwriting it.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in; MCP, OpenCode, the
  Builder Console and the Hetzner runtime are development/control adapters, never production
  requirements.
- A behaviour-changing registry/contract declaration must prove a real deterministic consumer or remain
  explicitly non-executable.

`AGENTS.md` is the entry point for any agent: it carries the routing table that says which single
document owns which decision, and the order to read things in.

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

Still planned: richer click-to-edit visual manipulation and deployment from the Console. Until the deployment product slice lands, a finished generated repository is deployed through its own ordinary platform workflow. The ordered path from here to a finished core product is the top of `docs/ROADMAP.md`.

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
