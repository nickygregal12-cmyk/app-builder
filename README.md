# App Builder

Personal AI-first website and application factory.

App Builder is designed around one rule:

> Never spend AI tokens solving a problem the factory already knows how to solve deterministically.

The long-term goal is a private builder that can accept an idea, company details, URLs, documents, spreadsheets, screenshots, logos and images; turn them into a reviewed build contract; compose proven modules; use AI only for genuinely novel work; test the result; visually review it; and deploy an ordinary portable repository.

## Current milestone: Foundation v0

This repository currently establishes the contracts and boundaries that future work must preserve:

- App Factory Engine and Builder Console are separate layers.
- Project intake becomes a machine-readable project manifest before coding begins.
- Optional capabilities are modules, not permanently baked into every generated app.
- Deterministic generation comes before generative AI.
- Context and AI cost budgets are explicit.
- Company facts and generated marketing content have separate provenance.
- The intake questionnaire is versioned and improved from evidence, never silently self-modified.
- Generated projects remain normal repositories with no proprietary runtime lock-in.

## Commands

```bash
npm install
npm run doctor
npm test
npm run validate:example
npm run create-app -- --manifest examples/project-manifest.example.json --out /tmp/app-builder-demo
npm run dev
```

## Repository map

```text
apps/console/             Future private vibe-coding Builder Console
config/                   Module catalogue, project types and agent routing
schemas/                  Stable data contracts for intake/build generation
packages/contracts/       Shared typed contracts
packages/factory-core/    Deterministic factory engine
recipes/                  Optional capability recipes installed into generated apps
templates/                Project-type templates
questionnaires/           Versioned adaptive intake questions
tooling/                  create-app, validation, doctor and future release tools
docs/                     Small authoritative architecture/product docs
examples/                 Known-good manifests/build contracts used by tests
```

See `AGENTS.md` before making architecture changes and `docs/ROADMAP.md` for planned stages.
