/**
 * The network model for Attercliffe 33/11kV primary substation.
 *
 * FICTIONAL substation. The topology, the plant designations and the switching practice are
 * conventional for a UK distribution primary, because a model that was not would make every
 * page built on it read as decoration.
 *
 * This is a real graph, not a picture. Plant items are edges with a state; nodes are
 * electrical points. Which parts of the network are live at any moment is *computed* from it
 * by `src/lib/energise.ts` rather than drawn by hand for each step — and that matters more
 * than it sounds. The refusal this product exists to make is a back-energisation through a
 * transformer, and a transformer is only a back-energisation path if the model treats it as
 * one. Hand-drawing the step states would have let the site claim a danger the drawing did
 * not actually contain.
 *
 * Geometry is authored, not generated. A single-line diagram is a designed drawing with
 * conventions about where things sit; an auto-layout produces a graph, which is a different
 * and worse artefact.
 */

export type PlantKind =
  | 'breaker'      // circuit breaker — makes and breaks load and fault current
  | 'disconnector' // off-load isolator; establishes a point of isolation
  | 'earth'        // earth switch or applied portable earth
  | 'transformer'  // conducts in BOTH directions, which is the whole point
  | 'busbar'
  | 'cable'
  | 'feeder';      // outgoing 11kV circuit to customers

export interface Plant {
  id: string;
  label: string;
  kind: PlantKind;
  /** Electrical points this item sits between. An earth device's second node is always `EARTH`. */
  from: string;
  to: string;
  /** Closed at the start of the job — the normal running arrangement. */
  normallyClosed: boolean;
  voltage: 33 | 11;
  /** Where the symbol is drawn, in the schematic's own coordinate space. */
  x: number;
  y: number;
  /** Customers fed by this feeder, where it is one. */
  customers?: number;
  rating?: string;
  note?: string;
}

export interface NodePoint {
  id: string;
  x: number;
  y: number;
  label?: string;
  /** Busbars are drawn as a run, not a point. */
  runTo?: number;
  voltage?: 33 | 11;
}

/**
 * The 33kV supply. Two incomers from Carbrook grid supply point, both closed.
 *
 * Treated as always energised: what happens upstream of the grid supply point is not this
 * substation's model, and pretending otherwise would invite a schedule that switches
 * something Interlock has no business modelling.
 */
export const SOURCES = ['GRID-A', 'GRID-B'] as const;

export const NODES: NodePoint[] = [
  { id: 'GRID-A', x: 120, y: 40, label: 'Carbrook GSP · circuit 1', voltage: 33 },
  { id: 'GRID-B', x: 560, y: 40, label: 'Carbrook GSP · circuit 2', voltage: 33 },
  { id: 'BB33', x: 120, y: 120, runTo: 560, label: '33kV busbar', voltage: 33 },

  // T1 bay, left.
  { id: 'T1-33-A', x: 200, y: 120 },
  { id: 'T1-33-B', x: 200, y: 186 },
  { id: 'T1-HV', x: 200, y: 240 },
  { id: 'T1-LV', x: 200, y: 320 },
  { id: 'T1-11', x: 200, y: 380 },

  // T2 bay, right. The bay the job is on.
  { id: 'T2-33-A', x: 480, y: 120 },
  { id: 'T2-33-B', x: 480, y: 186 },
  { id: 'T2-HV', x: 480, y: 240 },
  { id: 'T2-LV', x: 480, y: 320 },
  { id: 'T2-11', x: 480, y: 380 },

  // 11kV switchboard, split into two sections with a bus section between them.
  { id: 'BB11-1', x: 90, y: 430, runTo: 300, label: '11kV section 1', voltage: 11 },
  { id: 'BB11-2', x: 380, y: 430, runTo: 590, label: '11kV section 2', voltage: 11 },

  { id: 'EARTH', x: 0, y: 0, label: 'earth' },
];

/**
 * Plant, in the order a drawing would list it.
 *
 * `normallyClosed` describes the network as found: both transformers in service, each feeding
 * its own 11kV section, the bus section open. That is the standard split running arrangement,
 * and it is the reason the job needs a load transfer before anything can be isolated.
 */
export const PLANT: Plant[] = [
  { id: 'INC-1', label: 'INC-1', kind: 'breaker', from: 'GRID-A', to: 'BB33', normallyClosed: true, voltage: 33, x: 120, y: 80, rating: '33kV 1250A' },
  { id: 'INC-2', label: 'INC-2', kind: 'breaker', from: 'GRID-B', to: 'BB33', normallyClosed: true, voltage: 33, x: 560, y: 80, rating: '33kV 1250A' },

  { id: 'T1-33-DS', label: 'T1-33-DS', kind: 'disconnector', from: 'BB33', to: 'T1-33-B', normallyClosed: true, voltage: 33, x: 200, y: 153 },
  { id: 'T1-33-CB', label: 'T1-33-CB', kind: 'breaker', from: 'T1-33-B', to: 'T1-HV', normallyClosed: true, voltage: 33, x: 200, y: 213, rating: '33kV 630A' },
  { id: 'T1', label: 'T1', kind: 'transformer', from: 'T1-HV', to: 'T1-LV', normallyClosed: true, voltage: 33, x: 200, y: 280, rating: '12/24 MVA ONAN/ONAF', note: '33/11kV, Dyn11' },
  { id: 'T1-11-CB', label: 'T1-11-CB', kind: 'breaker', from: 'T1-LV', to: 'BB11-1', normallyClosed: true, voltage: 11, x: 200, y: 400, rating: '11kV 1250A' },

  { id: 'T2-33-DS', label: 'T2-33-DS', kind: 'disconnector', from: 'BB33', to: 'T2-33-B', normallyClosed: true, voltage: 33, x: 480, y: 153, note: 'off-load isolator — establishes a visible isolating gap' },
  { id: 'T2-33-CB', label: 'T2-33-CB', kind: 'breaker', from: 'T2-33-B', to: 'T2-HV', normallyClosed: true, voltage: 33, x: 480, y: 213, rating: '33kV 630A' },
  { id: 'T2-33-ES', label: 'T2-33-ES', kind: 'earth', from: 'T2-HV', to: 'EARTH', normallyClosed: false, voltage: 33, x: 545, y: 240, note: 'transformer-side earth switch' },
  { id: 'T2', label: 'T2', kind: 'transformer', from: 'T2-HV', to: 'T2-LV', normallyClosed: true, voltage: 33, x: 480, y: 280, rating: '12/24 MVA ONAN/ONAF', note: '33/11kV, Dyn11 — the plant under repair' },
  { id: 'T2-11-ET', label: 'T2-11-ET', kind: 'earth', from: 'T2-LV', to: 'EARTH', normallyClosed: false, voltage: 11, x: 545, y: 335, note: 'portable earth, 11kV cable box' },
  { id: 'T2-11-CB', label: 'T2-11-CB', kind: 'breaker', from: 'T2-LV', to: 'BB11-2', normallyClosed: true, voltage: 11, x: 480, y: 400, rating: '11kV 1250A', note: 'withdrawable — racked out to an isolated position' },

  { id: 'BS-11', label: 'BS-11', kind: 'breaker', from: 'BB11-1', to: 'BB11-2', normallyClosed: false, voltage: 11, x: 340, y: 430, rating: '11kV 1250A', note: 'bus section — normally open' },

  { id: 'F1', label: 'F1 Darnall', kind: 'feeder', from: 'BB11-1', to: 'F1-OUT', normallyClosed: true, voltage: 11, x: 110, y: 470, customers: 1120 },
  { id: 'F2', label: 'F2 Tinsley', kind: 'feeder', from: 'BB11-1', to: 'F2-OUT', normallyClosed: true, voltage: 11, x: 170, y: 470, customers: 1640 },
  { id: 'F3', label: 'F3 Wincobank', kind: 'feeder', from: 'BB11-1', to: 'F3-OUT', normallyClosed: true, voltage: 11, x: 230, y: 470, customers: 990 },
  { id: 'F4', label: 'F4 Meadowhall', kind: 'feeder', from: 'BB11-1', to: 'F4-OUT', normallyClosed: true, voltage: 11, x: 290, y: 470, customers: 1010, note: 'includes one HV-connected customer' },

  { id: 'F5', label: 'F5 Brightside', kind: 'feeder', from: 'BB11-2', to: 'F5-OUT', normallyClosed: true, voltage: 11, x: 400, y: 470, customers: 1310 },
  { id: 'F6', label: 'F6 Carbrook', kind: 'feeder', from: 'BB11-2', to: 'F6-OUT', normallyClosed: true, voltage: 11, x: 460, y: 470, customers: 880 },
  { id: 'F7', label: 'F7 Attercliffe', kind: 'feeder', from: 'BB11-2', to: 'F7-OUT', normallyClosed: true, voltage: 11, x: 520, y: 470, customers: 1240 },
  { id: 'F8', label: 'F8 Norfolk Bridge', kind: 'feeder', from: 'BB11-2', to: 'F8-OUT', normallyClosed: true, voltage: 11, x: 580, y: 470, customers: 750 },
];

export const SITE = {
  name: 'Attercliffe',
  designation: 'Attercliffe 33/11kV primary',
  operator: 'fictional distribution network operator',
  modelVersion: 'ATT-11 rev 7',
  modelDate: '2026-09-18',
  /** Recorded rather than assumed. A model that does not know what it is missing is worse than one that does. */
  unmodelled: [
    { plant: 'F4 Meadowhall — customer HV switchgear beyond the metering point', reason: 'customer-owned; no drawing supplied' },
  ],
  customersTotal: 8940,
  section1Customers: 4760,
  section2Customers: 4180,
} as const;

export const plantById = new Map(PLANT.map((item) => [item.id, item]));
export const nodeById = new Map(NODES.map((node) => [node.id, node]));
