# Product contract

## Goal

Make it possible to go from an idea or messy real-world company information to a coherent, tested, deployable website/app with one high-level build instruction and minimal AI spend.

App Builder should ultimately combine the strongest qualities of modern visual/web builders with a stricter deterministic engineering core:

- visual freedom and direct manipulation without losing structured project truth;
- reusable design-system and capability registries rather than repeated prompt-generated boilerplate;
- strong website capabilities such as static-first rendering, CMS/content collections, localization, SEO/AEO and controlled experiments where relevant;
- ordinary repositories, Git history and provider portability rather than proprietary runtime lock-in;
- provenance-aware source/content handling;
- durable project/task state that survives agent/session loss;
- deterministic security, accessibility and quality gates before AI review;
- interoperable factory tools so different coding agents/clients can call the same deterministic service rather than reimplementing it in prompts.

## Inputs

App Builder should eventually accept:

- rough product ideas and requirements;
- company identity/contact/service details;
- existing website URLs;
- existing repositories for adoption/improvement;
- logos and brand assets;
- photographs and screenshots;
- PDFs, Word files, spreadsheets, CSVs and presentations;
- reference websites/design screenshots;
- Figma/design-system references where available;
- price lists, project lists, testimonials and accreditations;
- structured content/collection data and localization requirements.

Inputs are normalised into facts, brand, assets, content, references, requirements and research before build agents run.

A project may enter as a **greenfield build** or as an **existing-product adoption/improvement**. The latter is an entry mode, not a separate project class: a marketing site, SaaS product, consumer app or internal tool can all be adopted. When a repository and/or live URL already exists, the factory first freezes a baseline, maps the current product/architecture and user journeys, and separates what should be kept, refactored, redesigned, replaced, removed or added before it proposes mutation. Improvement is judged against before/after evidence rather than by whether the new code merely builds.

## Success definition

For a standard commercial website, most work should be deterministic composition. For a custom SaaS, AI should focus on unique product logic and design decisions rather than setup already solved by the factory.

A project is not complete because it compiles. It must satisfy its Build Contract and relevant design, security, accessibility, environment and quality contracts.

For public websites, success also means the chosen output architecture is appropriate to the product: marketing/content sites should not inherit a heavy application shell merely because the factory's first template used one.

For an adopted product, success additionally means preserving known-good behaviour and history while measurably improving the agreed baseline: architecture, journeys, visual/mobile quality, correctness, accessibility, performance, security, maintainability and intervention cost are compared where relevant. A broad instruction such as “improve this product” routes through diagnosis/opportunity work before implementation rather than becoming an automatic rewrite or redesign.

The Builder Console should become a real control surface over durable factory state: source intake, visual preview/editing, design variants, assets, environments, build progress, checkpoints, quality findings and deployment approvals all operate through the factory service rather than hidden browser-only state.

The Console exposes decisions the owner needs to make, not the complexity the factory contains. Use
four interaction classes: **automatic** for high-confidence, low-risk and reversible decisions;
**recommended** when a strong default exists but preference matters; **ask** when the choice is
subjective, consequential or unknowable; and **escalate** for conflicting evidence, destructive work,
security/production boundaries or policy approval. Track owner decisions required per accepted build
alongside prompts and edits; reducing prompts by hiding consequential choices is not product progress.

## Owner intent, owner solutions and escalation

`AGENTS.md` principle 24 states the rule: owner intent is authoritative, an owner's proposed solution
is a candidate. This section is the policy that follows from it — what the factory decides for itself,
and what it is genuinely required to ask. `docs/ROADMAP.md` sequences the machinery; nothing here is a
second copy of that sequence.

An owner writes in one register but says several different kinds of thing, and the classification
vocabulary exists because treating them alike is the failure mode:

> "Users need to switch between their workspaces quickly" is a requirement.
> "I'd prefer something like the app I already use" is a reference.
> "Put the workspaces in a dropdown" is a proposed solution.
> "Workspace switching must be available from every screen" is a hard requirement.

Facts, business rules, hard requirements and anything marked non-negotiable stay authoritative and are
never quietly downgraded; the existing hard-constraint semantics are unchanged. A suggested solution is
carried as a hypothesis with the goal it serves, the journey it affects and the evidence that would
settle it, and it may end accepted, modified or rejected.

### What the factory decides, and what it asks

The four interaction classes above are the mechanism; this is the policy they encode, and it is the
part a role reaches for when deciding whether to stop and ask.

The factory normally **decides**: the navigation model; sidebar versus tabs versus top navigation; page
hierarchy and section ordering; component choice; information density; responsive rearrangement; CSS
and layout implementation; state-management implementation; framework and library detail; API
patterns; accessibility implementation; and technical architecture wherever the requirements permit
alternatives. Each role's `owns` list in `config/agent-roles.json` is the machine-readable half of
this.

It **asks** for: unknown facts; business-policy decisions; genuine scope ambiguity; rights and
licensing approval; legal, compliance and commercial judgement; destructive or production actions;
material cost commitments; two or more genuinely equivalent subjective product directions; and
explicit brand preference where evidence cannot distinguish the alternatives.

It does not ask merely because an agent can think of several implementation options. A question the
factory's own expertise, registries or deterministic rules already answer is a cost, not diligence —
and confidently deciding something it genuinely could not know is the opposite failure, equally
counted.

**Human steering burden** is measured for the same reason cost and edits are: clarification questions
per build, owner decisions required, manual edits, owner overrides, rejected factory decisions, rework
caused by bad initial assumptions, owner waiting time and model spend caused by avoidable ambiguity.
It is not optimised to zero — hiding a consequential choice is not progress. The target is the minimum
steering compatible with high accepted quality and safe decisions, which is the same optimisation as
Accepted Quality Efficiency: a £0, zero-edit 6.5/10 site is not preferable to a low-cost,
two-intervention 9/10 site.

## The adaptive questionnaire

Intake is a structured product interview, not a wall of text boxes, and the reason is as much economic
as it is ergonomic. An answer captured as a stable value is an answer no model has to re-interpret:
`accessModel = public-marketing-private-app` deterministically informs route planning, IA,
authentication requirements, SEO, navigation, the ProductSpec, architecture and acceptance tests, where
"yes users need accounts but I still want people to see the homepage" informs a re-reading.

What exists today and must not be rebuilt beside itself: versioned questionnaires per project type in
`questionnaires/v1/` with a shared base; typed questions (`single-select`, `multi-select`, `boolean`,
`list`, `text`, `textarea`, `url`, `company-identity`, `contact-details`); conditional visibility
through `when` (`equals`, `notEquals`, `in`, `includes`, `truthy`); quick/standard/thorough depth;
defaults recorded as decisions rather than silence; high-impact ambiguity follow-ups; and bundle drift
detection that refuses to replay old answers against changed questions. The gap and its sequence are in
`docs/ROADMAP.md`.

Two rules bound whatever is added. Questions are about outcomes, never about implementation the factory
should decide — "who needs access and when" rather than "should authentication use middleware" — and
free text stays wherever the answer genuinely carries nuance options would flatten. Question changes
remain versioned and reviewed (principle 8): the factory proposes questionnaire improvements from
project evidence and never silently rewrites its own discovery process.

The best-in-class capability backlog and adoption rules live in `docs/BEST_IN_CLASS_CAPABILITIES.md`. What "finished" means lives in `docs/MASTER_PLAN.md`; the order it is reached in lives in `docs/ROADMAP.md`.
