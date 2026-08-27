#!/usr/bin/env node
/**
 * Stage Q5 — the design-token gate.
 *
 *   npm run lint:design-system            # the shipped surface
 *   npm run lint:design-system -- <dir>   # a generated project, from its own files
 *
 * With no argument it lints what the factory ships into generated projects:
 * every stylesheet under `templates/<name>/files`, `templates/shared/presentation`
 * and `recipes/<name>/files`. Given a directory it lints that directory instead,
 * which is how a real generated build is checked against its *own* compiled
 * tokens rather than against the template defaults.
 *
 * It is blocking, and it earned that by being measured first: eighteen colour
 * literals on the shipped surface before any rule existed, fifteen of them one
 * recipe's parallel palette. A gate adopted while everything passes proves
 * nothing about the gate; this one was adopted against real findings and the
 * findings were fixed.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { lintDesignSystem } from './lib/design-system-lint.mjs';

const SHIPPED_ROOTS = ['templates', 'recipes'];

/** Stylesheets the factory ships into somebody else's repository. */
function shippedStylesheets(root) {
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(full);
      } else if (entry.name.endsWith('.css')) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  for (const top of SHIPPED_ROOTS) walk(path.join(root, top));
  return found.sort();
}

/** Every stylesheet a generated project carries, excluding what it installed. */
function projectStylesheets(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.git', '.app-builder'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.name.endsWith('.css')) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

const target = process.argv.slice(2).find((argument) => !argument.startsWith('--')) ?? null;
const root = target ? path.resolve(target) : process.cwd();
const relatives = target ? projectStylesheets(root) : shippedStylesheets(root);

if (relatives.length === 0) {
  console.error(`No stylesheet found under ${root}. A design-system gate that linted nothing would report clean.`);
  process.exit(1);
}

const files = relatives.map((file) => ({ file, source: fs.readFileSync(path.join(root, file), 'utf8') }));
const report = lintDesignSystem({ files });

// A run that found no token at all is a broken check rather than a clean build:
// every `var()` would be undeclared and every colour would have nowhere to come
// from, so the silence would mean the walk missed the design system.
if (report.declaredTokens.length === 0) {
  console.error(`No custom property is declared by any of the ${report.files} stylesheet(s) under ${root}.`);
  process.exit(1);
}

console.log(`Design-system lint: ${report.files} stylesheet(s), ${report.declaredTokens.length} declared token(s).`);

for (const entry of report.findings) {
  console.error(`  ${entry.check}  ${entry.file}:${entry.line}  ${entry.detail}`);
  console.error(`      ${entry.guidance}`);
}

if (!report.clean) {
  console.error(`\n${report.findings.length} design-system violation(s). A literal renders the same value whatever brand the build resolved.`);
  process.exitCode = 1;
} else {
  console.log(`Every colour in ${target ? root : 'the shipped surface'} is declared as a token, and every token reference resolves to a declaration.`);
}
