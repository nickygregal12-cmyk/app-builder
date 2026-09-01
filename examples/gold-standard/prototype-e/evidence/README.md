# Evidence — prototype E

What is here, and what each thing is for.

## Captures

`v4/` is the capture run the final verdicts were taken from — every route at four viewports
(wide 1920, desktop 1440, tablet 834, mobile 390). The raw PNGs are not committed; what is here
is what the reviewer was actually shown, which is the thing a reader of this record needs.

A 390×8500 phone capture is a 1:22 ribbon. Fitted into any viewing pane it renders body copy at a
couple of pixels, which is how an earlier prototype in this programme was marked down for "tiny"
type three revisions running on pages whose type had been getting larger. `shrink.mjs` cuts tall
captures into panels at a readable aspect and writes the uncut ribbon alongside them.

Only the panels are committed. The uncut ribbons and the source PNGs regenerate from the commands
below and came to another twenty megabytes between them; the panels are what the reviewer was
handed, and a record of a review should hold what the reviewer saw.

`routes.json` records which route each file came from. It is written at capture time, where the
route is known, rather than reconstructed downstream from a filename — `2026-04-03` is a slug
containing hyphens and `weeks-2026-04-03` is a path containing separators, and they are the same
string to a parser.

## States

`states/` is eighteen interaction states with `index.json` naming the state each one holds. The
reviewer refuses to guess at hover, focus and transition behaviour from static page shots —
correctly — and scores interaction-craft on what it can see.

Two of them freeze the page clock. The header reports whether the causeway is passable *now*, so
showing it open and shut means finding a moment the model actually calls shut rather than picking
a plausible-looking timestamp, which would be inventing the one number on the site that is
supposed to be computed. `states.mjs` runs under tsx for that reason.

The manifest key matters: it must be `state`, not `what`. Writing the wrong key dropped fourteen
of fifteen states from the packet with no error at all.

## Verdicts

| File | Mean | Floor | Tier | Gap | Verdict |
| --- | --- | --- | --- | --- | --- |
| `v1.json` | 8.654 | 6.5 | strong-professional | MATERIAL | rework |
| `v2.json` | 8.962 | 8.0 | exceptional | MATERIAL | pass |
| `v3.json` | 8.769 | 8.0 | exceptional | MATERIAL | pass |
| `v4.json` | 9.038 | 8.5 | exceptional | MATERIAL | pass |
| `v4-repeat1.json` | 9.077 | 8.5 | exceptional | MATERIAL | pass |
| `v4-repeat2.json` | 9.077 | 8.5 | exceptional | MATERIAL | pass |

The last three are the **same packet reviewed three times**. Mean spread 0.038; nine of thirteen
criteria identical across all three; the four that moved each moved exactly one half-step.

That figure is what makes v3 readable. Its mean fell 0.193 below v2 while the criterion the
change targeted went up — five times the noise, so a regression rather than a sample, and the
reviewer named it: the availability inventory scrolled its price and status columns off the right
edge of a phone.

## Reproducing

```
npm install
node fetch-img.mjs                  # photographs + manifest, from Wikimedia Commons
npx tsx probe.mjs                   # 15 checks on the tide and season models
npm run build
node serve.mjs                      # note the port it prints
BASE=http://127.0.0.1:<port> PAGES='/,/crossing,/weeks,/weeks/2026-04-03,/weeks/2026-08-21,/house,/island,/before-you-book,/enquire' \
  node capture.mjs evidence/v5
BASE=http://127.0.0.1:<port> npx tsx states.mjs evidence/states
node shrink.mjs evidence/v5 && node shrink.mjs evidence/states
node ../tools/packet.mjs . evidence/v5 .review/packet evidence/states
node review-v2.mjs .review/packet evidence/verdicts/v5.json
```

`serve.mjs` prints its port and does not always get the one you expect. Confirm it before
capturing: another prototype's server was already on the port `capture.mjs` defaults to, and the
first run of this prototype's harness photographed prototype D's website instead of this one.

`probe.mjs` exits non-zero on any failed check. Every claim the site makes about the tide has a
check there; if a claim on a page is not checked, either the check is missing or the claim is
decoration.

`benchmark-selection-probe.mjs` demonstrates the reference-selection defect described in the
findings. It prints evidence and changes nothing.
