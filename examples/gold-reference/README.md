# Gold Reference prototypes

**Nothing in this directory is produced by App Builder, and nothing in it is production
capability.** These are hand-built websites for invented companies, made to answer one
question the factory cannot answer about itself:

> Is the visual ceiling Claude, or is it the current factory constraints?

A factory that scores 6.70 against an 8.5 bar has two possible explanations, and they call
for opposite responses. If the model cannot do better, more architecture is wasted effort.
If the model can do considerably better given a freer hand, then the constraint is the factory
and the architecture is exactly where the work belongs. Measuring the factory against itself
cannot separate those. A reference built without the constraint can.

**Answered, and then sharpened.** These three clear the gate; the factory has not. And since
this corpus was built, the factory has been run on the same rich Ardwell & Roe truth and
scored 6.64 — level with its 6.70 on thin truth, so input richness is not the explanation
either. What that run added is that the constraint is not only the component vocabulary:
the largest single gain came from an information-architecture correction, not from a
component. `FACTORY-GAP.md` carries the numbers.

## The rule that keeps this honest

**The prototype and the factory are two different things, and every claim must say which one
produced it.** A hand-built site presented as factory output would invert the finding it was
built to establish. Where this corpus is compared against a generated build, both sides get
the same business truth and the same imagery, because
`examples/visual-excellence/README.md` exists to remove asset scarcity as the confound and
re-introducing it here would waste that.

## Why it is separate from `examples/visual-excellence/`

That corpus is the factory's own benchmark input — approved intake bundles and knowledge
packs, deliberately provider-neutral, with a test that fails if any file in it names an
image provider. This corpus consumes that truth and adds implementation and imagery, so it
cannot live there without breaking the guarantee.

| | |
| --- | --- |
| `examples/visual-excellence/` | the input: invented business truth, rich by construction, provider-neutral |
| `examples/gold-reference/` | the output: what that truth looks like built without the factory's vocabulary |

## Fiction safety

Every company here is fictional and inherits the same mechanical guarantees the
visual-excellence corpus enforces: `.invalid` domains that can never resolve, telephone
numbers from the Ofcom drama range, and no claim about a real company, person, project or
client. Ardwell & Roe's truth is read from
`examples/visual-excellence/ardwell-roe-approved-knowledge.v1.json` rather than re-invented,
so the prototype and any factory build are describing the same studio.

## Imagery

Prototype imagery is openly licensed or generated, never presented as owned by the fictional
business, and always recorded with its origin in the prototype's own `assets.json`. A
generated image is labelled as generated. Rights are not assumed because a site is internal.

## What is *not* allowed here

- weakening any production guarantee to make a prototype easier;
- editing `templates/`, `config/visual-*.json` or `packages/composition/` from this corpus —
  a pattern earns promotion through the lane in `docs/VISUAL_EXCELLENCE.md` §11, not by
  being written here first;
- claiming a prototype passed a factory gate. Gates measure generated output.
