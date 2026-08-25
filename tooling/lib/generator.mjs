import fs from 'node:fs';
import path from 'node:path';

export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }

function safeResolve(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Unsafe managed path: ${relative}`);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(base + path.sep)) throw new Error(`Unsafe managed path: ${relative}`);
  return target;
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

function copyTree(sourceRoot, destinationRoot) {
  for (const source of walkFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, source);
    const destination = safeResolve(destinationRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function loadDefinition(factoryRoot, registryEntry, filename) {
  const root = safeResolve(factoryRoot, registryEntry.path);
  return { ...readJson(path.join(root, filename)), root };
}
const loadRecipe = (root, entry) => loadDefinition(root, entry, 'recipe.json');
const loadTemplate = (root, entry) => loadDefinition(root, entry, 'template.json');
const loadAdapter = (root, entry) => loadDefinition(root, entry, 'adapter.json');

export function loadCatalog(factoryRoot = process.cwd()) {
  return {
    templates: readJson(path.join(factoryRoot, 'config/templates.json')),
    recipes: readJson(path.join(factoryRoot, 'config/recipes.json')),
    adapters: readJson(path.join(factoryRoot, 'config/adapters.json')),
    layouts: readJson(path.join(factoryRoot, 'config/layout-patterns.json')),
    scenarios: readJson(path.join(factoryRoot, 'config/scenarios.json')),
  };
}

function readyRecipeForModule(moduleName, catalog) {
  return Object.entries(catalog.recipes.recipes ?? {}).find(([, entry]) => entry.module === moduleName && entry.status === 'ready')?.[0] ?? null;
}

function selectAdapters(manifest, templateId, catalog, factoryRoot) {
  const selected = [];
  for (const [adapterId, entry] of Object.entries(catalog.adapters.adapters ?? {})) {
    if (entry.status !== 'ready') continue;
    const backendMatch = entry.kind === 'backend' && entry.selectWhen?.backend === manifest.infrastructure.backend;
    const deploymentMatch = entry.kind === 'deployment' && entry.selectWhen?.deployment === manifest.infrastructure.deployment;
    if (!backendMatch && !deploymentMatch) continue;
    const adapter = loadAdapter(factoryRoot, entry);
    if (!adapter.compatibleTemplates.includes(templateId)) throw new Error(`Adapter ${adapterId} is not compatible with template ${templateId}.`);
    selected.push(adapter);
  }
  if (manifest.infrastructure.backend !== 'none' && !selected.some((adapter) => adapter.kind === 'backend')) {
    throw new Error(`No ready backend adapter for ${manifest.infrastructure.backend}.`);
  }
  if (manifest.infrastructure.deployment !== 'none' && !selected.some((adapter) => adapter.kind === 'deployment')) {
    throw new Error(`No ready deployment adapter for ${manifest.infrastructure.deployment}.`);
  }
  return selected.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

function resolveRecipeClosure(recipeIds, templateId, catalog, factoryRoot, selectedAdapterIds) {
  const resolved = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(recipeId) {
    if (visited.has(recipeId)) return;
    if (visiting.has(recipeId)) throw new Error(`Recipe dependency cycle detected at ${recipeId}.`);
    const entry = catalog.recipes.recipes?.[recipeId];
    if (!entry || entry.status !== 'ready') throw new Error(`Recipe ${recipeId} is not ready.`);
    const recipe = loadRecipe(factoryRoot, entry);
    if (!recipe.compatibleTemplates.includes(templateId)) throw new Error(`Recipe ${recipeId} is not compatible with template ${templateId}.`);
    for (const adapterId of recipe.requiresAdapters ?? []) {
      if (!selectedAdapterIds.has(adapterId)) throw new Error(`Recipe ${recipeId} requires infrastructure adapter ${adapterId}.`);
    }
    visiting.add(recipeId);
    for (const dependency of recipe.requires ?? []) visit(dependency);
    visiting.delete(recipeId);
    visited.add(recipeId);
    resolved.push(recipe);
  }
  for (const recipeId of [...new Set(recipeIds)].sort()) visit(recipeId);
  const installed = new Set(resolved.map((recipe) => recipe.id));
  for (const recipe of resolved) {
    const conflict = (recipe.conflicts ?? []).find((candidate) => installed.has(candidate));
    if (conflict) throw new Error(`Recipe ${recipe.id} conflicts with ${conflict}.`);
  }
  return resolved;
}

function selectDesign(manifest, catalog) {
  const patternId = catalog.layouts.projectTypeDefaults?.[manifest.project.type];
  const pattern = catalog.layouts.patterns?.[patternId];
  if (!pattern) throw new Error(`No layout pattern for project type ${manifest.project.type}.`);
  const requestedAccent = manifest.brand?.accentColor;
  const accentColor = typeof requestedAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(requestedAccent) ? requestedAccent.toLowerCase() : '#315b72';
  return { patternId, ...pattern, accentColor };
}

function selectScenarios(manifest, catalog) {
  const values = [...(catalog.scenarios.common ?? [])];
  for (const [moduleName, scenarios] of Object.entries(catalog.scenarios.conditional ?? {})) {
    if (manifest.modules?.[moduleName]) values.push(...scenarios);
  }
  return [...new Set(values)];
}

export function buildGenerationPlan(manifest, { factoryRoot = process.cwd(), catalog = loadCatalog(factoryRoot) } = {}) {
  const templateId = catalog.templates.projectTypeDefaults?.[manifest.project.type];
  const templateEntry = catalog.templates.templates?.[templateId];
  if (!templateId || !templateEntry || templateEntry.status !== 'ready') throw new Error(`No ready template for project type ${manifest.project.type}.`);
  const template = loadTemplate(factoryRoot, templateEntry);
  if (!template.projectTypes.includes(manifest.project.type)) throw new Error(`Template ${template.id} does not support project type ${manifest.project.type}.`);
  const adapters = selectAdapters(manifest, template.id, catalog, factoryRoot);
  const adapterIds = new Set(adapters.map((adapter) => adapter.id));
  const enabledModules = Object.entries(manifest.modules ?? {}).filter(([, enabled]) => enabled).map(([name]) => name).sort();
  const recipeIds = [];
  const missingModules = [];
  for (const moduleName of enabledModules) {
    const recipeId = readyRecipeForModule(moduleName, catalog);
    if (recipeId) recipeIds.push(recipeId); else missingModules.push(moduleName);
  }
  return {
    template,
    adapters,
    recipes: resolveRecipeClosure(recipeIds, template.id, catalog, factoryRoot, adapterIds),
    enabledModules,
    missingModules,
    design: selectDesign(manifest, catalog),
    scenarios: selectScenarios(manifest, catalog),
  };
}

function entryImportPath(entry) {
  const relative = path.posix.relative('src/generated', entry.replace(/\\/g, '/')).replace(/\.(?:tsx?|jsx?)$/, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function renderRecipeRegistry(recipes) {
  const imports = recipes.map((recipe, index) => `import * as recipe${index} from '${entryImportPath(recipe.entry)}';`).join('\n');
  const modules = recipes.map((_, index) => `recipe${index}`).join(', ');
  return `${imports}${imports ? '\n' : ''}import type { ComponentType, PropsWithChildren, ReactNode } from 'react';\n\ntype ProjectContext = { name: string; primaryGoal: string; type: string };\ntype Wrapper = ComponentType<PropsWithChildren>;\ntype RecipeModule = { recipe: { id: string; label: string }; setup?: (project: ProjectContext) => void; Provider?: Wrapper; Gate?: Wrapper };\nconst recipeModules: RecipeModule[] = [${modules}];\nexport const installedRecipes = recipeModules.map((module) => module.recipe);\nexport function initializeRecipes(project: ProjectContext) { for (const module of recipeModules) module.setup?.(project); }\nfunction wrap(children: ReactNode, components: Wrapper[]) { return components.reduceRight<ReactNode>((child, Component) => <Component>{child}</Component>, children); }\nexport function RecipeRuntime({ children }: PropsWithChildren) { const providers = recipeModules.flatMap((module) => module.Provider ? [module.Provider] : []); const gates = recipeModules.flatMap((module) => module.Gate ? [module.Gate] : []); return <>{wrap(wrap(children, gates), providers)}</>; }\n`;
}

const renderProject = (project) => `export const project = ${JSON.stringify({ name: project.name, slug: project.slug, type: project.type, primaryGoal: project.primaryGoal }, null, 2)} as const;\n`;
const renderDesign = (design) => `export const design = ${JSON.stringify(design, null, 2)} as const;\n`;
function renderBrandCss(design) {
  return `:root {\n  --color-accent: ${design.accentColor};\n  --layout-max-width: ${design.maxWidth};\n  --layout-radius: ${design.radius};\n}\n`;
}
function renderScenarios(scenarios) {
  const values = JSON.stringify(scenarios);
  return `export const supportedScenarios = ${values} as const;\nexport type AppScenario = (typeof supportedScenarios)[number];\n`;
}

function mergePackage(packageJson, contributors, templatePackage) {
  const next = structuredClone(packageJson);
  next.dependencies ??= {}; next.devDependencies ??= {}; next.scripts ??= {};
  const desired = { dependencies: {}, devDependencies: {}, scripts: {} };
  for (const contributor of contributors) {
    Object.assign(desired.dependencies, contributor.package?.dependencies ?? {});
    Object.assign(desired.devDependencies, contributor.package?.devDependencies ?? {});
    Object.assign(desired.scripts, contributor.package?.scripts ?? {});
  }
  for (const section of ['dependencies', 'devDependencies', 'scripts']) {
    const base = templatePackage[section] ?? {};
    const current = next[section] ?? {};
    for (const key of next.__appBuilderManaged?.[section] ?? []) {
      if (key in desired[section]) continue;
      if (key in base) current[key] = base[key]; else delete current[key];
    }
    Object.assign(current, desired[section]);
    next[section] = current;
  }
  next.__appBuilderManaged = {
    dependencies: Object.keys(desired.dependencies),
    devDependencies: Object.keys(desired.devDependencies),
    scripts: Object.keys(desired.scripts),
  };
  return next;
}
function publicPackage(packageJson) { const next = structuredClone(packageJson); delete next.__appBuilderManaged; return next; }

function copyManagedFiles(contributor, projectDir) {
  const filesRoot = path.join(contributor.root, 'files');
  for (const relative of contributor.files ?? []) {
    const source = safeResolve(filesRoot, relative);
    if (!fs.existsSync(source)) throw new Error(`${contributor.id} declares missing file ${relative}.`);
    const destination = safeResolve(projectDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}
function removeRecipeFiles(recipe, projectDir) { for (const relative of recipe.files ?? []) { const target = safeResolve(projectDir, relative); if (fs.existsSync(target)) fs.rmSync(target); } }

function copyDatabaseFragments(recipes, projectDir) {
  const records = [];
  let index = 10;
  for (const recipe of recipes) {
    for (const relative of recipe.database?.fragments ?? []) {
      const source = safeResolve(recipe.root, relative);
      if (!fs.existsSync(source)) throw new Error(`Recipe ${recipe.id} declares missing database fragment ${relative}.`);
      const name = `${String(index).padStart(3, '0')}-${recipe.id}-${path.basename(relative)}`;
      const destination = safeResolve(projectDir, path.join('supabase/schema', name));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(source, destination);
      records.push({ recipe: recipe.id, file: path.posix.join('supabase/schema', name) });
      index += 10;
    }
  }
  return records;
}
function clearDatabaseFragments(projectDir) { const directory = path.join(projectDir, 'supabase/schema'); if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true }); }

function writeGeneratedState(projectDir, manifest, plan, templatePackage, packageManaged, databaseFragments) {
  const generated = path.join(projectDir, 'src/generated');
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(path.join(generated, 'project.ts'), renderProject(manifest.project));
  fs.writeFileSync(path.join(generated, 'recipes.tsx'), renderRecipeRegistry(plan.recipes));
  fs.writeFileSync(path.join(generated, 'design.ts'), renderDesign(plan.design));
  fs.writeFileSync(path.join(generated, 'brand.css'), renderBrandCss(plan.design));
  fs.writeFileSync(path.join(generated, 'scenarios.ts'), renderScenarios(plan.scenarios));
  writeJson(path.join(projectDir, '.app-builder/manifest.json'), manifest);
  writeJson(path.join(projectDir, '.app-builder/project.json'), { schemaVersion: 1, template: { id: plan.template.id, version: plan.template.version }, projectType: manifest.project.type, design: plan.design, scenarios: plan.scenarios });
  writeJson(path.join(projectDir, '.app-builder/adapters.json'), { schemaVersion: 1, installed: plan.adapters.map((adapter) => ({ id: adapter.id, kind: adapter.kind, version: adapter.version })) });
  writeJson(path.join(projectDir, '.app-builder/recipes.json'), { schemaVersion: 1, installed: plan.recipes.map((recipe) => ({ id: recipe.id, module: recipe.module, version: recipe.version })), packageManaged, databaseFragments });
  writeJson(path.join(projectDir, '.app-builder/template-package.json'), templatePackage);
  writeJson(path.join(projectDir, '.app-builder/handover.json'), { schemaVersion: 1, project: manifest.project, template: { id: plan.template.id, version: plan.template.version }, adapters: plan.adapters.map(({ id, kind, version }) => ({ id, kind, version })), recipes: plan.recipes.map(({ id, module, version }) => ({ id, module, version })), design: plan.design, scenarios: plan.scenarios, aiBudget: manifest.aiBudget, databaseFragments });
}

function writeHandover(projectDir, manifest, plan, databaseFragments) {
  const adapters = plan.adapters.length ? plan.adapters.map((adapter) => `- ${adapter.id} ${adapter.version} (${adapter.kind})`).join('\n') : '- none';
  const recipes = plan.recipes.length ? plan.recipes.map((recipe) => `- ${recipe.id} ${recipe.version}`).join('\n') : '- none';
  const fragments = databaseFragments.length ? databaseFragments.map((entry) => `- ${entry.file}`).join('\n') : '- none';
  const envNotes = plan.adapters.some((adapter) => adapter.id === 'supabase') ? '\nFor Supabase, copy `.env.example` to `.env.local` and set the URL and publishable key. Never put service-role or secret keys in Vite variables.\n' : '';
  const netlifyNotes = plan.adapters.some((adapter) => adapter.id === 'netlify') ? '\nNetlify deployment is configured by `netlify.toml`. Keep secrets in Netlify environment settings, not in repository configuration.\n' : '';
  fs.mkdirSync(path.join(projectDir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'docs/HANDOVER.md'), `# ${manifest.project.name} — handover\n\n## Product\n\n- Type: ${manifest.project.type}\n- Goal: ${manifest.project.primaryGoal}\n- Template: ${plan.template.id} ${plan.template.version}\n- Layout: ${plan.design.patternId} (${plan.design.label})\n- AI budget mode: ${manifest.aiBudget.mode}\n- App Builder runtime dependency: none\n\n## Infrastructure\n\n${adapters}\n${envNotes}${netlifyNotes}\n## Installed recipes\n\n${recipes}\n\n## Test scenarios\n\n${plan.scenarios.map((scenario) => `- ${scenario}`).join('\n')}\n\nSet `VITE_APP_SCENARIO` during local/test work to select a supported scenario. Unknown values safely fall back to `default`.\n\n## Database fragments\n\n${fragments}\n\nDatabase fragments are deterministic source material, not fabricated migration history. Review them and use the backend provider's real migration workflow before production.\n\n## Commands\n\n\`\`\`bash\nnpm install\nnpm run check\nnpm run build\nnpm run dev\n\`\`\`\n`);
}

function writeReadme(projectDir, manifest, plan) {
  const adapterLines = plan.adapters.length ? plan.adapters.map((adapter) => `- ${adapter.id} ${adapter.version} (${adapter.kind})`).join('\n') : '- none';
  const recipeLines = plan.recipes.length ? plan.recipes.map((recipe) => `- ${recipe.id} ${recipe.version}`).join('\n') : '- none';
  fs.writeFileSync(path.join(projectDir, 'README.md'), `# ${manifest.project.name}\n\n${manifest.project.primaryGoal}\n\n## Generated foundation\n\n- Template: ${plan.template.id} ${plan.template.version}\n- Project type: ${manifest.project.type}\n- Layout: ${plan.design.patternId}\n- App Builder runtime dependency: none\n\n## Infrastructure adapters\n\n${adapterLines}\n\n## Installed recipes\n\n${recipeLines}\n\nSee \`docs/HANDOVER.md\` for environment, database, deployment and scenario notes.\n\n## Commands\n\n\`\`\`bash\nnpm install\nnpm run check\nnpm run build\nnpm run dev\n\`\`\`\n`);
}

export function generateProject(manifest, outputDir, { factoryRoot = process.cwd(), catalog = loadCatalog(factoryRoot) } = {}) {
  const plan = buildGenerationPlan(manifest, { factoryRoot, catalog });
  if (plan.missingModules.length) throw new Error(`No ready deterministic recipe for enabled module(s): ${plan.missingModules.join(', ')}.`);
  const out = path.resolve(outputDir);
  if (fs.existsSync(out)) throw new Error(`Refusing to overwrite existing directory: ${out}`);
  copyTree(path.join(plan.template.root, plan.template.filesRoot), out);
  const packagePath = path.join(out, 'package.json');
  const templatePackage = readJson(packagePath);
  let packageJson = structuredClone(templatePackage);
  packageJson.name = manifest.project.slug;
  for (const adapter of plan.adapters) copyManagedFiles(adapter, out);
  for (const recipe of plan.recipes) copyManagedFiles(recipe, out);
  const databaseFragments = copyDatabaseFragments(plan.recipes, out);
  packageJson = mergePackage(packageJson, [...plan.adapters, ...plan.recipes], templatePackage);
  const packageManaged = packageJson.__appBuilderManaged;
  writeJson(packagePath, publicPackage(packageJson));
  writeGeneratedState(out, manifest, plan, templatePackage, packageManaged, databaseFragments);
  writeHandover(out, manifest, plan, databaseFragments);
  writeReadme(out, manifest, plan);
  return plan;
}

export function reconcileProjectRecipes(projectDir, desiredRecipeIds, { factoryRoot = process.cwd(), catalog = loadCatalog(factoryRoot) } = {}) {
  const projectRoot = path.resolve(projectDir);
  const projectRecord = readJson(path.join(projectRoot, '.app-builder/project.json'));
  const manifestPath = path.join(projectRoot, '.app-builder/manifest.json');
  const manifest = readJson(manifestPath);
  const installedRecord = readJson(path.join(projectRoot, '.app-builder/recipes.json'));
  const adapterRecord = readJson(path.join(projectRoot, '.app-builder/adapters.json'));
  const templateEntry = catalog.templates.templates?.[projectRecord.template.id];
  if (!templateEntry) throw new Error(`Unknown template ${projectRecord.template.id}.`);
  const template = loadTemplate(factoryRoot, templateEntry);
  if (template.version !== projectRecord.template.version) throw new Error(`Project uses template ${template.id} ${projectRecord.template.version}, but factory has ${template.version}. Upgrade explicitly before changing recipes.`);
  const adapters = (adapterRecord.installed ?? []).map((record) => {
    const entry = catalog.adapters.adapters?.[record.id];
    if (!entry) throw new Error(`Installed adapter ${record.id} is not available in the factory.`);
    const adapter = loadAdapter(factoryRoot, entry);
    if (adapter.version !== record.version) throw new Error(`Installed adapter ${record.id} version ${record.version} does not match factory ${adapter.version}.`);
    return adapter;
  });
  const recipes = resolveRecipeClosure(desiredRecipeIds, template.id, catalog, factoryRoot, new Set(adapters.map((adapter) => adapter.id)));
  const desiredIds = new Set(recipes.map((recipe) => recipe.id));
  for (const record of installedRecord.installed ?? []) {
    if (desiredIds.has(record.id)) continue;
    const entry = catalog.recipes.recipes?.[record.id];
    if (entry) removeRecipeFiles(loadRecipe(factoryRoot, entry), projectRoot);
  }
  for (const recipe of recipes) copyManagedFiles(recipe, projectRoot);
  clearDatabaseFragments(projectRoot);
  const databaseFragments = copyDatabaseFragments(recipes, projectRoot);
  const templatePackage = readJson(path.join(projectRoot, '.app-builder/template-package.json'));
  const packagePath = path.join(projectRoot, 'package.json');
  let packageJson = readJson(packagePath);
  packageJson.__appBuilderManaged = installedRecord.packageManaged ?? { dependencies: [], devDependencies: [], scripts: [] };
  packageJson = mergePackage(packageJson, [...adapters, ...recipes], templatePackage);
  const packageManaged = packageJson.__appBuilderManaged;
  writeJson(packagePath, publicPackage(packageJson));
  const managedModules = new Set(Object.values(catalog.recipes.recipes ?? {}).map((entry) => entry.module));
  for (const moduleName of managedModules) manifest.modules[moduleName] = false;
  for (const recipe of recipes) manifest.modules[recipe.module] = true;
  const plan = { template, adapters, recipes, design: selectDesign(manifest, catalog), scenarios: selectScenarios(manifest, catalog) };
  writeGeneratedState(projectRoot, manifest, plan, templatePackage, packageManaged, databaseFragments);
  writeHandover(projectRoot, manifest, plan, databaseFragments);
  writeReadme(projectRoot, manifest, plan);
  return recipes;
}
