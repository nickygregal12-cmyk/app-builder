/**
 * The `runtimeReady` promotion gate.
 *
 * A specialist role's `runtimeReady` flag is a claim that the factory can hand
 * that role a real task and get bounded, reviewable work back. Infrastructure
 * landing is not that claim. A sandbox that starts, a broker that enforces and
 * an image that is pinned are all *requirements* of it, and satisfying a
 * requirement is not the same as satisfying the gate.
 *
 * So the gate is deny-by-default and mechanical: `config/runtime-readiness.json`
 * lists what a role must carry, and this module refuses a promotion whose
 * evidence does not resolve. Nothing here flips a flag; it decides whether one
 * may be flipped, and the answer is currently no for every role — which is the
 * point, and is asserted rather than assumed.
 */

function text(value, label) {
  const candidate = String(value ?? '').trim();
  if (!candidate) throw new Error(`${label} is required.`);
  return candidate;
}

export function indexRuntimeReadinessGate(gate) {
  const requirements = new Map();
  for (const entry of gate?.requirements ?? []) {
    const id = text(entry?.id, 'Runtime readiness requirement id');
    if (requirements.has(id)) throw new Error(`Duplicate runtime readiness requirement: ${id}`);
    requirements.set(id, { id, summary: text(entry?.summary, `Requirement ${id} summary`), detail: entry?.detail ?? null });
  }
  if (requirements.size === 0) throw new Error('A runtime readiness gate with no requirements would promote every role.');
  return requirements;
}

/**
 * The closed set of things an evidence reference may point at.
 *
 * Closed on purpose. The gate's own rule says evidence is "a reference to
 * something that exists — not a claim in prose", and the only way to hold that
 * rule is to refuse references whose existence nobody can check. An unknown
 * scheme is therefore not a lenient default; it is malformed.
 *
 * - `config`   a JSON pointer into a repository config file
 * - `test`     a named deterministic test in a repository test file
 * - `schema`   a repository schema file the role's output is validated against
 * - `attestation` a host-written proof file, which must say it passed and be fresh
 * - `record`   a durable recorded run, such as a model attempt record
 */
export const EVIDENCE_SCHEMES = Object.freeze(['config', 'test', 'schema', 'attestation', 'record']);

/** Why a requirement is not satisfied. Closed, so a report can never say merely "missing". */
export const EVIDENCE_REFUSALS = Object.freeze(['absent', 'malformed', 'unresolved', 'unverified']);

/**
 * Parse `scheme:target#fragment` into its parts.
 *
 * The fragment is optional and scheme-specific: a JSON pointer for `config`, a
 * test name for `test`. Splitting here rather than in the resolver keeps the
 * shape rule in the module that owns the gate, and keeps the filesystem in the
 * caller that owns the disk.
 */
export function parseEvidenceReference(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('An evidence reference is required.');
  const separator = raw.indexOf(':');
  if (separator <= 0) {
    throw new Error(`Evidence reference "${raw}" does not name a scheme. Expected one of ${EVIDENCE_SCHEMES.join(', ')}.`);
  }
  const scheme = raw.slice(0, separator);
  if (!EVIDENCE_SCHEMES.includes(scheme)) {
    throw new Error(`Unknown evidence scheme "${scheme}". A reference nobody can resolve is not evidence.`);
  }
  const rest = raw.slice(separator + 1);
  const hash = rest.indexOf('#');
  const target = (hash >= 0 ? rest.slice(0, hash) : rest).trim();
  const fragment = hash >= 0 ? rest.slice(hash + 1).trim() : null;
  if (!target) throw new Error(`Evidence reference "${raw}" names a scheme but no target.`);
  return Object.freeze({ raw, scheme, target, fragment: fragment || null });
}

/**
 * Decide whether one role may be promoted.
 *
 * Evidence is a map of `requirementId -> reference`, and a reference must both
 * parse and *resolve*. `resolve` is the caller's function from a parsed
 * reference to `{ resolved, detail }`; the control plane stays free of the
 * filesystem and the tooling that owns the disk answers the question.
 *
 * Fail-closed in both directions. Without a resolver nothing can be confirmed,
 * so nothing is promoted and every reference is reported `unverified` rather
 * than quietly counted. This is the difference between the gate the file
 * describes and the one it used to implement: eight copies of the string "yes"
 * used to promote a role.
 */
export function evaluateRuntimeReadiness({ role, gate, evidence = null, resolve = null }) {
  const requirements = indexRuntimeReadinessGate(gate);
  const roleId = text(role?.id, 'Role id');
  const recorded = evidence ?? gate?.evidence?.[roleId] ?? {};
  const satisfied = [];
  const missing = [];

  for (const requirement of requirements.values()) {
    const entry = { id: requirement.id, summary: requirement.summary };
    const raw = String(recorded?.[requirement.id] ?? '').trim();
    if (!raw) {
      missing.push({ ...entry, reason: 'absent', detail: 'No evidence is recorded for this requirement.' });
      continue;
    }

    let reference;
    try {
      reference = parseEvidenceReference(raw);
    } catch (error) {
      missing.push({ ...entry, reason: 'malformed', reference: raw, detail: error.message });
      continue;
    }

    if (typeof resolve !== 'function') {
      missing.push({ ...entry, reason: 'unverified', reference: raw, detail: 'No resolver was supplied, so this reference could not be checked.' });
      continue;
    }

    let outcome;
    try {
      outcome = resolve(reference);
    } catch (error) {
      outcome = { resolved: false, detail: error.message };
    }
    if (outcome?.resolved) satisfied.push({ id: requirement.id, reference: raw, detail: outcome.detail ?? null });
    else missing.push({ ...entry, reason: 'unresolved', reference: raw, detail: outcome?.detail ?? 'The reference did not resolve.' });
  }

  return { roleId, ready: missing.length === 0, satisfied, missing };
}

/**
 * The invariant a doctor holds: no role claims readiness it has not earned.
 *
 * This is the check that stops "the sandbox launches now" from quietly
 * becoming "the roles are ready". It returns the offending roles rather than
 * throwing, so the caller can report all of them at once.
 */
export function unearnedRuntimeReadyRoles({ roles, gate, resolve = null }) {
  const offenders = [];
  for (const role of Object.values(roles ?? {})) {
    if (!role?.runtimeReady) continue;
    const decision = evaluateRuntimeReadiness({ role, gate, resolve });
    if (!decision.ready) offenders.push(decision);
  }
  return offenders;
}
