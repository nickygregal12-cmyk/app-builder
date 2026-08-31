import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const WORKFLOW = '.github/workflows/visual-review-evidence.yml';
/**
 * What may leave the runner, and why each entry is allowed.
 *
 * Broadening this list is a privacy/source decision, not a convenience. The
 * packet entries were added after checking, field by field, that they publish
 * nothing the two JSON reports already beside them do not:
 *
 * - `packet/index.html` and `packet/review.json` carry the business name, the
 *   frozen-truth hashes, the candidate axes, the refused directions, the
 *   quality gate and the scoped criteria. Every one of those is already in
 *   `report.json` or `review-packets.json`. What they add beyond those is the
 *   review process's own state — `createdAt`, `decision`, `reworkPlans` — and
 *   `designReferences`, which is reduced to a supplied label, registered trait
 *   identifiers and an approval state. No reference URL, source markup, copy,
 *   imagery or stylesheet survives into it, which is the same guarantee
 *   docs/VISUAL_EXCELLENCE.md §9 makes about capture.
 * - `packet/captures/*.png` are copies of the captures already published by the
 *   service entry below.
 *
 * Still excluded, and the reason the assertion is an exact list rather than a
 * prefix: workspaces, the SQLite database, raw sources and the rest of Factory
 * state are not review evidence.
 *
 * The directory is `${{ matrix.out }}` because the job runs once per genuine
 * business. That moves where the boundary is written without moving the
 * boundary: the entries below are still an exact list, and `every matrix output
 * directory stays inside .app-builder` is asserted separately, so a new case
 * cannot quietly point the allowlist at somewhere else.
 */
const OUT = '${{ matrix.out }}';
const ALLOWED_UPLOADS = [
  `${OUT}/report.json`,
  `${OUT}/review-packets.json`,
  `${OUT}/packet/index.html`,
  `${OUT}/packet/review.json`,
  `${OUT}/packet/captures/*.png`,
  `${OUT}/service/**/captures/*.png`,
];

function uploadPaths(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\s+path:\s*\|\s*$/.test(line));
  assert.notEqual(start, -1, `${WORKFLOW} must declare a literal upload path block.`);
  const indent = lines[start].match(/^\s*/)[0].length;
  const result = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent <= indent) break;
    result.push(line.trim());
  }
  return result;
}

test('remote visual review publishes only detached review evidence', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  assert.deepEqual(
    uploadPaths(text),
    ALLOWED_UPLOADS,
    'Do not broaden the visual-review artifact without a deliberate review of the privacy/source boundary. Workspaces, SQLite, raw sources and Factory state are not review evidence.',
  );

  const retention = Number(text.match(/retention-days:\s*(\d+)/)?.[1]);
  assert.ok(Number.isInteger(retention) && retention > 0 && retention <= 7, 'Detached visual review evidence must expire within seven days.');
});

/**
 * The allowlist is templated, so what it can expand to is part of the boundary.
 *
 * Every upload path is now relative to a matrix value. A case whose `out` were
 * a workspace, an absolute path or a parent traversal would publish exactly the
 * Factory state the exact list above exists to keep in, and the list itself
 * would still read as correct.
 */
test('every genuine-business case writes its evidence inside the factory state directory', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  const outputs = [...text.matchAll(/^\s+out:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  assert.ok(outputs.length >= 2, 'the matrix should carry more than one genuine business, or it is a hard-coded job with extra ceremony');
  assert.equal(new Set(outputs).size, outputs.length, 'two cases writing to one directory would overwrite each other\'s evidence');
  for (const out of outputs) {
    assert.match(out, /^\.app-builder\/[A-Za-z0-9._-]+$/, `${out} must be a single directory inside .app-builder`);
    assert.doesNotMatch(out, /\.\./, 'no parent traversal');
  }
});

/**
 * Each case must say which business it is and where its truth comes from.
 *
 * A matrix entry with a bundle and no declared knowledge is the legitimate case
 * — a business with nothing to ingest — and it has to stay distinguishable from
 * an entry where somebody forgot the pack, because the two produce different
 * evidence and only one of them is honest about it.
 */
test('every genuine-business case declares its bundle and its artifact name', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  const businesses = [...text.matchAll(/^\s+- business:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  const bundles = [...text.matchAll(/^\s+bundle:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  assert.equal(businesses.length, bundles.length, 'every case names a business and a bundle');
  for (const bundle of bundles) {
    assert.match(bundle, /^examples\/genuine-business\/.+\.json$/);
    assert.ok(fs.existsSync(bundle), `${bundle} must exist, or the hosted run fails after installing Chromium`);
  }
  assert.match(text, /name:\s*\$\{\{\s*matrix\.business\s*\}\}-visual-review-/, 'artifacts must be named per business, or one case overwrites the other\'s upload');
});

/**
 * The reviewer has to receive the packet, not just the pictures.
 *
 * The captures alone are 36 PNGs named by candidate, route and viewport, with
 * nothing saying what the professional bar is, which criteria are the
 * reviewer's to score, which direction was refused, or what DesignLint already
 * settled. The packet is the surface built to answer exactly that, and it opens
 * from a file:// URL, so a hosted run that uploads the captures without it
 * hands over evidence that cannot be reviewed as evidence.
 */
test('the hosted evidence run uploads the packet a reviewer opens, not only its captures', () => {
  const paths = uploadPaths(fs.readFileSync(WORKFLOW, 'utf8'));
  assert.ok(
    paths.includes(`${OUT}/packet/index.html`),
    'the portable packet index must travel with the captures, or the download cannot be reviewed',
  );
  assert.ok(
    paths.some((entry) => entry.startsWith(`${OUT}/packet/captures/`)),
    'the packet index is relative to its own captures; uploading it without them publishes a page of broken images',
  );
});

const ACCEPTANCE = 'tooling/visual-candidate-acceptance.mjs';

/**
 * The environment the acceptance run fail-closes on, read from the script
 * rather than restated here.
 *
 * Listing the names in this test would let the two drift apart in exactly the
 * way that costs a hosted run: the script gains a third required variable, this
 * file still asserts the two it knew about, and the workflow discovers the gap
 * forty seconds into a job that has already installed Chromium.
 */
function requiredRuntimeEnv(text) {
  return [...new Set([...text.matchAll(/process\.env\.(APP_BUILDER_[A-Z0-9_]+)/g)].map((match) => match[1]))].sort();
}

/**
 * The step that invokes a given command, however it is written.
 *
 * Matched on the command being *invoked* rather than on `run: <command>`
 * exactly, because the acceptance run is now a multi-line block that passes the
 * business as arguments. Pinning the single-line form would make this assert the
 * shape of the command instead of the guarantee it carries.
 *
 * The invocation test is not decoration: the script's path also appears in this
 * workflow's `paths:` trigger list, and matching that line instead finds a step
 * with no `env:` and reports the identity as undeclared when it is declared.
 */
function stepEnv(text, command) {
  const lines = text.split('\n');
  const runIndex = lines.findIndex((line) => line.includes(command) && (/^\s*(node|npm)\s/.test(line) || /run:/.test(line)));
  assert.notEqual(runIndex, -1, `${WORKFLOW} must run ${command}.`);

  let start = runIndex;
  while (start >= 0 && !/^\s*- /.test(lines[start])) start -= 1;
  assert.notEqual(start, -1, `Could not find the step that runs ${command}.`);
  const stepIndent = lines[start].indexOf('-');

  let end = start + 1;
  while (end < lines.length && !(/^\s*- /.test(lines[end]) && lines[end].indexOf('-') === stepIndent)) end += 1;

  const block = lines.slice(start, end);
  const envIndex = block.findIndex((line) => /^\s*env:\s*$/.test(line));
  if (envIndex === -1) return [];
  const envIndent = block[envIndex].match(/^\s*/)[0].length;
  const keys = [];
  for (let index = envIndex + 1; index < block.length; index += 1) {
    const line = block[index];
    if (!line.trim()) continue;
    if (line.match(/^\s*/)[0].length <= envIndent) break;
    const key = line.trim().match(/^([A-Za-z0-9_]+):/);
    if (key) keys.push(key[1]);
  }
  return keys.sort();
}

/**
 * The hosted run must declare the identity the script refuses to guess.
 *
 * This is the defect the workflow actually hit. `runIdentity` was made
 * fail-closed — correctly, because a guessed vendor authorises a creator to
 * approve itself — but the workflow that calls it was never given the answer,
 * so the evidence job died before capturing anything and the only signal was a
 * red check on a pull request whose own gates were green.
 *
 * Asserting the presence of the variables, not their values: which vendor is
 * declared is a judgement recorded in the workflow's own comment, and pinning
 * the string here would make a deliberate change to it look like a test
 * failure. What must never regress is that the answer is supplied at all.
 */
test('the hosted evidence run declares the runtime identity the acceptance script requires', () => {
  const required = requiredRuntimeEnv(fs.readFileSync(ACCEPTANCE, 'utf8'));
  assert.ok(required.length > 0, `${ACCEPTANCE} should read its runtime identity from the environment.`);

  const declared = stepEnv(fs.readFileSync(WORKFLOW, 'utf8'), ACCEPTANCE);
  const missing = required.filter((name) => !declared.includes(name));
  assert.deepEqual(
    missing,
    [],
    `${WORKFLOW} does not declare ${missing.join(', ')}, which ${ACCEPTANCE} fails closed without. A hosted evidence run would install Chromium and then refuse to say who created the candidates.`,
  );
});

const CONSOLE_WORKSPACE = 'apps/console/src/workspace/BuilderWorkspace.tsx';

/** The `env:` values declared on the step that runs a given command. */
function stepEnvValues(text, command) {
  const lines = text.split('\n');
  const runIndex = lines.findIndex((line) => line.includes(command) && (/^\s*(node|npm)\s/.test(line) || /run:/.test(line)));
  let start = runIndex;
  while (start >= 0 && !/^\s*- /.test(lines[start])) start -= 1;
  const stepIndent = lines[start].indexOf('-');
  let end = start + 1;
  while (end < lines.length && !(/^\s*- /.test(lines[end]) && lines[end].indexOf('-') === stepIndent)) end += 1;
  const values = {};
  for (const line of lines.slice(start, end)) {
    const match = line.trim().match(/^(APP_BUILDER_[A-Z0-9_]+):\s*(\S+)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/**
 * Both deterministic generation paths must author under the same identity.
 *
 * Nothing about a candidate changes because a runner built it rather than a
 * desk: the directions are committed, the intake bundle is frozen, and no model
 * executes on either path. If the two disagreed, provenance would record where
 * a build happened instead of what authored it, and the same candidate set
 * would admit a reviewer on one path and refuse them on the other — a rule 17
 * decision made by accident of location.
 */
test('the hosted evidence run authors candidates as the same factory identity the Console does', () => {
  const declared = stepEnvValues(fs.readFileSync(WORKFLOW, 'utf8'), ACCEPTANCE);
  const consoleSource = fs.readFileSync(CONSOLE_WORKSPACE, 'utf8');
  const author = consoleSource.match(/const FACTORY_AUTHOR = \{([^}]+)\}/);
  assert.ok(author, `${CONSOLE_WORKSPACE} must declare FACTORY_AUTHOR, the identity deterministic generation is authored under.`);
  const field = (name) => author[1].match(new RegExp(`${name}:\\s*'([^']+)'`))?.[1];

  assert.equal(
    declared.APP_BUILDER_RUNTIME_VENDOR,
    field('vendor'),
    `${WORKFLOW} and ${CONSOLE_WORKSPACE} must agree on the vendor deterministic generation is authored under; independence is decided on vendor.`,
  );
  assert.equal(declared.APP_BUILDER_RUNTIME_MODEL, field('model'), 'The audit trail should record the same runtime on both paths.');
});

test('superseded visual evidence runs are cancelled but manual runs stay independent', () => {
  const text = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(text, /group:\s*visual-review-evidence-\$\{\{\s*github\.event_name == 'pull_request' && github\.event\.pull_request\.number \|\| github\.run_id\s*\}\}/);
  assert.match(text, /cancel-in-progress:\s*true/);
});
