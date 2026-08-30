# Genuine-business corpus inputs

The frozen inputs and recorded verdicts for the real businesses the factory has
been run against. Each case keeps its approved input so a later factory version
reruns the same truth rather than a new interpretation of it.

- **nbm Construction Cost Consultants** — case 1, the Phase 3.8E acceptance run.
- **MGB Decor** — case 2, run as an explicit prototype. See the last section.

## Phase 3.8E operator-authored acceptance input

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

## `nbm-visual-review-v2.verdicts.json` — the same reviewer, over evidence that was real

The second independent review, issued 2026-08-28 by the same OpenAI GPT-5
`design-critic` over the same two candidates from the same frozen inputs. The
only thing that changed between v1 and v2 is that the captures were trustworthy:
the evidence server was fixed to serve a prerendered route its own document, so
21 captures per candidate really are 21 surfaces rather than three photographed
seven times each.

Both candidates moved **reject -> rework**. Neither passes: 6.14 and 5.91 against
a required 8.5 mean and a 6.5 per-criterion floor.

The pair exists to answer one question the first verdict could not — how much of
that score was invalid evidence and how much is the output.

| criterion | structured-practice | editorial-authority | reading |
| --- | --- | --- | --- |
| visual-hierarchy | 5.8 -> 7.1 | 5.2 -> 7.5 | evidence |
| credibility | 4.8 -> 6.2 | 4.6 -> 6.7 | evidence |
| coherence | 6.4 -> 7.3 | 6.2 -> 7.2 | evidence |
| conversion-clarity | 6.0 -> 6.8 | 5.0 -> 6.2 | mixed |
| brand-fit | 6.2 -> 6.4 | 5.8 -> 6.8 | mixed |
| distinctiveness | 4.2 -> 4.8 | 3.8 -> 4.8 | **design** |
| distinctive-moment | 2.8 -> 4.6 | 2.5 -> 3.5 | **design** |
| responsive-quality | 5.5 -> 5.9 | 4.2 -> 4.6 | **design** |

The criteria that recovered are exactly the ones whose v1 complaints were the
capture defect stated in other words — "every route presents the same hierarchy",
"no meaningful route-specific content". Both now clear the floor on hierarchy and
coherence without a line of design work.

The criteria that did not recover are the real ones. `responsive-quality` moved
+0.4 in both, which is noise, and both still fail it; the mobile findings are
specific and reproducible — clipped mobile navigation on one candidate, content
order putting the generic CTA before page-specific information on the other.
`distinctiveness` and `distinctive-moment` remain the weakest criteria in the set
and are the honest subject of the rework: the output reads as a competent
professional-services template rather than as this practice.

That is the split the pair was kept to record. Do not read v1's hierarchy or
credibility scores as design evidence, and do not read v2's improvement as the
rework having happened — it has not started.

## `mgb-approved-intake.v1.json` — corpus case 2, as a prototype

MGB Decor is a Glasgow painting and decorating business and the second
genuine-business case. It exists to answer one question NBM could not: is the
component-vocabulary convergence recorded in `docs/PHASE_4D_VISUAL_DEBT.md`
cross-project, or an artefact of one thinly-evidenced professional-services
business? A craft trade whose product is photographs of finished rooms is about
as far from a cost consultancy as the corpus can currently reach.

`build-mgb-intake-bundle.mjs` regenerates the bundle byte-for-byte and
`tooling/mgb-corpus-intake.test.mjs` asserts that it does:

```bash
node examples/genuine-business/build-mgb-intake-bundle.mjs
```

### It is a prototype input, and says so

Unlike the nbm workbook, this input was not assembled for a launch. The owner
supplied enough real business fact to build and judge a site, and did not supply
production contact details, review evidence, project histories, asset bytes or a
domain. The bundle therefore carries three kinds of statement that must never
merge into one another:

| | Example | What it is |
| --- | --- | --- |
| Owner-supplied fact | founded 2020, eight staff, the eight services, Glasgow and the West, fully insured | Real, and the site may rely on it |
| Public reference location | the Facebook, Instagram and Companies House URLs | A place to look. Not permission to publish, and not ingested in this run |
| Prototype placeholder | `123456789`, `test@mgb.com` | Present so the quote and contact journeys can be exercised. Never MGB's contact details |

`tooling/mgb-corpus-intake.test.mjs` is written as one test per promotion the
bundle must stay incapable of: a public profile becoming publication rights, a
placeholder becoming a verified fact, a rights declaration without bytes
becoming an ingested asset, "founded 2020" becoming an incorporation date, an
unsupplied qualification becoming a published claim, and a preferred domain
becoming an owned one.

### What is deliberately not claimed

The owner granted prototype rights over the MGB logo and two project
photographs. **The files were never handed over.** The rights decision is
recorded, and nothing else is: no asset is marked approved, no hash is invented,
`assetStatus` and `publishUseAllowed` stay off, and the run ingested nothing. A
rights declaration is not an asset. `trust` is left unanswered on the same
principle that left it unanswered for nbm — trial finding F23 — and
`project.siteUrl` is unset, so the build asserts no canonical address for a
domain nobody owns.

### What the questionnaire could not record

Seven gaps are kept in `intake.feedback` rather than being dropped or invented
around, because principle 8 asks intake to propose versioned changes rather than
rewrite itself. The ones a second local-service business would hit again:

- **WhatsApp** is the owner's named secondary conversion and `conversion` has no
  option for it, so it is recorded as `other` and composition drops it with
  `declared-conversion-unsupported:other`.
- **Insurance status** is the single genuine trust fact MGB has, and `trust`
  offers only testimonials, accreditations, case studies, project photos, awards
  and client logos — all of which would be false here.
- **Social profiles.** `project-manifest.schema.json` models
  `company.socialProfiles` and composition already binds them as a first-class
  contact route, its own comment noting that linking to a public profile is not
  republishing it. No questionnaire answer and no Manifest builder populates the
  field, so a business whose only web presence is Instagram cannot link to it.
- **Photographs on a quote request**, which is the most useful thing a
  decorating enquiry can carry. Enabling `uploads` moves a marketing site onto
  the application renderer under `config/renderers.json`, so the requirement is
  real, unmet, and recorded rather than silently enabled or silently dropped.
