/**
 * Ardwell & Roe, as the approved pack states it.
 *
 * Every string here traces to `examples/visual-excellence/ardwell-roe-approved-knowledge.v1.json`
 * (17 facts, 4 source documents). Nothing is invented, embellished or rounded up. Where a
 * number appears it is the studio's own number, and where a client is quoted it is the quote
 * as recorded with the attribution as recorded.
 *
 * The one thing this file adds is *structure*: the project dossier is prose, and a website
 * needs it as fields. Splitting a paragraph into `challenge` / `response` / `outcome` is a
 * reading of the source, not an addition to it — the sentences are unchanged.
 */

export interface Project {
  slug: string;
  name: string;
  place: string;
  year: number;
  type: 'House' | 'Adaptive reuse' | 'Hospitality' | 'Workplace' | 'Interior';
  summary: string;
  challenge: string;
  response: string;
  materials: string[];
  /** The measured result. This is the design idea: most practice sites have adjectives here. */
  outcome: { figure: string; caption: string };
  primary: string;
  secondary?: string;
}

export const studio = {
  name: 'Ardwell & Roe',
  legalName: 'Ardwell & Roe Architects Ltd',
  founded: 2011,
  people: 11,
  projects: 84,
  repeat: '38%',
  positioning:
    'An architecture and interior-architecture studio in Bristol. We take a small number of projects at a time and run each from first sketch to completion with the same pair of people.',
  principle: 'We prefer repairing and extending what exists to replacing it.',
  contact: {
    email: 'studio@ardwellandroe.invalid',
    phone: '0117 496 0148',
    address: 'The Sail Loft, 14 Merchants Quay, Bristol, BS1 4RW',
  },
  regions: ['Bristol', 'Bath', 'Somerset', 'South Wales', 'South West England'],
  press: ['Architects’ Journal', 'Dezeen', 'The Modern House', 'Somerset Life'],
} as const;

export const projects: Project[] = [
  {
    slug: 'ashcombe-barn',
    name: 'Ashcombe Barn',
    place: 'Mendip Hills, Somerset',
    year: 2023,
    type: 'Adaptive reuse',
    summary:
      'A collapsing stone threshing barn turned into a single-storey house without adding a second floor, on the principle that the volume was the thing worth keeping.',
    challenge:
      'A Grade II listing, a structurally unsound gable, and a planning history of two refused applications that had both proposed inserting a first floor.',
    response:
      'The inserted rooms are freestanding and reversible, touching the stone at as few points as possible. Nothing is fixed into the historic fabric that could not be removed.',
    materials: ['Rubble stone repaired in lime', 'Cross-laminated timber', 'Sheep’s wool insulation', 'Salvaged cast-iron rooflights'],
    outcome: { figure: 'First submission', caption: 'Consented at first submission, after two previous refusals' },
    primary: 'ashcombe-barn-primary',
    secondary: 'ashcombe-barn-section',
  },
  {
    slug: 'cargo-house',
    name: 'Cargo House',
    place: 'Totterdown, Bristol',
    year: 2024,
    type: 'House',
    summary:
      'A Victorian terrace on one of the steepest streets in Bristol, reordered around the view it had always turned its back on.',
    challenge:
      'The house was three tight rooms deep with a single north window at the back, and every previous attempt on the street had answered that with a full-width glass box that cooked in summer and lost the garden.',
    response:
      'Rather than widen, the studio went deeper and lower, and traded glass area for a shaded reveal. The bay is oak-framed and set back under a 900mm soffit, so the glazing is smaller than the neighbours’ and the room is brighter for longer.',
    materials: ['Douglas fir frame', 'Lime-plastered walls', 'Reclaimed pennant stone threshold', 'Unlacquered brass ironmongery'],
    outcome: { figure: 'Less glass', caption: 'Measured daylight rose in a room with less glazing than the scheme it replaced' },
    primary: 'cargo-house-primary',
    secondary: 'cargo-house-section',
  },
  {
    slug: 'bottle-works',
    name: 'The Bottle Works',
    place: 'Bedminster, Bristol',
    year: 2025,
    type: 'Hospitality',
    summary:
      'A former glass bottling hall turned into a 90-cover restaurant and bar, with the kitchen against the long wall in full view so the room’s organising idea is the work.',
    challenge:
      'A 34-metre-long room with windows at one end only, and an operator who needed it to work at 30 covers on a Tuesday without feeling abandoned.',
    response:
      'The room is divided by joinery rather than by walls, so it can be closed down band by band across a week. Lighting is circuited to match, and the empty end reads as intentional rather than unused.',
    materials: ['Salvaged maple flooring', 'Blackened steel screens', 'Tiled service counter', 'Unlined plaster ceiling'],
    outcome: { figure: '3 weeks early', caption: 'Opened three weeks ahead of programme; the operator has taken a second site' },
    primary: 'bottle-works-primary',
    secondary: 'bottle-works-bar',
  },
  {
    slug: 'quarry-lane',
    name: 'Quarry Lane',
    place: 'Chew Valley, Somerset',
    year: 2024,
    type: 'House',
    summary:
      'A new house on the footprint of a demolished agricultural building, arranged as two linked volumes that follow the fall of the site.',
    challenge:
      'An open countryside site where consent depended entirely on the replacement-dwelling footprint, and where the previous owner had already been refused twice for exceeding it.',
    response:
      'The scheme is exactly the footprint it replaced, and buys its space by section rather than plan: the living volume is a metre and a half taller than a domestic room needs to be, and the bedroom volume is deliberately low.',
    materials: ['Charred larch cladding', 'Board-marked concrete plinth', 'Clay pantile roof'],
    outcome: { figure: '1.9 m³/h·m²', caption: 'Airtightness tested without a specialist contractor' },
    // The generated exterior frame reads as a shed in a muddy field; the opening between the
    // two volumes is the stronger picture and is the one the scheme is actually about.
    primary: 'quarry-lane-link',
    secondary: 'quarry-lane-primary',
  },
  {
    slug: 'tidewell-studio',
    name: 'Tidewell Studio',
    place: 'Cardiff Bay',
    year: 2023,
    type: 'Workplace',
    summary:
      'A workplace for a marine research group, half laboratory and half writing room, separated by a full-height storage wall that also does the acoustic work.',
    challenge:
      'Wet laboratory servicing and quiet desk work in one shell, on a budget that could not afford to fully fit out both.',
    response:
      'Everything serviced was pushed to one bay and left frankly exposed; everything quiet was left as plain, well-daylit floor. The saving from not lining the laboratory paid for the storage wall.',
    materials: ['Exposed galvanised services', 'Birch ply casework', 'Linoleum', 'Acoustic felt from recycled bottle stock'],
    outcome: { figure: '0.6 seconds', caption: 'Reverberation in the writing room, against a 0.8 target' },
    primary: 'tidewell-primary',
    secondary: 'tidewell-writing',
  },
  {
    slug: 'pilgrim-street-rooms',
    name: 'Pilgrim Street Rooms',
    place: 'Bath',
    year: 2022,
    type: 'Interior',
    summary:
      'A one-bedroom flat in a Grade II* terrace, reorganised without moving a single wall. Every change is joinery.',
    challenge:
      'A protected interior where nothing structural could be touched, and a client who needed the flat to work as both a home and a consulting room.',
    response:
      'The studio treated the flat as furniture. Each piece is freestanding, scribed to the existing plaster and removable without trace.',
    materials: ['Painted tulipwood joinery', 'Honed limestone', 'Unlacquered brass left to patinate', 'Undyed wool'],
    outcome: { figure: 'No fabric altered', caption: 'Consented as a listed building application with no alteration to fabric' },
    primary: 'pilgrim-street-joinery',
    secondary: 'pilgrim-street-primary',
  },
];

export const people = [
  { name: 'Nella Ardwell', role: 'Founding director', note: 'Co-founded the studio in 2011 after eleven years in London working on public buildings. Leads the housing and adaptive-reuse work, and runs every project she takes from first sketch to handover. Teaches one day a fortnight at the Welsh School of Architecture.', portrait: 'portrait-nella-ardwell' },
  { name: 'Tomas Roe', role: 'Founding director', note: 'The studio’s interiors lead. Trained as a furniture maker before qualifying as an architect, which is why the studio draws its own joinery and works directly with makers rather than through a contractor’s specification.', portrait: 'portrait-tomas-roe' },
  { name: 'Priya Sandhar', role: 'Associate architect', note: 'Joined in 2016. Leads hospitality and workplace projects and the studio’s technical delivery. The person most likely to be on site on a Friday.' },
  { name: 'Callum Frayne', role: 'Architect', note: 'Conservation-accredited. Runs the listed and locally listed work, and prepares the studio’s heritage statements in-house rather than commissioning them.' },
  { name: 'Marit Eklund', role: 'Interior architect', note: 'Leads material research and specification, and maintains the studio’s material library — which clients are welcome to visit and frequently do before appointing.' },
];

export const testimonials = [
  { quote: 'We interviewed four practices and Ardwell & Roe were the only ones who told us the thing we wanted was the wrong thing to want. They were right, and the house is better for it.', who: 'Private client', project: 'Cargo House' },
  { quote: 'Two refusals in four years, then consented first time. They spent longer understanding why the building was listed than the other architects spent on the whole application.', who: 'Private client', project: 'Ashcombe Barn' },
  { quote: 'They designed the room around how a service actually runs, not around how it photographs. Three weeks early and we have taken a second site with them.', who: 'Operations director, Fen & Marrow', project: 'The Bottle Works' },
  { quote: 'The budget was tight and they were honest about it from the first meeting. What we could not afford, they left plainly unfinished rather than cheaply finished, and it looks deliberate because it is.', who: 'Director, Tidewell Marine Research', project: 'Tidewell Studio' },
  { quote: 'Forty-six square metres and they never once suggested we move. It is the only flat I have lived in where nothing is in the way.', who: 'Private client', project: 'Pilgrim Street Rooms' },
];

export const awards = [
  { award: 'RIBA South West Award', project: 'Ashcombe Barn', year: 2024 },
  { award: 'Civic Trust Commendation', project: 'The Bottle Works', year: 2025 },
  { award: 'Wood Awards, Small Project shortlist', project: 'Pilgrim Street Rooms', year: 2023 },
  { award: 'Somerset Design Review Panel commendation', project: 'Quarry Lane', year: 2024 },
];
