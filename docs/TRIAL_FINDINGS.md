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

### Edit-count estimate

Roughly eleven meaningful edits at first build, against the Phase 3.8E target of
fewer than twenty — before real content arrives, which normally adds more.

After the fixes above, the remaining blockers on this input are real
photographs, real contact details, and the generic visual treatment that Phase
4C/4D exists to address. A rebuild with four deterministic placeholder images
produced zero composition warnings. The count is not a Phase 3.8E result: no company asset was ingested
and no human review was recorded.
