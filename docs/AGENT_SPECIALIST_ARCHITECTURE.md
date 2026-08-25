# Specialist Agent Architecture

Status: **foundation landed (Phase 3.8H), execution planned for Phase 5**.

This document explains the specialist-agent organisation whose machine-readable form lives in
`config/agent-roles.json`, `config/agent-pipelines.json`, `config/skill-registry.json` and
`config/external-sources.json`, and whose deterministic primitives live in
`packages/control-plane/src/roles.js`.

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

## Role catalogue

The registry currently holds 31 roles across intake, research, product, structure, experience,
content, brand, design, composition, implementation, verification and release. The full field-level
definition is in `config/agent-roles.json`; the shape below shows what a role looks like.

| Stage class | Creators | Independent reviewers |
| --- | --- | --- |
| intake | `requirements-interviewer` | human approval |
| research | `research-agent`, `brand-research` | `product-critic`, `visual-critic` |
| product | `product-discovery`, `product-specification` | `product-critic` |
| structure | `information-architect` | `ia-critic` |
| experience | `ux-interaction` | `ux-critic` |
| content | `ux-writer`, `marketing-content` | `product-critic` |
| design | `art-direction`, `design-system` | `visual-critic` |
| composition | `composition` | `ux-critic` |
| implementation | `solution-architect`, `frontend-implementation`, `backend-implementation`, `test-engineer`, `simplification` | `code-reviewer`, `security` |
| verification | — | `browser-qa`, `runtime-debug`, `accessibility`, `performance`, `seo-aeo`, `security`, `code-reviewer`, `design-critic`, `red-team` |
| release | — | `ship-release` |

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

- role, pipeline, gate, skill and external-source registries with schema validation;
- reviewer-independence enforcement;
- handoff promotion evaluation;
- typed rework routing and convergence assessment;
- bounded role context packets and mutation-scope enforcement;
- doctor and test coverage for all of the above.

Planned:

- authoring the `SKILL.md` packets referenced by the registry (Phase 4 groundwork, Phase 5 runtime);
- artifact schemas for the specification-layer artifacts as each matures;
- executing roles in disposable sessions through `AgentRuntimeAdapter` (Phase 5).

See `docs/AGENT_HANDOFFS_AND_CONVERGENCE.md` for the handoff and convergence contracts and
`docs/DESIGN_INTELLIGENCE.md` for the design-side artifacts these roles exchange.
