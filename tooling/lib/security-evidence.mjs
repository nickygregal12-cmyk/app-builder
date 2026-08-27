/**
 * The two security-gate checks a repository can answer about itself.
 *
 * The `security` gate declares three deterministic checks. One of them —
 * `executed-rls-acceptance` — needs a live Postgres with the generated policies
 * applied, which is the `database-security` CI job's to run and not something a
 * build directory can answer. The other two are questions about the artifact
 * that was produced, and both already have real producers in this repository:
 * the tree-wide credential scan, and npm's own advisory database.
 *
 * Both are normalised here rather than read raw, for one reason. The gate
 * registry decides a check by naming the findings that fail it, and a rule set
 * that grows — as a secret scanner's must — would mean the registry needed
 * editing every time a rule was added, with the failure mode being a new rule
 * that quietly fails nothing. So every finding carries one `check` id and its
 * own rule travels beside it as detail.
 */

/** Advisory severities that fail the gate. Below these is reported and does not block. */
export const BLOCKING_ADVISORY_SEVERITIES = Object.freeze(['high', 'critical']);

export const SECURITY_CHECKS = Object.freeze({
  'committed-credential': {
    severity: 'blocker',
    title: 'A credential-shaped value is committed to the generated repository',
    guidance: 'The generated project is an ordinary repository somebody will push. A value that looks usable in it is usable. Move it to an environment variable and leave the name in .env.example.',
  },
  'vulnerable-dependency': {
    severity: 'blocker',
    title: 'A dependency carries a high or critical advisory',
    guidance: 'The generated project installs this tree on somebody else\'s machine and ships it. Take the fixed version, or drop the dependency.',
  },
});

/**
 * Every credential-shaped finding in a built repository.
 *
 * @param {object} input
 * @param {Array<object>} input.findings  `scanRepository` output for the build.
 * @param {number} input.filesScanned     How many files the walk read.
 */
export function auditCommittedSecrets({ findings = [], filesScanned = 0, compositionHash = null } = {}) {
  const normalised = findings.map((finding) => ({
    check: 'committed-credential',
    ...SECURITY_CHECKS['committed-credential'],
    rule: finding.rule,
    where: `${finding.file}:${finding.line}`,
    detail: finding.detail,
  }));
  return {
    schemaVersion: 1,
    authority: 'secret-scan',
    compositionHash,
    filesScanned,
    findings: normalised,
    clean: normalised.length === 0,
  };
}

/**
 * npm's advisory verdict on the tree the generated project installs.
 *
 * `dependencies` is carried through as the coverage number: a clean audit over
 * four packages and a clean audit over four hundred are different statements,
 * and a status alone cannot tell them apart.
 */
export function auditDependencyAdvisories({ report = null, compositionHash = null } = {}) {
  const advisories = report?.vulnerabilities ?? {};
  const findings = [];
  for (const [name, entry] of Object.entries(advisories)) {
    if (!BLOCKING_ADVISORY_SEVERITIES.includes(entry?.severity)) continue;
    findings.push({
      check: 'vulnerable-dependency',
      ...SECURITY_CHECKS['vulnerable-dependency'],
      rule: entry.severity,
      where: `${name}@${entry.range ?? 'unknown range'}`,
      detail: `${entry.severity}: ${(entry.via ?? []).map((via) => (typeof via === 'string' ? via : via?.title)).filter(Boolean).join('; ') || 'no advisory title'}`,
    });
  }
  const counts = report?.metadata?.vulnerabilities ?? {};
  return {
    schemaVersion: 1,
    authority: 'dependency-audit',
    compositionHash,
    dependencies: report?.metadata?.dependencies?.total ?? 0,
    counts,
    // Reported and not blocking. A moderate advisory is worth a reader knowing
    // about and is not worth refusing a build over; saying so is the difference
    // between a threshold and a silence.
    reportedNotBlocking: ['info', 'low', 'moderate'].reduce((sum, key) => sum + (counts[key] ?? 0), 0),
    findings,
    clean: findings.length === 0,
  };
}
