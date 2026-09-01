# Stage B0 — temporal evidence, and what it actually bought

Stage A recorded that `interaction-craft` saturates around 8.5–9 because the review packet is
static, and that more stills do not answer it: prototype E captured eighteen interaction states
and every one of its four reviews still said transition quality could not be judged.

This is the smallest evidence primitive that can show an interaction over time, plus the
controlled experiment that establishes whether the ceiling was real.

**It was real. It is removed. The score did not move.** Those three statements are all true at
once, and §4 is about why.

---

## 1. What was already there

The production harness was in much better shape than the Stage A note implied, and most of what a
motion capability needs already existed:

- `INTERACTIONS` in `tooling/lib/rendered-evidence.mjs` is a **closed registry**. A capture step is
  not a place for arbitrary scripting.
- Each entry declares `requiresSectionType`, so an interaction is planned only where the
  **composition** contains what it needs — opt-in by content, never by CSS.
- Each declares `outcome.settled` and `outcome.reached`, so a capture waits on a DOM condition and
  then asserts it arrived. No sleeps.
- `uncovered` records states a picture cannot establish, with the reason.

Three things were missing.

**Motion was disabled, everywhere.** Every context was created with `reducedMotion: 'reduce'` and
every screenshot with `animations: 'disabled'`. That is what made the set reproducible, and it is
also why five reviews in a row said transition quality could not be judged: *the harness had
switched off the thing they were asking about.* This is the finding that matters most in this
document, and it was invisible from the packet.

**A declared interaction that captured nothing degraded silently.** `buildEvidenceSet` filed it in
`uncovered` with "Planned but not captured in this run." `uncovered` means "the factory cannot
reach this state yet"; an interaction that fails is a regression, and the two were being recorded
under one heading.

**Nothing asserted route coverage.** The per-capture identity check proves a picture is of the page
it names. It cannot prove the set covers the site, so a route dropped before the browser opened
left no failed capture behind and produced a set that was internally consistent and silently
partial.

## 2. The contract

An interaction may declare that its quality is not in its endpoints:

```js
temporal: Object.freeze({
  purpose: 'Why a still cannot answer this.',
  atProgress: 0.5,
})
```

Only `navigation-disclosed` declares it. `enquiry-submit-failed` does not, and produces no
sequence — a failed submission is a message, and a picture of the message is the evidence.

A declaring interaction produces **four** captures per route/viewport rather than one:

| capture | motion | what it is |
| --- | --- | --- |
| the still | `reduce` | the end state with movement suppressed — **this is the reduced-motion counterpart**, not a second thing to capture |
| `--before` | allowed | the state the interaction leaves |
| `--during` | allowed | the movement, seeked to `atProgress` of its own duration |
| `--after` | allowed | the state it reaches |

Three frames because that is the smallest sequence that can carry a transition. Two is a pair of
stills, which is what the harness already produced and what reviewers said they could not judge
from. The reduced-motion counterpart falls out of the existing capture rather than being added,
which is why the net cost is three frames and not four.

**Declaration is not inference.** "There is a `transition` property here" is not the same claim as
"a reviewer cannot judge this without seeing it move", and only the second is a reason to spend
frames. Nothing sweeps stylesheets for `:hover`, `onclick`, or animation presence.

## 3. Determinism: seeked, not slept

The hand-built precedent for this evidence — prototype B's existing `transition-mid-flight.png` —
was taken by sleeping 90ms into a 220ms transition and photographing whatever had happened by
then. It produced a usable picture and it is not a method: the same script on a slower host
photographs a settled page and labels it mid-flight.

The harness instead:

1. **stretches** every transition and animation to 4s, *before* anything triggers one, so there is
   no race to lose;
2. triggers;
3. **pauses and seeks** every running animation to `atProgress` of its own duration;
4. photographs with `animations: 'allow'` — they are already held still.

A CSS transition interpolates on *normalised* progress, so half of a stretched transition is the
same frame as half of the real one: the easing curve is a function of the fraction, not of the
clock. What is lost is any ability to read the real duration off the capture, so **the capture
claims none** — the during-frame's `proves` says in terms that it is not evidence of how long
anything takes.

If the trigger animates nothing, `seekMotion` returns zero and the capture **fails**. A
during-frame with no movement behind it is the after-frame with a different label, and shipping one
would be manufacturing motion evidence to satisfy a criterion.

## 4. The experiment

**Artefact:** prototype B (Interlock), chosen over prototype E because it is already in `main` and
needed no cross-branch work. Its design was not touched.

**Interaction:** selecting step 07 on `/`, which closes an earth onto a conductor that stays
energised. The conductors travelling from dead grey to live red is how the site argues that the
*model* found the fault rather than the page asserting it — the movement is the product's
argument, which is what "load-bearing" is supposed to mean.

**Method:** two packets from the same 47 page captures and the same 12 interaction stills. The
only difference is three frames.

| | static | temporal run 1 | temporal run 2 |
| --- | --- | --- | --- |
| captures in packet | 59 | 62 | 62 |
| mean | 8.846 | 8.923 | 8.962 |
| floor | 8.5 | 8.0 | 8.0 |
| **interaction-craft** | **9** | **9** | **9** |

**interaction-craft did not move.** What moved is what the reviewer said about it:

> **static** — *"The evidence is still static, so timing, tactile continuity, error recovery, touch
> behaviour and performance cannot be judged."*
>
> **temporal, run 1** — *"Evidence is concentrated on the homepage sequence and navigation, so
> equivalent craft across forms, errors, loading states or the pilot contact action cannot be
> judged."*
>
> **temporal, run 2** — *"The evidence shows a narrow but excellent interaction system rather than
> the broader density of controls, transitions and edge cases required for benchmark-class
> interaction craft."*

The **medium** objection disappears and does not return across two runs. It is replaced by a
**coverage** objection. The reviewer also read the reduced-motion counterpart unprompted, in both
runs: *"reduced motion reaches the identical state without transition."*

## 5. What this establishes, and what it does not

**The instrumentation ceiling was real.** For five reviews across two artefacts the criterion was
capped by a sentence about the evidence being static. Three frames removed that sentence, and it
stayed removed.

**It was not the *only* ceiling, and on this artefact it was not the binding one.** At 9, the
constraint had already moved to breadth: one sequence on one interaction cannot lift a site-level
criterion, and both temporal runs say so in almost the same words. The honest statement is that
temporal evidence changes **what the reviewer is able to assess**, not that it raises the score.

**So the motion system is not expanded further.** The B0 acceptance rule was that if
interaction-craft did not materially become more evidence-backed, the system should not grow. It
did become more evidence-backed and the number did not move, which is a third outcome the rule did
not anticipate. The reading that follows from the evidence is: keep the primitive, because it is
three frames and it retired a standing objection; do not build a video system, sweep more
interactions, or add frames, because the next constraint is which interactions are worth declaring
and that is a composition question rather than a capture one.

The mean moved 8.846 → 8.923 → 8.962. Measured run-to-run noise on this instrument is 0.038, so
the temporal pair is within noise of each other and the static run is roughly two noise-widths
below. Individual criteria moved in both directions (composition-pacing 8.5 → 8, visual-material
9 → 9.5), which is scatter rather than a targeted effect. **No claim is made that temporal
evidence raised the mean.**

**Single artefact, single reviewer, one static run.** A second static run would have made the
mean comparison firmer. It would not have changed the finding, which rests on the objection text
rather than on the number.

## 6. Also found

`examples/gold-standard/tools/packet.mjs` **silently drops** a state file whose name does not match
its manifest key: the lookup strips a `--<letters>` suffix intended for viewports, so
`schedule-step-refused--before.jpg` was looked up as `schedule-step-refused`, missed, and
`continue`d. Three frames vanished from a packet with no error, which is exactly the failure mode
B0's completeness assertions exist to remove — in the one part of the pipeline they do not yet
cover, because that tool is prototype-side rather than production. The frames were renamed to work
around it. **The tool is not fixed here**; it is recorded so the fix is a decision rather than a
detail.

## 7. Files

**Production**

- `tooling/lib/rendered-evidence.mjs` — `temporal` declaration, `SEQUENCE_FRAMES`, sequence
  planning, and three fail-closed rules: an incomplete sequence, a declared interaction that
  captured nothing, and a declared route with no captures.
- `tooling/lib/rendered-evidence-capture.mjs` — `stretchMotion`, `seekMotion`, motion allowed only
  for sequence frames, `animations: 'allow'` only where they are already held still.
- `schemas/rendered-evidence.schema.json` — `state.motion`, `state.sequence`.
- `config/contract-families.json` — regenerated hash.
- `tooling/rendered-evidence.test.mjs` — 25 tests; three existing ones updated because the contract
  changed, six added.

**Calibration only, not production**

- `examples/gold-standard/prototype-b/sequences.mjs` — the capture used for the experiment, using
  the same stretch-and-seek technique so the experiment tests the real thing.
- `examples/gold-standard/prototype-b/evidence/sequences/` — the three frames.
- `examples/gold-standard/prototype-b/evidence/b0-calibration/` — all three verdicts.
