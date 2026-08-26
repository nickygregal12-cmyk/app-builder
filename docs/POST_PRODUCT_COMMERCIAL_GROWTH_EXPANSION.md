# Post-Product Commercial Growth Expansion

Status: **future commercial expansion only — inactive until the core Prospect-to-Customer Engine is proven**.

This document extends `docs/POST_PRODUCT_PROSPECT_TO_CUSTOMER_ENGINE.md` after the initial proposition has been validated in the real world. The first programme proves that App Builder can identify a suitable business, create a high-quality evidence-backed speculative website, present it credibly, win the customer and onboard the site safely. This expansion begins only after that loop has demonstrated repeatable positive economics.

The commercial objective is to move beyond selling websites as a commodity and build a three-layer business:

```text
1. ACQUISITION ENGINE
   find and convert the right businesses

2. CUSTOMER GROWTH PRODUCT
   help those businesses acquire and convert customers

3. RETENTION ENGINE
   prove value, improve results and reduce churn
```

The website remains the initial product and conversion asset. It should not remain the whole value proposition once the business model is proven.

---

## 1. Activation gate

Do not implement this expansion while the underlying prospect-to-customer proposition is still unproven.

Work may begin only when:

1. the activation gates in `POST_PRODUCT_PROSPECT_TO_CUSTOMER_ENGINE.md` have already been satisfied;
2. the PTC-0 economics pilot has shown real willingness to pay;
3. at least one prospect class and business vertical has produced a meaningful positive conversion signal;
4. speculative build cost, customer acquisition cost and support burden are measured rather than guessed;
5. recurring billing/maintenance can be supported safely;
6. customer sites can be monitored and changed through normal App Builder release controls;
7. consent/authorisation boundaries for customer accounts, analytics, review workflows, business profiles and messaging are explicit;
8. the owner explicitly chooses to expand from website sales into managed growth services.

The rule remains: **prove one profitable loop before adding more surface area**.

---

## 2. Commercial positioning

Do not position the mature service as:

> AI website design.

AI website generation will be increasingly commoditised. The differentiator should become:

> We identify where a business's online presence is underperforming, build the improved system before asking them to buy it, operate the boring parts for them, and show what enquiries and outcomes it produces.

The service should sell a managed business outcome rather than access to an AI builder.

For suitable local-service businesses the eventual offer may combine:

- website;
- hosting and domain operations;
- local-search presence;
- enquiry capture;
- conversion journeys;
- review/reputation workflows;
- lead follow-up/recovery;
- analytics and attribution;
- ongoing improvements;
- monitoring and maintenance.

Not every vertical needs every capability. Packages must remain evidence-led and productised rather than becoming bespoke agency scope.

---

## 3. Vertical-specific commercial packages — highest priority

Generic small-business websites should not remain the long-term unit of sale.

Introduce a future `CommercialVerticalSpec` owned by the commercial layer, not `factory-core`.

A vertical spec should describe proven commercial defaults such as:

- target business category;
- common customer jobs-to-be-done;
- high-value services;
- typical buying journey;
- required trust signals;
- recommended page/service structure;
- enquiry types;
- suitable CTAs;
- booking/quote/contact expectations;
- useful image jobs;
- local-area structure;
- review/reputation requirements;
- expected lead lifecycle;
- common objections;
- optional recurring growth capabilities;
- support complexity;
- observed pricing/conversion/churn evidence.

Example directional packages might eventually include:

### Roofing Enquiry System

- emergency and planned-work service pages;
- local service areas;
- project gallery;
- quote request;
- call-first mobile journey;
- review proof;
- accreditation/trust slots only when verified;
- follow-up for unanswered quote requests.

### Landscaping Lead System

- visual project portfolio;
- project-type/service pages;
- geographic targeting;
- consultation/quote workflow;
- before/after content;
- review requests after completed jobs.

### Professional-services Lead System

- service/problem-led landing pages;
- expertise/team proof;
- consultation enquiry;
- content/FAQ structure;
- appropriate attribution and follow-up.

These are examples, not initial commitments. Real sales/support data decides which verticals deserve a product.

### Vertical promotion rule

A vertical becomes a first-class package only after evidence shows that it materially improves one or more of:

- close rate;
- average selling price;
- recurring revenue;
- support cost;
- build cost;
- retention;
- customer outcomes.

Do not create dozens of vertical templates merely because the factory can.

---

## 4. Commercial Opportunity Score and build economics

Extend prospect scoring from website need into expected commercial value.

The score should remain inspectable and evidence-backed.

Potential dimensions:

```text
business quality/activity
website/digital gap
review/reputation strength
competitor disadvantage
local/customer demand evidence
contactability
vertical fit
source-material quality
expected build complexity
likely recurring-service fit
historical conversion similarity
```

Keep the opportunity score separate from a financial decision model.

A future build-economics record should retain:

- expected offer value;
- estimated close probability;
- historical confidence/sample size;
- research cost;
- expected build cost;
- QA/rework cost;
- preview/outreach cost;
- human-review cost estimate;
- expected onboarding cost;
- expected gross/contribution margin;
- recurring-value estimate only where real retention data exists.

Do not fabricate precision. Early probabilities are hypotheses and must be marked as such.

The north-star decision is not "is this company interesting?" but:

> Is this prospect worth spending the next pound of speculative acquisition cost on?

---

## 5. Evidence-backed competitive before/after

For weak/outdated-site prospects, produce a professional comparison artifact using only defensible findings.

### Existing presence

Possible evidence:

- current desktop/mobile captures;
- broken journeys or links;
- deterministic performance findings;
- accessibility findings;
- metadata/indexability/structured-data gaps;
- unclear or missing enquiry path;
- missing relevant service information;
- stale or contradictory content where dates/facts can be established;
- competitor feature/presentation differences with source evidence.

### Proposed presence

Show:

- exact approved preview screenshots;
- corrected information hierarchy;
- improved mobile route to enquiry;
- service/location structure;
- functioning quote/contact flow;
- deterministic SEO/accessibility improvements;
- any additional feature the new build genuinely contains.

Never shame the prospect or claim the existing site is "losing £X" without reliable evidence.

The tone should be:

> We found several concrete opportunities worth showing rather than describing.

---

## 6. Customer Growth Product

Once a business buys, the service should have a path from website delivery to measurable managed value.

### 6.1 Lead and conversion attribution — P0 commercial expansion

This is the most important recurring-value capability.

Track attributable actions such as:

- website forms;
- quote requests;
- booking completions;
- click-to-call;
- messaging/WhatsApp clicks where applicable;
- CTA interactions;
- landing/source page;
- campaign/source metadata where reliable;
- customer-confirmed won/lost lead state;
- optional customer-entered revenue/value.

Do **not** infer revenue that the customer has not supplied or that cannot be reliably attributed.

The useful customer report should evolve from:

> 423 visits

into something closer to:

```text
19 enquiries
11 phone-call actions
6 quote requests
3 jobs marked won by the customer
£X customer-confirmed value
```

Attribution confidence must be explicit.

### 6.2 Local presence / business-profile operations

Where provider APIs, permissions and terms allow, create a managed local-presence capability around the customer's owned accounts.

Potential functions:

- detect inconsistent name/address/phone/hours;
- monitor destination URLs;
- surface incomplete service/category/profile information;
- identify outdated opening hours;
- suggest approved profile/content updates;
- surface missing/recent photos for owner action;
- report search/profile performance when available;
- reconcile website facts with business-profile facts.

Requirements:

- explicit customer authorisation;
- provider-neutral adapter boundary;
- provider terms respected;
- no agent publishes account/profile changes without the required policy/approval;
- customer-owned accounts remain customer-owned.

### 6.3 Review and reputation workflow

Create a review/reputation capability only with customer authorisation and compliant provider use.

Potential flow:

```text
job/customer lifecycle event
-> appropriate review request
-> review destination
-> new review detected where supported
-> owner notified
-> AI drafts response
-> owner or approved automation publishes
-> approved high-quality reviews become candidates for website proof
```

Rules:

- never fabricate or selectively misrepresent reviews;
- do not gate or manipulate reviews unlawfully;
- preserve source/date/provider identity;
- AI-generated responses are drafts until the applicable automation level is approved;
- negative reviews are not hidden by the system merely because they are commercially inconvenient.

### 6.4 Missed-enquiry and quote recovery

This should become a premium differentiator for verticals where a lead has meaningful value.

Potential flows:

```text
new enquiry
-> immediate acknowledgement
-> business has not actioned within threshold
-> reminder/follow-up
-> appointment/quote progression
```

and, where authorised data exists:

```text
quote/opportunity went dormant
-> eligibility check
-> bounded re-engagement
-> reply/booking
```

This capability must remain distinct from bulk cold prospecting.

Requirements:

- customer-authorised data only;
- clear identity and opt-out where applicable;
- no invented promises/prices/availability;
- escalation for sensitive/complex responses;
- attribution of recovered opportunity when evidence supports it.

This creates a path to higher-value subscriptions because the service is protecting existing demand as well as generating it.

---

## 7. Conversion optimisation for paying customers

A launched site should not become frozen inventory.

Run a bounded periodic improvement loop using observed evidence.

Possible inputs:

- traffic and landing-page behaviour;
- enquiry conversion;
- customer-confirmed lead quality;
- broken journeys;
- search queries/pages where available;
- new reviews;
- newly approved photos/projects;
- page performance;
- competitor/reference changes where worth checking;
- support requests;
- customer edits.

Potential proposals:

- stronger CTA on a high-traffic low-conversion page;
- new service/location page when real demand and business coverage support it;
- refreshed proof section using new approved reviews;
- improved quote form;
- clearer pricing/process explanation when the business approves it;
- removal/consolidation of low-value content;
- technical performance/SEO repair.

Changes are proposed, versioned, tested and released through App Builder's normal controls. The commercial layer must not silently edit production sites because an optimisation model predicted an uplift.

A/B testing should use the factory's later controlled-experiment architecture rather than a parallel sales experiment system.

---

## 8. Preview engagement and sales-priority scoring

After outreach, use the prospect's interaction with the actual preview as a sales-priority signal where privacy/compliance rules permit.

Potential signals:

- preview visited;
- repeat session;
- pages viewed;
- mobile/desktop use;
- services/about/contact/pricing page visits;
- CTA interaction;
- return after follow-up.

Avoid relying on email-open pixels as a core signal.

The score should decide **priority**, not manipulate the prospect.

Example:

```text
preview viewed twice
services and contact viewed
returned next day
=> high-priority human follow-up
```

No engagement must never override suppression, opt-out or legal eligibility rules.

---

## 9. Productised maintenance and ownership

Turn the ongoing service into something the customer understands and can evaluate.

Potential managed inclusions:

- hosting/SSL;
- domain operations where agreed;
- uptime/health monitoring;
- form health;
- analytics/lead reporting;
- security/dependency maintenance;
- bounded content changes;
- image/content updates;
- local-presence monitoring;
- review workflow;
- recurring improvement proposals;
- backup/rollback/release history.

Define explicit monthly support/change budgets rather than vague "unlimited changes" promises unless economics prove otherwise.

Track support minutes and intervention cost per customer so unprofitable packages are visible.

---

## 10. Referral and partner acquisition

Cold outbound should not remain the only acquisition channel after customers exist.

### Customer referrals

Support a configurable referral programme with:

- referral identity/link/code;
- referrer/referee attribution;
- reward eligibility;
- fraud/duplicate checks;
- reward state;
- economics reporting.

Potential rewards may include account credit, a free month or another approved benefit. Do not hard-code the reward until economics are known.

### Partner channels

Later evaluate partnerships where there is genuine fit, for example:

- accountants/bookkeepers serving small businesses;
- local business consultants;
- trade associations;
- print/signage/branding providers;
- IT support firms;
- specialist agencies that do not want to build websites themselves.

A partner channel should be adopted only when customer acquisition cost and lead quality outperform direct acquisition enough to justify revenue share/operational complexity.

---

## 11. Retention Engine

The system should actively answer:

> Why should this customer still pay us next month?

### Monthly value report

Produce a concise customer-facing report containing only reliable data:

- enquiries/leads;
- quote/bookings;
- call/message actions;
- customer-marked wins/value;
- review activity;
- site/profile health;
- work completed by the service;
- recommended next action;
- unresolved customer inputs/blockers.

Avoid vanity-metric overload.

### Churn-risk signals

Potential signals:

- customer stops logging in/responding;
- zero leads for a material period;
- unresolved support issues;
- repeated failed forms/integrations;
- cancelled payment;
- usage/value decline;
- many manual requests outside package scope;
- customer expresses dissatisfaction.

Risk detection should trigger human/customer-success action before any automated sales pressure.

### Retention improvements

Track which interventions actually reduce churn:

- report clarity;
- proactive fixes;
- review growth;
- new content/projects;
- conversion changes;
- faster lead response;
- pricing/package changes.

---

## 12. Commercial packages and pricing experiments

The original one-off/subscription/hybrid hypotheses remain valid, but the mature service may support value tiers.

Illustrative structure only:

### Website / Presence

- site;
- hosting;
- forms;
- monitoring;
- bounded edits.

### Growth

- Presence package;
- lead attribution;
- local-presence monitoring;
- review workflow;
- periodic optimisation.

### Revenue / Premium

- Growth package;
- missed-enquiry follow-up;
- dormant quote/opportunity recovery where appropriate;
- richer attribution/reporting;
- priority support/automation.

Do not choose prices from feature count alone. Price experiments should measure:

- conversion;
- gross margin;
- MRR/ARR;
- churn;
- support cost;
- payment failure;
- upgrade/downgrade behaviour;
- customer-reported value.

The goal is not to maximise headline monthly price. It is to find a package with strong lifetime contribution margin and low support complexity.

---

## 13. Commercial learning loop

The prospect/customer dataset should make the system better at selecting opportunities, not create an opaque self-modifying sales model.

Track relationships such as:

- prospect signal -> reply rate;
- prospect signal -> close rate;
- vertical -> close rate;
- vertical -> build cost;
- vertical -> support cost;
- evidence-pack type -> engagement;
- screenshot format -> engagement;
- domain availability -> conversion;
- offer -> conversion;
- price -> conversion/churn;
- preview engagement -> close rate;
- product capability -> retention;
- lead outcomes -> retention;
- referral source -> lifetime value;
- customer edit/request categories -> product improvements.

Use minimum-sample/confidence rules before changing defaults.

Changes to scoring, vertical specs, pricing, outreach, packages and product defaults must be:

1. proposed from evidence;
2. reviewed;
3. versioned;
4. benchmarked or piloted;
5. reversible.

No silent self-optimising acquisition algorithm.

---

## 14. Revised commercial architecture

```text
ACQUISITION ENGINE
    |
    +-- prospect discovery
    +-- evidence/opportunity scoring
    +-- vertical fit
    +-- speculative build
    +-- screenshots + domain options
    +-- personalised outreach
    +-- preview engagement
    +-- conversion
    |
    v
CUSTOMER GROWTH PRODUCT
    |
    +-- website + hosting
    +-- lead capture
    +-- local presence
    +-- reviews/reputation
    +-- attribution
    +-- enquiry/quote recovery
    +-- conversion optimisation
    |
    v
RETENTION ENGINE
    |
    +-- monitoring
    +-- proactive improvements
    +-- monthly value reporting
    +-- churn-risk detection
    +-- referrals
    +-- upgrade/renewal
    |
    v
COMMERCIAL LEARNING
    |
    +-- economics by vertical
    +-- conversion evidence
    +-- retention evidence
    +-- support-cost evidence
    +-- reviewed product/scoring improvements
```

The three operational layers should remain separate enough that failure or disablement of prospecting cannot break existing customer websites.

---

## 15. Later-stage implementation sequence

These stages extend PTC-0 through PTC-9. They do not move ahead of those stages.

### PTC-10 — Vertical economics discovery

Analyse the proven pilot/customer corpus by business class.

Build:

- vertical scorecard;
- conversion/build/support/churn measures;
- first `CommercialVerticalSpec` candidates;
- explicit non-adoptions for weak verticals.

Exit: at least one vertical demonstrates materially stronger economics than generic targeting, or the factory deliberately remains generic.

### PTC-11 — Lead attribution and customer value reporting

Build provider-neutral customer-owned measurement for forms, quote journeys, bookings, call/message actions and customer-confirmed outcomes.

Exit: customers can see meaningful attributed outcomes without invented ROI.

### PTC-12 — Managed local presence + reputation

Add approved local-profile monitoring/operations and review workflows behind customer authorisation and provider-policy boundaries.

Exit: one vertical demonstrates useful recurring value with acceptable operational burden.

### PTC-13 — Enquiry recovery and premium automation

Add customer-authorised missed-enquiry/quote follow-up for suitable verticals.

Exit: recovered opportunities can be evidenced, automation remains bounded, and the capability supports a profitable premium package.

### PTC-14 — Continuous optimisation + retention

Add periodic site/growth analysis, proposed improvements, monthly value reports and churn-risk handling.

Exit: measured retention/support economics improve versus website-only customers.

### PTC-15 — Referral/partner acquisition

Add customer referrals first; evaluate selected partner channels only after direct acquisition is understood.

Exit: referred/partner customers show competitive acquisition cost and lifetime value.

### PTC-16 — Portfolio economics and capital allocation

Optimise the whole commercial portfolio:

- which prospects receive research;
- which receive speculative builds;
- which verticals receive capacity;
- which packages receive development work;
- which customers receive proactive interventions;
- where AI/model spend has the highest expected contribution value.

The objective becomes allocating finite AI/compute/human attention to the work with the best evidence-backed return.

---

## 16. Commercial scorecard

The commercial programme should eventually expose a small number of authoritative metrics.

### Acquisition

- qualified prospects;
- speculative builds;
- outreach candidates;
- replies;
- sales;
- cost per qualified prospect;
- cost per sale/CAC;
- speculative cost per won customer.

### Revenue

- one-off revenue;
- MRR/ARR;
- average revenue per customer;
- expansion/contraction;
- gross/contribution margin.

### Customer value

- attributable enquiries;
- customer-confirmed wins/value where supplied;
- lead response/recovery metrics;
- review/reputation changes where reliable.

### Retention

- logo/customer churn;
- revenue churn;
- retention by vertical/package;
- support minutes/cost;
- intervention frequency;
- cancellation reason.

### Factory economics

- AI/model spend per prospect/build/customer;
- deterministic compute cost;
- manual edit/review cost;
- cost by vertical/package;
- build/rework failure rate.

A large number of generated sites or emails is never a north-star metric.

---

## 17. Explicit non-goals

This expansion is not permission to:

- become a generic full-service marketing agency with unlimited bespoke work;
- promise search rankings or revenue outcomes that cannot be guaranteed;
- manipulate/fabricate reviews;
- silently operate customer-owned third-party accounts;
- send recovery/review messages without proper authority;
- infer revenue from clicks;
- add every possible CRM/marketing feature;
- optimise customers or prospects through deceptive dark patterns;
- build provider lock-in into customer websites;
- let commercial automation bypass App Builder release/security/provenance rules.

The strategic rule is:

> **Acquire with a finished result, retain with measurable value, and expand only where evidence shows the service improves customer outcomes and contribution margin.**
