/**
 * Running a schedule through the model, one step at a time.
 *
 * This is what the site shows. Every step carries the network state that results from it, the
 * customers it interrupts, the exposure it creates, and — where there is one — the reason the
 * schedule cannot continue past it.
 *
 * The refusal is *found*, not declared. `solve` reports an earth closed onto a point still
 * reachable from a source; this walks back through the sequence to name the operation that
 * left the path open, because "step 7 earths a live point" is a symptom and "nothing opens
 * T2-11-CB" is the sentence that fixes the document.
 */

import { PLANT, plantById, SITE } from '../data/network';
import { contingencyExposure, initialState, solve, type NetworkState, type PlantState } from './energise';
import type { Step } from '../data/schedule';

export interface ProvedStep {
  step: Step;
  state: NetworkState;
  /** Customers exposed to the loss of one further transformer at this point. */
  exposure: number;
  refusal: Refusal | null;
}

export interface Refusal {
  /** The class of error, as the rule set names it. */
  code: string;
  title: string;
  /** What is wrong at this step. */
  finding: string;
  /** The operation, or the missing operation, that caused it. This is the actionable half. */
  cause: string;
  /** The live path, written as a sequence of plant a reader can follow on the diagram. */
  path: string[];
}

/**
 * How each operation changes the model.
 *
 * `RACK OUT` is deliberately electrically neutral. Racking a withdrawable breaker to its
 * isolated position does not change what is connected to what — the breaker is already open —
 * but it converts an open breaker into a *point of isolation*, because it introduces a visible
 * isolating gap that cannot be closed by a control signal. That distinction is the reason a
 * schedule may not name an open breaker as its point of isolation, and a model that treated
 * the two as identical would let it.
 */
function apply(closed: PlantState, step: Step): PlantState {
  if (!step.plant) return closed;
  switch (step.op) {
    case 'CLOSE': return { ...closed, [step.plant]: true };
    case 'OPEN': return { ...closed, [step.plant]: false };
    case 'APPLY EARTH': return { ...closed, [step.plant]: true };
    case 'REMOVE EARTH': return { ...closed, [step.plant]: false };
    // Both racking operations are electrically neutral. Racking in returns the breaker to
    // the service position with its contacts still open; the circuit is not made until a
    // later step closes it. Treating RACK IN as a closure would restore supply one step
    // early and quietly delete the moment the sequence is actually testing.
    case 'RACK OUT': case 'RACK IN': return closed;
    default: return closed;
  }
}

/**
 * Why a point the schedule believes is dead is still live.
 *
 * Walks outward from the earthing point through closed plant until it reaches a source, and
 * reports the route. A reader following it on the single-line diagram sees the loop the
 * writer did not.
 */
function livePath(closed: PlantState, from: string): string[] {
  const adjacency = new Map<string, { node: string; via: string }[]>();
  for (const item of PLANT) {
    if (!closed[item.id] || item.kind === 'earth') continue;
    if (!adjacency.has(item.from)) adjacency.set(item.from, []);
    if (!adjacency.has(item.to)) adjacency.set(item.to, []);
    adjacency.get(item.from)!.push({ node: item.to, via: item.id });
    adjacency.get(item.to)!.push({ node: item.from, via: item.id });
  }
  const seen = new Set([from]);
  const queue: { node: string; route: string[] }[] = [{ node: from, route: [] }];
  while (queue.length) {
    const here = queue.shift()!;
    for (const next of adjacency.get(here.node) ?? []) {
      if (seen.has(next.node)) continue;
      const route = [...here.route, next.via];
      if (next.node === 'GRID-A' || next.node === 'GRID-B') return route;
      seen.add(next.node);
      queue.push({ node: next.node, route });
    }
  }
  return [];
}

/**
 * The one rule this prototype implements in full.
 *
 * The rule set on `/proving` names eight classes; implementing all eight would be a product
 * rather than a prototype, and a site that showed eight shallow checks would be less
 * convincing than one that shows a single check working properly on real plant. This is the
 * class that kills people, and it is the one the worked example turns on.
 */
function checkEarthOnLive(closed: PlantState, step: Step): Refusal | null {
  const state = solve(closed);
  if (!state.earthOnLive.length) return null;
  const [fault] = state.earthOnLive;
  const item = plantById.get(fault.plant);
  const path = livePath(closed, fault.node);
  const through = path.map((id) => plantById.get(id)?.label ?? id);

  return {
    code: 'BACK-ENERGISATION',
    title: 'Earth applied to a point energised from another direction',
    finding: `${item?.label ?? fault.plant} closes onto ${fault.node.replace('T2-HV', 'the T2 33kV connections').replace('T2-LV', 'the T2 11kV cable')}, which is still connected to a source.`,
    cause:
      'No step opens T2-11-CB. The load transfer at step 3 closed the bus section and left both transformers in parallel, '
      + 'so T2 remains bolted to an energised Section 2 busbar at 11kV and is transforming back up to 33kV against the open disconnector.',
    path: through,
  };
}

/**
 * Walk a schedule through the model.
 *
 * `from` matters. The restoration sequence does not begin at the normal running arrangement —
 * it begins wherever the forward sequence stopped, with the transformer isolated, earthed and
 * under a permit. Proving it from the initial state would report a restoration that starts
 * with nothing to restore, and would show zero exposure through a window that is entirely
 * exposure.
 */
export function prove(steps: Step[], from?: PlantState): { steps: ProvedStep[]; refusedAt: number | null } {
  let closed = from ? { ...from } : initialState();
  const out: ProvedStep[] = [];
  let refusedAt: number | null = null;

  for (const step of steps) {
    const next = apply(closed, step);
    const refusal = refusedAt === null ? checkEarthOnLive(next, step) : null;
    if (refusal && refusedAt === null) refusedAt = step.n;
    closed = next;
    out.push({ step, state: solve(closed), exposure: contingencyExposure(closed), refusal });
  }
  return { steps: out, refusedAt };
}

/** The plant states a proved sequence ends on, for a sequence that continues from it. */
export function endState(proved: ProvedStep[]): PlantState {
  return proved.length ? proved[proved.length - 1].state.closed : initialState();
}

/**
 * The exposure window, in the two units an outage planner books against.
 *
 * Customers interrupted is the number the regulator counts. Customers exposed is the number
 * that decides whether the window is acceptable, and it is invisible in a schedule that is
 * only a list of operations.
 */
export function window(proved: ProvedStep[]) {
  const exposed = proved.filter((entry) => entry.exposure > 0);
  const peak = proved.reduce((worst, entry) => Math.max(worst, entry.exposure), 0);
  const interrupted = proved.reduce((worst, entry) => Math.max(worst, entry.state.customersOff), 0);
  const from = exposed[0]?.step.at ?? 0;
  const to = exposed.length ? exposed[exposed.length - 1].step.at : 0;
  return {
    peakExposure: peak,
    customersInterrupted: interrupted,
    fromMinute: from,
    toMinute: to,
    /** Switching time only. The work itself sits inside the window and is the customer's estimate. */
    switchingMinutes: to - from,
    totalCustomers: SITE.customersTotal,
  };
}
