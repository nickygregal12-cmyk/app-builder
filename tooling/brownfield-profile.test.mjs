/**
 * The brownfield profiler, and the two things that make it worth having.
 *
 * It reads a repository and changes nothing — proved by hashing every byte and
 * every mtime before and after, and by planting a mutation attempt and watching
 * the boundary refuse it.
 *
 * It says what it established and not what it recognised — proved by pointing
 * it at a repository full of suggestive names with nothing behind them, and
 * asserting it declines to claim any of them.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import { readOnlyGit, walkRepository } from './lib/brownfield-evidence.mjs';
import { profileRepositoryTree, unprovenFields } from './lib/brownfield-profile.mjs';
import { compareToBaseline, deriveBaseline } from './lib/brownfield-baseline.mjs';

function write(root, relative, contents) {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
}

function git(root, args) {
  return spawnSync('git', args, { cwd: root, stdio: 'ignore', env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' } });
}

/** A small but genuinely shaped repository: a monorepo with a real stack. */
function fixtureRepository({ commit = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-fixture-'));
  write(root, 'package.json', JSON.stringify({
    name: 'harbour', private: true, workspaces: ['apps/*', 'packages/*'],
    scripts: { build: 'npm run build --workspaces', test: 'vitest run', lint: 'eslint .', typecheck: 'tsc -b' },
    devDependencies: { typescript: '5.6.0', '@playwright/test': '1.62.1', '@axe-core/playwright': '4.13.0' },
  }, null, 2));
  write(root, 'package-lock.json', '{"lockfileVersion":3}');
  write(root, 'tsconfig.json', '{"compilerOptions":{"strict":true}}');
  write(root, 'apps/web/package.json', JSON.stringify({ name: '@harbour/web', scripts: { build: 'vite build', dev: 'vite' }, dependencies: { react: '19.0.0', vite: '6.0.0', '@supabase/supabase-js': '2.45.0' } }, null, 2));
  write(root, 'packages/shared/package.json', JSON.stringify({ name: '@harbour/shared', main: 'src/index.ts' }, null, 2));
  write(root, 'apps/web/src/pages/index.tsx', 'export default function Home() { return null; }\n');
  write(root, 'apps/web/src/pages/about.tsx', 'export default function About() { return null; }\n');
  write(root, 'netlify/functions/enquiry.ts', 'export const handler = async () => ({ statusCode: 200 });\n');
  write(root, 'supabase/migrations/0001_init.sql', 'create table public.records (id uuid primary key);\nalter table public.records enable row level security;\ncreate policy "own rows" on public.records for select using (auth.uid() = owner);\n');
  write(root, 'apps/web/src/components/Button.tsx', 'export const Button = () => null;\n');
  write(root, 'apps/web/src/design/tokens.css', ':root { --color-ink: #111; }\n');
  write(root, 'apps/web/src/lib/records.test.ts', 'test("x", () => {});\n');
  write(root, 'e2e/journey.spec.ts', 'test("journey", async () => {});\n');
  write(root, '.github/workflows/ci.yml', 'name: CI\n');
  write(root, 'netlify.toml', '[build]\n  command = "npm run build"\n');
  write(root, '.env.example', 'VITE_SUPABASE_URL=\nVITE_SUPABASE_ANON_KEY=\n# a comment\n');
  if (commit) {
    git(root, ['init', '--quiet', '-b', 'main']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'fixture']);
  }
  return root;
}

/** Every byte and every mtime under a root, so any write at all is visible. */
function fingerprint(root) {
  const digest = crypto.createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { digest.update(`D ${path.relative(root, full)}\n`); walk(full); continue; }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(full);
      digest.update(`F ${path.relative(root, full)} ${stat.size} ${stat.mtimeMs} ${crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')}\n`);
    }
  };
  walk(root);
  return digest.digest('hex');
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// --- Read-only means read-only ----------------------------------------------------

test('profiling a repository changes not one byte of it, including .git', () => {
  const root = fixtureRepository();
  try {
    const before = fingerprint(root);
    const profile = profileRepositoryTree(root);
    const after = fingerprint(root);
    assert.equal(after, before, 'the profiler wrote to the repository it was asked to read');
    // And it actually did the work, so the equality above is not the equality
    // of having done nothing.
    assert.equal(profile.repository.isGitRepository.value, true);
    assert.ok(profile.coverage.filesExamined > 10);
  } finally {
    cleanup(root);
  }
});

test('git status does not rewrite the index, because the profiler forbids the lock', () => {
  const root = fixtureRepository();
  try {
    const indexPath = path.join(root, '.git/index');
    const before = fs.statSync(indexPath).mtimeMs;
    // An ordinary `git status` refreshes and rewrites `.git/index`. That is a
    // write to a repository this tool promised not to touch, and it is the
    // reason `--no-optional-locks` is not optional.
    readOnlyGit(root, ['status', '--porcelain']);
    assert.equal(fs.statSync(indexPath).mtimeMs, before, 'git status rewrote the index of a repository the profiler promised only to read');
  } finally {
    cleanup(root);
  }
});

test('a mutating git subcommand is refused rather than run', () => {
  const root = fixtureRepository();
  try {
    const before = fingerprint(root);
    for (const attempt of [['checkout', 'main'], ['clean', '-fd'], ['stash'], ['reset', '--hard'], ['add', '-A'], ['commit', '-m', 'no'], ['fetch']]) {
      assert.throws(
        () => readOnlyGit(root, attempt),
        /reads and never writes/,
        `git ${attempt[0]} must be refused by the boundary, not by whoever remembered not to call it`,
      );
    }
    assert.equal(fingerprint(root), before);
  } finally {
    cleanup(root);
  }
});

test('symlinks are not followed, so another project cannot be reported as this one', () => {
  const root = fixtureRepository();
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-elsewhere-'));
  try {
    fs.writeFileSync(path.join(elsewhere, 'somebody-elses-secret.ts'), 'export const x = 1;\n');
    fs.symlinkSync(elsewhere, path.join(root, 'linked'));
    const { files } = walkRepository(root);
    assert.ok(!files.some((file) => file.includes('somebody-elses-secret')), 'a symlink may point anywhere, including outside the repository');
  } finally {
    cleanup(root);
    cleanup(elsewhere);
  }
});

// --- What it establishes ------------------------------------------------------------

test('the stack is read from what the repository states', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root);
    assert.equal(profile.stack.framework.value, 'React on Vite');
    assert.equal(profile.stack.framework.status, 'demonstrated');
    assert.equal(profile.stack.language.value, 'TypeScript');
    assert.equal(profile.workspace.packageManager.value, 'npm');
    assert.equal(profile.workspace.packageManager.evidence[0].path, 'package-lock.json', 'the lockfile is the repository stating which manager owns it');
    assert.equal(profile.workspace.monorepo.value, true);
    assert.equal(profile.stack.commands.build.value.script, 'build');
  } finally {
    cleanup(root);
  }
});

test('architecture separates what builds from what is imported', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root);
    const applications = profile.architecture.applications.value.map((entry) => entry.name);
    const libraries = profile.architecture.libraries.value.map((entry) => entry.name);
    assert.ok(applications.includes('@harbour/web'));
    assert.ok(libraries.includes('@harbour/shared'), 'a package with no build script is a library, not an application');
    assert.equal(profile.architecture.routeLocations.value.count, 2);
    assert.ok(profile.architecture.serverBoundaries.value.kinds.includes('netlify-function'));
  } finally {
    cleanup(root);
  }
});

test('a policy file is found by what it declares, not by where it lives', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root);
    assert.equal(profile.data.securityPolicies.status, 'demonstrated');
    assert.equal(profile.data.securityPolicies.value.count, 1);
    assert.equal(profile.data.migrations.value.count, 1);
    assert.deepEqual(profile.data.provider.value, ['Supabase']);
  } finally {
    cleanup(root);
  }
});

test('environment variables are named and never read', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root);
    const names = profile.data.environmentReferences.value.map((entry) => entry.name);
    assert.deepEqual(names, ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
    assert.ok(!JSON.stringify(profile).includes('='), 'a profile must carry variable names, never values');
  } finally {
    cleanup(root);
  }
});

// --- A scaffold does not get to say what the repository is -----------------------------

/**
 * The defect a cross-check found, which is what cross-checks are for.
 *
 * Pooling dependencies from every nested `package.json` reported a factory
 * whose console is React on Vite as an **Astro** project, at status
 * `demonstrated`, because one scaffold template it ships declares `astro`. A
 * false positive at the strongest status is worse than an unproven field.
 */
test('a scaffold template does not decide the repository\'s framework', () => {
  const root = fixtureRepository();
  try {
    // A template this repository ships for other people to build from. It is
    // not claimed by `workspaces`, and it declares a different framework.
    write(root, 'templates/static-scaffold/files/package.json', JSON.stringify({ name: 'scaffold', dependencies: { astro: '5.0.0' } }, null, 2));
    write(root, 'templates/static-scaffold/files/src/pages/index.astro', '<h1>scaffold</h1>\n');

    const profile = profileRepositoryTree(root);
    assert.equal(profile.stack.framework.value, 'React on Vite', 'a shipped scaffold renamed the repository\'s framework');
    for (const evidence of profile.stack.framework.evidence) {
      assert.ok(!evidence.path.includes('templates/'), `framework evidence cites ${evidence.path}, which is scaffold rather than this repository`);
    }

    // The scaffold's routes are not this product's routes either.
    assert.ok(
      !JSON.stringify(profile.architecture.routeLocations).includes('static-scaffold'),
      'a scaffold\'s pages were counted as this repository\'s route locations',
    );

    // Excluded, and said so. Silence would look identical to it not existing.
    assert.deepEqual(profile.coverage.excludedNestedProjects, ['templates/static-scaffold/files']);
    assert.match(profile.coverage.exclusionNote, /not claimed by any workspace glob/);
    // And it is still reported as present, because it is.
    assert.ok(profile.workspace.packages.value.some((entry) => entry.directory === 'templates/static-scaffold/files'));
  } finally {
    cleanup(root);
  }
});

test('with no workspace definition, only the root manifest speaks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-unclaimed-'));
  try {
    write(root, 'package.json', JSON.stringify({ name: 'host', dependencies: { express: '4.21.0' } }, null, 2));
    write(root, 'vendor-sample/package.json', JSON.stringify({ name: 'sample', dependencies: { next: '15.0.0' } }, null, 2));

    const profile = profileRepositoryTree(root);
    assert.equal(profile.stack.framework.value, 'Express', 'an unclaimed vendored project renamed the host repository');
    assert.deepEqual(profile.coverage.excludedNestedProjects, ['vendor-sample']);
  } finally {
    cleanup(root);
  }
});

// --- What it refuses to claim ---------------------------------------------------------

test('a suggestive name proves nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brownfield-suggestive-'));
  try {
    // Everything here is named as though it were something. None of it is.
    write(root, 'package.json', JSON.stringify({ name: 'suggestive', dependencies: {} }, null, 2));
    write(root, 'src/auth/roles.ts', 'export const roles = ["admin", "member"];\n');
    write(root, 'src/components/Button.tsx', 'export const Button = () => null;\n');
    write(root, 'src/design-system/index.ts', 'export * from "./Button";\n');
    write(root, 'db/schema.sql', 'create table things (id int);\n');

    const profile = profileRepositoryTree(root);
    // A roles file is not RBAC.
    assert.equal(profile.data.auth.status, 'unproven');
    // A SQL file with no policy in it is not a protected database.
    assert.equal(profile.data.securityPolicies.status, 'unproven');
    // A directory called design-system is not a design system.
    assert.equal(profile.designSystem.assimilation.status, 'not-applicable');
    assert.match(profile.designSystem.assimilation.reason, /not a design system/);
    // And component directories are located, which is a different sentence.
    assert.equal(profile.designSystem.componentDirectories.status, 'demonstrated');
    assert.match(JSON.stringify(profile.designSystem.componentDirectories.value), /components/);
  } finally {
    cleanup(root);
  }
});

test('an authentication dependency is inferred, and says exactly what it does not prove', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root);
    assert.equal(profile.data.auth.status, 'inferred');
    assert.match(profile.data.auth.basis, /never that sessions, roles or access rules work/);
  } finally {
    cleanup(root);
  }
});

test('a demonstrated finding cannot exist without evidence', async () => {
  const { demonstrated } = await import('./lib/brownfield-evidence.mjs');
  assert.throws(() => demonstrated('React', []), /needs evidence/);
  assert.throws(() => demonstrated('React'), /needs evidence/);
});

test('the profile names what it deliberately did not attempt', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root);
    const questions = profile.notAttempted.map((entry) => entry.question).join(' ');
    assert.match(questions, /deployed product/);
    assert.match(questions, /Do the tests pass/);
    assert.match(questions, /keep \/ refactor/);
    // No classification anywhere in the artifact. Diagnosing from a first read
    // is how "replace" comes to mean "the factory prefers a different framework".
    for (const verdict of ['"keep"', '"refactor"', '"redesign"', '"replace"', '"remove"']) {
      assert.ok(!JSON.stringify(profile).includes(`"classification":${verdict}`));
    }
  } finally {
    cleanup(root);
  }
});

test('the unproven list is assembled rather than left for a reader to find', () => {
  const root = fixtureRepository();
  try {
    const unproven = unprovenFields(profileRepositoryTree(root));
    assert.ok(unproven.length > 0);
    for (const entry of unproven) {
      assert.ok(['unproven', 'inferred'].includes(entry.status));
      assert.ok(entry.field.includes('.'));
    }
  } finally {
    cleanup(root);
  }
});

// --- Determinism ------------------------------------------------------------------------

test('two reads of an unchanged repository produce the same hash', () => {
  const root = fixtureRepository();
  try {
    const first = profileRepositoryTree(root, { profiledAt: '2026-08-28T00:00:00.000Z' });
    const second = profileRepositoryTree(root, { profiledAt: '2026-08-28T09:00:00.000Z' });
    assert.equal(first.profileHash, second.profileHash, 'the time of a read is not a fact about a repository');
  } finally {
    cleanup(root);
  }
});

test('a truncated walk is reported, never silent', () => {
  const root = fixtureRepository();
  try {
    const profile = profileRepositoryTree(root, { walkLimits: { maxFiles: 3 } });
    assert.equal(profile.coverage.truncated, true);
    assert.match(profile.coverage.note, /part of this repository/);
  } finally {
    cleanup(root);
  }
});

// --- The baseline --------------------------------------------------------------------------

test('a baseline over a clean revision is usable and names what it does not protect', () => {
  const root = fixtureRepository();
  try {
    const baseline = deriveBaseline(profileRepositoryTree(root));
    assert.equal(baseline.usable, true);
    assert.equal(baseline.refusals.length, 0);
    assert.equal(baseline.revision.length, 40);
    assert.equal(baseline.shape.routeLocations, 2);
    // A baseline recorded in a worktree or a temporary clone names a directory
    // that will not exist later, so identity has to survive the path.
    assert.ok('remote' in baseline.subject, 'a baseline must carry the repository identity, not only where it happened to be read');
    assert.equal(baseline.shape.securityPolicyFiles, 1);
    assert.match(baseline.doesNotProtect.join(' '), /Nothing was executed/);
  } finally {
    cleanup(root);
  }
});

test('a baseline over a dirty tree is refused, because it could not be returned to', () => {
  const root = fixtureRepository();
  try {
    write(root, 'apps/web/src/pages/contact.tsx', 'export default function Contact() { return null; }\n');
    const baseline = deriveBaseline(profileRepositoryTree(root));
    assert.equal(baseline.usable, false);
    assert.ok(baseline.refusals.some((entry) => /uncommitted changes/.test(entry)));
    // And an unusable baseline cannot be measured against.
    assert.equal(compareToBaseline(baseline, profileRepositoryTree(root)).comparable, false);
  } finally {
    cleanup(root);
  }
});

test('a baseline over a partial walk is refused', () => {
  const root = fixtureRepository();
  try {
    const baseline = deriveBaseline(profileRepositoryTree(root, { walkLimits: { maxFiles: 3 } }));
    assert.equal(baseline.usable, false);
    assert.ok(baseline.refusals.some((entry) => /part of this repository/.test(entry)));
  } finally {
    cleanup(root);
  }
});

test('a comparison reports movement and refuses to call it good', () => {
  const root = fixtureRepository();
  try {
    const baseline = deriveBaseline(profileRepositoryTree(root));
    write(root, 'apps/web/src/pages/contact.tsx', 'export default function Contact() { return null; }\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'a third route']);

    const comparison = compareToBaseline(baseline, profileRepositoryTree(root));
    assert.equal(comparison.comparable, true);
    assert.equal(comparison.sameRevision, false);
    const routes = comparison.changes.find((entry) => entry.field === 'routeLocations');
    assert.deepEqual(routes, { field: 'routeLocations', before: 2, after: 3 });
    assert.match(comparison.note, /Movement, not judgement/);
    // Nothing in a comparison is a verdict.
    assert.ok(!JSON.stringify(comparison).includes('better'));
    assert.ok(!JSON.stringify(comparison).includes('regression'));
  } finally {
    cleanup(root);
  }
});

test('a repository that is not a git work tree is profiled and cannot be baselined', () => {
  const root = fixtureRepository({ commit: false });
  try {
    const profile = profileRepositoryTree(root);
    assert.equal(profile.repository.isGitRepository.value, false);
    // Still a useful profile — the stack does not need git to be readable.
    assert.equal(profile.stack.framework.value, 'React on Vite');
    const baseline = deriveBaseline(profile);
    assert.equal(baseline.usable, false);
    assert.ok(baseline.refusals.some((entry) => /no resolvable revision/.test(entry)));
  } finally {
    cleanup(root);
  }
});
