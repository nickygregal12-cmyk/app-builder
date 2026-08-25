/**
 * Deterministic task routing.
 *
 * A task prompt becomes a small orientation packet: which task routes matched, which specialist
 * roles should own the work, which canonical authorities to open next and which bounded skill set
 * to load. It answers nothing else.
 *
 * The point is progressive disclosure, not "read the repository first". The packet is navigation
 * metadata; `AGENTS.md`, the manifest, the contracts and the schemas remain the authorities. A
 * prompt that cannot be classified stays unclassified so the next step is bounded orientation
 * rather than an expensive guess.
 */

const WORD_EDGE = /[a-z0-9]/;

function normalizePrompt(prompt) {
  return String(prompt ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whole-phrase match so `bug` does not fire on `debugging` and `seo` does not fire on `seoul`.
 */
function containsPhrase(haystack, phrase) {
  const needle = normalizePrompt(phrase);
  if (needle === '') return false;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = index === 0 ? '' : haystack[index - 1];
    const afterIndex = index + needle.length;
    const after = afterIndex >= haystack.length ? '' : haystack[afterIndex];
    const boundedStart = before === '' || !WORD_EDGE.test(before);
    const boundedEnd = after === '' || !WORD_EDGE.test(after);
    if (boundedStart && boundedEnd) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

export function matchTaskRoutes(prompt, taskRoutes = []) {
  const normalized = normalizePrompt(prompt);
  return taskRoutes
    .filter((route) => (route.keywords ?? []).some((keyword) => containsPhrase(normalized, keyword)))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Build the first-orientation packet.
 *
 * Ceilings are enforced by construction: higher-priority routes claim budget first and anything
 * that no longer fits is recorded in `suppressed` rather than silently dropped. Over-routing then
 * shows up as a missing required item in the benchmark instead of as a quietly enormous packet.
 */
export function buildRoutingPacket(prompt, { routing, skills = {} } = {}) {
  if (!routing?.taskRoutes) throw new Error('Routing config must declare taskRoutes.');
  const ceilings = routing.packet ?? {};
  const loadBudget = routing.skillLoadBudget ?? {};

  const matched = matchTaskRoutes(prompt, routing.taskRoutes);
  const roles = [];
  const selectedSkills = [];
  const authorities = [];
  const suppressed = [];
  const loaded = {};

  for (const route of matched) {
    for (const role of route.roles ?? []) {
      if (roles.includes(role)) continue;
      if (roles.length >= (ceilings.maxSelectedRoles ?? Infinity)) {
        suppressed.push({ kind: 'role', id: role, reason: 'max-selected-roles', route: route.id });
        continue;
      }
      roles.push(role);
    }
    for (const skill of route.skills ?? []) {
      if (selectedSkills.includes(skill)) continue;
      const loadClass = skills[skill]?.loadClass ?? null;
      if (selectedSkills.length >= (ceilings.maxSelectedSkills ?? Infinity)) {
        suppressed.push({ kind: 'skill', id: skill, reason: 'max-selected-skills', route: route.id });
        continue;
      }
      if (loadClass !== null && Object.hasOwn(loadBudget, loadClass)) {
        if ((loaded[loadClass] ?? 0) >= loadBudget[loadClass]) {
          suppressed.push({ kind: 'skill', id: skill, reason: `load-budget:${loadClass}`, route: route.id });
          continue;
        }
        loaded[loadClass] = (loaded[loadClass] ?? 0) + 1;
      }
      selectedSkills.push(skill);
    }
    for (const authority of route.authorities ?? []) {
      if (authorities.includes(authority)) continue;
      if (authorities.length >= (ceilings.maxAuthorities ?? Infinity)) {
        suppressed.push({ kind: 'authority', id: authority, reason: 'max-authorities', route: route.id });
        continue;
      }
      authorities.push(authority);
    }
  }

  const primary = matched[0] ?? null;
  const contextRoute = primary?.contextRoute ?? null;

  return {
    prompt: String(prompt ?? ''),
    unclassified: matched.length === 0,
    matchedRoutes: matched.map((route) => route.id),
    roles,
    skills: selectedSkills,
    authorities,
    suppressed,
    contextRoute,
    contextCeilingTokens: contextRoute
      ? routing.routes?.[contextRoute]?.maxTokens ?? routing.defaultContextTokenCeiling ?? null
      : null,
    nextStep: matched.length === 0
      ? 'bounded repository orientation: identify the owning subsystem before selecting a specialist'
      : 'open the listed authorities, then hand the task to the listed role',
  };
}

/**
 * Deterministic ceiling check for a built packet. Returns the list of violations; empty means the
 * packet respects every first-orientation ceiling.
 */
export function assertPacketCeilings(packet, routing) {
  const ceilings = routing?.packet ?? {};
  const violations = [];
  if (packet.roles.length > (ceilings.maxSelectedRoles ?? Infinity)) {
    violations.push(`roles:${packet.roles.length}>${ceilings.maxSelectedRoles}`);
  }
  if (packet.skills.length > (ceilings.maxSelectedSkills ?? Infinity)) {
    violations.push(`skills:${packet.skills.length}>${ceilings.maxSelectedSkills}`);
  }
  if (packet.authorities.length > (ceilings.maxAuthorities ?? Infinity)) {
    violations.push(`authorities:${packet.authorities.length}>${ceilings.maxAuthorities}`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(packet), 'utf8');
  if (bytes > (ceilings.maxPacketBytes ?? Infinity)) {
    violations.push(`bytes:${bytes}>${ceilings.maxPacketBytes}`);
  }
  return violations;
}

/**
 * Run one benchmark case against the router and return its failures.
 *
 * Positive and negative expectations are equally binding: a route that selects the right specialist
 * but also drags in an expensive irrelevant one has failed.
 */
export function evaluateBenchmarkCase(benchmarkCase, { routing, skills }) {
  const packet = buildRoutingPacket(benchmarkCase.prompt, { routing, skills });
  const failures = [];

  if (benchmarkCase.expectUnclassified) {
    if (!packet.unclassified) {
      failures.push(`expected no deterministic route, got ${packet.matchedRoutes.join(', ')}`);
    }
  } else if (packet.unclassified && (benchmarkCase.requiredRoutes?.length || benchmarkCase.requiredRoles?.length)) {
    failures.push('expected a deterministic route, got none');
  }

  for (const route of benchmarkCase.requiredRoutes ?? []) {
    if (!packet.matchedRoutes.includes(route)) failures.push(`missing required route ${route}`);
  }
  for (const role of benchmarkCase.requiredRoles ?? []) {
    if (!packet.roles.includes(role)) failures.push(`missing required role ${role}`);
  }
  for (const role of benchmarkCase.forbiddenRoles ?? []) {
    if (packet.roles.includes(role)) failures.push(`forbidden role ${role} was selected`);
  }
  for (const skill of benchmarkCase.requiredSkills ?? []) {
    if (!packet.skills.includes(skill)) failures.push(`missing required skill ${skill}`);
  }
  for (const skill of benchmarkCase.forbiddenSkills ?? []) {
    if (packet.skills.includes(skill)) failures.push(`forbidden skill ${skill} was loaded`);
  }

  const caps = [
    ['maxAuthorities', packet.authorities.length],
    ['maxSelectedRoles', packet.roles.length],
    ['maxSelectedSkills', packet.skills.length],
  ];
  for (const [key, actual] of caps) {
    const limit = benchmarkCase[key];
    if (limit !== undefined && actual > limit) failures.push(`${key} exceeded: ${actual} > ${limit}`);
  }

  for (const violation of assertPacketCeilings(packet, routing)) {
    failures.push(`packet ceiling exceeded: ${violation}`);
  }

  return { id: benchmarkCase.id, packet, failures };
}
