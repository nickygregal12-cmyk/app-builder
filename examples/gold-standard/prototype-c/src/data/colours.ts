/**
 * Thirty-six colours, six pigment families.
 *
 * The palette is the argument. There are no bright greens here, no clean violets and no
 * magentas, and that is not a taste decision — it is what survives in a binder with a pH
 * around 12. Lime destroys most organic pigments and a good many synthetic ones; what is left
 * is earths, calcined earths, a handful of mineral oxides and two blues that cost what they
 * cost. A customer who scrolls the full range and notices the gap where the bright colours
 * would be has understood the product without reading a word about authenticity.
 *
 * `lrv` is not stored. It is computed from the colour by `src/lib/light.ts`, because it is
 * relative luminance and typing thirty-six of them by hand produces thirty-six numbers that
 * flatter whatever they sit beside.
 */

export interface PigmentFamily {
  id: string;
  name: string;
  /** What the pigment actually is, and where it comes from. */
  source: string;
  /** Why it survives lime, in one sentence. */
  fastness: string;
}

export const FAMILIES: PigmentFamily[] = [
  {
    id: 'lime',
    name: 'Chalk and lime whites',
    source: 'Calcium carbonate and calcium hydroxide, burnt and slaked from chalk dug four miles from the mill.',
    fastness: 'The binder and the pigment are the same material, which is why a limewash white cannot fail on lime.',
  },
  {
    id: 'ochre',
    name: 'Yellow ochres',
    source: 'Natural hydrated iron oxide (PY43), washed and levigated. French and Italian beds, and one English.',
    fastness: 'Iron oxides are already fully oxidised, so an alkaline binder has nothing left to do to them.',
  },
  {
    id: 'red',
    name: 'Red earths',
    source: 'Natural and calcined iron oxide (PR102, PBr7). Burning a yellow ochre drives off water and turns it red.',
    fastness: 'As stable as the yellows, and the calcined ones are the oldest pigments in continuous use anywhere.',
  },
  {
    id: 'umber',
    name: 'Umbers and browns',
    source: 'Iron oxide with manganese dioxide (PBr7). Raw from the ground; burnt in the mill kiln.',
    fastness: 'The manganese darkens the earth without introducing anything the lime can attack.',
  },
  {
    id: 'green',
    name: 'Green earths',
    source: 'Terre verte (PG23), a natural celadonite, and chromium oxide green (PG17) where more strength is wanted.',
    fastness: 'The only two greens that hold in lime. Every brighter green on the market is organic and will go.',
  },
  {
    id: 'blue',
    name: 'Blues, greys and blacks',
    source: 'Ultramarine (PB29), bone black (PBk9) and lamp black (PBk7), with iron oxide to grey them.',
    fastness: 'Ultramarine is alkali-stable and acid-sensitive, which is the opposite of most pigments and the reason it survives here.',
  },
];

export type FinishId = 'limewash' | 'silicate' | 'distemper' | 'casein';

export interface Colour {
  slug: string;
  name: string;
  code: string;
  hex: string;
  family: string;
  /** The specific pigment, named. */
  pigment: string;
  /** One sentence a decorator would actually find useful. */
  note: string;
  /** Which of the four paints it is made in. Not every colour holds in every binder. */
  finishes: FinishId[];
  /** Where it is not available, and why. Stated rather than omitted. */
  limit?: string;
}

export const COLOURS: Colour[] = [
  // --- chalk and lime whites -------------------------------------------------
  { slug: 'mill-white', name: 'Mill White', code: '01', hex: '#f2efe6', family: 'lime', pigment: 'Slaked lime, no added pigment', note: 'The binder on its own. Moves more than any other colour here because there is nothing in it to hold a hue steady.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'chalk', name: 'Chalk', code: '02', hex: '#ede8da', family: 'lime', pigment: 'Lime with a trace of ochre', note: 'A white with the blue taken out. Reads as white in a south room and as cream in a north one.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'ropewalk', name: 'Ropewalk', code: '03', hex: '#e6dfcd', family: 'lime', pigment: 'Lime with yellow ochre', note: 'The colour of new hemp. Our most ordered white, and the one people mean when they say they want a warm white.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'bone', name: 'Bone', code: '04', hex: '#e3dbc7', family: 'lime', pigment: 'Lime, yellow ochre, a trace of bone black', note: 'Slightly grey under the warmth. Holds its shape under a lamp better than Ropewalk does.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'tallow', name: 'Tallow', code: '05', hex: '#ded2b8', family: 'lime', pigment: 'Lime with raw ochre', note: 'On the edge of being a colour rather than a white. Very good on a ceiling in a room with dark beams.', finishes: ['limewash', 'distemper', 'casein'], limit: 'Not made in silicate: the ochre load is too high for the binder at this strength.' },

  // --- yellow ochres ---------------------------------------------------------
  { slug: 'straw', name: 'Straw', code: '11', hex: '#d8c89b', family: 'ochre', pigment: 'Yellow ochre PY43, French', note: 'The palest ochre that still reads as a colour. Goes distinctly green in north light.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'gold-ochre', name: 'Gold Ochre', code: '12', hex: '#c9ae72', family: 'ochre', pigment: 'Yellow ochre PY43, Italian', note: 'Warmer and redder than the French bed. The difference between the two is visible on a wall and not on a card.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'nadder', name: 'Nadder', code: '13', hex: '#be9f5e', family: 'ochre', pigment: 'Yellow ochre PY43, English', note: 'Dug eleven miles from the mill, which is the only reason it is in the range. Greener than either import.', finishes: ['limewash', 'distemper', 'casein'], limit: 'Not made in silicate: the English ochre carries clay that clouds the binder.' },
  { slug: 'stubble', name: 'Stubble', code: '14', hex: '#ac8c4e', family: 'ochre', pigment: 'Yellow ochre PY43 with raw umber', note: 'An ochre with the brightness knocked off it. Reliable in a room that gets sun for part of the day.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'raw-ochre', name: 'Raw Ochre', code: '15', hex: '#9c7b3e', family: 'ochre', pigment: 'Yellow ochre PY43, unwashed', note: 'The pigment as it comes out of the ground, screened but not levigated. Slightly gritty in limewash, deliberately.', finishes: ['limewash', 'casein'], limit: 'Interior only, and not in distemper — the unwashed pigment will not stay in suspension.' },
  { slug: 'kiln', name: 'Kiln', code: '16', hex: '#8a6a33', family: 'ochre', pigment: 'Yellow ochre PY43, lightly calcined', note: 'Ochre taken part of the way to red in the kiln. Stopped early, so it holds olive rather than orange.', finishes: ['limewash', 'silicate', 'casein'] },

  // --- red earths ------------------------------------------------------------
  { slug: 'blush-earth', name: 'Blush Earth', code: '21', hex: '#d6b3a2', family: 'red', pigment: 'Red ochre PR102 in lime', note: 'A pink with no blue in it at all, which is why it does not go sickly under a lamp.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'sienna-wash', name: 'Sienna Wash', code: '22', hex: '#c1907a', family: 'red', pigment: 'Burnt sienna PBr7', note: 'Thin enough to see the wall through it in limewash, which is the point of a wash.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'venetian', name: 'Venetian', code: '23', hex: '#a96a55', family: 'red', pigment: 'Venetian red PR101, synthetic iron oxide', note: 'The colour of a great many farm buildings, for the good reason that it was the cheapest fast pigment for two centuries.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'red-ochre', name: 'Red Ochre', code: '24', hex: '#96543f', family: 'red', pigment: 'Natural red ochre PR102', note: 'Duller and browner than the synthetic. Better on stone; the synthetic is better on render.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'oxblood', name: 'Oxblood', code: '25', hex: '#7c4132', family: 'red', pigment: 'Red ochre PR102 with burnt umber', note: 'Very dark on a wall and much lighter in the tin, which catches people out.', finishes: ['limewash', 'silicate', 'casein'], limit: 'Not made in distemper: at this pigment load the surface will mark.' },
  { slug: 'marlpit-red', name: 'Marlpit Red', code: '26', hex: '#683429', family: 'red', pigment: 'Calcined red ochre with lamp black', note: 'Our own burn. Named because the first batch was mixed to match a marlpit face after rain.', finishes: ['limewash', 'silicate'], limit: 'Exterior and unheated interiors only. It will not hold its depth in a warm dry room.' },

  // --- umbers and browns -----------------------------------------------------
  { slug: 'flax', name: 'Flax', code: '31', hex: '#c8bba4', family: 'umber', pigment: 'Raw umber PBr7 in lime', note: 'A grey-brown that behaves like a neutral. The safest colour in the range for a room you cannot predict.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'dust', name: 'Dust', code: '32', hex: '#b3a48c', family: 'umber', pigment: 'Raw umber PBr7', note: 'Warmer than Flax by a small amount that becomes obvious once both are on a wall.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'raw-umber', name: 'Raw Umber', code: '33', hex: '#8e7c63', family: 'umber', pigment: 'Raw umber PBr7, Cyprus', note: 'The pigment straight. Manganese gives it the greenish cast that separates an umber from an ochre.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'peat', name: 'Peat', code: '34', hex: '#6f5f49', family: 'umber', pigment: 'Raw umber PBr7 with lamp black', note: 'Dark enough to swallow a north-facing room. Sample it in the room, not the hall.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'burnt-umber', name: 'Burnt Umber', code: '35', hex: '#59493a', family: 'umber', pigment: 'Burnt umber PBr7', note: 'Redder than the raw, because burning drives the water off the iron. Good on joinery in casein.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'soot-brown', name: 'Soot Brown', code: '36', hex: '#43372c', family: 'umber', pigment: 'Burnt umber with bone black', note: 'Nearly black in poor light and clearly brown in good. One of two colours here that need a south wall to be worth it.', finishes: ['limewash', 'silicate'], limit: 'Not made in distemper or casein: the load marks too easily indoors.' },

  // --- green earths ----------------------------------------------------------
  { slug: 'verdigris-pale', name: 'Verdigris Pale', code: '41', hex: '#c4c9b4', family: 'green', pigment: 'Terre verte PG23 in lime', note: 'Barely green. Reads as a cool white until it is next to an actual white, and then it does not.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'terre-verte', name: 'Terre Verte', code: '42', hex: '#a6ae95', family: 'green', pigment: 'Terre verte PG23, Veronese', note: 'The natural green earth, which is weak and grey and has been used for underpainting flesh since the fourteenth century.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'sage-earth', name: 'Sage Earth', code: '43', hex: '#8b9679', family: 'green', pigment: 'Terre verte with yellow ochre', note: 'Warmed with ochre so it does not go blue in north light, which terre verte will do on its own.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'olive-earth', name: 'Olive Earth', code: '44', hex: '#6f7a5c', family: 'green', pigment: 'Chromium oxide PG17 with raw umber', note: 'Chrome oxide is the only strong green that holds in lime, and it is opaque, so it covers in fewer coats than anything else here.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'bottle-earth', name: 'Bottle Earth', code: '45', hex: '#4f5a42', family: 'green', pigment: 'Chromium oxide PG17', note: 'Dark, flat and slightly dusty. Traditional on external joinery and shutters.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'deep-green-earth', name: 'Deep Green Earth', code: '46', hex: '#3a4331', family: 'green', pigment: 'Chromium oxide PG17 with lamp black', note: 'Almost black at dusk. Very good in a room that is only used after dark, and wrong in almost every other one.', finishes: ['limewash', 'silicate'], limit: 'Not made in distemper or casein.' },

  // --- blues, greys and blacks ----------------------------------------------
  { slug: 'smoke', name: 'Smoke', code: '51', hex: '#c3c4c2', family: 'blue', pigment: 'Bone black PBk9 in lime', note: 'A true neutral grey, which is harder to make in lime than any colour in the range.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'ash', name: 'Ash', code: '52', hex: '#a8aaa9', family: 'blue', pigment: 'Bone black PBk9', note: 'Mid grey with a trace of green from the bone. Sits well against oak.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'slate', name: 'Slate', code: '53', hex: '#85898b', family: 'blue', pigment: 'Bone black with a trace of ultramarine', note: 'The blue is there to stop the grey going brown under a lamp. Two grams in a twenty-litre batch.', finishes: ['limewash', 'silicate', 'distemper', 'casein'] },
  { slug: 'lead', name: 'Lead', code: '54', hex: '#676c70', family: 'blue', pigment: 'Bone black, ultramarine, raw umber', note: 'Named for the colour of lead, not its composition. There is no lead in any product we make.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'blue-ash', name: 'Blue Ash', code: '55', hex: '#5a6670', family: 'blue', pigment: 'Ultramarine PB29 with bone black', note: 'The only colour here that anyone would call blue. It is still mostly grey.', finishes: ['limewash', 'silicate', 'casein'] },
  { slug: 'ultramarine-deep', name: 'Ultramarine Deep', code: '56', hex: '#3e4a5c', family: 'blue', pigment: 'Ultramarine PB29', note: 'The most expensive colour in the range by some distance, and the reason there is only one of it.', finishes: ['limewash', 'casein'], limit: 'Not made in silicate: ultramarine is acid-sensitive and the silicate cure is too aggressive.' },
  { slug: 'lamp-black', name: 'Lamp Black', code: '57', hex: '#2b2c2a', family: 'blue', pigment: 'Lamp black PBk7', note: 'Carbon. In limewash it never reaches true black and settles at a very dark warm grey, which is what you want.', finishes: ['limewash', 'silicate', 'casein'] },
];

export const colourBySlug = new Map(COLOURS.map((colour) => [colour.slug, colour]));
export const familyById = new Map(FAMILIES.map((family) => [family.id, family]));
export const coloursIn = (familyId: string) => COLOURS.filter((colour) => colour.family === familyId);
