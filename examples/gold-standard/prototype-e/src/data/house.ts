/**
 * The house and the island, as facts.
 *
 * Written flat and unadorned on purpose. Everything in this file would be true of a fairly
 * ordinary house if it were on the mainland, and that is the point BUSINESS.txt makes: the house
 * is not the product. So it is described the way a surveyor would describe it, and the writing
 * is spent on the crossing instead.
 *
 * The one place a letting site normally reaches for adjectives — the rooms — is where this one
 * gives measurements, orientation and what the room is actually like when the road is shut.
 */

export interface Room {
  name: string;
  floor: 'Ground' | 'First' | 'Second' | 'Outside';
  size: string;
  faces: string;
  note: string;
}

export const ROOMS: Room[] = [
  {
    name: 'Kitchen and long table',
    floor: 'Ground',
    size: '7.4 × 4.1 m',
    faces: 'South-west, to the causeway',
    note: 'The room everybody ends up in, because it is the only one with a view of the road and people check the road. Table seats twelve. A range that takes an hour to come up to heat and stays hot all evening.',
  },
  {
    name: 'Sitting room',
    floor: 'Ground',
    size: '5.8 × 4.6 m',
    faces: 'North-east, to the open sea',
    note: 'Stove, two sofas, a bad piano nobody has tuned since 2019. No television. There is a shelf of the sort of paperbacks people leave behind, which is a better library than anything chosen would be.',
  },
  {
    name: 'Boot room and store',
    floor: 'Ground',
    size: '4.0 × 2.4 m',
    faces: 'Inward',
    note: 'Where the week\'s provisioning is stacked on the Friday. A chest freezer, a drying rail over the pipes, and enough space for nine sets of wet outdoor clothes, which is the actual design requirement.',
  },
  {
    name: 'The long room',
    floor: 'First',
    size: '9.2 × 3.6 m',
    faces: 'South-west and north-east, both',
    note: 'Runs the depth of the house with windows at each end, so it is the only room you can watch the tide from on both sides. Two desks. This is the room people who come here to work take.',
  },
  {
    name: 'Bedroom 1',
    floor: 'First',
    size: '4.6 × 4.2 m — king',
    faces: 'North-east',
    note: 'En suite, with a bath. Sea on three sides of the window and no light from anywhere at night.',
  },
  {
    name: 'Bedroom 2',
    floor: 'First',
    size: '4.4 × 3.8 m — king',
    faces: 'South-west',
    note: 'Looks down the causeway. Sleepers who wake early see the road come out of the water.',
  },
  {
    name: 'Bedroom 3',
    floor: 'First',
    size: '4.1 × 3.4 m — twin',
    faces: 'South',
    note: 'Shares the first-floor bathroom with bedroom 4.',
  },
  {
    name: 'Bedroom 4',
    floor: 'Second',
    size: '5.0 × 3.9 m — double, plus a single',
    faces: 'North-east, dormer',
    note: 'Under the roof. Warmest room in the house and the loudest in a north-easterly.',
  },
  {
    name: 'Bedroom 5',
    floor: 'Second',
    size: '3.6 × 3.2 m — twin',
    faces: 'West, dormer',
    note: 'Low doorway. Adults over about six foot have reported hitting it more than once.',
  },
  {
    name: 'The yard',
    floor: 'Outside',
    size: 'Walled, roughly 18 × 14 m',
    faces: 'Sheltered from the north-east',
    note: 'The only outdoor space on the island where you can sit down in a wind, which for most of the year is the only outdoor space that matters. Line, table, a lean-to with dry logs.',
  },
];

export interface Feature {
  name: string;
  walk: string;
  note: string;
  photo?: string;
}

export const ISLAND: Feature[] = [
  {
    name: 'The causeway and the refuge box',
    walk: '0 min — it is how you got here',
    photo: 'causeway',
    note: 'A mile of single-track road on a rubble bank, with passing places and one timber refuge box on stilts at the low point. The box is not decoration and is not maintained by us; it is there because people misjudge the tide, and it has a ladder because by the time you need it the road is already gone.',
  },
  {
    name: 'St Cuthman\'s, the roofless chapel',
    walk: '12 min from the house',
    photo: 'chapel',
    note: 'Twelfth-century nave, no roof since about 1740, five graves and a fragment of a cross-shaft. It is not a ruin anybody visits — there is no interpretation board and no path, and in April it is full of nesting fulmars that will be extremely clear about your presence.',
  },
  {
    name: 'The lime kilns',
    walk: '20 min, north shore',
    photo: 'kiln',
    note: 'Three draw kilns built into the bank in 1847, worked for thirty years, abandoned when the limestone ran thin. Limestone was quarried behind them, burnt here, and taken off by boat — which is the only industry this island ever had and the reason there is a house on it at all.',
  },
  {
    name: 'The north ledges',
    walk: '25 min',
    photo: 'shore',
    note: 'Flat weathered ledges running out under the sea on the exposed side. Grey seals haul out here from October. The ledges are slick and there is no way back up in two places at high water, so they are walked at the start of a shut period and not the end of one.',
  },
  {
    name: 'The freshwater pool',
    walk: '8 min',
    note: 'A spring-fed pool behind the dunes, and the reason the island was habitable. It still supplies the house through a filter that the estate changes between lets.',
  },
];

/** The plain facts a booking enquiry asks for, kept in one place so no page invents them. */
export const FACTS = {
  sleeps: 9,
  bedrooms: 5,
  bathrooms: 3,
  hectares: 60,
  causewayMiles: 1,
  nearestTown: 'Bamburgh, 14 miles by road from Cobb\'s Point',
  arriveFrom: 'Cobb\'s Point, where the estate keeps a standing yard for cars that miss a window',
  power: 'Mains, brought over on the causeway bank. It fails perhaps twice a season; there is a generator and the house knows how to run on it.',
  water: 'The island spring, filtered. Drinkable.',
  signal: 'One network, and only on the south and west of the island. None at the north ledges or in the chapel field.',
  internet: 'Fixed wireless to the mainland mast. Adequate for work; it drops in heavy rain from the north-east.',
  dogs: 'Two, by arrangement. Not between April and July, because of the fulmars and the eider.',
  changeover: 'Friday to Friday',
} as const;
