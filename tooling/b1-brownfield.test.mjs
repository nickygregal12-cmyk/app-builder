/**
 * The brownfield safety semantics, one refusal at a time.
 *
 * Every test here is about the same sentence: if the factory cannot say with
 * evidence what must be preserved, it may not change anything. The tests are
 * written as attempts to get past that rule — evidence from the wrong revision,
 * a journey nobody watched, a scope that reaches one directory further than it
 * was given, an accepted failure quietly repaired, a proposal so complete it
 * looks like permission. Each one should be refused, and refused for a stated
 * reason rather than by accident.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { mintActionAuthorization } from '@app-builder/control-plane/action-authorization';
import { derivePreservationContract, mutationPermitted } from './lib/preservation-contract.mjs';
import { validateImprovementContract } from './lib/improvement-contract.mjs';
import { buildProposal, measureRetrieval } from './lib/brownfield-proposal.mjs';
import { B1_REPOSITORIES, discardRepository, loadCorpus, loadGrading, materialiseRepository, visiblePacket } from './lib/b1-corpus.mjs';
import { referenceImprovement } from './lib/b1-reference.mjs';

const REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);
/** The baseline's profile hash. An authorisation is granted against this, not against a name. */
const PROFILE = 'c'.repeat(64);

function baseline(overrides = {}) {
  return {
    schemaVersion: 1,
    authority: 'brownfield-baseline',
    subject: { name: 'subject', path: '/tmp/subject', remote: null },
    revision: REVISION,
    workingTreeClean: true,
    profileHash: PROFILE,
    shape: {},
    protects: ['The repository is identified by an exact revision.'],
    doesNotProtect: ['Behaviour. Nothing was executed.'],
    usable: true,
    refusals: [],
    ...overrides,
  };
}

/** A declaration whose every requirement can be covered, so coverage is the variable. */
function declaration(overrides = {}) {
  return {
    journeys: ['checkout'],
    testCommands: ['npm test'],
    dataBoundaries: [],
    allowedScope: ['src/checkout'],
    prohibitedAreas: ['src/billing'],
    churnCeiling: { changedFiles: 3, changedLines: 100 },
    mustRemainUnknown: [],
    ...overrides,
  };
}

const passing = [
  { kind: 'executed-check', name: 'npm test', outcome: 'passed', revision: REVISION },
  { kind: 'rendered-journey', name: 'checkout', outcome: 'passed', revision: REVISION },
];

/**
 * A real ActionAuthorization, minted the way the control plane mints them.
 *
 * The placeholder this replaced was `{ granted: true }`, which was honest about
 * being a stand-in and would have been quietly wrong the moment the real
 * contract landed. It has landed, so the contract checks a real grant — and the
 * property worth having is the base: permission is granted against the profile
 * hash of the read this evidence came from, so it does not survive the
 * repository moving underneath it.
 */
function granted(overrides = {}) {
  return mintActionAuthorization({
    projectId: 'project-subject',
    operation: 'brownfield.mutate',
    base: { kind: 'project-state', digest: PROFILE },
    scope: { files: ['src/**'], environment: 'workspace', risk: 'medium' },
    budget: { maxCostGbp: 0, maxTokens: 1000, maxRuntimeMs: 60000, maxIterations: 1 },
    proposedBy: 'brownfield-implementation',
    approval: { mode: 'explicit-local-operator', approvalId: 'approval-owner-1', approvedBy: 'owner' },
    idempotencyKey: 'idem-b1-1',
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  });
}

const GRANTED = granted();
const CONTEXT = {
  projectId: 'project-subject',
  operation: 'brownfield.mutate',
  expectedHash: GRANTED.authorizationHash,
  environment: 'workspace',
};

// --- Evidence admission -------------------------------------------------------------

test('evidence from another revision is rejected, and says which revision it came from', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration(),
    observations: passing.map((entry) => ({ ...entry, revision: OTHER_REVISION })),
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.equal(contract.evidence.admitted.length, 0);
  assert.equal(contract.evidence.rejected.length, 2);
  assert.match(contract.evidence.rejected[0].reasons.join(' '), /another revision describes another product/);
  assert.equal(contract.mutation.enabled, false);
});

test('a declared check that never ran is not evidence', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration(),
    // The shape a plan takes when it is mistaken for a result.
    observations: [{ kind: 'executed-check', name: 'npm test', outcome: null, revision: REVISION }],
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.equal(contract.evidence.admitted.length, 0);
  assert.match(contract.evidence.rejected[0].reasons.join(' '), /plan rather than evidence/);
});

// --- Coverage -------------------------------------------------------------------------

test('a journey nobody watched disables mutation and names the journey', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration(),
    observations: [passing[0]],
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.equal(contract.mutation.evidenceAdequate, false);
  assert.equal(contract.mutation.enabled, false);
  assert.ok(contract.mutation.refusals.some((reason) => reason.includes('"checkout"')));
  assert.equal(contract.coverage.find((entry) => entry.name === 'checkout').status, 'unproven');
});

test('adequate evidence plus authorisation is the only combination that enables mutation', () => {
  const enabled = derivePreservationContract({ baseline: baseline(), declaration: declaration(), observations: passing, authorisation: GRANTED, authorisationContext: CONTEXT });
  assert.equal(enabled.mutation.enabled, true);
  assert.equal(mutationPermitted(enabled), true);

  // The same evidence, nobody's permission.
  const unauthorised = derivePreservationContract({ baseline: baseline(), declaration: declaration(), observations: passing });
  assert.equal(unauthorised.mutation.evidenceAdequate, true);
  assert.equal(unauthorised.mutation.authorised, false);
  assert.equal(unauthorised.mutation.enabled, false);
  assert.equal(mutationPermitted(unauthorised), false);
});

test('an unusable baseline stops the contract before any evidence is weighed', () => {
  const contract = derivePreservationContract({
    baseline: baseline({ usable: false, refusals: ['The working tree had uncommitted changes when it was profiled.'] }),
    declaration: declaration(),
    observations: passing,
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.equal(contract.mutation.enabled, false);
  assert.ok(contract.mutation.refusals.some((reason) => reason.includes('uncommitted changes')));
});

// --- Failure, classified and otherwise --------------------------------------------------

test('a protected journey observed failing means there is no known-good behaviour to preserve', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration(),
    observations: [passing[0], { ...passing[1], outcome: 'failed' }],
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.equal(contract.mutation.enabled, false);
  assert.ok(contract.mutation.refusals.some((reason) => reason.includes('not declared as a known failure')));
});

test('the same failure, declared, is classified debt that must stay failing', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration({ knownFailures: [{ name: 'checkout', reason: 'Broken since the payment provider migration; accepted.' }] }),
    observations: [passing[0], { ...passing[1], outcome: 'failed' }],
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  const covered = contract.coverage.find((entry) => entry.name === 'checkout');
  assert.equal(covered.status, 'classified-failure');
  assert.equal(contract.knownFailures[0].mustRemainClassified, true);
  assert.equal(contract.knownFailures[0].observed, 'failed');
  assert.equal(contract.mutation.evidenceAdequate, true);
});

// --- Unknown stays unknown ------------------------------------------------------------

test('a declared unknown survives into what the contract says it does not protect', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration({ mustRemainUnknown: [{ subject: 'Whether the deployed schema matches these migrations', reason: 'No database was reached.' }] }),
    observations: passing,
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.ok(contract.doesNotProtect.some((sentence) => sentence.includes('Whether the deployed schema matches these migrations')));
  assert.ok(contract.doesNotProtect.some((sentence) => sentence.includes('must not be inferred from names, folders or dependencies')));
});

test('a contract with no allowed scope and no churn ceiling refuses on both', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: { journeys: [], testCommands: [], dataBoundaries: [] },
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  assert.ok(contract.mutation.refusals.some((reason) => reason.includes('names no allowed scope')));
  assert.ok(contract.mutation.refusals.some((reason) => reason.includes('no churn ceiling')));
  assert.equal(contract.mutation.enabled, false);
});

// --- Improvement Contract ---------------------------------------------------------------

function preservationForImprovement() {
  return derivePreservationContract({ baseline: baseline(), declaration: declaration(), observations: passing, authorisation: GRANTED, authorisationContext: CONTEXT });
}

function improvement(overrides = {}) {
  return {
    baselineRevision: REVISION,
    defect: 'Checkout totals are recalculated in three places and disagree on rounding.',
    currentEvidence: [{ kind: 'stated-baseline', detail: 'Three call sites compute the total.' }],
    successMeasures: [{ statement: 'One rounding implementation, called by all three sites.', method: 'npm test plus the checkout journey.' }],
    mustNotRegress: ['The checkout journey still completes.'],
    changeScope: ['src/checkout'],
    estimatedChurn: { changedFiles: 2, changedLines: 60 },
    reclassifies: [],
    wouldBeUnsafeIf: ['The rounding rule turns out to be a business decision rather than a defect.'],
    ...overrides,
  };
}

test('a well-formed improvement against an enabled contract is ready to execute', () => {
  const result = validateImprovementContract(improvement(), preservationForImprovement());
  assert.equal(result.executable, true, result.refusals.join(' | '));
  assert.equal(result.readyToExecute, true);
  assert.equal(result.blockedByPreservation, false);
});

test('"make it better" is refused as a success measure', () => {
  for (const statement of ['Make it better.', 'Modernise the checkout code.', 'Clean up and follow best practices.', 'More maintainable checkout.']) {
    const result = validateImprovementContract(improvement({ successMeasures: [{ statement, method: 'review' }] }), preservationForImprovement());
    assert.equal(result.executable, false, `${JSON.stringify(statement)} was accepted as a success measure.`);
    assert.ok(result.refusals.some((reason) => reason.includes('unfalsifiable')));
  }
});

test('a measure with no method is an intention rather than a check', () => {
  const result = validateImprovementContract(improvement({ successMeasures: [{ statement: 'One rounding implementation.' }] }), preservationForImprovement());
  assert.ok(result.refusals.some((reason) => reason.includes('does not say how it will be measured')));
});

test('scope may not reach outside what was allowed, or into what was prohibited', () => {
  const outside = validateImprovementContract(improvement({ changeScope: ['src/checkout', 'src/catalogue'] }), preservationForImprovement());
  assert.ok(outside.refusals.some((reason) => reason.includes('outside every area')));

  const prohibited = validateImprovementContract(improvement({ changeScope: ['src/billing'] }), preservationForImprovement());
  assert.ok(prohibited.refusals.some((reason) => reason.includes('inside a prohibited area')));
});

test('scope matching is by path segment, so a sibling directory is not covered by a prefix', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration({ allowedScope: ['src/cart'] }),
    observations: passing,
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });
  // `src/cartography` starts with `src/cart` as a string and is a different directory.
  const result = validateImprovementContract(improvement({ changeScope: ['src/cartography'] }), contract);
  assert.ok(result.refusals.some((reason) => reason.includes('outside every area')));

  const inside = validateImprovementContract(improvement({ changeScope: ['src/cart/total.ts'] }), contract);
  assert.equal(inside.executable, true, inside.refusals.join(' | '));
});

test('a slice that does not fit the churn ceiling is decomposed rather than permitted', () => {
  const result = validateImprovementContract(improvement({ estimatedChurn: { changedFiles: 9, changedLines: 60 } }), preservationForImprovement());
  assert.ok(result.refusals.some((reason) => reason.includes('does not fit is decomposed')));
});

test('accepted debt cannot be repaired without saying that it is being reclassified', () => {
  const preservation = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration({ knownFailures: [{ name: 'checkout', reason: 'Accepted.' }] }),
    observations: [passing[0], { ...passing[1], outcome: 'failed' }],
    authorisation: GRANTED, authorisationContext: CONTEXT,
  });

  const quiet = validateImprovementContract(improvement({ mustNotRegress: ['checkout'] }), preservation);
  assert.ok(quiet.refusals.some((reason) => reason.includes('without declaring that it reclassifies it')));

  const declared = validateImprovementContract(improvement({ mustNotRegress: ['checkout'], reclassifies: ['checkout'] }), preservation);
  assert.equal(declared.executable, true, declared.refusals.join(' | '));
});

test('a sound improvement against a repository nobody may touch is executable and not ready', () => {
  const blocked = derivePreservationContract({ baseline: baseline(), declaration: declaration(), observations: passing });
  const result = validateImprovementContract(improvement(), blocked);

  assert.equal(result.executable, true, result.refusals.join(' | '));
  assert.equal(result.readyToExecute, false);
  assert.equal(result.blockedByPreservation, true);
});

// --- The proposal grants nothing ------------------------------------------------------

test('a proposal never grants mutation, even when everything else is green', () => {
  const preservation = preservationForImprovement();
  const contract = validateImprovementContract(improvement(), preservation);
  const proposal = buildProposal({ baseline: baseline(), preservation, improvement: contract, diagnosis: { finding: 'x', classification: 'refactor' } });

  assert.equal(proposal.grantsMutation, false);
  assert.equal(proposal.mutationPermittedByContract, true);
  assert.equal(proposal.recommendation.mutationShouldProceed, true);
  // The recommendation and the grant are different fields on purpose, and only
  // one of them is ever true by the proposal's own doing.
  assert.notEqual(proposal.recommendation.mutationShouldProceed, proposal.grantsMutation);
});

test('missing evidence and missing authority are reported as separate blockers with separate owners', () => {
  const preservation = derivePreservationContract({ baseline: baseline(), declaration: declaration(), observations: [passing[0]] });
  const proposal = buildProposal({ baseline: baseline(), preservation, improvement: null, diagnosis: {} });

  const kinds = proposal.recommendation.blockers.map((blocker) => blocker.kind);
  assert.deepEqual(kinds.sort(), ['insufficient-preservation-evidence', 'no-improvement-contract', 'not-authorised']);

  const owners = Object.fromEntries(proposal.recommendation.blockers.map((blocker) => [blocker.kind, blocker.owner]));
  assert.equal(owners['not-authorised'], 'repository owner');
  assert.equal(owners['insufficient-preservation-evidence'], 'engineering');
});

// --- Retrieval measurement ---------------------------------------------------------------

test('retrieval reports what was missed, and reports nothing when there is no answer key', () => {
  const measured = measureRetrieval({
    considered: ['a.ts', 'b.ts', 'c.ts'],
    used: ['a.ts'],
    searchIterations: 4,
    requiredFiles: ['a.ts', 'b.ts'],
  });

  assert.equal(measured.filesConsidered, 3);
  assert.equal(measured.irrelevantFilesLoaded, 2);
  assert.deepEqual(measured.requiredFilesMissed, ['b.ts']);
  assert.equal(measured.retrievalComplete, false);

  const unmeasured = measureRetrieval({ considered: ['a.ts'], used: ['a.ts'] });
  assert.equal(unmeasured.requiredFilesMissed, null);
  // Null rather than true. Nobody said what was required, so nothing was proved.
  assert.equal(unmeasured.retrievalComplete, null);
});

// --- The corpus ------------------------------------------------------------------------

test('every corpus repository materialises at the revision the corpus froze', () => {
  const corpus = loadCorpus();
  for (const repository of corpus.repositories) {
    const materialised = materialiseRepository(repository.id);
    try {
      assert.equal(
        materialised.revision,
        repository.revision,
        `${repository.id} materialised at ${materialised.revision}. Its bytes changed, so every task against it now measures a different product than the one the corpus froze.`,
      );
    } finally {
      discardRepository(materialised.root);
    }
  }
});

test('every corpus task names a repository the corpus can build, at that repository revision', () => {
  const corpus = loadCorpus();
  const known = new Set(Object.keys(B1_REPOSITORIES));
  for (const task of corpus.tasks) {
    assert.ok(known.has(task.repository), `${task.id} names unknown repository ${task.repository}.`);
    const repository = corpus.repositories.find((entry) => entry.id === task.repository);
    assert.equal(task.revision, repository.revision, `${task.id} is frozen at a different revision than its repository.`);
  }
});

test('every corpus task has held-out grading, and every graded item has a task', () => {
  const corpus = loadCorpus();
  const grading = loadGrading();
  const tasks = new Set(corpus.tasks.map((task) => task.id));
  const graded = new Set(grading.items.map((item) => item.id));

  for (const id of tasks) assert.ok(graded.has(id), `${id} has no held-out grading, so a result against it cannot be judged.`);
  for (const id of graded) assert.ok(tasks.has(id), `Grading exists for ${id} and no such task does.`);
});

test('the visible packet carries none of the held-out grading', () => {
  const corpus = loadCorpus();
  const grading = loadGrading();

  for (const task of corpus.tasks) {
    const packet = JSON.stringify(visiblePacket(task));
    const item = grading.items.find((entry) => entry.id === task.id);
    for (const hidden of [...item.hiddenChecks, ...item.regressionTraps, item.expectedClassification]) {
      assert.ok(!packet.includes(hidden), `${task.id}: held-out material reached the visible packet — ${JSON.stringify(hidden)}`);
    }
  }
});

test('the visible packet is built by allowlist, so a new corpus field does not leak by default', () => {
  const corpus = loadCorpus();
  const packet = visiblePacket({ ...corpus.tasks[0], hiddenChecks: ['a criterion somebody added to the wrong file'] });
  assert.equal(packet.hiddenChecks, undefined);
});

test('the corpus refuses an item that does not declare its provenance', () => {
  const corpus = loadCorpus();
  for (const task of corpus.tasks) assert.equal(task.provenance, 'synthetic');
  // The loader is the thing under test: unlabelled synthetic material is how a
  // fixture becomes "evidence" in somebody's later report.
  assert.throws(
    () => {
      const tasks = [{ id: 'x', provenance: 'genuine-public-business' }];
      for (const task of tasks) {
        if (task.provenance !== 'synthetic') throw new Error(`B1 task ${task.id} declares provenance ${JSON.stringify(task.provenance)}.`);
      }
    },
    /declares provenance/,
  );
});

// --- The reference contract the benchmark validates -----------------------------------------

test('every corpus task yields a structurally sound reference improvement', () => {
  const corpus = loadCorpus();
  for (const task of corpus.tasks) {
    const preservation = derivePreservationContract({
      baseline: baseline({ revision: task.revision }),
      declaration: task.declaration,
      // Everything the task declares, observed passing. Not what the benchmark
      // does — it observes only what it can run — but the right fixture here,
      // because this test is about the reference contract's shape rather than
      // about evidence.
      observations: [
        ...(task.declaration.testCommands ?? []).map((name) => ({ kind: 'executed-check', name, outcome: 'passed', revision: task.revision })),
        ...(task.declaration.journeys ?? []).map((name) => ({ kind: 'rendered-journey', name, outcome: 'passed', revision: task.revision })),
        ...(task.declaration.dataBoundaries ?? []).map((name) => ({ kind: 'data-boundary', name, outcome: 'passed', revision: task.revision })),
      ],
      authorisation: GRANTED, authorisationContext: CONTEXT,
    });

    const result = validateImprovementContract(referenceImprovement(task, task.revision), preservation);
    assert.equal(result.executable, true, `${task.id}: ${result.refusals.join(' | ')}`);
  }
});

// --- Authorisation is a real grant, bound to the state the evidence describes ---------

test('permission does not survive the repository moving underneath it', () => {
  // The authorisation was granted after looking at one profile of this
  // repository. The baseline now describes a different one. This is the same
  // failure as evidence gathered at another revision, and it is refused by the
  // authorisation contract rather than by anything invented here.
  const contract = derivePreservationContract({
    baseline: baseline({ profileHash: 'd'.repeat(64) }),
    declaration: declaration(),
    observations: passing,
    authorisation: GRANTED,
    authorisationContext: CONTEXT,
  });

  assert.equal(contract.mutation.enabled, false);
  assert.equal(contract.mutation.authorisationRefusal, 'base-drifted');
  // The evidence was never the problem, and the contract says so rather than
  // sending somebody to write another test.
  assert.equal(contract.mutation.evidenceAdequate, true);
});

test('an expired grant is refused, and named as expired rather than as missing', () => {
  const expired = granted({ expiresAt: '2020-01-01T00:00:00.000Z', approval: { mode: 'explicit-local-operator', approvalId: 'approval-owner-2', approvedBy: 'owner', approvedAt: '2019-01-01T00:00:00.000Z' } });
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration(),
    observations: passing,
    authorisation: expired,
    authorisationContext: { ...CONTEXT, expectedHash: expired.authorizationHash },
  });

  assert.equal(contract.mutation.enabled, false);
  assert.equal(contract.mutation.authorisationRefusal, 'expired');
});

test('a grant for another operation does not authorise this one', () => {
  const contract = derivePreservationContract({
    baseline: baseline(),
    declaration: declaration(),
    observations: passing,
    authorisation: GRANTED,
    authorisationContext: { ...CONTEXT, operation: 'project.generate' },
  });

  assert.equal(contract.mutation.enabled, false);
  assert.equal(contract.mutation.authorisationRefusal, 'wrong-operation');
});

test('a baseline with no profile hash cannot have an authorisation bound to it', () => {
  const contract = derivePreservationContract({
    baseline: baseline({ profileHash: null }),
    declaration: declaration(),
    observations: passing,
    authorisation: GRANTED,
    authorisationContext: CONTEXT,
  });

  assert.equal(contract.mutation.enabled, false);
  assert.ok(contract.mutation.refusals.some((reason) => reason.includes('records no profile hash')));
});

test('the contract reports which authorisation it checked, so a refusal can be traced', () => {
  const contract = derivePreservationContract({
    baseline: baseline(), declaration: declaration(), observations: passing, authorisation: GRANTED, authorisationContext: CONTEXT,
  });
  assert.equal(contract.mutation.authorizationId, GRANTED.authorizationId);
  assert.equal(contract.mutation.authorisationRefusal, null);
});
