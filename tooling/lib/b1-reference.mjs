/**
 * The deterministic Improvement Contract a B1 task implies.
 *
 * A benchmark needs something to validate, and it must not be a model. If the
 * contracts under test were written by a model, a failing run would have two
 * possible causes — broken machinery or a bad generation — and the benchmark
 * would stop being a regression test for the machinery. So the reference
 * contract is derived from the corpus by fixed rules: same task, same contract,
 * every time.
 *
 * It is deliberately a *well-formed* contract. The point of the B1 run is to
 * watch the Preservation Contract refuse for want of evidence, and that
 * refusal is only visible if nothing else is refusing at the same time. A
 * sloppy reference contract would mask it behind its own complaints.
 *
 * This is not what a real proposal looks like. A real one carries a diagnosis
 * somebody reasoned to. This carries the task statement rearranged into the
 * shape the validator reads, which is enough to exercise scope, churn, accepted
 * debt and measurability, and is not enough to be mistaken for judgement.
 */

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {object} task      a corpus task
 * @param {string} revision  the revision the repository actually materialised at
 */
export function referenceImprovement(task, revision) {
  const declaration = task.declaration ?? {};

  /**
   * What must not move.
   *
   * Assembled from every invariant the declaration states. The fallback matters
   * more than it looks: a task that declares no invariants at all still has one
   * — its declared checks must still pass — and a contract that said "nothing
   * must be preserved" would be waved through by a validator whose whole job is
   * to notice that nobody looked.
   */
  const invariants = [
    ...list(declaration.visualInvariants),
    ...list(declaration.accessibility),
    ...list(declaration.apiContracts),
    ...list(declaration.authInvariants),
    ...list(declaration.dataConstraints),
  ];
  const mustNotRegress = invariants.length ? invariants : list(declaration.testCommands).map((command) => `${command} still passes.`);

  const ceiling = declaration.churnCeiling ?? {};

  return {
    baselineRevision: revision,
    defect: task.statement,

    // The corpus's own description of the current state. Evidence that the
    // defect is real, and honestly the weakest part of a synthetic corpus: the
    // defect is real because somebody wrote it in.
    currentEvidence: [
      { kind: 'stated-baseline', detail: task.baseline },
    ],

    successMeasures: [
      {
        statement: task.intendedImprovement,
        // Every measure names how it is checked. For most of this corpus that
        // is the declared check plus the held-out criteria, and where a task
        // needs a browser or a database the method says so rather than
        // pretending an automated check covers it.
        method: list(declaration.testCommands).length
          ? `${list(declaration.testCommands).join(', ')}, plus the held-out B1 criteria for ${task.id}.`
          : `The held-out B1 criteria for ${task.id}.`,
      },
    ],

    mustNotRegress,
    changeScope: list(declaration.allowedScope),

    /**
     * An estimate deliberately inside the ceiling.
     *
     * The ceiling is exercised by the unit tests, which push an estimate over
     * it and watch the contract refuse. Here the estimate stays under, so a B1
     * run that reports a churn refusal means the corpus and the ceiling have
     * drifted apart rather than that this task is too big.
     */
    estimatedChurn: {
      changedFiles: Math.max(1, (ceiling.changedFiles ?? 2) - 1),
      changedLines: Math.round((ceiling.changedLines ?? 100) * 0.6),
    },

    // Nothing here reclassifies accepted debt. A B1 task that wanted to would
    // have to say so, and the validator refuses it if it does not.
    reclassifies: [],

    wouldBeUnsafeIf: [
      ...list(declaration.mustRemainUnknown).map((entry) => `${entry.subject ?? entry} is resolved by assumption rather than by asking.`),
      `The declared checks cannot be observed passing at ${revision}, in which case there is no known-good behaviour for this change to preserve.`,
    ],
  };
}
