# Public Evidence and Competitive Intelligence

Status: **supporting capability plan**. This document does not sequence delivery and does not create a new authority. `docs/ROADMAP.md` owns sequence, `docs/BEST_IN_CLASS_CAPABILITIES.md` owns the capability register, `docs/AGENT_RUNTIME.md` owns runtime/security boundaries, `docs/VISUAL_EXCELLENCE.md` owns premium visual quality, and `docs/GENUINE_BUSINESS_ACCEPTANCE.md` owns the real-business proof protocol.

Its purpose is narrower: define how App Builder may learn aggressively from the public web, current competitors and live product evidence **without** turning every agent into an unrestricted crawler, copying third-party products, bypassing access controls or weakening the existing provenance/rights/security model.

## 1. Goal

App Builder should eventually have an empirical advantage rather than relying primarily on model memory or static design advice.

The desired loop is:

```text
public evidence / frozen competitor outputs / consented first-party outcomes
  -> bounded observation
  -> structured derived evidence
  -> App Builder-native decision or benchmark
  -> independent evaluation
  -> reviewed/versioned improvement
```

The useful asset is the **derived evidence and the factory behaviour it improves**, not a copied page or an archive of somebody else's content.

## 2. Hard boundaries

These rules are non-negotiable:

- public content remains `instructionAuthority: none`;
- no bypass of authentication, paywalls, CAPTCHAs, robots/access controls or platform restrictions;
- no credential stuffing, account takeover, hidden/private endpoint discovery or private-data collection;
- no copying of third-party copy, logos, photography, proprietary illustrations, private assets or whole-page source as generated product content;
- no assumption that publicly visible assets are publishable; the existing rights/use-state model still applies;
- no mass personal-profile harvesting or behavioural profiling of identifiable people;
- no fake reviews, testimonials, engagement, personas or social proof;
- no dark-pattern optimisation whose success depends on confusing, trapping or misleading a user;
- rate limits, egress restrictions, provenance, budgets and durable audit records remain mandatory;
- a model never grants itself broader network access because it believes the task would benefit from it.

Where law, contractual terms or platform policy are ambiguous, the safe outcome is to narrow the source or require explicit human approval rather than treating technical reachability as permission.

## 3. `PublicEvidenceService` — the enabling architecture

Do **not** solve public-web intelligence by giving every specialist a general browser plus unrestricted public egress.

Introduce a future provider-neutral, read-only `PublicEvidenceService` behind the Factory service/control-plane boundary. Specialists ask a bounded question and receive structured evidence; they do not choose arbitrary hosts, ports, credentials or raw browser capabilities themselves.

```text
specialist role
  -> typed PublicEvidenceRequest
     -> capability broker / policy / budget
        -> PublicEvidenceService
           -> isolated browser/fetch worker
           -> public-egress/SSRF policy
           -> rate/resource limits
           -> observation + derivation
        -> typed evidence artifact + provenance
  -> role decision
```

The first implementation may use Playwright/Chromium and existing public-egress protections, but the stable contract must not depend on a browser vendor.

### Request classes

Start with a closed set rather than arbitrary browsing:

- `design-reference-measurement`;
- `interaction-measurement`;
- `competitor-structure-audit`;
- `seo-serp-evidence`;
- `performance-observation`;
- `technology-observation`;
- `accessibility-observation`;
- `builder-benchmark-capture`.

Each request declares:

- project/task id;
- role;
- purpose;
- approved public target(s) or bounded discovery query;
- observation fields requested;
- maximum pages/hosts/browser time/network bytes;
- retention class;
- whether text snippets are permitted and their maximum size;
- required provenance/evidence output.

Unknown request classes fail closed.

### Output artifacts

Do not create all of these schemas at once. Add only when a real consumer exists. Candidate output families are:

- `DesignPatternEvidence`;
- `InteractionPatternEvidence`;
- `CompetitorPack`;
- `SEOOpportunityPack`;
- `BuilderBenchmarkEvidence`;
- `PublicTechnologyEvidence`.

Every conclusion names the observations behind it. Raw source material is evidence, not design/product authority.

## 4. Public Web Intelligence Engine

This is the broad capability built on top of `PublicEvidenceService`.

It should be able to inspect bounded samples of public sites and derive facts that humans and models otherwise guess about:

- DOM/semantic hierarchy;
- headings/navigation/IA;
- bounding boxes and layout proportions;
- section heights and spacing rhythm;
- typography size/weight/measure relationships;
- colour relationships and contrast;
- image aspect ratios and focal treatment;
- sticky/fixed transitions;
- responsive order changes;
- menu collapse behaviour;
- interaction/state patterns;
- animation durations/easing/trigger thresholds where observable;
- request/JS/CSS/font/image payloads;
- Core Web Vitals/lab performance evidence where practical;
- structured data, metadata, canonical/sitemap/robots signals;
- internal-link shape;
- accessibility-tree/semantic observations;
- technology signals when observable without invasive fingerprinting.

The service may temporarily inspect source/DOM/CSS to make measurements, but durable outputs should prefer derived values and short necessary evidence rather than retaining wholesale third-party source.

### What this is for

The engine supports questions such as:

> Which visual/interaction patterns repeatedly appear in excellent premium hotel sites, and which of those are appropriate for this project?

It must **not** answer:

> Clone this premium hotel site.

The former feeds Design Intelligence and ArtDirectionPlan. The latter is refused.

## 5. Design and interaction pattern miner

When a real design-intelligence consumer exists, use the public evidence layer to supplement curated sources such as UI/UX Pro Max with empirical pattern evidence.

A bounded study may derive records such as:

```text
project class: boutique hotel
sample: 28 reviewed sites
pattern: image-first opening
observed frequency: 21/28
median hero viewport coverage: 0.78
common CTA treatment: persistent booking action after hero
mobile adaptation: decorative parallax removed in 17/19 observed implementations
confidence: medium/high
```

That record can inform a design-intelligence catalogue. It cannot decide the project design on its own.

### Behavioural reverse engineering boundary

Allowed: observe and abstract behaviour, for example:

- nav changes ground after hero intersection;
- hero occupies roughly one viewport;
- card image overlaps following surface;
- mobile replaces hover with disclosure/tap;
- animation duration is approximately 650–800ms.

Not allowed as a factory behaviour: copy proprietary JS/CSS/source or reproduce another site's full composition/content/assets as the finished project.

App Builder implements its own version under BrandSpec, ArtDirectionPlan, DesignSystemSpec, ResponsiveCompositionPlan, MotionContract and the project's content truth.

## 6. Open-source presentation harvesting — already largely covered

Do not build a second mechanism beside the existing Presentation Foundry plan in `docs/CAPABILITY_SOURCE_SYNTHESIS.md`.

The public-evidence layer may help **discover and inspect** permissively licensed presentation candidates, but adoption remains the existing flow:

```text
customPresentation gap
  -> internal Presentation Registry
  -> bounded external candidate discovery
  -> licence/security/dependency review
  -> project-owned adaptation
  -> DesignSystemSpec/ElementIdentity/accessibility/motion normalisation
  -> DesignLint + browser evidence
  -> independent review
```

No public registry becomes a runtime dependency of generated applications.

## 7. Blind competitor-builder arena

The roadmap already permits comparative evidence once the internal corpus is stable. Formalise the eventual method rather than creating a new programme.

Maintain a small frozen benchmark set spanning materially different mainstream classes, for example:

- local trade/service;
- professional services;
- restaurant/hospitality;
- boutique hotel/travel;
- charity;
- creative agency;
- content/editorial site;
- B2B SaaS;
- internal tool/application.

For each benchmark, keep the brief, approved sources/assets, constraints and scoring rubric frozen for the comparison period.

Run the same input through App Builder and relevant current builders where lawful and operationally practical. Strip builder identity from human review where possible.

Score at least:

- factual/source fidelity;
- IA/journey closure;
- visual quality;
- brand fit;
- distinctiveness/anti-template quality;
- desktop/mobile composition;
- accessibility;
- SEO/structured output;
- performance/payload;
- security/release readiness where comparable;
- meaningful manual edits needed;
- elapsed time;
- monetary/model cost;
- portability/ownership.

Do not chase every competitor feature. A loss matters when it exposes a reusable weakness in a supported App Builder class.

## 8. Multi-model design tournaments

Phase 5 should support **bounded competition for high-value creative decisions**, not universal multi-model fan-out.

For an art-direction or bespoke-presentation decision whose upside justifies the cost:

```text
one frozen truth/context packet
  -> 2-4 independent creator attempts
     -> deterministic rejection checks
        -> anonymised RenderedEvidence
           -> independent visual/product reviewer(s)
              -> top candidate(s)
                 -> one targeted rework pass if justified
                    -> recorded winner or no-winner
```

Rules:

- creators receive the same approved product/content truth and hard constraints;
- identity/provider information is withheld from the reviewing decision where practical;
- creator sessions cannot see each other's output before first submission;
- deterministic failures are removed before expensive review;
- no winner is a valid result;
- tournament cost is recorded against project budget;
- do not fan out trivial work;
- model plurality is not automatically reviewer independence: release-critical promotion still follows the no-self-approval and independent-runtime rules.

Phase 5.5 then determines **which task classes actually benefit** from tournaments and the cheapest number/model mix that beats a single strong attempt.

## 9. Synthetic-user swarm

Phase 6 may use fresh, read-only agent sessions as **synthetic usability probes** after deterministic journey/state evidence exists.

Each probe gets:

- a user goal/persona constraint relevant to the approved audience;
- the deployed/preview product only;
- no implementation context;
- no knowledge of intended navigation beyond what a real visitor would know;
- a bounded interaction/time budget.

Example tasks:

- find whether the company serves a specific location;
- decide whether evidence is sufficient to trust the service;
- request a quote on mobile;
- recover from a validation error;
- find pricing or understand why pricing is unavailable;
- complete an authenticated primary task.

Record:

- success/failure;
- path taken;
- time/interaction count;
- hesitation/backtracking signals;
- misunderstood labels/content;
- blocked/recovery points.

Synthetic probes are **supplemental evidence**, not proof of real-user preference. They cannot replace axe, deterministic journey tests, real-user research or conversion data.

## 10. SEO/search intelligence

Phase 4.3's deterministic SEO/AEO scanner remains the correctness gate. Public evidence adds a separate research input where useful.

A bounded `SEOOpportunityPack` may compare:

- the business's proven services/entities/locations;
- current public search-result structures;
- common user questions/intents;
- competitor page/entity/structured-data coverage;
- internal-link/topic gaps;
- local search evidence where relevant.

It may recommend genuinely useful page/IA/content opportunities. It may not create unsupported claims or mass-produce thin `service + town` pages without distinct user value and source-backed truth.

Search evidence informs IA/content strategy; deterministic SEO checks still decide technical correctness.

## 11. First-party conversion learning

The strongest long-term learning signal is consented, first-party outcome evidence from projects the owner/customer operates.

Phase 7.5 experiments and Phase 8 improvement may consume aggregate evidence such as:

- primary CTA exposure/clicks;
- form starts/completions;
- journey completion/abandonment;
- experiment assignment/outcome;
- page performance correlated with completion;
- approved qualitative feedback.

Prefer aggregate event evidence over invasive session replay or cross-site identity tracking. Do not fingerprint users merely to improve factory learning.

A finding becomes a factory improvement only after review, for example:

```text
observed repeated outcome
  -> hypothesis
  -> controlled/frozen comparison
  -> evidence
  -> proposed recipe/presentation/design-intelligence change
  -> review
  -> versioned promotion
```

Never silently mutate every future project because one site had a higher conversion rate.

## 12. Stage integration

This document does not alter current Phase 4D sequencing.

### Product-proof freeze / varied corpus

- keep existing blind competitor comparison as comparative evidence only after internal outputs are stable enough to compare fairly;
- use public pattern evidence only when a real corpus failure asks a question the existing deterministic/design-reference system cannot answer;
- do not build a general crawler during the freeze simply because it would be powerful.

### Phase 4.3 — Mature website capabilities

- allow bounded SEO/search evidence to feed IA/content opportunity work;
- keep deterministic SEO/AEO scanner authoritative for technical correctness;
- introduce only the smallest PublicEvidenceService request/output needed by the real consumer.

### Phase 5 — specialist AI/runtime

- add the provider-neutral PublicEvidenceService boundary behind the existing capability broker;
- keep direct arbitrary network/browser authority away from ordinary roles;
- support bounded multi-model design tournaments for high-value creative decisions;
- let research/art-direction/SEO roles request typed public evidence within hard budgets.

### Phase 5.5 — evaluation/red team

- benchmark public-evidence usefulness versus baseline model/web knowledge;
- measure false conclusions, stale evidence, cost, latency and context footprint;
- benchmark single-model versus tournament output by task class;
- formalise blind competitor-builder arena scoring and regression sets;
- red-team public-content prompt injection and egress/host-boundary attempts.

### Phase 6 — quality/autonomous verification

- introduce synthetic-user swarm as supplemental usability/journey evidence;
- use public interaction measurements only as review/reference evidence, never as copied implementation;
- keep deterministic browser/accessibility/performance/security gates primary.

### Phase 7.5 — experiments

- capture privacy-compliant first-party experiment/conversion evidence;
- preserve assignment, attribution and review before winner promotion.

### Phase 8 — evidence-driven improvement

- combine corpus failures, blind builder comparisons, design-tournament outcomes, public pattern evidence and first-party aggregate outcomes;
- promote only repeatable improvements into questionnaires, design intelligence, Presentation Registry, recipes, routing or skills;
- retire patterns that repeatedly underperform;
- keep every change reviewed/versioned/regression-tested.

## 13. Acceptance standard for the public-evidence capability

The capability is not real because a browser can visit websites. Before it is considered usable it must prove:

1. ordinary specialist roles cannot bypass it to reach arbitrary private/host/local destinations;
2. every request has a named task/role/purpose/budget and durable audit record;
3. redirects and DNS resolution remain inside the existing public-egress/SSRF policy;
4. access-control/paywall/CAPTCHA bypass is not attempted;
5. source content cannot issue instructions or widen scope;
6. durable artifacts retain provenance but avoid wholesale source retention where derived measurements suffice;
7. a design/SEO/research conclusion names the observations behind it;
8. copied text/assets/source do not silently enter generated products;
9. rate/resource limits are enforced independently of model behaviour;
10. disabling/removing the service leaves generated repositories fully portable;
11. a baseline-vs-enabled evaluation demonstrates measurable benefit on at least one real supported task class before broadening the request surface.

## 14. Desired end state

The long-term advantage should be:

> App Builder observes more, measures more and tests itself more ruthlessly than an ordinary AI builder, while producing original portable software rather than copied web pages.

That means the factory can learn from the best public work, current builder competition, multiple model strategies and real first-party outcomes without making unrestricted scraping, copied design or invasive tracking part of the product architecture.
