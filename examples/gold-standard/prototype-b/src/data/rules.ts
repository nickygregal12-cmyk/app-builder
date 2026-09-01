/**
 * The eight classes of unsafe sequence.
 *
 * Written as classes rather than as a checklist because that is how the failures actually
 * group: the same omission produces a different symptom depending on where in the sequence it
 * lands, and a rule list organised by symptom would have four entries for one mistake.
 *
 * `implemented` is honest. This prototype proves one class in full against a real model;
 * naming eight and shipping one would be a lie, and naming one would understate what the
 * product is. So each says where it stands, and the site says so on the page.
 */
export interface Rule {
  code: string;
  title: string;
  what: string;
  /** A concrete instance, in the vocabulary of the worked example where possible. */
  example: string;
  /** What the refusal points at, which is always an earlier operation or a missing one. */
  names: string;
  implemented: boolean;
}

export const RULES: Rule[] = [
  {
    code: 'BACK-ENERGISATION',
    title: 'A point that is earthed or worked on is reachable from another direction',
    what:
      'The sequence isolates the obvious source and leaves a second one. Transformers are the usual route because they conduct both ways, but a ring, an embedded generator or a customer\'s own supply will do it just as well.',
    example:
      'The Attercliffe draft opens T2 at 33kV and earths it, while T2 remains connected to a backfed Section 2 busbar through its own 11kV breaker.',
    names: 'The operation that left the path open, or the absence of one. Here: nothing opens T2-11-CB.',
    implemented: true,
  },
  {
    code: 'ISOLATION-INCOMPLETE',
    title: 'The permit names points of isolation that do not isolate',
    what:
      'Every point named on the permit is checked against the network at the step it was established. An open circuit breaker is not a point of isolation — it can be closed by a control signal — and a permit that names one is claiming a safety property the plant does not have.',
    example:
      'A permit naming T2-11-CB as a point of isolation when the sequence opens it but never racks it out.',
    names: 'The step that established the point, and what it would take to make it an isolation.',
    implemented: false,
  },
  {
    code: 'EARTH-BEFORE-PROOF',
    title: 'An earth is applied to a point nobody has proved dead',
    what:
      'Proving dead is a step, not an assumption, and it has to sit between the last isolation and the first earth. A sequence that earths without proving has removed its own last line of defence.',
    example:
      'The draft applies the 11kV portable earth at step 9 with the prove-dead at step 8 — correct order — but earths the 33kV side at step 7 against a prove-dead that would have failed.',
    names: 'The earthing step, and where the proof would have to be inserted.',
    implemented: false,
  },
  {
    code: 'RESTORATION-ORDER',
    title: 'The restoration undoes things in an order that is not safe',
    what:
      'Earths removed before the permit is cancelled. Disconnectors operated on load. A transformer paralleled before its tap position is checked. The restoration is where attention is lowest and the sequence is longest.',
    example:
      'Removing the 11kV earth while the permit is still live, which returns the work area to service with people on it.',
    names: 'The step that is out of order, and the step it must follow.',
    implemented: false,
  },
  {
    code: 'SUPPLY-STRANDED',
    title: 'An operation disconnects customers the outage plan said would stay on',
    what:
      'Checked against the feeders in the model rather than against the planner\'s expectation, because those are two different documents and the second is the one that gets quoted afterwards.',
    example:
      'Opening the bus section before the transfer rather than after, which drops Section 2 — 4,180 customers — for the length of the job.',
    names: 'The operation, the feeders it drops, and the customer count on each.',
    implemented: false,
  },
  {
    code: 'RATING-EXCEEDED',
    title: 'The reconfiguration overloads what is left carrying it',
    what:
      'A backfeed that is electrically valid can still be thermally impossible. Checked against forecast load for the window, not against nameplate, because the window is when it matters.',
    example:
      'Attercliffe passes: 14.2 MVA forecast peak against T1\'s 24 MVA cyclic rating. A January window would not.',
    names: 'The plant, its rating, the forecast, and the hour it is exceeded.',
    implemented: false,
  },
  {
    code: 'PARALLEL-LIMITS',
    title: 'Two sources are paralleled outside the limits they may be paralleled within',
    what:
      'Tap difference, phase displacement, and whether the two sources are actually the same system. The make-before-break transfer that avoids interrupting customers depends entirely on this being true.',
    example:
      'Closing the bus section with T1 and T2 three taps apart, which circulates current between them for the whole window.',
    names: 'The two sources, the limit, and the check step that has to precede the closure.',
    implemented: false,
  },
  {
    code: 'UNMODELLED-PLANT',
    title: 'The sequence touches plant Interlock has no model for',
    what:
      'The refusal that matters most for trust. Where the model does not know what is beyond a point, Interlock stops rather than assuming that point is open. An assumption here is indistinguishable from a proof, right up until it is not.',
    example:
      'A sequence reaching into the customer HV switchgear beyond the F4 Meadowhall metering point, which is customer-owned and for which no drawing was supplied.',
    names: 'The plant, and who holds the drawing that would close the gap.',
    implemented: true,
  },
];
