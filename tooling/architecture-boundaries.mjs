#!/usr/bin/env node
/**
 * Executable architecture boundaries.
 *
 * `AGENTS.md` states the dependency direction in prose. Prose does not fail CI, so this gate reads
 * the real import graph and rejects an illegal edge before it lands.
 *
 * It answers exactly one question: **is the dependency direction legal?** Prose that merely mentions
 * a package is a different question and stays with the doctors, which is why this parses module
 * specifiers and declared dependencies rather than scanning for substrings.
 *
 * Deliberately dependency-free: the rules are expressible with the Node platform, and a boundary
 * checker that itself adds a dependency would be an odd way to argue for restraint.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const SOURCE = /\.(?:js|mjs|cjs|jsx|ts|tsx)$/;
const MANIFESTS = new Set(['package.json', 'template.json', 'recipe.json', 'adapter.json']);
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);

const registry = JSON.parse(fs.readFileSync(path.join(root, 'config/architecture-boundaries.json'), 'utf8'));
const zones = registry.zones ?? {};

const zoneByPackage = new Map();
for (const [zoneId, zone] of Object.entries(zones)) {
  if (zone.package) zoneByPackage.set(zone.package, zoneId);
}

/** Longest matching path prefix wins, so nested zones stay unambiguous. */
function zoneOfPath(relative) {
  let best = null;
  let bestLength = -1;
  for (const [zoneId, zone] of Object.entries(zones)) {
    for (const prefix of zone.paths ?? []) {
      if ((relative === prefix || relative.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
        best = zoneId;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else found.push(full);
    }
  }
  return found;
}

/**
 * Module specifiers only. Matching the `from`/`require`/`import()` forms rather than bare text is
 * what separates a real edge from a package name mentioned in a comment or a string of prose.
 */
const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
];

export function extractSpecifiers(text) {
  const specifiers = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of text.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function declaredDependencies(manifest) {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

/**
 * Resolve a specifier to the zone it actually reaches. A relative path is resolved against the
 * importing file first, so `../../../apps/service/src/store.js` cannot dodge a package-name rule.
 */
export function resolveTarget(specifier, fromFileRelative) {
  if (specifier.startsWith('node:')) return null;
  if (specifier.startsWith('.')) {
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFileRelative), specifier));
    if (resolved.startsWith('..')) return null;
    return { kind: 'path', zone: zoneOfPath(resolved), target: resolved };
  }
  const zone = zoneByPackage.get(specifier)
    ?? zoneByPackage.get(specifier.split('/').slice(0, 2).join('/'));
  if (zone) return { kind: 'package', zone, target: specifier };
  return null;
}

function collectEdges() {
  const edges = [];
  for (const [zoneId, zone] of Object.entries(zones)) {
    for (const prefix of zone.paths ?? []) {
      for (const file of walk(path.join(root, prefix))) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        const base = path.basename(file);
        let specifiers = [];
        if (SOURCE.test(base)) {
          specifiers = extractSpecifiers(fs.readFileSync(file, 'utf8'));
        } else if (MANIFESTS.has(base)) {
          try {
            specifiers = declaredDependencies(JSON.parse(fs.readFileSync(file, 'utf8')));
          } catch {
            // A malformed manifest is the root doctor's finding, not a boundary violation.
            continue;
          }
        } else {
          continue;
        }
        for (const specifier of specifiers) {
          const resolved = resolveTarget(specifier, relative);
          if (!resolved?.zone || resolved.zone === zoneId) continue;
          edges.push({ from: zoneId, to: resolved.zone, file: relative, specifier });
        }
      }
    }
  }
  return edges;
}

function findCycle(edges) {
  const graph = new Map();
  for (const edge of edges) {
    if (!graph.has(edge.from)) graph.set(edge.from, new Set());
    graph.get(edge.from).add(edge.to);
  }
  const state = new Map();
  const stack = [];
  let cycle = null;

  function visit(node) {
    if (cycle) return;
    state.set(node, 'open');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'open') {
        cycle = [...stack.slice(stack.indexOf(next)), next];
        return;
      }
      if (!state.has(next)) visit(next);
      if (cycle) return;
    }
    stack.pop();
    state.set(node, 'closed');
  }

  for (const node of graph.keys()) {
    if (!state.has(node)) visit(node);
    if (cycle) return cycle;
  }
  return null;
}

/** Pure rule matching, so the boundary logic is testable without planting files in the repository. */
export function violationsOf(edges, boundaries = registry.boundaries ?? []) {
  const violations = [];
  for (const boundary of boundaries) {
    const forbidden = new Set(boundary.forbidZones ?? []);
    for (const edge of edges) {
      if (edge.from !== boundary.from || !forbidden.has(edge.to)) continue;
      violations.push({
        rule: boundary.id,
        file: edge.file,
        specifier: edge.specifier,
        to: edge.to,
        reason: boundary.reason,
      });
    }
  }
  return violations;
}

export { findCycle };

export function checkArchitecture() {
  const edges = collectEdges();
  return {
    edges,
    violations: violationsOf(edges),
    cycle: registry.cycles?.check ? findCycle(edges) : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { edges, violations, cycle } = checkArchitecture();
  for (const violation of violations) {
    console.error(`Architecture boundary violated [${violation.rule}]: ${violation.file} -> ${violation.specifier} (${violation.to})`);
    console.error(`  ${violation.reason}`);
  }
  if (cycle) {
    console.error(`Architecture cycle detected: ${cycle.join(' -> ')}`);
    console.error(`  ${registry.cycles.reason}`);
  }
  if (violations.length || cycle) process.exit(1);
  const zoneCount = Object.keys(zones).length;
  console.log(`Architecture boundaries: ${edges.length} cross-zone edges across ${zoneCount} zones obey ${registry.boundaries.length} rules, and the zone graph is cycle-free.`);
}
