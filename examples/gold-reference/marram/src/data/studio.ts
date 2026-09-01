/**
 * Marram — a fictional coastal planting studio.
 *
 * Invented for this corpus, to the same fiction-safety rules the visual-excellence benchmark
 * enforces: the `.invalid` TLD can never resolve, and the telephone number is from the Ofcom
 * drama range which is never allocated. Nothing here describes a real practice, garden, client
 * or award.
 *
 * The business exists to test a different design problem from Ardwell & Roe: conversion is
 * load-bearing, the audience is buying a service rather than choosing a collaborator, and the
 * imagery is not photographic. A studio that sells a paid first visit has to earn it on the
 * page.
 */

export interface Plant {
  slug: string;
  latin: string;
  common: string;
  /** What it does in a scheme — the reason it is specified, not a description. */
  role: string;
  /** Months in leaf or flower, 1–12. The register's season bar reads from this. */
  season: [number, number];
  tolerance: string;
}

export interface Garden {
  slug: string;
  name: string;
  place: string;
  year: number;
  brief: string;
  condition: string;
  approach: string;
  plants: string[];
  measure: { figure: string; caption: string };
}

export const studio = {
  name: 'Marram',
  legalName: 'Marram Landscape Ltd',
  founded: 2015,
  people: 4,
  positioning:
    'A planting and landscape studio on the Suffolk coast. We make gardens for salt wind, thin soil and long dry summers — planted so they do not need watering after the second year.',
  principle: 'A garden that needs a hose in August was planted wrong in March.',
  contact: {
    email: 'studio@marram.invalid',
    phone: '01728 496 0231',
    address: 'The Net Store, Crag Path, Aldeburgh, Suffolk, IP15 5BS',
  },
  regions: ['Suffolk', 'Norfolk', 'North Essex'],
  /* The conversion device, and the reason this prototype is a different test from the first:
     a priced first step is a commitment, and the page has to be worth it. */
  firstVisit: { price: '£450', includes: 'A half-day on site, a soil and exposure assessment, and a written planting strategy. Deducted in full if you go on to commission a design.' },
} as const;

export const plants: Plant[] = [
  { slug: 'eryngium', latin: 'Eryngium maritimum', common: 'Sea holly', role: 'Structure through winter; the skeleton the scheme is read against', season: [6, 11], tolerance: 'Salt, drought, pure sand' },
  { slug: 'armeria', latin: 'Armeria maritima', common: 'Thrift', role: 'Ground cover on shingle where nothing else will hold', season: [4, 7], tolerance: 'Salt, exposure, no soil' },
  { slug: 'crambe', latin: 'Crambe maritima', common: 'Sea kale', role: 'Glaucous mass in spring; the first thing that reads from the house', season: [4, 8], tolerance: 'Salt spray, shingle' },
  { slug: 'glaucium', latin: 'Glaucium flavum', common: 'Yellow horned poppy', role: 'Self-seeds into the gaps we deliberately leave', season: [6, 9], tolerance: 'Drought, shingle' },
  { slug: 'silene', latin: 'Silene uniflora', common: 'Sea campion', role: 'Softens hard edges; takes foot traffic at a path margin', season: [5, 8], tolerance: 'Salt, poor soil' },
  { slug: 'echinops', latin: 'Echinops ritro', common: 'Globe thistle', role: 'Height without bulk; stands through gales that flatten delphinium', season: [7, 9], tolerance: 'Drought, wind' },
  { slug: 'achillea', latin: 'Achillea millefolium', common: 'Yarrow', role: 'The flat plane the vertical plants are measured against', season: [6, 9], tolerance: 'Drought, thin soil' },
  { slug: 'knautia', latin: 'Knautia arvensis', common: 'Field scabious', role: 'Movement; the plant that shows the wind', season: [6, 9], tolerance: 'Drought, chalk' },
  { slug: 'verbascum', latin: 'Verbascum thapsus', common: 'Mullein', role: 'Punctuation. Used singly, never in a group', season: [6, 8], tolerance: 'Drought, gravel' },
  { slug: 'sedum', latin: 'Hylotelephium spectabile', common: 'Ice plant', role: 'Late colour and winter seedheads; the last thing standing', season: [8, 12], tolerance: 'Drought, poor soil' },
  { slug: 'digitalis', latin: 'Digitalis purpurea', common: 'Foxglove', role: 'For the sheltered side only — it will not take the wind', season: [5, 7], tolerance: 'Shade, shelter' },
  { slug: 'papaver', latin: 'Papaver rhoeas', common: 'Field poppy', role: 'Sown, not planted. Fills the first summer while the rest establishes', season: [5, 7], tolerance: 'Disturbed ground' },
];

export const gardens: Garden[] = [
  {
    slug: 'slaughden',
    name: 'Slaughden',
    place: 'Alde estuary, Suffolk',
    year: 2022,
    brief: 'A three-quarter-acre garden on shingle between a house and the estuary wall, with no irrigation and no topsoil.',
    condition: 'Pure shingle over clay, salt-laden south-westerly wind across the whole site, and a client who had already lost two planting schemes in four years.',
    approach: 'Nothing was imported. The scheme is planted directly into the shingle at low density and left to close over four seasons, with the gaps sown rather than planted.',
    plants: ['eryngium', 'crambe', 'armeria', 'glaucium', 'silene'],
    measure: { figure: 'No irrigation', caption: 'Fourth summer, no watering since the second' },
  },
  {
    slug: 'cley-boundary',
    name: 'Cley Boundary',
    place: 'North Norfolk',
    year: 2023,
    brief: 'The landward edge of a house sitting against a salt marsh, where the previous hedge had died twice.',
    condition: 'Salt inundation two or three times a winter, and a planning condition requiring an unbroken visual boundary.',
    approach: 'A hedge was the wrong instrument. The boundary is now a 4-metre band of grass and umbellifer that reads as solid from the road and floods without harm.',
    plants: ['achillea', 'knautia', 'echinops', 'sedum'],
    measure: { figure: '2 winters', caption: 'Two salt inundations, no replacement planting' },
  },
  {
    slug: 'butley-walled',
    name: 'Butley Walled Garden',
    place: 'Butley, Suffolk',
    year: 2024,
    brief: 'A Victorian walled garden replanted for a climate its borders were not built for.',
    condition: 'South-facing brick that holds heat until midnight, and a herbaceous scheme that had been irrigated daily for thirty years.',
    approach: 'The irrigation was removed in the first season rather than tapered, and the planting was replaced in three bands by how far each sits from the wall.',
    plants: ['verbascum', 'echinops', 'achillea', 'sedum', 'knautia'],
    measure: { figure: '−94%', caption: 'Mains water for the garden, against the year before' },
  },
  {
    slug: 'orford-quay',
    name: 'Orford Quay',
    place: 'Orford, Suffolk',
    year: 2021,
    brief: 'A courtyard of eleven square metres behind a quayside cottage, in full salt wind.',
    condition: 'Wind funnelled between two buildings, no soil deeper than 200mm, and no possibility of shelter planting.',
    approach: 'Everything is in the ground plane. The scheme has no plant taller than 600mm and depends on texture rather than height.',
    plants: ['armeria', 'silene', 'glaucium'],
    measure: { figure: '11 m²', caption: 'The smallest garden the studio has taken, and the most published' },
  },
];

export const people = [
  { name: 'Rowan Amery', role: 'Founder', note: 'Trained at Kew and spent six years on the Suffolk coast before starting the studio in 2015. Writes the planting plan for every garden the studio takes.' },
  { name: 'Ines Kowal', role: 'Landscape architect', note: 'Leads the built work — walls, paths, levels and drainage. Joined from a practice doing coastal defence, which is a more useful background than it sounds.' },
  { name: 'Tom Reddaway', role: 'Head of stewardship', note: 'Looks after the gardens after handover. Most of what the studio knows about what actually survives comes from him.' },
];

export const proof = [
  { quote: 'We had lost two schemes to the wind before Marram. The difference is that they planted less, further apart, and told us it would look sparse for two years. It did, and then it did not.', who: 'Private client', garden: 'Slaughden' },
  { quote: 'They talked us out of the hedge we asked for and were plainly right. It floods twice a winter now and nothing dies.', who: 'Private client', garden: 'Cley Boundary' },
  { quote: 'Turning the irrigation off in the first season was frightening and it was the correct advice.', who: 'Estate manager', garden: 'Butley Walled Garden' },
];

export const recognition = [
  { award: 'Society of Garden Designers Award, Planting Design', project: 'Slaughden', year: 2023 },
  { award: 'BALI National Landscape Award, Small Domestic', project: 'Orford Quay', year: 2022 },
  { award: 'RHS Chelsea Silver-Gilt, Sanctuary Garden', project: '—', year: 2024 },
];

/**
 * The stewardship log.
 *
 * A studio that refuses photography has to prove delivery some other way. Tom's handover
 * records are the honest form of that proof: what was planted, what has been replaced since,
 * and what it has cost to keep alive. A garden that needed no replacement planting in four
 * summers is a stronger claim than a photograph of one taken in June.
 */
export const record = {
  asAt: 2026,
  rows: [
    { slug: 'slaughden', planted: 2022, replacements: 'None', water: 'None since 2024', visits: 2 },
    { slug: 'cley-boundary', planted: 2023, replacements: 'None', water: 'None', visits: 2 },
    { slug: 'butley-walled', planted: 2024, replacements: '11 of 640 plants', water: '6% of prior year', visits: 3 },
    { slug: 'orford-quay', planted: 2021, replacements: '3 of 84 plants', water: 'None since 2022', visits: 1 },
  ],
} as const;
