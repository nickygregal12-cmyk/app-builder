import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRecipeInstallation, planRecipeUpgrade } from '../../packages/control-plane/src/upgrades.js';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function safeResolve(root, relative) {
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) throw new Error(`Unsafe path: ${relative}`);
  return target;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadRecipeRegistry(factoryRoot) {
  return readJson(path.join(factoryRoot, 'config/recipes.json')).recipes ?? {};
}

function loadRecipeDefinition(factoryRoot, entry) {
  const recipeRoot = safeResolve(factoryRoot, entry.path);
  return { ...readJson(path.join(recipeRoot, 'recipe.json')), root: recipeRoot };
}

function projectRecipeRecord(projectRoot) {
  return readJson(path.join(projectRoot, '.app-builder/recipes.json'));
}

export function recordRecipeInstallations(projectDir, { factoryRoot = process.cwd() } = {}) {
  const projectRoot = path.resolve(projectDir);
  const installed = projectRecipeRecord(projectRoot).installed ?? [];
  const registry = loadRecipeRegistry(factoryRoot);
  const factoryVersion = readJson(path.join(factoryRoot, 'package.json')).version ?? null;
  const records = [];
  const unresolved = [];

  for (const recipe of installed) {
    const entry = registry[recipe.id];
    if (!entry) {
      unresolved.push({ recipeId: recipe.id, version: recipe.version, reason: 'Recipe is no longer present in the factory registry.' });
      continue;
    }
    const definition = loadRecipeDefinition(factoryRoot, entry);
    if (definition.version !== recipe.version) {
      unresolved.push({
        recipeId: recipe.id,
        version: recipe.version,
        reason: `Cannot backfill installation hashes after factory recipe changed to ${definition.version}. Restore the installed recipe version or use an existing installation inventory.`,
      });
      continue;
    }
    const fileHashes = {};
    for (const relative of definition.files ?? []) {
      const source = safeResolve(path.join(definition.root, 'files'), relative);
      const target = safeResolve(projectRoot, relative);
      if (!fs.existsSync(source) || !fs.existsSync(target)) {
        unresolved.push({ recipeId: recipe.id, version: recipe.version, reason: `Managed file missing while recording installation: ${relative}` });
        continue;
      }
      fileHashes[relative] = sha256File(source);
    }
    records.push({
      module: recipe.module,
      ...createRecipeInstallation({
        recipeId: recipe.id,
        version: recipe.version,
        fileHashes,
        installedAtFactoryVersion: factoryVersion,
      }),
    });
  }

  const output = { schemaVersion: 1, installed: records, unresolved };
  writeJson(path.join(projectRoot, '.app-builder/recipe-installations.json'), output);
  return output;
}

export function currentManagedHashes(projectDir, installation) {
  const projectRoot = path.resolve(projectDir);
  const hashes = {};
  for (const item of installation.managedFiles ?? []) {
    const target = safeResolve(projectRoot, item.path);
    if (fs.existsSync(target)) hashes[item.path] = sha256File(target);
  }
  return hashes;
}

export function planProjectRecipeUpgrades(projectDir, { factoryRoot = process.cwd() } = {}) {
  const projectRoot = path.resolve(projectDir);
  const inventoryPath = path.join(projectRoot, '.app-builder/recipe-installations.json');
  if (!fs.existsSync(inventoryPath)) {
    throw new Error('Project has no recipe installation inventory. Record it while the installed recipe versions still match the factory before planning future upgrades.');
  }
  const inventory = readJson(inventoryPath);
  const registry = loadRecipeRegistry(factoryRoot);
  const proposals = [];

  for (const installation of inventory.installed ?? []) {
    const entry = registry[installation.recipeId];
    if (!entry) {
      proposals.push({
        schemaVersion: 1,
        recipeId: installation.recipeId,
        fromVersion: installation.version,
        toVersion: installation.version,
        status: 'blocked',
        modifiedManagedFiles: [],
        missingManagedFiles: [],
        reason: 'Installed recipe is not available in the current factory registry.',
        requiredChecks: ['npm run check', 'npm run build'],
        migrationNotes: [],
      });
      continue;
    }
    const definition = loadRecipeDefinition(factoryRoot, entry);
    let proposal = planRecipeUpgrade({
      installation,
      targetVersion: definition.version,
      currentHashes: currentManagedHashes(projectRoot, installation),
      compatibleFrom: definition.upgrade?.compatibleFrom ?? [],
      migrationNotes: definition.upgrade?.migrationNotes ?? [],
    });
    if (definition.upgrade?.alwaysReview && proposal.status === 'ready') {
      proposal = { ...proposal, status: 'review-required', reason: 'Target recipe explicitly requires review for upgrades.' };
    }
    proposals.push(proposal);
  }

  return {
    schemaVersion: 1,
    projectDir: projectRoot,
    unresolvedInstallations: inventory.unresolved ?? [],
    proposals,
    ready: proposals.filter((item) => item.status === 'ready').length,
    reviewRequired: proposals.filter((item) => item.status === 'review-required').length,
    blocked: proposals.filter((item) => item.status === 'blocked').length,
  };
}
