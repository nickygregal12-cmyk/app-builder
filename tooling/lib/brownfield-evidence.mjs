/**
 * The evidence vocabulary a brownfield profile is written in, and the read-only
 * boundary it is gathered behind.
 *
 * Two rules make a profile worth having, and both of them are about what the
 * profiler is NOT allowed to do.
 *
 * **Say what was established, not what was recognised.** A `roles.ts` file does
 * not prove a product uses RBAC, and a component named `Button` is not the
 * design system's button. Every field carries a status and the evidence behind
 * it, so "this repository uses Supabase" and "this repository has a package
 * called @supabase/supabase-js in its dependencies" stay different sentences.
 * `demonstrated` means something in the repository states it. `inferred` means
 * a convention says so and the repository does not. `unproven` means the
 * profiler looked and could not tell, which is a finding rather than a gap.
 *
 * **Touch nothing.** Understanding an existing product comes before changing
 * it, and a profiler that installed a dependency to find out what framework a
 * project uses would have changed the thing it was measuring. Reading is
 * enforced here rather than promised in a comment: `readOnlyGit` runs a closed
 * list of git subcommands and passes `--no-optional-locks`, because even
 * `git status` will rewrite `.git/index` if you let it.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * How sure the profiler is, and it may only ever be one of these.
 *
 * There is deliberately no `likely` or `probable`. A profile that can hedge is
 * a profile that will hedge, and a later agent reading it cannot act on a hedge.
 */
export const STATUSES = Object.freeze(['demonstrated', 'inferred', 'unproven', 'not-applicable']);

/**
 * A value the repository itself states.
 *
 * @param {*} value       what was found
 * @param {object[]} evidence  where it was found — at least one, or this is not demonstrated
 */
export function demonstrated(value, evidence) {
  if (!evidence?.length) throw new Error('A demonstrated finding needs evidence. Without it the honest status is inferred or unproven.');
  return { value, status: 'demonstrated', evidence };
}

/**
 * A value a convention implies and the repository does not state.
 *
 * `basis` is required and is the whole point: a reader has to be able to
 * disagree with the inference without re-running the profiler.
 */
export function inferred(value, evidence, basis) {
  if (!basis) throw new Error('An inferred finding must say what the inference rests on.');
  return { value, status: 'inferred', evidence: evidence ?? [], basis };
}

/** The profiler looked and could not establish it. A finding, not a gap. */
export function unproven(reason, evidence = []) {
  return { value: null, status: 'unproven', evidence, reason };
}

/** The question does not apply to this repository, and why. */
export function notApplicable(reason, evidence = []) {
  return { value: null, status: 'not-applicable', evidence, reason };
}

/** Where a finding came from. `path` is always relative to the repository root. */
export function at(relativePath, detail) {
  return { kind: 'file', path: relativePath, detail };
}

export function fromCommand(command, detail) {
  return { kind: 'command', path: command, detail };
}

// --- The read-only boundary ----------------------------------------------------

/**
 * Git subcommands that only read.
 *
 * `status` is on the list and is the reason `--no-optional-locks` is not
 * optional: an ordinary `git status` refreshes and rewrites `.git/index`, which
 * is a write to a repository this tool has promised not to touch. A caller
 * cannot add to this list at runtime, because a list that could be extended by
 * its caller is not a boundary.
 */
const READ_ONLY_GIT = Object.freeze(new Set(['rev-parse', 'status', 'config', 'log', 'remote', 'ls-files', 'symbolic-ref']));

export function readOnlyGit(repoPath, args, { timeoutMs = 15_000 } = {}) {
  const [subcommand] = args;
  if (!READ_ONLY_GIT.has(subcommand)) {
    throw new Error(`Refusing to run "git ${subcommand}" against ${repoPath}: the profiler reads and never writes, and only ${[...READ_ONLY_GIT].join(', ')} are known to be read-only.`);
  }
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: timeoutMs,
    // No inherited environment beyond what git needs to run. A profiler that
    // passed the whole environment through could hand a target repository's
    // hooks the factory's own credentials.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
  return { status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
}

// --- Bounded reading -----------------------------------------------------------

/** Directories no profile learns anything useful from, and that cost a great deal to walk. */
export const IGNORED_DIRECTORIES = Object.freeze(new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', '.svelte-kit', '.astro',
  'coverage', '.turbo', '.cache', '.vercel', '.netlify', 'test-results', 'playwright-report',
  '.venv', '__pycache__', 'vendor', '.pnpm-store', '.yarn',
]));

/**
 * Every tracked-looking file under a root, relative and sorted.
 *
 * Bounded by `maxFiles` so a profiler pointed at something enormous refuses
 * rather than reads for an hour, and by `maxDepth` so a symlink cycle cannot
 * turn a read into a hang. Reaching either limit is reported, never silent: a
 * profile that quietly examined half a repository would read as a profile of
 * the whole one.
 */
export function walkRepository(root, { maxFiles = 40_000, maxDepth = 12 } = {}) {
  const base = path.resolve(root);
  const files = [];
  let truncated = false;
  let deepest = 0;

  const walk = (dir, depth) => {
    if (truncated || depth > maxDepth) return;
    deepest = Math.max(deepest, depth);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (truncated) return;
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      // Symlinks are not followed. A repository may link anywhere, including
      // outside itself, and a profiler that followed one would report another
      // project's files as this one's.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile()) {
        if (files.length >= maxFiles) { truncated = true; return; }
        files.push(path.relative(base, full).split(path.sep).join('/'));
      }
    }
  };
  walk(base, 0);
  return { files, truncated, deepest, maxFiles, maxDepth };
}

/** Read a file the profiler expects to be small, or null. Never throws on a target repo. */
export function readTextFile(root, relativePath, { maxBytes = 512 * 1024 } = {}) {
  const full = path.resolve(root, relativePath);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(`${base}${path.sep}`)) return null;
  try {
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

export function readJsonFile(root, relativePath) {
  const text = readTextFile(root, relativePath);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** A stable hash of a profile, ignoring the timestamp that changes every run. */
export function hashProfile(profile) {
  // The time of a read and the hash itself are not facts about a repository.
  const stable = { ...profile };
  delete stable.profiledAt;
  delete stable.profileHash;
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
