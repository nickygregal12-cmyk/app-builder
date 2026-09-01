/**
 * The job, as written and as proved.
 *
 * One job, carried across the whole site: replacing the on-load tap changer on transformer T2
 * at Attercliffe. It is a good specimen because it is ordinary — this is a routine asset
 * replacement, not a dramatic one — and because doing it safely still requires a load
 * transfer, four points of isolation, two points of earthing and a permit. Ordinary work with
 * a fatal failure mode is exactly the shape of problem this product is for.
 *
 * Two sequences are held here, and the difference between them is the argument.
 *
 * `DRAFT` is what a competent Senior Authorised Person actually wrote. It is not a straw man
 * and it is not sloppy: the operations are right, the paperwork is right, and it reads
 * correctly line by line. It contains one error, of a class that has killed people, and the
 * error is invisible unless you hold the whole network in your head at step 7.
 *
 * `PROVED` is the sequence after the refusal was answered.
 */

export type Operation =
  | 'CHECK' | 'CLOSE' | 'OPEN' | 'RACK OUT' | 'RACK IN'
  | 'LOCK' | 'PROVE DEAD' | 'APPLY EARTH' | 'REMOVE EARTH'
  | 'ISSUE' | 'CANCEL' | 'REMOVE LOCK';

export interface Step {
  n: number;
  op: Operation;
  /** The plant item operated, where the step operates plant. Checks and paperwork have none. */
  plant?: string;
  detail: string;
  /** Who carries it out. Roles are real: only an authorised person may operate HV apparatus. */
  by: 'SAP' | 'Control Engineer' | 'AP';
  /** Minutes from the start of the sequence. Used for the exposure window, not decoration. */
  at: number;
  /** Set where this step establishes something the permit will name. */
  establishes?: 'point-of-isolation' | 'point-of-earthing' | 'permit';
  /** Set on the first step of each phase. A schedule is written and read in phases. */
  phase?: string;
}

/**
 * The as-written draft. Step 7 is the one that matters.
 *
 * The error is a single omission and it is entirely natural. The load is transferred by
 * closing the bus section, which puts both transformers in parallel across both sections —
 * and from there the writer isolates T2 the way you isolate anything fed from above: open its
 * breaker, open its disconnector, earth it. Every one of those operations is correct.
 *
 * What no step does is open T2 on the *eleven* kilovolt side. The transformer is still bolted
 * to a live Section 2 busbar through T2-11-CB, so it is energised from below at 11kV and
 * transformed back up to 33kV against the open disconnector. Step 7 then applies an earth
 * switch to it.
 */
export const DRAFT: Step[] = [
  { n: 1, phase: 'Checks before switching', op: 'CHECK', detail: 'T1 and T2 tap positions within one tap of each other before paralleling.', by: 'Control Engineer', at: 0 },
  { n: 2, op: 'CHECK', detail: 'T1 cyclic rating against forecast peak. 14.2 MVA forecast against 24 MVA ONAF.', by: 'Control Engineer', at: 5 },
  { n: 3, phase: 'Load transfer', op: 'CLOSE', plant: 'BS-11', detail: '11kV bus section. Sections 1 and 2 paralleled; load can now be carried by T1 alone.', by: 'SAP', at: 15 },
  { n: 4, phase: 'Isolation', op: 'OPEN', plant: 'T2-33-CB', detail: 'T2 33kV circuit breaker. Transformer de-energised from the 33kV side.', by: 'SAP', at: 25 },
  { n: 5, op: 'OPEN', plant: 'T2-33-DS', detail: 'T2 33kV disconnector. Point of isolation, 33kV.', by: 'SAP', at: 35, establishes: 'point-of-isolation' },
  { n: 6, phase: 'Prove dead and earth', op: 'PROVE DEAD', detail: '33kV transformer connections. Approved voltage indicator, proved before and after use.', by: 'SAP', at: 45 },
  { n: 7, op: 'APPLY EARTH', plant: 'T2-33-ES', detail: 'Transformer-side earth switch, 33kV. Point of earthing.', by: 'SAP', at: 55, establishes: 'point-of-earthing' },
  { n: 8, op: 'PROVE DEAD', detail: '11kV transformer cable at the cable box.', by: 'SAP', at: 65 },
  { n: 9, op: 'APPLY EARTH', plant: 'T2-11-ET', detail: 'Portable earth at the 11kV cable box. Point of earthing.', by: 'SAP', at: 75, establishes: 'point-of-earthing' },
  { n: 10, phase: 'Issue', op: 'ISSUE', detail: 'Permit to Work to the tap changer team.', by: 'SAP', at: 85, establishes: 'permit' },
];

/**
 * The sequence after the refusal.
 *
 * Two operations were inserted, not reordered: opening T2-11-CB was already there at step 4,
 * but nothing racked it out, and nothing proved the 11kV side dead before earthing it. The
 * draft's step 4 opened the breaker to transfer load, which is a different intention from
 * opening it to isolate — and the schedule never converted one into the other.
 */
export const PROVED: Step[] = [
  { n: 1, phase: 'Checks before switching', op: 'CHECK', detail: 'T1 and T2 tap positions within one tap of each other before paralleling.', by: 'Control Engineer', at: 0 },
  { n: 2, op: 'CHECK', detail: 'T1 cyclic rating against forecast peak. 14.2 MVA forecast against 24 MVA ONAF.', by: 'Control Engineer', at: 5 },
  { n: 3, phase: 'Load transfer', op: 'CLOSE', plant: 'BS-11', detail: '11kV bus section. Sections 1 and 2 now paralleled through both transformers.', by: 'SAP', at: 15 },
  { n: 4, op: 'OPEN', plant: 'T2-11-CB', detail: 'T2 11kV circuit breaker. Section 2 transfers to T1 through the bus section, without interruption.', by: 'SAP', at: 20 },
  { n: 5, phase: 'Isolation', op: 'RACK OUT', plant: 'T2-11-CB', detail: 'T2 11kV circuit breaker to the isolated position. Point of isolation, 11kV.', by: 'SAP', at: 25, establishes: 'point-of-isolation' },
  { n: 6, op: 'OPEN', plant: 'T2-33-CB', detail: 'T2 33kV circuit breaker. Transformer de-energised from the 33kV side.', by: 'SAP', at: 35 },
  { n: 7, op: 'OPEN', plant: 'T2-33-DS', detail: 'T2 33kV disconnector. Point of isolation, 33kV.', by: 'SAP', at: 45, establishes: 'point-of-isolation' },
  { n: 8, op: 'LOCK', detail: 'Safety locks and caution notices at T2-11-CB and T2-33-DS.', by: 'SAP', at: 55 },
  { n: 9, phase: 'Prove dead and earth', op: 'PROVE DEAD', detail: '33kV transformer connections. Approved voltage indicator, proved on a known source before and after use.', by: 'SAP', at: 65 },
  { n: 10, op: 'APPLY EARTH', plant: 'T2-33-ES', detail: 'Transformer-side earth switch, 33kV. Point of earthing.', by: 'SAP', at: 75, establishes: 'point-of-earthing' },
  { n: 11, op: 'PROVE DEAD', detail: '11kV transformer cable at the cable box. Approved voltage indicator, proved before and after use.', by: 'SAP', at: 85 },
  { n: 12, op: 'APPLY EARTH', plant: 'T2-11-ET', detail: 'Portable earth at the 11kV cable box. Point of earthing.', by: 'SAP', at: 95, establishes: 'point-of-earthing' },
  { n: 13, phase: 'Issue', op: 'ISSUE', detail: 'Permit to Work PTW-2026-0447 to the tap changer team. Work may begin.', by: 'SAP', at: 105, establishes: 'permit' },
];

/**
 * Restoration, generated from the forward sequence rather than typed again.
 *
 * The reverse of a proved sequence is provable; the reverse of a typed one is a second
 * document with its own errors, written at the end of a long day by somebody who wants to go
 * home. Two rules shape it: nothing is de-earthed until the permit is cancelled, and the
 * transformer is re-energised from the 33kV side on no load before it is paralleled.
 */
export const RESTORATION: Step[] = [
  { n: 1, phase: 'Hand back', op: 'CANCEL', detail: 'Permit to Work PTW-2026-0447 cancelled and returned by the work party.', by: 'SAP', at: 0 },
  { n: 2, phase: 'Remove earths', op: 'REMOVE EARTH', plant: 'T2-11-ET', detail: 'Portable earth removed from the 11kV cable box.', by: 'SAP', at: 10 },
  { n: 3, op: 'REMOVE EARTH', plant: 'T2-33-ES', detail: 'Transformer-side earth switch opened.', by: 'SAP', at: 20 },
  { n: 4, op: 'REMOVE LOCK', detail: 'Safety locks and caution notices removed.', by: 'SAP', at: 30 },
  { n: 5, phase: 'Re-energise', op: 'CLOSE', plant: 'T2-33-DS', detail: 'T2 33kV disconnector closed, off load.', by: 'SAP', at: 40 },
  { n: 6, op: 'CLOSE', plant: 'T2-33-CB', detail: 'T2 33kV circuit breaker. Transformer energised from the 33kV side, on no load.', by: 'SAP', at: 50 },
  { n: 7, op: 'CHECK', detail: 'T2 tap position matches T1 before paralleling.', by: 'Control Engineer', at: 60 },
  { n: 8, phase: 'Return to service', op: 'RACK IN', plant: 'T2-11-CB', detail: 'T2 11kV circuit breaker to the service position.', by: 'SAP', at: 70 },
  { n: 9, op: 'CLOSE', plant: 'T2-11-CB', detail: 'T2 11kV circuit breaker. Both transformers in parallel.', by: 'SAP', at: 80 },
  { n: 10, op: 'OPEN', plant: 'BS-11', detail: '11kV bus section opened. Normal split running arrangement restored.', by: 'SAP', at: 85 },
];

export const JOB = {
  reference: 'ATT-2026-0447',
  title: 'T2 on-load tap changer replacement',
  site: 'Attercliffe 33/11kV primary',
  requestedBy: 'Asset replacement programme',
  window: 'Tuesday 14 October 2026, 08:00–16:00',
  modelVersion: 'ATT-11 rev 7',
  writtenBy: 'D. Haigh, SAP',
  provedAt: '2026-09-26 14:22',
  permit: 'PTW-2026-0447',
} as const;

/**
 * What the permit will name once the sequence is proved.
 *
 * Read from the steps rather than typed: a permit that lists points of isolation the schedule
 * did not actually establish is the second-most-dangerous document in this process, and it is
 * produced by copying last month's.
 */
export function permitPoints(steps: Step[]) {
  return {
    isolation: steps.filter((s) => s.establishes === 'point-of-isolation'),
    earthing: steps.filter((s) => s.establishes === 'point-of-earthing'),
    issuedAt: steps.find((s) => s.establishes === 'permit') ?? null,
  };
}
