# Specialist Agent Architecture

Status: **foundation landed (Phase 3.8H), execution planned for Phase 5**.

This document explains the specialist-agent organisation whose machine-readable form lives in
`config/agent-roles.json`, `config/agent-pipelines.json`, `config/skill-registry.json`,
`config/external-sources.json`, `config/agent-routing.json` and
`config/agent-routing-benchmarks.json`, and whose deterministic primitives live in
`packages/control-plane/src/roles.js` and `packages/control-plane/src/routing.js`.

It is a detail document under the existing authorities. `AGENTS.md` remains the root engineering
authority, `docs/MASTER_PLAN.md` remains the delivery authority, `docs/FACTORY_CONTROL_PLANE.md`
remains the control-plane programme and `docs/AGENT_RUNTIME.md` remains the runtime architecture.
Nothing here creates a new product, design or orchestration authority.

## Why roles are split by decision boundary

The factory does not need agents named after programming languages. It needs agents that own
different **decisions**, because that is what makes review meaningful. An agent that owns
information architecture and also owns typography can quietly trade one against the other with no
record. Two roles with one artifact between them cannot.

Each role therefore declares, in `config/agent-roles.json`:

- `kind` — `creator` or `reviewer`;
- `purpose` — the decision it owns;
- `reads` — the artifact kinds it may receive, and nothing else;
- `writes` — the artifact kinds it may author;
- `mayNot` — the boundaries it must not cross;
- `skills` — a small packet from `config/skill-registry.json`, never the whole library;
- `policyId` — a deny-by-default capability policy from `config/agent-policies.json`;
- `routeId` and `contextCeilingTokens` — bounded context from `config/agent-routing.json`;
- `mutationScopes` — the ChangeSet scope rules it may declare, empty for every reviewer;
- `budget` — hard iteration, runtime, cost and token limits;
- `reviewedBy` — the independent reviewer(s) permitted to promote its work;
- `stopCriteria` and `escalatesTo` — when to stop and who to hand to;
- `priorArt` — external sources that informed the role's design.

`priorArt` is not permission. A role may only *load* content from an external source when that
source lists the role in its `allowedRoles`, which requires the source to be adopted and pinned.

## The three hard rules

### 1. No self-approval

An agent that creates or materially changes an artifact cannot issue the final promotion verdict for
that artifact. Creators may run local sanity checks; promotion is always independent.

This is deterministic, not advisory:

- `assertReviewIndependence` and `createReviewVerdict` in `packages/control-plane/src/roles.js`
  reject a verdict whose reviewer appears in `authorRoles`;
- `evaluateHandoff` blocks a stage whose verdict came from the wrong reviewer or from the author;
- `tooling/control-plane-doctor.mjs` fails the build if any pipeline stage lets a creator role
  review itself, or if a creator role declares no reviewer;
- reviewer roles own no `mutationScopes`, so a critic cannot silently fix what it just criticised.

### 2. Bounded context per role

`buildRoleContextPacket` hands a role only the artifact kinds its role spec declares and reports the
kinds it withheld. The information architect receives the approved ResearchPack and ProductSpec; it
does not receive the ChangeSet. The security reviewer receives the architecture, manifest, capability
list and security-relevant diff; it does not receive brand moodboards.

### 3. Machine-readable handoffs, not conversations

Roles exchange durable artifacts, not transcripts. A fresh session with no conversational memory can
pick up any stage from the artifacts, the last handoff record and the current convergence report.

## Routing discipline (Phase 3.8I)

The registry decides *who owns which decision*. Routing decides *whether a role is bought at all*.
More AI capability requires stronger routing discipline, so the selection itself is deterministic and
held by executable acceptance cases.

```text
task
  -> deterministic task route (config/agent-routing.json)
     -> bounded authorities + specialist role(s) + small complementary skill set
        -> specialist agent
           -> structured artifact
              -> independent review verdict
                 -> executable evidence
                    -> typed rework if needed
                       -> convergence
                          -> release
```

Four mechanisms hold that shape:

**Task routes.** `taskRoutes` maps bounded natural-language intent to roles, canonical authorities,
a small skill set and a context route. Higher-priority routes claim budget first; when several routes
match, the packet records what it suppressed rather than silently loading both.

**Unclassified is a valid outcome.** `Refactor this component` and an ordinary
`Review the architecture of this component boundary` deliberately match nothing. The packet says so
and the next step is bounded orientation. Guessing which subsystem owns a symbol, or buying an
independent cross-model critic for a routine review, is more expensive than reading a little first.

**First-orientation ceilings.** `packet` in `config/agent-routing.json` caps candidate paths,
authorities, selected roles, selected skills and deterministic packet bytes. These are
context-efficiency guards. A genuinely broad task expands deliberately after the first packet; it
does not raise a global ceiling for one exceptional case.

**Skill load budget.** Every skill declares a `loadClass` — navigation, process, domain, specialist,
review or critic — and a role packet normally carries at most one per class. A UX role can hold a UX
process, an interaction-design domain skill, an accessibility specialist lens and a UX review lens
together, because those compose. It cannot hold five competing UX frameworks because they are all
installed. The doctor and `tooling/agent-architecture.test.mjs` enforce this.

### Routing acceptance benchmarks

`config/agent-routing-benchmarks.json` holds representative prompts against
`schemas/routing-benchmark-case.schema.json`. Every case may assert required routes, roles and
skills **and** forbidden roles and skills, plus per-case ceilings.

Negative triggers are not decoration. A route that selects the right specialist while also dragging
in an expensive irrelevant one has failed the case. Held examples:

- `Redesign this marketing landing page` → art direction and its visual critic; **not** the database,
  security, discovery or opportunity roles;
- `Signup does not work` → systematic debugging and test engineering; **not** art direction,
  opportunity scouting or simplification;
- `Improve this page` → the opportunity scout first; **not** a default redesign or frontend
  implementation;
- `Restyle the pricing cards` → ordinary presentation review; **not** adversarial security review;
- `Clean up this broken journey and fix the bug` → still a defect; simplification is not selected
  while behaviour is wrong.

Run them with `npm run agent:bench`; inspect a single prompt with `npm run agent:route -- "TASK"`.
The same harness is the comparison bench for skill evaluation: the same task and the same context
packet, baseline without a candidate skill versus with it.

## Conditional roles, not universal ones

Some roles are too expensive or too specific to run on every change. They are registered as
`onDemandRoles` on each pipeline and selected by a deterministic `RiskClassification` of the
ChangeSet rather than by an agent's judgement:

| Role | Selected when |
| --- | --- |
| `differential-reviewer` | the diff touches a flagged risk surface — auth, authorization, database/schema, RLS, secrets, environment configuration, file ingestion, SSRF, deployment, provider boundaries, billing, production mutation or a cross-layer refactor |
| `independent-second-opinion` | a security, architecture, release-critical, cross-layer, irreversible or high-cost decision. A different persona on the same model is **not** independence; when no independent runtime is available the skip is reported, not disguised, and disagreement is preserved rather than forced into consensus |
| `environment-guardian` | any environment-sensitive mutation, before it happens. It resolves an `EnvironmentIdentity` card and fails closed when the target is ambiguous. Development is never production, preview is never production, and repository state is never deployed state |
| `product-opportunity-scout` | a broad outcome prompt such as "improve this page" or "what is missing", so discovery happens before redesign is assumed |
| `compound-learning` | after substantial completed work, and only when a non-obvious, evidence-backed, likely-to-recur lesson exists that is not already encoded. Its output names an existing durable home; it never creates a lessons or memory file |

An ordinary CSS change pays for none of them. That is the point: keeping the expensive lenses
conditional is what makes them affordable when they are genuinely needed.

## Completeness roles

Two roles exist because "it compiles" and "a component exists" are not evidence that a capability is
finished. Both own a required convergence gate in every pipeline.

**`state-matrix`** derives the state axes a capability genuinely exposes — data lifecycle,
permission, write status, content extremes, network, viewport/input and motion — removes impossible
combinations, ranks the rest by user risk and frequency, and gives the important states deterministic
fixtures. It must not emit a combinatorial catalogue of fictional states, and it must not add
snapshots that cannot distinguish a real regression. Its output feeds component previews, browser
tests, accessibility tests, `RenderedEvidence` and convergence.

**`journey-closure`** proves one user journey end to end: discovery/entry, prerequisites, primary
action, validation, authoritative write/read, observable success, refusal, retry/recovery,
persistence across reload, deep links, back/return navigation, mobile and desktop,
keyboard/accessibility, reduced motion where relevant, feature/rollout state and executable
acceptance evidence. It reviews; it does not implement the seam it finds, and it does not expand one
journey into a repository-wide sweep. It finishes with a closure ledger: proven, deliberately out of
scope, or blocked with an owner.

## Role catalogue

The registry currently holds 38 roles across intake, research, product, structure, experience,
content, brand, design, composition, implementation, verification and release. The full field-level
definition is in `config/agent-roles.json`; the shape below shows what a role looks like.

| Stage class | Creators | Independent reviewers |
| --- | --- | --- |
| intake | `requirements-interviewer` | human approval |
| research | `research-agent`, `brand-research` | `product-critic`, `visual-critic` |
| product | `product-discovery`, `product-specification`, `product-opportunity-scout` | `product-critic` |
| structure | `information-architect` | `ia-critic` |
| experience | `ux-interaction`, `state-matrix` | `ux-critic` |
| content | `ux-writer`, `marketing-content` | `product-critic` |
| design | `art-direction`, `design-system` | `visual-critic` |
| composition | `composition` | `ux-critic` |
| implementation | `solution-architect`, `frontend-implementation`, `backend-implementation`, `test-engineer`, `simplification` | `code-reviewer`, `security` |
| verification | — | `browser-qa`, `runtime-debug`, `accessibility`, `performance`, `seo-aeo`, `security`, `code-reviewer`, `design-critic`, `red-team`, `differential-reviewer`, `independent-second-opinion` |
| release | `compound-learning` | `journey-closure`, `environment-guardian`, `ship-release` |

Two boundaries are worth stating explicitly because they are easy to blur:

- **UX is not visual design.** `ux-interaction` owns flows, states, recovery and interaction
  expectations. `art-direction` owns the look. Neither may overwrite the other.
- **Browser QA is not runtime debugging.** `browser-qa` answers "does the product work?".
  `runtime-debug` answers "why does the browser behave this way?" using console, network, runtime
  state and performance traces.

## Routing by project class, not one universal pipeline

`config/agent-pipelines.json` routes roles by project type. A marketing site runs brand, art
direction, conversion copy and SEO/AEO. An internal tool deliberately does not: it has no
`research-agent`, `brand-research`, `art-direction`, `marketing-content` or `seo-aeo` stage, because
spending context and credit on them would be waste. A B2B SaaS build adds `solution-architect` and
runs security as the reviewer of the architecture stage.

Each pipeline declares its `requiredGates` and may override which creator role owns a gate's rework —
for example the marketing pipeline routes a security failure to `frontend-implementation` because it
has no backend stage. The doctor rejects a pipeline that requires a gate whose evaluator or rework
owner is not actually part of that pipeline.

## Relationship to the existing control plane

Nothing here replaces the durable primitives. A role executes inside the existing model:

```text
durable task (budget, policy, acceptance criteria)
  -> role context packet (bounded artifacts + selected skills)
     -> declared ChangeSet (validated file scope)
        -> deterministic checks
           -> independent review verdict
              -> stage handoff record
                 -> checkpoint + event ledger entry
```

Roles do not get their own scheduler, their own budgets or their own permission system. They are a
tighter expression of the control plane that already exists.

## What is executable today and what is planned

Executable now:

- role, pipeline, gate, skill, external-source and routing-benchmark registries with schema validation;
- deterministic task routing, first-orientation ceilings and the skill load budget;
- reviewer-independence enforcement;
- handoff promotion evaluation;
- typed rework routing and convergence assessment;
- bounded role context packets and mutation-scope enforcement;
- doctor and test coverage for all of the above.

Planned:

- the deterministic `RiskClassification` that selects the conditional roles;
- the `EnvironmentIdentity` card the environment guardian resolves;
- graph-assisted context discovery between the deterministic route and the file shortlist, deliberately
  deferred until repository size justifies it and never as a required dependency or authority (Phase 5);
- authoring the `SKILL.md` packets referenced by the registry (Phase 4 groundwork, Phase 5 runtime);
- artifact schemas for the specification-layer artifacts as each matures;
- executing roles in disposable sessions through `AgentRuntimeAdapter` (Phase 5).

See `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` for the handoff and convergence contracts,
`docs/DESIGN_INTELLIGENCE.md` for the design-side artifacts these roles exchange, and
`docs/ENGINEERING_QUALITY_PROGRAMME.md` for the tool responsibility map and the deterministic gates
these roles consume before spending model tokens.
