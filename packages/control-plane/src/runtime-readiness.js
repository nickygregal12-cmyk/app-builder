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
 * Decide whether one role may be promoted.
 *
 * Evidence is a map of `requirementId -> reference`. A reference is anything
 * resolvable — a config key, a test name, a recorded acceptance run — and an
 * empty or absent one counts as missing. There is no "assumed satisfied".
 */
export function evaluateRuntimeReadiness({ role, gate, evidence = null }) {
  const requirements = indexRuntimeReadinessGate(gate);
  const roleId = text(role?.id, 'Role id');
  const recorded = evidence ?? gate?.evidence?.[roleId] ?? {};
  const satisfied = [];
  const missing = [];
  for (const requirement of requirements.values()) {
    const reference = String(recorded?.[requirement.id] ?? '').trim();
    if (reference) satisfied.push({ id: requirement.id, reference });
    else missing.push({ id: requirement.id, summary: requirement.summary });
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
export function unearnedRuntimeReadyRoles({ roles, gate }) {
  const offenders = [];
  for (const role of Object.values(roles ?? {})) {
    if (!role?.runtimeReady) continue;
    const decision = evaluateRuntimeReadiness({ role, gate });
    if (!decision.ready) offenders.push(decision);
  }
  return offenders;
}
