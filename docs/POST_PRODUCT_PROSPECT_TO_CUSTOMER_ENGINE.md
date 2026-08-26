# Post-Product Prospect-to-Customer Engine

Status: **future programme only — inactive until App Builder is fully built, proven and economically validated**.

This document records a possible commercial use of App Builder after the core factory has reached production-quality maturity. It is intentionally not part of the current delivery critical path and must not compete with Phase 3.8, Phase 4, the autonomous runtime, quality gates, genuine-business proof or the factory's own launch-readiness work.

The opportunity is to use the finished factory as the production engine behind a separate prospecting and commercial workflow:

`discover business -> qualify -> research -> build speculative site -> independently verify -> publish preview -> personalised outreach -> sell -> production onboarding -> maintain`

The key proposition is not "AI web design". It is a low-friction productised sales model in which a suitable business can see a credible, tailored website before paying anything, while the owner's speculative cost is bounded primarily by measured AI/runtime usage rather than domains, templates or manual design labour.

---

## 1. Hard activation gate

Do **not** implement this programme merely because the factory can generate websites.

Work may begin only after the owner explicitly activates it and the following are true:

1. App Builder's genuine-business acceptance gates are closed honestly.
2. Mainstream business/marketing websites repeatedly reach launchable quality from real company material.
3. Manual intervention is measured across a real corpus and is low enough that speculative builds are economically sensible; directionally, proven mainstream site classes should be approaching the mature target of <=5 meaningful edits median rather than merely clearing the original <20-edit proof gate.
4. The full visual/design system, responsive review and rendered-evidence workflow are mature enough that an autonomous build is not merely technically valid but commercially presentable.
5. Preview and production deployment are reliable, isolated and policy-controlled.
6. The dedicated agent runtime, sandboxing, budgets, checkpoints, independent review and convergence rules are proven under real workloads.
7. Cost accounting can attribute discovery, research, AI, build, QA, preview and outreach cost to a prospect.
8. Prospecting can be stopped globally and per provider without affecting the core App Builder.
9. A human has reviewed a representative batch of speculative websites and judged the proposition saleable.
10. Applicable privacy, electronic-marketing, provider-terms and consumer/business-law requirements have been reviewed for the intended geography and channels before any automated outreach is enabled.

Until those conditions are met, this document is planning only.

---

## 2. Architectural boundary

The prospecting system must remain **outside the App Factory Engine**.

Recommended shape:

```text
Prospect-to-Customer Engine
        |
        +-- discovery providers
        +-- qualification/scoring
        +-- contact provenance/compliance
        +-- commercial pipeline/CRM state
        +-- outreach/reply workflow
        +-- payment/onboarding workflow
        |
        v
safe App Builder service/API boundary
        |
        v
App Factory Engine / control plane
        |
        +-- intake / Build Contract / Manifest
        +-- content + asset intelligence
        +-- composition + generation
        +-- specialist AI runtime
        +-- deterministic QA + independent review
        +-- preview/release machinery
```

The Prospect-to-Customer Engine is a **client of App Builder**, never a new source of factory truth.

It must not:
- put prospect scraping logic in `packages/factory-core`;
- put CRM/outreach state in generated websites;
- bypass Build Contracts, manifests, provenance, quality gates or deployment approvals;
- grant crawled/public content instruction authority;
- grant an outreach agent production or unrestricted filesystem powers;
- make generated projects depend on the commercial engine at runtime;
- turn provider-specific prospecting APIs into stable factory contracts.

Use provider-neutral adapters for discovery, contact enrichment, email/outreach, payments and hosting wherever practical.

---

## 3. Initial commercial hypothesis

The system should test two materially different prospect classes rather than assuming "no website" is always best.

### Class A — Active businesses with no meaningful website

Core pitch: the business can see a tailored site that already exists rather than being sold an abstract web-design project.

Advantages:
- obvious before/after value proposition;
- little legacy migration burden;
- simple productised offer.

Risks:
- contact details can be harder to find;
- some businesses deliberately do not want a website;
- less source material may be available for trustworthy copy/brand inference.

### Class B — Active businesses with a weak/outdated website

Core pitch: show a substantially better replacement based on the business's existing public information, without changing factual claims silently.

Possible deterministic indicators include:
- poor mobile behaviour;
- weak performance;
- broken links/assets;
- missing or weak metadata/structured data;
- weak accessibility baseline;
- no clear conversion path;
- missing enquiry functionality;
- visibly stale content where dates can be established safely;
- poor information hierarchy;
- major responsive/rendering defects.

Advantages:
- richer source material;
- easier contact discovery;
- App Builder's existing-site ingestion becomes directly useful;
- value can be demonstrated as a concrete replacement.

The engine should measure conversion, cost and support burden for both classes before choosing a default.

---

## 4. End-to-end target workflow

```text
large candidate pool
    |
    v
deterministic discovery + deduplication
    |
    v
website-presence / quality classification
    |
    v
business identity + activity verification
    |
    v
commercial suitability score
    |
    v
cheap bounded research
    |
    v
build-worthiness decision + hard cost budget
    |
    v
App Builder speculative build
    |
    v
deterministic QA
    |
    v
specialist visual/product review
    |
    v
bounded corrections + convergence
    |
    v
private/public preview candidate
    |
    v
outreach eligibility + compliance gate
    |
    v
personalised outreach
    |
    +--> no response -> bounded follow-up -> suppress/close
    |
    +--> interested -> human or automated sales/onboarding path
                           |
                           v
                        payment
                           |
                           v
                 ownership/content confirmation
                           |
                           v
                    production deployment
                           |
                           v
                 support/maintenance lifecycle
```

A large discovery pool must never imply a large build pool. The system should spend almost nothing on the majority of candidates.

---

## 5. Deterministic-first prospect funnel

The economic model depends on filtering aggressively before generative work.

Example directional funnel, not a fixed quota:

```text
10,000 discovered businesses
        -> 2,000 plausible website opportunities
        -> 800 verified active/suitable businesses
        -> 150 high commercial scores
        -> 50 bounded research candidates
        -> 5-15 speculative builds
        -> only converged/reviewed sites become outreach candidates
```

Early filters should be deterministic or low-cost wherever possible.

Potential signals:
- verified business identity;
- active/dormant/dissolved state where an authoritative registry exists;
- business category and geography;
- website presence and confidence;
- website quality findings for replacement candidates;
- recent evidence of operation;
- review count/recency where provider terms permit use;
- available public business contact route;
- likely need for a public marketing site;
- source-material richness;
- probable site complexity;
- prior contact/suppression state;
- estimated build cost versus expected commercial value.

The scoring model must be inspectable. A model may contribute judgement after deterministic evidence is gathered, but it may not silently decide which businesses receive expensive builds without a recorded score/reason/budget.

---

## 6. Provider-neutral prospect discovery

Introduce a future `ProspectProvider` boundary rather than hard-coding one directory/search platform.

Conceptual providers may include:
- authoritative company registries;
- local-business/place directories;
- search providers;
- approved open-data sources;
- licensed enrichment providers added only when their economics justify them.

Each source record should preserve:
- provider/source id;
- retrieved-at timestamp;
- business identity fields;
- source URL where applicable;
- licence/terms/use classification where required;
- confidence;
- data categories permitted for downstream use;
- raw-vs-derived distinction.

Provider data is evidence, not instruction authority.

Discovery adapters should support cost-aware routing so cheap/free evidence is exhausted before paid enrichment.

---

## 7. Website presence and quality classification

Do not equate a missing URL field with "has no website".

A candidate may have:
- no website;
- an undiscovered website;
- only a social profile;
- a marketplace/profile page rather than an owned site;
- an expired/broken domain;
- a functioning but poor site;
- a modern site that should be rejected as a prospect.

The engine should record a confidence-bearing classification and the evidence behind it.

For existing sites, run deterministic checks before AI visual judgement. Reuse the factory's own browser, accessibility, SEO, performance and design-evidence systems where appropriate rather than building a parallel auditor.

---

## 8. Contact discovery, provenance and suppression

Contact discovery is a separate problem from business discovery and should be treated as a high-governance boundary.

Every contact route must retain provenance:
- source;
- business/entity it belongs to;
- whether it is generic or identifies an individual;
- retrieval date;
- permitted-use/compliance state;
- verification/confidence;
- prior outreach state.

Maintain a durable global suppression registry covering at minimum:
- explicit opt-outs;
- invalid/bounced addresses;
- do-not-contact decisions;
- duplicate entities/domains;
- provider restrictions;
- legal/compliance exclusions.

Suppression must be checked before every outreach attempt and must override model suggestions.

Never create a brittle strategy that depends on unauthorised scraping of arbitrary platforms.

---

## 9. Speculative website build contract

A speculative build is still a real App Builder project and must use the normal factory contracts.

The commercial engine should create a bounded intake package containing only established information and explicit assumptions. The factory then performs its normal flow:

`intake -> Build Contract -> Manifest -> source ingestion -> knowledge -> composition -> generation -> QA -> review -> preview`

Special speculative-build rules:
- never invent awards, guarantees, prices, accreditations, team facts or service claims;
- do not publish third-party/public assets merely because they are visible online; existing rights/use/approval governance still applies;
- clearly distinguish observed facts, inferred presentation choices and generated marketing copy;
- avoid creating fake testimonials or fake customer counts;
- do not fabricate legal/privacy information on behalf of the prospect;
- use safe placeholders or omit unverifiable claims rather than guessing;
- record exactly what the prospective owner would need to confirm before production.

The aim is a persuasive **demonstration**, not impersonation or factual invention.

---

## 10. Speculative-build cost policy

Every prospect gets a hard commercial budget before expensive work begins.

Track at least:
- discovery/enrichment cost;
- AI research cost;
- build AI/model cost;
- deterministic compute/browser cost where material;
- preview hosting/storage cost;
- outreach cost;
- human intervention time/cost estimate;
- cumulative cost through each funnel stage.

Example policy shape:

```text
if expected_value * estimated_close_probability
   <= required_margin + remaining_speculative_cost:
       do not build
```

Do not use a fixed formula until real conversion data exists. Initially retain the components and evaluate decisions manually.

The engine should optimise **cost per sale and contribution margin**, not number of websites generated.

---

## 11. Quality gate before outreach

No website link should be sent merely because generation finished.

A speculative site becomes outreach-eligible only when:
- the generated project independently installs/checks/builds;
- required browser journeys close;
- serious/critical deterministic accessibility gates pass;
- required performance/SEO/security checks pass for the project class;
- desktop/tablet/mobile rendered evidence exists;
- factual/provenance rules pass;
- the visual/product reviewer passes it;
- bounded rework converges within the prospect budget;
- no unresolved severe finding remains;
- preview deployment is healthy;
- the outreach artefact references the exact reviewed preview revision.

If the build does not converge cheaply, drop the prospect rather than endlessly repairing speculative inventory.

---

## 12. Preview inventory

Prospective websites should use shared preview infrastructure rather than speculative custom domains.

Desired properties:
- stable, attractive preview URLs;
- per-prospect/revision isolation;
- no production credentials;
- clear ownership of preview lifetime;
- automatic expiry/archive of stale unsold previews;
- low storage/bandwidth cost;
- optional noindex/access controls where appropriate;
- exact revision identity linked to the commercial record.

A custom domain should normally be bought/configured only after purchase or explicit agreement.

---

## 13. Outreach workflow

The commercial advantage is that outreach can point to an already-built result.

Outreach should be:
- low-volume and highly qualified initially;
- truthful about what was built and why the business was selected;
- personalised from recorded evidence rather than fake familiarity;
- concise;
- linked to the exact reviewed preview;
- identifiable as coming from the real sender/business;
- easy to opt out from;
- bounded in follow-up count;
- stopped immediately by suppression/compliance rules.

The system should test variants carefully, but never optimise engagement by becoming deceptive, misleading or spammy.

Before activation in a geography/channel, obtain a current compliance review and encode the resulting deterministic eligibility rules. Do not rely on an LLM to interpret marketing law per message.

---

## 14. Reply and sales handling

Full hands-off sales should not be assumed at the start.

Initial maturity levels:

### Level 1 — build + draft

System finds, builds and prepares outreach; human approves/sends and handles replies.

### Level 2 — approved outbound automation

System sends only pre-qualified compliant outreach and bounded follow-ups; human handles positive/complex replies.

### Level 3 — assisted conversion

Agent can answer bounded factual questions about the offer, site and onboarding, while price changes, unusual promises, refunds, contractual commitments and sensitive requests escalate.

### Level 4 — productised self-serve purchase

For a proven fixed offer, the prospect can accept a defined package, pay, supply/approve final business information and trigger a production-onboarding task.

Do not begin at Level 4. Promotion between levels requires measured accuracy, compliance and conversion evidence.

---

## 15. Productised commercial models to test

Do not hard-code one pricing model into factory architecture.

Potential hypotheses:

### One-off sale

- prospect sees finished preview;
- fixed or tightly bounded purchase price;
- final content confirmation;
- production deployment/transfer;
- optional maintenance.

### Managed subscription

- minimal/no setup fee;
- site + hosting + SSL + forms + analytics/monitoring;
- bounded content updates;
- ongoing maintenance;
- domain management where agreed.

### Hybrid

- modest activation fee;
- lower monthly maintenance/hosting charge.

Measure:
- lead-to-response;
- response-to-sale;
- cost per speculative build;
- cost per qualified outreach;
- customer acquisition cost;
- gross/contribution margin;
- churn;
- support minutes per customer;
- update frequency;
- refund/cancellation causes.

The factory should make maintenance cheap, but economics must be proven rather than assumed.

---

## 16. Purchase and production onboarding

A sale does not automatically make every speculative assumption production-safe.

Before production:
- verify the authorised business owner/contact;
- confirm business name/contact/services/locations and other material facts;
- obtain final approval for logos/images/copy where required;
- resolve domain ownership/transfer;
- establish production environment identity;
- configure required secrets/integrations;
- activate forms/analytics/monitoring;
- run final production release gates;
- retain the sold preview revision and approved production revision in the ledger.

The commercial engine may request deployment, but normal App Builder release policy remains authoritative.

---

## 17. CRM/commercial state model

Use explicit durable states rather than an agent's conversational memory.

Directional prospect states:

`discovered -> deduplicated -> qualified -> researched -> build-approved -> building -> qa -> preview-ready -> outreach-eligible -> contacted -> follow-up -> interested -> won/lost/suppressed -> onboarding -> live -> retained/churned`

Record transition reason, evidence, actor and timestamps.

A prospect and an App Builder project are related but distinct entities. A business may have multiple prospect attempts/revisions without polluting factory project truth.

---

## 18. Safety and abuse controls

Before broad automation, implement hard controls for:
- global kill switch;
- provider-specific disable switches;
- per-day/per-domain/per-business outreach ceilings;
- duplicate detection;
- suppression enforcement;
- bounce/complaint handling;
- cost ceilings;
- preview inventory ceilings;
- source/asset rights governance;
- no production mutation without release authority;
- no outreach from an unreviewed build;
- no contact harvesting outside approved providers/terms;
- no model override of legal/compliance eligibility;
- full audit trail of discovery, build, review and contact actions.

High complaint/bounce/opt-out rates should automatically pause outbound activity for human review.

---

## 19. Suggested implementation sequence after activation

### PTC-0 — Economics-only manual pilot

Before building commercial infrastructure, manually use the mature App Builder to produce a small number of speculative sites for carefully selected businesses.

Measure:
- time/cost per prospect;
- manual edits;
- response/conversion;
- objections;
- support/onboarding burden.

Exit: evidence that the proposition is worth automating.

### PTC-1 — Read-only prospect discovery

Build provider-neutral discovery, identity resolution, deduplication and website classification. No outreach.

Exit: high precision on a manually reviewed candidate sample.

### PTC-2 — Deterministic qualification and cost scoring

Add prospect scorecards, activity/suitability rules, build-cost prediction and explicit rejection reasons.

Exit: the top-ranked candidates are materially better than random/manual search.

### PTC-3 — Speculative-build adapter

Convert an approved prospect record into a normal App Builder project/intake package with a hard speculative budget.

Exit: builds remain ordinary factory jobs and respect all existing contracts/gates.

### PTC-4 — Autonomous review-to-preview pipeline

Use the proven Phase 5/6 runtime to build, test, review, rework and publish only converged preview candidates.

Exit: a batch can run with low intervention and bounded cost without quality regression.

### PTC-5 — Contact provenance + compliance engine

Add approved contact sources, provenance, suppression, geography/channel policy and eligibility decisions. Still no broad sending.

Exit: every potential contact is auditable and suppression fails closed.

### PTC-6 — Human-approved outreach pilot

Generate personalised outreach and have a person approve sending. Track complete funnel metrics.

Exit: economically and operationally promising conversion without unacceptable complaint/compliance risk.

### PTC-7 — Bounded automated outreach

Automate sending/follow-ups only for categories/geographies/channels proven safe and effective. Retain hard limits and global pause.

### PTC-8 — Self-serve purchase/onboarding

Only after a stable offer exists, connect payment, final-information approval and production onboarding.

### PTC-9 — Portfolio optimisation

Use accumulated evidence to optimise:
- business categories;
- prospect classes;
- scoring weights;
- build budgets;
- offer/pricing;
- outreach timing/copy;
- model selection;
- preview lifetime;
- maintenance packages.

Changes are proposed/versioned/benchmarked. No silent self-modifying sales system.

---

## 20. Programme success criteria

The programme should be considered successful only when it demonstrates all of the following over a meaningful sample:
- high prospect-classification precision;
- consistently saleable website quality;
- low median manual intervention;
- bounded and predictable speculative cost;
- a compliant, low-complaint outreach process;
- positive conversion signal;
- customer acquisition cost below expected contribution margin;
- production onboarding with little manual engineering;
- low ongoing support burden;
- no weakening of App Builder's provenance, security, environment or release boundaries;
- generated customer sites remain ordinary portable repositories.

A large number of generated previews is **not** a success metric.

The core north-star metric is profitable, trustworthy conversion from **qualified business -> reviewed website -> paying customer**, with App Builder remaining a general-purpose factory rather than becoming a prospecting product internally.

---

## 21. Explicit non-goals

This future programme is not permission to:
- turn App Builder into a mass-spam platform;
- generate thousands of low-quality generic sites because generation is cheap;
- scrape arbitrary services in breach of their terms;
- impersonate business owners;
- publish unverified factual claims;
- buy speculative domains for every prospect;
- allow a sales agent to bypass factory QA/release rules;
- couple customer websites to the commercial engine;
- move this work ahead of the core factory's proof and quality programme.

The sequencing rule is simple:

> **First prove App Builder can repeatedly create exceptional real-business websites with low intervention. Only then use that proven factory to automate customer acquisition.**
