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
