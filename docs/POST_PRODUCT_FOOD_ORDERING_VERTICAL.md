# Post-Product Food & Takeaway Direct-Ordering Vertical

Status: **future premium commercial vertical only — inactive until App Builder, the Prospect-to-Customer Engine and the Commercial Growth Expansion are proven**.

This document extends:

- `docs/POST_PRODUCT_PROSPECT_TO_CUSTOMER_ENGINE.md`;
- `docs/POST_PRODUCT_COMMERCIAL_GROWTH_EXPANSION.md`.

It defines a later high-value commercial vertical for restaurants, takeaways, cafes and similar food businesses that already demonstrate digital demand through delivery marketplaces, local search and reviews but have no meaningful owned website or no strong direct-ordering channel.

This is intentionally **not** an early vertical. A food website with live ordering is an operational commerce system. The value can be high, but so can the failure cost. A paid order that nobody in the venue sees is materially worse than a broken brochure-site contact form.

The core proposition is:

> **The business already has online demand. Build it a high-quality owned web presence and a reliable direct-ordering channel that reaches the kitchen or counter through the systems staff actually use.**

The product must never be sold as merely "a website with an order button".

---

## 1. Activation gate

Do not implement this vertical because restaurant sites look commercially attractive.

Work may begin only when:

1. App Builder's real-business website quality is repeatedly saleable with low intervention;
2. the Prospect-to-Customer Engine has proven willingness to pay and positive acquisition economics in simpler verticals;
3. the Commercial Growth Expansion has reliable recurring billing, attribution, monitoring and customer-support controls;
4. payments, secrets, webhooks, queues, retries, durable events and production release controls are mature;
5. at least one provider-neutral ordering integration path has been proven end to end in a sandbox/test merchant environment;
6. order delivery to the venue has a tested primary channel, secondary alert path and deterministic failure/escalation policy;
7. payment/order reconciliation and refund/cancellation handling are tested under failure conditions;
8. menu, pricing, opening-hours, delivery/collection and allergen provenance can fail closed rather than guess;
9. current food-law, allergen, payments, privacy, provider-terms and marketplace-terms requirements have been reviewed for the target geography;
10. a human has observed repeated test orders reaching the actual receiving workflow that venue staff would use;
11. the owner explicitly activates food ordering as a premium vertical.

The launch criterion is **operational reliability**, not merely a successful checkout demo.

---

## 2. Commercial hypothesis

This vertical is attractive because marketplace presence can provide strong evidence that a business already values online ordering.

A high-value prospect may look like:

```text
active food business                  yes
recent customer activity/reviews      yes
marketplace ordering presence         yes
meaningful owned website              no / weak
strong direct-ordering route          no
menu already digitised                yes
food-hygiene record found             yes
sensible domain candidate             yes
contact route                         yes
operational fit                       likely
```

The pitch is not:

> You should get a website.

It is closer to:

> You already take orders online. We have built a branded owned site and can give customers an additional direct route to order from you, subject to your menu, operations and account approvals.

Do not claim that direct ordering will save a specific commission amount unless the restaurant's actual marketplace/provider economics are known and the comparison is valid.

Do not imply that marketplace demand will automatically transfer to an owned channel.

---

## 3. Prospect classes

### Class F1 — Marketplace-active, no meaningful owned website

Strong indicators:

- active marketplace listings;
- meaningful recent review volume;
- active local-business profile;
- menu available from a permitted/authorised source;
- no dedicated business website or only social/profile pages;
- no obvious direct-ordering route.

This is the cleanest "owned presence" proposition.

### Class F2 — Owned website, weak or absent direct ordering

Strong indicators:

- established website and domain;
- menu exists but ordering redirects entirely to a marketplace or requires telephone ordering;
- weak mobile ordering journey;
- outdated menu/presentation;
- poor conversion route;
- good business/review evidence.

The proposition is an operational upgrade rather than a first website.

### Class F3 — Existing direct ordering but weak implementation

Later only.

Potential issues:

- broken checkout;
- poor mobile UX;
- stale menu/hours;
- unreliable order notifications;
- weak repeat-order experience;
- no useful attribution/retention layer.

Do not target functioning modern direct-ordering systems merely because App Builder could redesign them.

---

## 4. Discovery and evidence sources

Use provider-neutral, terms-compliant discovery.

Potential evidence classes:

- official food-business / food-hygiene records;
- local-business/place data;
- permitted marketplace presence evidence;
- search results;
- reviews and recency where provider terms allow;
- existing website/domain;
- opening hours;
- menu existence;
- social presence;
- direct-ordering presence;
- public contact routes.

For the UK, the Food Standards Agency Food Hygiene Rating Scheme API is a useful authoritative discovery/enrichment source. As reviewed on 2026-08-26, the UK API catalogue describes it as free programmatic access to FSA rating data with no API key/signup currently required.

Treat hygiene data as sourced evidence with retrieved-at timestamps. Never convert it into unsupported claims about food quality.

Marketplace presence must be discovered through permitted APIs, licensed providers, search/index evidence or other terms-compliant methods. Do not make this vertical depend on scraping protected marketplace pages.

---

## 5. Food Opportunity Score

Add food-specific dimensions to `CommercialVerticalSpec` / commercial scoring.

Potential score dimensions:

```text
business activity / establishment confidence
recent customer/review activity
marketplace ordering evidence
owned-site gap
direct-ordering gap
menu-source quality
contactability
opening-hours confidence
food-hygiene record confidence
brand/content richness
domain availability
estimated order-system complexity
existing POS/order-provider compatibility
collection/delivery model complexity
allergen-data readiness
historical conversion similarity
expected recurring-service fit
```

A strong web gap is not enough. A food prospect should be rejected or deferred when its operational data cannot be made trustworthy.

Example build decision:

```text
Opportunity score              89/100
Website build complexity        low
Ordering complexity          medium
Menu provenance                high
Allergen readiness             unknown
Order receiver integration     likely

Decision:
BUILD WEBSITE PREVIEW
DO NOT ENABLE LIVE ORDERING UNTIL OWNER ONBOARDING
```

This separation is important. The speculative preview can demonstrate the intended ordering UX without accepting real orders.

---

## 6. Speculative preview rules

Before purchase/authorisation, the prospect site may demonstrate:

- homepage;
- menu structure;
- product/category presentation;
- collection/delivery UX concept;
- restaurant story/about;
- contact/location/hours;
- reviews/proof from approved sources;
- hygiene-rating evidence where appropriate and accurately sourced;
- mobile ordering journey;
- loyalty/reorder concept;
- suggested domain;
- evidence-backed opportunity report.

But the speculative site must not:

- accept real payments;
- accept real orders;
- impersonate the restaurant as an authorised live ordering channel;
- publish unverified allergens;
- invent menu items, prices, portion sizes, offers, dietary claims or delivery areas;
- imply a marketplace/provider relationship that does not exist;
- publish third-party food photography without rights/approval.

Use a clearly non-live checkout demonstration until the business has purchased/authorised onboarding.

---

## 7. Menu intelligence and provenance

Menu data is operational truth, not marketing copy.

Create a future `MenuSpec` / food-menu contract containing at minimum:

- menu/category identity;
- item identity;
- item name/description;
- base price;
- variants/sizes;
- modifiers/toppings/options;
- required/optional modifier rules;
- quantity limits where relevant;
- meal/deal/bundle relationships;
- availability/sold-out state;
- service-time availability;
- collection/delivery eligibility;
- tax/service-charge behaviour where relevant;
- allergen references;
- dietary labels only when verified;
- source/provenance;
- last verified/updated timestamp;
- owner approval state.

Potential sources after customer authorisation:

- connected POS/catalogue provider;
- restaurant-owned spreadsheet/CSV;
- restaurant-owned PDF/menu;
- existing owned website;
- authorised marketplace/provider import where supported;
- manual owner confirmation.

The source of truth should preferably become the connected merchant catalogue/POS once live.

Do not maintain two silently diverging menus if a provider can be authoritative.

AI may help normalise descriptions/categories after facts are established, but it must never guess prices, modifiers, allergens, availability or dietary claims.

---

## 8. Ordering architecture

Prefer integrations over rebuilding restaurant commerce from first principles.

Provider-neutral shape:

```text
customer
   |
   v
restaurant website / ordering UI
   |
   v
OrderingProviderAdapter
   |
   +--> catalogue/menu
   +--> cart/pricing
   +--> payment
   +--> order creation
   +--> fulfilment state
   +--> refunds/cancellations
   +--> provider webhooks
   |
   v
durable OrderRecord + event ledger
   |
   v
Order Delivery Controller
   |
   +--> POS / Order Manager
   +--> KDS
   +--> kitchen/counter printer
   +--> staff order-receiver app/tablet
   +--> secondary manager alert
   +--> escalation/failure workflow
```

The generated customer site must remain portable and must not require the Prospect-to-Customer Engine to serve orders at runtime.

Provider-specific ordering adapters are replaceable integrations, not App Builder architectural truth.

Current-provider prior art should be reviewed when implementation begins. As of 2026-08-26, Square documents that paid orders with fulfilment can appear in Square POS / Dashboard Order Manager, its Orders API exposes order/fulfilment events, and Square Order Manager supports in-app alerts and order-printer settings. This is evidence that the integration pattern is viable, not a commitment to Square as the permanent provider.

---

## 9. The Order Delivery Guarantee

This vertical must introduce an explicit product invariant:

> **A customer-facing successful payment is not treated as proof that the venue has received and accepted the order.**

The system must separately prove payment state, routing state and venue acknowledgement state.

Directional order lifecycle:

```text
cart
-> checkout-started
-> payment-authorised/paid
-> order-created
-> routed-to-venue
-> delivered-to-primary-channel
-> acknowledged-by-venue
-> preparing
-> ready-for-collection / out-for-delivery
-> completed

or

-> routing-failed
-> escalation-active
-> rejected/cancelled
-> refund/reversal workflow
```

Every transition is durable, timestamped and attributable to a provider event, staff action or deterministic controller.

Never collapse `paid`, `sent`, `received` and `accepted` into one status.

---

## 10. How the venue actually receives the order

A food business should not need an employee staring at an App Builder browser dashboard.

Use an ordered set of real operational channels.

### Primary channel A — existing POS / Order Manager

Preferred where supported.

A paid order is injected into the restaurant's existing order-management workflow, ideally the same workflow staff already monitor for counter/online orders.

Potential provider capabilities:

- POS order queue;
- Order Manager;
- fulfilment state updates;
- customer/order details;
- item/modifier tickets.

### Primary channel B — KDS

For kitchens with a supported Kitchen Display System:

- new orders appear in the kitchen queue;
- item/modifier detail is structured;
- preparation/ready state can feed back into order status.

### Primary channel C — automatic kitchen/counter printing

For businesses that work from printed tickets:

- paid accepted/routed orders print automatically;
- use the provider's supported order-printer path where possible;
- print order number, fulfilment type/time, items, modifiers, notes and clearly separated allergy-related information supplied/verified by the merchant;
- printer failures become health events, not silent failures.

### Primary channel D — dedicated order receiver

For businesses without a suitable POS integration, evaluate a lightweight restaurant-side receiver on an existing phone/tablet.

Requirements:

- persistent loud new-order alert;
- clear Accept / Reject / Delay action;
- cannot silently dismiss a paid order;
- current order queue;
- preparation/ready controls;
- device/account authentication;
- heartbeat/last-seen health where technically reliable;
- offline/reconnect behaviour;
- duplicate-safe delivery;
- remote diagnostics;
- optional printer bridge only after reliability is proven.

A PWA may be evaluated, but do not assume browser push alone is reliable enough for paid food orders. A native/wrapped receiver or established provider app may be safer if testing proves it necessary.

### Secondary channel — manager escalation

If the primary channel does not produce the required acknowledgement within a venue-configured threshold:

- repeat the primary alert where appropriate;
- alert a configured manager/secondary device;
- send SMS or another approved high-attention notification;
- optionally evaluate automated voice escalation for severe unacknowledged-order cases;
- surface the incident in support/operations tooling.

Email may be useful as an audit/secondary notification but should **not** be the sole high-reliability mechanism for time-sensitive paid takeaway orders.

---

## 11. Acknowledgement and escalation policy

Each venue gets an explicit `OrderReceptionPolicy` describing:

- primary receiver;
- backup receiver;
- acknowledgement threshold;
- preparation-time default;
- auto-accept eligibility if any;
- escalation contacts;
- max unacknowledged time;
- pause-ordering threshold;
- cancellation/refund policy integration;
- support escalation path.

Example policy shape only:

```text
0s    paid order created
      -> route to POS/KDS/printer/receiver

T1    no acknowledgement
      -> repeat high-attention alert
      -> secondary manager notification

T2    still unacknowledged
      -> escalation event
      -> consider temporary new-order pause
      -> customer status remains truthful

T3    cannot establish fulfilment
      -> deterministic reject/cancel/refund path
      -> notify customer
      -> keep ordering paused until venue health recovers
```

Do not hard-code universal T1/T2/T3 values. Different kitchens and providers need evidence-based policies.

The controller must prefer a false pause over silently taking orders that cannot reach the venue.

---

## 12. Channel-health and circuit-breaker controls

Before allowing checkout, verify as much operational health as the integration can prove.

Potential health signals:

- provider account connected;
- valid location identity;
- menu/catalogue sync healthy;
- payments operational;
- order webhook endpoint healthy;
- primary order-receiver status known;
- printer/KDS integration state where exposed;
- venue manually marked open for orders;
- service hours valid;
- no unresolved order-delivery incident;
- no provider outage flag known.

Hard controls:

- idempotency on order/payment creation;
- duplicate-order suppression;
- durable webhook inbox;
- retries with backoff;
- dead-letter/error queue;
- payment/order reconciliation;
- stale-order detector;
- unacknowledged-order detector;
- provider circuit breaker;
- venue-level pause switch;
- global emergency pause;
- automatic safe degradation when a critical receiver fails.

Repeated order-reception failure must automatically pause or degrade direct ordering rather than accumulating unseen paid orders.

---

## 13. Customer order-status truth

Customer messaging must reflect reality.

Do not show:

> Order confirmed

merely because payment succeeded if venue acknowledgement is still required.

Possible truthful states:

- payment received / waiting for restaurant confirmation;
- restaurant accepted;
- preparing;
- ready for collection;
- out for delivery;
- completed;
- delayed;
- unable to accept / refund in progress.

Where the ordering provider already owns these states, consume the provider's authoritative status instead of creating a competing state machine.

Current provider prior art reviewed in August 2026 includes customer email/text order-progress alerts and fulfilment events. Use provider-native capabilities where they are reliable and reduce custom operational code.

---

## 14. Collection, delivery and fulfilment modes

Start with the simplest operational mode that produces real value.

Recommended adoption sequence:

1. **Collection only** — lowest delivery complexity;
2. **restaurant's own delivery** — only when delivery zones/fees/times are trustworthy;
3. **supported on-demand courier integration** — only through a proven provider/adapter;
4. more complex multi-location / multi-driver orchestration later.

`FulfilmentSpec` should capture:

- collection/delivery availability;
- service hours;
- collection lead time;
- delivery zones/radius/postcodes;
- delivery fee rules;
- minimum order;
- capacity/throttling rules;
- estimated fulfilment time;
- blackout/holiday overrides;
- location identity;
- courier/provider identity where applicable.

Do not infer delivery radius, minimum order or preparation time from competitors.

---

## 15. Order capacity and kitchen overload

A direct channel must not worsen operations by accepting infinite simultaneous orders.

Later capabilities may include:

- configurable orders per time slot;
- preparation-time inflation when busy;
- temporary item/category sold-out state;
- manual pause;
- automatic pause on receiver failure;
- order-ahead slots;
- collection/delivery slot capacity;
- provider-native throttling where supported.

Capacity rules are merchant-owned operational facts.

AI may recommend changes from measured data but cannot silently alter live kitchen capacity.

---

## 16. Payment architecture and settlement

The restaurant should normally remain the merchant receiving customer food-order funds.

Preferred model:

```text
customer payment
-> restaurant's connected payment/ordering provider account
-> restaurant settlement
```

The commercial service separately bills the restaurant for its website/growth subscription.

Avoid making App Builder / the commercial engine the merchant of record for food orders unless a later legal, tax, payments and operational review deliberately chooses that much heavier model.

Requirements:

- merchant-authorised OAuth/account connection;
- scoped credentials;
- environment separation;
- no raw card handling by App Builder;
- provider-hosted/tokenised payment path;
- payment/order reconciliation;
- deterministic duplicate protection;
- clear refund/cancellation authority;
- auditable settlement/provider references.

---

## 17. Allergens and food-safety data — hard safety boundary

Allergen handling must fail closed.

For UK takeaway/delivery distance selling, current FSA guidance reviewed on 2026-08-26 states that allergen information must be available before purchase is completed and again when food is delivered. The FSA recommends written information at both stages.

Therefore:

- AI must **never infer allergens from a dish name, cuisine or ingredients it assumes**;
- allergen facts require merchant-supplied/approved or otherwise authoritative data;
- dietary labels such as vegan/gluten-free/nut-free require explicit verification;
- unknown allergen state blocks live online sale where required information cannot be provided safely;
- menu changes that affect allergen facts require re-verification;
- the system must support the restaurant's delivery-stage information process, not just the website display;
- customer allergy notes must be clearly surfaced to staff but must not be treated as proof the kitchen can safely satisfy the request;
- the customer journey should use clear language directing appropriate allergy questions/confirmation according to the merchant's approved process;
- allergen data changes receive an audit trail.

No sales/conversion optimisation is allowed to weaken allergen visibility.

---

## 18. Food hygiene evidence

Where legally/provider-permitted and appropriate, the website/evidence pack may display an official food-hygiene rating sourced from the authoritative scheme.

Requirements:

- source identity;
- retrieved-at date;
- establishment identity match confidence;
- correct rating scheme/region semantics;
- no stale rating presented as current without re-check;
- link/reference to authoritative data where appropriate;
- no AI embellishment such as converting a hygiene rating into a claim of "best food" or "safest restaurant".

A positive hygiene record can strengthen prospect prioritisation and trust presentation, but it is never a substitute for operational due diligence.

---

## 19. Customer relationship and repeat ordering

Once direct ordering is reliable, later premium value can include:

- fast reorder / recent orders;
- customer account where useful;
- consent-based email/SMS marketing;
- voucher/promotion support;
- loyalty integration;
- birthday/occasion programmes where compliant;
- abandoned-cart reminders only with appropriate consent/legal basis;
- order-history analytics;
- customer-authorised review request after fulfilment;
- QR codes for owned-channel discovery;
- table/shop-window/menu/flyer collateral.

Any attempt to encourage marketplace customers toward direct ordering must respect the marketplace's current merchant terms. Do not build a strategy around violating marketplace rules or improperly harvesting marketplace customer data.

---

## 20. Direct-order attribution and value reporting

The recurring product should prove what the owned channel does.

Customer-facing metrics may include:

- direct orders;
- order revenue processed through the connected provider;
- collection vs delivery mix;
- new vs returning customers where law/provider data supports it;
- repeat-order rate;
- average order value;
- top categories/items;
- cancelled/refunded orders;
- order acceptance time;
- order preparation time where available;
- channel health / failed-order incidents;
- website -> cart -> checkout conversion;
- review activity;
- customer opt-ins;
- campaign/source attribution where reliable.

Do not claim marketplace commission savings unless the relevant fees are known and the calculation is supportable.

A useful report is:

```text
Direct channel this month
312 orders
£X provider-recorded gross order value
61% returning customers
94% of orders acknowledged within target
2 cancelled/refunded
0 lost/unacknowledged paid orders
```

Reliability belongs beside revenue in the scorecard.

---

## 21. Food-specific outreach pack

Extend the existing Opportunity Evidence + Outreach Preview Pack.

Suggested collateral:

- polished desktop homepage screenshot;
- phone screenshot showing real proposed menu/order UX;
- optional combined desktop + mobile ordering image;
- sourced hygiene/review/business evidence where appropriate;
- direct-ordering gap evidence;
- marketplace-presence evidence from a permitted source;
- sensible live-checked domain options;
- concise statement that live ordering would only be activated after owner approval/integration;
- preview link and optional QR code.

Example evidence structure:

```text
Why we selected your business

- established active food business
- 4.7★ / 280 reviews from sourced local evidence
- online ordering already available through marketplace(s)
- no strong owned direct-ordering website identified
- current menu exists digitally
- official hygiene record matched
- mariospizzaglasgow.co.uk available when checked

What we built

- branded mobile-first website
- structured menu experience
- collection/direct-order journey demonstration
- local search/contact structure
- review/hygiene proof presentation

Live payments/orders are disabled until authorised onboarding.
```

The email screenshot remains useful even if the prospect refuses to click an unsolicited link.

---

## 22. Restaurant onboarding

After purchase, onboarding must collect/verify operational truth before live ordering.

Required confirmation should include:

- legal/trading business identity;
- authorised owner/manager;
- location(s);
- current menu and prices;
- modifiers/variants;
- allergen/dietary information;
- collection/delivery modes;
- opening and ordering hours;
- preparation-time expectations;
- delivery area/fees/minimums;
- cancellation/refund rules;
- POS/order-provider account;
- payment account;
- primary order receiver;
- backup order receiver;
- escalation contacts;
- printer/KDS requirements;
- customer-notification behaviour;
- approved photos/branding;
- domain;
- privacy/marketing choices.

Use a restaurant-specific adaptive questionnaire rather than forcing these questions into every App Builder project.

---

## 23. Go-live acceptance test

No food ordering system launches after only a browser test.

Required live-like acceptance should include at minimum:

1. catalogue/menu sync test;
2. modifier/variant price test;
3. collection order test;
4. delivery test if enabled;
5. payment success test;
6. payment failure test;
7. duplicate-submit/idempotency test;
8. order appears on primary venue receiver;
9. venue acknowledgement feeds back;
10. printer/KDS ticket test where enabled;
11. secondary alert test;
12. deliberate unacknowledged-order escalation test;
13. temporary ordering pause test;
14. cancellation/refund test;
15. customer order-status notification test;
16. opening-hours/closed-state test;
17. sold-out item test;
18. allergen-information presence test;
19. mobile checkout test;
20. webhook retry/replay/reconciliation test;
21. provider outage/degraded-mode drill;
22. final human observation that venue staff can operate the flow under realistic conditions.

The acceptance record becomes part of the production release evidence.

---

## 24. Operations and support console

A later food vertical needs operational visibility beyond normal website health.

Support/operator view should surface:

- live order count;
- unacknowledged orders;
- oldest unacknowledged age;
- primary receiver health;
- provider connection health;
- webhook failures;
- printer/KDS issues where exposed;
- order/payment mismatches;
- refunds/cancellations;
- menu sync health;
- ordering paused state/reason;
- venue opening/service state;
- recent escalations;
- last successful synthetic/test event where appropriate.

No support agent should need database access to discover that a restaurant has paid orders waiting.

---

## 25. Commercial package hypothesis

This vertical may support a materially higher-value subscription than a brochure website because it can operate revenue-critical infrastructure.

Illustrative hypotheses only:

### Food Presence

- website;
- menu;
- local presence;
- hosting/monitoring;
- bounded updates.

### Direct Ordering

- Food Presence;
- connected ordering/payment provider;
- collection ordering;
- venue order receiver integration;
- customer notifications;
- order/revenue reporting;
- health monitoring.

### Growth & Retention

- Direct Ordering;
- delivery where supported;
- repeat-order/loyalty capability;
- review workflow;
- local-presence operations;
- offers/campaign attribution;
- conversion optimisation;
- priority operational support.

Price based on support burden, provider fees, transaction volume, conversion, churn and contribution margin. Do not set price merely because the feature list is long.

Avoid taking an unnecessary percentage of restaurant order value if a fixed/subscription model produces better trust and simpler economics. Test commercial structure empirically.

---

## 26. Food vertical implementation sequence

This sequence starts only after the parent post-product programmes are active and proven.

### FOOD-0 — Manual commercial validation

Manually identify and build non-live previews for a small number of strong food prospects.

Measure:

- response rate;
- willingness to pay;
- objections;
- menu-data availability;
- provider/POS landscape;
- support expectations.

Exit: evidence that restaurants value the owned-channel proposition.

### FOOD-1 — Food discovery + opportunity score

Add FSA/authoritative establishment data where relevant, terms-compliant marketplace-presence evidence, website/direct-order classification and food-specific scoring.

Exit: strong candidates are measurably better than random food businesses.

### FOOD-2 — Food speculative preview template/vertical spec

Add menu-first design, food art direction, mobile ordering demonstration and evidence-led outreach pack.

No live ordering.

Exit: prospects can understand the product from screenshots/preview without operational risk.

### FOOD-3 — Merchant catalogue/menu contract

Add `MenuSpec`, owner approval, authorised import/sync paths, modifier validation and provenance.

Exit: production menu truth can be reconstructed and audited without AI guessing.

### FOOD-4 — Collection-only ordering pilot

Integrate one proven ordering/payment provider with one proven venue receiving path.

Start with collection to minimise delivery complexity.

Exit: real test orders repeatedly reach the venue, are acknowledged and reconcile with payments.

### FOOD-5 — Order Delivery Guarantee

Add durable order ledger, acknowledgements, fallback alerts, stale-order detector, circuit breaker, pause controls and deterministic refund/cancellation path.

Exit: deliberate receiver failures do not create silently lost paid orders.

### FOOD-6 — Printer/KDS/receiver matrix

Support the minimum set of receiving methods required by winning prospects:

- existing POS/Order Manager;
- KDS where justified;
- provider-supported printer;
- dedicated receiver device where integration is unavailable.

Exit: the vertical is not limited to restaurants that happen to use one POS vendor.

### FOOD-7 — Delivery and capacity

Add own-delivery/on-demand-delivery adapters only after collection ordering is reliable. Add zone/fee/minimum/slot/capacity controls.

Exit: delivery failures and kitchen overload fail safely.

### FOOD-8 — Repeat-customer growth

Add provider-supported reorder, loyalty, consent-based messaging, QR collateral, review workflow and attribution.

Exit: recurring customer value is measurable rather than assumed.

### FOOD-9 — Portfolio optimisation

Compare:

- cuisine/business type;
- marketplace mix;
- review/activity profile;
- direct-order gap;
- package;
- provider/POS compatibility;
- build/onboarding cost;
- support incidents;
- direct order volume;
- churn;
- lifetime contribution margin.

Promote only food sub-verticals that are economically and operationally attractive.

---

## 27. Food vertical scorecard

### Acquisition

- qualified food prospects;
- build-to-outreach rate;
- reply rate;
- close rate;
- CAC;
- conversion by prospect class;
- conversion by marketplace/direct-ordering gap;
- preview engagement.

### Onboarding

- days to live;
- menu corrections required;
- allergen-data readiness;
- integration success rate;
- number of manual interventions;
- receiving-channel setup time.

### Ordering reliability

- paid orders;
- routed orders;
- acknowledged orders;
- median acknowledgement time;
- unacknowledged-order count;
- duplicate-order count;
- order/payment mismatches;
- receiver failures;
- pause incidents;
- refunds caused by technical failure;
- **lost paid orders: target zero**.

### Commercial value

- direct order count;
- provider-recorded direct order value;
- repeat-order rate;
- average order value;
- conversion rate;
- customer-reported value/satisfaction;
- subscription MRR/ARR;
- gross/contribution margin;
- provider/communication costs.

### Retention/support

- churn;
- support minutes per location;
- incidents per 1,000 orders;
- menu-change workload;
- printer/receiver incidents;
- refunds/complaints;
- expansion/referral rate.

---

## 28. Explicit non-goals

This vertical is not permission to:

- build a Just Eat/Deliveroo clone;
- scrape protected marketplace data;
- take custody of restaurant funds by default;
- infer allergen information;
- accept orders that cannot be operationally delivered to staff;
- use email as the only critical order alert;
- hide order-reception failures;
- continue taking orders when the receiving path is unhealthy;
- invent menus, prices, delivery areas or promotions;
- route marketplace customer data into direct marketing without permission/legal basis;
- breach marketplace merchant terms to shift customers off-platform;
- launch an ordering flow before restaurant staff have completed a realistic acceptance test;
- make App Builder's generic website architecture depend on restaurant-specific systems.

---

## 29. North-star principle

The commercial opportunity is not "AI builds takeaway websites".

It is:

> **Find food businesses with proven online demand but weak owned digital infrastructure, show them a polished finished result before they buy, then operate a reliable direct channel that converts customer intent into orders the venue actually receives.**

The operational promise is equally important:

> **No paid order should ever depend on somebody remembering to refresh a browser tab.**

That principle must remain true even as providers, ordering methods and restaurant workflows evolve.
