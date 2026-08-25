# Genuine Business Acceptance

Phase 3.8E is the product-proof gate that completes the intent of Phase 3.6C. It must not be satisfied by the deterministic Acme fixture or by another invented source pack.

## What counts

A passing run needs:

- a real public company website used as an input source;
- at least one genuine user-supplied company document, logo, image or spreadsheet that is explicitly approved for use;
- source hashes and provenance;
- the real intake -> Build Contract -> Manifest -> ingest -> compose -> generate -> verify -> preview journey;
- deployment evidence when deployment is part of the trial, otherwise an explicit `not-applicable` result;
- a human product review that considers factual accuracy, brand fit, visual quality, responsive quality and accessibility;
- every meaningful manual edit counted and categorized;
- build/AI cost, elapsed time, retries, interventions and quality failures;
- references and SHA-256 hashes for the Manifest, knowledge pack, composition and verification report plus the generated repository itself.

The initial gate is **fewer than 20 meaningful manual edits** before the result is launchable. Passing this gate once is not the long-term quality target; the benchmark programme should push mature mainstream website classes toward a median of five or fewer meaningful edits.

## What does not count

The following cannot satisfy Phase 3.8E:

- `.example`, localhost, private-network or otherwise synthetic company websites;
- generated placeholder logos/photos passed off as supplied business material;
- public assets whose reuse rights have not been approved;
- compile/build success without product review;
- an evidence JSON file that references missing or changed artifacts;
- a run with 20 or more meaningful manual edits.

The existing Acme scenario remains useful CI regression coverage and is intentionally named `synthetic-mixed-source` in commands and workflow labels.

## Evidence layout

Keep the evidence file beside the artifacts it references so the validator can prove file existence and hashes without accepting arbitrary filesystem paths. A typical temporary run directory is:

```text
run-root/
  evidence.json
  sources/
    logo.svg
    brochure.pdf
  artifacts/
    project-manifest.json
    knowledge-pack.json
    composition.json
    verification.json
  generated-app/
    package.json
    ...
```

All local paths in `evidence.json` are relative to the evidence file. Absolute paths and traversal outside that directory fail closed.

## Validate

```bash
npm run acceptance:genuine-business:validate -- /path/to/run-root/evidence.json
```

The schema authority is `schemas/genuine-business-acceptance.schema.json`. Semantic and artifact checks live in `tooling/lib/genuine-business-evidence.mjs`.

A passing validator result is necessary but not sufficient to close Phase 3.8E: the evidence must come from an actual business trial. After the trial, observed shortcomings should be fixed in the deterministic composer/templates/recipes where possible, then the same business should be regenerated and re-reviewed before the stage is marked complete.
