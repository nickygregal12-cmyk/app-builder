import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { composeProject } from '../packages/composition/src/index.js';
import { auditLaunchReadiness } from './lib/launch-readiness.mjs';
import { deriveOpportunities } from './lib/product-opportunities.mjs';
import { FactoryService } from '../apps/service/src/factory-service.js';
import { FactoryStore } from '../apps/service/src/store.js';
import { readJson } from './lib/manifest.mjs';

const rules = readJson('config/launch-readiness-rules.json');

function manifest(slug, overrides = {}) {
  return {
    schemaVersion: 2,
    project: { name: 'Opportunity Test', slug, type: 'marketing-site', primaryGoal: 'Prove a broad prompt resolves to real work.' },
    audience: { summary: 'Homeowners', roles: [] },
    journeys: ['Contact the business'],
    majorSurfaces: ['Home', 'Services', 'Contact'],
    entities: [],
    company: { identity: { name: 'Opportunity Test' }, services: [], locations: [], contactDetails: {}, trustSignals: [], conversionGoals: ['email'] },
    modules: {},
    infrastructure: { backend: 'none', deployment: 'netlify' },
    aiBudget: { mode: 'economy', maxBuildCostGbp: 0 },
    brand: { designControl: 'sensible-defaults' },
    inputs: { inventory: [], sources: [] },
    constraints: { hard: [], expectedScale: 'under-1000', sensitivity: 'normal-business-data', tenantModel: '', integrations: [], existingData: [], uploadTypes: [], customCapabilities: [], excludedCapabilities: [], unresolvedCapabilities: [] },
    outOfScope: [],
    ...overrides,
  };
}

function auditFor(projectManifest) {
  return auditLaunchReadiness({ composition: composeProject({ manifest: projectManifest }), rules, manifest: projectManifest });
}

function roots(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { root, stateRoot: path.join(root, 'state'), workspacesRoot: path.join(root, 'workspaces') };
}

test('every owning role a check can name has declared effort', () => {
  const owning = new Set(Object.values(rules.checks).map((check) => check.owningRole));
  const declared = new Set(Object.keys(rules.opportunityRules.roleEffort));
  assert.deepEqual([...owning].filter((role) => !declared.has(role)), [], 'a role with no declared effort cannot be ranked');
  assert.deepEqual([...declared].filter((role) => !owning.has(role)), [], 'effort declared for a role no check names is dead weight');
  for (const effort of Object.values(rules.opportunityRules.roleEffort)) {
    assert.ok(['factory', 'owner'].includes(effort.readiness), 'readiness says who is blocked, and there are only two answers');
  }
});

test('a broad prompt resolves to at most three materially different opportunities', () => {
  const derived = deriveOpportunities({ audit: auditFor(manifest('broad')), rules });

  assert.ok(derived.opportunities.length > 0, 'a build with real gaps has something to offer');
  assert.ok(derived.opportunities.length <= rules.opportunityRules.maximum);

  // Three opportunities must be three things, not one thing three times.
  const roles = derived.opportunities.map((entry) => entry.owningRole);
  assert.equal(new Set(roles).size, roles.length, 'two opportunities owned by the same role are the same opportunity');

  // Grounded: every opportunity rests on findings that already exist.
  const auditTitles = new Set(auditFor(manifest('broad')).findings.map((finding) => finding.title));
  for (const opportunity of derived.opportunities) {
    assert.ok(opportunity.findingCount > 0);
    assert.ok(opportunity.where.length > 0, 'an opportunity says where it applies');
    for (const title of opportunity.summary) assert.ok(auditTitles.has(title), `${title} is not a finding this build actually has`);
    assert.ok(['factory', 'owner'].includes(opportunity.blockedOn));
  }

  // Nothing is quietly dropped: the cap is visible.
  assert.ok(derived.consideredCount >= derived.opportunities.length);
});

test('opportunities are ranked, and ranking is reproducible', () => {
  const first = deriveOpportunities({ audit: auditFor(manifest('rank')), rules });
  const second = deriveOpportunities({ audit: auditFor(manifest('rank')), rules });
  assert.deepEqual(first, second, 'the same build must always produce the same answer');

  const totals = first.opportunities.map((entry) => entry.ranking.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => b - a), 'the highest-ranked opportunity comes first');
  for (const opportunity of first.opportunities) {
    assert.equal(typeof opportunity.ranking.value, 'number');
    assert.ok(opportunity.ranking.frequency >= 1);
    assert.ok(['factory', 'owner'].includes(opportunity.ranking.readiness));
  }
});

test('a redesign is never the answer to a build whose problems are content and behaviour', () => {
  const derived = deriveOpportunities({ audit: auditFor(manifest('no-redesign')), rules });
  // Every opportunity names the role that owns the fix and the checks that
  // found it, so none of them can be "make it look better".
  for (const opportunity of derived.opportunities) {
    assert.ok(opportunity.owningRole, 'an opportunity nobody owns is a complaint');
    assert.ok(opportunity.guidance, 'an opportunity with no guidance is a complaint');
    assert.ok(opportunity.categories.every((category) => ['content', 'behavior', 'imagery', 'integration', 'data'].includes(category)));
  }
});

test('proving something is not the same ask as fixing something', () => {
  const audit = auditFor(manifest('evidence'));
  const derived = deriveOpportunities({ audit, rules });

  assert.ok(audit.evidenceGaps.length > 0, 'this build has states and journey steps it cannot prove');
  const improvementIds = new Set(derived.opportunities.map((entry) => entry.id));
  for (const entry of derived.evidenceOpportunities) {
    assert.equal(entry.kind, 'evidence');
    assert.equal(improvementIds.has(entry.id), false, 'an evidence gap must never be offered as a defect to fix');
  }
  // And they never inflate the manual-edit prediction the acceptance gate uses.
  assert.equal(audit.predictedManualEdits, audit.summary.blocker + audit.summary.major);
});

test('the service answers with the live build, and raises the states rendered evidence settles', async () => {
  const dirs = roots('app-builder-opportunities-');
  const store = new FactoryStore({ stateRoot: dirs.stateRoot });
  const service = new FactoryService({ store, workspacesRoot: dirs.workspacesRoot, stateRoot: dirs.stateRoot });
  try {
    const project = service.createProject({ id: 'project-opportunities', manifest: manifest('opportunity-service') });
    assert.equal(service.productReview(project.id), null, 'there is nothing to review before a build');

    const generated = await service.generateProject(project.id);
    const review = service.productReview(project.id);

    assert.equal(review.compositionHash, generated.composition.compositionHash, 'the review is of the build that exists');
    assert.ok(review.opportunities.length <= 3);
    assert.ok(review.stateMatrix.length > 0, 'the state matrix is read, not derived again');
    assert.ok(review.journeys.length >= 0);
    assert.equal(review.evidenceId, null, 'no captures yet');
    assert.equal(review.stateMatrix.flatMap((surface) => surface.states).every((state) => state.evidence === 'none'), true);
    assert.equal(typeof review.launchable, 'boolean');
    assert.equal(review.predictedManualEdits, review.summary.blocker + review.summary.major);
  } finally {
    await service.close();
    store.close();
    fs.rmSync(dirs.root, { recursive: true, force: true });
  }
});
