# @app-builder/contracts

Shared machine-derived TypeScript contracts for App Builder boundaries live here.

## Authority

JSON Schema files in `/schemas` are the canonical machine-readable source. Generated declarations are build artifacts, not a second editable specification.

For the first Phase 3.8 migration slice:

- `schemas/project-manifest.schema.json` is the structural authority for Project Manifest v1/v2;
- `npm run contracts:generate` uses `json-schema-to-typescript` to generate `generated/project-manifest.d.ts`;
- the generated directory is intentionally gitignored and regenerated before root build/typecheck;
- runtime manifest validation uses Ajv against the same JSON Schema;
- adapter/module readiness remains a separate buildability decision and must not be folded into structural schema validation.

Later contract families should migrate to this pattern incrementally rather than copying declarations into this package by hand.
