# Visual Excellence, Brand Intelligence and Launchability

Status: **cross-cutting product-quality programme**. This document defines the additional work required to make App Builder capable of routinely producing premium, brand-grounded, launch-ready websites rather than merely correct generated applications.

This is not a separate proprietary runtime. It extends the existing Manifest, knowledge-pack, Design Contract, DesignSystemSpec, PageSpec/SectionSpec, asset, evaluation and Builder Console architecture.

The design-side machinery this programme depends on — the design-intelligence catalogue, machine-readable
ArtDirectionPlan dimensions, DesignLint, the Component Manifest Protocol, Builder Element Identity, the
RenderedEvidence contract and the portable design contract — is specified in `docs/DESIGN_INTELLIGENCE.md`.
The specialists that own each of those decisions, and the reviewers that must independently approve them,
are defined in `docs/AGENT_SPECIALIST_ARCHITECTURE.md`.

The evidence programme that decides whether this machinery actually works across real businesses lives in
`docs/PRODUCT_PROOF_PROGRAMME.md`. Visual architecture is not considered mature because its contracts are
well-designed; it is mature when repeated real projects show that the output is distinctive, appropriate,
launchable and low-intervention.

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

A further quality requirement is now explicit: **unrelated businesses must not converge on the same polished template.** Determinism should remove accidental inconsistency, not erase art direction.

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

## 2. Asset policy and image modes

Each project should declare an asset policy rather than letting an agent improvise.

Suggested image/asset modes:

1. **Supplied only** — use only company-provided/approved assets.
2. **Supplied + optimise** — crop, resize, compress and create responsive variants, but do not generate new imagery.
3. **Supplied + generate gaps** — prefer real company assets and generate only clearly missing supporting imagery.
4. **Generation-forward** — generate a coherent on-brand image set where the project is appropriate for synthetic imagery.

Do not expose modes before the factory has a real consumer for them. A contract field that claims behaviour while nothing reads it is a defect, not future-proofing.

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

## 3. BrandSpec, ArtDirectionPlan and MotionContract

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

Three palette/radius changes are not three art directions. Candidate directions must differ materially in composition, hierarchy, rhythm, imagery emphasis and/or interaction language while preserving the same factual/product truth.

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

## 4. ImagePlan and image generation

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

## 5. Content strategy beyond facts

Keep these layers distinct:

- **Facts** — what trusted sources establish.
- **Claims** — what the available evidence permits the site to say.
- **Messaging** — how the product/business is explained and differentiated.
- **Voice** — how the company sounds.
- **Conversion strategy** — what each audience should do next and why.

AI may help with messaging/voice/conversion strategy later, but it must never turn weak evidence into unsupported factual claims.

## 6. Visual review as a first-class quality gate

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

A same-model persona is not a genuinely independent second opinion. Release-critical cross-model visual review is recorded as independent only when the runtime actually uses a different eligible model/runtime with fresh bounded context.

## 7. Product-proof freeze and real-world benchmark corpus

The six canonical project classes remain engineering regression cases. They are not enough to prove design quality.

After Phase 3.8E and the **minimum** 4C/4D/4.2 visual/output foundation, enter the product-proof freeze defined in `docs/PRODUCT_PROOF_PROGRAMME.md` rather than continuing to add visual architecture.

The first checkpoint is at least **10 deliberately varied real businesses**. Grow that toward roughly **30–50 varied projects** over time, including:

- trades/local services;
- architect/design practice;
- hotel/hospitality;
- restaurant;
- accountant/professional services;
- dentist/clinic or another trust-heavy service;
- legal/professional services;
- property/construction;
- charity/community;
- gym/wellness;
- recruitment;
- SaaS/B2B software;
- AI product;
- creator/content/editorial;
- ecommerce/brand;
- internal application/dashboard.

The initial ten should be deliberately adversarial rather than ten brochure sites. Include local trade/project photography, restrained professional consultancy, hospitality, text-heavy authority, high-imagery work, catalogue/content structures and at least one premium brand that challenges the default rhythm.

Freeze/replay the approved source/intake inputs for accepted benchmark projects so later factory versions can be compared against the same truth.

Track per project:

- first-build success;
- launchable on first output;
- predicted vs actual meaningful manual edits;
- edit categories;
- visual/product score;
- mobile score;
- content accuracy/unsupported claims;
- imagery/crop failures;
- generic/repetitive sections;
- accessibility;
- performance;
- SEO/AEO;
- security;
- functional journey success;
- elapsed time;
- AI/model/tool cost;
- user/developer interventions;
- accepted/rejected design variants;
- asset problems and generated-image acceptance rate;
- owner/stakeholder reaction.

During the freeze, a visual architecture change should normally be justified by a repeatable corpus failure rather than by preference.

## 8. Anti-template similarity diagnostic

Deterministic presentation registries can eliminate bad randomness while accidentally producing many beautiful but structurally identical websites. Measure that risk directly.

Across unrelated corpus projects, compare signals such as:
- section-family sequence;
- hero treatment;
- component-family sequence;
- information density;
- repeated typography combinations;
- CTA structure;
- layout family;
- motion pattern;
- repeated visual motif;
- visual/structural embedding similarity where justified.

Flag unrelated builds that are suspiciously similar.

This begins as a diagnostic, not a hard CI gate. Baseline the corpus first. Use the evidence to retire generic patterns or widen proven art-direction options; do not solve similarity by injecting uncontrolled randomness.

## 9. Project-class maturity and supported-vs-custom boundary

A 10/10 builder should know when a request is outside its proven factory envelope.

Project classes/capability families should move through machine-readable maturity tiers:

- **Proven** — material real-project evidence shows the class routinely performs at the declared quality/intervention target;
- **Supported** — known renderer/architecture/recipes and representative acceptance, but not enough corpus proof for a "normally excellent" claim;
- **Assisted engineering** — factory support exists but substantial specialist/human judgement is expected;
- **Experimental** — novel or insufficiently proven, requiring explicit custom engineering/approval.

This maturity should influence:
- autonomy level;
- model/tool budget;
- verification depth;
- human review requirements;
- launch confidence shown in the Console;
- whether one-prompt quality claims are allowed.

A canonical generated app passing build/tests does not by itself promote a project class to Proven.

## 10. Competitive visual/product bake-off

Once the internal ten-project corpus is stable enough to make the comparison meaningful, periodically run the same frozen brief/source material through relevant current builders and blind-review where practical.

Score at least:
- first-output visual/product quality;
- distinctiveness;
- factual accuracy;
- mobile quality;
- functionality/journeys;
- accessibility;
- performance;
- meaningful edits;
- elapsed time;
- cost;
- portability;
- provenance/rights discipline where competitors expose comparable evidence.

The purpose is to verify best-in-class claims, not copy every competitor feature.

## 11. Evidence-driven promotion

Patterns should become reusable factory capability only after repeated evidence:

- successful section/art-direction patterns can be promoted into the Presentation Registry;
- frequently accepted image strategies can become deterministic rules;
- common manual edits can improve questionnaires/composer/recipes;
- weak or generic patterns should be retired;
- skills and design-knowledge entries are promoted only through the lifecycle in `config/skill-registry.json`;
- model/image-provider choices should be benchmarked by task class and cost;
- all promotions remain reviewed, versioned and regression-tested.

The desired feedback loop is:

`real project -> observed failure/success -> structured evidence -> narrow reusable change -> rerun same frozen input -> compare -> promote or reject`.
