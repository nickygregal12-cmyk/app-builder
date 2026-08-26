# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos, images, design references and existing repositories; turn them into a reviewed Build Contract; compose real pages and application surfaces from proven capabilities and trusted source material; use AI only for genuinely novel work; test and visually review the result; and deploy an ordinary portable repository.

## Current milestone: Phase 3.8 — Product proof and correctness hardening

**Active product gate: Phase 3.8E — Genuine business product proof.**

Machine-readable truth lives in `config/factory-status.json`; this README is orientation, not a competing status source.

Phases 0–3, the control-plane foundation, deterministic composition and the core Factory service/tool boundary are implemented. The correctness/routing/evaluation work through 3.8K is substantially landed, and the Builder Console has already delivered the 4A vertical slice plus the core 4B direct-manipulation/asset capabilities needed to run real acceptance through the product.

Current 4B-era capabilities include:

- Builder Element Identity and click-to-select;
- provenance-aware text editing with durable overrides;
- RenderedEvidence at desktop/tablet/mobile;
- asset-level publication governance;
- focal-point crop/review;
- asset replacement lineage;
- real section presentation variants;
- structured Design Contract editing;
- Product Opportunity Scout;
- source confidence/provenance/rights visibility.

The Phase 3.8E gate remains deliberately real-world. A passing run must use genuine business material, real public-site ingestion through the Factory path, approved supplied material, replayable intake, the real intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview/evidence journey, genuine human product review, artifact/source hashes and fewer than 20 meaningful manual edits before launchable quality.

The original NBM intake was not persisted and is unrecoverable; a versioned replacement baseline is now the durable replay input for subsequent NBM runs. The real product review remains a human judgement and is never filled in by an agent.

Brand/source governance is explicit. Public company sites and exact public profile URLs may inform understanding, but publicly visible material is never assumed reusable: rights/use state, approval state, source role/channel and instruction authority are recorded, and only approved-for-use assets can become publishable factory assets.

The Acme mixed-source scenario and six canonical project classes remain valuable deterministic regression coverage. They are explicitly **not** evidence that a project class is mature or that real customers would launch the output.

## Current delivery discipline

A clean-room audit identified a new risk: the architecture/control plane is becoming more mature than the amount of real product evidence.

The corrective sequence is now explicit:

`finish 3.8E -> minimum 4C visual intelligence -> minimum 4D art-direction variants -> 4.2 static/content renderer -> product-proof freeze -> 10 real businesses -> rerun the corpus -> competitive bake-off -> evidence-led expansion`.

See `docs/PRODUCT_PROOF_PROGRAMME.md`.

After the minimum 4C/4D/4.2 foundation, speculative architecture pauses. Real-project failures become the priority. The first corpus is deliberately varied rather than ten brochure sites, and later grows toward 30–50 real projects.

Project classes will eventually carry evidence-based maturity such as **Proven / Supported / Assisted engineering / Experimental** rather than six labels implying equal reliability.

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
- Failed gates route back to the creator role that owns them, and the loop stops only on convergence, a hard budget, provider-capacity block or genuine external block.
- Third-party repositories are prior art with no instruction authority until they are pinned, licensed, security reviewed and granted to a named role.
- ChangeSet/path policies are security boundaries and must fail closed.
- Agent capabilities are deny-by-default and sensitive actions require approval.
- Project-class maturity comes from real evidence, not synthetic build success.
- Generated projects record managed-file/provenance information so upgrades can detect customisation rather than overwriting it.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.
- MCP, OpenCode, the Builder Console and Hetzner are development/control infrastructure, never production requirements of generated apps.

## Agent runtime status

The hosted App Builder runtime is real but broad autonomy is still deliberately disabled.

Validated on the existing Hetzner host:

- Factory service under the isolated `appbuilder` Linux identity;
- OpenCode `1.18.14` on its own loopback endpoint;
- resource isolation and rootless Podman groundwork;
- bounded OpenCode -> MCP -> Factory lane;
- OpenCode itself reports `app-builder connected`;
- real-host MCP smoke passed 44 checks / 30 operations and wrote evidence under `/srv/app-builder/artifacts/`.

This proves the supported bounded lane, not the final security boundary. Issue #55 remains the pre-agent hardening requirement: a future worker with shell/network authority must be physically unable to bypass scoped capabilities by calling the richer internal Factory HTTP surface directly.

The planned runtime also treats provider exhaustion/interruption as durable scheduler state rather than losing work. Sessions are disposable; project/task state is durable. A future provider-capacity router will use deterministic/free/cheap models first where benchmarked quality permits, premium models where they materially improve the task, independent model families for valuable second opinions, and paid overage only when explicitly authorised.

## Authorities

- machine-readable progress: `config/factory-status.json`;
- staged sequencing: `docs/ROADMAP.md`;
- detailed delivery plan: `docs/MASTER_PLAN.md`;
- product-proof freeze/maturity/corpus: `docs/PRODUCT_PROOF_PROGRAMME.md`;
- premium visual programme: `docs/VISUAL_EXCELLENCE.md`;
- design-side contracts/intelligence: `docs/DESIGN_INTELLIGENCE.md`;
- professional completeness: `docs/PRODUCTION_COMPLETENESS.md`;
- deterministic engineering gates: `docs/ENGINEERING_QUALITY_PROGRAMME.md`;
- control plane: `docs/FACTORY_CONTROL_PLANE.md`;
- specialist roles/handoffs: `docs/AGENT_SPECIALIST_ARCHITECTURE.md`, `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md`;
- agent runtime: `docs/AGENT_RUNTIME.md`;
- genuine-business gate: `docs/GENUINE_BUSINESS_ACCEPTANCE.md`;
- long-run complex-app benchmark: `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.

## Run it yourself

```bash
npm install
npm run dev
```

That starts the factory service on `127.0.0.1:4310` and the Builder Console on `127.0.0.1:5173`. Node 22.13 or newer is the only prerequisite for local deterministic build/preview work; provider/model credentials remain optional and broad autonomous execution is not enabled by default.

In the Console you can already:

- work through the adaptive intake questionnaire and approve a Build Contract;
- create/open durable projects;
- ingest real source material — company URLs to crawl, or logos, photos, documents and spreadsheets uploaded from your machine — with explicit publication/reference rights state;
- generate the project, verify that it installs/checks/builds independently, and open live responsive previews;
- watch durable tasks/events/cost/build/checkpoint history;
- click rendered content through Element Identity and make provenance-aware durable text edits;
- inspect/manage source and asset governance;
- adjust supported section presentation/design controls;
- capture/review RenderedEvidence.

Generated projects are ordinary repositories. Factory-managed workspaces hold generated builds/checkpoints, but the output itself must remain independently installable/buildable with no App Builder runtime dependency.

Still planned/not mature enough to claim:

- full BrandSpec/DesignSystemSpec/ArtDirectionPlan-driven generation (4C);
- controlled 2–4 direction comparison/promotion (4D);
- static/content renderer proof (4.2);
- production environment/deploy controls (4E);
- real autonomous specialist execution (4.5/5 gate first);
- native mobile generation.

## Commands

```bash
npm install
npm run doctor
npm run agent:route -- "Signup does not work"
npm run agent:bench
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
npm run opencode:doctor
npm run opencode:smoke
npm run agents:materialise
npm run dev
```

## Repository map

```text
apps/console/                    Private Builder Console UI
apps/service/                    Private factory service and durable read/API boundary
apps/mcp/                        Private MCP adapter over the loopback factory service
config/                          Module, project, routing, policy, role, pipeline, skill, source, benchmark and status registries
schemas/                         Stable intake/build/control-plane/product-quality contracts
packages/contracts/              Shared/generated contracts target
packages/factory-core/           Deterministic factory engine
packages/content-intelligence/   Deterministic source/content normalization and asset governance
packages/control-plane/          Durable task/ledger/ChangeSet/checkpoint/policy/upgrade/role/handoff/review/convergence primitives
recipes/                         Optional capability recipes installed into generated apps
templates/                       Generated-project template families
questionnaires/                  Versioned adaptive intake questions
tooling/                         Generation, validation, doctor, benchmark, acceptance, runtime and control-plane tools
docs/                            Authoritative architecture/product/delivery/evidence programmes
examples/                        Known-good manifests/build contracts and acceptance baselines
```

See `AGENTS.md` before making architecture changes and `docs/ROADMAP.md` for the current staged sequence.
