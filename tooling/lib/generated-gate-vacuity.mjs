/**
 * Can a generated project's own quality gates pass without exercising anything?
 *
 * This is not a hypothetical question here. `npm run lint` in a generated app was green for a while
 * because it was linting zero files, and nothing noticed, because a gate that exercises nothing and
 * a gate that passes look identical from outside. The lesson generalises: for every gate a generated
 * repository ships, the useful question is not "does it pass" but "could it pass while doing
 * nothing".
 *
 * Measured against the six canonical acceptance apps, the three gates answer differently:
 *
 * - `typecheck` self-guards. `tsc` with no inputs is `error TS18003` and exit code 2.
 * - `lint` self-guards *today*. `oxlint` with no matching path exits 1 with "No files found to
 *   lint" — but that is a property of the current version of somebody else's tool, and it is the
 *   property that was different when this defect last shipped. So the scope is checked here as well,
 *   from the script's own declared paths, where the answer does not depend on a tool's release notes.
 * - `test` does **not** self-guard. `node --test` against a glob that matches nothing exits 0 and
 *   reports `# tests 0`. A template that stopped shipping its project test would leave every
 *   generated repository reporting a passing check having run nothing at all.
 *
 * Both functions below are pure so they can be run against planted fixtures. A vacuity check that
 * has only ever seen a healthy project is the thing it exists to prevent.
 */

import fs from 'node:fs';
import path from 'node:path';

const LINTABLE = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'];

/**
 * Read a `node --test` run's TAP summary.
 *
 * An absent summary is not "no news": the runner did not report, which is as unproven as a run of
 * nothing. It is returned as `tests: null` and refused by the caller.
 */
export function parseTestSummary(output) {
  const read = (label) => {
    const match = String(output ?? '').match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
    return match ? Number(match[1]) : null;
  };
  return { tests: read('tests'), pass: read('pass'), fail: read('fail') };
}

/**
 * Did the project's own test run actually execute tests?
 *
 * @returns {{ok: boolean, reason: string|null, summary: object}}
 */
export function testsWereExecuted(output) {
  const summary = parseTestSummary(output);
  if (summary.tests === null) {
    return { ok: false, reason: 'The test run printed no TAP summary, so nothing says it ran.', summary };
  }
  if (summary.tests === 0) {
    return { ok: false, reason: 'The test run reported zero tests. `node --test` against a glob that matches nothing exits 0.', summary };
  }
  if (summary.fail !== 0) {
    return { ok: false, reason: `${summary.fail} test(s) failed.`, summary };
  }
  return { ok: true, reason: null, summary };
}

function lintableFilesUnder(root, target) {
  const absolute = path.join(root, target);
  let stats;
  try { stats = fs.statSync(absolute); } catch { return null; }
  if (stats.isFile()) return LINTABLE.includes(path.extname(absolute)) ? 1 : 0;

  let count = 0;
  const queue = [absolute];
  while (queue.length > 0) {
    const directory = queue.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (LINTABLE.includes(path.extname(entry.name))) count += 1;
    }
  }
  return count;
}

/**
 * Does the project's `lint` script name paths that hold something to lint?
 *
 * Read from the script itself rather than from the linter's output, so the answer does not depend on
 * whether the current release of somebody else's tool happens to treat an empty path as an error.
 *
 * @returns {{ok: boolean, reason: string|null, paths: Array<{path: string, files: number|null}>}}
 */
export function lintScopeIsReal(projectRoot, lintScript) {
  const script = String(lintScript ?? '').trim();
  if (!script) return { ok: false, reason: 'The project declares no lint script.', paths: [] };

  const targets = script
    .split(/\s+/)
    .slice(1) // the linter's own name
    .filter((token) => !token.startsWith('-'));
  if (targets.length === 0) {
    return { ok: false, reason: 'The lint script names no paths, so what it lints depends on the linter\'s default.', paths: [] };
  }

  const paths = targets.map((target) => ({ path: target, files: lintableFilesUnder(projectRoot, target) }));
  const missing = paths.filter((entry) => entry.files === null);
  if (missing.length > 0) {
    return { ok: false, reason: `The lint script names paths that do not exist: ${missing.map((entry) => entry.path).join(', ')}.`, paths };
  }
  // Per path rather than in total. A script that names `src` and `tooling` and finds files in only
  // one of them is a script whose scope has silently halved, and the total would still be positive
  // — which is the shape the original defect took, one directory at a time.
  const empty = paths.filter((entry) => entry.files === 0);
  if (empty.length > 0) {
    return { ok: false, reason: `The lint script names paths with no lintable files in them: ${empty.map((entry) => entry.path).join(', ')}.`, paths };
  }
  return { ok: true, reason: null, paths };
}
