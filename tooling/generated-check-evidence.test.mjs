/**
 * Coverage for the generated project's own checks as gate evidence.
 *
 * The interesting failure is not a script that fails — that one is obvious —
 * but a test script that passes over nothing. Exit zero means the same thing
 * whether a suite ran two hundred tests or none, and a gate that reads only the
 * exit status cannot tell those apart. So the TAP plan is parsed, its absence is
 * distinguished from zero, and the number travels with the pass.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { GENERATED_CHECKS, summariseGeneratedChecks, tapTestCount } from './lib/generated-check-evidence.mjs';

const REGISTRY = JSON.parse(fs.readFileSync('config/gate-producers.json', 'utf8'));
const BUILD = 'composition-hash-1';

function results(overrides = {}) {
  return GENERATED_CHECKS.map((entry) => ({
    script: entry.script,
    exitCode: 0,
    output: entry.script === 'test' ? '# tests 12\n# pass 12\n# fail 0\n' : 'ok\n',
    ...overrides[entry.script],
  }));
}

test('three passing scripts are a clean report that says which ran', () => {
  const report = summariseGeneratedChecks({ results: results(), compositionHash: BUILD });
  assert.equal(report.clean, true);
  assert.deepEqual(report.scriptsRun, ['typecheck', 'lint', 'test']);
  assert.equal(report.unitTests, 12);
  assert.equal(report.compositionHash, BUILD);
});

test('each script has its own planted failure, and fails only its own check', () => {
  for (const entry of GENERATED_CHECKS) {
    const report = summariseGeneratedChecks({
      results: results({ [entry.script]: { exitCode: 2, output: 'something\nbroke here\n' } }),
      compositionHash: BUILD,
    });
    assert.equal(report.clean, false, entry.script);
    assert.deepEqual(report.findings.map((finding) => finding.check), [entry.finding], entry.script);
    // The finding says what to run to see it, and carries the tail of the output
    // rather than a status nobody can act on.
    assert.equal(report.findings[0].where, `npm run ${entry.script}`);
    assert.match(report.findings[0].detail, /exit 2: .*broke here/);
  }
});

test('a suite that ran nothing is not the same as a suite that passed', () => {
  // Both exit zero. The plan is the only thing that separates them, and the
  // gate reads the number rather than the status.
  const empty = summariseGeneratedChecks({ results: results({ test: { exitCode: 0, output: '# tests 0\n# pass 0\n' } }) });
  assert.equal(empty.clean, true, 'a suite with no tests has not failed');
  assert.equal(empty.unitTests, 0, 'and the report says it was a pass over nothing');

  const noPlan = summariseGeneratedChecks({ results: results({ test: { exitCode: 0, output: 'Everything is fine.\n' } }) });
  assert.equal(noPlan.unitTests, null, 'no plan at all is unknown, not zero');
});

test('the TAP plan is read from the summary line and nowhere else', () => {
  assert.equal(tapTestCount('# tests 7\n'), 7);
  assert.equal(tapTestCount('ok 1 - # tests 99 is in this name\n# tests 3\n'), 3);
  assert.equal(tapTestCount('no plan here'), null);
  assert.equal(tapTestCount(null), null);
  assert.equal(tapTestCount(undefined), null);
});

test('a script that did not run is absent rather than passing', () => {
  const partial = summariseGeneratedChecks({ results: [{ script: 'lint', exitCode: 0, output: 'ok\n' }] });
  assert.deepEqual(partial.scriptsRun, ['lint']);
  assert.equal(partial.unitTests, null);
  // No finding, because a script that did not run has not failed — the gate
  // reads the missing check as `not-run` from the resolver, which is where that
  // decision belongs.
  assert.deepEqual(partial.findings, []);
});

test('every check this producer answers is registered against the tests gate, and e2e is not', () => {
  for (const entry of GENERATED_CHECKS) {
    const registered = REGISTRY.checks[entry.check];
    assert.ok(registered, `${entry.check} is produced here but not registered`);
    assert.equal(registered.producer, 'generated-checks');
    assert.equal(registered.gate, 'tests');
    assert.deepEqual(registered.failOnFindings, [entry.finding]);
  }
  // e2e-tests needs a browser and a served build, which the Playwright lanes
  // own. Answering it here would be a second place browser evidence is made.
  assert.ok(REGISTRY.unregistered.checks.includes('e2e-tests'));
  assert.ok(!Object.hasOwn(REGISTRY.checks, 'e2e-tests'));
});
