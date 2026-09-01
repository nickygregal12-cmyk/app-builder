# Visual-excellence benchmark corpus

**Every business in this directory is fictional.** The companies, people,
projects, clients, testimonials, awards and imagery here were invented to
measure the factory. None of it is evidence about a real company, and none of it
may ever be published as one.

This corpus is deliberately a different thing from `examples/genuine-business/`,
and the two must never be summed:

| Corpus | Truth | Question it answers |
| --- | --- | --- |
| `examples/genuine-business/` | real companies, owner-approved, source-backed where ingestion happened | **Real-world retention** — what the factory builds from the sparse, awkward material a real small business actually has |
| `examples/visual-excellence/` | invented, rich by construction | **Visual ceiling** — what the factory builds when input quality is not the limiter |
| fixtures under `tooling/` and `tests/` | synthetic, minimal | unit behaviour |

A genuine business with no photographs tells you something real about the world.
It tells you nothing about whether the factory *could* have done better with a
proper portfolio. That is the confound this corpus removes, and removing it is
the only reason to invent anything.

## How the fiction is made mechanical

Prose is not a guarantee. Four things make it checkable:

1. **The bundle says so.** `provenance.benchmark` carries
   `businessReality: fictional`, `truthPurpose: visual-excellence-benchmark`,
   `publicationAllowed: benchmark-only` and `externalVerification: not-applicable`.
   A real business's bundle has no such object, so presence is unambiguous and
   the declaration travels with the artifact rather than living beside it.
2. **Every source is `provenance: generated`.** No source claims to be a crawl,
   an upload or a register lookup, because none of them is.
3. **Unresolvable contact details.** The domain uses the `.invalid` TLD, which
   [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) reserves so that it can
   never resolve. The telephone numbers are drawn from the range Ofcom reserves
   for drama and never allocates. A generated site can be photographed; it
   cannot reach anybody.
4. **A test enforces all of it.** `tooling/visual-excellence-corpus.test.mjs`
   fails if a benchmark bundle loses its declaration, if a source claims
   non-generated provenance, if a contact detail becomes reachable, or if
   genuine-business tooling reads this directory.

## Ardwell & Roe — flagship case

A premium architecture and interior-architecture studio. Chosen because the
category is unforgiving: portfolio-led, imagery-heavy, evidence-rich, and
judged by exactly the qualities this benchmark exists to measure. A weak
composition cannot hide behind sparse content here.

- `build-ardwell-roe-intake-bundle.mjs` → `ardwell-roe-approved-intake.v1.json`
- `build-ardwell-roe-knowledge-pack.mjs` → `ardwell-roe-approved-knowledge.v1.json`
- `ardwell-roe-asset-plan.v1.json` — the asset specification
- `ardwell-roe-asset-recipes.v1.md` — provider-neutral generation briefs

Both builders regenerate their artifact byte-for-byte, and a test asserts it.

## Asset bytes are a separate, later step

The source truth is complete. **The image bytes are not, and the baseline is
deliberately not frozen without them.**

An ideal-input benchmark photographed with no photographs measures nothing but
the asset gap, and would burn the experiment: you cannot ask "what is the
ceiling when input is rich?" of a run whose input was poor. So
`tooling/lib/benchmark-asset-readiness.mjs` refuses to call a run an
ideal-input baseline until the asset floor in the plan is met, and says exactly
which assets are missing.

The plan and the recipes exist so that generating the bytes is a mechanical
step for whichever governed image source the owner authorises. **No provider is
named anywhere in this corpus**, and nothing here should ever name one — a test
enforces it over every file in this directory. The factory's requirement is
*governed synthetic bytes with explicit provenance and publication permission*,
and where they come from is not its business.

Provider *candidates*, for a benchmark that has not been earned and does not run,
are recorded once in `config/capability-providers.json` under the ordinary
registration-is-not-adoption rules. That is a separate question from this one:
this directory states what the bytes must be, and nothing here may ever depend on
who produced them.

### The ingestion protocol

Name each file after the asset ID it was produced for, put them all in one
directory, and rebuild:

```
node examples/visual-excellence/build-ardwell-roe-knowledge-pack.mjs --assets <dir>
```

That is the entire contract with whoever produces the bytes. The filename stem
is the binding, so nothing has to be embedded in the image and no side-file has
to stay in step with it. Switching to a different governed source changes what
is in the directory and changes nothing in this repository.

Ingestion refuses rather than guesses. A file whose name matches no planned
asset is named and never used — an unplanned image on a page would leave the
plan describing a site that is not the one built. A file it cannot decode is
rejected, because `contentHash` is required and the hash of a truncated download
is still a perfectly good hash. An image whose orientation contradicts its slot
is rejected as the wrong picture rather than accepted as a cropping problem,
which is far cheaper than discovering it from a screenshot.

### The first run against real bytes — 2026-08-31

Seventeen frames were produced against the recipes by a governed image source and
ingested. The pack now records them; **the bytes themselves are deliberately not
committed**, because this directory states what the images must be and never who
produced them, and 73MB of PNG in Git would make the corpus about its files. Rebuild
with `--assets <dir>` to reproduce, or supply a different governed set — the pack's
hashes will change and nothing else will.

Producing them found seven defects that only the arrival of bytes could expose,
every one of them in the factory rather than in this corpus:

1. the pack builder could not register an asset source once its bytes existed, so
   ingestion produced a pack that failed its own validation;
2. `hasWideCrop` read only optimiser variants, so a 2048x1152 hero frame counted as
   "0 wide enough to open a page" and the imagery-led direction was refused;
3. an ingested asset declared no variant, so `materializeAssets` copied nothing and
   the site published no `<img>` at all;
4. a replayed bundle had no way to be told where the bytes were;
5. composition placed assets role-blind — the wordmark opened the page and the
   founders' portraits appeared under "Recent work";
6. `itemDetail` rendered every field of a nine-field dossier, turning six projects
   into some four thousand pixels of small print;
7. `--color-scrim` was declared twice, so the immersive hero's gradient was invalid
   and its white text sat unscrimmed on the photograph.

None of that is visible without images. That is the argument for this corpus.

What it does not do is judge photographs. Whether an image is any good is a
question for the independent reviewer, and the floor is a floor.
