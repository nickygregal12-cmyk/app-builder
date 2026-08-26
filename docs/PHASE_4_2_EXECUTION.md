# Phase 4.2A — Static renderer foundation

## The problem, measured

Until this stage the factory had one architectural output. Every project type —
a five-page cost consultancy and a multi-tenant SaaS console alike — resolved
through `config/templates.json` to the same React/Vite template. Generating the
canonical marketing site and building it gave:

```
4 routes composed:  /, /about, /contact, /404
1 HTML file shipped: dist/index.html — 450 bytes
  <title>Generated application</title>, <div id="root"></div>, no content
JS: 212,353 bytes (66.66 kB gzip)
```

On a static host `/about` was not a document. Every route's title and
description were written by JavaScript after the application booted, so a
crawler, a link preview and a reader-mode parser all saw the template's
placeholder title. The sitemap listed one URL, truthfully: one document was all
the build published.

Astro did not have to be fashionable to be worth adopting. It had to beat that.

## What this stage added

A renderer seam, and a second renderer behind it.

    approved product truth
        -> Manifest / KnowledgePack
        -> Composition -> PageSpec / SectionSpec
        -> DesignSystemSpec / BrandSpec / ArtDirectionPlan /
           ResponsiveCompositionPlan / MotionContract / Presentation Registry
        -> renderer selection
             |- static-content   marketing / content
             '- application      SaaS / consumer / internal / AI
        -> portable generated repository

`config/renderers.json` is the registry; `tooling/lib/renderer-selection.mjs` is
the selection. It reads the project type and the enabled modules and nothing
else — no prompt, no model, no free text — so one approved truth always reaches
one renderer.

| project type | renderer | template |
| --- | --- | --- |
| `marketing-site` | `static-content` | `astro-static-content` |
| `content-site` | `static-content` | `astro-static-content` |
| `b2b-saas` | `application` | `react-vite-neutral` |
| `consumer-app` | `application` | `react-vite-neutral` |
| `internal-tool` | `application` | `react-vite-neutral` |
| `ai-app` | `application` | `react-vite-neutral` |

A capability override may move a project **towards** a fuller client runtime and
never away from one: a marketing site that enables `auth`, `profiles`,
`organisations`, `admin` or `uploads` is an application with marketing pages,
and rendering its sign-in as a document would be a worse product rather than a
leaner one. Nothing can move a SaaS console onto the static renderer because
somebody enabled `seo`. `feature-flags` is deliberately *not* an override: a
flag on a prerendered site is answered when the site is built, and treating it
as an application area would ship an SPA to gate a paragraph.

An unsupported combination fails closed. A recipe with no implementation for the
selected renderer is refused by name at generation, never substituted.

## Was Astro earned?

Measured on the genuine nbm business, from one composition, one promoted
direction and one set of quality contracts — the same truth rendered twice:

| | static renderer | application renderer |
| --- | --- | --- |
| client JavaScript | **0 bytes** | 218,118 bytes |
| route documents | **6** | 1 |
| per-route `<title>` | yes | placeholder until boot |
| per-route description | yes | same sentence on every route |
| content in the served bytes | yes | none |
| sitemap | every composed route | `/` |
| independent install / check / build | passes | passes |
| DesignLint | 0 / 0 / 0 | 0 / 0 / 0 |

Astro was adopted at **7.2.7**, pinned exactly, and only inside generated static
projects. Neither the Builder Console nor the factory service uses it. No React
integration is installed, because no island needs one: the four capabilities a
marketing site installs ship inline scripts totalling a few hundred bytes, and
the page works before any of them runs.

## What is deliberately the same

The static renderer is not a second design system.

- **One presentation contract.** Both templates declare the same twelve
  component ids at the same versions with the same binding roles and the same
  variants, so `config/presentation-manifest.json` compiles the same registry
  against either. A section's identity, its editable properties and the
  presentations a person may choose between do not depend on the renderer.
- **One stylesheet.** `templates/shared/presentation/{tokens.css,styles.css}` is
  copied into both templates. Every Phase 4C/4D decision reaches a page as a
  compiled custom property or a factory-compiled shell class, so a renderer that
  emits the same markup inherits the promoted art direction, the responsive
  composition plan and the motion contract rather than re-deciding any of them.
- **One element identity.** Derived from the composition and the template's
  presentation contract, neither of which is React's.

The nbm proof, presenting by `structured-practice`:

```
layout-public direction-structured-practice grid-symmetric headings-ruled
moment-figure-index mobile-hero-copy-first mobile-order-conversion-first
mobile-motion-as-desktop
--mobile-section-space-scale: 0.7   --motion-duration-fast: 120ms
--layout-radius: 0.625rem           data-hero-strategy="split"
```

Every structural dimension and every field of the ResponsiveCompositionPlan
survives into the static shell.

## Static-first, proved rather than asserted

Driven with a real browser against the built output:

- with JavaScript **disabled**: the home page renders, all five navigation
  destinations are visible, `/services` is a real document with its own title
  and heading, and the enquiry form renders and posts to `/__forms.html`;
- with JavaScript enabled: the navigation collapses behind its toggle and the
  form submits in the background with the same success and failure text.

Navigation ships **open** and is collapsed by enhancement, rather than shipping
closed and depending on a script to reveal it. The disclosure control is
`hidden` until enhanced.

Accessibility: 6/6 axe WCAG 2.1 A/AA checks pass across desktop and mobile at
`/`, `/services` and `/contact`, with no serious or critical violations.

Rendered evidence: 21 captures over six routes at three widths, plus the
enquiry-failure state at all three, zero capture failures.

## How this landed

The implementation was written on a branch that forked from `686f9d2`, one commit before the
design-reference, scored-visual-review and rework-lineage work landed. It was **re-anchored** on current
`main` rather than merged: renderer selection and the `referenceInfluence`/`reworkOverrides` parameters
land on the same two signatures in `tooling/lib/generator.mjs`, so taking either side alone would have
silently reverted a shipped capability. Nothing from after the fork was lost, and the static renderer
itself is preserved as written rather than rewritten.

## Reusable factory defects this stage found and fixed

These were found by the static renderer and fixed at their cause. None of them
was worked around in an acceptance output.

1. **A generated project's lint step silently linted nothing.** Every
   ignore-aware tool walks up from the file it is given collecting `.gitignore`
   rules, and the factory generates into workspaces that live under an ignored
   path. `npm run check` therefore reported success having linted zero files, in
   every generated project the factory has ever verified. The application
   template hid it by naming `vite.config.ts` as an explicit argument — the one
   path that skips the walk. Generated projects are now initialised as git
   repositories, which is where that walk stops, and which is what the handover
   has always claimed the output is.

2. **A preview was reported as running before it could serve.** `previewStatus`
   returned `running` from the moment the process was spawned. While every
   project booted a Vite dev server in a few hundred milliseconds that was
   close enough; a prerendered project takes seconds, and in that window the
   Console's poll mounted the preview frame, its one request reached a port
   nothing was listening on, and the frame kept the proxy error until something
   else remounted it. There is now a third state, `starting`, and a preview has
   no destination until it can answer.

3. **The Console's own module graph was being served into preview frames.**
   Astro's dev server applies `--base` to routes but serves Vite's module graph
   from the server root, so a preview asks the Console origin for `/@vite/client`
   and `/src/styles.css`. Some of those names exist in the Console: the preview
   frame was loading this application's stylesheet and HMR client into a
   generated site — a fourth stylesheet, 104 rules, inside the evidence. The
   Console's dev server now answers any request referred from `/preview/` with a
   404, which is what a built Console already does. Computed styles inside the
   frame are now identical to the dev server's own rendering.

4. **A dev-only diagnostics strip distorted every rendered-evidence capture.**
   The footer's development-only block is full width, and without a wrap it
   squeezed the three real footer columns in every screenshot the factory has
   ever taken — for both renderers. Evidence is captured from the dev preview,
   so a footer that only looks like that in development was being photographed
   as the product.

5. **The deployment adapter encoded a renderer assumption.** `netlify.toml`
   carried a `/*  ->  /index.html  200` catch-all, which is the application
   renderer's requirement. Applied to a build that publishes a real document per
   route it would serve the home page under every address. Netlify now has a
   renderer variant with no catch-all; hosting stays the adapter's decision and
   nothing under `src/` knows what a host is beyond the one address an enquiry
   is posted to.

6. **A generated-project harness ignored the project's own preview contract.**
   `generateProject` writes a template's declared `previewEnv` into every
   generated repository and the factory service reads it before supervising a
   preview, but `playwright.real-business.config.ts` started
   `.tmp/real-business-acceptance/workspaces/acme-retrofit` with no environment
   at all. That project is a marketing site, so it is now Astro, and `astro dev`
   backgrounds itself where it detects an agentic environment: the harness saw
   its own dev server exit immediately (`Process from config.webServer exited
   early`), and an orphan daemon kept port 4273 for every later run. The
   accessibility harness had been given the fix inline; the real-business one
   had not. Both now read the contract through one helper,
   `tooling/lib/generated-preview.mjs`, and
   `tooling/generated-preview.test.mjs` fails when a harness that starts a
   generated project does not.

   Worth recording precisely, because it is the case a green pipeline does not
   catch: GitHub Actions is not an environment Astro backgrounds itself in, so
   hosted CI passed this configuration and the defect was only reachable on a
   developer or agent machine. A harness that works on the one host that never
   runs it is not covered by the run that proves it.

7. **The site header was not sticky on any phone.** Found by the cross-browser
   portability lane on its first hosted run, failing on `mobile-webkit` and
   only there. It is not a WebKit defect. Under `@media (max-width: 720px)` the
   header rule set `position: relative` — the disclosure panel beneath it is
   absolutely positioned and needs a positioned ancestor, and `relative` is the
   reflex answer — which overrode the `position: sticky` the header carries at
   every other width. `sticky` is already a positioned value and already that
   ancestor, so the `relative` bought nothing and cost the navigation: on every
   phone, in every engine, the header scrolled away with the page. Reproduced
   at 393px in Chromium (`computedPosition: "relative"`, header top `-496`
   after scrolling), and `sticky` with top `0` after the fix.

   The reason it survived every previous run is worth keeping: every browser
   project in every suite was 1280 wide, so nothing had ever loaded the mobile
   half of the shared stylesheet and asked it a layout question.
   `tooling/portability.test.mjs` now holds both halves — no rule may take the
   header off sticky, and the lane must include a viewport the mobile
   breakpoint actually applies to.

## Known limitation

Astro's dev server serves Vite's module graph from the server root regardless of
`--base`. Under the Console preview those requests leave the mount and are
answered with a 404 (defect 3 above makes that reliable rather than accidental).
Nothing is lost: the generated site's own CSS is inlined by the dev server, the
page renders identically inside and outside the frame, and the Console already
remounts the preview after every edit, so hot module replacement is not part of
the Builder edit loop. The e2e boundary test now holds the stronger statement —
every preview request stays on the Console origin, and **nothing outside
`/preview/` is ever answered with content**.

## Determinism

Equivalent approved inputs produce equivalent structural output: the renderer,
the template, the composition, the compiled design system and the shell classes
are all derived deterministically and recorded in `.app-builder/project.json`.

Two values are honestly not byte-stable and are not pretended to be: Astro's
content-hashed asset filenames, and the copyright year the footer prints, which
is read when the page is generated.

## Deliberately deferred

4.2B static semantic icons, 4.2C Pagefind, 4.2D richer typed structured data and
4.2E deterministic OG imagery are **not** in this stage. Each needs a real
consumer first. Structured data here is exactly what the factory already
supported — a `WebSite` object, emitted only when the site's own URL is known —
because inventing typed entities from facts nothing supports would be a
fabricated observation.

## Outstanding

The static rendering of the genuine nbm business has been generated, built,
linted and photographed. It has not been visually reviewed, and this stage did
not review it: the creator of a rendering may not pass its own visual review.
`npm run acceptance:static-renderer` produces the evidence and stops, in the
same shape and for the same reason as `npm run acceptance:visual-candidates`.
