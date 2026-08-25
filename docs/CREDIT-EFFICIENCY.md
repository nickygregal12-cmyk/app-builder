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
