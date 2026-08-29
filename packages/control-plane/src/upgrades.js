function parseSemver(value) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid semantic version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function createRecipeInstallation({ recipeId, version, fileHashes, installedAtFactoryVersion = null }) {
  if (!recipeId) throw new Error('recipeId is required.');
  parseSemver(version);
  if (!fileHashes || typeof fileHashes !== 'object' || Array.isArray(fileHashes)) throw new Error('fileHashes must be a path -> sha256 object.');
  const managedFiles = Object.entries(fileHashes).sort(([a], [b]) => a.localeCompare(b)).map(([filePath, sha256]) => {
    if (!/^[a-f0-9]{64}$/.test(String(sha256))) throw new Error(`Invalid sha256 for ${filePath}.`);
    return { path: filePath, sha256 };
  });
  return { schemaVersion: 1, recipeId, version, installedAtFactoryVersion, managedFiles };
}

export function compareManagedInventory(installation, currentHashes) {
  const modified = [];
  const missing = [];
  const unchanged = [];
  for (const file of installation.managedFiles ?? []) {
    const current = currentHashes?.[file.path];
    if (!current) missing.push(file.path);
    else if (current !== file.sha256) modified.push(file.path);
    else unchanged.push(file.path);
  }
  return { modified, missing, unchanged };
}

export function planRecipeUpgrade({ installation, targetVersion, currentHashes, compatibleFrom = [], migrationNotes = [], requiredChecks = ['npm run check', 'npm run build'], hasUnmodelledDatabaseEvolution = false }) {
  const order = compareVersions(installation.version, targetVersion);
  const inventory = compareManagedInventory(installation, currentHashes);
  const base = {
    schemaVersion: 1,
    recipeId: installation.recipeId,
    fromVersion: installation.version,
    toVersion: targetVersion,
    modifiedManagedFiles: inventory.modified,
    missingManagedFiles: inventory.missing,
    requiredChecks,
    migrationNotes,
  };

  if (order === 0) return { ...base, status: 'no-op', reason: 'Target version is already installed.' };
  if (order > 0) return { ...base, status: 'blocked', reason: 'Downgrades are not automatic upgrade operations.' };
  if (inventory.modified.length || inventory.missing.length) {
    return { ...base, status: 'review-required', reason: 'Managed files differ from their installed hashes; preserve user changes before applying an upgrade.' };
  }

  const [fromMajor] = parseSemver(installation.version);
  const [toMajor] = parseSemver(targetVersion);
  if (toMajor !== fromMajor) return { ...base, status: 'review-required', reason: 'Major-version upgrades require explicit review even when managed files are unchanged.' };
  if (!compatibleFrom.includes(installation.version)) {
    return { ...base, status: 'review-required', reason: 'The target recipe has not explicitly declared compatibility from the installed version.' };
  }
  if (hasUnmodelledDatabaseEvolution) {
    return {
      ...base,
      status: 'review-required',
      reasonCode: 'database-evolution-unmodelled',
      reason: 'The target recipe manages persistent database state whose evolution is not modelled automatically.',
    };
  }
  return { ...base, status: 'ready', reason: 'Managed files are unchanged and the target explicitly declares compatibility from the installed version.' };
}
