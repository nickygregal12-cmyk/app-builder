import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContract } from '../packages/contracts/src/index.js';
import { detectIntakeBundleDrift, mergeQuestionnaires } from '../packages/factory-core/src/index.js';
import { hashArtifact, hashBuildContract, mintApprovedIntakeBundle, questionsFor, replayApprovedIntake } from '../apps/service/src/approved-intake.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { createFactoryHttpServer } from '../apps/service/src/http.js';

const NBM_BUNDLE = 'examples/genuine-business/nbm-approved-intake.v1.json';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function sampleIntake() {
  return {
    projectType: 'marketing-site',
    mode: 'standard',
    answers: {
      project_name: 'Replay Roofing',
      primary_goal: 'Generate qualified roofing enquiries',
      target_users: 'Homeowners in Glasgow',
      must_have: ['Understand services', 'Request a quote'],
      company_identity: { name: 'Replay Roofing', description: 'Residential roofing company.' },
      services: ['Roof repairs', 'New roofs'],
    },
    sourceReferences: [],
    capabilityDecisions: {},
  };
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

test('an approved intake bundle validates and carries approved intent, not generated output', () => {
  const bundle = mintApprovedIntakeBundle(sampleIntake());
  assert.deepEqual(validateContract('approved-intake-bundle', bundle), []);
  assert.equal(bundle.buildContract.status, 'approved');
  // The hash covers the decisions, not the moment of approval.
  assert.equal(bundle.buildContractHash, hashBuildContract(bundle.buildContract));
  assert.equal(bundle.buildContractHash, hashBuildContract({ ...bundle.buildContract, approvedAt: '2030-01-01T00:00:00.000Z' }));
  assert.equal(bundle.projectManifestHash, hashArtifact(bundle.projectManifest));
  // Everything needed to recreate the run without re-keying the questionnaire.
  assert.equal(bundle.questionnaire.version, '1.3.0');
  assert.equal(bundle.questionnaire.mode, 'standard');
  assert.ok(bundle.questionnaire.questionIds.includes('services'));
  assert.deepEqual(bundle.intake.answers.services, ['Roof repairs', 'New roofs']);
  // A default is a decision the operator did not make, and is recorded as one.
  assert.ok(bundle.intake.acceptedDefaults.some((entry) => entry.questionId === 'cost_priority'));
  // Nothing generated: a replay rebuilds, it does not restore.
  const serialised = JSON.stringify(bundle);
  for (const forbidden of ['workspacePath', 'compositionHash', 'buildRef', 'checkpoint']) {
    assert.equal(serialised.includes(forbidden), false, forbidden);
  }
});

test('replay is deterministic and rebuilds through the ordinary contract builders', () => {
  const bundle = mintApprovedIntakeBundle(sampleIntake());
  const first = replayApprovedIntake(bundle);
  const second = replayApprovedIntake(bundle);
  assert.equal(first.rebuiltManifestHash, second.rebuiltManifestHash);
  assert.equal(first.rebuiltContractHash, bundle.buildContractHash);
  assert.equal(first.rebuiltManifestHash, bundle.projectManifestHash);
  assert.deepEqual(first.drift, []);
  assert.equal(first.buildContract.status, 'approved');
  // The operator is shown what is reused in their own terms.
  assert.equal(first.reused.projectName, 'Replay Roofing');
  assert.equal(first.reused.totalQuestions > 0, true);
  assert.equal(first.reused.answeredQuestions > 0, true);
});

test('a questionnaire or schema that moved is refused, not coerced', () => {
  const bundle = mintApprovedIntakeBundle(sampleIntake());
  const { questions, projectTypesConfig } = questionsFor('marketing-site');

  const moved = { ...bundle, questionnaire: { ...bundle.questionnaire, version: '1.2.0' } };
  const versionDrift = detectIntakeBundleDrift(moved, { questions, questionnaireVersion: '1.3.0', projectTypesConfig });
  assert.equal(versionDrift.some((entry) => entry.code === 'questionnaire-version-changed' && entry.severity === 'blocking'), true);
  assert.throws(() => replayApprovedIntake(moved), /cannot be replayed/);

  const unanswered = { ...bundle, intake: { ...bundle.intake, answers: { ...bundle.intake.answers, services: [] } } };
  const requiredDrift = detectIntakeBundleDrift(unanswered, { questions, questionnaireVersion: '1.3.0', projectTypesConfig });
  assert.equal(requiredDrift.some((entry) => entry.code === 'required-question-unanswered' && entry.severity === 'blocking'), true);
  assert.throws(() => replayApprovedIntake(unanswered), /cannot be replayed/);

  const unsupported = { ...bundle, schemaVersion: 2 };
  assert.deepEqual(detectIntakeBundleDrift(unsupported, { questions, projectTypesConfig }).map((entry) => entry.code), ['bundle-schema-unsupported']);

  // A question that no longer exists leaves an inert answer behind, which is
  // worth saying and safe to proceed through.
  const retired = { ...bundle, questionnaire: { ...bundle.questionnaire, questionIds: [...bundle.questionnaire.questionIds, 'question_that_was_retired'] } };
  const retiredDrift = detectIntakeBundleDrift(retired, { questions, questionnaireVersion: '1.3.0', projectTypesConfig });
  assert.deepEqual(retiredDrift.map((entry) => [entry.code, entry.severity]), [['question-removed', 'notice']]);

  const olderEngine = { ...bundle, provenance: { ...bundle.provenance, factoryEngineVersion: 1 } };
  const engineDrift = detectIntakeBundleDrift(olderEngine, { questions, questionnaireVersion: '1.3.0', projectTypesConfig });
  assert.equal(engineDrift.some((entry) => entry.code === 'factory-engine-changed' && entry.severity === 'notice'), true);
});

test('the committed nbm acceptance intake replays without re-keying the questionnaire', () => {
  const bundle = read(NBM_BUNDLE);
  assert.deepEqual(validateContract('approved-intake-bundle', bundle), []);

  // This bundle is an explicitly versioned replacement for an intake that was
  // never persisted. It must keep saying so rather than passing itself off as
  // the original approval.
  assert.equal(bundle.provenance.producedBy, 'operator-authored');
  assert.match(bundle.provenance.replacesUnrecoverableIntake.reason, /never persisted/);
  assert.ok(bundle.provenance.replacesUnrecoverableIntake.baselineFrom.includes('examples/genuine-business/nbm-genuine-business-acceptance.xlsx'));

  const replayed = replayApprovedIntake(bundle);
  assert.deepEqual(replayed.drift, [], 'the committed baseline must replay against the current questionnaire');
  assert.equal(replayed.rebuiltContractHash, bundle.buildContractHash);
  assert.equal(replayed.rebuiltManifestHash, bundle.projectManifestHash);
  assert.equal(replayed.projectManifest.project.name, 'nbm Construction Cost Consultants');
  assert.equal(replayed.projectManifest.company.identity.legalName, 'NBM CONSTRUCTION COST CONSULTANTS LIMITED');
  assert.deepEqual(replayed.projectManifest.company.services, [
    'Cost Consultancy and Quantity Surveying',
    'Employer’s Agent',
    'Project Management',
    'Building Surveying and Defect Analysis',
  ]);

  // The approval covers the workbook. The public site stays reference-only:
  // public visibility is not a republication right.
  const website = bundle.intake.sourceReferences.find((source) => source.uri === 'https://www.nbm.bz/');
  assert.equal(website.rightsStatus, 'reference-only');
  assert.equal(website.publishUseAllowed, false);
  const workbook = bundle.intake.sourceReferences.find((source) => source.kind === 'spreadsheet');
  assert.equal(workbook.rightsStatus, 'approved-for-use');

  // Nothing the workbook cannot support is asserted as company proof.
  assert.deepEqual(replayed.projectManifest.company.trustSignals ?? [], []);
});

test('replaying an approved intake produces a fresh run, never a restored one', async () => {
  const dirs = roots('app-builder-intake-replay-');
  const store = new FactoryStore(dirs);
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot });
  try {
    const bundle = read(NBM_BUNDLE);
    const first = await service.replayIntakeBundle(bundle);
    const second = await service.replayIntakeBundle(bundle);

    // Same approved intent, different runs.
    assert.notEqual(first.project.id, second.project.id);
    for (const result of [first, second]) {
      assert.equal(result.project.state, 'ready');
      assert.equal(result.project.workspacePath, null);
      assert.equal(service.listTasks(result.project.id).length, 0);
      assert.equal(service.listCheckpoints(result.project.id).length, 0);
      assert.equal(service.listRenderedEvidence(result.project.id).length, 0);
      assert.deepEqual(result.drift, []);
      assert.equal(result.reused.bundleId, bundle.bundleId);
    }
    assert.deepEqual(service.getManifest(first.project.id), service.getManifest(second.project.id));

    // The run records its own bundle, pointing back at the approval it came
    // from without claiming to be it.
    const recorded = service.getIntakeBundle(first.project.id);
    assert.notEqual(recorded.bundleId, bundle.bundleId);
    assert.equal(recorded.provenance.producedBy, 'service-replay');
    assert.equal(recorded.provenance.replayedFromBundleId, bundle.bundleId);
    assert.deepEqual(recorded.intake.answers, bundle.intake.answers);
    assert.deepEqual(validateContract('approved-intake-bundle', recorded), []);
    assert.equal(service.getProject(first.project.id).approvedIntakeBundleId, recorded.bundleId);

    // The replay is on the durable ledger, so a later session can see that this
    // run reused an earlier approval rather than starting from a fresh intake.
    const events = service.listEvents(first.project.id);
    assert.equal(events.some((event) => event.type === 'intake.replayed'), true);
  } finally {
    await service.close();
    store.close();
  }
});

test('the product exposes approve, replay and read for approved intake', async () => {
  const dirs = roots('app-builder-intake-http-');
  const store = new FactoryStore(dirs);
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot });
  const server = createFactoryHttpServer({ service, servicePort: 4310 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (pathname, body) => fetch(`${origin}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const approved = await post('/intake-bundles', { intake: sampleIntake() });
    assert.equal(approved.status, 201);
    const { bundle } = await approved.json();
    assert.deepEqual(validateContract('approved-intake-bundle', bundle), []);

    const replayed = await post('/intake-bundles/replay', { bundle });
    assert.equal(replayed.status, 201);
    const result = await replayed.json();
    assert.equal(result.project.state, 'ready');
    assert.equal(result.reused.projectName, 'Replay Roofing');

    const stored = await fetch(`${origin}/projects/${encodeURIComponent(result.project.id)}/intake-bundle`);
    assert.equal(stored.status, 200);
    assert.deepEqual((await stored.json()).bundle.intake.answers, bundle.intake.answers);

    // A bundle this factory cannot honour is the caller's problem to see.
    const refused = await post('/intake-bundles/replay', { bundle: { ...bundle, schemaVersion: 9 } });
    assert.equal(refused.status, 400);

    // Intake that is not actually approvable never becomes a durable record.
    const incomplete = await post('/intake-bundles', { intake: { ...sampleIntake(), answers: { project_name: 'Nameless' } } });
    assert.equal(incomplete.status, 400);
  } finally {
    server.close();
    await service.close();
    store.close();
  }
});

test('the committed nbm bundle is exactly what its builder produces', () => {
  const questionnaires = questionsFor('marketing-site');
  assert.equal(questionnaires.questionnaireVersion, read(NBM_BUNDLE).questionnaire.version);
  // Guard the merge the bundle was authored against, so a questionnaire edit
  // that changes the nbm baseline is noticed here rather than mid-trial.
  const base = read('questionnaires/v1/base.json');
  const specific = read('questionnaires/v1/business-site.json');
  assert.equal(mergeQuestionnaires(base, specific).length, questionnaires.questions.length);

  // A committed acceptance input that cannot be regenerated is a fixture
  // nobody can check. Rebuild it and require the same bytes.
  const rebuilt = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'app-builder-nbm-intake-')), 'rebuilt.json');
  const result = spawnSync(process.execPath, ['examples/genuine-business/build-nbm-intake-bundle.mjs', rebuilt], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(rebuilt, 'utf8'), fs.readFileSync(NBM_BUNDLE, 'utf8'));
});
