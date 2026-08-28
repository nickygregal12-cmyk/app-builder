/**
 * What the deterministic pipeline rehearsal is allowed to prove.
 *
 * The happy path is one test here and the least interesting one. The rest are
 * refusals, because a rehearsal that only demonstrates a pipeline running
 * straight through proves that the stub can produce artifact names — which is
 * not a property anybody needs.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';

import { evaluateHandoff, selectPipeline } from '../packages/control-plane/src/roles.js';
import { assertStageAssignment, projectPipelineProgress, reworkStageForRole } from '../packages/control-plane/src/pipeline-state.js';
import { createPipelineRehearsal, foldRehearsalLedger } from './lib/pipeline-rehearsal.mjs';
import { deterministicSpecialistResult } from './lib/rehearsal-specialist.mjs';
import { deterministicSeedArtifacts, loadRegistries, rehearsalImage, runRehearsal } from './pipeline-rehearsal.mjs';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const registries = loadRegistries(readJson);
const PIPELINE = selectPipeline('marketing-site', registries.pipelines.pipelines);
const SEEDS = deterministicSeedArtifacts(registries.roles);
const IMAGE = rehearsalImage();

function validator(schemaRelative) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(readJson(schemaRelative));
}

let scratchIndex = 0;
function scratchRoot() {
  scratchIndex += 1;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `pipeline-rehearsal-${scratchIndex}-`));
  return directory;
}

function rehearsal(overrides = {}) {
  return createPipelineRehearsal({
    projectId: 'test-project',
    projectType: 'marketing-site',
    stateRoot: scratchRoot(),
    registries,
    seedArtifacts: SEEDS,
    image: IMAGE,
    ...overrides,
  });
}

const supervised = { humanApprovals: ['intake'] };

// ---------------------------------------------------------------------------
// The durable-state projection
// ---------------------------------------------------------------------------

test('the next stage is resolved from durable artifacts, not from position alone', () => {
  const nothingDone = projectPipelineProgress({ pipeline: PIPELINE, availableArtifactKinds: [], completedStageIds: [] });
  assert.equal(nothingDone.nextStage, null, 'intake requires artifacts that do not exist yet');
  assert.deepEqual(nothingDone.blockers, ['missing-prerequisite:intake:BuildContract', 'missing-prerequisite:intake:ProjectManifest']);
  assert.equal(nothingDone.stopReason, 'stage-not-runnable');

  const ready = projectPipelineProgress({
    pipeline: PIPELINE,
    availableArtifactKinds: ['BuildContract', 'ProjectManifest'],
    completedStageIds: [],
  });
  assert.equal(ready.nextStageId, 'intake');
  assert.equal(ready.stages[0].status, 'ready');
  assert.equal(ready.stages[1].status, 'pending');
});

test('a blocked stage is never stepped over to find one that can run', () => {
  // Everything `research` needs is missing, but everything the stage *after* it
  // needs is present. The registry's ordering is the organisation's decision.
  const progress = projectPipelineProgress({
    pipeline: PIPELINE,
    availableArtifactKinds: ['BuildContract', 'ProjectManifest', 'IntakeBrief', 'ResearchPack'],
    completedStageIds: ['intake'],
  });
  assert.equal(progress.nextStage, null);
  assert.deepEqual(progress.blockers, ['missing-prerequisite:research:KnowledgePack']);
  assert.equal(progress.stages.find((stage) => stage.id === 'discovery').status, 'pending');
});

test('durable state claiming a stage completed without its artifact is refused, not resumed onto', () => {
  const progress = projectPipelineProgress({
    pipeline: PIPELINE,
    availableArtifactKinds: ['BuildContract', 'ProjectManifest'],
    completedStageIds: ['intake'],
  });
  assert.ok(progress.blockers.includes('stage-evidence-missing:intake:IntakeBrief'));
  assert.equal(progress.nextStage, null, 'a hole in the record is not something to walk forward from');
});

test('a completed stage the registry does not contain is an error, not something to ignore', () => {
  assert.throws(
    () => projectPipelineProgress({ pipeline: PIPELINE, availableArtifactKinds: [], completedStageIds: ['not-a-stage'] }),
    /has no such stage/,
  );
});

test('a specialist may only execute the stage the registry assigns to it', () => {
  const stage = PIPELINE.stages.find((entry) => entry.id === 'research');
  assert.deepEqual(assertStageAssignment({ stage, roleId: 'research-agent' }).roleId, 'research-agent');
  assert.throws(() => assertStageAssignment({ stage, roleId: 'security' }), /owned by research-agent/);
});

test('rework routes to a stage the role owns, and says so when no such stage exists', () => {
  const routed = reworkStageForRole({ pipeline: PIPELINE, roleId: 'brand-research', beforeStageId: 'art-direction' });
  assert.equal(routed.stage.id, 'brand');
  const unroutable = reworkStageForRole({ pipeline: PIPELINE, roleId: 'runtime-debug', beforeStageId: 'art-direction' });
  assert.equal(unroutable.stage, null);
  assert.equal(unroutable.reason, 'rework-role-owns-no-stage:runtime-debug');
});

// ---------------------------------------------------------------------------
// Artifact scope
// ---------------------------------------------------------------------------

test('an artifact outside the stage scope blocks promotion exactly as a file outside a ChangeSet would', () => {
  const stage = PIPELINE.stages.find((entry) => entry.id === 'research');
  const result = evaluateHandoff({
    projectId: 'p',
    pipelineId: PIPELINE.id,
    stage,
    availableArtifactKinds: stage.requires,
    producedArtifacts: [{ kind: 'ResearchPack', ref: 'r1' }, { kind: 'SecurityReport', ref: 's1' }],
    verdict: { id: 'v', stageId: stage.id, reviewerRole: 'product-critic', authorRoles: ['research-agent'], verdict: 'pass' },
  });
  assert.equal(result.promoted, false);
  assert.deepEqual(result.blockers, ['undeclared-artifact:SecurityReport']);
});

test('the stub only ever writes what the stage and the role both declare', () => {
  const stage = PIPELINE.stages.find((entry) => entry.id === 'art-direction');
  const role = registries.roles.roles['art-direction'];
  const honest = deterministicSpecialistResult({ projectId: 'p', stage, role, contextPacket: { artifacts: [] } });
  assert.deepEqual(honest.artifacts.map((entry) => entry.kind), stage.produces);
  assert.ok(honest.checks.every((check) => check.status === 'pass'));

  const dishonest = deterministicSpecialistResult({ projectId: 'p', stage, role, contextPacket: { artifacts: [] }, fault: 'undeclared-artifact' });
  const failing = dishonest.checks.filter((check) => check.status === 'fail');
  assert.deepEqual(failing.map((check) => check.id), ['artifact-declared:SecurityReport']);
});

// ---------------------------------------------------------------------------
// Walking the registered pipeline
// ---------------------------------------------------------------------------

test('the registered marketing-site pipeline walks every stage in its own attempt', async () => {
  const run = await rehearsal(supervised).run();
  assert.equal(run.stop.reason, 'pipeline-stages-complete');
  assert.equal(run.stages.length, PIPELINE.stages.length);
  assert.deepEqual(run.stages.map((entry) => entry.stageId), PIPELINE.stages.map((stage) => stage.id));

  // A fresh attempt per specialist, not one conversation carried through the build.
  const attemptIds = new Set(run.stages.map((entry) => entry.attempt.attemptId));
  assert.equal(attemptIds.size, PIPELINE.stages.length);
  const grants = new Set(run.stages.map((entry) => entry.attempt.grantFingerprint));
  assert.equal(grants.size, PIPELINE.stages.length, 'each attempt is bound by its own grant');
  assert.ok(run.stages.every((entry) => entry.attempt.exitReason === 'completed'));

  // A checkpoint per promotion, and a durable next action on each.
  assert.equal(run.state.checkpoints.length, PIPELINE.stages.length);
  assert.equal(run.state.checkpoints.at(-1).nextAction, 'evaluate convergence');
});

test('every stage receives only the artifact kinds its role declares it reads', async () => {
  const run = await rehearsal(supervised).run();
  for (const stage of run.stages) {
    const role = registries.roles.roles[stage.creatorRole];
    for (const kind of stage.context.supplied) {
      assert.ok(role.reads.includes(kind), `${stage.creatorRole} was given ${kind}, which it does not read`);
    }
    for (const kind of stage.context.withheld) {
      assert.ok(!role.reads.includes(kind), `${stage.creatorRole} had ${kind} withheld but declares it`);
    }
    assert.ok(stage.context.withheld.length > 0, `${stage.stageId} withheld nothing, so bounded context proved nothing`);
    assert.equal(stage.context.overCeiling, false);
  }
});

test('capability reach is projected from the role and never asserted by the specialist', async () => {
  const run = await rehearsal(supervised).run();
  const byRole = new Map(run.stages.map((entry) => [entry.creatorRole, entry]));

  // A reader role with no mutation scope is granted no mutating capability.
  const reader = byRole.get('research-agent');
  assert.deepEqual(reader.capability.mutationScopes, []);
  assert.equal(reader.changeSet, null);

  // The implementation role has strictly more reach, and it comes from its scopes.
  const implementer = byRole.get('frontend-implementation');
  assert.ok(implementer.capability.granted.length > reader.capability.granted.length);
  assert.ok(implementer.capability.mutationScopes.length > 0);
  assert.deepEqual(implementer.changeSet.allowedFiles, registries.roles.roles['frontend-implementation'].mutationScopes);

  // And nothing anywhere got a model lane.
  assert.ok(run.stages.every((entry) => entry.capability.modelLane === null));
});

test('the specialist always claims to be finished and that claim never advances a stage', async () => {
  const run = await rehearsal({ ...supervised, faults: { research: { fault: 'missing-artifact' } } }).run();
  const blocked = run.stages.at(-1);
  assert.equal(blocked.result.declaresFinished, true);
  assert.equal(blocked.handoff.promoted, false);
  assert.deepEqual(blocked.handoff.blockers, ['missing-artifact:ResearchPack']);
  assert.equal(run.stop.reason, 'stage-blocked');
});

// ---------------------------------------------------------------------------
// Review, independence and rework
// ---------------------------------------------------------------------------

test('a stage behind a human gate does not advance without one', async () => {
  const run = await rehearsal().run();
  assert.equal(run.stop.reason, 'human-approval-required');
  assert.deepEqual(run.stages.at(-1).handoff.blockers, ['human-approval-required']);
  assert.deepEqual(run.state.completedStageIds, []);
});

test('a stage refuses to run when a prerequisite artifact does not exist', async () => {
  const run = await rehearsal({ ...supervised, seedArtifacts: SEEDS.filter((entry) => entry.kind !== 'KnowledgePack') }).run();
  assert.equal(run.stop.reason, 'stage-not-runnable');
  assert.deepEqual(run.stop.blockers, ['missing-prerequisite:research:KnowledgePack']);
  assert.deepEqual(run.state.completedStageIds, ['intake']);
});

test('a specialist cannot review its own stage', async () => {
  await assert.rejects(
    rehearsal({ ...supervised, reviewerOverrides: { research: 'research-agent' } }).run(),
    /Self-approval rejected/,
  );
});

test('a verdict from an unregistered reviewer promotes nothing', async () => {
  const run = await rehearsal({ ...supervised, reviewerOverrides: { research: 'ux-critic' } }).run();
  assert.equal(run.stop.reason, 'stage-blocked');
  assert.deepEqual(run.stages.at(-1).handoff.blockers, ['wrong-reviewer:ux-critic']);
});

test('dispatching the wrong specialist to a stage is refused before any work happens', async () => {
  await assert.rejects(
    rehearsal({ ...supervised, roleOverrides: { research: 'security' } }).run(),
    /Stage research is owned by research-agent/,
  );
});

test('a rework verdict routes backwards to the role that owns the fix and invalidates what followed', async () => {
  const engine = rehearsal({
    ...supervised,
    reviewScript: {
      'art-direction': {
        verdict: 'rework-required',
        severity: 'major',
        failingCriteria: ['correct, but generic and low-distinctiveness'],
        returnToRole: 'brand-research',
        iterations: [1],
      },
    },
  });
  const run = await engine.run();
  const reworked = run.stages.find((entry) => entry.rework);
  assert.equal(reworked.stageId, 'art-direction');
  assert.equal(reworked.rework.toStageId, 'brand');
  assert.equal(reworked.rework.role, 'brand-research');

  const sequence = run.stages.map((entry) => `${entry.stageId}#${entry.iteration}`);
  const start = sequence.indexOf('brand#1');
  assert.deepEqual(sequence.slice(start, start + 4), ['brand#1', 'art-direction#1', 'brand#2', 'art-direction#2']);
  assert.equal(run.stop.reason, 'pipeline-stages-complete');
});

test('a rework verdict naming a role no stage owns stops rather than guessing a stage', async () => {
  const run = await rehearsal({
    ...supervised,
    reviewScript: {
      research: { verdict: 'rework-required', severity: 'major', failingCriteria: ['out of scope'], returnToRole: 'runtime-debug' },
    },
  }).run();
  assert.equal(run.stop.reason, 'rework-role-owns-no-stage');
  assert.equal(run.stop.detail, 'rework-role-owns-no-stage:runtime-debug');
});

// ---------------------------------------------------------------------------
// Stopping
// ---------------------------------------------------------------------------

test('a reviewer that keeps returning work to its author stops on the no-progress budget', async () => {
  const run = await rehearsal({
    ...supervised,
    reviewScript: {
      research: { verdict: 'rework-required', severity: 'major', failingCriteria: ['claims are unsourced'], returnToRole: 'research-agent' },
    },
  }).run();
  assert.equal(run.stop.reason, 'no-progress-limit-reached');
  assert.equal(run.stop.kind, 'budget');
});

test('two stages reworking each other forever stop on the iteration budget', async () => {
  const run = await rehearsal({
    ...supervised,
    budget: { maxIterations: 6, maxNoProgressAttempts: 8 },
    reviewScript: {
      research: { verdict: 'rework-required', severity: 'major', failingCriteria: ['thin'], returnToRole: 'requirements-interviewer' },
    },
  }).run();
  assert.equal(run.stop.reason, 'iteration-budget-exhausted');
  assert.equal(run.state.attemptCount, 6);
  // The loop kept promoting stages; it never got further than it had already been.
  assert.equal(run.state.highWaterMark, 1);
});

test('every stage promoted is still not a converged project', async () => {
  const engine = rehearsal(supervised);
  const run = await engine.run();
  assert.equal(run.stop.reason, 'pipeline-stages-complete');

  const report = await engine.convergence();
  assert.equal(report.converged, false);
  assert.equal(report.stopReason, 'gate-not-run');
  assert.equal(report.gates.length, PIPELINE.requiredGates.length);
  assert.ok(report.gates.every((gate) => gate.status === 'not-run'));

  const task = await engine.finish(run.stop.reason);
  assert.equal(task.state, 'blocked');
  assert.notEqual(task.state, 'succeeded');
  assert.equal(task.stopReason, 'pipeline-stages-complete');
});

// ---------------------------------------------------------------------------
// Session loss and resume
// ---------------------------------------------------------------------------

test('a session lost mid-attempt is recorded lost and the pipeline resumes from the ledger alone', async () => {
  const stateRoot = scratchRoot();
  const config = { projectId: 'test-project', projectType: 'marketing-site', stateRoot, registries, seedArtifacts: SEEDS, image: IMAGE, ...supervised };

  const interrupted = await createPipelineRehearsal({ ...config, faults: { 'product-spec': { fault: 'session-lost', iterations: [1] } } }).run();
  assert.equal(interrupted.stop.reason, 'session-lost');
  assert.deepEqual(interrupted.state.incompleteAttempts.map((entry) => entry.attemptId), ['rehearsal-product-spec-i1']);

  // A second engine holding nothing the first knew. This is the restart.
  const restarted = createPipelineRehearsal({ ...config });
  const before = await restarted.state();
  assert.equal(before.completedStageIds.length, 3, 'three promoted stages recovered from the ledger');
  assert.equal(before.latestCheckpoint.nextAction, 'run stage product-spec');

  const reconciled = await restarted.reconcile(before);
  assert.deepEqual(reconciled.reconciled, ['rehearsal-product-spec-i1']);
  const after = await restarted.state();
  assert.equal(after.incompleteAttempts.length, 0, 'an orphan is resolved, never left ambiguous');

  const resumed = await restarted.run();
  assert.equal(resumed.stop.reason, 'pipeline-stages-complete');

  // The resumed project is indistinguishable from one that was never interrupted.
  const uninterrupted = await createPipelineRehearsal({ ...config, stateRoot: scratchRoot() }).run();
  assert.deepEqual(resumed.state.completedStageIds, uninterrupted.state.completedStageIds);
  const identities = (state) => state.artifacts.filter((entry) => entry.origin === 'deterministic-stub').map((entry) => `${entry.id}:${entry.hash}`);
  assert.deepEqual(identities(resumed.state), identities(uninterrupted.state));
});

test('the ledger is the only memory: folding it reproduces the engine state', async () => {
  const engine = rehearsal(supervised);
  const run = await engine.run();
  const { readEvents } = await import('../packages/control-plane/src/index.js');
  const folded = foldRehearsalLedger(await readEvents(engine.ledgerPath), PIPELINE);
  assert.deepEqual(folded.completedStageIds, run.state.completedStageIds);
  assert.equal(folded.attemptCount, run.state.attemptCount);
  assert.equal(folded.checkpoints.length, run.state.checkpoints.length);
});

// ---------------------------------------------------------------------------
// The durable records are the registered contracts
// ---------------------------------------------------------------------------

test('every verdict, handoff and convergence report the rehearsal writes validates against its schema', async () => {
  const engine = rehearsal({
    ...supervised,
    reviewScript: {
      'art-direction': {
        verdict: 'rework-required',
        severity: 'major',
        failingCriteria: ['correct, but generic and low-distinctiveness'],
        returnToRole: 'brand-research',
        iterations: [1],
      },
    },
  });
  await engine.run();
  const state = await engine.state();

  const verdictSchema = validator('schemas/review-verdict.schema.json');
  assert.ok(state.verdicts.length > 0);
  for (const verdict of state.verdicts) assert.ok(verdictSchema(verdict), JSON.stringify(verdictSchema.errors));

  const handoffSchema = validator('schemas/stage-handoff.schema.json');
  assert.ok(state.handoffs.length > 0);
  for (const handoff of state.handoffs) assert.ok(handoffSchema(handoff), JSON.stringify(handoffSchema.errors));

  const convergenceSchema = validator('schemas/convergence-report.schema.json');
  const report = await engine.convergence();
  assert.ok(convergenceSchema(report), JSON.stringify(convergenceSchema.errors));

  const checkpointSchema = validator('schemas/checkpoint.schema.json');
  for (const checkpoint of state.checkpoints) assert.ok(checkpointSchema(checkpoint), JSON.stringify(checkpointSchema.errors));
});

// ---------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------

test('the rehearsal command runs every scenario and holds its own invariants', async () => {
  const disabled = (relative) => (relative === 'config/model-execution.json'
    ? { ...readJson(relative), enabled: false }
    : readJson(relative));
  const report = await runRehearsal({ projectType: 'marketing-site', stateRoot: scratchRoot(), read: disabled });
  assert.equal(report.ok, true, JSON.stringify(report.invariants.filter((entry) => !entry.ok)));
  assert.equal(report.productEvidence, false);
  assert.equal(report.provider.providerCalls, 0);
  assert.equal(report.provider.attemptsWithModelLane, 0);
  assert.equal(report.provider.modelExecutionEnabled, false);

  // Most scenarios are refusals. If that stops being true, this stopped being evidence.
  const refusals = report.scenarios.filter((scenario) => scenario.stop.reason !== 'pipeline-stages-complete');
  assert.ok(refusals.length >= report.scenarios.length / 2, 'a rehearsal made mostly of happy paths proves little');
  for (const scenario of report.scenarios) assert.equal(scenario.stopMatchesExpectation, true, `${scenario.id} stopped for ${scenario.stop.reason}`);

  // Every registered creator role in the pipeline was actually exercised.
  const creators = [...new Set(PIPELINE.stages.map((stage) => stage.role))].sort();
  assert.deepEqual(report.rolesExercised, creators);
  assert.ok(report.reviewersExercised.includes('human'));

  // The pinned host image is still the operator's, and nothing invented a digest.
  assert.equal(report.taskImage.pinnedTaskImageDigest, readJson('config/task-images.json').images['task-baseline'].digest);
  if (!report.taskImage.pinnedTaskImageAvailable) assert.match(report.taskImage.operatorAction, /no recorded digest/);
});

test('the rehearsal refuses to run while real model spending is armed', async () => {
  assert.equal(readJson('config/model-execution.json').enabled, true, 'the committed switch must record the reviewed first-canary opt-in');
  const armed = (relative) => (relative === 'config/model-execution.json'
    ? { ...readJson(relative), enabled: true }
    : readJson(relative));
  await assert.rejects(
    runRehearsal({ projectType: 'marketing-site', stateRoot: scratchRoot(), read: armed }),
    /refuses to run while real spending is armed/,
  );
});
