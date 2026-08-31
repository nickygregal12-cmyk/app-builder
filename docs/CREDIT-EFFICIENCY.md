# Credit-efficiency contract

App Builder optimises for **reuse and deterministic computation**, not maximum autonomous model activity.

## Target ratios

For ordinary business websites, aim for roughly 90% deterministic/reusable work and 10% generative AI. Custom applications may require more AI, but repeated capabilities should trend toward deterministic modules over time.

## Rules

- Route tasks with rules first; use a cheap classifier only when routing is ambiguous.
- Research a topic once and store structured findings for all later agents.
- Filter test/build output into machine-readable failures before sending it to a model.
- Cache architecture, provider, brand and module decisions in project state.
- Use strong models for novel architecture, hard bugs, important UX/security and final review; use cheaper models for classification and commodity content work.
- Run visual AI review only on meaningful new screens or detected visual regressions.
- Put a cost/context budget on every agent task.
- Stop review/fix loops after a bounded number of attempts and escalate rather than thrash.
- Promote recurring successful solutions into recipes/packages so later projects no longer pay AI to rebuild them.

## Spend that is not tokens

The rules above are about model calls, because until now every pound the factory could spend was a model call. A
generated image, a crawled page or a metered analytics event is spend too, and it belongs in the cost system that
already exists rather than in a second one beside it.

**What the existing evidence can already carry.** `schemas/build-event.schema.json` records `usage` on any event —
`costGbp` is a plain number with no token dependency, and `durationMs` is already there. So a spend of £0.04 on an
image is representable today, and `packages/control-plane/src/index.js` would enforce `maxCostGbp` against it
correctly, because the budget check compares money to money.

**What it cannot carry, precisely.** Three things, and they are small:

1. **The unit.** `usage` has `model`, `inputTokens` and `outputTokens`. There is no way to say the spend bought four
   image candidates, or thirty crawled pages. Every non-token spend currently looks like a model call that reported
   no tokens.
2. **Candidate versus accepted.** Four generated candidates cost four times one, and three of them are discarded.
   Recording only the total answers "what did this cost" and not "what did an *accepted* asset cost", which is the
   question that matters.
3. **`additionalProperties: false`.** The schema is closed, so neither of the above can be added by a producer. It is
   a deliberate closure and a good one; it just means this is a reviewed schema change rather than an incidental
   field.

**The smallest extension, when it is earned:** a `units` object on `usage` — `{ kind, count, accepted }` — where
`kind` names what was bought (`image-candidate`, `vector-candidate`, `image-edit`, `crawled-page`, `analytics-event`,
`video-second`), `count` is how many, and `accepted` is how many survived critique. `retries` is already derivable
from repeated events against the same brief and needs no field. That is one optional object, additive, and it makes
all three gaps above answerable without a second ledger, a second budget or a second currency.

**Do not add it yet.** No producer emits non-token spend, and a field nothing writes is a knob nothing reads. It is
written down here so that landing it later is filling in a known shape rather than rediscovering it.

**The metric does not change.** The optimisation target stays **Accepted Quality Efficiency**, as `docs/ROADMAP.md`
defines it: zero edits to a 6.5-quality result is not better than two interventions to a 9-quality result. Minimum
spend is not the goal, and it is especially not the goal for media — four candidates that produce one excellent
accepted asset beat one candidate that produces a mediocre one, and a cost record that cannot tell those apart would
push the factory the wrong way.
