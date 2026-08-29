import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  WORKFLOW_SECURITY_RULES,
  auditWorkflow,
  checkoutsPersistingCredentials,
  dependencyReviewFindings,
  permissionFindings,
  pullRequestTargetFindings,
  secretsOnCommandLines,
  unpinnedActions,
  untrustedInterpolations,
} from './lib/workflow-security.mjs';

/**
 * The estate is clean, so the interesting half of this file is the planted violations. A workflow
 * gate that has only ever been run against sound workflows proves that the workflows are sound; it
 * proves nothing about the gate, and the two are easy to confuse when both come back green.
 */

function workflowFiles() {
  const root = path.resolve('.github/workflows');
  return fs.readdirSync(root).filter((name) => /\.ya?ml$/i.test(name)).map((name) => path.join(root, name));
}

const SOUND = `name: Example
on:
  pull_request:

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          persist-credentials: false
      - run: npm test
      - name: Publish
        env:
          TOKEN: \${{ secrets.PUBLISH_TOKEN }}
        run: |
          echo "building \${{ github.sha }}"
          npm publish
`;

test('every workflow in this repository passes every rule', () => {
  const files = workflowFiles();
  assert.ok(files.length > 0, 'no workflows were found, so nothing was checked');
  for (const file of files) {
    const findings = auditWorkflow(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(findings, [], `${path.relative(process.cwd(), file)}: ${JSON.stringify(findings, null, 2)}`);
  }
});

test('the sound reference workflow is clean, so a green result means something', () => {
  assert.deepEqual(auditWorkflow(SOUND), []);
});

test('unpinning an action fails the check', () => {
  // The prompt case: a version tag is a name its owner can move.
  for (const spelling of ['actions/checkout@v4', 'actions/checkout@main', 'actions/checkout', 'some/action@1.2.3', 'some/action@abcdef1']) {
    const findings = unpinnedActions(SOUND.replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7', spelling));
    assert.equal(findings.length, 1, spelling);
    assert.equal(findings[0].rule, 'action-not-pinned');
  }
  // A local composite action and a digest-pinned container are not third-party tags.
  assert.deepEqual(unpinnedActions('      - uses: ./.github/actions/setup\n'), []);
  assert.deepEqual(unpinnedActions('      - uses: docker://alpine@sha256:abc\n'), []);
});

test('a checkout that keeps the workflow token fails the check', () => {
  const findings = checkoutsPersistingCredentials(SOUND.replace('        with:\n          persist-credentials: false\n', ''));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'checkout-persists-credentials');

  // Saying `true` explicitly is the same decision, spelled out.
  assert.equal(checkoutsPersistingCredentials(SOUND.replace('persist-credentials: false', 'persist-credentials: true')).length, 1);
  // A checkout in a second job needs its own guard rather than inheriting the first one's.
  const twoJobs = `${SOUND}  second:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n      - run: npm test\n`;
  assert.equal(checkoutsPersistingCredentials(twoJobs).length, 1);
});

test('a workflow that never says what its token may do fails the check', () => {
  const findings = permissionFindings(SOUND.replace('permissions:\n  contents: read\n\n', ''));
  assert.deepEqual(findings.map((entry) => entry.rule), ['permissions-not-declared']);
  assert.deepEqual(permissionFindings(SOUND.replace('permissions:\n  contents: read', 'permissions: write-all')).map((entry) => entry.rule), ['permissions-write-all']);
  // A job-level block does not excuse an absent top-level one: the jobs added later inherit the
  // repository default, not this job's decision.
  const jobOnly = SOUND.replace('permissions:\n  contents: read\n\n', '').replace('    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n');
  assert.deepEqual(jobOnly.includes('permissions:'), true);
  assert.deepEqual(permissionFindings(jobOnly).map((entry) => entry.rule), ['permissions-not-declared']);
});

test('pull_request_target fails the check wherever it appears', () => {
  assert.equal(pullRequestTargetFindings(SOUND.replace('  pull_request:', '  pull_request_target:')).length, 1);
  assert.equal(pullRequestTargetFindings('on: pull_request_target\n').length, 1);
  assert.deepEqual(pullRequestTargetFindings(SOUND), []);
});

test("a pull request author's own text interpolated into a shell command fails the check", () => {
  for (const context of ['github.event.pull_request.title', 'github.head_ref', 'github.event.comment.body', 'github.event.head_commit.message']) {
    const findings = untrustedInterpolations(SOUND.replace('echo "building ${{ github.sha }}"', `echo "\${{ ${context} }}"`));
    assert.equal(findings.length, 1, context);
    assert.equal(findings[0].rule, 'untrusted-interpolation-in-run');
  }

  // A single-line `run:` is checked too, not only a block scalar.
  assert.equal(untrustedInterpolations('      - run: echo ${{ github.event.pull_request.title }}\n').length, 1);

  // The same value in `env:` is the fix, not another finding: the shell reads it as a variable.
  assert.deepEqual(untrustedInterpolations(SOUND.replace('          TOKEN: ${{ secrets.PUBLISH_TOKEN }}', '          TITLE: ${{ github.event.pull_request.title }}')), []);
  // A commit SHA and a run id are not author-controlled text.
  assert.deepEqual(untrustedInterpolations(SOUND), []);
});

test('a secret substituted into a command line fails the check', () => {
  const findings = secretsOnCommandLines(SOUND.replace('          npm publish', '          npm publish --token ${{ secrets.PUBLISH_TOKEN }}'));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'secret-interpolated-into-run');
  // Through `env:` it is not a finding, which is the whole point of the rule.
  assert.deepEqual(secretsOnCommandLines(SOUND), []);
});

test('a comment cannot hide a violation, and a hash inside a string is not a comment', () => {
  // Both directions matter. If `#` always started a comment, the rules would read half a `run:`
  // block; if it never did, a pinned action's `# v7` note would be read as part of the ref.
  assert.deepEqual(unpinnedActions('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\n'), []);
  assert.deepEqual(unpinnedActions('      # - uses: actions/checkout@v4\n'), []);
  assert.equal(secretsOnCommandLines('      - run: echo "a # b ${{ secrets.TOKEN }}"\n').length, 1);
});

test('dependency review is PR-only, read-only, secretless and blocks meaningful introductions', () => {
  const workflow = fs.readFileSync('.github/workflows/dependency-review.yml', 'utf8');
  assert.deepEqual(dependencyReviewFindings(workflow), []);
  assert.deepEqual(permissionFindings(workflow), []);
  assert.deepEqual(unpinnedActions(workflow), []);

  const planted = [
    [workflow.replace('  pull_request:', '  push:'), 'dependency-review-not-pr-only'],
    [workflow.replace(/actions\/dependency-review-action@[0-9a-f]{40}/, 'actions/dependency-review-action@v5'), 'dependency-review-action-missing'],
    [workflow.replace('fail-on-severity: high', 'fail-on-severity: critical'), 'dependency-review-threshold-weakened'],
    [workflow.replace('license-check: false', 'license-check: true'), 'dependency-review-scope-widened'],
    [`${workflow}\n# \${{ secrets.DEPENDENCY_TOKEN }}\n`, 'dependency-review-secret-used'],
  ];
  for (const [mutant, rule] of planted) {
    assert.ok(dependencyReviewFindings(mutant).some((finding) => finding.rule === rule), rule);
  }
});

test('every finding names a declared rule', () => {
  const planted = SOUND
    .replace('permissions:\n  contents: read\n\n', '')
    .replace('  pull_request:', '  pull_request_target:')
    .replace('actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7', 'actions/checkout@v4')
    .replace('        with:\n          persist-credentials: false\n', '')
    .replace('          npm publish', '          npm publish --token ${{ secrets.PUBLISH_TOKEN }} --branch ${{ github.head_ref }}');
  const findings = auditWorkflow(planted);
  for (const finding of findings) {
    assert.ok(WORKFLOW_SECURITY_RULES.includes(finding.rule), `undeclared rule: ${finding.rule}`);
    assert.ok(finding.detail?.trim(), `${finding.rule} must say what is wrong`);
    assert.ok(Number.isInteger(finding.line) && finding.line > 0, `${finding.rule} must name a line`);
  }
  // Every rule fires at least once on a workflow that breaks all of them, so none of them is inert.
  const generalRules = WORKFLOW_SECURITY_RULES.filter((rule) => !rule.startsWith('dependency-review-') && rule !== 'permissions-write-all');
  assert.deepEqual([...new Set(findings.map((entry) => entry.rule))].sort(), generalRules.sort());
});

/**
 * A step that needs a running service must live in the job that starts it.
 *
 * This is not hypothetical tidiness. `npx playwright install` appears in two
 * jobs, so a textual insertion before "the first one" put the Storage API
 * acceptance into `verify`, which starts no Supabase stack at all. It failed on
 * a connection error rather than on anything it was meant to measure, and the
 * job that DOES have the stack went green without ever running it — the worst
 * shape of failure, because a green tick appeared next to work that had not
 * happened.
 *
 * Keyed on the script a step runs rather than on a step name, because a name is
 * the thing most likely to be reworded.
 */
test('a step that needs the Supabase stack runs in the job that starts it', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

  // Split into jobs by their two-space-indented keys, so each block is one job.
  const blocks = [...workflow.matchAll(/^ {2}([a-z][\w-]*):$/gm)].map((match, index, all) => ({
    job: match[1],
    body: workflow.slice(match.index, index + 1 < all.length ? all[index + 1].index : workflow.length),
  }));
  assert.ok(blocks.length >= 2, 'expected the CI workflow to declare several jobs');

  const NEEDS_STACK = ['tooling/storage-boundary-acceptance.mjs', 'tooling/seed-records-journey.mjs', 'test:e2e:generated-app'];
  const starts = (body) => /supabase@[\d.]+ start/.test(body);

  let checked = 0;
  for (const script of NEEDS_STACK) {
    const owning = blocks.filter((block) => block.body.includes(script));
    assert.ok(owning.length > 0, `${script} is not run by any CI job, so nothing proves it works`);
    for (const block of owning) {
      checked += 1;
      assert.ok(
        starts(block.body),
        `${script} runs in job "${block.job}", which never starts Supabase. It will fail on a connection error, and the job that does have the stack will pass without running it.`,
      );
    }
  }
  assert.ok(checked >= NEEDS_STACK.length, `expected every stack-dependent script to be placed, checked ${checked}`);
});
