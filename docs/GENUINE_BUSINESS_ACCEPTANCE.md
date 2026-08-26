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
- a run with 20 or more meaningful manual edits;
- a source that was named but never ingested. Every source records the SHA-256
  of what was ingested and has to appear in the knowledge pack the run produced.
  Listing a company's website URL is not evidence that the crawler ever reached
  it;
- a `productReview` that says on its face that nobody reviewed it — a
  placeholder reviewer, or notes too short to have judged anything.

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

## Running the trial

Phase 4A and 4B built the path this gate has to run through. The proof goes
through the product, not through a CLI beside it.

**1. Start the factory.**

```bash
npm run dev
```

Console on `http://127.0.0.1:5173`, service on `http://127.0.0.1:4310`. Both are
loopback-only.

**2. Create the project from real intake.** Answer the questionnaire as the
business, not as a test. The approved Build Contract becomes the Manifest.

Approving records a durable **approved intake bundle**: the questionnaire
version, project type, intake mode, normalised answers, accepted defaults,
source references, capability decisions, and the approved Build Contract and
Manifest with a hash of each. A rerun replays that bundle instead of asking
anyone to remember what they answered — *Rerun an approved intake* on the
projects page, or `POST /intake-bundles/replay`. Replay rebuilds through the
same contract builders normal intake uses, shows what is being reused before
anything is spent, refuses a bundle whose questionnaire or schema has moved
rather than coercing it, and starts a genuinely fresh run: new task, new build,
new evidence, new checkpoints. Approved intent is reused; generated output never
is.

The nbm baseline is committed at
`examples/genuine-business/nbm-approved-intake.v1.json`. Read
`examples/genuine-business/README.md` before treating it as the original trial
input — it is an explicitly versioned replacement for an intake that was never
persisted, not a reconstruction of it.

**3. Add the real sources.** In the workspace's *Company sources* panel: the
company's own website URL, and the files the business has supplied. The
"business owns this material and approves republishing it" checkbox is a
statement about what you were given — leave it unticked for anything you were
not explicitly granted, including the company's own public site, whose
photographs are usually a photographer's.

**4. Settle source governance before ingesting.** *Sources & rights* offers
approve / reference-only / do-not-use per source. It locks once knowledge is
attached, which is deliberate: durable source truth must not diverge from what
was ingested.

**5. Decide the assets.** *Assets* lists every ingested image with what it
inherited and what a person decided, kept apart. Approving an asset whose source
is not approved needs a rights declaration about that asset alone. Smart crops
are withheld until reviewed; click a picture to set its focal point, then
approve the recomputed crops. Replace anything wrong — a replacement is a new
photograph and carries its own declaration.

**6. Generate, verify, preview.** Each is a durable task with events and a
checkpoint. The preview is the same rendering everything else reads.

**7. Capture rendered evidence.** *Rendered evidence* captures every route at
desktop, tablet and mobile plus the interaction states the build has, and lists
the states these pictures do not claim.

**8. Read the product review.** *What this build needs* ranks at most three
opportunities and says which are blocked on you rather than on the factory. Fix
what the factory can fix before counting edits against the budget.

**9. Record launch readiness at handover.**

```bash
npm run audit:launch -- --project <generated-workspace> --json
```

The workspace path is the one the Console shows and the checkpoint records.
Put `predictedManualEdits` and any remaining blockers into `launchReadiness` on
the evidence, so the prediction can be compared against what a person actually
had to change.

**10. Review it as a person, and count.** This is the part no script does.
Judge factual accuracy, brand fit, visual quality, responsive quality and
accessibility, and record every meaningful manual edit with its category. The
schema requires all five checks to be `passed` and every recorded edit to be
`meaningful: true` — an edit you would not defend to the business does not
belong in the count, and neither does one you made to avoid recording it.

## Validate

```bash
npm run acceptance:genuine-business:validate -- /path/to/run-root/evidence.json
```

The schema authority is `schemas/genuine-business-acceptance.schema.json`. Semantic and artifact checks live in `tooling/lib/genuine-business-evidence.mjs`.

Every declared source is cross-checked against `artifacts.knowledgePack`: its
`sha256` must be a `contentHash` the pack recorded, and a website source must be
the page the pack actually holds. A source the run never ingested cannot be in
the pack, so it cannot be in the evidence. The Phase 3.8E nbm trial found this
the hard way — before the check existed, an evidence file naming
`https://www.nbm.bz/` passed the validator even though the crawler had never
reached the site.

A passing validator result is necessary but not sufficient to close Phase 3.8E: the evidence must come from an actual business trial. After the trial, observed shortcomings should be fixed in the deterministic composer/templates/recipes where possible, then the same business should be regenerated and re-reviewed before the stage is marked complete.
