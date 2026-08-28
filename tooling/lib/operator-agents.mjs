/**
 * What this host can currently drive a mutable checkout with.
 *
 * App Builder's durable state lives in Git, the event ledger and the task
 * records. The *worker* that advances it is a coding agent an operator starts:
 * Claude Code today, Codex when the Claude allowance runs out, OpenCode where a
 * bounded runtime is wanted. Those are interchangeable in principle, and the
 * question this module answers is whether they are interchangeable *right now,
 * on this box* — because discovering that Codex was never installed at the
 * moment Claude stops answering is discovering it too late.
 *
 * ## Why this is not the model lane
 *
 * `tooling/lib/model-gateway.mjs` and `config/model-execution.json` govern calls
 * the factory pays for: signed decisions, budgets, a two-key kill switch and a
 * credential the gateway resolves and nobody else sees. None of that applies
 * here. An operator coding agent is a tool a human launches against a worktree
 * under their own account and their own vendor session, and App Builder's
 * interest in it stops at "is it available?".
 *
 * That boundary is the reason this file exists separately, and it is load
 * bearing in one direction in particular: **nothing here reads, copies or
 * exports a vendor credential.** Codex authenticates itself through the
 * ChatGPT sign-in it already holds. App Builder does not want that token, has
 * no place to put it, and would be importing a liability by taking one. So the
 * strongest claim this module ever makes about a login is a *class* —
 * `chatgpt`, `api-key`, `logged-out` — derived from what the CLI says about
 * itself, never the material behind it.
 *
 * ## Why the probe is injected
 *
 * Detection is inherently impure: it shells out, and its answers change with
 * the machine. So the impure part is one narrow function and everything that
 * decides what an answer *means* is pure and tested. A test can then prove the
 * logged-out branch, the missing-binary branch and the redaction rule without
 * needing a host that happens to be in that state.
 */

import { spawnSync } from 'node:child_process';

/** The agents worth asking about, and what each one is for. */
export const OPERATOR_AGENTS = Object.freeze([
  Object.freeze({
    id: 'claude-code',
    binary: 'claude',
    label: 'Claude Code',
    role: 'current primary development agent',
  }),
  Object.freeze({
    id: 'codex',
    binary: 'codex',
    label: 'Codex CLI',
    role: 'primary fallback when the Claude allowance is exhausted',
  }),
  Object.freeze({
    id: 'opencode',
    binary: 'opencode',
    label: 'OpenCode',
    role: 'bounded runtime; service health is `npm run opencode:doctor`',
  }),
]);

/** Login classes. Deliberately coarse: a class is all an operator needs. */
export const LOGIN_CLASSES = Object.freeze({
  chatgpt: 'chatgpt',
  apiKey: 'api-key',
  loggedOut: 'logged-out',
  unknown: 'unknown',
});

/**
 * Read a login class out of what `codex login status` printed.
 *
 * This matches on the shape of the sentence rather than parsing a format the
 * CLI never promised, and every unrecognised answer becomes `unknown` rather
 * than an optimistic `chatgpt`. Guessing "probably logged in" is the one
 * failure mode that would make this diagnostic worth less than no diagnostic:
 * an operator plans around it at the moment Claude has already stopped.
 *
 * The input string is classified and then dropped. It is never returned and
 * never printed, because CLI output is a place an account identifier can
 * appear and this module's output goes into terminals and pasted reports.
 */
export function classifyCodexLogin({ ok, text }) {
  if (!ok) return LOGIN_CLASSES.loggedOut;
  const normalised = String(text ?? '').toLowerCase();
  if (!normalised.trim()) return LOGIN_CLASSES.unknown;
  if (normalised.includes('not logged in') || normalised.includes('logged out')) return LOGIN_CLASSES.loggedOut;
  // Order matters: the ChatGPT sentence is the one the supported flow prints,
  // and an API-key session says so explicitly.
  if (normalised.includes('chatgpt')) return LOGIN_CLASSES.chatgpt;
  if (normalised.includes('api key') || normalised.includes('api-key')) return LOGIN_CLASSES.apiKey;
  if (normalised.includes('logged in')) return LOGIN_CLASSES.unknown;
  return LOGIN_CLASSES.unknown;
}

/**
 * The one impure function: run a binary and report whether it answered.
 *
 * Bounded by a timeout because an agent CLI that decides to prompt for input
 * would otherwise hang `npm run check` forever, and a diagnostic that can hang
 * is a diagnostic people stop running.
 */
export function probeCommand(binary, args, { timeoutMs = 15000 } = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', timeout: timeoutMs });
  if (result.error) return { ok: false, text: '' };
  // Both streams, because which one a CLI answers on is its choice and not a
  // fact worth encoding here. Codex 0.150.1 prints `login status` to stderr and
  // exits 0; reading stdout alone reported a signed-in host as `unknown`, which
  // is precisely the wrong answer for the one question this module exists to
  // answer. Combining them is safe because nothing downstream echoes this text:
  // `versionFrom` whitelists and `classifyCodexLogin` classifies and drops.
  const text = `${String(result.stdout ?? '')}\n${String(result.stderr ?? '')}`.trim();
  return { ok: result.status === 0, text };
}

/**
 * The version, extracted rather than echoed.
 *
 * The obvious implementation — take the first line and truncate it — is a leak,
 * and `operator-agent-doctor.test.mjs` demonstrates it: a CLI that prints
 * anything alongside its version puts that thing straight into a report written
 * to be pasted into handoffs. Truncation does not help, because the material
 * that matters is short.
 *
 * So this is a whitelist. A version number is recognised and nothing else
 * survives, which means an unrecognised banner degrades to `unknown` instead of
 * degrading to whatever the CLI felt like printing. Losing a version string is
 * a cosmetic failure; carrying a token out of this function is not.
 */
export function versionFrom(text) {
  const match = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.]{1,20})?/.exec(String(text ?? ''));
  return match ? match[0].slice(0, 40) : '';
}

/**
 * Describe the operator agents this host can run.
 *
 * Pure with respect to `probe`, which is why the interesting states are
 * testable. Returns booleans, enums and version strings — no paths into a
 * credential store, no environment values, and nothing derived from the
 * contents of an auth file. The report is designed to be safe to paste.
 */
export function describeOperatorAgents({ probe = probeCommand, agents = OPERATOR_AGENTS } = {}) {
  const entries = agents.map((agent) => {
    const version = probe(agent.binary, ['--version']);
    const installed = version.ok;

    // Login is only asked about where the CLI can answer it without a paid
    // call, and only Codex currently can. Claude Code's session state is not
    // interrogable this way, so it is reported honestly as unknown rather than
    // inferred from the fact that a binary exists.
    let login = null;
    if (installed && agent.id === 'codex') {
      login = classifyCodexLogin(probe(agent.binary, ['login', 'status']));
    }

    return Object.freeze({
      id: agent.id,
      label: agent.label,
      role: agent.role,
      installed,
      version: installed ? versionFrom(version.text) || 'unknown' : null,
      login,
    });
  });

  return Object.freeze({
    agents: Object.freeze(entries),
    /**
     * Can development continue if the current agent stops answering?
     *
     * Installed is not enough — an installed CLI nobody has signed into cannot
     * take the next task. `unknown` does not count either, for the same reason
     * `classifyCodexLogin` refuses to guess.
     */
    fallbackReady: entries.some((entry) => entry.id === 'codex' && entry.installed && (entry.login === LOGIN_CLASSES.chatgpt || entry.login === LOGIN_CLASSES.apiKey)),
  });
}

/** The report as an operator reads it. Booleans and enums, never material. */
export function formatOperatorAgents(report) {
  const lines = ['Operator agents'];
  for (const agent of report.agents) {
    lines.push(`  ${agent.label}`);
    lines.push(`    installed: ${agent.installed ? 'yes' : 'no'}`);
    if (agent.installed) lines.push(`    version: ${agent.version}`);
    if (agent.login) lines.push(`    login: ${agent.login}`);
    lines.push(`    role: ${agent.role}`);
  }
  lines.push('');
  lines.push(`  Fallback ready: ${report.fallbackReady ? 'yes' : 'no'}`);
  if (!report.fallbackReady) {
    // Say the step that is actually missing. "Install and sign in" told an
    // operator with Codex already installed to do something they had done,
    // which is how a diagnostic teaches people to skim it.
    const codex = report.agents.find((agent) => agent.id === 'codex');
    lines.push(codex?.installed
      ? '    Codex is installed but has no session this can confirm. Run `codex login`'
      : '    Codex is the declared fallback and is not installed. Install it and run `codex login`');
    lines.push('    before the Claude allowance runs out — see ops/hetzner/README.md §7a.');
  }
  return lines.join('\n');
}
