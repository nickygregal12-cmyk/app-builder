/**
 * The generated project's own verdict on itself.
 *
 * Every project this factory produces is an ordinary repository with its own
 * `typecheck`, `lint` and `test` scripts, and the whole portability claim is
 * that those run without the Builder Console. So the `tests` gate's checks are
 * answered by running exactly those scripts in exactly that repository —
 * nothing reimplemented here, and nothing the factory could pass on the
 * project's behalf.
 *
 * `e2e-tests` is deliberately absent. It needs a browser and a served build,
 * which the Playwright lanes own; answering it from here would mean a second
 * place browser evidence is produced.
 *
 * **Exit zero is not the whole verdict for the test script.** A suite that ran
 * no tests exits zero, and so does one that ran two hundred. The TAP plan is
 * what tells those apart, so it is parsed and carried as the coverage number: a
 * generated project ships one test today, and the report says so rather than
 * reporting a clean pass and letting the reader assume more.
 */

/** Which generated script answers which gate check, and what a failure is called. */
export const GENERATED_CHECKS = Object.freeze([
  { check: 'typecheck', script: 'typecheck', finding: 'typecheck-failed', title: 'The generated project does not typecheck' },
  { check: 'lint', script: 'lint', finding: 'lint-failed', title: 'The generated project does not lint' },
  { check: 'unit-tests', script: 'test', finding: 'unit-tests-failed', title: "The generated project's own tests do not pass" },
]);

const GUIDANCE = 'The generated repository is what somebody clones and runs. A script that fails here fails for them, with no factory to explain it.';

/** `# tests 12` from a Node test-runner TAP summary. Null when there is no plan. */
export function tapTestCount(output) {
  const match = String(output ?? '').match(/^# tests (\d+)$/m);
  return match ? Number(match[1]) : null;
}

/**
 * @param {object} input
 * @param {Array<{script: string, exitCode: number, output: string}>} input.results
 */
export function summariseGeneratedChecks({ results = [], compositionHash = null } = {}) {
  const byScript = new Map(results.map((entry) => [entry.script, entry]));
  const findings = [];
  const ran = [];

  for (const entry of GENERATED_CHECKS) {
    const result = byScript.get(entry.script);
    if (!result) continue;
    ran.push(entry.script);
    if (result.exitCode === 0) continue;
    findings.push({
      check: entry.finding,
      severity: 'blocker',
      title: entry.title,
      guidance: GUIDANCE,
      where: `npm run ${entry.script}`,
      detail: `exit ${result.exitCode}: ${String(result.output ?? '').split('\n').filter(Boolean).slice(-3).join(' / ') || 'no output'}`,
    });
  }

  return {
    schemaVersion: 1,
    authority: 'generated-checks',
    compositionHash,
    scriptsRun: ran,
    // Null rather than zero when there was no plan at all: "no tests ran" and
    // "the runner printed nothing a plan could be read from" are different, and
    // a zero would let the second pass as the first.
    unitTests: tapTestCount(byScript.get('test')?.output),
    findings,
    clean: findings.length === 0,
  };
}
