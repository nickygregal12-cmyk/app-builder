# Renderer selection, and where crawlable route metadata comes from

Recorded 2026-08-28, after the SEO/AEO scanner measured the application
renderer's built output for the first time.

`config/renderers.json` is the executable authority. This file records the
decision that registry encodes, and — because the question was asked and
answered rather than assumed — the reasoning, so nobody has to re-derive it from
a config file the next time a generated SPA is found to have one document.

## The finding that prompted the decision

The application renderer produced `<title>Generated application</title>` in
every built document, with no description and no Open Graph tags, because the
generator copied `index.html` verbatim and the `seo` recipe patched the head
only after hydration. That is now fixed at generation time: see
`tooling/lib/document-head.mjs` and `tooling/document-metadata-acceptance.mjs`.

Fixing it exposed the larger question underneath, which head substitution does
not touch. A Vite SPA serves **one document for every client-side route**. Its
head can now say the right thing about the project; it still cannot say
something different about `/services` than about `/about`, because there is only
one head. Per-route crawlable metadata is a property of how a renderer emits
documents, not of what is written into a scaffold.

## The decision

**Route-specific crawlable metadata is a renderer-selection requirement, not a
universal template feature.**

| Project shape | Renderer | Why |
| --- | --- | --- |
| Public marketing or content site whose value is the content | `static-content` | Every route is a real document generated at build time, with its own title, description, canonical and structured data. Already implemented, already measured. |
| Product that is worked in rather than read — session, state and interaction are the point | `application` | One document is correct. An authenticated workspace has nothing a crawler should index, and route-specific crawler metadata for `/settings/billing` is metadata nobody wants. |
| Public site with a real application area inside it | `application`, by capability override | Recorded on the project with its reason. This is the one genuinely uncomfortable case, and it is treated below. |

That is what `config/renderers.json` already selects: `marketing-site` and
`content-site` default to `static-content`; `b2b-saas`, `consumer-app`,
`internal-tool` and `ai-app` default to `application`; enabling `auth`,
`profiles`, `organisations`, `admin` or `uploads` moves a project to
`application`.

The decision here is that this selection **is** the answer to route
crawlability, and that no prerendering is added to the neutral Vite template.

## The five questions, answered

**1. Should public marketing/content projects with route-specific SEO normally
select the static/content renderer?**

Yes, and they already do. Nothing changes. The default was correct before this
was measured; what was missing was a statement that it is load-bearing rather
than a preference.

**2. Is there a real project class that requires React application behaviour and
crawlable route-specific documents?**

Not one this repository can currently point at. The near miss is the capability
override: a marketing site that enables `auth` becomes an application, and its
public marketing routes lose per-route documents as a side effect of a login
existing. That is a real shape and it has no project behind it yet — no corpus
case, no manifest, no acceptance. Implementing a hybrid renderer for it now
would be building the thing this repository keeps recording as a mistake: a
capability with a producer and no consumer.

**Recorded as the revival condition.** When a project genuinely needs public
crawlable routes *and* an authenticated area, that is when a hybrid or SSR
renderer is earned, and the shape it should take is a third entry in
`config/renderers.json` — not a flag on the application renderer. The capability
override in `config/renderers.json` is where the need will show up first, so a
build that takes the override and declares public content routes is the signal
to look for.

**3. Does existing architecture already have a prerender hook?**

No. The static renderer is a separate template (`astro-static-content`) selected
by a separate renderer entry, and prerendering is Astro's, not a stage the
factory owns. There is no seam in the application template to hang prerendering
on, which is a fact about the cost of question 4 rather than an argument on its
own.

**4. Would adding prerendering to the neutral Vite template duplicate the static
renderer?**

Yes, substantially. It would need per-route document emission, a route manifest,
a build-time render of the React tree, and a second implementation of the head
composition that `Head.astro` already performs — arriving at a worse version of
`static-content` while the good one sits beside it unused. The rule in
`config/renderers.json` is that a renderer renders decisions and introduces no
second authority of its own; two renderers each emitting per-route heads by
different means is exactly that second authority.

**5. Is this better represented as a renderer-selection requirement rather than
a universal template feature?**

Yes. That is the decision.

## What is therefore still true, and is not being hidden

- The application renderer serves one document per build. Routes beyond the
  first have no head of their own. The SEO/AEO scanner reports this as
  `route-metadata-not-crawlable` whenever a composition declares more routes
  than the build serves documents, and it is expected to keep reporting it for
  application-rendered builds. That finding is correct and is not to be
  suppressed.
- The built document of an application-rendered project also carries no `h1`,
  because the body is `<div id="root"></div>` until React runs. The scanner
  reports `document-heading-missing`. Head substitution does not fix that
  either, and a fallback heading inside `#root` would be presentation invented
  by the generator rather than composed content. It stays a recorded limit of
  the renderer.
- Nothing here has been added to the roadmap as a promise. No Next, TanStack
  Start or Astro SSR renderer is planned; one may be **earned** by the project
  class in question 2.

## Where the pieces live

| Concern | Owner |
| --- | --- |
| Which renderer a project gets | `config/renderers.json` (executable), `tooling/lib/renderer-selection.mjs` |
| Project metadata in the single application document | `tooling/lib/document-head.mjs`, written by `tooling/lib/generator.mjs` at generation time |
| Per-route metadata for static/content builds | `recipes/seo/renderers/static-content/files/src/features/seo/Head.astro` |
| Measuring what any build actually emits | `tooling/lib/seo-aeo.mjs`, over `dist` |
| Proof on built output | `tooling/document-metadata-acceptance.mjs` |
