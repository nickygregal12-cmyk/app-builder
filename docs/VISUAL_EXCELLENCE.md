# Visual Excellence, Brand Intelligence and Launchability

Status: **cross-cutting product-quality programme**. This document defines the additional work required to make App Builder capable of routinely producing premium, brand-grounded, launch-ready websites rather than merely correct generated applications.

This is not a separate proprietary runtime. It extends the existing Manifest, knowledge-pack, Design Contract, DesignSystemSpec, PageSpec/SectionSpec, asset, evaluation and Builder Console architecture.

The design-side machinery this programme depends on — the design-intelligence catalogue, machine-readable
ArtDirectionPlan dimensions, DesignLint, the Component Manifest Protocol, Builder Element Identity, the
RenderedEvidence contract and the portable design contract — is specified in `docs/DESIGN_INTELLIGENCE.md`.
The specialists that own each of those decisions, and the reviewers that must independently approve them,
are defined in `docs/AGENT_SPECIALIST_ARCHITECTURE.md`.

## Goal

For supported website classes, App Builder should aim for boutique-agency / strong senior product-team quality on the first build, with measurable evidence rather than subjective claims.

The long-run Gold Standard is:

- supported websites build successfully without developer intervention at >=98%;
- median meaningful manual edits before launch <=5 for mainstream website classes;
- a growing share of supported projects are launchable untouched;
- blind human visual/product review averages >=9/10;
- no unsupported factual claims;
- no serious/critical accessibility failures;
- agreed performance/Core Web Vitals budgets pass;
- zero known critical/high security findings at release;
- all Build Contract acceptance journeys pass;
- generated repositories independently clone/install/build without App Builder;
- AI/model/tool cost remains inside the declared project budget.

Initial milestones remain deliberately looser (for example the existing <20 meaningful-edit real-business gate) and should tighten only when evidence supports it.

A launchable build is not automatically a professionally designed build. Before the real-world corpus is used to claim boutique-agency quality, the product path must also prove a **professional-output completeness gate**: typography, messaging, asset sufficiency, responsive art direction, bespoke-presentation escape hatches, cross-browser rendering and anti-template diversity must all be intentional rather than accidental.

## 1. Brand-source intelligence

The factory should understand the company before it designs for the company.

Supported source classes should include:

- user-uploaded logos, photographs, product/project imagery and screenshots;
- brand guidelines, brochures, PDFs and other documents;
- the company's existing website;
- exact user-provided public profile URLs such as Facebook, Instagram, LinkedIn or other relevant official profiles;
- connected/authorised account sources where APIs/connectors are available;
- explicitly reviewed public discovery only when permitted and useful.

Social/profile content is **optional enrichment, never a core dependency**. Do not build a brittle generic scraper that attempts to bypass platform controls. Prefer exact URLs, official/public surfaces and authorised APIs/connectors.

Extract or infer structured signals such as:

- brand palette and token candidates;
- logo variants and safe usage;
- typography style/roles when observable;
- imagery style and recurring subjects;
- visual density, whitespace and composition tendencies;
- tone/voice examples;
- services/products, locations and trust signals;
- project/team imagery;
- recent/public activity that may be useful context;
- existing navigation/content hierarchy;
- visual references worth adopting and patterns worth avoiding.

Every imported item retains source identity, confidence, provenance and an asset-rights/use-status field. Publicly visible does not automatically mean approved for republication.

## 2. Asset policy, readiness and image modes

Each project should declare an asset policy rather than letting an agent improvise.

Suggested image/asset modes:

1. **Supplied only** — use only company-provided/approved assets.
2. **Supplied + optimise** — crop, resize, compress and create responsive variants, but do not generate new imagery.
3. **Supplied + generate gaps** — prefer real company assets and generate only clearly missing supporting imagery.
4. **Generation-forward** — generate a coherent on-brand image set where the project is appropriate for synthetic imagery.

The policy should separately control:

- hero imagery;
- service/product visuals;
- backgrounds/textures/illustrations;
- icons;
- social/OG assets;
- people/team imagery;
- project/case-study imagery;
- editing/enhancement of supplied images.

The factory should explicitly avoid synthetic imagery where it would misleadingly imply real staff, real completed work, real customers, real premises or real products unless the representation is clearly appropriate and approved.

### Visual Asset Readiness

Before art direction is finalised, assess whether the approved asset inventory can support the intended visual story. The result must be an explicit decision rather than an incidental absence of images.

At minimum record coverage for:

- logo/brand marks;
- hero visual need;
- service/product imagery;
- project/case-study imagery;
- people/team imagery;
- decorative/illustrative support;
- social/OG imagery.

When coverage is insufficient, choose deliberately between:

- a typography/graphic-led direction that does not need photography;
- requesting additional owner-approved assets;
- generating safe supporting artwork where truthful and appropriate;
- sourcing approved/licensed stock or library assets where policy permits it.

“No publishable imagery” is allowed to become a strong art direction. It must not become an unexplained visual gap.

## 3. BrandSpec, TypographySpec, ArtDirectionPlan, ResponsiveCompositionPlan and MotionContract

### BrandSpec

A machine-readable project brand layer should capture:

- trusted/observed palette;
- approved logo assets and usage constraints;
- typography intent;
- imagery language;
- icon language;
- tone/voice examples;
- brand adjectives and anti-adjectives;
- reference sources and confidence;
- source-vs-generated asset policy.

### TypographySpec

Typography is a first-class design system, not a single “modern/editorial” label. The executable typography layer should resolve into real generated output and cover, where relevant:

- display and body families;
- weights/styles and variable-font axes;
- fluid display/body scales;
- line-height and letter-spacing;
- reading measure;
- heading/body/label/button/nav roles;
- responsive typography overrides;
- loading/preload/subsetting behaviour;
- font-source and licensing status.

Font policy must distinguish system/open-licensed fonts, owner-supplied licensed assets and approved hosted sources. The factory must not silently redistribute commercial font files.

### ArtDirectionPlan

Art direction sits above individual SectionSpecs and describes the visual/story strategy of the whole experience:

- narrative/emotional sequence;
- attention hierarchy;
- page tempo and density changes;
- hero strategy;
- photographic/editorial/product/UI emphasis;
- distinctive visual moments;
- restraint rules;
- desktop/mobile composition intent;
- conversion emphasis without turning every site into the same SaaS template.

The factory should be able to produce 2–4 genuinely different bounded art directions from the same product/content truth and let the user promote one into durable project state.

### ResponsiveCompositionPlan

Responsive design must support art-direction changes, not only narrower CSS. The plan should be a derived/contained part of ArtDirectionPlan rather than a second design authority.

It should be able to describe real breakpoint-specific composition changes such as:

- alternate order/grouping of section content;
- hero/layout simplification;
- different image crops/focal framing;
- column/grid collapse strategy;
- desktop hover behaviour becoming mobile press/tap behaviour;
- decorative layers removed or reduced on small screens;
- mobile-specific CTA placement;
- typography/measure/density overrides;
- section variants that deliberately differ by viewport.

Every executable responsive declaration must have a renderer/selector consumer and rendered evidence.

### MotionContract

Motion should be intentional and project-appropriate, not "add animations".

Capture:

- entrance behavior;
- scroll behavior;
- navigation/page transitions;
- hover/focus/press language;
- hero movement;
- parallax/background allowances;
- stagger rules;
- simultaneous-animation density;
- mobile reductions;
- reduced-motion behavior;
- explicit no-motion zones.

## 4. Controlled bespoke-presentation lane

The Presentation Registry must be the default path for solved visual problems, but it must not become a ceiling that forces every project through the same finite catalogue.

When the selected ArtDirectionPlan requires a visual/product moment that no ready presentation entry can satisfy, the factory may classify the section as **custom presentation required** and route it to bounded specialist implementation.

The custom lane must still obey:

- Design Contract / DesignSystemSpec tokens and constraints;
- PageSpec/SectionSpec identity and content-binding provenance;
- Builder Element Identity where editable;
- responsive and accessibility contracts;
- MotionContract;
- DesignLint;
- rendered evidence and independent visual review;
- bounded ChangeSet/file ownership.

A one-off custom presentation is **not automatically promoted** to the Presentation Registry. Promotion requires repeated successful use, review, tests, accessibility evidence and versioning. This keeps the system reusable without making it inherently template-like.

## 5. ImagePlan and image generation

Introduce a provider-neutral `ImagePlan` that maps each page/section to the image job it actually needs.

Each image job should specify:

- purpose and section identity;
- desired subject/composition/aspect ratio;
- real-vs-generated requirement;
- candidate supplied assets;
- brand/style references;
- crop focal point/safe zones;
- required responsive variants;
- provenance/rights status;
- approval status;
- generation/edit history and model/tool cost where AI is used.

An image-generation adapter belongs on the **factory side**, not in generated app runtime. It may use one or more image providers later without making any provider part of the stable project contract.

Generated image workflows should support:

- missing hero/supporting imagery;
- illustrations/backgrounds/textures where appropriate;
- social/OG/banner variants;
- responsive/crop variants;
- controlled edits to approved company assets where permitted;
- alternate candidates for user selection.

## 6. Content strategy beyond facts and MessagingPlan

Keep these layers distinct:

- **Facts** — what trusted sources establish.
- **Claims** — what the available evidence permits the site to say.
- **Messaging** — how the product/business is explained and differentiated.
- **Voice** — how the company sounds.
- **Conversion strategy** — what each audience should do next and why.

AI may help with messaging/voice/conversion strategy later, but it must never turn weak evidence into unsupported factual claims.

For premium public-facing sites, derive a bounded `MessagingPlan` from the approved requirements and trusted claims. It should make the communication strategy explicit, for example:

- primary audience/problem;
- credible value proposition;
- defensible differentiators;
- proof required before each important claim;
- likely objections and how the site answers them;
- CTA strategy;
- page-level narrative sequence;
- voice/tone constraints;
- claims that are forbidden because evidence is insufficient.

A MessagingPlan is not permission to invent facts. It is the strategy for arranging permitted facts/claims into a clear story.

## 7. Visual review as a first-class quality gate

Render and inspect the actual site at representative widths, including at minimum:

- ~375px;
- ~430px;
- tablet;
- laptop;
- desktop;
- wide desktop where relevant.

The visual reviewer should evaluate more than DOM validity:

- hierarchy and attention;
- whitespace/density;
- repetitive section rhythm;
- desktop/mobile composition quality;
- CTA visibility and conversion flow;
- typography consistency and legibility;
- image relevance and crop quality;
- face/text/logo distortion;
- whether synthetic imagery looks implausible or misleading for the business;
- visual consistency with BrandSpec/ArtDirectionPlan/DesignSystemSpec;
- interaction and motion restraint;
- empty/loading/error states for applications;
- whether the result feels generic or has at least one appropriate distinctive moment.

Findings should become bounded ChangeSets with a limited correction pass, not an unbounded "make it prettier" loop.

The reviewer is independent by construction: `design-critic` and `visual-critic` own no repository mutation
scope, so they issue a scored `ReviewVerdict` and route rework to `art-direction`, `design-system` or
`composition` rather than editing the product themselves. Deterministic DesignLint runs first, so the
vision model spends its context on judgement rather than on defects a rule could have caught.

### Cross-browser visual acceptance

Agency-quality claims require more than Chromium. Keep full rendered-evidence coverage on the primary browser, then add a targeted portability smoke across at least Chromium, WebKit and Firefox for representative critical routes/states.

The cross-browser lane should focus on high-risk visual differences such as:

- font metrics/loading;
- viewport units and sticky/fixed behaviour;
- overflow and scroll behaviour;
- image sizing/object-position;
- form controls;
- animation/motion;
- mobile Safari composition;
- CSS features used by presentation components.

Do not multiply the entire browser matrix unnecessarily. Use targeted WebKit/Firefox smoke plus the full primary-browser evidence set.

## 8. Real-world benchmark corpus and anti-template diversity

The six canonical project classes remain engineering regression cases. They are not enough to prove design quality.

The varied real-world corpus that is — which businesses it spans, how each run is frozen, replayed and validated, and how a defect is classified project-specific or reusable factory debt — is owned by `docs/GENUINE_BUSINESS_ACCEPTANCE.md`, and its place in the sequence by `docs/ROADMAP.md`. It grows toward roughly 30–50 varied projects.

What this document owns is what each run has to measure, and the diagnostic that stops the corpus passing by making every business the same beautiful template.

Track per project:

- first-build success;
- meaningful manual edits required;
- visual/product score;
- mobile score;
- content accuracy/unsupported claims;
- accessibility;
- performance;
- SEO/AEO;
- security;
- functional journey success;
- elapsed time;
- AI/model/tool cost;
- user/developer interventions;
- accepted/rejected design variants;
- asset problems and generated-image acceptance rate.

Before claiming professional output across a class, also run an **anti-template diversity diagnostic** across unrelated builds. Compare signals such as:

- section-family sequence;
- hero treatment;
- layout family;
- information density;
- typography combination;
- CTA structure;
- component-family sequence;
- motion language;
- recurring visual motifs;
- responsive composition strategy.

Begin as a diagnostic rather than an arbitrary blocking threshold. Use real corpus evidence to identify repeatedly generic patterns, then retire or improve those patterns rather than adding uncontrolled randomness.

## 9. Professional-output completeness gate before corpus freeze

Before the first deliberate product-proof freeze is treated as evidence of boutique-agency quality, the
factory must genuinely be able to produce professional output. This section says what that means and how
a requirement is discharged.

### The rule that makes this gate decidable

A capability cannot simultaneously be "required before product proof" and "correctly deferred because it
has no consumer". The rule that separates the two:

> Every entry below is a **capability and evidence requirement**, not a mandate for a standalone contract.
> A requirement is satisfied when the product path demonstrably produces the behaviour and the evidence
> can be pointed at. Where an existing composition, design or evidence structure already carries it,
> **that structure is the answer** and a second schema would only create a second place the same decision
> could be made. Where nothing carries it, the requirement is genuinely outstanding and blocks the freeze.
> Where the behaviour has no real consumer or supplier at all, the requirement is **conditional**: it is
> deferred with a reviving condition in `config/factory-status.json`, and a conditional requirement is
> never counted as a blocker.

Three consequences, stated so they cannot be argued away later:

- a conditional deferral is not a free pass. It needs a recorded reviving condition, and the moment a
  real consumer appears the requirement becomes ordinary outstanding work;
- "satisfied by an existing structure" is a claim about the product path, not about a plan. If the
  behaviour cannot be shown in generated output or captured evidence, it is not satisfied;
- corpus entry still requires professional visual quality. A build nobody would call professional is not
  meaningfully reviewable, so the freeze does not open merely because every row below has some status.

### The requirements

| Requirement | How it is discharged today |
| --- | --- |
| Compiler-backed DesignSystemSpec | **Satisfied.** 4C.1/4C.2: design choices compile through a `DesignSystemSpec` IR and persist as `.product/design-system.json` in the generated repository. |
| BrandSpec with source/decision provenance | **Satisfied.** 4C.3: accent and typographic voice resolve from the colours and font families the company's own pages showed, with source ids. |
| Typography with real font/token output and a licensing policy | **Satisfied by BrandSpec, not by a separate TypographySpec.** The voice compiles to real `--font-display`/`--font-body` output, and the licensing question is answered by the policy rather than by paperwork: a voice may not cost the generated app a webfont request or a licence, so the stacks are system stacks. A standalone `TypographySpec` is warranted only when a decision needs typographic information BrandSpec cannot express. |
| ArtDirectionPlan with at least one distinctive-moment strategy | **Satisfied.** 4C.3/4D.6: directions declare a distinctive moment, and one with nothing to render is refused rather than shipped empty. |
| ResponsiveCompositionPlan with real viewport-specific consumers | **Satisfied.** 4D.5: mobile content order, navigation treatment, hero stacking, density and motion, each read by the template. |
| MotionContract with reduced-motion behaviour | **Satisfied.** 4C.3, with `prefers-reduced-motion` honoured in the compiled tokens. |
| Visual asset readiness | **Satisfied.** 4D.4: readiness is resolved before directions are selected, and an asset the business has not cleared never counts towards coverage. |
| Design references a person supplies, turned into design decisions | **Satisfied.** 4D.2: public URLs and screenshots become `VisualReferenceAnalysis` records whose approved `adopt`/`avoid` traits steer the one ArtDirectionPlan — refusing a direction outright on a structural axis, tuning the plan's intent before it compiles on a scaled one. Observation, interpretation and what the person said stay separate, no source markup, copy, imagery or stylesheet survives capture, and a trait the factory cannot act on says so. `examples/design-references/two-projects.json` proves two businesses that want opposite things do not get the same art direction. |
| ImagePlan | **Conditional — deferred.** An ImagePlan organises image *generation*, and the factory cannot generate images. The sufficiency half of the requirement is what matters before the freeze, and asset readiness above carries it. Revives with image generation, as Phase 5 sequences it. |
| MessagingPlan where messaging matters | **Conditional — deferred (4D.3).** The composition already carries what it would organise, with provenance: page narrative is the section sequence, CTA strategy derives from declared conversion goals, proof gaps are `declaredProofGap`, audience is on the manifest, and forbidden claims are the existing provenance boundary. Revives when an art-direction or composition decision needs narrative information the composition cannot express. The reviving condition is recorded in `config/factory-status.json`. |
| Presentation Registry / Component Manifest retrieval | **Satisfied.** 4C.4: the registry is compiled from what the template actually renders, and a build whose presentation it cannot satisfy is refused. |
| Controlled bespoke-presentation fallback | **Satisfied — the lane fulfils a classified requirement, and the verdict on one is the same outstanding gate as everything else.** The trigger was already real: a failed review whose criterion no axis can answer classifies a `customPresentation`. `tooling/lib/bespoke-presentation.mjs` is what then builds one. It is a stylesheet and nothing else, which is not a limitation but the design: a presentation needing new markup would need new bindings, and new bindings move the composition — so CSS-only is what makes "preserves PageSpec, SectionSpec and content provenance" true by construction, and why ElementIdentity survives without a check. Every selector is anchored to the section's own `data-section-id`; colour literals are refused and every custom property must be one the project's compiled DesignSystemSpec emits or the template defaults; a mobile block is required, because the classification asked it to compose at a phone width rather than inherit desktop narrowed; anything that moves must answer `prefers-reduced-motion`. Its ChangeSet owns `src/presentation/bespoke/` and cannot reach the composition, the compiled design system, the generated modules or the package manifest — the writer re-validates rather than trusting the record it was handed. Both renderers load the directory by glob, so a fulfilment writes its own file and never edits a shared one, and it reaches real built output. It is durable across a rebuild, re-validated against *that* build's tokens, and a presentation whose token stopped resolving is refused and recorded rather than left rendering against nothing. It is `project-local` and stays there: `registryPromotion.eligible` is `false` and says what would change it, because a lane that promoted on first use would turn one project's exception into every project's default. It starts `awaiting-visual-review` and can start nowhere else, a pass needs DesignLint clean and rendered evidence, and the creator may not review it. |
| Deterministic DesignLint | **Satisfied.** 4C.5, carried inside RenderedEvidence so a critic is never paid to re-derive a rule. |
| Rendered responsive evidence | **Re-earning it.** 4B.2 and 4D.7 photograph every candidate at the same three viewports over the same routes, and the first independent review proved the routes were not real: the evidence server answered every prerendered route with the home document, so eighteen captures per candidate were three. The document resolution is fixed, a capture now proves its rendered `data-page-id` matches the route it asked for before the screenshot counts, and `buildEvidenceSet` refuses a set where pages built from different sections photograph identically. Satisfied again when the set is recaptured under those three guards. |
| Independent visual critic and bounded correction loop | **The loop is closed and it has now been used once, in anger.** A review scores every criterion it was scoped against the declared bar in `config/agent-pipelines.json` (`gates.visual`), a below-bar verdict cannot be recorded as a pass, a set can be sent back or rejected outright with nothing promoted, and a rework verdict produces a bounded plan with lineage that is refused if the composition hash moved. On 2026-08-28 an OpenAI GPT-5 critic reviewed the Anthropic-created nbm set and rejected both candidates (5.21 and 4.66 against an 8.5 mean and a 6.5 floor); the verdict is kept at `examples/genuine-business/nbm-visual-review-v1.verdicts.json`. What is outstanding is a second verdict over evidence that is trustworthy. |
| Targeted Chromium/WebKit/Firefox visual portability smoke | **Satisfied.** `npm run test:e2e:portability` runs two critical routes and the states that differ across Chromium, Firefox, WebKit and an iPhone WebKit composition. It is assertions about defects rather than pixel baselines — three engines rasterise text differently and a diff that always fails teaches nobody anything — and each check names a defect a real engine produces: `100vw` including a classic scrollbar, a sticky header whose containing block a backdrop filter moves, `100vh` exceeding the viewport a phone visitor actually has, `object-fit`/`aspect-ratio` losing an image's box, a sub-16px control zooming iOS on focus and never zooming back, a transition surviving `prefers-reduced-motion`, and navigation that must be a disclosure on a phone. Full RenderedEvidence stays on the primary browser; the other engines produce targeted measurements and one capture per route. `tooling/portability-evidence.mjs` separates three states rather than two: a check that held, a check that failed, and a check that had nothing to measure — the imagery check on a build with no photographs is the third, and it is never reported as the first. An engine that did not run makes the lane incomplete rather than green. |
| Anti-template diversity diagnostics across unrelated builds | **Satisfied as a diagnostic, which is what §8 asks for.** `npm run diagnose:anti-template` reads builds the factory already produced — the composition, the compiled design and the promoted direction, all of which an ordinary generated repository carries — and reports over the eleven signals §8 names. It reuses `structuralSignature`, so "structurally different" cannot mean one thing inside a candidate set and another across the corpus. Three readings, in descending order of what they mean: `identical` (two unrelated businesses whose every signal agrees — not a percentage, the definition of a template), `uniform` (a signal with one value across the whole set, so whatever decides it is not the business) and the least-different pairs. Nothing blocks: §8 asks for real corpus evidence before a threshold, and a percentage invented over a corpus of one is a number chosen to look rigorous. Its first run is recorded below. |

### What the two diagnostics found on their first runs

Kept because each names an invariant a later agent would otherwise re-learn; the runs themselves are
in Git and the rules are in tests.

**Portability.** Two reproducible failures on `mobile-webkit`, and neither was a WebKit defect: under
`@media (max-width: 720px)` the shared header set `position: relative`, overriding the `position:
sticky` it carries at every other width, so the navigation scrolled away on **every phone in every
engine**. It had survived every previous suite because every browser project in every suite was 1280
wide — three engines agreed the page was fine, and none of them had loaded the half of the stylesheet
that broke it. The invariant: *a suite whose projects share one viewport has not tested the
breakpoints.* `tooling/portability.test.mjs` holds both the fix and the requirement that the lane keep
a viewport the mobile breakpoint applies to.

**Anti-template.** Eight builds, and eight of eleven signals were **uniform**; only section sequence
and layout pattern varied. The diagnostic reports the cause rather than leaving it to be inferred: no
build in that set carries a promoted visual direction, so every one signs from the default composition
dimensions. The finding is therefore that the direction machinery is *unused by ordinary builds* —
which is what the outstanding 4D verdict means in practice — and **not** that the factory answers
different businesses the same way. That second claim needs a set where directions have been promoted,
and no such set exists yet.

### What this means for the freeze

**One row is outstanding, and it is now the factory's own work rather than a missing reviewer.**
Cross-browser visual smoke, the cross-build anti-template diagnostic and the bespoke-presentation lane
are closed. The independent visual verdict has been issued once, by an OpenAI GPT-5 critic over the nbm
candidate set, and it rejected both candidates. A bespoke presentation and a static rendering still need
a reviewer who did not produce them, so the row stays open on those.

The machinery it was waiting on is complete: the packet, the scored bar, the bounded rework loop, the
reject-the-whole-set outcome, and a lane that can build the thing a failed review asks for when no
registry component will do. The first use of it did exactly what it exists to do — an independent
reviewer found defects the creator had missed, and nothing was promoted.
The conditional rows do not gate it, and closing them early would mean building a contract with no reader.

This gate is about **creative-production completeness**, not adding another authority. Where a listed
capability does not justify its own stable contract, it stays a derived/compiler/evidence structure under
the existing Design Contract and product authorities.

## 10. Supported-vs-custom boundary

A 10/10 builder should know when a request is outside its proven factory envelope.

The Build Contract should classify work as:

- factory-supported;
- supported with custom implementation;
- specialist/novel engineering required;
- unsupported or approval-required.

That classification should influence model/skill routing, budgets, verification depth and user expectations rather than pretending that a brochure site and a WebGPU multiplayer CAD system have the same first-pass reliability.

## 11. Evidence-driven promotion

Patterns should become reusable factory capability only after repeated evidence:

- successful section/art-direction patterns can be promoted into the Presentation Registry;
- one-off bespoke presentations remain project-local until repeated evidence justifies promotion;
- frequently accepted image strategies can become deterministic rules;
- common manual edits can improve questionnaires/composer/recipes;
- weak or generic patterns should be retired;
- skills and design-knowledge entries are promoted only through the lifecycle in `config/skill-registry.json`;
- model/image-provider choices should be benchmarked by task class and cost;
- all promotions remain reviewed, versioned and regression-tested.
