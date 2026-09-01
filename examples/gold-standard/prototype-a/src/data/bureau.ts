/**
 * NØRREVÆRK — a fictional bureau, invented for this corpus.
 *
 * Fiction safety is mechanical, as elsewhere in these corpora: the `.invalid` TLD can never
 * resolve, and no client, award, publication or figure below describes anything real.
 *
 * The design problem this prototype exists to test is the one the Gold Reference corpus
 * failed. It authored a distinctive artefact and then laid it out with a generic page
 * grammar — four projects, alternating sides, every one the same size. So the brief here is
 * not "an architecture site"; it is a *collection presented at unequal weight*, where the
 * page says which projects matter by how much room it gives them.
 *
 * The bureau works only on buildings that already exist. That is a real design decision and
 * not a flourish: it makes the signature artefact a **pair** — the building as found and the
 * building as left — which is something no other business in either corpus can show, and it
 * is honest about imagery whose subjects are existing buildings by other architects.
 */

export interface Frame {
  slug: string;
  alt: string;
  /** Deliberate crop, authored per breakpoint. Aman holds three ratios; so does this. */
  ratio: '1.62' | '1' | '0.76';
  ratioMobile?: '1.62' | '1' | '0.76';
}

export interface Project {
  slug: string;
  /** The building, as it was known before. */
  found: string;
  /** What the bureau made it. */
  left: string;
  place: string;
  built: number;
  completed: number;
  /** Square metres. Deliberately spanning two orders of magnitude, so the index can be unequal. */
  area: number;
  /** One sentence. It appears on the index and nowhere else. */
  line: string;
  /** The condition on arrival — the half of the pair that is usually not shown. */
  asFound: string;
  /** The intervention, stated as a decision rather than a description. */
  decision: string;
  /** What the decision cost or saved, with its basis attached. */
  measure: { figure: string; caption: string };
  frames: Frame[];
  /** Placement in the register. Column start is authored; height is derived from area. */
  index: {
    span: number; start: number; height: number; offset: number;
    /** The crop this entry holds on a phone. One of the three permitted ratios, sequenced so
     *  the mobile index has rhythm instead of being one column of identical rectangles. */
    mobileRatio: '1.62' | '1' | '0.76';
    /**
     * Weight on a phone. A single column cannot carry an opinion in column spans, so it
     * carries it in width: 'bleed' runs edge to edge past the gutter, 'full' sits in the
     * measure, 'inset' is held back from both margins. A reviewer scored responsive-quality 7
     * because the desktop hierarchy — which project matters — vanished on mobile. This is
     * where it goes instead.
     */
    mobileWeight: 'bleed' | 'full' | 'inset';
  };
}

export const bureau = {
  name: 'Nørreværk',
  legalName: 'Nørreværk Bygningskunst ApS',
  founded: 2011,
  people: 16,
  /** Two lines. The first is what they do; the second is the refusal that defines them. */
  positioning: 'A bureau for buildings that already exist.',
  refusal: 'We have never designed a building on an empty site, and we do not intend to.',
  contact: {
    copenhagen: { city: 'Copenhagen', line: 'Refshalevej 163A, 1432 København K', email: 'kbh@norrevaerk.invalid', phone: '+45 32 14 09 66' },
    malmo: { city: 'Malmö', line: 'Bergsgatan 20, 214 22 Malmö', email: 'malmo@norrevaerk.invalid', phone: '+46 40 668 21 40' },
  },
  services: ['Conversion', 'Extension', 'Repair', 'Condition survey', 'Listed-building consent'],
  /*
   * The commercial entry point, stated as an object rather than left in prose. An independent
   * reviewer scored conversion-clarity 5 because the survey — the one thing a client actually
   * buys first — was buried in bureau copy while the site offered a generic "Contact" link.
   * A page that will not say what to send, what it costs and what comes back is not being
   * restrained; it is being unhelpful.
   */
  survey: {
    price: 'DKK 38,000',
    duration: 'two weeks',
    send: 'An address and a photograph. That is genuinely enough to start.',
    steps: [
      { n: '01', title: 'You send us a building', detail: 'An address and a photograph. If it is not work we should take, we will say so within a week and there is nothing to pay.' },
      { n: '02', title: 'A partner visits it', detail: 'Half a day on site with whoever knows the building. We look at structure, envelope, services and what consent would require.' },
      { n: '03', title: 'A written condition survey', detail: 'Two weeks later, and it is the only thing we charge for before a contract. It is yours whether or not you appoint us.' },
    ],
    caveat: 'Roughly a third of surveys end with us advising against the project. That is the survey working.',
  },
} as const;

/**
 * Six projects, ordered as the index runs. Areas span 334 m² to 18,600 m² — a 55× range —
 * because a collection where every entry is the same size is a collection the page has
 * declined to have an opinion about.
 */
export const projects: Project[] = [
  {
    slug: 'kalvebod',
    found: 'Kalvebod switching station',
    left: 'The city archive',
    place: 'Copenhagen',
    built: 1961,
    completed: 2021,
    area: 2340,
    line: 'A switching station with no windows became the place the city keeps its records.',
    asFound:
      'Nine metres of clear height, a floor rated for transformer weight, and not one opening on three of the four elevations. It had been empty for eleven years and was scheduled for demolition twice.',
    decision:
      'Nothing was added to the outside. The archive is a building within the building — a freestanding insulated box holding the constant temperature the records need, so the original shell is left cold, unheated and structurally untouched.',
    measure: { figure: '0 openings', caption: 'New openings cut in the original envelope' },
    frames: [
      { slug: 'kalvebod-hall', alt: 'The main hall of the former switching station, lit from a continuous rooflight above a curved concrete soffit.', ratio: '1.62', ratioMobile: '0.76' },
      { slug: 'kalvebod-vault', alt: 'The curved concrete vault over the reading room, seen from below.', ratio: '0.76' },
      { slug: 'kalvebod-corridor', alt: 'The circulation route between the original shell and the inserted archive box.', ratio: '1' },
    ],
    index: { span: 7, start: 1, height: 540, offset: 0, mobileRatio: '0.76', mobileWeight: 'full' },
  },
  {
    slug: 'frihavn',
    found: 'Frihavn grain silo',
    left: 'One hundred and forty dwellings',
    place: 'Copenhagen',
    built: 1954,
    completed: 2024,
    area: 18600,
    line: 'Eighteen thousand square metres of concrete tube, and a rule that none of it would be demolished.',
    asFound:
      'Forty-two cylindrical cells, each 6.4 metres across and 34 metres tall, with walls slip-formed in one continuous pour. The cells had no floors, no openings and no way in above the discharge level.',
    decision:
      'The cells were cored rather than cut: every opening is a circle, because a circle does not need a lintel and a slip-formed wall does not want a corner. Floors span between cells and touch the curved walls at three points.',
    measure: { figure: '0 t', caption: 'Concrete removed from the primary structure' },
    frames: [
      { slug: 'frihavn-interior', alt: 'The interior of a silo cell after conversion, the curved concrete wall rising past an inserted floor.', ratio: '1.62', ratioMobile: '0.76' },
      { slug: 'frihavn-stair', alt: 'The new stair threaded between two cells, cast against the existing curve.', ratio: '0.76' },
      { slug: 'frihavn-chamber', alt: 'A dwelling formed inside a single cell, with a circular opening cored through the wall.', ratio: '0.76' },
      { slug: 'frihavn-exterior', alt: 'The silo from the harbour, the original slip-formed profile unchanged.', ratio: '1.62' },
    ],
    index: { span: 7, start: 9, height: 540, offset: 170, mobileRatio: '1', mobileWeight: 'bleed' },
  },
  {
    slug: 'nyborg',
    found: 'Nyborg water tower',
    left: 'A room for reading',
    place: 'Nyborg',
    built: 1938,
    completed: 2019,
    area: 334,
    line: 'The smallest thing the bureau has built, and the one it is asked about most.',
    asFound:
      'A brick shaft carrying a steel tank that had been dry since 1974. The tank was the only reason the tower existed and the only part of it that could not be kept.',
    decision:
      'The tank was removed and the void it left became the room. Nothing replaced it at that level, so the shaft now reads as a chimney with a library at the top and forty metres of nothing beneath.',
    measure: { figure: '334 m²', caption: 'Total floor area, across five levels' },
    frames: [
      { slug: 'nyborg-stair', alt: 'The spiral stair inside the brick shaft, seen from the base.', ratio: '1.62' },
      { slug: 'nyborg-aperture', alt: 'Light entering the shaft through a single original opening.', ratio: '0.76' },
      { slug: 'nyborg-wall', alt: 'The inner face of the shaft, with the tank fixings left in place.', ratio: '1' },
    ],
    index: { span: 4, start: 1, height: 700, offset: 416, mobileRatio: '0.76', mobileWeight: 'inset' },
  },
  {
    slug: 'bispebjerg',
    found: 'Bispebjerg boiler house',
    left: 'A gallery for one collection',
    place: 'Copenhagen',
    built: 1929,
    completed: 2022,
    area: 1180,
    line: 'A boiler house kept dark, because the collection it holds cannot be lit.',
    asFound:
      'Soot on every surface to a depth the survey measured in millimetres, two Lancashire boilers still in place, and a brick vault in better condition than the roof above it.',
    decision:
      'The soot was stabilised rather than removed. It is the reason the room is black, the reason the collection reads against it, and the only material evidence left of what the building did for sixty years.',
    measure: { figure: '30 lux', caption: 'Maximum illuminance, set by the collection' },
    frames: [
      { slug: 'bispebjerg-vault', alt: 'The brick vault of the boiler house, dark and lit from one side.', ratio: '1.62', ratioMobile: '0.76' },
      { slug: 'bispebjerg-dark', alt: 'The interior as found, with the boilers still in place.', ratio: '0.76' },
      { slug: 'bispebjerg-brick', alt: 'Detail of the stabilised brick surface.', ratio: '1' },
    ],
    index: { span: 6, start: 6, height: 540, offset: 188, mobileRatio: '1.62', mobileWeight: 'full' },
  },
  {
    slug: 'sankt-anna',
    found: 'Sankt Anna chapel',
    left: 'A hall for early music',
    place: 'Malmö',
    built: 1962,
    completed: 2023,
    area: 890,
    line: 'A chapel with a two-point-eight-second reverberation, which is a fault in a chapel and an asset in a concert hall.',
    asFound:
      'A congregation of eleven, a roof that had been patched four times, and an acoustic that had been complained about since the year it opened.',
    decision:
      'The acoustic was not corrected. Seating was removed instead, the floor was levelled, and the room was given to an ensemble that wanted exactly the reverberation the congregation had spent sixty years apologising for.',
    measure: { figure: '2.8 s', caption: 'Reverberation at 500 Hz, unchanged' },
    frames: [
      { slug: 'sanktanna-vault', alt: 'The ribbed vault of the chapel from the floor.', ratio: '0.76' },
      { slug: 'sanktanna-nave', alt: 'The nave with the seating removed.', ratio: '1.62' },
      { slug: 'sanktanna-dome', alt: 'The dome above the crossing.', ratio: '1' },
    ],
    index: { span: 7, start: 8, height: 540, offset: -214, mobileRatio: '0.76', mobileWeight: 'bleed' },
  },
  {
    slug: 'rodehus',
    found: 'Rødehus assembly hall',
    left: 'A school that kept its hall',
    place: 'Rødovre',
    built: 1971,
    completed: 2020,
    area: 4100,
    line: 'The brief asked for the hall to be subdivided. It was not.',
    asFound:
      'A single-volume assembly hall with a bright painted soffit, ringed by classrooms that had been added and removed twice. The hall was the only part anyone remembered.',
    decision:
      'The classrooms were rebuilt and the hall was left alone. Everything the brief needed was found by taking two metres from the corridor ring, which nobody has mentioned since.',
    measure: { figure: '2 m', caption: 'Taken from the corridor ring, not from the hall' },
    frames: [
      { slug: 'rodehus-hall', alt: 'The assembly hall with its original painted soffit.', ratio: '1.62', ratioMobile: '0.76' },
      { slug: 'rodehus-reading', alt: 'The rebuilt teaching wing.', ratio: '1' },
      { slug: 'rodehus-light', alt: 'Detail of the rooflight above the hall.', ratio: '0.76' },
    ],
    index: { span: 4, start: 5, height: 700, offset: 178, mobileRatio: '1', mobileWeight: 'inset' },
  },
];

/**
 * Facts the home page states before it shows anything. The reference class credentials
 * itself with a labelled data block rather than with a claim.
 */
export const facts = [
  { term: 'Founded', value: '2011' },
  { term: 'People', value: '16' },
  { term: 'Offices', value: 'Copenhagen, Malmö' },
  { term: 'Buildings on empty sites', value: 'None' },
  { term: 'Completed conversions', value: '31' },
  { term: 'Demolition consents refused', value: '4' },
];

export const people = [
  { name: 'Ingrid Halvorsen', role: 'Founding partner', note: 'Trained as a structural engineer and practised for nine years before qualifying in architecture. Writes the condition survey for every project the bureau takes.' },
  { name: 'Tobias Rehn', role: 'Partner', note: 'Leads the listed-building work. Has argued four demolition consents down to conversion, and lost two.' },
  { name: 'Mai Sørensen', role: 'Associate, surveys', note: 'Runs the first two weeks of every project, which is the part that decides whether the bureau takes it.' },
];

export const recognition = [
  { award: 'Nordisk Bygningspris', project: 'Frihavn', year: 2025 },
  { award: 'RIBA International Prize, longlist', project: 'Kalvebod', year: 2022 },
  { award: 'Europa Nostra Award, Conservation', project: 'Bispebjerg', year: 2023 },
  { award: 'Kasper Salin Prize, nomination', project: 'Sankt Anna', year: 2024 },
];

export const publications = [
  { title: 'Arkitektur DK', issue: '04 / 2025', subject: 'Frihavn' },
  { title: 'The Architectural Review', issue: 'No. 1512', subject: 'On not demolishing' },
  { title: 'Domus', issue: '1091', subject: 'Kalvebod' },
];
