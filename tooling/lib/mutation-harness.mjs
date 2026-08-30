/**
 * Stage Q8 — a deterministic mutation harness for the safety logic, and nothing else.
 *
 * Mutation testing answers one question: would a plausible weakening of this code escape the
 * tests? It is expensive, so this never runs across the monorepo. It runs against a named set of
 * modules whose failure is severe — capability grants, approval rules, egress classification,
 * ChangeSet scope, budgets, production data-change guards — and against the tests that actually
 * cover them.
 *
 * There is no dependency here and no percentage. A score of "82% killed" says nothing about
 * severity: eighteen surviving mutations in comment-adjacent code are fine and one surviving
 * mutation that turns `approvalRequired` into `false` is a security defect. So every mutation is
 * generated from an operator that names a *weakening* — an `&&` that becomes `||`, a comparison
 * that widens, a boolean guard that inverts — and every survivor is reported individually with the
 * line it changed.
 *
 * Mutations are generated rather than hand-picked. Hand-picking proves that the mutations the
 * author thought of are killed, which is the same mistake as writing the tests in the first place.
 *
 * Equivalent mutations are not chased. When a survivor is genuinely equivalent — the mutated
 * program cannot behave differently — it is recorded in the registry with the reason, so the record
 * says what was examined rather than what was quietly excluded.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Each operator is a weakening, not an arbitrary edit.
 *
 * `>` to `>=` widens a budget or a boundary by one; `===` to `!==` inverts an environment or
 * identity comparison; `&&` to `||` turns "every condition" into "any condition", which is how a
 * permission check stops being one. Dropping a `!` inverts a guard.
 */
export const MUTATION_OPERATORS = Object.freeze([
  { id: 'and-to-or', pattern: /&&/g, replacement: '||', why: 'every condition becomes any condition' },
  { id: 'or-to-and', pattern: /\|\|/g, replacement: '&&', why: 'any condition becomes every condition' },
  { id: 'strict-equal-inverted', pattern: /===/g, replacement: '!==', why: 'an identity or environment comparison inverts' },
  { id: 'strict-not-equal-inverted', pattern: /!==/g, replacement: '===', why: 'a difference check inverts' },
  { id: 'gte-widened', pattern: />=/g, replacement: '>', why: 'a boundary widens by one' },
  { id: 'lte-widened', pattern: /<=/g, replacement: '<', why: 'a boundary widens by one' },
  { id: 'gt-widened', pattern: /(?<![>=<!])>(?![>=])/g, replacement: '>=', why: 'a boundary widens by one' },
  { id: 'lt-widened', pattern: /(?<![<=>!])<(?![<=])/g, replacement: '<=', why: 'a boundary widens by one' },
  { id: 'true-to-false', pattern: /\btrue\b/g, replacement: 'false', why: 'a required flag stops being required' },
  { id: 'false-to-true', pattern: /\bfalse\b/g, replacement: 'true', why: 'a refusal becomes an allowance' },
]);

/**
 * Positions inside comments, string literals, template literals and regular expressions.
 *
 * Mutating them produces nonsense rather than a plausible weakening: a `<=` inside an error message
 * is prose, and a `&&` inside a regular expression is a pattern. Skipping them is not leniency, it
 * is the difference between a survivor that means something and noise.
 */
function maskedSource(source) {
  const mask = Array.from({ length: source.length }, () => true);
  let index = 0;
  const hide = (from, to) => { for (let cursor = from; cursor < to && cursor < mask.length; cursor += 1) mask[cursor] = false; };

  while (index < source.length) {
    const pair = source.slice(index, index + 2);
    if (pair === '//') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      hide(index, stop);
      index = stop;
      continue;
    }
    if (pair === '/*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      hide(index, stop);
      index = stop;
      continue;
    }
    const character = source[index];
    if (character === '"' || character === "'" || character === '`') {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === '\\') { cursor += 2; continue; }
        if (source[cursor] === character) { cursor += 1; break; }
        cursor += 1;
      }
      hide(index, cursor);
      index = cursor;
      continue;
    }
    // A regular-expression literal, distinguished from division by what precedes it.
    if (character === '/') {
      const before = source.slice(0, index).trimEnd();
      const previous = before.at(-1) ?? '';
      if (previous === '' || '(,=:[!&|?{};+-*%~^<>'.includes(previous)) {
        let cursor = index + 1;
        let inClass = false;
        while (cursor < source.length) {
          const current = source[cursor];
          if (current === '\\') { cursor += 2; continue; }
          if (current === '[') inClass = true;
          else if (current === ']') inClass = false;
          else if (current === '/' && !inClass) { cursor += 1; break; }
          else if (current === '\n') break;
          cursor += 1;
        }
        hide(index, cursor);
        index = cursor;
        continue;
      }
    }
    index += 1;
  }
  return mask;
}

function lineOf(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

/** Every mutation this operator set can make to one file, in source order. */
export function generateMutations(file, source) {
  const mask = maskedSource(source);
  const mutations = [];
  // One line can hold several sites for the same operator — `a || b || c` is two — and they are
  // different mutations with different fates. The occurrence number keeps them distinct so that
  // recording one as equivalent cannot silently excuse its neighbour.
  const seen = new Map();
  for (const operator of MUTATION_OPERATORS) {
    for (const match of source.matchAll(operator.pattern)) {
      const offset = match.index;
      if (!mask[offset]) continue;
      const line = lineOf(source, offset);
      const key = `${line}:${operator.id}`;
      const occurrence = (seen.get(key) ?? 0) + 1;
      seen.set(key, occurrence);
      mutations.push({
        id: `${path.basename(file, '.js')}:${line}:${operator.id}#${occurrence}`,
        file,
        operator: operator.id,
        why: operator.why,
        line,
        offset,
        original: match[0],
        replacement: operator.replacement,
        source: source.slice(Math.max(0, source.lastIndexOf('\n', offset) + 1), source.indexOf('\n', offset) === -1 ? undefined : source.indexOf('\n', offset)).trim(),
      });
    }
  }
  return mutations.sort((left, right) => left.offset - right.offset || left.operator.localeCompare(right.operator));
}

/**
 * The environment for a mutant's test run.
 *
 * `NODE_TEST_CONTEXT` is set by Node's own test runner in the processes it spawns. A child that
 * inherits it reports itself as a nested test rather than as a run with its own verdict, and the
 * mutant's exit status then depends on how the harness happened to be started — which is not a
 * property a verdict may have. Removed, along with `NODE_OPTIONS`, so a mutant is judged the same
 * way whether the harness was run from a shell or from inside a test.
 */
function childEnvironment() {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  delete environment.NODE_OPTIONS;
  return environment;
}

function applyMutation(source, mutation) {
  return source.slice(0, mutation.offset) + mutation.replacement + source.slice(mutation.offset + mutation.original.length);
}

/**
 * Run one target's tests against every mutation of its source.
 *
 * A mutation is *killed* when the tests fail — that is the desired outcome and the reason the run
 * is slow. A *survivor* is a weakening the tests did not notice, and each one is either a missing
 * test or an equivalent mutation that the registry has to say so about.
 *
 * The original file is restored in a `finally`, which covers a throw and nothing else. It does not
 * cover being killed: `Ctrl-C`, a `timeout`, a cancelled CI job and an agent giving up on a slow run
 * all leave a mutant on disk, and a JS signal handler cannot help because the process spends almost
 * all of its life blocked inside `spawnSync`, where a signal is never dispatched to JavaScript at
 * all — measured, not assumed. The consequence is a weakened safety module sitting in the working
 * tree, indistinguishable from an edit, waiting for the next `git add -A`.
 *
 * So recovery does not depend on the dying process running any code. The original is written to a
 * sibling backup before the first mutation and removed on the way out; a backup still present when
 * a run starts is a previous run that was killed, and it is restored from before anything else
 * happens. The backup is also an untracked file with an obvious name, which is the loud version of
 * a problem that was otherwise silent.
 *
 * The unmutated tests are run first, and this is not a formality. A kill is inferred from a failing
 * exit status, so a target whose tests were *already* failing kills every mutation it is given and
 * reports a perfect score for a file nothing is defending. That is precisely the shape stage Q11
 * exists to refuse — a gate that passes doing nothing — and it is reachable by ordinary means: edit
 * the target, break one of its tests, and the run that was supposed to tell you so congratulates
 * you instead.
 */
/** Where a run parks the pristine source while it is mutating the real file. */
export function mutationBackupPath(root, file) {
  return `${path.join(root, file)}.mutation-backup`;
}

/**
 * Undo a run that was killed before it could tidy up.
 *
 * Returns the file it rescued, or null. Called at the start of every run rather than by a separate
 * command, because the person who needs this is the one who does not yet know it happened.
 */
export function recoverInterruptedMutation(root, file) {
  const backup = mutationBackupPath(root, file);
  if (!fs.existsSync(backup)) return null;
  fs.writeFileSync(path.join(root, file), fs.readFileSync(backup, 'utf8'));
  fs.rmSync(backup);
  return file;
}

export function runMutationTesting({ root, target, onProgress = () => {} }) {
  const absolute = path.join(root, target.file);
  const rescued = recoverInterruptedMutation(root, target.file);
  if (rescued) onProgress({ rescued });
  const original = fs.readFileSync(absolute, 'utf8');
  const backup = mutationBackupPath(root, target.file);

  const baseline = spawnSync(process.execPath, ['--test', ...target.tests], { cwd: root, encoding: 'utf8', timeout: 120_000, env: childEnvironment() });
  if (baseline.status !== 0 || baseline.error !== undefined) {
    const detail = baseline.error ? baseline.error.message : (baseline.stdout ?? '').split('\n').filter((line) => line.startsWith('not ok')).slice(0, 5).join('\n');
    throw new Error(
      `${target.file}: the unmutated tests do not pass, so every mutation would be reported killed and the result would mean nothing.\n${detail}`,
    );
  }

  const mutations = generateMutations(target.file, original);
  const ignored = new Map((target.equivalent ?? []).map((entry) => [entry.id, entry.why]));
  const killed = [];
  const survived = [];
  const skipped = [];

  fs.writeFileSync(backup, original);
  try {
    for (const mutation of mutations) {
      if (ignored.has(mutation.id)) {
        skipped.push({ ...mutation, why: ignored.get(mutation.id) });
        continue;
      }
      fs.writeFileSync(absolute, applyMutation(original, mutation));
      const result = spawnSync(process.execPath, ['--test', ...target.tests], { cwd: root, encoding: 'utf8', timeout: 120_000, env: childEnvironment() });
      // A timeout or a crash is a kill: the mutant did not survive undetected.
      const detected = result.status !== 0 || result.error !== undefined;
      (detected ? killed : survived).push(mutation);
      onProgress({ mutation, detected, done: killed.length + survived.length, total: mutations.length - skipped.length });
    }
  } finally {
    fs.writeFileSync(absolute, original);
    fs.rmSync(backup, { force: true });
  }

  return { target: target.file, total: mutations.length, killed, survived, skipped };
}
