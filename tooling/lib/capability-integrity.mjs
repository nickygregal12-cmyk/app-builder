const list = (value) => Array.isArray(value) ? value : [];

/**
 * Derive capability lifecycle from build truth. Callers supply artifacts they
 * already produced; this module owns no capability or evidence registry.
 */
export function deriveCapabilityIntegrity({
  requestedModules = [], modules = {}, recipes = {}, generatedModules = [],
  consumedModules = [], evidence = [], claimedProvenModules = [],
} = {}) {
  const generated = new Set(generatedModules);
  const consumed = new Set(consumedModules);
  const proved = new Set(list(evidence).filter((item) => item?.status === 'passed').map((item) => item.module));
  const claims = new Set(claimedProvenModules);
  const ids = [...new Set([...requestedModules, ...generated, ...claims])].sort();

  return ids.map((module) => {
    const registration = modules[module] ?? null;
    const recipe = Object.values(recipes).find((entry) => entry?.module === module && entry?.status === 'ready') ?? null;
    const dependencies = list(recipe?.requires);
    const missingDependencies = dependencies.filter((dependency) => !generated.has(dependency));
    const registered = registration !== null;
    const resolvable = registered && recipe !== null && missingDependencies.length === 0;
    const isGenerated = generated.has(module);
    const isConsumed = consumed.has(module);
    const isProved = proved.has(module);
    const problems = [];
    if (!registered) problems.push('unregistered');
    else if (!recipe) problems.push('unresolvable');
    if (recipe && missingDependencies.length) problems.push('incompatible-dependency-closure');
    if (isGenerated && !isConsumed) problems.push('generated-unconsumed');
    if (claims.has(module) && !isProved) problems.push('proof-claim-without-evidence');
    return {
      module, requested: requestedModules.includes(module), registered, resolvable,
      generated: isGenerated, consumed: isConsumed, proved: isProved,
      missingDependencies, problems,
    };
  });
}

export function capabilityIntegrityProblems(ledger) {
  return list(ledger).flatMap((entry) => entry.problems.map((problem) => ({ module: entry.module, problem })));
}
