import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import { classifyChangeSetRisk } from '../packages/control-plane/src/risk.js';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

const registry = readJson('config/risk-surfaces.json');
const roles = readJson('config/agent-roles.json').roles;
const pipelines = readJson('config/agent-pipelines.json').pipelines;

const classify = (input) => classifyChangeSetRisk(input, registry);

test('classification output validates against the RiskClassification schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(readJson('schemas/risk-classification.schema.json'));
  for (const input of [
    { paths: ['apps/console/src/styles.css'] },
    { paths: ['recipes/auth/files/src/features/auth/index.tsx'] },
    { paths: ['adapters/netlify/adapter.json'], capabilities: ['deploy.production'] },
  ]) {
    const result = classify(input);
    assert.ok(validate(result), `invalid classification: ${JSON.stringify(validate.errors)}`);
  }
});

test('an ordinary presentation change buys no conditional review', () => {
  const result = classify({
    paths: [
      'apps/console/src/styles.css',
      'apps/console/src/workspace.css',
      'templates/shared/presentation/tokens.css',
      'templates/shared/presentation/styles.css',
    ],
  });
  assert.equal(result.severity, 'low');
  assert.deepEqual(result.requiredReviewers, []);
  assert.equal(result.conditionalReviewRequired, false);
});

test('a design-token file is not an authentication token', () => {
  // The single most important false positive to prevent: if `tokens.css` matched the `token`
  // signal, every styling change would pay for adversarial security review.
  const result = classify({ paths: ['templates/shared/presentation/tokens.css'] });
  assert.deepEqual(result.surfaces, []);
});

test('a JSON Schema contract is not a database migration', () => {
  const result = classify({ paths: ['schemas/page-spec.schema.json'] });
  assert.deepEqual(result.surfaces.map((s) => s.id), ['cross-layer-contract']);
  assert.deepEqual(result.requiredReviewers, ['differential-reviewer']);
  assert.equal(result.severity, 'high');
});

test('documentation-only changes stay low risk', () => {
  const result = classify({ paths: ['docs/ROADMAP.md', 'README.md', 'AGENTS.md'] });
  assert.equal(result.severity, 'low');
  assert.deepEqual(result.requiredReviewers, []);
});

test('an RLS policy change is critical and buys differential, security and independent review', () => {
  const result = classify({ paths: ['recipes/organisations/database/rls-policies.sql'] });
  assert.equal(result.severity, 'critical');
  for (const reviewer of ['differential-reviewer', 'security', 'independent-second-opinion']) {
    assert.ok(result.requiredReviewers.includes(reviewer), `expected ${reviewer}`);
  }
});

test('a production deploy capability requires the environment guardian before anything changes', () => {
  const result = classify({ paths: ['adapters/netlify/adapter.json'], capabilities: ['deploy.production'] });
  assert.equal(result.severity, 'critical');
  assert.ok(result.requiredReviewers.includes('environment-guardian'));
  assert.ok(result.requiredReviewers.includes('independent-second-opinion'));
  assert.ok(result.rationale.some((line) => line.includes('deploy.production')));
});

test('a capability alone classifies even when no declared path matches a surface', () => {
  const result = classify({ paths: ['docs/ROADMAP.md'], capabilities: ['database.production_write'] });
  assert.equal(result.severity, 'critical');
  assert.ok(result.requiredReviewers.includes('environment-guardian'));
  assert.deepEqual(result.surfaces[0].matchedBy, 'capability');
});

test('severity is the highest matched surface, never an average', () => {
  const result = classify({
    paths: ['adapters/netlify/adapter.json', 'recipes/auth/files/src/session.ts'],
  });
  assert.equal(result.severity, 'critical', 'one critical surface outranks an elevated one');
});

test('independent review is bought only at the registry threshold', () => {
  const below = classify({ paths: ['schemas/page-spec.schema.json'] });
  assert.ok(!below.requiredReviewers.includes('independent-second-opinion'), 'high alone is not critical');
  const at = classify({ paths: ['config/agent-policies.json'] });
  assert.ok(at.requiredReviewers.includes('independent-second-opinion'));
});

test('path matching respects segment boundaries', () => {
  assert.deepEqual(classify({ paths: ['srcauthenticator/index.ts'] }).surfaces, [], 'no accidental prefix match');
  assert.ok(classify({ paths: ['recipes/auth/index.ts'] }).surfaces.length > 0, 'a real segment still matches');
});

test('windows separators and leading ./ are normalized before matching', () => {
  const windows = classify({ paths: ['recipes\\auth\\files\\src\\session.ts'] });
  const dotted = classify({ paths: ['./recipes/auth/files/src/session.ts'] });
  assert.equal(windows.severity, 'critical');
  assert.deepEqual(windows.requiredReviewers, dotted.requiredReviewers);
});

test('every reviewer the registry can require is a registered reviewer role available on demand', () => {
  const required = new Set([
    ...Object.values(registry.surfaces).flatMap((surface) => surface.reviewers ?? []),
    ...Object.values(registry.capabilityActions ?? {}).flatMap((entry) => entry.reviewers ?? []),
    'independent-second-opinion',
  ]);
  for (const reviewer of required) {
    assert.ok(roles[reviewer], `risk registry requires unknown role ${reviewer}`);
    assert.equal(roles[reviewer].kind, 'reviewer', `${reviewer} must be a reviewer role`);
    assert.deepEqual(roles[reviewer].mutationScopes, [], `${reviewer} must not own mutation scope`);
    for (const [pipelineId, pipeline] of Object.entries(pipelines)) {
      const present = pipeline.onDemandRoles.includes(reviewer)
        || pipeline.stages.some((stage) => stage.role === reviewer || stage.reviewer === reviewer);
      assert.ok(present, `${pipelineId} cannot summon required reviewer ${reviewer}`);
    }
  }
});

test('every surface severity is a declared severity level', () => {
  for (const [id, surface] of Object.entries(registry.surfaces)) {
    assert.ok(registry.severityOrder.includes(surface.severity), `surface ${id} has unknown severity`);
    assert.ok(surface.label?.length > 0, `surface ${id} needs a label`);
  }
});
