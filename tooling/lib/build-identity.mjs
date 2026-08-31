/**
 * What a build exactly was, recorded rather than described.
 *
 * `buildable` asserts that an exact source tree, with an exact lockfile, under
 * an exact toolchain, produces an exact output. Verification proved none of
 * those four things. It ran `npm install`, which re-resolves every transitive
 * dependency from ranges at the moment it runs, so two verifications of one
 * source tree could install two different dependency graphs and both report
 * success. It ran under whatever Node and npm the host had. And it looked at
 * the exit code of `npm run build` without ever looking at what was built, so
 * "the build succeeded" was the entire claim — nothing downstream could tell
 * whether the artifact it was reviewing was the artifact that had been checked.
 *
 * The four digests here are that record. They are deliberately independent:
 * the lockfile is excluded from the source digest so that a dependency-only
 * change and a code-only change are distinguishable facts rather than one
 * blurred one, and the output digest is computed from the built files rather
 * than inferred from the inputs, because the whole point is to notice when
 * identical inputs did not produce identical output.
 *
 * Ordering matters and is enforced by the caller, not here: resolve the lock,
 * install *from* the lock, confirm the lock did not move, then build. A lock
 * that changes during `npm ci` means the install was not the install the lock
 * described, and reporting the digest of the moved lock would record a
 * reproducibility claim about a graph that was never installed.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * The factory's own record about the product, which travels inside the
 * generated repository and is not part of it. Verification writes its output
 * manifest here *after* hashing the source, so including it would mean a
 * verified repository no longer hashed to the digest that identifies it — the
 * exact quiet inconsistency this module exists to prevent.
 */
const APP_BUILDER_RECORD = '.app-builder';

/**
 * Directories that are not the project. `node_modules` and `dist` are products
 * of the build rather than inputs to it, and `.git` is the repository's own
 * bookkeeping — hashing any of them would make a digest that changes without
 * the project changing.
 */
const NOT_SOURCE = new Set(['node_modules', 'dist', '.git', '.turbo', '.next', '.astro', '.vite', APP_BUILDER_RECORD]);

/** The lockfile is its own identity component, so it is not also part of the source one. */
const LOCKFILE = 'package-lock.json';

function walk(directory, base = directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => !NOT_SOURCE.has(entry.name))
    .flatMap((entry) => {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) return [];
      return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join('/')];
    })
    .sort();
}

export function digestBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function digestFile(file) {
  return digestBytes(fs.readFileSync(file));
}

/**
 * A digest of a set of files, over both their paths and their contents. Hashing
 * the contents alone would let a rename go unnoticed, and a renamed route is a
 * different product.
 */
function digestFileSet(root, files) {
  const hash = createHash('sha256');
  for (const relative of files) {
    hash.update(relative);
    hash.update('\0');
    hash.update(digestFile(path.join(root, relative)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function sourceDigest(projectDir) {
  const root = path.resolve(projectDir);
  const files = walk(root).filter((relative) => relative !== LOCKFILE);
  if (files.length === 0) throw new Error(`No source files found under ${root}; there is nothing to identify.`);
  return digestFileSet(root, files);
}

export function lockfilePath(projectDir) {
  return path.join(path.resolve(projectDir), LOCKFILE);
}

export function lockDigest(projectDir) {
  const file = lockfilePath(projectDir);
  if (!fs.existsSync(file)) return null;
  return digestFile(file);
}

/**
 * Resolve the dependency graph once, and write it down.
 *
 * `--package-lock-only` resolves without installing, which is what makes this
 * an act of identity rather than an act of building: the lock is decided, and
 * then the install is made to obey it. An existing lock is left alone, because
 * re-resolving one is how a pinned graph quietly moves.
 */
export function resolveLockfile(projectDir, { npm = NPM, env = process.env } = {}) {
  const root = path.resolve(projectDir);
  const existing = lockDigest(root);
  if (existing) return { digest: existing, resolved: false, durationMs: 0 };
  const started = Date.now();
  const result = spawnSync(npm, ['install', '--package-lock-only', '--no-audit', '--no-fund'], {
    cwd: root, encoding: 'utf8', stdio: 'pipe', env, shell: process.platform === 'win32',
  });
  const durationMs = Date.now() - started;
  if (result.status !== 0) {
    throw new Error(`Could not resolve a lockfile for ${root}: npm exited ${result.status ?? 'unknown'}. ${String(result.stderr ?? '').trim()}`);
  }
  const digest = lockDigest(root);
  if (!digest) throw new Error(`npm reported success but wrote no ${LOCKFILE} in ${root}.`);
  return { digest, resolved: true, durationMs };
}

/**
 * The built output, file by file. A single digest answers "is this the artifact
 * that was reviewed"; the file list answers "what changed" when it is not, and
 * without it a mismatch is a dead end.
 */
export function buildOutputManifest(distDir) {
  const root = path.resolve(distDir);
  if (!fs.existsSync(root)) throw new Error(`No build output at ${root}; there is nothing to record.`);
  const files = walk(root);
  if (files.length === 0) throw new Error(`Build output at ${root} is empty, so the build produced nothing to release.`);
  return {
    schemaVersion: 1,
    root: path.basename(root),
    files: files.map((relative) => ({
      path: relative,
      bytes: fs.statSync(path.join(root, relative)).size,
      sha256: digestFile(path.join(root, relative)),
    })),
    digest: digestFileSet(root, files),
  };
}

/**
 * The check that makes `npm ci` meaningful. If the lock moved while installing
 * from it, the installed graph is not the graph the lock described, and the
 * digest recorded a moment ago is about something that no longer exists.
 */
export function assertLockUnmoved(projectDir, expectedDigest) {
  const actual = lockDigest(projectDir);
  if (actual === null) throw new Error(`${LOCKFILE} disappeared during installation, so the installed dependency graph is unrecorded.`);
  if (actual !== expectedDigest) {
    throw new Error(`${LOCKFILE} changed during installation. The graph that was installed is not the graph that was resolved, so this build has no reproducible identity.`);
  }
  return actual;
}
