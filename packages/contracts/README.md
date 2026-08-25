# @app-builder/contracts

Shared machine-derived contracts for App Builder boundaries live here: the
generated TypeScript declarations and the Ajv validators that enforce them at
runtime.

## Authority

JSON Schema files in `/schemas` are the canonical machine-readable source.
Generated declarations are build artifacts, not a second editable
specification.

```text
/schemas -> generated packages/contracts types -> Ajv boundary validation
```

## Contract families

`config/contract-families.json` is the registry. It lists:

- `families` — schemas that generate TypeScript and compile an Ajv validator,
  each with the boundary it guards and the recorded schema/type hashes;
- `pending` — schemas that are deliberately not yet a runtime family, each with
  a reason.

Every file in `/schemas` must appear in one of those lists, so adding a schema
forces an explicit migration decision instead of quietly growing a second
handwritten contract surface.

## Use

```js
import { validateContract, assertContract } from '@app-builder/contracts';

const errors = validateContract('knowledge-pack', pack); // [] when structurally valid
assertContract('project-manifest', manifest);            // throws with every problem listed
```

Validation here is **structural only**. Referential integrity, governance
consistency and adapter/module buildability stay with the callers that own
those rules — `validateKnowledgePack` keeps the cross-entity governance checks,
and recipe/adapter readiness remains a registry decision.

## Generation and drift

- `npm run contracts:generate` regenerates `generated/*.d.ts` plus the
  root-type barrel and records each family's schema and type hash;
- `npm run contracts:check` fails when either hash drifts, and runs inside
  `npm run check`;
- the generated directory is intentionally gitignored and is regenerated before
  root build/typecheck.

The schema hash exists because a validation change — a tightened enum, a new
required field — can leave the emitted TypeScript identical. Recording both
means every semantic contract change surfaces in review.
