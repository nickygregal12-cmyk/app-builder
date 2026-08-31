# B1 — the controlled brownfield corpus

Three repositories, twelve tasks, and one question:

> Before App Builder is allowed to change somebody's existing application, can
> it say — with evidence — what must not break?

`config/factory-status.json` defers brownfield mutation until "an exact-revision
baseline includes observed passing tests and rendered behavioural evidence
sufficient to protect known-good behaviour". This corpus is where that sentence
gets tested against something, rather than argued about.

```bash
npm run benchmark:b1          # run it
npm run benchmark:b1 -- --keep  # leave the materialised repositories on disk
```

## Everything here is synthetic, and that is a limit rather than a caveat

All three repositories were written to contain the defects they are graded on.
Every task says `"provenance": "synthetic"` and the loader refuses one that does
not.

That makes the corpus a good measurement of *mechanics* — the answer is known,
so a wrong answer is visible — and worthless as evidence about real products. It
cannot tell you whether the factory can improve a repository nobody shaped for
it. Nothing in `.app-builder/b1/b1-report.json` may be cited as evidence of
brownfield capability on genuine work, and a passing run is not a step towards
the Predictor being safe to touch.

## The repositories

Each materialises into a temporary directory, is committed under a fixed
identity and a fixed date, and is deleted afterwards.

| id | shape | what is wrong with it |
| --- | --- | --- |
| `harbour-storefront` | React on Vite, TypeScript | Two sources of truth for the basket count, ten flat navigation links, a fetch with no failure path |
| `ledger-desk` | Node and Express over Supabase | A table with no write policy, three different API response envelopes, a query that fans out per row, one accepted failure |
| `civic-notices` | Astro static content | Three button implementations, an unlabelled input, an image with no alternative text, no viewport meta tag |

### Why the commit hashes are pinned

The repositories are built from fixed bytes and committed with fixed identities
and timestamps, so each lands on the same commit hash on any machine.
`corpus.v1.json` records that hash and the benchmark checks it.

This is the cheapest available test of the property the whole brownfield path
rests on: that a baseline names an exact revision, and a later comparison can
return to it. If a fixture's bytes drift, the hash moves and the run stops
instead of quietly comparing against a different product.

It is also the one thing this corpus offers that no real repository does. Here
the "before" is perfectly reproducible. Everywhere else it is a commit somebody
has to still be able to check out.

## The two halves

`corpus.v1.json` is **visible**. It holds the task, the toolchain, and the
declaration of what must be preserved — routes, journeys, invariants, known
failures, prohibited areas, allowed scope, churn ceiling, and the things the
task states must remain unknown.

`grading.v1.json` is **held out**. It holds the criteria a result is judged
against, the regression traps, the files a task genuinely cannot be done
without, and the blockers a correct proposal is expected to report.

`visiblePacket()` in `tooling/lib/b1-corpus.mjs` builds the visible half by
naming fields rather than by deleting hidden ones, so a field added to the
corpus does not leak by default — it simply is not carried. A test asserts that
no held-out criterion reaches the packet.

Two honest limits on that separation:

- A hidden check may *verify* a visible invariant. What is held out is the set
  of criteria and the traps, not every sentence in them.
- `requiredFiles` overlaps with `allowedScope` for several tasks, because an
  owner declaring what may change naturally names files. Retrieval measured
  against this corpus is therefore easier than retrieval against a real
  repository, and should be read that way.

## What a run currently proves

Twelve tasks, three repositories, and no model. Proposals are derived
deterministically by `tooling/lib/b1-reference.mjs` so that a failing run means
the machinery broke rather than that a model had a bad day.

| property | how it is held |
| --- | --- |
| Exact revision freeze | Materialised hash must equal the pinned hash |
| Subject unchanged | Every path, size and mtime fingerprinted before and after, including after test execution |
| Insufficient baseline disables mutation | 9 of 12 tasks refuse for want of evidence |
| Scope and churn are bounded | The reference contract is validated against the declared scope and ceiling |
| Unknown stays unknown | Every declared unknown must survive into the proposal |
| A proposal grants nothing | `grantsMutation` is a literal `false` no input can move |

### Why nine tasks refuse

Observations come only from commands the runner actually executed. `ledger-desk`
runs its suite under `node --test` and needs nothing installed, so three of its
four tasks reach adequate evidence. The other two repositories need `vitest`,
`astro` or `playwright`, and installing into the subject repository would be a
write — the first mutation, made by the tool that promised not to make any. So
those commands are not run, are not recorded, and the contracts that needed them
refuse.

Nine refusals is the correct result, not a gap to close by lowering the bar. The
way to close it is a runner that can install and execute in a copy, and record
what it genuinely observed.

### Mutation is enabled for none of them

Adequate evidence is not permission. Every task ends with mutation disabled
because nothing has authorised mutation of anything: the benchmark supplies no
`ActionAuthorization`, and without one there is nothing to check.

The contract does check a real one. `derivePreservationContract` takes an
`ActionAuthorization` and runs it through `assertActionAuthorizationUsable`,
binding it to the baseline's own profile hash — so a grant made after looking
at one state of a repository is refused as `base-drifted` once that repository
moves, which is the same refusal, in the same shape, as evidence gathered at
another revision. Wrong operation, wrong environment, expired and already-spent
grants are refused by name rather than flattened into "not authorised".

The benchmark checks that the three tasks with adequate evidence report exactly
one blocker — `not-authorised` — and that the other nine report two. Those are
different problems with different owners, and collapsing them into one boolean
would make a missing owner decision look like a missing test.

### The check runs in both directions

Twelve refusals prove the refusal and not the check: a contract that refused
every grant ever offered would produce identical output. So the run ends with a
demonstration on a separate copy of `ledger-desk` — separate so the read-only
assertions above still cover only what they claim, because this copy is
deliberately changed.

```
--- authorisation binding ---
  at 4d5ea4e4c043  evidence adequate  authorisation valid          mutation ENABLED
  at 6b40a2be654c  evidence adequate  authorisation base-drifted   mutation disabled
```

A real `ActionAuthorization` is minted against the profile hash of the read the
evidence came from, and with real executed evidence the contract enables
mutation — the only place in this corpus where it does. Then a commit lands, the
repository is re-profiled, and **the evidence is re-observed at the new
revision** so it stays adequate. The grant is the only thing left to fail, and
it fails as `base-drifted`.

Re-observing is the point. An agent that gathered fresh evidence and kept its
old permission is exactly the situation this refuses.

### Retrieval is instrumented and unmeasured

`measureRetrieval()` records files considered, files used, search iterations and
required files missed. `grading.v1.json` holds the answer key. No model has run
against this corpus, so no retrieval numbers exist, and the report says `0`
rather than inventing them.

`docs/ROADMAP.md` defers repository maps and semantic indexes deliberately. This
is the instrument that would settle it — on measured retrieval failure, not on
the observation that repositories are large.
