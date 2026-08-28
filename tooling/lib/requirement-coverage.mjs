/**
 * Answer one question about one declared requirement: is anything enforcing it?
 *
 * `answers.hard_constraints` has reached `manifest.constraints.hard` since the
 * manifest had a constraints block, and until this module existed nothing in
 * the factory read it. Four constraints on the frozen nbm project — no
 * unsupported claims, no republished photographs, imagery must be rights-safe,
 * mobile must feel designed rather than collapsed — survived intake, the Build
 * Contract and the manifest, and influenced nothing. That is the same failure
 * the conversion goals had: a declared requirement preserved perfectly and
 * consumed by nobody.
 *
 * ## What this deliberately does not do
 *
 * It does not interpret the constraint. A hard constraint is a sentence a person
 * wrote, and a module claiming to understand it would be inventing an authority
 * it does not have. Instead `config/hard-constraint-topics.json` names the
 * deterministic checks that already bind each topic a constraint can be about,
 * and a constraint is matched to its enforcement rather than parsed.
 *
 * It also does not become a requirements platform. There is one input, one
 * output and no registry of its own: the checks it cites are the ones
 * `config/launch-readiness-rules.json` and `config/gate-producers.json` already
 * declare, and a topic exists only because some real constraint needed it.
 *
 * ## Why "unenforced" is a result and not a failure to produce one
 *
 * The useful half of this is the constraint that matches nothing, or matches a
 * topic no producer verifies. Reporting those is what turns "the field is
 * ignored" into "these two of your four constraints are not being checked by
 * anything, and here is which". Marking them satisfied because no check
 * complained would recreate the silent drop in a more convincing disguise.
 */

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Coverage states, in the vocabulary the launch audit already uses for journey
 * steps, so a reader does not have to learn a second one.
 *
 * - `enforced` — a check in this same audit binds the constraint and is clean.
 * - `breached` — a check in this same audit binds it and is reporting findings,
 *   so the constraint the operator set is not currently being met.
 * - `needs-executable-evidence` — a real check binds it, and it belongs to a
 *   producer this audit cannot see. The constraint is neither met nor unmet
 *   here; something else has to say.
 * - `unenforced` — the constraint classified, and no producer verifies that
 *   topic at all.
 * - `unclassified` — nothing matched. The factory cannot say what would even
 *   check this, which is the most important thing it can report about it.
 */
export const COVERAGE_STATES = ['enforced', 'breached', 'needs-executable-evidence', 'unenforced', 'unclassified'];

function matchTopic(constraint, topics) {
  const lowered = constraint.toLowerCase();
  // First match wins and topics are declared in order, so a constraint naming
  // two topics is attributed to the more specific one rather than to whichever
  // term happened to appear earlier in the sentence.
  return list(topics).find((topic) => list(topic.match).some((term) => lowered.includes(String(term).toLowerCase()))) ?? null;
}

/**
 * Map every declared hard constraint onto the checks that bind it.
 *
 * `findings` is what the surrounding audit has already produced, so a constraint
 * whose binding check is failing in this very run is reported as breached rather
 * than as an open question.
 */
export function coverHardConstraints({ manifest, topics, findings = [] } = {}) {
  const declared = list(manifest?.constraints?.hard).map(text).filter(Boolean);
  const failing = new Set(list(findings).map((item) => item?.check).filter(Boolean));

  return declared.map((constraint) => {
    const topic = matchTopic(constraint, topics);
    if (!topic) {
      return {
        constraint,
        topic: null,
        status: 'unclassified',
        verifiedBy: null,
        checks: [],
        detail: 'No declared topic matches this constraint, so no check in the factory is known to enforce it.',
      };
    }

    const producer = topic.verifiedBy?.producer ?? null;
    const checks = list(topic.verifiedBy?.checks).map(String);
    const base = { constraint, topic: topic.id, verifiedBy: producer, checks };

    if (!producer) {
      return {
        ...base,
        status: 'unenforced',
        detail: `"${topic.title}" is a recognised constraint topic and no producer verifies it yet.`,
      };
    }

    if (producer !== 'launch-readiness') {
      return {
        ...base,
        status: 'needs-executable-evidence',
        detail: `"${topic.title}" is verified by ${checks.join(', ') || producer}, which the ${producer} producer runs. This audit cannot see that evidence.`,
      };
    }

    const breaking = checks.filter((check) => failing.has(check));
    if (breaking.length) {
      return {
        ...base,
        status: 'breached',
        detail: `This build reports ${breaking.join(', ')}, so the constraint is not being met.`,
      };
    }
    return {
      ...base,
      status: 'enforced',
      detail: `${checks.join(', ')} binds this constraint and reports nothing in this build.`,
    };
  });
}

/** A one-line count per state, so a caller can assert coverage without walking the list. */
export function coverageSummary(coverage) {
  const summary = Object.fromEntries(COVERAGE_STATES.map((state) => [state, 0]));
  for (const entry of list(coverage)) summary[entry.status] = (summary[entry.status] ?? 0) + 1;
  return summary;
}
