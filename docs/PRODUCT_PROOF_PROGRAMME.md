# Product Proof Programme

Status: **planned execution programme after the current Phase 3.8E genuine-business gate and the minimum visual-quality foundation needed to make the proof meaningful**.

This document turns the August 2026 clean-room audit into an execution discipline. It does not create a parallel roadmap. `docs/ROADMAP.md` remains the sequencing authority and `config/factory-status.json` remains the machine-readable progress authority.

## Why this programme exists

App Builder now has a stronger architecture, control plane and evidence model than most prompt-to-code builders. That is a strength, but it creates a new risk: **architecture gravity**. It becomes easier to add another contract, registry, role or future capability than to prove that real businesses actually like what the factory produces.

The correction is not to discard the architecture. It is to stop extending it speculatively once the minimum visual/output foundation is in place, then force the existing machinery through a deliberately varied corpus of real projects.

The programme therefore follows this order:

1. finish Phase 3.8E honestly;
2. complete the minimum Phase 4C visual-intelligence layer;
3. complete the minimum Phase 4D controlled-art-direction layer;
4. prove the Phase 4.2 static/content renderer abstraction;
5. enter a deliberate **product-proof freeze**;
6. run at least ten deliberately different real businesses through the factory;
7. fix only reusable defects the corpus exposes;
8. rerun the same projects from frozen/replayable inputs;
9. run a blind competitive bake-off once App Builder has a stable internal baseline;
10. let evidence, not roadmap enthusiasm, decide what architecture comes next.

This sequence deliberately keeps the audit's product-proof recommendation while avoiding a premature test of a renderer/presentation system that is already known to be too visually narrow.

---

## 1. Minimum foundation before the product-proof freeze

The freeze begins only after the following are genuinely usable, not merely declared.

### Phase 3.8E — genuine-business proof

Required:
- real public business source ingestion through the Factory path;
- replayable approved intake;
- source hashes/provenance;
- full generate/verify/preview/rendered-evidence journey;
- genuine human product review;
- meaningful manual edits counted;
- launch-readiness prediction compared with actual edits.

The human review is never manufactured by an agent.

### Minimum Phase 4C

Required before the ten-business corpus:
- `BrandSpec` grounded in supplied/observed evidence;
- `DesignSystemSpec` that compiles into actual generated output;
- `ArtDirectionPlan` above SectionSpec;
- `MotionContract`;
- Presentation Registry / Component Manifest retrieval;
- deterministic DesignLint;
- proof that unrelated businesses can receive materially different design systems and composition intent.

### Minimum Phase 4D

Required:
- 2–4 genuinely different candidate art directions from the same product/content truth;
- responsive comparison;
- explicit promote/reject into durable design state;
- at least one appropriate distinctive visual moment for premium marketing work;
- no fake independence: a visual critic is independent only when it actually runs on a different eligible model/runtime.

### Minimum Phase 4.2

Required:
- a genuinely different static/content-oriented renderer, evaluating Astro first;
- marketing/content output no longer proves renderer-neutrality using only the application-oriented React/Vite template;
- deterministic SEO/meta/structured-data output where source truth supports it;
- deterministic asset suitability checks.

After these minimums are in place, architectural expansion pauses unless a production/security blocker requires it.

---

## 2. Product-proof freeze

During the freeze, do **not** add a new major architecture concept because it sounds useful.

Allowed work:
- fix a reusable defect exposed by a corpus project;
- add a deterministic check for a real observed failure;
- improve a contract because real output proved it insufficient;
- improve a renderer/recipe/presentation component because the corpus exposed a repeatable weakness;
- repair security, data-loss, durability or runtime blockers;
- reduce cost, latency or intervention where measured evidence shows the bottleneck.

Normally disallowed during the freeze:
- new orchestration framework;
- speculative agent role proliferation;
- new project class without corpus evidence;
- provider integrations with no live use case;
- large framework rewrites;
- native mobile merely because the product is called App Builder;
- agent-interface generation merely because MCP is fashionable;
- plugin marketplaces;
- vector databases or graph systems without a measured navigation problem;
- broad refactors based only on file size.

The purpose is to make failure data drive the factory.

---

## 3. Ten-business real-world corpus

The first corpus is deliberately adversarial, not ten variations of the same brochure site.

Suggested classes:

1. **local trade / project photography / quote conversion** — MGB Decor is the first planned example;
2. **professional consultancy / restrained credibility / project evidence** — NBM is the first example;
3. **restaurant / hospitality conversion** — imagery, menu, location, booking/contact;
4. **trust-heavy professional or regulated-adjacent service** — factual restraint, services, conversion;
5. **hotel/hospitality** — high imagery, rooms/amenities, local content;
6. **text-heavy professional services** — authority, SEO, information hierarchy;
7. **charity/community organisation** — trust, donations/contact, content depth;
8. **catalogue/ecommerce-adjacent brand** — collections, product-style content, imagery consistency;
9. **editorial/content organisation** — larger information architecture and content retrieval;
10. **unusual premium brand** — deliberately challenges the default section rhythm, typography and hero patterns.

Freeze the approved inputs for each accepted benchmark project so later factory versions can be rerun against the same truth.

A separate complex-app corpus follows later. Website success must not silently graduate complex SaaS/consumer/AI applications to the same maturity level.

---

## 4. What every corpus project measures

Track at least:
- first-build success;
- launchable on first output: yes/no;
- predicted meaningful edits;
- actual meaningful edits;
- edit categories;
- unsupported/incorrect claims;
- missing source-backed content;
- imagery gaps and bad image choices;
- poor crops/focal points;
- generic or repetitive sections;
- weak visual hierarchy;
- mobile composition failures;
- broken or incomplete journeys;
- accessibility failures;
- performance/SEO/security results where applicable;
- build duration;
- AI/model/tool cost;
- retries;
- human interventions;
- accepted/rejected art directions;
- owner/stakeholder reaction;
- whether the weakness is project-specific or reusable factory debt.

The mature mainstream-site target remains a median of <=5 meaningful manual edits, but the corpus is evidence first: do not hide a worse real number to protect a target.

---

## 5. Capability maturity tiers

Project labels must not imply equal maturity.

Introduce a machine-readable maturity model for project classes/capability families.

### Proven

A material real-project corpus shows the class normally works exceptionally well with low intervention and strong quality evidence.

### Supported

The factory has known architecture/recipes/renderer support and representative acceptance evidence, but the corpus is not yet strong enough for a "normally excellent" claim.

### Assisted engineering

The factory can architect and implement the class, but substantial specialist-agent work and/or human judgement is expected.

### Experimental

Novel or insufficiently proven. Explicit approval/custom engineering required.

Maturity affects:
- expected autonomy;
- model/tool budget;
- required review depth;
- launch gates;
- confidence shown in the Console;
- whether one-prompt claims are permitted.

Maturity advances only on evidence and may regress when benchmarks expose deterioration.

Initial status should be conservative. Do not mark a class Proven merely because a synthetic canonical app builds.

---

## 6. Anti-template diversity diagnostic

Determinism must not produce fifty polished versions of the same site.

Add a corpus-level diagnostic that compares unrelated builds using signals such as:
- section-family sequence;
- hero treatment;
- layout family;
- information density;
- typography combinations;
- CTA structure;
- component-family sequence;
- motion language;
- repeated visual motif;
- visual/structural embedding similarity where justified.

Flag suspicious similarity between unrelated businesses.

This begins as a diagnostic, not a hard CI gate. Baseline real output before setting thresholds.

Use the finding to retire repeatedly generic patterns, not to add uncontrolled randomness.

---

## 7. Competitive bake-off

After the internal ten-project corpus is stable enough to be meaningful, periodically compare the same brief/source pack against relevant current builders.

Candidates may include v0, Lovable, Replit, Framer AI and Webflow AI where the project class fits.

Blind the reviewer where practical.

Score:
- first output quality;
- factual accuracy;
- visual quality/distinctiveness;
- mobile quality;
- functionality/journey completion;
- accessibility;
- performance;
- manual edits;
- elapsed time;
- cost;
- output portability;
- provenance/rights discipline where competitors expose comparable evidence.

The benchmark exists to test claims, not to chase every competitor feature.

---

## 8. Runtime efficiency, concurrency and interruption recovery

Before broad Phase 5 autonomy, provider exhaustion or a dead browser must be a scheduling event, not a lost job.

Required runtime invariants:
- browser/session is never the owner of a task;
- project/task/attempt state is durable;
- model sessions are disposable;
- interrupted attempts checkpoint enough state for a clean replacement session;
- provider capacity exhaustion becomes `waiting-for-capacity` or an equivalent durable state;
- an approved fallback provider/model may continue only when it clears the task's quality/capability threshold;
- otherwise the task waits for capacity and resumes later;
- paid API spend remains separately budgeted and can be hard-disabled.

### Provider Capacity / Entitlement Broker

Phase 5 should represent, per provider/runtime:
- authentication/entitlement type: subscription, free, included credit, API, local;
- current availability;
- quota/capacity signal where observable;
- known reset where available;
- cash cost;
- quota scarcity/shadow cost;
- task-class benchmark quality;
- context/tool capabilities;
- independence family;
- fallback eligibility.

Routing target:

`deterministic -> proven free/cheap model -> premium model when needed -> independent reviewer where valuable -> paid overage only when authorised`.

Model choice is by task class and evidence, not by permanently assigning one vendor to one role.

### Worker execution

Synchronous long-running build/verify operations are acceptable for today's single-operator phase but are not the desired Phase 5 concurrency model.

Move toward:

`Factory API -> durable job scheduler -> ExecutionEnvironmentAdapter -> isolated worker -> durable progress/events/result`.

Do not adopt Temporal/LangGraph merely to achieve this; a small durable worker/process layer is enough until measured complexity says otherwise.

---

## 9. Ledger/projection durability

If JSONL remains authoritative and SQLite remains a read projection, make that recoverable by design.

Required direction:
- monotonic ledger sequence;
- idempotent projection;
- startup reconciliation/catch-up;
- rebuild command such as `npm run ledger:rebuild`;
- proof that deleting/recreating the projection does not lose authoritative project history.

A crash between ledger append and projection write must not permanently create two truths.

If a future architecture chooses SQLite as authority instead, make that an explicit ADR/migration rather than accidental drift.

---

## 10. Git-native generated-project history

Long-term generated project evolution should use ordinary Git semantics as well as Factory process history.

Desired model:

`main -> factory/task-<id> -> bounded changes -> tests -> review -> checkpoint -> promote/merge`.

Git records **what changed**.
The Factory ledger/checkpoints record **why, under which task/policy/evidence/model/budget it changed**.

Do not replace Factory durability with Git, and do not keep generated work trapped in opaque workspace-version folders once the task/branch model is ready.

---

## 11. Production data-change safety

Before autonomous production SaaS/database mutation, introduce a first-class data-change safety contract.

Every material migration/data mutation should establish:
- additive vs destructive vs backfill/contract step;
- old-code/new-schema compatibility;
- new-code/old-schema compatibility where relevant;
- row-impact estimate;
- backfill plan;
- backup requirement and evidence;
- restore test/evidence;
- app rollback;
- schema/data rollback or forward-repair strategy;
- partial-deployment behaviour;
- environment identity;
- approval requirement.

Prefer expand -> migrate/backfill -> verify -> contract for high-risk changes rather than one destructive migration.

Place this before the factory is allowed to autonomously mutate real production application data.

---

## 12. First-class integrations

Phase 4E / later serious-app work should promote integrations from a loose module to a first-class contract.

A future `IntegrationSpec` should cover, where applicable:
- provider;
- capabilities;
- authentication type;
- OAuth scopes;
- webhook events and verification;
- sandbox/production credential identities without exposing secret values;
- rate limits;
- retry policy;
- idempotency policy;
- data classes accessed;
- secret requirements;
- health check;
- test fixture;
- environment availability.

Build a small proven adapter set before a broad catalogue. Do not create a plugin marketplace first.

Provider-neutrality is proved by real second implementations, not by interface names alone.

Longer-term proof targets include:
- a second renderer (the Phase 4.2 static renderer is first);
- a genuinely different backend implementation;
- a second deployment target or generic deploy path.

Do this to validate the contracts, not to offer customers twelve interchangeable options.

---

## 13. Upload transport maturity

Current base64/browser-state uploads are acceptable for present small-source proof but not for large packs.

When real projects require it, move to:

`request upload -> stream/chunk -> hash while receiving -> MIME/signature validation -> size/resource policy -> content-addressed storage -> ingestion task`.

Support resumability only when measured file sizes/interruptions justify it.

Do not route 80 MB PDFs, video or hundreds of photographs through React state/base64 as the mature design.

---

## 14. Stakeholder review portal

A later commercial/product capability should exploit `ElementIdentity` for lightweight external review without exposing repository/internal Factory state.

Potential flow:

`share preview -> stakeholder clicks element -> comment/change request -> ElementIdentity target -> proposed ChangeSet -> owner approval`.

Useful actions may include:
- pinned comments;
- approve/reject page or section;
- request wording change;
- choose/use replacement asset;
- answer missing fact;
- sign-off.

This is valuable for real commercial website delivery but is not a prerequisite for the initial ten-project proof.

---

## 15. Later project breadth

### Generated-app agent interface

A future `agent-interface` capability may let generated applications expose their own MCP/agent actions. This is distinct from App Builder's MCP adapter.

Do not prioritise it before core web/app proof, auth/capability policy and integration maturity.

### Native mobile

If App Builder later claims native application generation, introduce a separate native-mobile project class (likely Expo/React Native initially) with contracts for permissions, notifications, camera/location, deep links, offline state, secure storage, signing, store metadata and device testing.

Do not treat today's `consumer-app` web class as native-mobile support.

---

## 16. Refactoring policy

`FactoryService` and `BuilderWorkspace` are accumulating responsibilities, but do not create a standalone refactor programme based on file size.

Refactor by **product capability when real divergence appears**.

Examples:
- runtime/security growth may justify a RuntimeCapability/Dispatch service;
- large-source work may justify a Source/Upload service;
- worker concurrency may justify an Execution service;
- evidence/review growth may justify an Evidence service.

`FactoryService` may eventually become a thin façade, but only as capability boundaries become real.

---

## 17. Documentation/state discipline

`config/factory-status.json` remains the machine-readable progress authority.

Reduce manual status duplication over time.

Direction:
- generate README current stage/completed stages/blockers/next stage from status + registries;
- generate module/role maturity tables where possible;
- humans maintain the rationale and decisions;
- machines maintain factual state.

Rule: **humans write why; machines write what state things are in.**

Commercial/venture planning should not become default engineering context. Keep it under an unmistakably routed area such as `docs/ventures/` / `docs/future-products/`, or a separate repository if it grows enough. Normal factory-engineering routes must not load it unless the task is explicitly commercial/venture work.

---

## 18. Priority order after the current gate

This is the preferred order unless `config/factory-status.json` or a proven blocker says otherwise:

1. finish NBM / Phase 3.8E honestly;
2. minimum Phase 4C visual intelligence;
3. minimum Phase 4D controlled art-direction variants;
4. Phase 4.2 static/content renderer MVP;
5. **product-proof freeze + ten real businesses**;
6. project-class maturity tiers;
7. anti-template/diversity diagnostic;
8. continue/complete Phase 4.5 agent hardening (#55 and related runtime enforcement) as required before any real autonomous workers;
9. durable worker execution + interruption/provider-capacity recovery before broad multi-agent concurrency;
10. ledger projection rebuild/reconciliation;
11. Git-native task branches/checkpoints;
12. data-change safety before live SaaS/database autonomy;
13. IntegrationSpec + small proven integration adapter set;
14. competitive blind bake-off;
15. stakeholder review portal;
16. streamed/resumable upload transport when real source sizes justify it;
17. capability-driven service refactors when real boundaries emerge;
18. generated-app agent interface later;
19. native mobile much later.

Security/data-loss blockers can always interrupt this sequence. Speculative architecture cannot.

---

## 19. Success condition

The programme succeeds when the claim changes from:

> App Builder has an unusually thoughtful architecture.

into something backed by repeated evidence:

> App Builder consistently turns very different real inputs into products people would actually launch, with low manual intervention, honest factual provenance, strong mobile/visual quality, durable recovery and portable code.

The long-run 30–50-project corpus in Phase 8 remains the Gold Standard. The ten-project freeze is the first serious checkpoint that decides whether the architecture has earned further expansion.
