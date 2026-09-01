# Stage B1 — executable IA and page narrative

The first Stage B production slice: what pages exist, why each deserves to exist separately, and
what sequence of content belongs on each — decided from approved truth, before any presentation
choice.

---

## 1. The path as it actually was, traced on `55184264`

```
manifest + KnowledgePack
      ↓
surfacesFor(manifest)                    packages/composition/src/index.js:864
      ↓                                  manifest.majorSurfaces, else:
      ↓                                  DEFAULT_SURFACES[project.type]
      ↓                                  'marketing-site' → ['Home','Services','About','Contact']
      ↓
sectionsForPage({ surface, … })          purpose recovered by REGEX on the surface NAME:
      ↓                                    /dashboard|notification|activity|alert/ → notifications
      ↓                                    /workspace|record/ → tenant records
      ↓                                    /admin|setting/ → administration
      ↓                                  then every applicable generator is push()ed
      ↓
PageSpec + SectionSpec
      ↓
visual direction (tokens + classes)
      ↓
renderer
```

**The precise bottleneck, in three parts.**

**The route set is a literal keyed on project type.** `DEFAULT_SURFACES` is the Home/Services/
About/Contact table the brief says must not exist, and it is consulted before any truth is read.

**Page semantics are recovered from a string, after the fact.** `surfacePurposeFor` matches the
surface's own *name* against regular expressions. "About" reaches the practice sections because
the word matched, not because anything decided the page was for that.

**Nothing decides a section is unnecessary.** `sectionsForPage` pushes every generator whose
condition holds. There is no step at which a section is declined, which is how one rich-truth run
composed 31 sections over 9,217px and a reviewer reported "effectively duplicate pages".

**And the artifact for this already had a name.** `config/agent-roles.json` declares
`information-architect` writing `InformationArchitectureSpec`, and `composition` reading it.
`config/agent-pipelines.json` refers to it in ten places. Its entry says `"schema": null`,
`"status": "planned"`. **Nothing wrote one and nothing read one.** That is what "existed in role
config but was not meaningfully executable" meant.

## 2. The contract

`schemas/site-plan.schema.json` — one schema, no domain variants.

```
SitePlan { thesis, audiences[], routes[], omitted[], planHash }
  Route  { path, purpose, entryQuestion, audienceId, existsBecause, factRefs[], exitAction, narrative[] }
    SectionJob { job, binds, covers, establishes, requires[], factRefs[] }
```

Four decisions worth defending.

**`existsBecause` is required and validated.** A route must say why it deserves to be a page rather
than a section of one, and a list of justifications that would be true of almost any page —
"provides useful information", "builds trust", "showcases services", "every good website has one" —
is refused. That is not style policing: those are the sentences a generator reaches for when it has
no reason.

**`omitted` is required, not optional.** Structure the plan considered and declined, with the
reason. Without it "we chose less" is invisible and indistinguishable from "we did not think of
it", and a planner that can only ever add structure is a template with a variable in it.

**`binds` names a family of truth, never a component.** A plan says "this section establishes what
they sell"; it does not get to say "use the services grid". Which presentation renders a family
stays composition's decision, and that boundary is what stops a route plan becoming a layout in
disguise.

**`covers: 'full' | 'preview'`** is the difference between a page that answers a question and a
page that routes one. It was added after the first experiment run produced a home page with a
single section: the plan's own `existsBecause` claimed the home route decides which question a
visitor needs answered, and then gave it nothing to do that with.

**No route quota, no section quota, no shape quota, and no project-type table anywhere.**

## 3. Model versus deterministic

Split on whether the question has an answer.

| | |
| --- | --- |
| **Judgement — a model role, later** | The thesis. Which routes a business needs. What a visitor arrives asking. What order an argument goes in. None is derivable, and `information-architect` already exists to own it. |
| **Constraint — code, now** | Whether a fact reference resolves. Whether two routes are really one route. Whether a narrative depends on something later. Whether a justification says anything. Whether a section binds truth its page was not built on. |

`planSite` is a **deterministic baseline, written to be beaten.** It is here because the contract
has to be consumed by something before a model can be trusted with it, and because a model's
proposal needs to be measurable against something rather than against nothing. Model execution is
owner-disabled, so a model-backed planner could not have been run or measured in this slice at all.

The validators are the part that matters. A model can be swapped in behind `planSite` without any
guarantee moving — which is the property that makes the split worth having.

What the baseline pointedly does not do: consult the project type (there is a test), hold a list of
pages a good site has, or refuse to return a one-route plan.

## 4. The controlled experiment

`npm run experiment:site-plan`. Both sides run the real `composeProject` on approved knowledge
packs already committed here. No expected route count is encoded anywhere.

### Rich — Ardwell & Roe

The pack behind the 31-section / 9,217px / "effectively duplicate pages" review.

| | current | planned |
| --- | --- | --- |
| routes | 5 | 6 |
| **total sections** | **20** | **14** |
| sections per route | `/`:8 `/services`:4 `/about`:5 `/contact`:2 | `/`:5 `/services`:2 `/work`:2 `/people`:2 `/proof`:2 |
| routes carrying identical content | none | none |
| a page carrying the same content twice | **`/`, `/services`** | none |
| **routes that can say why they exist** | **2 / 5** | **6 / 6** |

The three routes the current path never had — `/work`, `/people`, `/proof` — are not additions for
their own sake: the pack carries 6 projects, 5 people and 5 testimonials, and the old path folded
all of them into `/about` and a home page of eight sections. **Fewer sections, more routes, and
every route able to name the truth that earns it.**

### Thin — nbm

One Companies House description, empty trust signals, no projects, people or testimonials.

| | current | planned |
| --- | --- | --- |
| **routes** | **5** | **4** |
| **total sections** | **14** | **8** |
| sections per route | `/`:5 `/services`:3 `/about`:3 `/contact`:2 | `/`:3 `/services`:2 `/where-we-work`:2 |
| routes declined, with reasons | — | **3** |
| routes that can say why they exist | 2 / 5 | 4 / 4 |

> Work — *"The approved knowledge contains nothing under projects, so a page answering 'Have they
> done this before, for someone like me?' would have to be written rather than composed."*

**The planner chose less structure**, which is the property the brief asked for and the one a
quota would have destroyed. A dedicated test covers the limit case: a business with nothing but its
own name gets **one route**, and that is a valid plan.

### The negative assertion

Not "rich must have more pages than thin" — that is a quota with a sliding scale. What is asserted
is that the two do not come out the same shape regardless of the truth, and that the thinner
business declines more rather than building more. Both hold, and both are tests.

## 5. Did the hypothesis survive?

**At composition level, yes.** Duplicate content on a page disappeared, section count fell where
truth was thin *and* where it was rich, routes gained reasons grounded in specific approved facts,
and the thin case produced less rather than being padded to a shape.

**It is not yet answered at the level the hypothesis was stated.** Stage A's claim was that IA is
the *visual* bottleneck, and this slice has not rendered either side.

Not run, and stated rather than implied: **rendered page heights, a visual evidence packet, and a
v2 critic comparison.** Generating both sides needs the whole generation path — asset planning,
renderer, build — which is a materially larger step than this slice, and a half-run render would
produce a comparison worth less than none. What *is* established is that the chain is intact:
`site-plan` validates against its contract, and both compositions validate against the same
`composition` contract the renderer reads, with different hashes.

**So the honest status is: the mechanism works and the visual claim is untested.** The disproof
condition from the Stage A plan is unchanged and now cheap to run — if section count falls, height
falls, duplicate routes disappear and the review does not improve, the constraint is the
presentation vocabulary rather than IA, and that is the competing hypothesis
`docs/PHASE_4D_VISUAL_DEBT.md` §3 has always held.

**One early sign in that direction.** The first experiment run reported `/work == /services` as
duplicate routes, because both render through the same `item-grid` section type. That measure was
wrong — it compared section *types* rather than the content they bind, and two grids holding
different things are not duplicates — but the underlying observation stands: **the plan
distinguishes routes that the presentation layer renders identically.** That is presentation
vocabulary showing up at exactly the boundary B1 was supposed to stop at, and it is the first
concrete evidence for B2 that came from measurement rather than from the Stage A prior.

## 6. Rollback boundary

Total, and it is one code path. No `sitePlan` argument means `composeProject` composes precisely
what it composed before — asserted by comparing `compositionHash`, which covers every page, every
section and every binding.

## 7. Files

**Production**

| file | change |
| --- | --- |
| `schemas/site-plan.schema.json` | new — the contract |
| `packages/composition/src/site-plan.js` | new — `planSite`, `validateSitePlan`, `assertSitePlan`, `knownRefs` |
| `packages/composition/src/index.js` | `composeProject` accepts and validates a plan; `sectionsForNarrative`; `BINDS_TO_SECTION`; unrenderable jobs reported as warnings |
| `config/contract-families.json` | `site-plan` registered |
| `package.json` | `experiment:site-plan` |

**Tests** — `tooling/site-plan.test.mjs`, 17. No route count is asserted anywhere in either
direction, because a test saying "rich truth produces five pages" is the template arriving through
the test suite.

**Experiment** — `tooling/site-plan-experiment.mjs`, both fixtures, real packs.

## 8. What was found while building it

**The validator caught a defect in the planner on its first run**, which is the best evidence that
the split is in the right place. `planSite` was deriving fact references from fact *paths*, so
every route received the same identity facts and `duplicate-route-truth` fired four times: the
planner had reproduced "effectively duplicate pages" at plan level, and the deterministic half
refused it before anything was composed.

The cause is worth recording. **A knowledge pack keeps its truth in two stores.** `facts[]` holds
identity, contact and practice figures; the things a business *has* — services, projects, people,
testimonials — are entities under `companyProfile`, each with its own id. A truth boundary that
only knew about `facts` would accept a route claiming to be built on ten services while
referencing none of them.
