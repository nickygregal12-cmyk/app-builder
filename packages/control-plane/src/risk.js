/**
 * Deterministic ChangeSet risk classification.
 *
 * Phase 3.8I registered conditional review roles — differential reviewer, independent second
 * opinion, environment guardian — but nothing could select them. This is that selector.
 *
 * The whole point is that a model does not decide whether a risky surface was touched. Declared
 * ChangeSet paths and requested capability actions decide, so an ordinary presentation change never
 * buys adversarial security review, and an auth, RLS, secrets or deployment change always does.
 */

const DEFAULT_SEVERITY_ORDER = ['low', 'elevated', 'high', 'critical'];

function normalizePath(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

/**
 * Path patterns match on segment boundaries so `recipes/authentication-legacy/` cannot be missed and
 * `srcauth/` cannot be matched by accident. File signals match anywhere in the final segment,
 * because a rename such as `rls-policies.sql` is exactly what a signal is for.
 */
function matchesSurface(normalized, surface) {
  for (const pattern of surface.pathPatterns ?? []) {
    const needle = normalizePath(pattern);
    if (needle === '') continue;
    if (normalized === needle) return true;
    if (needle.endsWith('/') && (normalized.startsWith(needle) || `${normalized}/`.startsWith(needle))) return true;
    if (!needle.endsWith('/') && (normalized === needle || normalized.startsWith(`${needle}/`))) return true;
  }
  // Whole-word matching, not substring. `tokens.css` is a design-token file and must not match the
  // `token` authentication signal — over-matching here would make every styling change buy
  // adversarial security review, which is the exact cost this classifier exists to avoid.
  const segments = normalized.split('/');
  const base = segments.at(-1) ?? '';
  const words = new Set([...base.split(/[^a-z0-9]+/), ...segments].filter(Boolean));
  for (const signal of surface.fileSignals ?? []) {
    const needle = String(signal).toLowerCase();
    if (!needle) continue;
    if (words.has(needle)) return true;
    // A multi-word signal such as `api-key` or `row-level-security` carries its own separators and
    // is matched against the whole basename instead.
    if (/[^a-z0-9]/.test(needle) && base.includes(needle)) return true;
  }
  return false;
}

function severityRank(severity, order) {
  const index = order.indexOf(severity);
  return index === -1 ? 0 : index;
}

/**
 * Classify a declared ChangeSet.
 *
 * @param {object} input
 * @param {string[]} input.paths declared ChangeSet file paths
 * @param {string[]} [input.capabilities] requested capability actions from the agent policy
 * @param {object} registry parsed config/risk-surfaces.json
 * @returns {{severity: string, surfaces: Array, requiredReviewers: string[], conditionalReviewRequired: boolean, rationale: string[]}}
 */
export function classifyChangeSetRisk({ paths = [], capabilities = [] } = {}, registry) {
  if (!registry?.surfaces) throw new Error('Risk classification requires a surface registry.');
  const order = registry.severityOrder ?? DEFAULT_SEVERITY_ORDER;
  const matched = new Map();
  const rationale = [];

  const normalizedPaths = [...new Set(paths.map(normalizePath).filter(Boolean))];
  for (const [surfaceId, surface] of Object.entries(registry.surfaces)) {
    const hits = normalizedPaths.filter((candidate) => matchesSurface(candidate, surface));
    if (hits.length === 0) continue;
    matched.set(surfaceId, {
      id: surfaceId,
      label: surface.label,
      severity: surface.severity,
      reviewers: [...(surface.reviewers ?? [])],
      matchedPaths: hits,
      matchedBy: 'path',
    });
    rationale.push(`${surfaceId}: ${hits.length} declared path(s) touch ${surface.label.toLowerCase()}`);
  }

  for (const action of new Set(capabilities)) {
    const entry = registry.capabilityActions?.[action];
    if (!entry) continue;
    const existing = matched.get(entry.surface);
    const severity = existing
      && severityRank(existing.severity, order) >= severityRank(entry.severity, order)
      ? existing.severity
      : entry.severity;
    matched.set(entry.surface, {
      id: entry.surface,
      label: registry.surfaces[entry.surface]?.label ?? entry.surface,
      severity,
      reviewers: [...new Set([...(existing?.reviewers ?? []), ...(entry.reviewers ?? [])])],
      matchedPaths: existing?.matchedPaths ?? [],
      matchedBy: existing ? 'path+capability' : 'capability',
    });
    rationale.push(`${entry.surface}: requested capability ${action}`);
  }

  const surfaces = [...matched.values()].sort(
    (a, b) => severityRank(b.severity, order) - severityRank(a.severity, order) || a.id.localeCompare(b.id),
  );

  const severity = surfaces.reduce(
    (highest, surface) => (severityRank(surface.severity, order) > severityRank(highest, order) ? surface.severity : highest),
    order[0] ?? 'low',
  );

  const reviewers = new Set(surfaces.flatMap((surface) => surface.reviewers));

  // Independence is bought at the threshold the registry names, not by anyone's sense of importance.
  const threshold = registry.escalation?.independentSecondOpinionAtOrAbove;
  if (threshold && severityRank(severity, order) >= severityRank(threshold, order)) {
    reviewers.add('independent-second-opinion');
    rationale.push(`severity ${severity} is at or above ${threshold}: an independent second opinion is required`);
  }

  return {
    severity,
    surfaces,
    requiredReviewers: [...reviewers].sort(),
    conditionalReviewRequired: reviewers.size > 0,
    rationale,
  };
}
