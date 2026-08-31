# Ardwell & Roe — creative brief and art direction

Business truth is read from `examples/visual-excellence/ardwell-roe-approved-knowledge.v1.json`
(pack `ardwell-roe`, 17 facts, 4 source documents). Nothing here invents a fact. Where this
document adds anything, it adds *design decisions*, which are mine and are not facts about
the studio.

## 1. The business

| | |
| --- | --- |
| **Name** | Ardwell & Roe (Ardwell & Roe Architects Ltd) |
| **Sector** | Architecture and interior architecture |
| **Founded** | 2011, by Nella Ardwell and Tomas Roe |
| **Size** | 11 people |
| **Base** | The Sail Loft, 14 Merchants Quay, Bristol BS1 4RW |
| **Works across** | Bristol, Bath, Somerset, South Wales, South West England |
| **Work** | Private houses, hospitality interiors, workplaces, adaptive reuse |
| **Proof** | 84 projects, 38% repeat/referral, 4 awards, 5 attributed client quotes, press in Architects' Journal, Dezeen, The Modern House, Somerset Life |

**Positioning, in the studio's own words:** takes a small number of projects at a time, runs
each from first sketch to completion with the same pair of people, and *"prefers repairing and
extending what exists to replacing it."*

**Audience.** Private clients with a difficult building and a planning history; hospitality
operators who need a room to work commercially on a Tuesday as well as a Saturday; institutional
clients with a constrained budget and an awkward shell. All three are choosing between four
practices and are trying to work out which one will tell them the truth.

**Conversion goal.** A qualified first enquiry that arrives already knowing the studio's
approach — not volume. The studio takes few projects; the site should filter as much as it
attracts.

## 2. The design idea

**"Repair, not replacement."** The positioning is not a slogan to print, it is the
compositional rule. A site for this studio should look like careful intervention in an
existing structure rather than a new object: a strong underlying grid that is visibly *there*,
and content that is inserted into it, sometimes breaking its line the way the Ashcombe Barn
timber boxes sit inside the stone shell without touching it.

**Emotional tone.** Quiet authority. Not luxury, not minimal-for-its-own-sake. The studio that
tells you the thing you wanted was the wrong thing to want.

**The specificity is the asset.** Every project has a Challenge / Response / Materials /
Outcome, and the outcomes are measured — *consented in eight weeks*, *1.9 m³/h·m² without a
specialist contractor*, *0.6 seconds against a 0.8 target*, *12% under budget*. Most practice
websites have adjectives where this one has numbers. The design should put the numbers where
the adjectives usually go.

## 3. Art direction

**Typography.** A single well-cut grotesque doing structural work, with a serif reserved for
project names and pull quotes only — the serif is the intervention, the grotesque is the
fabric. Rejected from the retrieved catalogue: `Real Estate Luxury` (Cinzel reads classical
and estate-agency), `Editorial Classic` (too literary for a practice that makes buildings),
`Minimalist Monochrome Editorial` (Playfair reads fashion). The catalogue is a starting point,
not an authority.

**Layout grammar.** A visible 12-column measure with deliberate breaks. Project entries are
*not* cards: each is a full-bleed image with its metadata set against the grid beside or over
it, alternating which side, so the page has a gait rather than a stack. No panel has a border
and a shadow and a radius; if something needs separating it is separated by space or a rule.

**Colour.** Taken from the studio's own material palette, which the project dossier already
specifies: lime plaster off-white, Douglas fir warmth, pennant stone grey-blue, charred larch
near-black, unlacquered brass as the single accent. This is the one place the factory and the
prototype genuinely diverge on input, and it is worth naming: `brand.colors` in the approved
pack is `[]`, so the factory correctly falls back to a derived accent. The prototype reads the
*materials named in the project text* instead. That is a content-intelligence capability the
factory does not have, and it is a finding, not a cheat.

**Imagery.** Large, few, and never decorative. One project, one strong frame. Where a project
has no usable image the entry becomes typographic rather than getting a weak one — a rule the
studio itself would recognise, since it left the Tidewell laboratory *"plainly unfinished
rather than cheaply finished."*

**Motion.** Almost none. Reveal on scroll at most, disabled under `prefers-reduced-motion`.
A studio this restrained does not have a parallax.

**The distinctive moment.** The measured outcome. Each project's result is set as a single
large figure against the material palette — the number a client actually cares about, at a
size nobody else gives it.

**Mobile.** Not a collapsed desktop. The alternating project rhythm becomes a single column
where the image leads and the metadata sits beneath it as a small caption-set block, and the
measured outcome stays large. Contact details do not migrate to the top; the studio's
credibility is the work.

## 4. What must not look generic

No hero-with-centred-heading-and-two-buttons. No three equal cards. No pill buttons. No
testimonial carousel. No "Our Services" with icons. No gradient. No card with border *and*
shadow *and* radius. Nothing that would survive being re-skinned for a dentist.

## 5. Key design risk

The material palette is warm and low-contrast, which is where accessibility usually fails.
Every text/ground pair gets checked at 4.5:1 before it ships, and the brass accent is used for
emphasis and never as the only signal.

## 6. Asset strategy

Target is the floor already declared in `ardwell-roe-asset-plan.v1.json`: 4 projects with a
primary frame, 8 project assets, 2 portraits. **Unresolved at time of writing** — see
`ASSETS.md`. Open-licence search on Wikimedia Commons was measured and returns heritage
survey documentation and digitised catalogues, not portfolio photography; generation is
priced at 2 credits against a 4.9 credit balance. The typographic fallback above is real and
will be used for any project that cannot be given a frame worth the space.
