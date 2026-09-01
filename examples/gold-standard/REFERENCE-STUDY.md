# Reference study

Five quality references, studied for *mechanisms* rather than appearance. Nothing here is
copied: no brand, text, layout coordinates, artwork, identity or code. What is recorded is
how each site makes its decisions, so the prototypes can make decisions of the same **kind**.

Each was read from shipped markup and CSS where reachable, so figures are measured rather
than estimated. Where something could not be verified it says so.

---

## A · Kononenko Architectural Bureau — premium architecture / portfolio

**Primary argument.** *A bureau with a system, not a gallery.* Delivered without a headline
claim: the hero pairs the name with a two-word positioning line, then immediately gives hard
credentialing facts — founding year, founder, service list — as a labelled data block, before
any imagery.

**The counter-intuitive move, and the most important one.** The home page carries **two
photographs** against roughly twenty-six typographic blocks. Photography is *rationed* on
home so the argument reads as method; the portfolio is discharged on `/work` and on project
pages, where images run full-bleed. A photography-led practice does not mean a
photography-led home page.

**Information architecture.** Four routes: `/`, `/work`, `/about`, `/contact`, plus
`/work/<slug>`. No blog, no services route, no team route — the team lives inside About.
`/work` holds ten projects; home previews eight; **mobile home truncates to six**. Depth is
deferred consistently: awards are listed on home and expanded on About. Project pages end
with **"next work"**, not a return to the index.

**Measurement system.** `:root { font-size: 0.052vw }` on desktop and `0.267vw` below 768px,
so `1rem` equals one pixel at a 1920 design frame and one pixel at a 375 frame. **One
breakpoint. No max-width container anywhere.** The whole site scales fluidly, and layout can
therefore be authored in absolute design-frame units without ever being fixed-width.

**Type.** Two families, one weight each — a grotesque for everything functional, a serif for
every heading. Desktop scale runs 400 / 175 / 118 / 80 / 40 against a 16px body: **a 25:1
ratio between largest and body**. Headings carry `letter-spacing: -0.03em` and **sub-1
line-heights** (h2 at 0.7). The largest size is reserved and never used in the shipped page.

**Grid.** `repeat(15, 1fr)`. An odd column count is the mechanism: it makes easy halves and
thirds impossible and forces asymmetric anchoring. Footer labels sit at columns 4, 8, 11, 14
with their values one column later, and columns 1–3 left empty.

**Colour.** Six tokens: black, white, and four greys. **No accent colour at all.** Sections
invert wholesale rather than tint.

**Navigation.** Fixed, no bar, no background, `mix-blend-mode: difference` — it inverts
against whatever scrolls beneath it.

**Rhythm.** Section margins of 220px top and bottom on desktop compressing to 60px on mobile —
a 3.7× compression, not a proportional scale.

**The work index — the answer to "not a card grid".** A hand-specified ten-item rhythm, with
`/work` holding exactly ten projects so one full cycle plays with no repeat visible. Three
widths (4, 6 and 7 of 15 columns), three heights (500, 540, 700), and nine distinct vertical
offsets **including a negative one**. Nothing shares a baseline; there are no rows. Entries
also carry unequal metadata — project areas range from 334 m² to 58,079 m².

**Motion.** A single token: 1.109s with a `cubic-bezier(0.17, 0.84, 0.44, 1)`, used for 21 of
22 transitions.

**Refusals.** No contact form (three email/phone pairs and two addresses, nothing else). No
testimonials, no pricing, no blog, no breadcrumbs, no back-to-top, no pagination, no badges,
no gradients, no shadows, no rounded corners, no second accent, no second font weight, no
hero CTA button. Feature flags in the bundle explicitly disable a custom cursor, a styled
scrollbar and a cookie banner.

**Mobile recomposition.** The 15-column grid is **abandoned, not collapsed** — `display: grid`
becomes `display: flex`, and the index's hand-placed geometry is nulled to a single column at
one uniform image height. Images carry a separate mobile aspect-ratio property, so crops are
authored per breakpoint rather than scaled. The hero renders at **150vw on mobile** —
deliberately over-cropped rather than letterboxed. Hierarchy re-weights rather than shrinking:
h1 halves (400→200) while h2 falls 4.4× (175→40), so the h1:h2 ratio moves from 2.3:1 to 5:1.
One voice stays huge and everything else compresses.

*Unverified: the serif family's name; the footer reveal mechanism.*

---

## B · Linear — premium SaaS / product storytelling

**The product is live DOM, not screenshots.** The home page carries 219 inline `<svg>` and 38
`<img>`, of which two are large panels and the rest are 14–36px avatars and logos. Fake issue
rows are real interactive elements with SVG status rings coloured by CSS custom properties.
**This is the single most important finding for a synthetic product**: a believable interface
can be rendered from a JSON array, with selectable text.

**The artefact vocabulary is named in the stylesheet** — hero panel assets in one-, two- and
three-panel variants, issue card, issue list view, timeline, code diff, command menu, keyboard
key, flow diagram, side panel, notification, toast, status page. A scale ladder runs from
three-panel hero, to single panel, to a *cropped fragment* — one row, one card — set inline
beside body copy.

**A second register for system claims.** Three numbered "Fig 0.1 / 0.2 / 0.3" isometric SVG
diagrams, which read as engineering documentation rather than marketing illustration.

**Type.** One variable family, weights 300–680 including an unusual 510. Title scale runs
1.06→4.5rem across nine steps; body 0.625→1.06rem across six. Hero-to-body ratio ≈ 4.2:1 —
*six times tighter than Kononenko's 25:1*, which is the difference between a product site and
a portfolio.

**Depth without shadows.** Hairline borders at 1px dropping to **0.5px at ≥2dppx**, a surface
ladder, and a 256px tiled noise texture at `mix-blend-mode: overlay`. Edge highlights are
radial-gradient *masks* on a border so only one corner catches light; gradient borders use
`mask-composite: exclude`.

**Motion explains sequence.** A `--index` custom property is used 477 times and a lift-delay
20 times: motion is stagger that shows rows arriving in order, not decoration. Two speeds
(0.1s and 0.25s), 24 named easings, `prefers-reduced-motion` guarded, no parallax, no
scroll-jacking, no canvas.

**Grid and rhythm.** 12 columns → 8 at ≤768 → 4 at ≤640, 32px gap, named `grid-template-areas`
swapped per breakpoint. Section padding 128px → 96/48 → **0 at ≤640**, with spacing handed to
an explicit spacer component.

**Refusals.** No FAQ accordion, no pricing imagery, no stock photography, no mascots, no
autoplay hero video, no "trusted by" above the fold, no chat widget, no shadows, no second
type family, no more than one accent hue. Thought leadership is a bare typographic document
with zero images.

**Mobile recomposition — three distinct mechanisms.** (1) **DOM swap**: paired hide/show
subtrees, 43 and 27 on the home page; the heavy code-diff stage is replaced by a flattened
390×312 raster rather than shrunk. (2) **Order inversion**: `flex-direction: column-reverse`
moves the artefact above the prose. (3) **Grid becomes carousel**: a 3-up becomes a
horizontally scrollable strip at 230px items.

*Unverified: scroll-trigger implementation; whether pillar-page video is recorded or rendered.*

---

## C · Aesop — premium commerce / large information architecture

**Primary argument.** *Formulation, not beauty.* The device is a catalogue-page vocabulary
applied to a shop: every product card carries a clinical suitability line rather than a
benefit claim, and the product page publishes the full ingredient list.

**The curation numbers, which are the whole lesson.** 158 products. **Twelve appear on the
home page — 7.6%.** Six of those twelve are *bundles* (composites of 2–3 products), one is a
single campaign hero, and the remaining five are one range presented as a **regimen sequence
in use order**, not a grid. The only product grid on the home page is of bundles, so no
individual product is ever placed in a beauty contest against another.

**The navigation carries the catalogue, not the page.** One department's flyout exposes **four
orthogonal taxonomies** — category, concern, type, ingredient — 23 links in total. Sixty
products become reachable four different ways without any of them being listed. Roughly 31
products are hard-linked across the whole mega-nav, always in capped editorial lists of four
to six under headings like "new additions" and "notable formulations". Everything else is
discoverable only through a listing page or a filter. **Nothing is ranked by bestseller.**

**Five further curation mechanisms.** Finder questionnaires substitute for browsing. A library
of 61 articles gives product families a non-transactional route, with read-times and genre
labels. Campaign landing pages absorb promotional pressure so the home page runs one campaign
rather than ten. Listing pages render 16 tiles and lazy-load the rest. Cross-sell is *argued* —
each suggestion carries its own rationale heading — rather than algorithmically listed.

**Product page order.** Breadcrumb, category eyebrow, name, price, stock state, one-sentence
summary, gallery of **two images** (bottle front, bottle back label), suitability line, size,
purchase mode, add to cart, a four-item quick-add strip, then accordions, then a *second*
cross-sell in argued long form. Description, ingredients and recycling are all deferred behind
three tabs.

**Image discipline.** Product photography is composited on one fixed off-white across every
listing and product page. Imagery is packshot-only — front, back label, texture macro — with
lifestyle photography quarantined into campaign slices and category tiles.

**Refusals.** No bestseller grid, no star ratings on listing cards, no countdowns or stock
scarcity, no discount banners or struck-through prices, no percentage-off badges (badges are
editorial nouns instead), no testimonials, no newsletter modal, no press logo wall, no product
counts on category tiles.

**Mobile.** Genuine art direction: the hero ships as **separate 1920×960 and 1080×1920
assets**, not one image scaled. Filters change from a persistent panel to shortcut chips plus
a drawer, and the mobile nav is **shortened to seven items** — four departments are dropped.

---

## D · AI in Design Report 2026 (stateofaidesign.com) — editorial / research / data story

**The landing hero is a title card only** — title, subtitle, byline, "scroll to read". No
statistics, no CTA row. The headline finding arrives one screen down as a labelled
proposition, and it is **prose, not a number**: an eyebrow plus two sentences contrasting last
year with this one. The only numbers on the landing size the *evidence base* (900+ responses,
25+ interviews), not the claim. **Authority is established before assertion.**

**Chapter blocks are prospectuses, not cards.** Each carries a number, a one-word name, a
title, a ~60-word abstract, a literal "in this chapter, we'll cover:" list of five items, and
a read link with a stated reading time. A visitor can decide whether to read *before*
entering.

**The contents index is also a figure index.** Sections emit a table-of-contents attribute,
and — the mechanism worth stealing — **every chart wrapper emits its own title into the same
index**, so nine named charts appear in the contents alongside the prose sections.

**The unit of a hero statistic** is number + what it measures + what it changed from:
*91% / use AI weekly / up from 54% in 2025*, set at 85px with line-height 1.0. **Never a bare
number.** Counters animate once, at 60% visibility.

**Measure by empty column.** Prose occupies six of twelve columns with an **empty,
pointer-events-none five-column spacer to its left** — a ~65-character measure held by a
permanent wide left margin rather than by centring.

**Colour is one system for three jobs.** Seven tokens, of which the orange is simultaneously
the link colour *and* the primary data series, with lilac and slate as secondary series. Data,
navigation and callout grounds share one palette, so colour never reads as decoration.

**Refusals.** No PDF, no gate, no stat-card row, no logo wall, no testimonials, no sticky
progress bar, no dark mode, no search, no share buttons, no author bios. And decisively:
**no pie, donut, line or area charts at all.** The authored system is twelve types, every one
in the bar/block family.

**Three magnitudes of data mark, on one page.** Inline row-bars at 16px (116 of them, carrying
delta labels like "+18pts"), year-pair comparisons at 72px, and full charts at ~410px. **Most
evidence is inline and small, so a full-scale chart is rare enough to signal importance.**

**Mobile: charts grow downward rather than compress.** Height is computed as rows × pitch, and
the pitch drops from 136px to 115px below 520px — so a chart gets *taller*, never narrower. No
rotation, no horizontal scroll, no table fallback. One chart type has a dedicated mobile-only
render branch — a genuinely different chart below 520px.

**How density becomes intelligence.** The register changes roughly every screen and each
register has a fixed, repeated shape: section heads written as findings ("1. Half of surveyed
designers have shipped code"); prose in the offset column; "in practice" callouts; named
sidebars; attributed quotes distinguished from anonymous ones tagged only by company stage;
dated field evidence; then a fixed chapter coda — open questions, numbered key takeaways,
further reading that includes competitors' work. Bars grow from zero over 900ms with an 80ms
per-row stagger, once — motion marks *arrival at evidence* and nothing else.

*Unverified: rendered appearance, chapter-transition motion, case-study routes (404).*

---

## E · Aman — luxury hospitality / image-led

**Label delay.** A property page opens with a full-bleed autoplaying video carrying **no text
overlaid on it at all**. The name arrives *after* the image, in a centred stack beneath it:
place eyebrow, then title, then one 85-word paragraph. You are made to feel the place before
you are told what it is.

**Transactional distance, measured in DOM order.** A single "reserve" link sits in the header
at 4% of the markup. The next transactional element appears at **72%**, and the reservation
block at **88%**. The words "per night", "from $", "availability" and "check-in" appear
**zero times**.

**No comparison affordances, deliberately.** Thirty-six properties are listed in exactly three
geographic groups with country sub-heads — **zero filters, zero sort, zero map, zero search**.
You cannot evaluate; you can only want. Choosing is reframed as a conversation: the contact
route is a concierge page with a phone number and a 24/7 team, not a checkout.

**Ratio: 83 images to ~1,279 words** on a property page. Body copy is capped at 420–460px —
55 to 65 characters — and centred, so **text reads as a caption to imagery, never as a column**.

**Bimodal type.** Eyebrows at 10.1px uppercase with 0.2em tracking; navigation at 13px; body
at 15px; and the property title alone at **72px/80px**. One big serif word, everything else
deliberately tiny.

**Crop discipline is the identity.** The gallery permits **exactly three ratios — 1.62:1, 1:1
and 0.76:1 — and each image holds its ratio identically at every breakpoint.** Variety comes
from *sequencing* three fixed ratios, not from arbitrary sizing. Card components are
ratio-locked globally.

**Palette.** White and a warm oat ground; text at #313131 rather than black; three muted
accents. Red exists only for form errors.

**Motion that signals unhurriedness.** The nav hover is a 1px underline with a **0.3s delay
before a 0.3s transition** — slow on purpose. Durations sit at 0.2–0.4s with one expressive
easing, and **30+ rules are gated behind `prefers-reduced-motion`**. Nothing parallaxes and
nothing counts up.

**Mobile.** Below 480px the landscape hero video is hidden by CSS and a **separately shot
portrait asset** is shown at a 1:1.32 ratio, bled edge-to-edge with a negative margin
cancelling the page gutter. Every content image ships five art-directed crops plus 2×
variants. Navigation swaps to a **property-scoped menu**, bypassing the global one entirely —
a decision made because direct traffic lands on property pages, not on home.

**Identity within one system.** Property differentiation is carried **entirely by photography
and prose — never by layout or type**. Every property uses the same components, the same three
ratios, the same title size. The only structural variance is which optional sections a
property declares, and its scoped sub-nav. Sub-brands *do* get their own theme classes,
proving the system can diverge and that properties deliberately do not.

**Section rhythm.** Kicker → serif title → one sentence → one text link, repeated — where a
generic site would place a card grid.

*Unverified: colour grading; rendered scroll depth.*

---

## What all five agree on

Worth stating because it is the design of the programme, not a coincidence:

1. **The home page is not the site.** All three ration what home carries — two photographs,
   one artefact per pillar, 7.6% of the catalogue — and discharge depth on routes built for it.
   The factory currently renders 3 of 12 projects with no affordance saying twelve exist
   (`FACTORY-MACHINERY-MAP.md` §2), which is the same arithmetic reached by accident instead
   of by decision.
2. **The collection is never a uniform grid.** Kononenko hand-specifies nine offsets and three
   sizes; Aesop sequences products in use order under argued headings and grids only bundles;
   Linear runs a scale ladder from three-panel to cropped fragment. **In none of the three does
   a collection render as N equal cells** — which is precisely what all three Gold Reference
   prototypes did.
3. **Mobile is authored, not derived.** Separate assets at different aspect ratios, DOM
   swapped for a flattened raster, a grid abandoned for flex, a nav shortened by four items.
   None of it is expressible by reordering sections and scaling spacing by 0.7.
4. **Refusal lists are long and specific.** Each site's identity is carried as much by a
   dozen named omissions as by anything it renders. Aman's refusals are the most extreme —
   no price, no filter, no rating, no sort, no map on a 36-item index — and they are the
   reason it cannot be compared, only wanted.
5. **The largest type is reserved and rare.** Kononenko's 400px h1 never ships. Aman uses one
   72px word against 10px eyebrows. The report keeps full-scale charts rare so they signal
   importance. In every case the top of the scale is protected by how little it is used.
6. **A fixed small vocabulary beats free choice.** Aman permits exactly three image ratios and
   sequences them. The report bans four chart families and authors twelve. Kononenko uses six
   colour tokens and one motion duration. **Constraint is the mechanism, not the limitation** —
   which is a direct argument about what the factory's own vocabulary should look like once it
   is wider: not unlimited, but chosen.
