/**
 * What is live, what is dead, what is earthed — computed, at every step.
 *
 * This is the whole product in about eighty lines, and it is deliberately not more than that.
 * Interlock's claim is not that it simulates a power system; load flow, protection grading and
 * fault levels are other people's tools. Its claim is narrower and sharper: given a network
 * and an ordered list of operations, it can say at every step which points are connected to a
 * source, and therefore whether the next operation is safe to perform.
 *
 * Two things in here do the work the site is built on.
 *
 * **A transformer conducts both ways.** It is an ordinary edge, closed unless somebody
 * isolates both sides. That single line is why the back-energisation refusal exists: open the
 * 33kV breaker and the transformer is still tied to a live 11kV busbar through its own
 * breaker, and a solver that treated a transformer as a one-way component would cheerfully
 * report the winding dead. The most dangerous error in HV switching is only visible in a model
 * that admits this.
 *
 * **Earthing is checked against the computed set, not asserted.** A step that closes an earth
 * device onto a node reachable from a source is a fault, and it is found by looking rather
 * than by remembering to write it down. Every refusal the site shows is produced this way.
 */

import { PLANT, SOURCES, plantById, SITE } from '../data/network';

export type PlantState = Record<string, boolean>;

export interface NetworkState {
  /** Points connected to a 33kV source through closed plant. */
  energised: Set<string>;
  /** Points connected to earth through a closed earth device. */
  earthed: Set<string>;
  /** Feeders whose busbar is not energised, and the customers on them. */
  off: { id: string; label: string; customers: number }[];
  customersOff: number;
  /** An earth closed onto a live point. There is no safe version of this. */
  earthOnLive: { plant: string; node: string }[];
  closed: PlantState;
}

/** The network as found: normal running arrangement. */
export function initialState(): PlantState {
  return Object.fromEntries(PLANT.map((item) => [item.id, item.normallyClosed]));
}

/**
 * Reachability from the sources, through closed plant only.
 *
 * Earth devices are excluded from the traversal: an earth is a connection to earth, not a
 * path between two parts of the network, and letting current "flow through" one would make
 * every earthed point read as energised the moment any other earth was applied.
 */
export function solve(closed: PlantState): NetworkState {
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a)!.push(b);
  };
  for (const item of PLANT) {
    if (!closed[item.id]) continue;
    if (item.kind === 'earth') continue;
    link(item.from, item.to);
    link(item.to, item.from);
  }

  const energised = new Set<string>();
  const queue: string[] = [...SOURCES];
  for (const source of SOURCES) energised.add(source);
  while (queue.length) {
    const node = queue.shift()!;
    for (const next of adjacency.get(node) ?? []) {
      if (energised.has(next)) continue;
      energised.add(next);
      queue.push(next);
    }
  }

  const earthed = new Set<string>();
  const earthOnLive: { plant: string; node: string }[] = [];
  for (const item of PLANT) {
    if (item.kind !== 'earth' || !closed[item.id]) continue;
    earthed.add(item.from);
    // The check the product is named after. Closing an earth onto a point that is still
    // reachable from a source is a phase-to-earth fault made deliberately, by hand, by
    // somebody standing next to it.
    if (energised.has(item.from)) earthOnLive.push({ plant: item.id, node: item.from });
  }

  const off = PLANT
    .filter((item) => item.kind === 'feeder' && closed[item.id] && !energised.has(item.from))
    .map((item) => ({ id: item.id, label: item.label, customers: item.customers ?? 0 }));

  return {
    energised,
    earthed,
    off,
    customersOff: off.reduce((total, feeder) => total + feeder.customers, 0),
    earthOnLive,
    closed,
  };
}

/**
 * Customers at risk: off after one further failure, and not restorable by switching.
 *
 * The naive version of this number — customers off after the worst single contingency — is
 * the wrong number, and getting it wrong is instructive. Under normal split running, losing
 * T1 does drop 4,760 customers; but the bus section is sitting there open for exactly that
 * reason, and closing it picks them up off T2 in the time it takes to send somebody. Counting
 * them as at risk would report a substation in its designed, healthy state as carrying four
 * thousand customers of exposure, every day, forever.
 *
 * What actually changes during this job is not how much is lost but whether anything can be
 * done about it. With T2 isolated the bus section is already closed and there is no second
 * transformer to pick the load up from: the same failure is now unrecoverable until the job
 * is abandoned and T2 restored. So the measure is customers still off *after* the best
 * restoration switching available at that moment.
 *
 * It reads 0 in normal running, 8,940 through the window, and 0 again on restoration — which
 * is the shape of the risk the outage actually creates, and the number a planner books
 * against.
 */
export function contingencyExposure(closed: PlantState): number {
  const transformers = PLANT.filter((item) => item.kind === 'transformer' && closed[item.id]);
  // What a control engineer could reach for after the failure: any bus section not already
  // closed. Real restoration has more options than this; a prototype that claimed to model
  // all of them would be claiming to be a network management system.
  const restorationSwitches = PLANT.filter((item) => item.id.startsWith('BS-') && !closed[item.id]);
  const alreadyOff = solve(closed).customersOff;

  let worst = 0;
  for (const item of transformers) {
    const failed = { ...closed, [item.id]: false };
    let best = solve(failed).customersOff;
    for (const relief of restorationSwitches) {
      best = Math.min(best, solve({ ...failed, [relief.id]: true }).customersOff);
    }
    worst = Math.max(worst, best);
  }
  // Customers already interrupted cannot be interrupted again by the contingency.
  return Math.max(0, worst - alreadyOff);
}

export const totalCustomers = SITE.customersTotal;
export { plantById };
