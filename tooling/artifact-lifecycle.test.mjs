/**
 * Deterministic coverage for the artifact lifecycle.
 *
 * Every mistake this reducer could make points the same way: something
 * unearned becomes something earned. So most of what follows is refusals —
 * skipped rungs, missing identity, evidence-free evidence states, a producer
 * accepting its own work, changed bytes keeping old evidence, and legacy data
 * being read as a stronger claim than anyone ever made about it.
 *
 * The legacy fixtures matter most. There are real projects in this repository's
 * history whose recorded state is `verified`, and `verified` is the exact word
 * a future reader would map onto `buildable` without thinking about it. The
 * test that asserts it does not is the one keeping historical data from
 * becoming a reproducibility claim retroactively.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { assertContract, validateContract } from '@app-builder/contracts';
import {
  ARTIFACT_LIFECYCLE_STATES,
  ARTIFACT_TERMINAL_DISPOSITIONS,
  advanceArtifactRevision,
  createArtifactRevision,
  describeArtifactState,
  disposeArtifactRevision,
  forkArtifactRevision,
  nextArtifactStates,
  projectLegacyProjectState,
} from '@app-builder/control-plane/artifact-lifecycle';

const digest = (seed) => seed.repeat(64).slice(0, 64);
const CONTRACT = digest('a1');
const SOURCE = digest('b2');
const LOCK = digest('c3');
const OUTPUT = digest('d4');
const TOOLCHAIN = { node: '22.23.2', npm: '10.9.8' };

function newRevision(overrides = {}) {
  return createArtifactRevision({
    projectId: 'project-1',
    producedBy: 'builder',
    approvedBy: 'owner',
    basis: 'Owner approved the Product Contract.',
    identity: { contractDigest: CONTRACT },
    ...overrides,
  }, '2026-01-01T00:00:00.000Z');
}

/** Walk the whole ladder once, so the refusals below are refusals of a path that otherwise works. */
function fullyReleased() {
  let revision = newRevision();
  revision = advanceArtifactRevision(revision, 'materialized', { actor: 'builder', basis: 'Generated the source tree.', identity: { sourceDigest: SOURCE } });
  revision = advanceArtifactRevision(revision, 'buildable', {
    actor: 'builder',
    basis: 'Clean install, checks and build reproduced the recorded output.',
    identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT },
  });
  revision = advanceArtifactRevision(revision, 'behavior-verified', { actor: 'journey-runner', basis: 'Declared journeys passed against a preview of this output.', evidenceRefs: ['journey-report-1'] });
  revision = advanceArtifactRevision(revision, 'quality-accepted', { actor: 'critic', basis: 'Independent critic accepted it against the approved criteria.', evidenceRefs: ['verdict-1'] });
  revision = advanceArtifactRevision(revision, 'release-candidate', { actor: 'release-service', basis: 'Bound the accepted revision, output, evidence and target.', evidenceRefs: ['candidate-1'] });
  revision = advanceArtifactRevision(revision, 'released', { actor: 'owner', basis: 'Published under an explicit Release Approval.', evidenceRefs: ['approval-1'], identity: { deployId: 'deploy-abc' } });
  return revision;
}

test('the ladder is walked one rung at a time and produces a contract-valid revision', () => {
  const revision = advanceArtifactRevision(fullyReleased(), 'production-verified', { actor: 'smoke-runner', basis: 'Production smoke passed against the live deploy.', evidenceRefs: ['smoke-1'] });
  assert.equal(revision.lifecycleState, 'production-verified');
  assert.deepEqual(revision.history.map((entry) => entry.to), ARTIFACT_LIFECYCLE_STATES);
  assert.deepEqual(validateContract('artifact-revision', revision), []);
  assertContract('artifact-revision', revision);
});

test('a fresh revision starts at contract-approved and cannot pretend to carry an artifact', () => {
  const revision = newRevision();
  assert.equal(revision.lifecycleState, 'contract-approved');
  assert.equal(revision.identity.sourceDigest, null);
  assert.deepEqual(validateContract('artifact-revision', revision), []);
  assert.throws(() => newRevision({ identity: { contractDigest: CONTRACT, sourceDigest: SOURCE } }), /cannot already carry sourceDigest/);
  assert.throws(() => createArtifactRevision({ projectId: 'p', producedBy: 'builder', approvedBy: 'owner', identity: {} }), /requires an approved contract digest/);
});

test('every skipped rung is refused, in both directions', () => {
  const approved = newRevision();
  for (const state of ARTIFACT_LIFECYCLE_STATES.slice(2)) {
    assert.throws(
      () => advanceArtifactRevision(approved, state, { actor: 'builder', basis: 'Trying to skip ahead.', evidenceRefs: ['x'], identity: { sourceDigest: SOURCE, lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT, deployId: 'deploy-abc' } }),
      /Invalid artifact transition/,
      `contract-approved -> ${state} must be refused`,
    );
  }
  const released = fullyReleased();
  assert.throws(() => advanceArtifactRevision(released, 'buildable', { actor: 'builder', basis: 'Going backwards.' }), /Invalid artifact transition/);
  assert.throws(() => advanceArtifactRevision(released, 'released', { actor: 'owner', basis: 'Releasing twice.', evidenceRefs: ['approval-2'] }), /Invalid artifact transition/);
  assert.throws(() => advanceArtifactRevision(newRevision(), 'contract-approved', { actor: 'owner', basis: 'Approving twice.' }), /Invalid artifact transition/);
});

test('buildable is refused without the lockfile, the toolchain and the built output', () => {
  const materialized = advanceArtifactRevision(newRevision(), 'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } });
  const attempt = (identity) => advanceArtifactRevision(materialized, 'buildable', { actor: 'builder', basis: 'It built on my machine.', identity });
  assert.throws(() => attempt({}), /requires lockDigest, toolchain, outputDigest/);
  assert.throws(() => attempt({ lockDigest: LOCK }), /requires toolchain, outputDigest/);
  assert.throws(() => attempt({ lockDigest: LOCK, toolchain: TOOLCHAIN }), /requires outputDigest/);
  assert.equal(attempt({ lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT }).lifecycleState, 'buildable');
});

test('released is refused without the provider deploy identity', () => {
  let revision = newRevision();
  revision = advanceArtifactRevision(revision, 'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } });
  revision = advanceArtifactRevision(revision, 'buildable', { actor: 'builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } });
  revision = advanceArtifactRevision(revision, 'behavior-verified', { actor: 'journey-runner', basis: 'Journeys passed.', evidenceRefs: ['journey-1'] });
  revision = advanceArtifactRevision(revision, 'quality-accepted', { actor: 'critic', basis: 'Accepted.', evidenceRefs: ['verdict-1'] });
  revision = advanceArtifactRevision(revision, 'release-candidate', { actor: 'release-service', basis: 'Bound.', evidenceRefs: ['candidate-1'] });
  assert.throws(() => advanceArtifactRevision(revision, 'released', { actor: 'owner', basis: 'Published.', evidenceRefs: ['approval-1'] }), /requires deployId/);
});

test('a state that is a statement about evidence cannot be entered without naming any', () => {
  let revision = newRevision();
  revision = advanceArtifactRevision(revision, 'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } });
  revision = advanceArtifactRevision(revision, 'buildable', { actor: 'builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } });
  assert.throws(() => advanceArtifactRevision(revision, 'behavior-verified', { actor: 'journey-runner', basis: 'It looked fine.' }), /cannot be entered without naming any/);
});

test('the producer of a revision cannot accept it', () => {
  let revision = newRevision({ producedBy: 'model-builder' });
  revision = advanceArtifactRevision(revision, 'materialized', { actor: 'model-builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } });
  revision = advanceArtifactRevision(revision, 'buildable', { actor: 'model-builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } });
  revision = advanceArtifactRevision(revision, 'behavior-verified', { actor: 'journey-runner', basis: 'Journeys passed.', evidenceRefs: ['journey-1'] });
  assert.throws(
    () => advanceArtifactRevision(revision, 'quality-accepted', { actor: 'model-builder', basis: 'I think it is good.', evidenceRefs: ['verdict-1'] }),
    /produced this revision and cannot also accept it/,
  );
  assert.equal(advanceArtifactRevision(revision, 'quality-accepted', { actor: 'independent-critic', basis: 'Accepted.', evidenceRefs: ['verdict-1'] }).lifecycleState, 'quality-accepted');
});

test('identity is append-only, so changed bytes cannot inherit the evidence of the bytes they replaced', () => {
  const accepted = fullyReleased();
  assert.throws(
    () => advanceArtifactRevision(accepted, 'production-verified', { actor: 'smoke-runner', basis: 'Smoke passed.', evidenceRefs: ['smoke-1'], identity: { outputDigest: digest('ee') } }),
    /identity is append-only: outputDigest/,
  );
  const materialized = advanceArtifactRevision(newRevision(), 'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } });
  assert.throws(
    () => advanceArtifactRevision(materialized, 'buildable', { actor: 'builder', basis: 'Built something else.', identity: { sourceDigest: digest('ff'), lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } }),
    /identity is append-only: sourceDigest/,
  );
  // Re-stating the same value is not drift; only a different value is.
  assert.equal(
    advanceArtifactRevision(materialized, 'buildable', { actor: 'builder', basis: 'Built.', identity: { sourceDigest: SOURCE, lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } }).lifecycleState,
    'buildable',
  );
  const buildable = advanceArtifactRevision(materialized, 'buildable', { actor: 'builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } });
  assert.throws(
    () => advanceArtifactRevision(buildable, 'behavior-verified', { actor: 'journey-runner', basis: 'Journeys passed on a different npm.', evidenceRefs: ['journey-1'], identity: { toolchain: { node: TOOLCHAIN.node, npm: '11.0.0' } } }),
    /identity is append-only: toolchain/,
  );
});

test('rework forks a child that re-earns the ladder, and supersedes the parent', () => {
  const behaviorVerified = advanceArtifactRevision(
    advanceArtifactRevision(
      advanceArtifactRevision(newRevision(), 'materialized', { actor: 'builder', basis: 'Generated.', identity: { sourceDigest: SOURCE } }),
      'buildable', { actor: 'builder', basis: 'Built.', identity: { lockDigest: LOCK, toolchain: TOOLCHAIN, outputDigest: OUTPUT } },
    ),
    'behavior-verified', { actor: 'journey-runner', basis: 'Journeys passed.', evidenceRefs: ['journey-1'] },
  );

  const { parent, child } = forkArtifactRevision(behaviorVerified, { actor: 'critic', basis: 'The enquiry form loses its error state on resubmit.' });
  assert.equal(parent.lifecycleState, 'superseded');
  assert.equal(child.parentRevisionId, parent.id);
  assert.equal(child.lifecycleState, 'contract-approved');
  assert.equal(child.identity.contractDigest, CONTRACT);
  assert.equal(child.identity.sourceDigest, null, 'the child inherits the approved contract and nothing it has not re-earned');
  assert.equal(child.identity.outputDigest, null);
  assert.deepEqual(validateContract('artifact-revision', child), []);
  assert.throws(() => advanceArtifactRevision(parent, 'quality-accepted', { actor: 'critic', basis: 'Accepting the superseded one.', evidenceRefs: ['verdict-1'] }), /is superseded and cannot advance/);
  assert.throws(() => forkArtifactRevision(parent, { actor: 'critic', basis: 'Again.' }), /cannot be reworked/);
});

test('dispositions are ends, and a published revision is superseded or withdrawn rather than rejected', () => {
  for (const disposition of ARTIFACT_TERMINAL_DISPOSITIONS) {
    const disposed = disposeArtifactRevision(newRevision(), disposition, { actor: 'owner', basis: 'Stopped here.' });
    assert.equal(disposed.lifecycleState, disposition);
    assert.deepEqual(nextArtifactStates(disposition), []);
    assert.equal(describeArtifactState(disposition).success, false);
    assert.throws(() => disposeArtifactRevision(disposed, 'withdrawn', { actor: 'owner', basis: 'Again.' }), /already/);
  }
  assert.throws(() => disposeArtifactRevision(fullyReleased(), 'rejected', { actor: 'critic', basis: 'Too late.' }), /A released revision cannot be rejected/);
  assert.equal(disposeArtifactRevision(fullyReleased(), 'withdrawn', { actor: 'owner', basis: 'Taken down.' }).lifecycleState, 'withdrawn');
});

test('legacy `verified` does not become `buildable`', () => {
  const projected = projectLegacyProjectState({ state: 'verified', sourceDigest: SOURCE });
  assert.equal(projected.lifecycleState, 'materialized');
  assert.notEqual(projected.lifecycleState, 'buildable');
  assert.match(projected.basis, /npm install/);
  assert.deepEqual(projected.missing, ['lockDigest', 'toolchain', 'outputDigest']);
});

test('legacy fixtures project honestly and never above their evidence', () => {
  const cases = [
    [{ state: 'draft' }, null],
    [{ state: 'ready' }, null],
    [{ state: 'ready', approvedBuildPlanId: 'plan-1', contractDigest: CONTRACT }, 'contract-approved'],
    [{ state: 'ready', approvedBuildPlanId: 'plan-1' }, null],
    [{ state: 'generating' }, null],
    [{ state: 'failed' }, null],
    [{ state: 'generated', workspacePath: '/workspaces/x' }, null],
    [{ state: 'generated', sourceDigest: SOURCE }, 'materialized'],
    [{ state: 'verified', workspacePath: '/workspaces/x' }, null],
    [{ state: 'verified', sourceDigest: SOURCE }, 'materialized'],
    [{ state: 'launchable' }, null],
    [{}, null],
  ];
  for (const [legacy, expected] of cases) {
    const projected = projectLegacyProjectState(legacy);
    assert.equal(projected.lifecycleState, expected, `legacy ${JSON.stringify(legacy)} should project to ${expected}`);
    assert.ok(projected.basis.length > 0, 'a projection always says why');
    if (projected.lifecycleState !== null) assert.ok(ARTIFACT_LIFECYCLE_STATES.includes(projected.lifecycleState));
  }
});

test('every state says what it does not mean, and only the terminal success state is terminal', () => {
  for (const state of ARTIFACT_LIFECYCLE_STATES) {
    const described = describeArtifactState(state);
    assert.ok(described.meaning.length > 0);
    assert.ok(described.notMeaning.length > 0, `${state} must state what it does not mean`);
    assert.equal(described.terminal, state === 'production-verified');
  }
  assert.throws(() => describeArtifactState('launchable'), /Unknown artifact lifecycle state/);
  assert.throws(() => advanceArtifactRevision(newRevision(), 'launchable', { actor: 'x', basis: 'y' }), /Unknown artifact lifecycle state/);
});
