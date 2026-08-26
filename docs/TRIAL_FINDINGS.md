# Real-business trial findings

Running record of what actual business trials expose. Each entry is evidence for
the Phase 3.8E product gate and for the Phase 8 factory-improvement programme.

A finding belongs here when a real trial produced it. Speculative quality ideas
belong in `docs/VISUAL_EXCELLENCE.md` instead.

## Trial 1 — MGB Decor (painting and decorating, Glasgow)

**Status:** dry run. Does not satisfy Phase 3.8E: no user-supplied company asset
was ingested and no human product review has been recorded.

**Inputs available:** trading name, trade, city, and two social profile URLs
(Facebook, Instagram). No website, no documents, no photos, no logo, no contact
details. Services, page structure and the goal line were operator decisions
recorded as manifest-origin bindings, not source-backed facts.

**Result:** generated, installed, typechecked, production-built and previewed
without intervention. Four pages, twelve sections, two composition warnings
(`knowledge-pack-not-provided`, `missing-contact-details`).

The deterministic pipeline behaved correctly throughout. Every finding below is
in the composer or the template — what gets published on top of it.

### F1 — Build Contract internals published as customer-facing copy — P0 ✅ Fixed

Three separate leaks of specification into the rendered site:

- every page hero carries an eyebrow containing the project *type*, so a
  decorator's homepage is captioned "MARKETING SITE";
- the homepage renders `manifest.journeys` as a section titled "What you can
  do", publishing internal acceptance items — "Understand what MGB Decor does"
  — as if they were website copy;
- the footer shows `design.label`, the installed recipe count and the
  composition warning count.

Journeys are visitor *intents* for a marketing site, not site features. They
remain legitimate content for application project types, where a journey really
does describe something the product lets a user do.

### F2 — Primary action can link to the page it is on — P0 ✅ Fixed

`primaryAction` resolves a contact-type surface to `/contact` for the whole
project, and the action is attached to every page including `/contact` itself.
The contact page therefore shipped a "Request a quote" button whose href is the
current page. This is wrong independently of what content is missing.

### F3 — A contact page with no contact details ships as a dead end — P1 ✅ Fixed

With no email, phone or address, `contactSection` returns null and the page
degrades to a hero alone: a heading, the filler line "Contact for MGB Decor.",
and (per F2) a button to itself. The composer warns `missing-contact-details`
and then publishes the page anyway.

The `lead-generation` module was enabled and contributed no contact route, which
is worth revisiting separately: an enquiry form is the obvious answer for a
business whose contact details are not yet known.

### F4 — No route from a business's social presence to its website — P1 ✅ Fixed

Recorded before the run and confirmed by it. `company.contactDetails` is an open
string map so a profile URL survives into the manifest, but `contactBindings`
hardcodes `['email', 'phone', 'address']` and silently drops everything else.
`company-profile.schema.json` is stricter still — `contact` allows only email,
phone, website and address under `additionalProperties: false` — so the
knowledge pack cannot hold a social profile at all. Intake never asks for one.

For a trade whose entire portfolio lives on Instagram, this is the most
important link on the site.

### F5 — Cards render empty; single-value lists render as cards — P2 ✅ Fixed

Services arrive as `[{ name }]` with no description, so the template renders
three tall cards containing a title and nothing else. `location-list` falls
through to the generic item grid, so a single service area renders as one large
card containing the word "Glasgow".

### F6 — No imagery, and nothing that asks for it — P1 ✅ Fixed

The generated site contains no images. For a portfolio trade this alone makes it
unlaunchable, and the composer neither warns about it nor reserves a place for
it. Section specs carry `assetIds`, but nothing populates them and nothing
notices when they are empty for a business class that plainly needs pictures.

### F7 — Social-only businesses cannot be ingested through an authorised path — P1 ⚠️ Mitigated, not solved

MGB Decor's only web presence is Facebook and Instagram. Both are login-walled
to unauthenticated requests, and `docs/ROADMAP.md` 3.8G correctly rules out
platform-bypass scraping. There is no authorised connector, so a business in
this position can contribute nothing through the crawl path — the operator must
supply everything by hand.

This is common among small trades and should shape Phase 4B: an authorised
connector or a guided manual-import flow, not a scraper.

### F8 — Section heading repeats the page heading — P2 ✅ Fixed

Only visible once F3 was fixed and the contact panel actually rendered: the
contact page showed "Contact" as the page heading and again as the section
heading directly beneath it. `/services` had the same duplication. Non-hero
sections now drop a title that repeats the page's own heading, keeping their
identity and content.

A defect that only appears once an earlier one is fixed is worth noting as a
pattern: the empty-state path had been hiding it.

### F9 — Ingestion could not record that an asset is stock or generated — P1 ✅ Fixed

Uploads were hardcoded to `provenance: 'user-supplied'`. Placeholder or stock
imagery therefore became indistinguishable from a photograph of the business's
own work the moment it entered the knowledge pack — the exact confusion the
governance rules exist to prevent. Ingestion now accepts a declared provenance.

## Fixes applied after trial 1

- hero eyebrow carrying the project type: removed;
- journeys rendered as published copy: suppressed for marketing and content
  sites, retained for application types where a journey is a real feature;
- factory diagnostics in the footer: moved behind `import.meta.env.DEV`, and the
  published footer now carries company name, service areas, contact routes,
  social links, footer navigation and a copyright line;
- primary action pointing at the current page: dropped for that page;
- journey-derived `#next` action fallback: removed, it was never a destination;
- `contactBindings` field allowlist: `website` added, social profiles added as a
  first-class contact route through `company.socialProfiles` in the manifest and
  `companyProfile.socialProfiles` in the knowledge pack;
- social profile links found in extracted HTML now become
  `contact.social.<platform>` facts, so a business site's own footer links
  populate the profile;
- name-only item lists render as inline chips instead of tall empty cards;
- imagery pipeline: the composer places approved assets on the hero and in a
  gallery section, the generator copies the placed variants into the generated
  repository's `public/assets/` with a typed asset manifest, and the template
  renders them as `<picture>` with responsive `srcset` and the existing
  hero/card/square crops. Only assets with `publishUseAllowed` are placed, so
  rights state decides what reaches the site;
- ingestion accepts a declared provenance, so stock and generated imagery stay
  labelled as such through the pack, the composition and the rendered `<img>`
  (`data-asset-provenance`);
- where a business keeps its portfolio on social media, the gallery links out to
  it rather than implying the few images on the site are the whole body of work;
- external actions render with `target="_blank"` and `rel="noopener noreferrer"`;
- `no-imagery-available` warning replaced with `no-publishable-imagery`, which
  reflects what can actually be shown rather than what happens to be stored.

The Acme regression fixture supplied a logo and a project photo without
approving either, so it had no publishable imagery and the new warning fired.
The fixture now approves them, which is what a business supplying its own logo
would do, and CI exercises the imagery path as a result.

The knowledge-pack half of F4 has a producer — extraction — but no trial has
exercised it yet, because MGB Decor has no website to extract from.

### F10 — The neutral template is flat, not merely unbranded — P1 ⚠️ Baseline raised

Reviewer verdict on the first image-bearing build: "too flat and generic". The
complaint was fair and the cause was structural rather than a matter of taste.

The token set held one accent and one border colour with no tints, no type
scale and no elevation range, so every component reached for the same three
values. Every section carried identical padding and a hairline rule beneath it,
which gave the page no tempo: hero, section, section, section, all weighted the
same. The heading scale topped out at `7rem`, shouting at content that never
justified it.

"Neutral" is the template's job — it must not invent a brand it has not been
given. Flat is not the same thing, and the two had been conflated.

Raised the baseline: a real type scale, accent tints derived through
`color-mix` so a supplied brand accent carries into every tinted surface,
alternating section grounds in place of hairline rules, a dark closing
call-to-action band, accent-ruled service cards, image hover treatment and a
reduced-motion block.

This is a better floor, not the answer. Multiple art directions, brand-derived
palettes and the promote/reject variant flow remain Phase 4C/4D, and no amount
of template polish substitutes for real photographs.

### F11 — Deterministic accessibility gate caught a design regression — no action

Worth recording as evidence rather than a defect. The section-rhythm rule used
`:nth-of-type(even)`, which outspecified the closing call-to-action's own
background and left white text on a tinted ground. The axe gate failed the
`/services` route with `serious: color-contrast` before the change went any
further.

That is the Phase 3.8D gate paying for itself on the first design change made
after it landed, and an argument for keeping deterministic checks ahead of
visual review rather than behind it.

### F12 — The owner's objective was published as visitor-facing copy — P0 ✅ Fixed

The same class as F1 and missed on the first pass. `projectDescriptionBinding`
fell back to `manifest.project.primaryGoal`, so the homepage lede read "Win
local painting and decorating enquiries in Glasgow" — what the owner wants from
the site, presented to visitors as though it described the business. The closing
call to action published it a second time under the heading "Next step".

Nothing may publish `primaryGoal` now. Where no description exists, a sentence
is assembled from services and service areas the manifest already asserts
("Interior painting, exterior painting and wallpapering in Glasgow"), marked as
a deterministic default and claiming nothing beyond what was declared. The
closing action is named from the conversion intent instead — "Get a quote".

Secondary pages no longer carry filler bodies. "Work for MGB Decor." said
nothing the heading had not already said.

A regression test asserts `primaryGoal` appears nowhere in a composition.

### F13 — An installed capability could not contribute a section — P1 ✅ Fixed

The `lead-generation` recipe ships a working Netlify-backed enquiry form, and
the module was enabled on this project, but nothing rendered it: the recipe
registry supported `setup`, `Provider` and `Gate`, with no way for a capability
to own a piece of the page. A business with no published phone or email
therefore had no contact route at all.

Recipes can now export a `sections` map of section type to component. The
composer decides an `enquiry-form` section belongs on contact surfaces where the
capability is installed; the recipe that owns the capability decides how it
looks. That is the capability/presentation registry seam Phase 4C describes, in
miniature, and it is the mechanism later presentation work should build on.

### F14 — A declared contract family was never enforced — P0 ✅ Fixed

Found while starting Phase 4B. `composition` had been a declared contract family
since the registry was created, and its boundary was recorded as "composer
output and generated `.app-builder/composition.json` reads" — but nothing
validated against it. The `gallery` and `enquiry-form` section types added
during this trial were never added to `section-spec.schema.json`, so every
generated project since had shipped a composition that violated its own
contract, silently.

Declaring a family is not enforcement. `generateComposedProject` now asserts the
composition before writing it as an artifact, and a test composes all six
canonical project types and validates each one.

### Edit-count estimate

Roughly eleven meaningful edits at first build, against the Phase 3.8E target of
fewer than twenty — before real content arrives, which normally adds more.

After the fixes above, the remaining blockers on this input are real
photographs, real contact details, and the generic visual treatment that Phase
4C/4D exists to address. A rebuild with four deterministic placeholder images
produced zero composition warnings. The count is not a Phase 3.8E result: no company asset was ingested
and no human review was recorded.

## Trial 2 — nbm Construction Cost Consultants (quantity surveying, Glasgow/Edinburgh)

**Status:** in progress. Does not yet satisfy Phase 3.8E. The public website
could not be ingested (see F20), so the run has one approved source rather than
the website-plus-supplied-material the gate requires, and no human product
review has been recorded.

**Inputs available:** an operator-authored workbook approved by the owner for
this exercise, carrying verified public register facts (legal name, company
number SC228801, status, registered office, principal activity), the public
service lines, the Glasgow and Edinburgh offices, and the owner's acceptance
intent. The public website at `https://www.nbm.bz/` was declared as a
reference-only source; its photographs, logo and staff images were never
approved for republication.

**First build:** 7 pages, 23 sections, one composition warning
(`no-publishable-imagery`). It installed, checked, production-built and
previewed without intervention, and rendered evidence captured 24 pictures
across desktop, tablet and mobile.

**Launch readiness at handover:** 29 predicted manual edits, `launchable: false`,
6 blockers, 23 majors, 49 evidence gaps.

That number was wrong, and finding out why is the most valuable thing this trial
has produced so far.

### F15 — Every list binding was reported as an empty hole — P0 ✅ Fixed

`auditContent` read each binding through a helper that returned `''` for
anything that was not a string. `item-grid.items`, `location-list.items` and
`proof-grid.items` are arrays of records, so all six of the build's populated
lists — the four service cards, the two offices — were reported as blockers.
Every blocker in the report was false, and `launchable: false` was false with
them.

The same helper fed the placeholder and generated-claim checks, so placeholder
copy sitting inside a list item was invisible to both.

Bindings are now flattened into the text a visitor would actually read before
any check looks at them, and only genuine emptiness is emptiness.

### F16 — Three section-role sets named types the composer cannot emit — P0 ✅ Fixed

The audit carried three hardcoded sets of section types. Measured against the
`type` enum in `section-spec.schema.json`:

- `CLAIM_SECTIONS` was `proof`, `stats`, `testimonial`, `trust`, `pricing`,
  `faq` — **not one of them is a real section type**, so
  `generated-claim-without-source`, the check that exists to stop invented
  claims reaching a client's website, had never fired in production;
- `VISUAL_SECTIONS` carried four dead entries alongside two real ones;
- `CONVERSION_SECTIONS` missed `contact-panel`, the section that actually holds
  a business's phone number and address.

Its unit test passed because the test built a fixture section of type `proof` —
a type no composition may contain. The rule worked perfectly on a fixture that
could not exist.

This is the Phase 4B lesson again: configuration that reads well and matches
nothing. The sets now live in `config/launch-readiness-rules.json` as
`sectionRoles`, every entry is checked against the section-type contract, an
unknown type throws rather than quietly disabling its rule, and a test asserts
the audit's vocabulary equals the schema's.

### F17 — A phone number was audited as a missing page — P0 ✅ Fixed

The composer derives `{ label: 'Call', href: 'tel:01413331836' }` from the
conversion goals. `deriveJourneys` then treated that href as an internal route,
looked for a page serving `tel:01413331836`, found none, and reported the
destination unproven and the capture surface missing — on all seven pages.
Fourteen of the twenty-three majors were findings no edit could ever fix.

A `tel:`, `mailto:` or `sms:` action is a conversion, not a route: its
destination is the visitor's own dialler or mail client and the call is the
capture. An absolute URL leaves the site and cannot be proven from composition
at all. Action targets are now classified, and the steps a direct-contact
journey can never have — field validation, an observable success state — are not
emitted rather than being recorded as evidence gaps that nothing could close.

### F18 — Two pages shipped with nothing on them, and no check saw it — P1 ✅ Fixed

`/projects` and `/careers` were composed as a page title, a Call button and the
same closing call to action every other page carried. Both sat in the main
navigation. Every binding on them resolved, so no existing check had anything to
say about them, while the audit was busy reporting six lists that were fine.

A new `content-less-page` check names a surface whose sections are chrome only.
Two behaviours follow from it, and they are deliberately different:

- a surface **the operator declared** is still published. It is their intent and
  the factory does not get to overrule it; the finding tells them the content
  gap is theirs to fill.
- a surface **the factory proposed for itself** and then could not fill is not
  published at all, and is reported as `unfillable-surface`. Shipping it would
  put a hole in the navigation of every generated site whose sources are thin.

The canonical content-site fixture had been shipping `/content-index` and
`/content-detail` this way since it was created.

### F19 — Predicted edits, before and after

Measured over the same unchanged canonical output:

| project type | before | after |
| --- | --- | --- |
| marketing-site | 10 | 8 |
| b2b-saas | 13 | 6 |
| consumer-app | 15 | 7 |
| internal-tool | 15 | 7 |
| content-site | 8 | 5 |
| ai-app | 15 | 7 |

The NBM build itself went from 29 predicted edits to 11, and from
`launchable: false` to `launchable: true`, without a single change to what the
factory produced for it. Ceilings in `config/factory-benchmarks.json` are
lowered to the new measurements.

The lesson is not that the factory improved by 18 edits. It is that a gate
nobody had measured against real output was reporting a number that could not be
trusted in either direction: it invented twenty defects and missed two.

### F20 — The public website could not be ingested — environment blocker

`POST /projects/:id/sources` with `https://www.nbm.bz/` failed: the session's
egress policy denies every public host at the gateway, so the deterministic
crawler cannot reach the site. The same denial applies to the Companies House
register and to out-of-band fetch tooling.

No website source was fabricated and no hash was invented. Phase 3.8E requires a
real public company website as an input source, so the gate stays open until the
crawl can run.

### F21 — The one source format businesses actually supply was nearly opaque — P0 ✅ Fixed

Phase 3.8E asks for "a genuine user-supplied company document, logo, image or
spreadsheet". The trial supplied an owner-approved workbook carrying the legal
name, company number, registered office, principal activity, website, telephone,
both offices, the four service lines and the owner's acceptance brief.

The knowledge pack extracted **one fact** from it: a phone number, found by a
regex sweeping the flattened text, recorded at confidence 0.82 as a `candidate`.
`companyProfile.identity.name` was `null`.

The only structured company path was `structuredCompany`, which reads a JSON
document shaped like `{ company: { name, legalName, services, ... } }`. No
business has ever handed anyone that file. Spreadsheets were read by a single
rule that looked for a column headed `service`, `services`, `product` or
`offering` and took the name out of it — nothing else in a workbook could reach
the site.

So every identity and contact fact on the generated site came from the intake
answers as unsourced `manifest`-origin bindings, and a real handover would have
meant retyping them.

Spreadsheets and CSVs are now read properly:

- a two-column fact sheet (`Field`/`Value` and their synonyms) contributes
  company identity, description and contact facts;
- tables of services, projects, people, accreditations and testimonials become
  entities, with their descriptions, locations, sectors, roles and issuers;
- office and location tables contribute service areas, and the address or phone
  an office row carries;
- what an operator wrote down is `user-provided` at confidence 1, not a regex
  candidate. The same sheet found on a crawled site stays a `candidate`.

Everything is a closed allowlist. An unrecognised row label or column heading
contributes nothing: guessing that a column headed "Notes" is the company
description would put unverified text on a client's website. The workbook's
"Item / Intent" acceptance brief yields no facts at all, which is the point —
the owner's brief for the factory is not copy for the site.

The nbm workbook now yields 7 facts, all `user-provided`. The hero title,
locations, phone, address and website moved from `manifest` origin to
`knowledge-fact`.

### F22 — An unreachable source was reported as an internal factory failure — P1 ✅ Fixed

`POST /projects/:id/sources` returned `500 request-failed` when the crawler
could not reach the site. A source the operator named that the network cannot
reach is a condition they have to see and act on, not a fault to hide behind an
internal error. Every remote-source failure the crawler can raise is now a `400`
carrying the reason, and the classifier is exported and tested rather than being
an inline list nobody could check.
