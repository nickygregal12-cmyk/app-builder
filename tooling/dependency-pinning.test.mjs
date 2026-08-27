import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Every dependency this repository declares, and every dependency it hands to a generated project,
 * is an exact version.
 *
 * The argument is not tidiness. `package-lock.json` is deliberately not committed, so a range is
 * resolved fresh on every install: the tree a contributor tested is not the tree CI installs, and
 * neither is the tree the next contributor gets. The failure mode is quiet until it is not — a pull
 * request in this programme passed `npm run check` locally against `oxlint@1.71` and failed hosted
 * CI on a rule added in `1.80`, same declared dependency, different resolved version.
 *
 * The supply-chain form of the same gap is worse than a lost CI cycle: a compromised patch release
 * of any transitively-permitted range lands without anybody choosing it. An exact version is a
 * decision somebody made, in a diff somebody can read, that Renovate then proposes changing.
 *
 * Generated projects inherit this. `templates/` is copied into somebody else's repository, and a
 * generated app that resolves its own toolchain fresh on every install is not the reproducible
 * ordinary repository `AGENTS.md` principle 9 promises.
 */

const EXACT = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * `*` on an `@app-builder/` package is a workspace link, not a range: npm resolves it to the
 * workspace on disk and never to a registry version. It is the one spelling that cannot drift.
 */
function isWorkspaceLink(name, specifier) {
  return name.startsWith('@app-builder/') && (specifier === '*' || specifier.startsWith('workspace:'));
}

function manifests() {
  const roots = ['package.json'];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'package.json') roots.push(full);
    }
  };
  for (const directory of ['apps', 'packages', 'templates', 'recipes', 'adapters']) walk(directory);
  return roots;
}

/** Every declared dependency that is not an exact version, across one manifest. */
export function loosePins(manifestPath) {
  const meta = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const loose = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, specifier] of Object.entries(meta[field] ?? {})) {
      if (isWorkspaceLink(name, specifier)) continue;
      if (!EXACT.test(String(specifier))) loose.push({ field, name, specifier });
    }
  }
  return loose;
}

test('every manifest in the repository declares exact versions', () => {
  const found = manifests();
  assert.ok(found.length > 5, `only ${found.length} manifests discovered; the walk found nothing to check`);

  const failures = [];
  for (const manifest of found) {
    for (const entry of loosePins(manifest)) {
      failures.push(`${manifest} ${entry.field}.${entry.name} = ${entry.specifier}`);
    }
  }
  assert.deepEqual(failures, [], `A range is resolved fresh on every install, and this repository does not commit a lockfile:\n  ${failures.join('\n  ')}`);
});

test('the check reads real manifests, including the ones generated projects inherit', () => {
  const found = manifests();
  for (const required of [
    'package.json',
    'apps/console/package.json',
    'packages/control-plane/package.json',
    'templates/react-vite-neutral/files/package.json',
    'templates/astro-static-content/files/package.json',
  ]) {
    assert.ok(found.includes(required), `${required} was not discovered, so nothing checked it`);
  }
});

test('a caret, a tilde, a wildcard and a tag are each refused', () => {
  // Planted, because a rule that has only ever been run against a compliant repository proves the
  // repository is compliant and nothing about the rule.
  const directory = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'app-builder-pins-'));
  const manifest = path.join(directory, 'package.json');
  for (const specifier of ['^1.2.3', '~1.2.3', '1.x', '*', 'latest', '>=1.2.3', '1.2.3 || 2.0.0', 'github:owner/repo']) {
    fs.writeFileSync(manifest, JSON.stringify({ dependencies: { thing: specifier } }));
    const loose = loosePins(manifest);
    assert.equal(loose.length, 1, `${specifier} must be refused`);
    assert.equal(loose[0].specifier, specifier);
  }

  for (const specifier of ['1.2.3', '1.2.3-rc.1', '0.0.1']) {
    fs.writeFileSync(manifest, JSON.stringify({ dependencies: { thing: specifier } }));
    assert.deepEqual(loosePins(manifest), [], `${specifier} must be accepted`);
  }

  // A workspace link is not a range: npm resolves it to the workspace on disk.
  fs.writeFileSync(manifest, JSON.stringify({ dependencies: { '@app-builder/contracts': '*', other: '*' } }));
  assert.deepEqual(loosePins(manifest).map((entry) => entry.name), ['other']);

  fs.rmSync(directory, { recursive: true, force: true });
});
