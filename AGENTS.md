# App Builder agent rules

This file is the root engineering authority for AI-assisted work in this repository.

## Purpose

Build a personal, low-credit AI app/website factory. App Builder should solve repeated engineering problems once, then compose those proven solutions into future projects.

## Non-negotiable principles

1. **Deterministic before generative.** Do not call an LLM for work that schemas, templates, recipes, code generators, linters, tests or static tooling can perform.
2. **Modules over duplication.** A reusable capability belongs in a versioned optional recipe/package only when it can reasonably serve multiple substantially different projects.
3. **No domain contamination.** Do not copy Euro/football Predictor product logic, naming, migrations, scoring, fixtures, games or historical documentation into this repository.
4. **Small context packets.** Agents should receive only the manifest, authority, files and tests relevant to their task. Whole-repo reads are exceptional architecture operations.
5. **Minimal diffs.** Prefer targeted edits over regenerating working files. Unexpected wide diffs require justification.
6. **No dependency-by-default.** A new package must solve a real problem not already covered by the platform or web platform.
7. **Facts are not copy.** Business/company facts must retain provenance. AI-generated claims must never be silently promoted to facts.
8. **Questionnaire evolution is reviewed.** Intake questions improve from project evidence, but the system must propose versioned changes; it must never silently rewrite its own discovery process.
9. **Portable outputs.** Generated apps are ordinary repositories and must remain usable without the Builder Console.
10. **Quality gates are deterministic where possible.** Typecheck, lint, tests, accessibility, performance and security tooling run before expensive AI review.

## Context budgets

Default ceilings for an AI task:

- routing/classification: deterministic or <= 2k tokens
- ordinary implementation: <= 15k tokens
- complex feature/bug: <= 35k tokens
- architecture/security review: <= 60k tokens

Exceeding a ceiling requires a written reason in the task output.

## Architecture boundaries

- `apps/console`: human interface only. It must call factory contracts rather than own generation logic.
- `packages/factory-core`: deterministic orchestration and generation.
- `packages/contracts`: stable shared data contracts.
- `recipes`: optional features installed into generated projects.
- `templates`: project shapes, not branded finished products.
- `questionnaires`: versioned discovery definitions.
- `config`: registries/routing, not application business logic.

## Before merging

Run:

```bash
npm run check
npm run build
```

Any exception must be explicit and temporary.
