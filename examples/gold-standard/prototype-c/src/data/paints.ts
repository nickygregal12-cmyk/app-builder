/**
 * The four paints, and what may go under them.
 *
 * The numbers here are the ones that decide a specification: how much vapour the coating
 * resists, how far a litre goes, how many coats it takes and what it will not stick to. They
 * are also the numbers a paint company is most tempted to round in its own favour — coverage
 * quoted on a sealed test panel rather than on lime plaster, sd values quoted for one coat when
 * limewash needs five.
 *
 * Where a figure is optimistic against a real wall, the real figure is the one stored and the
 * optimistic one is named as such. A coverage calculator that flatters is worse than no
 * calculator: the customer finds out at the second coat.
 */

import type { FinishId } from './colours';

export interface Paint {
  id: FinishId;
  name: string;
  /** One line: what it is, chemically. */
  what: string;
  /** Vapour diffusion equivalent air layer thickness, in metres, over the full specified system. */
  sd: number;
  sdNote: string;
  /** Square metres per litre, per coat, on a lime-plastered wall rather than a test panel. */
  coverage: number;
  coats: number;
  /** Price for five litres, delivered. */
  price: number;
  interiorOnly: boolean;
  /** The honest disadvantage. Every one of these has one. */
  drawback: string;
  use: string;
}

/**
 * For comparison, and it is the whole argument: a modern vinyl emulsion.
 *
 * Quoted as a range because it varies by brand and film build, and at the bottom of that range
 * it is still an order of magnitude more resistant than anything below.
 */
export const EMULSION_SD = '0.4 – 2.0';

export const PAINTS: Paint[] = [
  {
    id: 'limewash',
    name: 'Limewash',
    what: 'Slaked lime putty, matured twelve months, thinned with water and pigmented with lime-fast earths.',
    sd: 0.02,
    sdNote: 'Over five coats. A limewash system is more breathable than most of the plasters it goes on.',
    coverage: 9,
    coats: 4,
    price: 58,
    interiorOnly: false,
    drawback: 'It dusts. For the first few weeks a hand run down the wall comes away chalky, and in a high-traffic hall it will keep doing so. That is the trade-off for the way it holds light.',
    use: 'Solid walls, lime render, brick and stone, inside and out. The default specification for a pre-1919 exterior.',
  },
  {
    id: 'silicate',
    name: 'Silicate',
    what: 'Potassium silicate binder that reacts chemically with a mineral substrate rather than sitting on it.',
    sd: 0.04,
    sdNote: 'Two coats. Slightly higher than limewash and still twenty times more open than emulsion.',
    coverage: 7,
    coats: 2,
    price: 96,
    interiorOnly: false,
    drawback: 'It is permanent. Silicate bonds into the substrate and cannot be removed or painted over with anything but silicate, so specifying it is a decision about the next fifty years.',
    use: 'Exterior masonry and render where limewash will not last: exposed elevations, sheltered-from-nothing gables, anything on the coast.',
  },
  {
    id: 'distemper',
    name: 'Clay distemper',
    what: 'Chalk and china clay in a plant-cellulose size. No oil, no acrylic, no vinyl.',
    sd: 0.01,
    sdNote: 'The most open coating we make, and the most fragile.',
    coverage: 11,
    coats: 2,
    price: 64,
    interiorOnly: true,
    drawback: 'It cannot be washed. A mark on distemper is dealt with by repainting the wall, which is quick and cheap and is nonetheless not what most people expect from paint.',
    use: 'Interior walls and ceilings in rooms that are looked at rather than lived hard in. Traditional on lime plaster and unbeatable on a ceiling.',
  },
  {
    id: 'casein',
    name: 'Lime-casein',
    what: 'Lime bound with milk protein. The oldest durable interior paint there is, and still the best compromise.',
    sd: 0.08,
    sdNote: 'Two coats. The least open of the four and still five times more open than the most permeable emulsion.',
    coverage: 10,
    coats: 2,
    price: 78,
    interiorOnly: true,
    drawback: 'It has a faint sheen where limewash and distemper have none, and it will show a roller mark if it is applied like emulsion. It wants a brush.',
    use: 'Interior walls that need to survive a family: hallways, kitchens, anywhere a distemper would be repainted twice a year.',
  },
];

export const paintById = new Map(PAINTS.map((paint) => [paint.id, paint]));

/* -------------------------------------------------------------------------- */

export type Verdict = 'yes' | 'prep' | 'no';

export interface Substrate {
  id: string;
  name: string;
  note: string;
  /** What each paint may do on it. */
  on: Record<FinishId, { verdict: Verdict; why: string }>;
}

/**
 * The matrix that refuses.
 *
 * This is the part of the site most likely to lose an order, which is why it is a route rather
 * than a footnote. A customer whose walls are in modern emulsion cannot use any of these
 * products without stripping first, and telling them at the checkout is how a paint company
 * gets a return, a bad review and a wall that is now worse than it was.
 */
export const SUBSTRATES: Substrate[] = [
  {
    id: 'lime-plaster',
    name: 'Lime plaster, bare',
    note: 'The substrate all four were designed for.',
    on: {
      limewash: { verdict: 'yes', why: 'Chemically the same material. Nothing bonds better.' },
      silicate: { verdict: 'yes', why: 'Silicifies into the plaster.' },
      distemper: { verdict: 'yes', why: 'The traditional pairing.' },
      casein: { verdict: 'yes', why: 'Ideal, and the most durable of the four here.' },
    },
  },
  {
    id: 'clay-plaster',
    name: 'Clay plaster, bare',
    note: 'Increasingly common in retrofit. Softer than lime and more moisture-active.',
    on: {
      limewash: { verdict: 'prep', why: 'Needs a stabilising coat first; clay is too absorbent and will pull the lime in unevenly.' },
      silicate: { verdict: 'no', why: 'Silicate needs a mineral substrate to react with. Clay does not silicify.' },
      distemper: { verdict: 'yes', why: 'The best match. Both stay soft and both move with the wall.' },
      casein: { verdict: 'yes', why: 'Good, with a thinned first coat.' },
    },
  },
  {
    id: 'gypsum-plaster',
    name: 'Gypsum plaster, new',
    note: 'Standard modern plaster. Not breathable in the way lime is, but takes paint well.',
    on: {
      limewash: { verdict: 'prep', why: 'Lime does not bond to gypsum reliably. Needs a mineral primer, and even then it is a compromise.' },
      silicate: { verdict: 'no', why: 'No reaction with gypsum. It will sit on the surface and fail.' },
      distemper: { verdict: 'yes', why: 'Fine, once the plaster has fully dried.' },
      casein: { verdict: 'yes', why: 'Fine. This is the usual answer for a modern wall in an old house.' },
    },
  },
  {
    id: 'brick-stone',
    name: 'Brick or stone, bare',
    note: 'Exterior or exposed interior. Absorbency varies enormously.',
    on: {
      limewash: { verdict: 'yes', why: 'What limewash is for. Expect five coats on new brick and expect it to look wrong until the third.' },
      silicate: { verdict: 'yes', why: 'Excellent, and the right answer on a badly exposed elevation.' },
      distemper: { verdict: 'no', why: 'Interior only, and will not hold on masonry.' },
      casein: { verdict: 'prep', why: 'Interior masonry only, and only over a lime skim.' },
    },
  },
  {
    id: 'cement-render',
    name: 'Cement render',
    note: 'Usually a later addition to an old building, and usually part of the problem.',
    on: {
      limewash: { verdict: 'prep', why: 'It will take limewash and the wall will still not breathe, because the render is the barrier. Painting it changes nothing.' },
      silicate: { verdict: 'yes', why: 'Bonds well. The honest advice is still that the render should come off.' },
      distemper: { verdict: 'no', why: 'Interior only.' },
      casein: { verdict: 'no', why: 'Will not hold on cement.' },
    },
  },
  {
    id: 'existing-limewash',
    name: 'Existing limewash',
    note: 'Sound, and not chalking off in sheets.',
    on: {
      limewash: { verdict: 'yes', why: 'Brush off what is loose and go straight over.' },
      silicate: { verdict: 'prep', why: 'Only if the limewash is thin and sound. Thick old limewash must come off.' },
      distemper: { verdict: 'yes', why: 'Fine indoors.' },
      casein: { verdict: 'yes', why: 'Fine indoors.' },
    },
  },
  {
    id: 'existing-emulsion',
    name: 'Existing vinyl or acrylic emulsion',
    note: 'The most common wall we are asked about, and the answer nobody wants.',
    on: {
      limewash: { verdict: 'no', why: 'Lime will not bond to a plastic film, and even if it did the film underneath is the thing stopping the wall breathing.' },
      silicate: { verdict: 'no', why: 'Nothing to silicify with. It will peel.' },
      distemper: { verdict: 'no', why: 'Will not adhere.' },
      casein: { verdict: 'no', why: 'Will not adhere.' },
    },
  },
  {
    id: 'timber',
    name: 'Timber, bare',
    note: 'Joinery, boarding, shutters.',
    on: {
      limewash: { verdict: 'prep', why: 'Exterior boarding only, on sawn timber, and it will need doing again in five years. That is normal and it is how it was always done.' },
      silicate: { verdict: 'no', why: 'Mineral binder. Timber is not mineral.' },
      distemper: { verdict: 'no', why: 'Will not hold.' },
      casein: { verdict: 'yes', why: 'Good on interior joinery, and the only one of the four we would specify for it.' },
    },
  },
];
