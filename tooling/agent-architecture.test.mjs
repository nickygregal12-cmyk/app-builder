import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  assertMutationAllowed,
  assertReviewIndependence,
  buildRoleContextPacket,
  createReviewVerdict,
  evaluateConvergence,
  evaluateHandoff,
  nextStage,
  planRework,
  selectPipeline,
} from '../packages/control-plane/src/roles.js';

const root = process.cwd();
const fixed = '2026-08-25T11:30:00.000Z';

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

const roleRegistry = readJson('config/agent-roles.json');
const pipelineRegistry = readJson('config/agent-pipelines.json');
const skillRegistry = readJson('config/skill-registry.json');
const sourceRegistry = readJson('config/external-sources.json');
const policies = readJson('config/agent-policies.json');
const routes = readJson('config/agent-routing.json');
const projectTypes = readJson('config/project-types.json');

const ROLES = roleRegistry.roles;
const ARTIFACTS = roleRegistry.artifacts;
const GATES = pipelineRegistry.gates;
const PIPELINES = pipelineRegistry.pipelines;

function validator(schemaRelative) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(readJson(schemaRelative));
}

test('every registered role validates against the AgentRoleSpec schema', () => {
  const validate = validator('schemas/agent-role.schema.json');
  for (const [id, role] of Object.entries(ROLES)) {
    assert.equal(role.id, id, `role key ${id} must match its id`);
    assert.ok(validate(role), `role ${id} is invalid: ${JSON.stringify(validate.errors)}`);
  }
});

test('roles reference real policies, routes, skills, artifacts and prior art', () => {
  for (const [id, role] of Object.entries(ROLES)) {
    assert.ok(policies.policies[role.policyId], `role ${id} references unknown policy ${role.policyId}`);
    const route = routes.routes[role.routeId];
    assert.ok(route, `role ${id} references unknown route ${role.routeId}`);
    assert.ok(
      role.contextCeilingTokens <= route.maxTokens,
      `role ${id} ceiling ${role.contextCeilingTokens} exceeds route ${role.routeId} ceiling ${route.maxTokens}`,
    );
    for (const skill of role.skills) {
      assert.ok(skillRegistry.skills[skill], `role ${id} requests unregistered skill ${skill}`);
    }
    for (const kind of [...role.reads, ...role.writes]) {
      assert.ok(ARTIFACTS[kind], `role ${id} references unregistered artifact ${kind}`);
    }
    for (const source of role.priorArt) {
      assert.ok(sourceRegistry.sources[source], `role ${id} references unregistered external source ${source}`);
    }
    assert.ok(role.stopCriteria.length > 0, `role ${id} must declare stop criteria`);
  }
});

test('reviewers never author what they judge and creators never approve themselves', () => {
  for (const [id, role] of Object.entries(ROLES)) {
    if (role.kind === 'reviewer') {
      assert.deepEqual(
        role.writes.filter((kind) => !['ReviewVerdict', 'ReleaseDecision', 'RenderedEvidence', 'RuntimeDiagnostics', 'AccessibilityReport', 'PerformanceReport', 'SeoReport', 'SecurityReport'].includes(kind)),
        [],
        `reviewer ${id} must only write verdicts, decisions and evidence reports`,
      );
      assert.deepEqual(role.mutationScopes, [], `reviewer ${id} must not own repository mutation scope`);
      assert.deepEqual(role.reviewedBy, [], `reviewer ${id} does not itself need a reviewer`);
    } else {
      assert.ok(role.reviewedBy.length > 0, `creator ${id} must declare an independent reviewer`);
      assert.ok(!role.reviewedBy.includes(id), `creator ${id} cannot review itself`);
      for (const reviewer of role.reviewedBy) {
        if (reviewer === 'human') continue;
        assert.ok(ROLES[reviewer], `creator ${id} names unknown reviewer ${reviewer}`);
        assert.equal(ROLES[reviewer].kind, 'reviewer', `creator ${id} names non-reviewer ${reviewer}`);
      }
      assert.ok(!role.writes.includes('ReviewVerdict'), `creator ${id} must not issue review verdicts`);
    }
  }
});

test('every declared artifact has a producer and every mutation-capable role has a write policy', () => {
  const written = new Set(Object.values(ROLES).flatMap((role) => role.writes));
  for (const [kind, artifact] of Object.entries(ARTIFACTS)) {
    assert.ok(
      artifact.deterministic === true || written.has(kind),
      `artifact ${kind} has no producing role and is not deterministic`,
    );
    if (artifact.schema) {
      assert.ok(fs.existsSync(path.join(root, artifact.schema)), `artifact ${kind} references missing schema ${artifact.schema}`);
    }
  }
  for (const [id, role] of Object.entries(ROLES)) {
    if (role.mutationScopes.length === 0) continue;
    const policy = policies.policies[role.policyId];
    assert.ok(policy.allow.includes('repo.write'), `role ${id} declares mutation scope without a repo.write policy`);
  }
});

test('pipelines exist for every first-class project type and cover every registered role', () => {
  for (const projectType of Object.keys(projectTypes.projectTypes)) {
    assert.ok(PIPELINES[projectType], `no specialist pipeline for project type ${projectType}`);
  }
  const seen = new Set();
  for (const pipeline of Object.values(PIPELINES)) {
    for (const stage of pipeline.stages) {
      seen.add(stage.role);
      if (stage.reviewer && stage.reviewer !== 'human') seen.add(stage.reviewer);
    }
    for (const role of pipeline.onDemandRoles) seen.add(role);
  }
  const orphans = Object.keys(ROLES).filter((id) => !seen.has(id));
  assert.deepEqual(orphans, [], `registered roles never used by any pipeline: ${orphans.join(', ')}`);
});

test('pipeline stages satisfy the no-self-approval and prerequisite ordering rules', () => {
  for (const [pipelineId, pipeline] of Object.entries(PIPELINES)) {
    const available = new Set(Object.entries(ARTIFACTS).filter(([, a]) => a.deterministic).map(([kind]) => kind));
    const stageIds = new Set();
    for (const stage of pipeline.stages) {
      assert.ok(!stageIds.has(stage.id), `${pipelineId} repeats stage id ${stage.id}`);
      stageIds.add(stage.id);
      const role = ROLES[stage.role];
      assert.ok(role, `${pipelineId}/${stage.id} references unknown role ${stage.role}`);

      if (role.kind === 'creator') {
        assert.ok(stage.reviewer, `${pipelineId}/${stage.id} has a creator with no reviewer`);
        assert.notEqual(stage.reviewer, stage.role, `${pipelineId}/${stage.id} lets a role approve itself`);
        assert.ok(
          role.reviewedBy.includes(stage.reviewer),
          `${pipelineId}/${stage.id} reviewer ${stage.reviewer} is not declared in ${stage.role}.reviewedBy`,
        );
        if (stage.reviewer !== 'human') {
          assert.equal(ROLES[stage.reviewer].kind, 'reviewer', `${pipelineId}/${stage.id} reviewer must be a reviewer role`);
        }
      } else {
        assert.equal(stage.reviewer, null, `${pipelineId}/${stage.id} is a reviewer stage and must not carry its own reviewer`);
      }

      for (const kind of stage.requires) {
        assert.ok(available.has(kind), `${pipelineId}/${stage.id} requires ${kind} before any stage produces it`);
      }
      for (const kind of stage.produces) {
        assert.ok(role.writes.includes(kind), `${pipelineId}/${stage.id} produces ${kind} outside ${stage.role}.writes`);
        available.add(kind);
      }
    }
  }
});

test('every required gate is evaluated and routed to a creator role inside its own pipeline', () => {
  for (const [pipelineId, pipeline] of Object.entries(PIPELINES)) {
    const present = new Set();
    for (const stage of pipeline.stages) {
      present.add(stage.role);
      if (stage.reviewer && stage.reviewer !== 'human') present.add(stage.reviewer);
    }
    for (const gateId of pipeline.requiredGates) {
      const gate = GATES[gateId];
      assert.ok(gate, `${pipelineId} requires unregistered gate ${gateId}`);
      if (gate.evaluatedBy !== 'deterministic') {
        assert.equal(ROLES[gate.evaluatedBy]?.kind, 'reviewer', `gate ${gateId} must be evaluated by a reviewer or deterministically`);
        assert.ok(present.has(gate.evaluatedBy), `${pipelineId} requires gate ${gateId} but never runs its evaluator ${gate.evaluatedBy}`);
      }
      const reworkRole = pipeline.reworkOverrides[gateId] ?? gate.defaultReworkRole;
      assert.equal(ROLES[reworkRole]?.kind, 'creator', `gate ${gateId} must route rework to a creator role`);
      assert.ok(present.has(reworkRole), `${pipelineId} routes gate ${gateId} rework to absent role ${reworkRole}`);
    }
    for (const gateId of Object.keys(pipeline.reworkOverrides)) {
      assert.ok(pipeline.requiredGates.includes(gateId), `${pipelineId} overrides rework for unused gate ${gateId}`);
    }
  }
});

test('internal tools are not routed through marketing, brand or research specialists', () => {
  const internal = PIPELINES['internal-tool'].stages.map((stage) => stage.role);
  for (const role of ['marketing-content', 'brand-research', 'art-direction', 'seo-aeo', 'research-agent']) {
    assert.ok(!internal.includes(role), `internal-tool pipeline should not spend context on ${role}`);
  }
  const marketing = PIPELINES['marketing-site'].stages.map((stage) => stage.role);
  for (const role of ['marketing-content', 'brand-research', 'art-direction', 'seo-aeo']) {
    assert.ok(marketing.includes(role), `marketing-site pipeline must include ${role}`);
  }
});

test('skills validate, stay bounded and cannot be promoted ahead of their prior art', () => {
  const validate = validator('schemas/skill-registration.schema.json');
  for (const [id, skill] of Object.entries(skillRegistry.skills)) {
    assert.equal(skill.id, id);
    assert.ok(validate(skill), `skill ${id} is invalid: ${JSON.stringify(validate.errors)}`);
    for (const source of skill.priorArt) {
      const entry = sourceRegistry.sources[source];
      assert.ok(entry, `skill ${id} references unregistered source ${source}`);
      if (skill.lifecycle === 'proven') {
        assert.equal(entry.adoption, 'adopted-pinned', `proven skill ${id} depends on unpinned source ${source}`);
        assert.equal(entry.securityReview, 'passed', `proven skill ${id} depends on unreviewed source ${source}`);
      }
    }
    if (['evaluated', 'proven'].includes(skill.lifecycle)) {
      assert.notEqual(skill.evaluation.status, 'not-evaluated', `skill ${id} claims ${skill.lifecycle} without evaluation evidence`);
      assert.ok(skill.evaluation.benchmarkCases.length > 0, `skill ${id} claims ${skill.lifecycle} without benchmark cases`);
    }
    if (skill.lifecycle !== 'planned') {
      assert.ok(skill.path, `skill ${id} beyond planned must point at an authored SKILL.md`);
    }
  }
  const requested = new Set(Object.values(ROLES).flatMap((role) => role.skills));
  for (const id of Object.keys(skillRegistry.skills)) {
    assert.ok(requested.has(id), `skill ${id} is registered but no role requests it`);
  }
});

test('external sources are governed: registration is not adoption', () => {
  const validate = validator('schemas/external-source.schema.json');
  for (const [id, source] of Object.entries(sourceRegistry.sources)) {
    assert.equal(source.id, id);
    assert.ok(validate(source), `source ${id} is invalid: ${JSON.stringify(validate.errors)}`);
    assert.equal(source.instructionAuthority, 'none', `source ${id} must remain data, not authority`);
    if (source.adoption === 'adopted-pinned') {
      assert.ok(source.pinnedRef, `adopted source ${id} must be pinned to a commit or tag`);
      assert.equal(source.securityReview, 'passed', `adopted source ${id} must have passed security review`);
      assert.ok(source.license, `adopted source ${id} must record a licence`);
    } else {
      assert.deepEqual(source.allowedRoles, [], `only an adopted-pinned source may be loaded by a role (${id})`);
    }
    for (const role of source.allowedRoles) {
      assert.ok(ROLES[role], `source ${id} allows unknown role ${role}`);
    }
  }
});

test('a creator cannot issue the verdict on its own artifact', () => {
  assert.throws(
    () => assertReviewIndependence({ reviewerRole: 'art-direction', authorRoles: ['art-direction'] }),
    /Self-approval rejected/,
  );
  assert.throws(
    () => createReviewVerdict({
      projectId: 'p1',
      stageId: 'art-direction',
      artifactKind: 'ArtDirectionPlan',
      reviewerRole: 'art-direction',
      authorRoles: ['art-direction'],
      verdict: 'pass',
    }, fixed),
    /Self-approval rejected/,
  );
});

test('rework verdicts are typed, routed and cannot be empty complaints', () => {
  assert.throws(() => createReviewVerdict({
    projectId: 'p1', stageId: 'ux-flows', artifactKind: 'UXFlowSpec',
    reviewerRole: 'ux-critic', authorRoles: ['ux-interaction'], verdict: 'rework-required',
  }, fixed), /must name at least one failing criterion/);

  assert.throws(() => createReviewVerdict({
    projectId: 'p1', stageId: 'ux-flows', artifactKind: 'UXFlowSpec',
    reviewerRole: 'ux-critic', authorRoles: ['ux-interaction'], verdict: 'rework-required',
    failingCriteria: ['recovery-path-missing'],
  }, fixed), /returnToRole is required/);

  const verdict = createReviewVerdict({
    projectId: 'p1', stageId: 'ux-flows', artifactKind: 'UXFlowSpec',
    reviewerRole: 'ux-critic', authorRoles: ['ux-interaction'], verdict: 'rework-required',
    failingCriteria: ['recovery-path-missing'], returnToRole: 'information-architect',
    requiredChanges: ['Provide a recovery route from the failed payment state.'], severity: 'major',
  }, fixed);
  assert.equal(verdict.returnToRole, 'information-architect');
  assert.equal(verdict.severity, 'major');

  const validate = validator('schemas/review-verdict.schema.json');
  assert.ok(validate(verdict), JSON.stringify(validate.errors));
});

test('a stage is not promoted because an agent says it is finished', () => {
  const pipeline = selectPipeline('marketing-site', PIPELINES);
  const stage = pipeline.stages.find((entry) => entry.id === 'art-direction');
  const base = {
    projectId: 'p1',
    pipelineId: pipeline.id,
    stage,
    availableArtifactKinds: stage.requires,
    requiredEvidence: ['RenderedEvidence'],
    requiredChecks: ['design-lint'],
  };

  const claimedDone = evaluateHandoff({ ...base, producedArtifacts: [], evidence: [], deterministicChecks: [] }, fixed);
  assert.equal(claimedDone.promoted, false);
  assert.ok(claimedDone.blockers.includes('missing-artifact:ArtDirectionPlan'));
  assert.ok(claimedDone.blockers.includes('missing-evidence:RenderedEvidence'));
  assert.ok(claimedDone.blockers.includes('check-not-run:design-lint'));
  assert.ok(claimedDone.blockers.includes('review-verdict-missing'));
  assert.equal(claimedDone.nextStageId, null);

  const selfApproved = evaluateHandoff({
    ...base,
    producedArtifacts: [{ kind: 'ArtDirectionPlan', ref: 'a1' }, { kind: 'ImagePlan', ref: 'i1' }],
    evidence: [{ kind: 'RenderedEvidence', ref: 'shot-1' }],
    deterministicChecks: [{ id: 'design-lint', status: 'pass' }],
    verdict: { id: 'v1', stageId: stage.id, reviewerRole: 'art-direction', authorRoles: ['art-direction'], verdict: 'pass' },
  }, fixed);
  assert.equal(selfApproved.promoted, false);
  assert.ok(selfApproved.blockers.includes('wrong-reviewer:art-direction'));
  assert.ok(selfApproved.blockers.includes('self-approval-rejected'));

  const promoted = evaluateHandoff({
    ...base,
    nextStageId: 'design-system',
    producedArtifacts: [{ kind: 'ArtDirectionPlan', ref: 'a1' }, { kind: 'ImagePlan', ref: 'i1' }],
    evidence: [{ kind: 'RenderedEvidence', ref: 'shot-1' }],
    deterministicChecks: [{ id: 'design-lint', status: 'pass' }],
    verdict: { id: 'v1', stageId: stage.id, reviewerRole: 'visual-critic', authorRoles: ['art-direction'], verdict: 'pass-with-observations' },
  }, fixed);
  assert.equal(promoted.promoted, true);
  assert.equal(promoted.approvedBy, 'visual-critic');
  assert.equal(promoted.nextStageId, 'design-system');

  const validate = validator('schemas/stage-handoff.schema.json');
  assert.ok(validate(promoted), JSON.stringify(validate.errors));
});

test('a failed deterministic check blocks promotion even with a passing verdict', () => {
  const pipeline = PIPELINES['marketing-site'];
  const stage = pipeline.stages.find((entry) => entry.id === 'frontend');
  const result = evaluateHandoff({
    projectId: 'p1',
    pipelineId: pipeline.id,
    stage,
    availableArtifactKinds: stage.requires,
    producedArtifacts: [{ kind: 'ChangeSet', ref: 'cs-1' }],
    requiredChecks: ['unit-tests'],
    deterministicChecks: [{ id: 'unit-tests', status: 'fail' }],
    verdict: { id: 'v2', stageId: stage.id, reviewerRole: 'code-reviewer', authorRoles: ['frontend-implementation'], verdict: 'pass' },
  }, fixed);
  assert.equal(result.promoted, false);
  assert.deepEqual(result.blockers, ['check-failed:unit-tests']);
});

test('convergence routes each failing gate to the role that owns it', () => {
  const pipeline = PIPELINES['marketing-site'];
  const results = Object.fromEntries(pipeline.requiredGates.map((gate) => [gate, { status: 'pass' }]));
  results.visual = { status: 'pass', score: 7.4 };
  results.security = { status: 'fail', severity: 'blocker', failingCriteria: ['missing-csp'] };
  results.launchability = { status: 'fail', failingCriteria: ['no-rollback-plan'] };

  const report = evaluateConvergence({
    projectId: 'p1', pipeline, gates: GATES, results, iteration: 3,
  }, fixed);

  assert.equal(report.converged, false);
  assert.equal(report.stopReason, 'rework-required');
  const routed = Object.fromEntries(report.rework.map((entry) => [entry.gateId, entry.role]));
  assert.equal(routed.visual, 'art-direction', 'a below-threshold visual score returns to art direction');
  assert.equal(routed.security, 'frontend-implementation', 'the marketing pipeline overrides the security rework owner');
  assert.equal(routed.launchability, 'product-specification');
  assert.equal(report.gates.find((gate) => gate.id === 'visual').status, 'fail');

  const ordered = planRework(report);
  assert.equal(ordered[0].gateId, 'security', 'blockers are worked before majors');

  const validate = validator('schemas/convergence-report.schema.json');
  assert.ok(validate(report), JSON.stringify(validate.errors));
});

test('convergence never reports success while a required gate has not run', () => {
  const pipeline = PIPELINES['internal-tool'];
  const results = Object.fromEntries(pipeline.requiredGates.map((gate) => [gate, { status: 'pass' }]));
  delete results.security;
  const report = evaluateConvergence({ projectId: 'p1', pipeline, gates: GATES, results }, fixed);
  assert.equal(report.converged, false);
  assert.equal(report.stopReason, 'gate-not-run');

  const complete = evaluateConvergence({
    projectId: 'p1',
    pipeline,
    gates: GATES,
    results: Object.fromEntries(pipeline.requiredGates.map((gate) => [gate, { status: 'pass' }])),
  }, fixed);
  assert.equal(complete.converged, true);
  assert.equal(complete.stopReason, 'converged');
});

test('a hard budget stop outranks an ordinary rework loop', () => {
  const pipeline = PIPELINES['internal-tool'];
  const results = Object.fromEntries(pipeline.requiredGates.map((gate) => [gate, { status: 'pass' }]));
  results.performance = { status: 'fail', failingCriteria: ['lcp-over-budget'] };
  const report = evaluateConvergence({
    projectId: 'p1', pipeline, gates: GATES, results, budgetStopReason: 'cost-budget-exhausted',
  }, fixed);
  assert.equal(report.converged, false);
  assert.equal(report.stopReason, 'cost-budget-exhausted');
});

test('role context packets withhold artifacts the role spec does not declare', () => {
  const packet = buildRoleContextPacket({
    role: ROLES['information-architect'],
    artifacts: [
      { kind: 'ResearchPack', ref: 'r1' },
      { kind: 'ProductSpec', ref: 'p1' },
      { kind: 'BrandSpec', ref: 'b1' },
      { kind: 'ChangeSet', ref: 'c1' },
    ],
    contextTokensEstimate: 9000,
  });
  assert.deepEqual(packet.artifacts.map((a) => a.kind), ['ResearchPack', 'ProductSpec']);
  assert.deepEqual(packet.withheldKinds, ['BrandSpec', 'ChangeSet']);
  assert.equal(packet.overCeiling, false);

  const over = buildRoleContextPacket({ role: ROLES['information-architect'], artifacts: [], contextTokensEstimate: 90000 });
  assert.equal(over.overCeiling, true);
});

test('reviewers cannot declare repository mutation scope', () => {
  assert.throws(() => assertMutationAllowed(ROLES['design-critic'], ['src/**']), /may not mutate/);
  assert.throws(() => assertMutationAllowed(ROLES['frontend-implementation'], ['supabase/**']), /may not mutate/);
  assert.deepEqual(assertMutationAllowed(ROLES['frontend-implementation'], ['src/**']), ['src/**']);
});

test('pipelines are selectable by project type and walk in order', () => {
  assert.throws(() => selectPipeline('unknown-type', PIPELINES), /No specialist pipeline/);
  const pipeline = selectPipeline('b2b-saas', PIPELINES);
  assert.equal(nextStage(pipeline).id, 'intake');
  assert.equal(nextStage(pipeline, 'intake').id, 'research');
  assert.equal(nextStage(pipeline, pipeline.stages.at(-1).id), null);
});
