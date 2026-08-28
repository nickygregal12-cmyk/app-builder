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

The best-in-class capability backlog and adoption rules live in `docs/BEST_IN_CLASS_CAPABILITIES.md`. What "finished" means lives in `docs/MASTER_PLAN.md`; the order it is reached in lives in `docs/ROADMAP.md`.