/**
 * Product Opportunity Scout.
 *
 * "Improve this page" is the prompt most likely to produce a redesign nobody
 * asked for. This answers it from what the build actually needs instead: every
 * opportunity is grouped from launch-readiness findings that already exist, so
 * nothing here invents work, and a broad prompt resolves to at most three
 * things that are materially different from each other.
 *
 * It is deterministic. The registered `product-opportunity-scout` role will one
 * day bring judgement to this, but ranking findings the factory already has is
 * not judgement, and doing it with a model would make the answer less
 * reproducible rather than more useful.
 */

const list = (value) => (Array.isArray(value) ? value : []);

function score(group, rules) {
  const effort = rules.roleEffort[group.owningRole] ?? { cost: 2, risk: 2, readiness: 'factory' };
  const weights = rules.weights;
  const value = group.findings.reduce((total, finding) => total + (rules.severityValue[finding.severity] ?? 1), 0);
  const frequency = new Set(group.findings.map((finding) => finding.where)).size;
  const readiness = rules.readinessValue[effort.readiness] ?? 0;
  return {
    total: value * weights.value + frequency * weights.frequency + readiness * weights.readiness + effort.cost * weights.cost + effort.risk * weights.risk,
    value,
    frequency,
    readiness: effort.readiness,
    cost: effort.cost,
    risk: effort.risk,
  };
}

function headline(owningRole, findings) {
  const categories = [...new Set(findings.map((finding) => finding.category))].sort();
  const role = owningRole.replaceAll('-', ' ');
  return `${role.charAt(0).toUpperCase()}${role.slice(1)}: ${categories.join(' and ')}`;
}

/**
 * Group by the role that owns the fix.
 *
 * That is what keeps three opportunities from being one problem described three
 * ways, and it is also what makes each one actionable: an opportunity nobody
 * owns is a complaint.
 */
function group(findings, rules, kind) {
  const byRole = new Map();
  for (const finding of list(findings)) {
    const existing = byRole.get(finding.owningRole) ?? [];
    existing.push(finding);
    byRole.set(finding.owningRole, existing);
  }

  return [...byRole.entries()]
    .map(([owningRole, owned]) => {
      const candidate = { owningRole, findings: owned };
      const ranking = score(candidate, rules);
      return {
        id: `${kind}-${owningRole}`,
        kind,
        owningRole,
        title: headline(owningRole, owned),
        // What it would change, in the words of the checks that found it.
        summary: [...new Set(owned.map((finding) => finding.title))].slice(0, 3),
        where: [...new Set(owned.map((finding) => finding.where))].sort().slice(0, 6),
        findingCount: owned.length,
        categories: [...new Set(owned.map((finding) => finding.category))].sort(),
        severities: [...new Set(owned.map((finding) => finding.severity))],
        guidance: owned[0].guidance,
        blockedOn: ranking.readiness === 'owner' ? 'owner' : 'factory',
        ranking,
      };
    })
    .sort((a, b) => b.ranking.total - a.ranking.total || a.owningRole.localeCompare(b.owningRole));
}

/**
 * At most three improvements, and separately what is worth proving.
 *
 * A defect and an unproven state are different asks. Merging them would let
 * "add a fixture" outrank "the contact route is missing", and would quietly
 * inflate the manual-edit prediction the acceptance gate depends on.
 */
export function deriveOpportunities({ audit, rules } = {}) {
  if (!audit?.findings) throw new Error('Product opportunities require a launch-readiness audit.');
  if (!rules?.opportunityRules) throw new Error('Product opportunities require opportunity rules.');
  const opportunityRules = rules.opportunityRules;

  const improvements = group(audit.findings, opportunityRules, 'improvement');
  const proofs = group(audit.evidenceGaps, opportunityRules, 'evidence');

  return {
    schemaVersion: 1,
    compositionHash: audit.compositionHash ?? null,
    // Ranked, capped, and honest about the cap: a fourth opportunity that was
    // considered and not offered is worth saying rather than hiding.
    opportunities: improvements.slice(0, opportunityRules.maximum),
    consideredCount: improvements.length,
    evidenceOpportunities: proofs.slice(0, opportunityRules.maximum),
    evidenceConsideredCount: proofs.length,
  };
}
