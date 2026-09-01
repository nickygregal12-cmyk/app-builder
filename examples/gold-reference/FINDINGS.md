# Reusable design findings

Ideas, not templates. Nothing in this file says "add a `PlantRegister` block". A corpus that
produced three more components would have proved that the factory needs a bigger component
library, and that is precisely the conclusion the corpus was built to test rather than to
assume.

Each finding is stated as: what was done, why it worked, the evidence for it, and the form it
could take in the factory. The last part is a *shape*, not a specification.

---

## F1 — The signature is the business's own artefact, not a design device

**What.** Each prototype has one thing it does that no other site would do, and in all three
cases it is the thing the business actually produces. Ardwell & Roe's is a photographic frame
that changes crop between viewports. Marram's is a register of twelve plants with a season
bar and a tolerance line. Plumbline's is a migration plan rendered as live HTML.

None of these was chosen for visual interest. Each was chosen because it is what the business
hands a client, and the site is simply showing it at full size instead of describing it.

**Why it works.** Distinctiveness scores did not come from styling. They came from a page
being *unable* to be about another business. Marram's register cannot be lifted onto an
architecture site; Plumbline's plan cannot be lifted anywhere. The reviewer named this
directly on Marram — *"the plant register is an excellent distinctive device: it turns
expertise, site conditions and seasonal performance into visible evidence"* — and on
Plumbline — *"real-output centerpiece make the safety proposition unusually credible"*.

**Evidence.** Distinctiveness 8.8 / 9 / 9 across the three, against 5.4 for the factory's
best benchmark run. It is the single largest gap in the corpus.

**Shape for the factory.** A stage that asks, of the approved knowledge: *what does this
business hand its customer, and can the site show one at full size?* The answer is a
data-shaped question, and the intake bundles already carry the data. What is missing is
anything that asks it. This is a **generation** finding before it is a component finding —
a new block type without this question just produces a differently-shaped generic section.

---

## F2 — Every claim gets its arithmetic attached

**What.** Marram's gardens page carries a stewardship ledger: what was planted, what has been
replaced since, what it cost in mains water. Plumbline's lock bars are drawn against the
team's *stated 200ms budget* rather than against the largest value in the plan, and the site
says so in a caption. Ardwell & Roe attaches an outcome figure to every project.

**Why it works.** A number without a denominator is a marketing claim. A number with its
denominator visible is an invitation to check, and a reader who can check does not need to
trust. Scaling Plumbline's bars to the maximum in the set would have made every plan look
equally alarming — flattering the product, and detectable by anyone who thought about it for
ten seconds.

**Evidence.** Credibility 9.2 / 8 / 9. On Marram the reviewer specifically asked for
*"one or two additional forms of non-photographic evidence"* before the ledger existed, and
the complaint did not recur after it did.

**Shape for the factory.** Not a "stats block". A rule that a figure may only be rendered
alongside the basis it is measured against, and a knowledge-pack field to carry that basis.
The factory can already refuse to render a claim it cannot substantiate; this extends the
same instinct from truth to proportion.

---

## F3 — Responsive means recomposed, not stacked

**What.** Marram's register on a phone opens each chapter with one plate at full width and
then continues as records — plate left, identification right, evidence beneath. Plumbline's
plan moves the verdict and the lock bar onto one line *above* the SQL so the statement gets
the full measure. Ardwell & Roe changes the *crop* of the photograph, not its size: 16/9 at
390px is a 219px letterbox strip, which is what a "responsive" hero usually is — the desktop
crop, scaled until it stops being a picture.

**Why it works.** The two things that did not work are the informative part. Marram's mobile
register was tried as two columns (**6.8**) and as uniform horizontal rows (**7.0**) before
the recomposition scored **8.0**. Both failures answered "this is a long scroll" by making
everything smaller. The reviewer wanted fewer, larger, differently-weighted things. The final
version is 28% shorter with nothing shrunk.

**Evidence.** Three measured attempts on the same page, same reviewer, same criteria:
6.8 → 7.0 → 8.0. This is the only finding in the corpus with a controlled comparison behind
it.

**Shape for the factory.** Per-breakpoint composition as a first-class output rather than a
CSS afterthought — the generator choosing a *different arrangement* per breakpoint, and the
visual gate scoring the small viewport as a composition rather than checking it does not
overflow. Note that the current harness could not have found this: horizontal overflow was
zero in all three attempts.

---

## F4 — One accent, or several that each mean exactly one thing

**What.** Marram uses a single ochre for every structural mark on the site — rules, chapter
divisions, season bars, the conversion band — and nothing else is coloured. Plumbline uses
three (blocked, warned, clear) and they are *never* used decoratively: no coloured headings,
no tinted backgrounds, no hover states in a signal colour. Its dark scheme changes their
luminance but not their meaning.

**Why it works.** A colour that means "blocked" in one place and "nice heading" in another
means nothing anywhere. Restricting the palette to load-bearing use is what allows the ochre
band on Marram to read as an intervention rather than as decoration.

**Evidence.** Coherence 9.0 / 9 / 9. On the one revision where Marram's caption text sat on
the plate's cream ground in pale bone, the reviewer read the whole thumbnail strip as broken
— a contrast failure hiding inside a decorative detail.

**Shape for the factory.** A palette contract that distinguishes *semantic* from *surface*
colour and refuses to emit a semantic colour in a non-semantic position. Cheap, mechanical,
and checkable in the design-system lint that already exists.

---

## F5 — Copy is part of the composition, and generic copy shows

**What.** "A garden that needs a hose in August was planted wrong in March." "Your migration
tool will run anything you give it." "It is the third one that gets you." "Eight. Not eighty."

**Why it works.** These are not taglines applied to a layout; the layout exists to give them
room. Marram's chapter divisions are named "Finished by August", "Through the dry months",
"Still standing in winter" — the division *is* the copy, and a generic "Spring / Summer /
Autumn" would have made the same layout ordinary.

**Evidence.** Brand-fit 9.0 / 9 / 9. The reviewer described Marram's writing as *"unusually
direct copy"* that makes the studio "feel experienced, selective and credible", and Plumbline's
as carrying "technical precision".

**Shape for the factory.** The intake bundle should carry the business's *manner of speaking*
as a constrained input — not a tone slider, but two or three sentences the business would
actually say, from which the generator can take register. And the visual gate should be
allowed to fail a build for copy, which it currently cannot.

---

## F6 — Refusing a medium is a design decision with a payoff

**What.** Marram uses no photographs of its own gardens, because a studio whose gardens take
four seasons to close cannot show a photograph that proves anything — so it uses public-domain
botanical plates unified onto one paper ground. Plumbline uses no imagery at all.

**Why it works.** Both refusals came from the business, not from asset scarcity, and both
produced a stronger site than the photographic version would have. Plumbline's imagery score
is 9 with zero images on the page, because the criterion is *suitability* and diagrams drawn
from the product's own data are maximally suitable for developer tooling.

**Evidence.** Imagery-suitability 9.1 / 9 / 9. Plumbline scored 9 while owning no asset of
any kind — no photograph, no illustration, no icon set, no web font.

**Shape for the factory.** "No suitable imagery exists" should be a *route*, not a failure.
The asset planner should be able to conclude that a business is better served by a drawn
figure from its own data than by a stock photograph, and the composition layer needs
something to render when it does. This is the finding with the largest gap between how easy
it is to state and how much it would change.

---

## F7 — Bounded, adversarial critique changes the work; unbounded self-review does not

**What.** Every score in this corpus is from a different vendor's model, given the business
brief and the rendered pages and nothing else — no access to the implementation, the
intent, or any previous verdict.

**Why it works.** Four separate times, the reviewer identified something as a design defect
that turned out to be a defect in my capture harness: six missing mobile renders, two
undecoded plates, a duplicated footer at a stitch seam, and unreadable 1:20 mobile ribbons.
Every one of them was invisible to me and obvious to a reader who could only see the output.
Equally, three times the reviewer's proposed *direction* was wrong — twice on Marram's mobile
register, where following the "too long" note by compressing made it worse — and the score
was what settled it, not the argument.

**Evidence.** The full score history in each prototype's `evidence/verdicts/README.md`,
including the failing runs.

**Shape for the factory.** The independence requirement in the visual gate is correct and
should be strengthened, not relaxed: the reviewer must not see the generator's reasoning. The
useful addition is that a reviewer's *defect* should be treated as evidence and its
*prescription* as a hypothesis — the current rework loop tends to implement the prescription.

---

## What did not turn out to matter

Recorded because a findings document that only lists successes is not evidence.

- **Motion.** There is one animation across three sites: a 320ms opacity fade on Ardwell &
  Roe's photographs, disabled under `prefers-reduced-motion`. Nothing was ever marked down
  for lacking movement, and distinctive-moment scored 8.3–9 without any.
- **Novel layout mechanics.** All three use a plain twelve-column grid. Nothing needed
  subgrid tricks, scroll-driven animation, or a bespoke layout engine.
- **Density.** Twice on Marram, and once on Plumbline's mobile checks list, more information
  per screen scored worse. Every attempt to answer "this is long" with "make it smaller"
  lost points.
