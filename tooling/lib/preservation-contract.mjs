/**
 * What an existing product must keep, and whether anybody has looked hard
 * enough to say so.
 *
 * `deriveBaseline` in `brownfield-baseline.mjs` records what a repository is
 * shaped like at an exact revision. It says so itself, in the field that
 * matters most: it does not protect behaviour, because nothing was executed. A
 * count of test files that did not move is not a passing test, and a route that
 * still exists may now return the wrong thing.
 *
 * That is the gap this module closes, and the reason it exists is written into
 * `config/factory-status.json`: brownfield mutation is deferred until "an
 * exact-revision baseline includes observed passing tests and rendered
 * behavioural evidence sufficient to protect known-good behaviour". A
 * Preservation Contract is that sentence made executable. It takes a baseline,
 * a declaration of what must be preserved, observations of the product actually
 * running and — separately, because it answers a different question — an
 * `ActionAuthorization`, and reports on one thing:
 *
 *   May this repository be changed yet?
 *
 * The answer is `false` by default and stays `false` until the evidence earns
 * otherwise. That direction is the whole design. A contract that defaulted to
 * permitting mutation and looked for reasons to stop would grant authority
 * every time somebody forgot to supply evidence, which is precisely when it
 * should be refusing.
 *
 * ## What counts as an observation
 *
 * Something that ran, whose outcome somebody recorded, against the revision the
 * baseline names. All three conditions, and each of them rejects a different
 * plausible mistake:
 *
 * - **It ran.** A declared test command is not a test result. An observation
 *   with no outcome is a plan.
 * - **Its outcome was recorded.** `passed` and `failed` are both evidence.
 *   Absence is not.
 * - **It names this revision.** Evidence gathered at a different commit
 *   describes a different product. This is the quiet failure the whole module
 *   is built to catch: last week's green test run is the most convincing wrong
 *   answer available.
 *
 * ## Failing is evidence; failing by surprise is not
 *
 * A protected journey observed to fail means the baseline is not known-good,
 * and there is nothing to preserve — mutation stays disabled. But a failure the
 * declaration already names as a known failure is different: it is classified
 * debt, it stays classified, and the contract records that it must still be
 * failing afterwards. A brownfield agent that silently "fixes" an accepted
 * failure has changed the product outside its scope, and the only way to notice
 * is to have written the failure down first.
 */

import { AuthorizationError, assertActionAuthorizationUsable } from '@app-builder/control-plane/action-authorization';

/** The kinds of evidence a Preservation Contract will admit, and nothing else. */
export const OBSERVATION_KINDS = Object.freeze(['executed-check', 'rendered-journey', 'data-boundary']);

/**
 * Outcomes an observation may carry.
 *
 * There is no `unknown`. An observation whose outcome nobody knows is not an
 * observation, and giving it a word to hide behind is how it would become one.
 */
export const OBSERVATION_OUTCOMES = Object.freeze(['passed', 'failed']);

/**
 * Admit or reject one observation.
 *
 * Rejection is always explained, because a contract that quietly dropped
 * evidence would report "insufficient baseline" while the caller was looking at
 * the evidence it ignored.
 */
function admit(observation, revision) {
  const reasons = [];
  if (!OBSERVATION_KINDS.includes(observation?.kind)) {
    reasons.push(`Unknown observation kind ${JSON.stringify(observation?.kind)}. Only ${OBSERVATION_KINDS.join(', ')} are evidence here.`);
  }
  if (!observation?.name) {
    reasons.push('The observation does not say what was observed, so nothing can be shown to cover a requirement.');
  }
  if (!OBSERVATION_OUTCOMES.includes(observation?.outcome)) {
    reasons.push(`Outcome ${JSON.stringify(observation?.outcome ?? null)} is not a result. Something that did not run, or whose result nobody recorded, is a plan rather than evidence.`);
  }
  if (!observation?.revision) {
    reasons.push('The observation names no revision, so there is no way to tell which version of the product it describes.');
  } else if (observation.revision !== revision) {
    reasons.push(`The observation was taken at ${short(observation.revision)} and the baseline is ${short(revision)}. Evidence from another revision describes another product.`);
  }
  return { admitted: reasons.length === 0, reasons };
}

function short(revision) {
  return typeof revision === 'string' && revision.length > 12 ? revision.slice(0, 12) : String(revision ?? 'none');
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Build the contract.
 *
 * @param {object}   input
 * @param {object}   input.baseline       a `deriveBaseline` record for the subject repository
 * @param {object}   input.declaration    what the owner or corpus states must be preserved
 * @param {object[]} input.observations   things that were run, with recorded outcomes
 * @param {object}   [input.authorisation] an ActionAuthorization, if one has been granted
 * @param {object}   [input.authorisationContext] what that grant is checked against — projectId,
 *                   operation, expectedHash, environment. The base digest is not taken from here:
 *                   it is the baseline's own profile hash, so a caller cannot quietly authorise
 *                   against a state other than the one the evidence describes.
 */
export function derivePreservationContract({ baseline, declaration = {}, observations = [], authorisation = null, authorisationContext = {} }) {
  const revision = baseline?.revision ?? null;
  const refusals = [];

  // --- Is there a fixed point at all? -------------------------------------------
  //
  // Everything below compares evidence against a revision. Without a usable
  // baseline there is no revision to compare against, and the rest of this
  // function would be measuring evidence against nothing.
  if (!baseline || baseline.authority !== 'brownfield-baseline') {
    refusals.push('No brownfield baseline was supplied, so there is no exact revision for any evidence to be about.');
  } else if (!baseline.usable) {
    for (const reason of list(baseline.refusals)) refusals.push(`The baseline is unusable: ${reason}`);
    if (!list(baseline.refusals).length) refusals.push('The baseline was recorded as unusable and did not say why.');
  }

  // --- Which evidence is allowed to speak ----------------------------------------
  const admitted = [];
  const rejected = [];
  for (const observation of list(observations)) {
    const verdict = admit(observation, revision);
    if (verdict.admitted) admitted.push(observation);
    else rejected.push({ observation: observation?.name ?? null, kind: observation?.kind ?? null, reasons: verdict.reasons });
  }

  const observedBy = (kind, name) => admitted.find((entry) => entry.kind === kind && entry.name === name) ?? null;

  // --- Known failures are classified before anything else -------------------------
  //
  // Done first because it changes how a failing observation is read further
  // down. A failure nobody wrote down is a broken baseline; the same failure
  // written down is accepted debt.
  const knownFailures = list(declaration.knownFailures).map((entry) => {
    const failure = typeof entry === 'string' ? { name: entry } : entry;
    const observation = admitted.find((candidate) => candidate.name === failure.name);
    return {
      name: failure.name,
      reason: failure.reason ?? null,
      observed: observation ? observation.outcome : null,
      // The point of recording these. An improvement slice that makes one pass
      // has changed something it was not asked to change, and "it got better"
      // is not a defence when nobody asked for it and nobody reviewed it.
      mustRemainClassified: true,
    };
  });
  const isKnownFailure = (name) => knownFailures.some((failure) => failure.name === name);

  // --- Requirement coverage -------------------------------------------------------
  //
  // Each declared requirement is matched to the evidence that would protect it.
  // A requirement with no evidence is not a small gap to be noted: it is the
  // reason mutation stays off, because it is exactly the behaviour a change
  // would break invisibly.
  const coverage = [];
  const cover = (requirement, kind, name, note) => {
    const observation = observedBy(kind, name);
    const entry = {
      requirement,
      name,
      evidence: observation ? { kind, outcome: observation.outcome, source: observation.source ?? null } : null,
      status: 'unproven',
      note: note ?? null,
    };
    if (!observation) {
      entry.status = 'unproven';
      refusals.push(`${requirement} "${name}" has no ${kind} bound to ${short(revision)}. Behaviour nobody watched cannot be protected, and a change that broke it would look identical to a change that did not.`);
    } else if (observation.outcome === 'passed') {
      entry.status = 'demonstrated';
    } else if (isKnownFailure(name)) {
      entry.status = 'classified-failure';
      entry.note = 'Observed failing and declared as a known failure. It stays failing; a slice that repairs it has left its scope.';
    } else {
      entry.status = 'failed';
      refusals.push(`${requirement} "${name}" was observed failing and is not declared as a known failure. There is no known-good behaviour here to preserve, so a baseline cannot claim to protect it.`);
    }
    coverage.push(entry);
  };

  for (const command of list(declaration.testCommands)) cover('Automated check', 'executed-check', command);
  for (const journey of list(declaration.journeys)) cover('User journey', 'rendered-journey', typeof journey === 'string' ? journey : journey.name);
  for (const boundary of list(declaration.dataBoundaries)) cover('Data boundary', 'data-boundary', typeof boundary === 'string' ? boundary : boundary.name);

  // --- Requirements that were declared and cannot be evidenced at all -------------
  //
  // Routes, API contracts, visual and performance expectations are declared
  // here but proved elsewhere in this repository. Rather than invent a second
  // evidence stack for them, the contract carries them as stated requirements
  // and is explicit that stating is not proving.
  const stated = {
    routes: list(declaration.routes),
    apiContracts: list(declaration.apiContracts),
    dataConstraints: list(declaration.dataConstraints),
    authInvariants: list(declaration.authInvariants),
    visualInvariants: list(declaration.visualInvariants),
    accessibility: list(declaration.accessibility),
    performance: list(declaration.performance),
  };

  // --- Things the declaration itself says are unknown -------------------------------
  //
  // Carried through untouched. A brownfield agent that reads this contract must
  // be able to tell the difference between "this is safe" and "nobody knows",
  // and the second one is only useful if it survives into the artifact.
  const unknowns = list(declaration.mustRemainUnknown).map((entry) => (typeof entry === 'string' ? { subject: entry, reason: null } : entry));

  // --- Scope ------------------------------------------------------------------------
  const allowedScope = list(declaration.allowedScope);
  const prohibitedAreas = list(declaration.prohibitedAreas);
  const churnCeiling = declaration.churnCeiling ?? null;

  if (!allowedScope.length) {
    refusals.push('The declaration names no allowed scope. A change permitted to touch anything is not a bounded change, and "the whole repository" is how a bounded improvement becomes a rewrite.');
  }
  if (churnCeiling === null) {
    refusals.push('The declaration sets no churn ceiling, so there is no size at which a change becomes too large to review.');
  }

  // --- Authorisation ------------------------------------------------------------------
  //
  // Evidence answers "would we notice a regression?". It never answers "may
  // this be changed?" — that is a separate grant, and it is `ActionAuthorization`
  // rather than anything invented here. This module checks a grant and cannot
  // issue one; a module that decided its own authority would be the bypass it
  // exists to make impossible.
  //
  // The binding that matters is the base. An authorisation names the exact
  // thing it was granted against, and `assertActionAuthorizationUsable` refuses
  // with `base-drifted` when that thing has moved. Here the base is the
  // baseline's `profileHash` — the hash of the read this contract's evidence
  // was gathered from — so permission granted after looking at one state of a
  // repository does not survive the repository changing underneath it. That is
  // the same refusal, in the same shape, as evidence gathered against another
  // revision.
  let authorised = false;
  let authorisationRefusal = null;
  const authorisationRefusals = [];
  const refuseAuthorisation = (reason) => { authorisationRefusals.push(reason); refusals.push(reason); };
  if (!authorisation) {
    refuseAuthorisation('No ActionAuthorization was supplied, so nothing grants mutation of this repository. Adequate evidence means a regression would be noticed; it is not permission, and this contract does not issue permission.');
  } else if (!baseline?.profileHash) {
    refuseAuthorisation('The baseline records no profile hash, so an authorisation cannot be bound to the state this evidence describes.');
  } else {
    try {
      assertActionAuthorizationUsable(authorisation, { ...authorisationContext, currentBaseDigest: baseline.profileHash });
      authorised = true;
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
      authorisationRefusal = error.refusal;
      refuseAuthorisation(`The authorisation was refused as ${error.refusal}: ${error.message}`);
    }
  }

  // Evidence adequacy is judged on the evidence refusals alone. An authorisation
  // problem is somebody else's to fix and must not read as a missing test.
  //
  // The two lists are kept apart as they are built rather than separated
  // afterwards by matching on how a sentence begins. A consumer that had to
  // recognise a refusal by its prefix would break the first time one was
  // reworded, silently and in the direction of showing an owner an engineering
  // problem.
  const evidenceRefusals = refusals.filter((reason) => !authorisationRefusals.includes(reason));
  const evidenceAdequate = evidenceRefusals.length === 0;

  return {
    schemaVersion: 1,
    authority: 'brownfield-preservation-contract',
    subject: baseline?.subject ?? null,
    revision,
    // The binding back to the read that produced the shape counts. A
    // preservation contract and a baseline that disagree about the profile are
    // two records of two different reads.
    baselineProfileHash: baseline?.profileHash ?? null,

    requires: { ...stated, journeys: list(declaration.journeys), testCommands: list(declaration.testCommands), dataBoundaries: list(declaration.dataBoundaries) },
    knownFailures,
    mustRemainUnknown: unknowns,
    scope: { allowed: allowedScope, prohibited: prohibitedAreas, churnCeiling },

    evidence: { admitted: admitted.map((entry) => ({ kind: entry.kind, name: entry.name, outcome: entry.outcome, source: entry.source ?? null })), rejected },
    coverage,

    /**
     * Inherited from the baseline and extended, rather than restated.
     *
     * The baseline's own honesty about what it does not cover is the most
     * valuable thing in it, and a contract that dropped those sentences while
     * adding evidence would read as though the evidence had answered them.
     */
    protects: [
      ...list(baseline?.protects),
      ...coverage.filter((entry) => entry.status === 'demonstrated').map((entry) => `${entry.requirement} "${entry.name}" was observed passing at ${short(revision)}, so a change that breaks it is visible.`),
    ],
    doesNotProtect: [
      ...list(baseline?.doesNotProtect).filter((sentence) => !(coverage.some((entry) => entry.status === 'demonstrated') && sentence.startsWith('Behaviour.'))),
      ...coverage.filter((entry) => entry.status !== 'demonstrated').map((entry) => `${entry.requirement} "${entry.name}" is ${entry.status}. It is named as requiring preservation and no passing evidence covers it.`),
      ...unknowns.map((entry) => `${entry.subject} is declared unknown${entry.reason ? `: ${entry.reason}` : ''}. It stays unknown; it must not be inferred from names, folders or dependencies.`),
    ],

    /**
     * The safety semantic, in one field.
     *
     * Two separate conditions, reported separately, because they fail for
     * different reasons and have different owners. Evidence is engineering
     * work; authorisation is somebody's decision. Collapsing them into one
     * boolean would make a missing owner decision look like a missing test.
     */
    mutation: {
      enabled: evidenceAdequate && authorised,
      evidenceAdequate,
      authorised,
      // The named refusal from the authorisation contract, where there was one.
      // `base-drifted` and `expired` are different problems with different
      // answers, and flattening them to "not authorised" loses which.
      authorisationRefusal,
      authorizationId: authorisation?.authorizationId ?? null,
      refusals,
      // The same refusals, split by who has to do something about them.
      evidenceRefusals,
      authorisationRefusals,
    },
  };
}

/**
 * Read a contract's verdict without re-deriving it.
 *
 * Exists so a caller cannot accidentally ask the question the permissive way.
 * `if (contract.mutation)` is truthy for every contract ever produced,
 * including every one that refuses.
 */
export function mutationPermitted(contract) {
  return contract?.authority === 'brownfield-preservation-contract' && contract.mutation?.enabled === true;
}
