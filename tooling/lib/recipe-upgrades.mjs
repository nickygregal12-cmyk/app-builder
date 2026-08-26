import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRecipeInstallation, planRecipeUpgrade } from '../../packages/control-plane/src/upgrades.js';
import { resolveRendererVariant } from './renderer-selection.mjs';
import { mergeManagedFile } from './managed-file-merge.mjs';

export const MANAGED_BASELINE_ROOT = '.app-builder/managed-baselines';

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

/**
 * A recipe as the project actually installed it.
 *
 * The inventory hashes the files that were copied in, and which files those
 * were depends on the renderer the project was built by. Reading the base
 * declaration for a project built on another renderer would hash files that are
 * not there and report the installation unresolved.
 */
function loadRecipeDefinition(factoryRoot, entry, rendererId = null) {
  const recipeRoot = safeResolve(factoryRoot, entry.path);
  return resolveRendererVariant({ ...readJson(path.join(recipeRoot, 'recipe.json')), root: recipeRoot }, rendererId);
}

function projectRendererId(projectRoot) {
  try {
    return readJson(path.join(projectRoot, '.app-builder/project.json')).renderer?.id ?? null;
  } catch {
    return null;
  }
}

function projectRecipeRecord(projectRoot) {
  return readJson(path.join(projectRoot, '.app-builder/recipes.json'));
}

export function recordRecipeInstallations(projectDir, { factoryRoot = process.cwd() } = {}) {
  const projectRoot = path.resolve(projectDir);
  const installed = projectRecipeRecord(projectRoot).installed ?? [];
  const registry = loadRecipeRegistry(factoryRoot);
  const rendererId = projectRendererId(projectRoot);
  const factoryVersion = readJson(path.join(factoryRoot, 'package.json')).version ?? null;
  const records = [];
  const unresolved = [];

  for (const recipe of installed) {
    const entry = registry[recipe.id];
    if (!entry) {
      unresolved.push({ recipeId: recipe.id, version: recipe.version, reason: 'Recipe is no longer present in the factory registry.' });
      continue;
    }
    const definition = loadRecipeDefinition(factoryRoot, entry, rendererId);
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
      const source = safeResolve(path.join(definition.root, definition.filesRoot ?? 'files'), relative);
      const target = safeResolve(projectRoot, relative);
      if (!fs.existsSync(source) || !fs.existsSync(target)) {
        unresolved.push({ recipeId: recipe.id, version: recipe.version, reason: `Managed file missing while recording installation: ${relative}` });
        continue;
      }
      fileHashes[relative] = sha256File(source);
      // The bytes this recipe version installed, kept so a later upgrade can do
      // a real three-way merge rather than only detecting that something moved.
      // A hash answers "did this change?"; a merge needs to know *from what*,
      // and once the factory's recipe has moved on there is nowhere else to ask.
      const baseline = safeResolve(path.join(projectRoot, MANAGED_BASELINE_ROOT, recipe.id), relative);
      fs.mkdirSync(path.dirname(baseline), { recursive: true });
      fs.copyFileSync(source, baseline);
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

/**
 * What a three-way merge says about each managed file this upgrade would touch.
 *
 * Only asked when the plan already says `review-required` *because* files were
 * modified. An upgrade whose files are untouched needs no merge, and a plan
 * blocked for a different reason — a downgrade, a missing recipe — is not made
 * less blocked by one.
 *
 * The reconciliation is a proposal, never an application. Planning an upgrade
 * must not edit the project it is planning for, so the merged text is returned
 * for review and nothing is written.
 */
export function reconcileManagedFiles({ projectDir, installation, definition }) {
  const projectRoot = path.resolve(projectDir);
  const baselineRoot = path.join(projectRoot, MANAGED_BASELINE_ROOT, installation.recipeId);
  const targetRoot = path.join(definition.root, definition.filesRoot ?? 'files');
  const files = [];

  for (const item of installation.managedFiles ?? []) {
    const baselinePath = safeResolve(baselineRoot, item.path);
    const currentPath = safeResolve(projectRoot, item.path);
    const targetPath = safeResolve(targetRoot, item.path);

    if (!fs.existsSync(baselinePath)) {
      files.push({ path: item.path, result: 'unavailable', conflicts: 0, detail: 'No installed baseline was recorded for this file, so there is nothing to merge from. A project generated before baselines were kept reconciles by hand once, and by merge after its next install.' });
      continue;
    }
    if (!fs.existsSync(targetPath)) {
      files.push({ path: item.path, result: 'unavailable', conflicts: 0, detail: 'The target recipe version no longer ships this file. Removing a managed file someone edited is a decision, not a merge.' });
      continue;
    }
    const current = fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') : null;
    if (current === null) {
      files.push({ path: item.path, result: 'unavailable', conflicts: 0, detail: 'The project no longer has this file. Restoring one someone deleted is a decision, not a merge.' });
      continue;
    }
    const merge = mergeManagedFile({
      base: fs.readFileSync(baselinePath, 'utf8'),
      ours: current,
      theirs: fs.readFileSync(targetPath, 'utf8'),
      label: `${installation.recipeId} ${definition.version}`,
    });
    files.push({ path: item.path, result: merge.result, conflicts: merge.conflicts, detail: merge.detail, merged: merge.result === 'clean' ? merge.merged : null, conflicted: merge.result === 'conflicted' ? merge.merged : null });
  }

  const conflicted = files.filter((file) => file.result === 'conflicted');
  const unavailable = files.filter((file) => file.result === 'unavailable');
  return {
    files,
    // `mergeable` means every modified file merged without a conflict. It is
    // deliberately not the same as `ready`: a clean merge still has to pass the
    // required checks, and the person applying it still sees what changed.
    mergeable: conflicted.length === 0 && unavailable.length === 0,
    conflicts: conflicted.reduce((total, file) => total + file.conflicts, 0),
    conflictedFiles: conflicted.map((file) => file.path),
    unmergeableFiles: unavailable.map((file) => file.path),
  };
}

export function planProjectRecipeUpgrades(projectDir, { factoryRoot = process.cwd() } = {}) {
  const projectRoot = path.resolve(projectDir);
  const inventoryPath = path.join(projectRoot, '.app-builder/recipe-installations.json');
  if (!fs.existsSync(inventoryPath)) {
    throw new Error('Project has no recipe installation inventory. Record it while the installed recipe versions still match the factory before planning future upgrades.');
  }
  const inventory = readJson(inventoryPath);
  const registry = loadRecipeRegistry(factoryRoot);
  const rendererId = projectRendererId(projectRoot);
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
    const definition = loadRecipeDefinition(factoryRoot, entry, rendererId);
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
    // A modified managed file used to end the conversation. It now starts a
    // merge: the recipe system's point is that a project keeps taking fixes,
    // and losing that to one edited file is losing most of it.
    if (proposal.status === 'review-required' && proposal.modifiedManagedFiles.length) {
      const reconciliation = reconcileManagedFiles({ projectDir: projectRoot, installation, definition });
      proposal = {
        ...proposal,
        reconciliation,
        reason: reconciliation.mergeable
          ? `${proposal.reason} A three-way merge against the installed baseline reconciles every modified file without conflict; review the merged result and apply it.`
          : `${proposal.reason} A three-way merge leaves ${reconciliation.conflictedFiles.length} file(s) conflicted and ${reconciliation.unmergeableFiles.length} that cannot be merged; a person decides those.`,
      };
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
