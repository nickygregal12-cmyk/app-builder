# Capability Source Synthesis

Status: **supporting curation plan**. This document does not sequence delivery, create a new design
or engineering authority, or make any third-party repository loadable. `AGENTS.md` remains the root
engineering authority, `docs/ROADMAP.md` owns sequence, `docs/BEST_IN_CLASS_CAPABILITIES.md` owns the
capability register, `docs/DESIGN_INTELLIGENCE.md` owns the design-side specification,
`docs/ENGINEERING_QUALITY_PROGRAMME.md` owns deterministic quality gates and
`config/external-sources.json` remains the machine-readable record of third-party sources actually
reviewed by the repository.

The purpose of this document is narrower: **how App Builder should study many strong upstream
repositories without turning them into many competing skills, authorities, runtimes or generated-app
dependencies.**

## 1. Current assessment

The repository is already much further along than a blank external-skill programme.
`config/external-sources.json` currently records 35 reviewed sources. The strongest areas are already
well covered:

- planning and agent execution: `github/spec-kit`, `addyosmani/agent-skills`, `obra/superpowers`;
- product research and information architecture: `hamelsmu/design-research`,
  `alirezarezvani/claude-skills`, `TerminalSkills/skills`, `rampstackco/claude-skills`;
- UX/content/marketing: `magnus919/agent-skills`, `content-designer/ux-writing-skill`,
  `coreyhaines31/marketingskills`;
- design and visual review: `humbleteam/design-review`, `nextlevelbuilder/ui-ux-pro-max-skill`,
  `leonxlnx/taste-skill`, `pbakaus/impeccable`, `vercel-labs/agent-skills`;
- reference and direct-manipulation prior art: screenshot analysis, React Grab, Weblab and Onlook;
- design-system/component discovery: Storybook MCP, 21st registry, Style Dictionary and related
  design-contract prior art;
- browser/quality tooling: Playwright MCP, Chrome DevTools MCP, accessibility review and Lighthouse CI.

Several ideas those sources originally motivated are no longer only plans. App Builder now has its own
routing benchmarks, no-self-approval rule, typed rework, convergence, Element Identity,
DesignSystemSpec compiler, BrandSpec, ArtDirectionPlan, MotionContract, Presentation Registry,
DesignLint, RenderedEvidence and a real static/content renderer. Upstream material that helped shape
those capabilities should therefore remain **provenance/prior art**, not be promoted into a second
runtime simply because the original repository still exists.

The current source estate is comparatively weak in four areas:

1. reusable accessible interaction/component behaviour beyond App Builder's own presentation layer;
2. a governed source of high-quality external presentation implementations for a real
   `customPresentation` gap;
3. provider-neutral application/backend patterns beyond the current Supabase-first implementation;
4. security methodology deep enough to author the future App Builder-native security skill without
   loading a pile of scanner documentation into the reviewer.

Those are the useful gaps. The repository does **not** need another broad general-agent skill pack,
another master design document or another orchestration framework.

## 2. The target is not 40 installed repositories

Directionally maintain a **reviewed upstream corpus of roughly 35-45 active sources**. Treat that as a
soft maintenance budget, not a collection target. A source beyond that range should normally replace,
supersede or materially extend an existing one rather than merely join it.

Within any one discipline, prefer roughly **4-6 complementary sources maximum**. More sources are
allowed only when they answer demonstrably different questions.

The external corpus should compile into a much smaller App Builder-native system:

```text
35-45 reviewed upstream sources
        |
        v
10 synthesis families
        |
        v
small role-specific App Builder skills / deterministic catalogues / adapters
        |
        v
bounded role context packets
```

An agent never receives the whole upstream corpus. It receives the smallest App Builder-native skill or
retrieval result its role needs.

## 3. Four kinds of upstream source

Do not treat every GitHub repository as the same thing.

### A. Method / craft source

Examples: Spec Kit, Superpowers, UX-writing methodology, OWASP guidance.

Use it to author an App Builder-native skill or deterministic rule. The source itself normally remains
`reference-only` and is not loaded at runtime.

### B. Pattern / reference corpus

Examples: UI/UX Pro Max, GOV.UK design patterns, design-review heuristics.

Use it to create small structured records or review criteria that App Builder can retrieve
deterministically. Do not copy a source's `MASTER.md`, design authority or workflow engine.

### C. Presentation/component supply

Examples: App Builder's own Presentation Registry first, then a shadcn-compatible/21st-style source when
an actual bespoke presentation is missing.

This is the only class where source code may eventually be imported into a generated project. It must be
copied into ordinary project ownership, dependency/licence/security reviewed, normalised to
DesignSystemSpec/ElementIdentity/accessibility/motion contracts, and independently rendered/reviewed.
The external registry is never a generated-app runtime dependency.

### D. Tool / implementation candidate

Examples: Lighthouse CI, Knip, Semgrep, a mutation-testing tool, a queue/job library.

These are benchmarked because they may perform work, not loaded as agent knowledge. Their repository
should not become a `SKILL.md` merely because it has useful documentation.

This distinction prevents `config/external-sources.json` becoming a second dependency inventory.
Package manifests, recipe/adapters and the engineering-quality programme remain the homes for real
implementation dependencies.

## 4. Ten App Builder-native synthesis families

These are **curation families**, not ten new universal mega-skills. Each family may produce several
small role-specific skills or deterministic datasets. Existing role boundaries remain authoritative.

| Family | Primary role consumers | What the native result should know/do |
| --- | --- | --- |
| Product Definition & Planning | product-discovery, product-specification, solution-architect | turn evidence into bounded decisions, plans, acceptance and drift-aware handoffs |
| Research & Information Architecture | research-agent, information-architect | research method, confidence, mental models, taxonomy, journeys and structure |
| UX Interaction & Content | ux-interaction, ux-writer, accessibility | flows, state/recovery, forms, labels, errors, confirmations and accessible interaction behaviour |
| Design Intelligence | brand-research, art-direction, design-critic | retrieve relevant visual patterns, palettes/type relationships, anti-patterns and category-sensitive art-direction evidence |
| Presentation Foundry | design-system, frontend-implementation, visual-critic | search internal presentations first, fulfil genuine bespoke gaps, normalise imported/custom UI, prove it visually |
| Application Architecture & Data | solution-architect, backend-implementation, security | auth/tenancy/data/API/domain boundaries and provider-neutral implementation decisions |
| Integrations & Background Work | solution-architect, backend-implementation, environment-guardian | OAuth/connections, webhooks, idempotency, jobs/queues, retries, billing and environment-aware integrations |
| Verification & Code Health | test-engineer, browser-qa, runtime-debug, code-reviewer, simplification | deterministic tests, property/mutation strategy, browser proof, performance, dead code and maintainability |
| Security Engineering | security, differential-reviewer, red-team | threat-oriented review, auth/input/secrets/SSRF/supply-chain guidance and evidence-backed remediation |
| Operations & Release | environment-guardian, ship-release, compound-learning | explicit environments, observability, deployment/rollback, incident evidence and reusable closeout |

A synthesis family is successful when its upstream sources could disappear tomorrow and App Builder would
retain the useful behaviour in its own smaller contracts, rules, tests or evaluated skills.

## 5. What from the proposed wider source set is already covered

Do **not** add these again as separate operating systems:

- `github/spec-kit`, `obra/superpowers`, `addyosmani/agent-skills`: already registered and already
  reflected in routing, handoffs, review and convergence;
- `rampstackco/claude-skills`, `magnus919/agent-skills`, `content-designer/ux-writing-skill`,
  `coreyhaines31/marketingskills`: already cover the planned IA/UX/content/marketing lanes;
- `nextlevelbuilder/ui-ux-pro-max-skill`, `pbakaus/impeccable`, `humbleteam/design-review`: already
  registered for design intelligence, deterministic design-failure rules and visual critique;
- 21st registry prior art is already recorded; what is missing is a **real Presentation Foundry
  consumer**, not another registry architecture document;
- Playwright/axe/fast-check are already actual deterministic factory tooling. Do not register their
  repositories again merely to create a skill copy of tools the factory already executes;
- Lighthouse is already a candidate in the quality programme;
- Storybook has already been evaluated and deliberately not adopted;
- the visual comparison canvas has already been proven unnecessary for the current task, so canvas
  libraries are not active design priorities.

Likewise, do not add `anthropics/skills`, `mattpocock/skills` or another broad general-purpose skill
collection merely to increase coverage. Revisit only when one contains a method not already expressed by
an App Builder role, skill lifecycle or deterministic rule.

## 6. High-value missing sources to evaluate

These are the sources from the broader proposal that add a materially different lens. They should be
registered/evaluated only when the named consumer is being implemented; registration is still not
adoption.

### 6.1 `shadcn/improve` — planning economics and backlog reconciliation — 9.3/10

Useful ideas to extract:

- spend the highest-capability model on diagnosis/specification and let cheaper agents execute;
- stamp a plan against the repository revision it analysed;
- self-contained executor plans with explicit verification and stop conditions;
- reconcile completed, blocked and drifted plans rather than accumulating stale agent backlog.

Do not adopt its `plans/` hierarchy as a second App Builder task system. Durable tasks, issues,
ChangeSets, checkpoints and handoffs already own execution state. The useful adaptation is better task
specification and drift/reconciliation behaviour inside those existing primitives.

Named consumer: Phase 5 product/architecture specialist planning and `compound-learning` closeout.

### 6.2 `alphagov/govuk-design-system` — evidence-heavy interaction/service UX — 9.7/10

Use as reference material for:

- form and validation behaviour;
- clear labels/hints/errors;
- service journeys and task completion;
- accessibility and progressive enhancement;
- avoiding visually impressive interaction that makes the actual task harder.

Do not import GOV.UK's visual identity into unrelated projects.

Named consumers: `ux-interaction`, `ux-writer`, `accessibility`, the UX Interaction & Content family.

### 6.3 `shadcn-ui/ui` — component registry and open-code supply — 9.8/10

The architectural value is not "make every project look like shadcn". Use it for:

- open-code registry conventions;
- component metadata/dependency handling;
- source ownership rather than a proprietary black-box runtime;
- composing primitives into project-owned UI.

Named consumer: Presentation Foundry and the controlled bespoke-presentation lane.

### 6.4 one accessible headless primitive source — start with `mui/base-ui` — 9.4/10

Use one strong headless primitive system to inform hard interaction details such as focus management,
keyboard behaviour, overlays, menus, selects and dialogs when App Builder authors or adapts a bespoke
presentation.

Do **not** add Base UI and Radix as two default generated dependencies. Evaluate one reference first;
add a second only if a concrete component family exposes a gap.

Named consumers: Presentation Foundry, `frontend-implementation`, `accessibility`.

### 6.5 `motiondivision/motion` — advanced motion implementation — 9/10 conditional

MotionContract already decides **what movement is appropriate**. This source is only an implementation
candidate for behaviour CSS/native browser APIs cannot express cleanly.

Escalation order:

```text
CSS / native browser behaviour
  -> Web Animations / View Transitions where appropriate
     -> Motion only when the interaction earns its runtime cost
```

Never make it a default generated-project dependency.

Named consumer: a real bespoke presentation whose MotionContract cannot be fulfilled well with the
lower-cost path.

### 6.6 `better-auth/better-auth` — second auth architecture lens — 9.5/10

The factory currently has a strong Supabase path. A second serious auth implementation is useful not to
replace it, but to prove that future Auth/Identity contracts describe authentication rather than
"Supabase Auth" accidentally.

Study framework-neutral auth, sessions, organisations, passkeys/2FA/SSO/plugin boundaries and how agentic
code can still keep auth in the generated repository.

Named consumer: Phase 4.4 application capability maturity / future second implementation of auth.

### 6.7 `triggerdotdev/trigger.dev` — generated-app durable work patterns — 9.4/10

Use as prior art for generated applications that need jobs, schedules, retries, idempotency, long-running
work and observability.

Hard boundary: this may inform the generated-app `jobs` capability; it must **not** replace App Builder's
own control plane, scheduler or AgentRuntimeAdapter.

Named consumer: Phase 4.4 `jobs`/cron/queue capability.

### 6.8 `OWASP/CheatSheetSeries` — application-security knowledge — 10/10

This is the strongest missing general security-knowledge source for the future App Builder-native
security skill. Distil only the cheat sheets relevant to the task/risk classification: auth,
authorisation, input handling, XSS/CSRF, SSRF, file upload, secrets, logging, API security and related
surfaces.

Do not load the entire corpus into every security review. `RiskClassification` chooses the relevant
subset.

Named consumers: `security`, `red-team`, `differential-reviewer`.

### 6.9 `trailofbits/skills` — adversarial security-review methodology — 9.8/10

Use for the *method* of high-quality security investigation and review, complementing OWASP's developer
reference material.

Keep external tool execution behind the existing capability/policy system; never let a security skill
expand its own permissions.

Named consumers: `security`, `differential-reviewer`, `red-team`, Phase 5.5 evaluation.

## 7. Tools that should stay tools, not become source packs

The wider proposal also contained strong repositories that belong elsewhere.

- Supabase is already an implemented adapter/recipe ecosystem; treat its contracts/tests as product code,
  not another external skill source.
- Stripe should enter through the future billing/IntegrationSpec implementation and official provider
  contract, not as a generic agent skill.
- OpenTelemetry belongs in the runtime/observability implementation decision.
- Semgrep, Trivy, OSV Scanner and secret-scanning candidates belong in
  `docs/ENGINEERING_QUALITY_PROGRAMME.md` Stage Q9 and must be benchmarked against the exposure they
  close.
- Stryker or another mutation-testing implementation belongs in Stage Q8 if it earns the job.
- Knip remains a Stage Q6 candidate and must stay advisory until baselined.
- BullMQ is a possible lower-level jobs implementation only if the Phase 4.4 job requirements need a
  queue that the selected architecture does not already provide. Do not adopt both Trigger.dev and a
  queue stack by default.

This is intentional anti-bloat: good repositories do not all need to become registered knowledge
sources.

## 8. Presentation Foundry: the important design addition

The current Presentation Registry is deliberately compiled from components the templates actually
render. That remains the first choice.

When a visual review creates an existing `customPresentation` requirement, use this future path:

```text
customPresentation requirement
  -> search App Builder Presentation Registry
     -> adequate internal entry? use it
     -> no adequate entry
        -> bounded external PresentationSource search
           -> inspect 3-5 candidates maximum
              -> licence + dependency + security check
                 -> copy selected implementation into project ownership
                    -> replace hard-coded design with DesignSystemSpec tokens
                    -> replace demo content with SectionSpec/content bindings
                    -> attach ElementIdentity/editable properties
                    -> normalise accessibility/keyboard/focus behaviour
                    -> apply ResponsiveCompositionPlan + MotionContract
                    -> strip unnecessary dependencies
                    -> DesignLint + axe + browser evidence
                    -> independent visual review
                       -> project-local custom presentation
```

A public source is never the visual authority. The external component may suggest **how** to implement a
moment; BrandSpec/ArtDirectionPlan/DesignSystemSpec decide what the project should be.

Promotion into the private Presentation Registry is evidence-driven only after repeated successful use,
accessibility/tests, versioning and independent review. This lets App Builder gradually build a better
private component system than any one source repository without downloading a giant catalogue.

## 9. Design Intelligence synthesis

UI/UX Pro Max should continue to be used in the way the repository already chose: as prior art for a
small deterministic design-knowledge catalogue, not as a giant prompt loaded into every design role.

When the existing 4C.6 reviving condition is finally met, build only the queries a real consumer needs.
Candidate upstream knowledge may contribute structured records for:

- project/industry classification;
- information-density/layout families;
- typography relationships;
- palette relationships;
- proof/trust strategies;
- CTA treatments;
- responsive composition patterns;
- motion suitability;
- anti-patterns.

The output is retrieved evidence for ArtDirectionPlan/BrandSpec. It never becomes a second design
authority.

## 10. Image generation is a provider benchmark, not a GitHub-source problem

Do not solve image quality by adding an image-generation "repo skill".

Phase 5 should retain the provider-neutral `ImagePlan` direction and benchmark current image providers by
task class. The factory should select/optimise approved real assets first, then use generated or edited
imagery only where the plan permits it. Provider choice is measured by accepted-result rate, brand and
reference consistency, editing fidelity, text rendering, responsive suitability, latency and cost.

Generated apps must never depend on the image provider used by the factory.

## 11. Source admission and retirement rules

A new source enters the reviewed corpus only when all are true:

1. a named App Builder role, deterministic catalogue, adapter or quality gate has a real question it
   cannot answer well enough today;
2. the source contributes a meaningfully different method/data/code supply rather than another wording of
   existing guidance;
3. the useful parts and `doNotAdopt` boundary can be stated before runtime access is granted;
4. the source fits the context/dependency/portability budget;
5. success can be measured against the current App Builder baseline.

A source is retired/superseded when:

- the native capability now fully expresses the useful behaviour;
- another source demonstrably covers the same purpose better;
- maintenance/licensing/security quality declines;
- it repeatedly causes noisy routing or context without measurable benefit;
- the consumer that justified it no longer exists.

Reference-only historical provenance may remain in the registry even after active evaluation ends.

## 12. Skill authoring rule

Phase 5 should not materialise one `SKILL.md` per upstream repository.

Author an App Builder skill from the role's decision boundary:

```text
role purpose
  + repository authorities
  + accepted deterministic contracts
  + distilled evidence from complementary sources
  + explicit anti-patterns
  + allowed tools/capabilities
  + stop/review criteria
  -> App Builder-native SKILL.md
```

A role normally receives one domain skill and at most the complementary load classes already permitted by
`config/skill-registry.json`. Upstream repos are citations/provenance for how the skill was built, not a
stack of live prompts concatenated at execution time.

Promotion remains the existing lifecycle:

`planned -> experimental -> candidate -> evaluated -> proven`

with baseline-vs-candidate evaluation, positive and negative routing cases, token/runtime/cost evidence and
regression checks.

## 13. Roadmap integration

This programme does **not** interrupt the active 4D / 4.2A independent visual-review gates.

Use it when the existing roadmap reaches the relevant consumer:

- **Phase 4D professional-output closure:** Presentation Foundry may evaluate shadcn/21st/headless
  primitives/Motion only when a real `customPresentation` must be fulfilled;
- **product-proof freeze:** use real failures to decide which patterns become native rather than expanding
  the source corpus speculatively;
- **Phase 4.4:** evaluate Better Auth and Trigger.dev-style prior art when auth portability/jobs become
  real capability work;
- **Phase 4.5/6:** benchmark security/code-quality tools against measured exposures;
- **Phase 5:** author the role-specific native skills from the synthesis families;
- **Phase 5.5:** compare each candidate skill/source/tool against the same frozen tasks and context before
  promotion.

The desired end state is not a factory with the most repositories attached. It is a factory whose own
small skills, registries, contracts and deterministic checks have absorbed the best proven ideas while
remaining coherent, portable and cheap to operate.
