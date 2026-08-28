#!/usr/bin/env node
/**
 * Operator-agent doctor.
 *
 * Answers one question: **can this host run a coding agent against an isolated
 * worktree right now?** It exists because the answer changes without warning —
 * a usage allowance expires, a CLI is never installed, a login lapses — and the
 * moment an operator needs to know is the moment the current agent has already
 * stopped being able to tell them.
 *
 * It is a *report*, not a gate. A host with no Codex installed is a host that
 * has not prepared its fallback yet, which is worth saying loudly and is not
 * grounds for failing `npm run check`: the deterministic checks describe the
 * repository, and the repository is correct whether or not this particular box
 * has a second CLI on it. So the only conditions that exit non-zero are ones
 * that mean *this diagnostic itself* cannot be believed.
 *
 * It makes no model call, paid or free. Every probe is `--version` or a local
 * session lookup, so it is safe on a machine with no credential and costs
 * nothing to run in a loop.
 *
 * ## What it will not print
 *
 * No tokens, no API keys, no auth-file contents, and no path into a credential
 * store. Codex holds a ChatGPT OAuth session in a file this process never
 * opens; what gets reported is the class the CLI names for its own session.
 * The rule is the same one `describeModelKillSwitch` follows for the provider
 * secret — a diagnostic that *can* print a credential is a leak waiting for
 * someone to paste its output into an issue — and `operator-agent-doctor.test.mjs`
 * holds it by asserting against planted secret material.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { describeOperatorAgents, formatOperatorAgents, probeCommand, versionFrom } from './lib/operator-agents.mjs';

/**
 * Git's side of the answer.
 *
 * Worktree support is what makes "one mutable agent = one worktree + branch"
 * enforceable, so an operator handing work to a different agent needs it
 * present rather than assumed. Reported, like everything else here, as facts
 * about capability and not as a pass/fail.
 */
export function describeGitWorktrees({ probe = probeCommand } = {}) {
  const version = probe('git', ['--version']);
  if (!version.ok) return Object.freeze({ installed: false, version: null, worktrees: null, repository: false });

  // `git worktree list` answers two things at once: whether the subcommand
  // exists at all, and whether we are standing in a repository. Both matter,
  // and neither needs the output kept.
  const list = spawnSync('git', ['worktree', 'list'], { encoding: 'utf8', timeout: 15000 });
  const inRepository = !list.error && list.status === 0;

  return Object.freeze({
    installed: true,
    // Same whitelist as the agent probes. Git is not a credential holder, but a
    // report with one echoing rule and one echoing exception is a report whose
    // rule nobody can state.
    version: versionFrom(version.text) || 'unknown',
    worktrees: inRepository ? String(list.stdout ?? '').trim().split('\n').filter(Boolean).length : null,
    repository: inRepository,
  });
}

export function formatGit(git) {
  if (!git.installed) return 'Git\n  installed: no';
  return [
    'Git',
    `  installed: yes (${git.version})`,
    `  worktree support: ${git.worktrees === null ? 'unknown' : 'yes'}`,
    `  inside a repository: ${git.repository ? 'yes' : 'no'}`,
    ...(git.repository ? [`  worktrees checked out: ${git.worktrees}`] : []),
  ].join('\n');
}

function main() {
  const agents = describeOperatorAgents();
  const git = describeGitWorktrees();

  console.log(formatOperatorAgents(agents));
  console.log('');
  console.log(formatGit(git));
  console.log('');
  console.log('Model lane: this report covers operator CLIs only. Whether the factory');
  console.log('may spend money on a provider call is `npm run doctor` and');
  console.log('config/model-execution.json, which are a separate decision.');

  // Git absent is the one finding that invalidates the report, because every
  // continuity claim downstream of it assumes a worktree can be made.
  if (!git.installed) {
    console.error('\nGit is not available, so no agent can be given an isolated worktree.');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
