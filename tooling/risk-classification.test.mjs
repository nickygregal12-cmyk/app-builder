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

// ---------------------------------------------------------------------------
// Mutation-driven coverage (Stage Q8).
//
// `npm run mutation:strength risk-classification` weakens each matcher and each
// rank comparison one at a time. Ten survived the first run: every individual
// form a path pattern can take, both kinds of file signal, and all three places
// severity is compared. Each test below exists because one of them did.
// ---------------------------------------------------------------------------

const SYNTHETIC = {
  severityOrder: ['low', 'elevated', 'high', 'critical'],
  escalation: { independentSecondOpinionAtOrAbove: 'high' },
  surfaces: {
    directory: { label: 'Directory pattern', severity: 'elevated', pathPatterns: ['recipes/auth/'], reviewers: ['alpha'] },
    exact: { label: 'Exact pattern', severity: 'high', pathPatterns: ['config/secrets.json'], reviewers: ['beta'] },
    word: { label: 'Word signal', severity: 'elevated', fileSignals: ['session'], reviewers: ['gamma'] },
    compound: { label: 'Compound signal', severity: 'high', fileSignals: ['api-key'], reviewers: ['delta'] },
    // Named so that registry order, alphabetical order and severity order all disagree. A sort
    // whose three inputs agree is a sort nothing can be proven about.
    zeta: { label: 'Late but severe', severity: 'high', pathPatterns: ['zeta/'], reviewers: ['epsilon'] },
  },
  capabilityActions: {
    'thing.low': { surface: 'shared', severity: 'elevated', reviewers: ['alpha'] },
    'thing.high': { surface: 'shared', severity: 'critical', reviewers: ['beta'] },
  },
};

const synthetic = (input) => classifyChangeSetRisk(input, SYNTHETIC);

test('each form a path pattern can take matches, and each is a separate form', () => {
  // A directory pattern with a trailing separator matches the directory itself as well as anything
  // under it; a pattern without one matches that exact path and anything under it. Four cases, and
  // the guard is four separate comparisons — one representative match leaves three untested.
  assert.deepEqual(synthetic({ paths: ['recipes/auth/'] }).surfaces.map((entry) => entry.id), ['directory'], 'the directory itself, spelled with its separator');
  assert.deepEqual(synthetic({ paths: ['recipes/auth'] }).surfaces.map((entry) => entry.id), ['directory'], 'the directory itself, spelled without one');
  assert.deepEqual(synthetic({ paths: ['recipes/auth/files/x.tsx'] }).surfaces.map((entry) => entry.id), ['directory'], 'a file beneath it');
  assert.deepEqual(synthetic({ paths: ['config/secrets.json'] }).surfaces.map((entry) => entry.id), ['exact'], 'an exact path pattern');
  assert.deepEqual(synthetic({ paths: ['config/secrets.json/nested.ts'] }).surfaces.map((entry) => entry.id), ['exact'], 'a path beneath an exact pattern');

  // And the near misses, or the matcher has become "matches everything nearby".
  assert.deepEqual(synthetic({ paths: ['recipes/authorisation/x.ts'] }).surfaces, [], 'a sibling with a longer name');
  assert.deepEqual(synthetic({ paths: ['config/secrets.json.bak'] }).surfaces, [], 'a path that merely starts with the pattern');
  assert.deepEqual(synthetic({ paths: ['other/recipes/auth/x.ts'] }).surfaces, [], 'the pattern appearing later in the path');
});

test('a whole-word signal and a compound signal are different rules', () => {
  assert.deepEqual(synthetic({ paths: ['src/session.ts'] }).surfaces.map((entry) => entry.id), ['word']);
  assert.deepEqual(synthetic({ paths: ['src/session/index.ts'] }).surfaces.map((entry) => entry.id), ['word'], 'a directory segment is a word too');
  assert.deepEqual(synthetic({ paths: ['src/api-key-store.ts'] }).surfaces.map((entry) => entry.id), ['compound'], 'a signal carrying its own separators matches inside the basename');

  // The refusals this rule exists for. `sessions` is not `session`, and a compound signal must not
  // decompose into words that match everything.
  assert.deepEqual(synthetic({ paths: ['src/sessions.ts'] }).surfaces, [], 'a longer word is a different word');
  assert.deepEqual(synthetic({ paths: ['src/api.ts'] }).surfaces, [], 'half of a compound signal is not the signal');
  assert.deepEqual(synthetic({ paths: ['src/key.ts'] }).surfaces, [], 'the other half is not either');
});

test('two capability actions on one surface keep the higher severity, whichever order they arrive in', () => {
  const rising = synthetic({ paths: [], capabilities: ['thing.low', 'thing.high'] });
  const falling = synthetic({ paths: [], capabilities: ['thing.high', 'thing.low'] });
  assert.equal(rising.severity, 'critical');
  assert.equal(falling.severity, 'critical', 'the order actions are listed in must not decide the severity');
  assert.deepEqual(rising.surfaces.map((entry) => entry.severity), ['critical']);
});

test('surfaces sort by severity first and by name only to break a tie', () => {
  // Severity leads: `zeta` is declared last in the registry and sorts last alphabetically, and it
  // still comes first because it is the more severe.
  assert.deepEqual(
    synthetic({ paths: ['recipes/auth/x.ts', 'zeta/x.ts'] }).surfaces.map((entry) => entry.id),
    ['zeta', 'directory'],
  );
  // Name breaks the tie: `compound` and `exact` are equally severe and declared in the other order.
  assert.deepEqual(
    synthetic({ paths: ['config/secrets.json', 'src/api-key.ts'] }).surfaces.map((entry) => entry.id),
    ['compound', 'exact'],
  );
  // And the result does not depend on the order the paths were declared in, or a classification
  // would reorder between runs and nobody could diff it.
  assert.deepEqual(
    synthetic({ paths: ['src/api-key.ts', 'config/secrets.json'] }).surfaces.map((entry) => entry.id),
    ['compound', 'exact'],
  );
  assert.deepEqual(
    synthetic({ paths: ['src/session.ts', 'recipes/auth/x.ts'] }).surfaces.map((entry) => entry.id),
    ['directory', 'word'],
  );
});

test('severity is the highest matched surface, and the escalation threshold is at-or-above', () => {
  assert.equal(synthetic({ paths: [] }).severity, 'low', 'nothing matched is the lowest declared level, not undefined');
  assert.equal(synthetic({ paths: ['src/session.ts'] }).severity, 'elevated');
  assert.equal(synthetic({ paths: ['src/session.ts', 'config/secrets.json'] }).severity, 'high', 'the highest, not the first and not the last');

  // Exactly at the threshold buys independence; one below does not.
  assert.ok(synthetic({ paths: ['config/secrets.json'] }).requiredReviewers.includes('independent-second-opinion'));
  assert.ok(!synthetic({ paths: ['src/session.ts'] }).requiredReviewers.includes('independent-second-opinion'));
});
