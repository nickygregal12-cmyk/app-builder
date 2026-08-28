/**
 * Stage Q6 — which factory modules is nothing able to reach?
 *
 * Unused exports, stale modules and abandoned helpers cost context and credit, and the expensive
 * part of finding them is not the graph walk: it is knowing what counts as a reference. This
 * repository reaches modules in four different ways, and a checker that knows only the first
 * reports the other three as dead code:
 *
 * 1. `import` / `export ... from`, the ordinary case;
 * 2. `import()`, resolved the same way;
 * 3. a **path literal** — `tooling/lib/canary-worker.mjs` is spawned as a subprocess, never
 *    imported, and is very much alive;
 * 4. a tool's own entry — `vite.config.ts` is read by Vite, `index.html` names the Console's real
 *    entry module, and neither is imported by anything.
 *
 * Declaration files are excluded because they are types rather than modules: a `.d.ts` is consumed
 * by the type system through `tsconfig`, and reporting one as unreachable is reporting that
 * TypeScript exists.
 *
 * Everything below is a pure function of a directory tree so the checker can be run against a
 * planted fixture. A dead-code gate that has only ever been run against a clean repository is
 * indistinguishable from one that always reports zero.
 */

import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', 'dist', '.tmp', '.app-builder', 'coverage', 'test-results', 'playwright-report', 'generated',
]);

/**
 * Zones this checker does not own.
 *
 * `recipes/`, `templates/` and `adapters/` are *generated-project source*: their files are copied
 * into someone else's repository and are reachable from there, not from here. `npm run doctor`
 * already validates those manifests. Reporting them here would be reporting that the factory does
 * not import the code it ships.
 */
const EXCLUDED_ROOTS = ['recipes/', 'templates/', 'adapters/', 'examples/', 'questionnaires/'];

const MODULE_EXTENSIONS = ['.mjs', '.js', '.ts', '.tsx', '.jsx'];
const RESOLVABLE_EXTENSIONS = [...MODULE_EXTENSIONS, '.json', '.css', '.astro', '.html'];

function walk(root, directory = root, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(root, full, out);
    else out.push(path.relative(root, full).replaceAll('\\', '/'));
  }
  return out;
}

function isModule(file) {
  return MODULE_EXTENSIONS.some((extension) => file.endsWith(extension)) && !file.endsWith('.d.ts');
}

function readJson(root, file) {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return null; }
}

/** Map workspace package names to their directories, from the root manifest's `workspaces` globs. */
function workspaceDirectories(root, files) {
  const manifest = readJson(root, 'package.json');
  const patterns = manifest?.workspaces ?? [];
  const directories = new Set();
  for (const pattern of patterns) {
    const prefix = pattern.replace(/\*+$/, '');
    for (const file of files) {
      if (!file.endsWith('/package.json')) continue;
      const directory = path.posix.dirname(file);
      if (`${directory}/`.startsWith(prefix) && directory.split('/').length === prefix.split('/').filter(Boolean).length + 1) {
        directories.add(directory);
      }
    }
  }
  const byName = new Map();
  for (const directory of directories) {
    const meta = readJson(root, `${directory}/package.json`);
    if (meta?.name) byName.set(meta.name, directory);
  }
  return byName;
}

/**
 * Pick the runtime target out of an exports entry.
 *
 * An entry is a string, or a conditions object. `types` is deliberately last: it points at a
 * declaration file, and following it would make every package's real entry look unreferenced while
 * a `.d.ts` this checker excludes took its place.
 */
function exportTarget(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  for (const condition of ['import', 'module', 'node', 'default', 'require']) {
    const resolved = exportTarget(value[condition]);
    if (resolved) return resolved;
  }
  return null;
}

function resolveCandidate(root, files, base) {
  const normalized = path.posix.normalize(base);
  const candidates = [
    normalized,
    ...RESOLVABLE_EXTENSIONS.map((extension) => `${normalized}${extension}`),
    ...RESOLVABLE_EXTENSIONS.map((extension) => path.posix.join(normalized, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve one import specifier to a repository file, or `null` when it leaves the repository.
 *
 * Bare specifiers other than a workspace package are third-party and deliberately not followed:
 * this answers "is anything in this repository able to reach this file", and `node_modules` is not
 * part of that question.
 */
function resolveSpecifier(root, files, workspaces, fromFile, specifier) {
  if (specifier.startsWith('node:') || specifier.startsWith('http:') || specifier.startsWith('https:')) return null;
  if (specifier.startsWith('.')) {
    return resolveCandidate(root, files, path.posix.join(path.posix.dirname(fromFile), specifier));
  }
  for (const [name, directory] of workspaces) {
    const meta = readJson(root, `${directory}/package.json`);
    if (specifier === name) {
      const target = exportTarget(meta?.exports?.['.'] ?? meta?.exports) ?? meta?.main ?? 'src/index.js';
      return resolveCandidate(root, files, path.posix.join(directory, target.replace(/^\.\//, '')));
    }
    if (specifier.startsWith(`${name}/`)) {
      const subpath = specifier.slice(name.length + 1);
      const declared = exportTarget(meta?.exports?.[`./${subpath}`]);
      if (declared) return resolveCandidate(root, files, path.posix.join(directory, declared.replace(/^\.\//, '')));
      // A wildcard subpath export such as `./generated/*` maps the remainder straight through.
      for (const [pattern, value] of Object.entries(meta?.exports ?? {})) {
        if (!pattern.endsWith('/*')) continue;
        const prefix = pattern.slice(2, -1);
        if (!subpath.startsWith(prefix)) continue;
        const target = exportTarget(value);
        if (target) return resolveCandidate(root, files, path.posix.join(directory, target.replace(/^\.\//, '').replace('*', subpath.slice(prefix.length))));
      }
      return resolveCandidate(root, files, path.posix.join(directory, 'src', subpath));
    }
  }
  return null;
}

const IMPORT_PATTERNS = [
  /(?:^|[\s;}])import\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|[\s;}])export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Path literals: a module named as a string rather than imported.
 *
 * `tooling/lib/canary-worker.mjs` is spawned as a subprocess and appears only inside a
 * `path.join(...)` argument. It is reachable, and a checker that cannot see that would delete the
 * runtime canary's worker as dead code — which is why this pattern exists rather than an ignore
 * list naming that file.
 */
const PATH_LITERAL = /['"`]([A-Za-z0-9_@./-]*\/[A-Za-z0-9_@./-]+\.(?:mjs|js|ts|tsx|jsx))['"`]/g;

/**
 * Build the reachability report.
 *
 * @param {object} input
 * @param {string} input.root repository root
 * @returns {{modules: string[], entries: string[], reachable: string[], orphans: string[]}}
 */
export function analyseModuleGraph({ root }) {
  const allFiles = walk(root);
  const files = new Set(allFiles);
  const workspaces = workspaceDirectories(root, allFiles);

  const owned = (file) => !EXCLUDED_ROOTS.some((prefix) => file.startsWith(prefix));
  const modules = allFiles.filter((file) => isModule(file) && owned(file));

  const edges = new Map();
  const byBasename = new Map();
  for (const file of allFiles) {
    if (!isModule(file)) continue;
    const list = byBasename.get(path.posix.basename(file)) ?? [];
    list.push(file);
    byBasename.set(path.posix.basename(file), list);
  }

  for (const file of allFiles) {
    if (!isModule(file) && !file.endsWith('.d.ts')) continue;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const targets = new Set();

    for (const pattern of IMPORT_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        // A specifier that resolves to nothing simply adds no edge. Reporting those as defects was
        // measured and dropped: the regex cannot tell a real import from one quoted inside a test
        // fixture, and Node and TypeScript already fail on a genuinely broken one. This tool
        // answers exactly one question.
        const resolved = resolveSpecifier(root, files, workspaces, file, match[1]);
        if (resolved) targets.add(resolved);
      }
    }

    for (const match of text.matchAll(PATH_LITERAL)) {
      const literal = match[1].replace(/^\.\//, '');
      if (files.has(literal)) { targets.add(literal); continue; }
      // A bare `foo/bar.mjs` inside a `path.join(root, ...)` is still a repository path; match it
      // by its tail so the join's first argument does not have to be understood.
      for (const [, candidates] of byBasename) {
        for (const candidate of candidates) {
          if (candidate.endsWith(`/${literal}`) || candidate === literal) targets.add(candidate);
        }
      }
    }
    edges.set(file, [...targets]);
  }

  const entries = new Set();
  const addEntry = (file) => { if (files.has(file)) entries.add(file); };

  // Scripts in any manifest name the modules a human or CI actually runs.
  for (const [, directory] of [['root', '.'], ...workspaces]) {
    const manifestPath = directory === '.' ? 'package.json' : `${directory}/package.json`;
    const meta = readJson(root, manifestPath);
    if (!meta) continue;
    const prefix = directory === '.' ? '' : `${directory}/`;
    for (const command of Object.values(meta.scripts ?? {})) {
      for (const match of String(command).matchAll(/(?:^|\s)([\w@./-]+\.(?:mjs|js|ts|tsx))/g)) {
        const candidate = match[1].replace(/^\.\//, '');
        addEntry(candidate);
        addEntry(`${prefix}${candidate}`);
      }
    }
    // A published entry point is reachable by definition: it is what another package imports.
    const exported = typeof meta.exports === 'string' ? [meta.exports] : Object.values(meta.exports ?? {});
    for (const value of [meta.main, meta.module, ...exported].flat()) {
      if (typeof value !== 'string') continue;
      addEntry(path.posix.join(directory === '.' ? '' : directory, value.replace(/^\.\//, '')));
    }
  }

  for (const file of modules) {
    // Tests and specs are run by the test runner rather than imported by production code.
    if (/\.(test|spec)\.(mjs|js|ts|tsx)$/.test(file) || file.startsWith('tests/')) addEntry(file);
    // A tool's own configuration is read by that tool, never imported.
    if (/(?:^|\/)[\w.-]*\.config\.(mjs|js|ts)$/.test(file)) addEntry(file);
  }

  // A workflow step that runs a module is a caller, exactly like a package
  // script is. Without this, a tool invoked only by CI reads as dead code — and
  // the honest options were to delete something CI depends on or to add it to an
  // exception list, which is what this checker's own message tells you not to do.
  for (const file of allFiles.filter((candidate) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(candidate))) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/(?:^|\s)(?:node|npx tsx|tsx)\s+([\w@./-]+\.(?:mjs|js|ts))/g)) {
      addEntry(match[1].replace(/^\.\//, ''));
    }
  }

  // An HTML entry names its real module in a script tag; Vite starts there.
  for (const file of allFiles.filter((candidate) => candidate.endsWith('.html') && owned(candidate))) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/<script[^>]*\ssrc=['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      const base = specifier.startsWith('/')
        ? path.posix.join(path.posix.dirname(file), specifier.slice(1))
        : path.posix.join(path.posix.dirname(file), specifier);
      const resolved = resolveCandidate(root, files, base);
      if (resolved) addEntry(resolved);
    }
  }

  const reachable = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const current = queue.pop();
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const next of edges.get(current) ?? []) queue.push(next);
  }

  return {
    modules,
    entries: [...entries].sort(),
    reachable: [...reachable].filter((file) => modules.includes(file)).sort(),
    orphans: modules.filter((file) => !reachable.has(file)).sort(),
  };
}
