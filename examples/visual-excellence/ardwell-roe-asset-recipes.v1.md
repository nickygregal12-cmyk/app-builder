# Ardwell & Roe — asset generation recipes

Briefs for the synthetic image set, written so that **any** governed image
source can produce the bytes without re-deriving the art direction. No provider
is named here and none should be: the factory's requirement is governed
synthetic bytes with explicit provenance and publication permission, and where
they come from is an owner decision.

These are benchmark-side. **Nothing in this file may reach a generated
website** — they describe how the pictures were made, which is not something a
studio's own site would ever say.

## The photographic language

The whole set must read as one practice's portfolio shot by one or two
photographers, because incoherence across a portfolio is itself a visual defect
and would confound the measurement.

- **Real architectural photography.** Plausible construction, buildable
  junctions, correct perspective. Nothing surreal, nothing that could not stand up.
- **Directional daylight**, generally single-sided, with visible falloff. No
  even studio fill, no HDR flattening, no obviously artificial interior lighting.
- **Restrained, editorial framing.** Level horizons, verticals kept vertical.
  Composition sits back and lets the space be the subject.
- **A material palette that recurs**: lime plaster, Douglas fir and oak, board-marked
  concrete, pennant and limestone, blackened steel, unlacquered brass, wool and linen.
- **People sparse and non-identifying.** A figure for scale at most, never a
  face in a project frame. Portraits are the exception and are deliberate.
- **Consistent grading** across the set: neutral to slightly cool in daylight,
  warm only where a lamp is genuinely in frame. Muted, not desaturated.
- **Never**: watermarks, captions, signage text, legible branding, lens flare,
  vignetting, tilt-shift toy effects, or a wide-angle so wide the room bends.

## Provenance after generation

Every produced file is ingested as `provenance: generated`,
`assetStatus: approved`, `rightsStatus: approved-for-use`,
`publishUseAllowed: true`, against the asset ID it was made for. It is
publishable **within this benchmark only** and must never be reused as a real
company's imagery.

---

## Brand

Flat vector-like wordmark. Type only, no device or symbol. Set in a quiet transitional serif with generous letter spacing; the ampersand is the only expressive character. Pure black on transparent, no effects.

### `ar-brand-wordmark`

- **Subject** — Ardwell & Roe wordmark, black on transparent
- **Aspect** — square (square), crop tolerance: none
- **Used on** — site header and footer
- **Alt text intent** — Ardwell & Roe
- **Status** — required; bytes absent

## Opening imagery

The frame a visitor meets first. Must survive a wide crop and hold interest at 2× the width of a project frame. Architecture reading as a whole, not a detail.

### `ar-home-hero-01`

- **Subject** — Ashcombe Barn interior, full height of the stone shell with the inserted timber rooms
- **Aspect** — 16:9 (landscape), crop tolerance: wide
- **Used on** — Home opening
- **Alt text intent** — The interior of a converted stone barn, timber rooms inserted beneath the original roof structure
- **Status** — required; bytes absent

### `ar-home-hero-02`

- **Subject** — Cargo House rear bay at dusk, city falling away behind
- **Aspect** — 16:9 (landscape), crop tolerance: wide
- **Used on** — Home opening, alternate
- **Alt text intent** — A timber-framed bay window looking out over a city at dusk
- **Status** — optional; bytes absent

## Social preview

Legible as a thumbnail at 300px wide. One clear building form, generous margin, nothing that relies on fine detail.

### `ar-social-og`

- **Subject** — Ashcombe Barn exterior, long elevation
- **Aspect** — 1.91:1 (square), crop tolerance: wide
- **Used on** — Open Graph and social preview
- **Alt text intent** — Ardwell & Roe — architecture and interior architecture, Bristol
- **Status** — required; bytes absent

## Project — primary frame

The single image the project is remembered by. Exterior or principal interior, whichever carries the idea. Must work as a portfolio tile and as a page opening.

### `ar-project-cargo-house-01`

- **Subject** — Cargo House, Totterdown, Bristol — the defining view
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Work index and Cargo House story
- **Project** — Cargo House
- **Alt text intent** — Cargo House, Totterdown, Bristol
- **Status** — required; bytes absent

### `ar-project-ashcombe-barn-01`

- **Subject** — Ashcombe Barn, Mendip Hills, Somerset — the defining view
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Work index and Ashcombe Barn story
- **Project** — Ashcombe Barn
- **Alt text intent** — Ashcombe Barn, Mendip Hills, Somerset
- **Status** — required; bytes absent

### `ar-project-bottle-works-01`

- **Subject** — The Bottle Works, Bedminster, Bristol — the defining view
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Work index and The Bottle Works story
- **Project** — The Bottle Works
- **Alt text intent** — The Bottle Works, Bedminster, Bristol
- **Status** — required; bytes absent

### `ar-project-quarry-lane-01`

- **Subject** — Quarry Lane, Chew Valley, Somerset — the defining view
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Work index and Quarry Lane story
- **Project** — Quarry Lane
- **Alt text intent** — Quarry Lane, Chew Valley, Somerset
- **Status** — required; bytes absent

### `ar-project-tidewell-studio-01`

- **Subject** — Tidewell Studio, Cardiff Bay — the defining view
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Work index and Tidewell Studio story
- **Project** — Tidewell Studio
- **Alt text intent** — Tidewell Studio, Cardiff Bay
- **Status** — required; bytes absent

### `ar-project-pilgrim-street-01`

- **Subject** — Pilgrim Street Rooms, Bath — the defining view
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Work index and Pilgrim Street Rooms story
- **Project** — Pilgrim Street Rooms
- **Alt text intent** — Pilgrim Street Rooms, Bath
- **Status** — required; bytes absent

## Project — supporting frame

A second, different view: usually the reverse of the primary, or the moment where the plan idea becomes visible. Must not duplicate the primary’s angle.

### `ar-project-cargo-house-02`

- **Subject** — Cargo House — a second view showing the plan or section idea
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Cargo House story
- **Project** — Cargo House
- **Alt text intent** — Cargo House — interior view
- **Status** — required; bytes absent

### `ar-project-ashcombe-barn-02`

- **Subject** — Ashcombe Barn — a second view showing the plan or section idea
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Ashcombe Barn story
- **Project** — Ashcombe Barn
- **Alt text intent** — Ashcombe Barn — interior view
- **Status** — required; bytes absent

### `ar-project-bottle-works-02`

- **Subject** — The Bottle Works — a second view showing the plan or section idea
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — The Bottle Works story
- **Project** — The Bottle Works
- **Alt text intent** — The Bottle Works — interior view
- **Status** — required; bytes absent

### `ar-project-quarry-lane-02`

- **Subject** — Quarry Lane — a second view showing the plan or section idea
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Quarry Lane story
- **Project** — Quarry Lane
- **Alt text intent** — Quarry Lane — interior view
- **Status** — required; bytes absent

### `ar-project-tidewell-studio-02`

- **Subject** — Tidewell Studio — a second view showing the plan or section idea
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Tidewell Studio story
- **Project** — Tidewell Studio
- **Alt text intent** — Tidewell Studio — interior view
- **Status** — required; bytes absent

### `ar-project-pilgrim-street-02`

- **Subject** — Pilgrim Street Rooms — a second view showing the plan or section idea
- **Aspect** — 3:2 (landscape), crop tolerance: moderate
- **Used on** — Pilgrim Street Rooms story
- **Project** — Pilgrim Street Rooms
- **Alt text intent** — Pilgrim Street Rooms — interior view
- **Status** — required; bytes absent

## Project — material detail

Close range on a junction, a material meeting or a piece of joinery. Shallow depth of field is acceptable here and nowhere else. Never cropped.

### `ar-project-cargo-house-03`

- **Subject** — Cargo House — material or junction detail at close range
- **Aspect** — 4:5 (portrait), crop tolerance: none
- **Used on** — Cargo House story
- **Project** — Cargo House
- **Alt text intent** — Cargo House — material detail
- **Status** — optional; bytes absent

### `ar-project-ashcombe-barn-03`

- **Subject** — Ashcombe Barn — material or junction detail at close range
- **Aspect** — 4:5 (portrait), crop tolerance: none
- **Used on** — Ashcombe Barn story
- **Project** — Ashcombe Barn
- **Alt text intent** — Ashcombe Barn — material detail
- **Status** — optional; bytes absent

### `ar-project-bottle-works-03`

- **Subject** — The Bottle Works — material or junction detail at close range
- **Aspect** — 4:5 (portrait), crop tolerance: none
- **Used on** — The Bottle Works story
- **Project** — The Bottle Works
- **Alt text intent** — The Bottle Works — material detail
- **Status** — optional; bytes absent

### `ar-project-quarry-lane-03`

- **Subject** — Quarry Lane — material or junction detail at close range
- **Aspect** — 4:5 (portrait), crop tolerance: none
- **Used on** — Quarry Lane story
- **Project** — Quarry Lane
- **Alt text intent** — Quarry Lane — material detail
- **Status** — optional; bytes absent

### `ar-project-tidewell-studio-03`

- **Subject** — Tidewell Studio — material or junction detail at close range
- **Aspect** — 4:5 (portrait), crop tolerance: none
- **Used on** — Tidewell Studio story
- **Project** — Tidewell Studio
- **Alt text intent** — Tidewell Studio — material detail
- **Status** — optional; bytes absent

### `ar-project-pilgrim-street-03`

- **Subject** — Pilgrim Street Rooms — material or junction detail at close range
- **Aspect** — 4:5 (portrait), crop tolerance: none
- **Used on** — Pilgrim Street Rooms story
- **Project** — Pilgrim Street Rooms
- **Alt text intent** — Pilgrim Street Rooms — material detail
- **Status** — optional; bytes absent

## Studio portrait

Working portrait in the studio, natural window light, mid-shot, subject occupied rather than posed to camera. Neutral clothing. Consistent lighting and grading across all portraits.

### `ar-portrait-nella-ardwell`

- **Subject** — Nella Ardwell, Founding director — working portrait in the studio, natural light
- **Aspect** — 4:5 (portrait), crop tolerance: moderate
- **Used on** — Studio page
- **Alt text intent** — Nella Ardwell, Founding director
- **Status** — required; bytes absent

### `ar-portrait-tomas-roe`

- **Subject** — Tomas Roe, Founding director — working portrait in the studio, natural light
- **Aspect** — 4:5 (portrait), crop tolerance: moderate
- **Used on** — Studio page
- **Alt text intent** — Tomas Roe, Founding director
- **Status** — required; bytes absent

### `ar-portrait-priya-sandhar`

- **Subject** — Priya Sandhar, Associate architect — working portrait in the studio, natural light
- **Aspect** — 4:5 (portrait), crop tolerance: moderate
- **Used on** — Studio page
- **Alt text intent** — Priya Sandhar, Associate architect
- **Status** — optional; bytes absent

### `ar-portrait-callum-frayne`

- **Subject** — Callum Frayne, Architect — working portrait in the studio, natural light
- **Aspect** — 4:5 (portrait), crop tolerance: moderate
- **Used on** — Studio page
- **Alt text intent** — Callum Frayne, Architect
- **Status** — optional; bytes absent

### `ar-portrait-marit-eklund`

- **Subject** — Marit Eklund, Interior architect — working portrait in the studio, natural light
- **Aspect** — 4:5 (portrait), crop tolerance: moderate
- **Used on** — Studio page
- **Alt text intent** — Marit Eklund, Interior architect
- **Status** — optional; bytes absent

## Negative constraints — the whole set

Apply to every image without exception:

- no text, watermark, signature, caption or legible signage of any kind;
- no recognisable real building, real place or real person;
- no faces in project frames;
- no impossible geometry, floating structure or unsupported span;
- no visible construction error a reviewer of this category would notice;
- no stock-photography styling: no staged coffee cups, no artful throws, no laptop-on-a-bench;
- no seasonal or dated styling that would age the portfolio;
- no lens flare, no heavy vignette, no false HDR, no tilt-shift.
