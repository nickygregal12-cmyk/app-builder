# What the factory can and cannot decide today

A Stage B input, recorded at main `655c782` so Stage B builds on what exists rather than
beside it. Every claim is cited; nothing here is a proposal yet.

## 1. Information architecture is declared and unbuilt

This is the most useful thing in this file, because it means Factory Capability 1 is a wiring
job on an existing contract rather than a new concept.

| | |
|---|---|
| `InformationArchitectureSpec` | declared at `config/agent-roles.json:51-56`, `"schema": null`, `"status": "planned"` |
| `information-architect` role | `config/agent-roles.json:481-528`, `"status": "planned"`, owns "sitemap, application surface map and URL hierarchy" and "navigation model and depth of the critical path" |
| `ia-critic` reviewer | `config/agent-roles.json:541+`, `"status": "planned"` |
| gate `information-architecture` | `config/agent-pipelines.json:18-27`, `requiredEvidence: ["InformationArchitectureSpec"]` |
| implementation | **none.** `grep -rn InformationArchitecture packages/ tooling/ schemas/` returns zero hits |

`product-specification` is forbidden from designing information architecture
(`config/agent-roles.json:452`) — a responsibility fenced off from the only live role and
handed to a role that does not run.

**What decides IA today is deterministic code with no design authority:**

- Routes: `deriveMajorSurfaces` (`packages/factory-core/src/index.js:450-457`) reads a
  questionnaire answer or falls back to a fixed per-project-type table
  (`SURFACE_DEFAULTS`, `:5-12` — `marketing-site: ['Home','Services','About','Contact']`).
  The same table is duplicated at `packages/composition/src/index.js:5-12`.
- Sections per route: `SURFACE_PURPOSES`, a regex vocabulary matching surface *names*
  (`packages/composition/src/index.js:711-800`).
- Navigation: emitted positionally, every surface visible
  (`packages/composition/src/index.js:1078`).
- Route slugs and order are positional: index 0 is always `/`
  (`packages/composition/src/index.js:1018-1021`).

## 2. Home-page curation exists, but silently truncates and never offers the rest

`HOME_PREVIEW = { services: 6, projects: 3, gallery: 6, proof: 3 }`
(`packages/composition/src/index.js:435`), applied only when a dedicated surface for that
collection exists — otherwise **everything renders**.

| collection | on home | count |
|---|---|---|
| services | yes | 6 if an `offering` surface exists, else all |
| projects | yes | **3** if a `showcase` surface exists, else all |
| gallery | yes | 6 if a `showcase` surface exists, else all |
| testimonials | yes | 3 if a `practice` surface exists, else all |
| locations | yes | **all, always — no cap parameter exists** (`:507-511`) |
| people | **never on home** (`peopleSection`'s only caller is the `practice` purpose, `:766`) |

Two defects follow, and both are directly on the path this programme cares about:

1. **There is no "see all" affordance anywhere.** `servicesSection`, `projectsSection` and
   `proofSection` all pass `[]` for actions (`:446-449`, `:504`, `:464-472`). A search across
   `templates/` and `packages/composition/src/` for "see all / view all / all projects"
   returns zero hits. A visitor sees 3 of 12 projects with nothing saying twelve exist;
   discovery depends entirely on the header nav.
2. **The truncation is unrecorded.** No warning is emitted for a capped section
   (`warnings`, `:1101-1108`), so "we showed 3 of 12" is invisible to every downstream reader
   including the critic.

That is curation as a `slice()`, not as an editorial decision. The Aesop-class question —
*what is promoted, what is merely discoverable, what is editorial, what is transactional* —
has nowhere to be expressed.

## 3. `gridFamily` is global, and can only be downgraded

One value per compiled plan (`tooling/lib/visual-direction.mjs:495-499`, default `:240`),
consumed identically by both renderers
(`templates/astro-static-content/files/src/components/Items.astro:26`,
`templates/react-vite-neutral/files/src/App.tsx:257`).

The effective grammar *can* differ per section, but only as a content-driven refusal:
`panelGrammar` downgrades `asymmetric` to `symmetric` when a section has fewer than three
items (`templates/astro-static-content/files/src/lib/composition.ts:223-233`). Nothing in the
composition, the schema or the config can *ask* for a different grammar on a specific section.

Confirms Factory Capability 5: projects-as-cinematic and people-as-profiles cannot coexist.

## 4. Responsive recomposition is live but its vocabulary is thin

Correcting an assumption carried in `gold-reference/INTEGRATION-PLAN.md` item 3: all four
responsive axes **are** consumed, and a test at `tooling/visual-direction.test.mjs:133-143`
enforces that every non-default value has a matching selector.

| axis | consumer |
|---|---|
| `MOBILE_HERO` | `.mobile-hero-image-first` → `flex-direction: column-reverse`; `-copy-only` → hides the hero image (`templates/shared/presentation/styles.css:1025-1029`) |
| `MOBILE_SECTION_ORDER` | flex `order` on four section types (`styles.css:979-981`, `:1010-1014`, `:1022`) |
| `MOBILE_DENSITY` | `--mobile-section-space-scale: 0.7` (`styles.css:1037`) |
| `MOBILE_MOTION` | `--motion-hover-lift: 0` (`styles.css:1041`) |

So the gap is not that the axes are unread. **It is that reversing a flex direction, reordering
four section types, scaling spacing by 0.7 and disabling a hover lift is the entire vocabulary.**
None of it can change what a section is *made of* on a phone. Marram's mobile register — one
plate at full width per chapter, then compact records — is not expressible by any combination
of these four values, and that recomposition is what moved its score 7.0 → 8.0.

## 5. One dead declaration worth removing while nearby

`data-mobile-hero` is written at
`templates/astro-static-content/files/src/layouts/SiteLayout.astro:143` and
`templates/react-vite-neutral/files/src/App.tsx:660` and read nowhere — no CSS selector, no
evidence reader, no test. The behaviour is carried entirely by the `.mobile-hero-*` class. It
is the same decision declared twice, which is what the density comment at
`tooling/lib/visual-direction.mjs:585-587` argues against.

## 6. What #256 added, for the record

A direction may promote **one** section type to the front of its declared order, keyed on the
derived `showcaseIntent` signal (`tooling/lib/visual-direction.mjs:392-417`, applied `:457-462`).
Bounded three ways: front only, only a type the direction already declares, only the value
`"first"`. Four directions gained `adapts.sectionOrder.gallery` for `work-led` businesses; two
also gained a `heroStrategy` adaptation so a work-led business gets a picture in the opening.

Keyed on `showcaseIntent` rather than `assetMode` because a rebuild cannot re-derive asset
readiness — enforced by a contract test.
