# Genuine Business Acceptance

Status: **Phase 3.8E passed on 2026-08-26.** The accepted run and immutable evidence hash are recorded in `docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`.

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
- a source that was named but never ingested. Every source records the SHA-256 of what was ingested and has to appear in the knowledge pack the run produced. Listing a company's website URL is not evidence that the crawler ever reached it;
- a `productReview` that says on its face that nobody reviewed it — a placeholder reviewer, or notes too short to have judged anything.

The existing Acme scenario remains useful CI regression coverage and is intentionally named `synthetic-mixed-source` in commands and workflow labels.

## Evidence layout

Keep the evidence file beside the artifacts it references so the validator can prove file existence and hashes without accepting arbitrary filesystem paths. A typical run directory is:

```text
run-root/
  evidence.json
  sources/
    supplied-file.ext
  artifacts/
    project-manifest.json
    knowledge-pack.json
    composition.json
    verification.json
    launch-readiness.json
  generated-app/
    package.json
    ...
  rendered-evidence/
    ...
```

All local paths in `evidence.json` are relative to the evidence file. Absolute paths and traversal outside that directory fail closed.

## Running or reproducing a genuine trial

Phase 4A and 4B built the path this gate has to run through. The proof goes through the product, not through a CLI beside it.

### 1. Start the Factory and Console

On a local development machine `npm run dev` starts both. On the Hetzner host the Factory normally runs under systemd on `127.0.0.1:4310`; start only the Console when the service is already running so a second Factory does not compete for the same port.

### 2. Create or replay the project from real intake

Answer the questionnaire as the business, not as a test, or replay a durable approved-intake bundle. Approving intake records the questionnaire version, project type, intake mode, normalised answers, accepted defaults, source references, capability decisions and approved Build Contract/Manifest hashes.

A rerun replays approved intent into a genuinely fresh run. Generated output is never reused.

The NBM baseline is committed at:

```text
examples/genuine-business/nbm-approved-intake.v1.json
```

Read `examples/genuine-business/README.md` before treating it as the original trial input: it is an explicitly versioned replacement for an intake that was never persisted, not a reconstruction of it.

### 3. Add and govern the real sources

Use the company's website plus the material the business actually supplied. Public visibility is not republication permission. Mark the company's public site `reference-only` unless reuse rights are explicitly granted; mark genuinely supplied material `approved-for-use` only when that is true.

Source governance locks once knowledge is attached so durable source truth cannot diverge from what was ingested.

### 4. Decide assets separately from source facts

The knowledge pack records what a source contained. Per-asset publication decisions are separate human decisions. Approving an asset from a reference-only source requires an explicit asset-level rights declaration. Smart crops remain reviewable rather than silently treated as approved.

### 5. Generate, verify and preview

Each stage is a durable Factory task with events and checkpoints. Generation after newly ingested source material must produce a fresh workspace so the reviewed build can be traced back to the knowledge pack that informed it.

### 6. Capture rendered evidence

Rendered evidence captures every route at desktop, tablet and mobile plus the interaction states the build actually exposes. States a screenshot cannot establish must remain recorded as uncovered rather than being promoted to passed.

On a hosted Factory, evidence capture requires the Playwright Chromium browser for the Factory service user. A host claiming rendered-evidence capability should provision that browser or fail preflight clearly before the trial reaches this step.

### 7. Record launch readiness at handover

```bash
npm run audit:launch -- --project <generated-workspace> --json
```

The command expects the generated workspace path, not the Builder project id. Record `predictedManualEdits`, remaining blockers and evidence gaps so the audit can be compared with what a person actually had to change.

### 8. Assemble the review packet

```bash
npm run acceptance:genuine-business:packet -- \
  --project <projectId> \
  --state-root <factory-state-root> \
  --workspaces-root <factory-workspaces-root> \
  --out <dir>
```

The packet assembler copies what the Factory can prove: durable source ledger, knowledge pack, journey events, metrics, launch-readiness output, generated repository, retained originals and rendered captures. It writes `evidence.draft.json` and `REVIEW.md`.

The draft deliberately does **not** validate. `productReview` and `manualEdits` are absent because those are human judgements. If a machine-side prerequisite is missing — no real ingestion, no website crawl, no rendered evidence or no launch-readiness report — the packet reports the gap rather than manufacturing a tidy passing file.

### 9. Review it as a person and count meaningful edits

Judge factual accuracy, brand fit, visual quality, responsive quality and accessibility. Count every meaningful edit you would actually require before launch. An edit made only to game the metric does not belong in the count, and a required edit must not be omitted to improve the score.

## Validate

```bash
npm run acceptance:genuine-business:validate -- /path/to/run-root/evidence.json
```

The schema authority is `schemas/genuine-business-acceptance.schema.json`. Semantic and artifact checks live in `tooling/lib/genuine-business-evidence.mjs`.

Every declared source is cross-checked against `artifacts.knowledgePack`: its `sha256` must be a `contentHash` the pack recorded, and a website source must match the page the pack actually holds. A source the run never ingested cannot pass by merely being named in the evidence file.

## Accepted NBM run — 2026-08-26

Phase 3.8E closed with the genuine NBM Construction Cost Consultants run:

- project id: `project-7b296c17-4745-422a-a1f4-23dafb160c98`;
- Factory commit: `a34f0d8458425527db8695a14d231cad786e623f`;
- source-backed v2 build generated after ingestion;
- 9 hashed sources: one owner-approved workbook and eight real NBM website pages;
- website sources retained as `reference-only`;
- independent generation/verification passed;
- supported preview passed;
- rendered evidence captured across desktop/tablet/mobile;
- launch-readiness: 6 predicted edits, 0 blockers, 14 evidence gaps;
- human review passed factual accuracy, brand fit, visual quality, responsive quality and accessibility;
- human meaningful manual edits: **0**;
- final validator: **passed**;
- final evidence SHA-256: `a3b3baf5e67c0cb369da6f6329da3088e8eb8df4d27e1e13497ff8b7bccee990`.

The complete closure record, including the Playwright-browser provisioning finding and imagery-calibration finding, is `docs/PHASE_3_8E_ACCEPTANCE_RECORD.md`.

Anything a future genuine-business rerun exposes that another project would hit is a Factory defect: fix the Factory, add regression coverage and rerun the same approved intake. Do not hand-beautify generated output to improve the benchmark.

## From one accepted run to a frozen corpus

One accepted run proves the path works once. Repeatable product quality needs several deliberately different businesses run through the same contract. `docs/ROADMAP.md` sequences that product-proof freeze and states its entry condition; this document owns what each corpus run must satisfy.

The corpus is adversarial by design rather than ten variations of the same brochure site. Aim for at least ten businesses spanning distinctly different demands, for example:

- local trade with project photography and quote conversion;
- restrained professional consultancy with project evidence — the accepted NBM run is the first;
- restaurant or hospitality conversion with menu, location and booking or contact;
- a trust-heavy professional or regulated-adjacent service where factual restraint matters most;
- an image-heavy hospitality business such as a hotel, with rooms, amenities and local content;
- text-heavy professional services where authority and information hierarchy carry the page;
- a charity or community organisation, with trust, donations or contact and content depth;
- a catalogue or ecommerce-adjacent brand with collections and consistent product imagery;
- an editorial or content organisation with a larger information architecture;
- an unusual premium brand that deliberately challenges the default section rhythm, typography and hero patterns.

Each accepted corpus project freezes its approved input so a later factory version reruns the same truth rather than a new interpretation of it. The approved-intake bundle, the ingested sources and their hashes are the frozen input; `examples/genuine-business/nbm-approved-intake.v1.json` is the existing shape.

The loop each corpus project runs is:

`frozen approved input -> build -> evidence -> meaningful edits counted -> human quality judgement -> defects classified -> narrow factory fix -> rerun the same frozen input -> compare`

Classify every defect a run exposes as **project-specific** or **reusable factory debt**, because only the second kind justifies factory work during the freeze. Record the per-project measurements listed in `docs/VISUAL_EXCELLENCE.md` so the corpus can be compared against itself over time, and run the anti-template diversity diagnostic across unrelated corpus builds so the factory cannot pass quality by making every business the same beautiful template.

Two honesty rules carry over from the single-run gate. A worse real number is never hidden to protect a target — the mature mainstream-site aim of a median of five or fewer meaningful edits is a target, not a claim. And website evidence never silently graduates complex SaaS, consumer or AI applications to the same maturity: those belong to the separate corpus in `docs/GOLD_STANDARD_COMPLEX_APP_BENCHMARK.md`.

**Phase 3.8E is complete. Phase 4C is now the active product stage.**
