# Phase 3.8E operator-authored acceptance input

`nbm-genuine-business-acceptance.xlsx` is the workbook the owner approved as
source material for the Phase 3.8E genuine-business trial against **nbm
Construction Cost Consultants** (`NBM CONSTRUCTION COST CONSULTANTS LIMITED`,
company number SC228801). `build-nbm-workbook.mjs` regenerates it byte-for-byte
so the trial is reproducible:

```bash
node examples/genuine-business/build-nbm-workbook.mjs
```

It is **not** a template, a fixture, or a shape the factory expects. It is one
operator's file, kept so the trial can be re-run against the same input. Nothing
in the factory reads it.

## What it holds, and what that approval covers

Two clearly separated groups:

- **A — verified public facts.** Identity and register facts, the public service
  lines, and the Glasgow and Edinburgh offices. Each row records where it came
  from and how far it was verified.
- **B — acceptance intent and rights.** The owner's brief for what the site
  should achieve, and an explicit statement of what the approval does and does
  not cover.

The approval covers **this workbook only**. It is not approval to republish nbm
website photographs, logo files, staff photographs, client or project
photography, or any third-party mark. The public website at
`https://www.nbm.bz/` stays reference-only: public visibility is not a
republication right.

Project and case-study names are deliberately absent. They could not be
re-verified through source ingestion during the trial, and an unverified claim
about a client's project is exactly what this gate exists to prevent.

## The approved intake bundle

`nbm-approved-intake.v1.json` is the canonical approved intake for this trial.
Replaying it starts a fresh nbm run from the same decisions without re-keying
the questionnaire. `build-nbm-intake-bundle.mjs` regenerates it byte-for-byte,
and a test asserts that it does:

```bash
node examples/genuine-business/build-nbm-intake-bundle.mjs
```

**Read this before treating it as the original trial input.** The intake that
produced the original nbm Build Contract and Manifest was never persisted. It
was searched for — every branch and every commit here, and the durable service
state — and it is not recoverable. This file is therefore an explicitly
versioned **replacement baseline**, authored from the approved workbook above,
`docs/GENUINE_BUSINESS_ACCEPTANCE.md` and `docs/TRIAL_FINDINGS.md`. It is not a
byte-identical reconstruction of the lost original and must never be described
as one. Reruns are measured against it, not against the first trial's inputs.

Where the workbook is silent the answer is left at the questionnaire default and
recorded as an accepted default rather than as something the operator said.
`trust` is deliberately unanswered: the workbook forbids unsupported proof and
withholds case studies, and finding F23 records intake trust answers being
published as the company's own evidence.

## `nbm-visual-review-v1.verdicts.json` — the first independent visual verdict

The first genuinely independent Phase 4D visual review, recorded verbatim as the
reviewer issued it on 2026-08-28. The reviewer was an OpenAI GPT-5 `design-critic`
through the Codex path; the candidates were created by an Anthropic runtime, so
creator and reviewer are different vendors and rule 17 holds.

Both candidates were **rejected**: `structured-practice` scored a 5.21 mean and
`editorial-authority` 4.66, against a required 8.5 mean and a 6.5 per-criterion
floor. `distinctive-moment` was the weakest criterion in both, at 2.8 and 2.5.

It is kept because a rejection is evidence. The sequence
`candidate v1 -> independent reject -> findings -> factory fix -> candidate v2`
is only attributable if the first verdict survives, and this file was otherwise
about to be lost: it existed nowhere but one session's scratch directory, which
is exactly the failure principle 12 names.

**Read the verdict knowing the evidence it judged was partly invalid.** Both
reviews lead with routes rendering as one page — "every named route, including
the 404 route, renders essentially the same page with Home selected". That was
true and it was a capture defect, not a design defect: all six route captures per
viewport were byte-identical because the evidence server answered every
prerendered route with the home document. The findings that depend on that
observation — wayfinding, page-specific hierarchy, the broken-looking 404 —
cannot be attributed to the design until the set is recaptured and rereviewed.
The findings that do not depend on it — a weak distinctive moment, thin
credibility material, single-channel conversion — stand on their own.

Replaying it with `--verdicts` records two rejections and promotes nothing, which
is what it says.
