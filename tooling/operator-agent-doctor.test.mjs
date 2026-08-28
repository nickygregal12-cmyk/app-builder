/**
 * Operator-agent continuity coverage.
 *
 * Two things are worth proving here, and they are the two that would be
 * discovered late and expensively.
 *
 * The first is that **an unproven login is never reported as a working one**.
 * The whole point of this diagnostic is to be trusted at the moment the current
 * agent has stopped answering; a doctor that says "fallback ready" because a
 * binary exists would be worse than none, because an operator would have
 * planned around it.
 *
 * The second is **redaction**. This module runs CLIs that hold OAuth sessions
 * and its output is written to be pasted into handoffs. So the secret material
 * is planted into the probe output here and the assertion is made against the
 * whole rendered report, not against the fields anybody remembered to check.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOGIN_CLASSES,
  OPERATOR_AGENTS,
  classifyCodexLogin,
  describeOperatorAgents,
  formatOperatorAgents,
  probeCommand,
} from './lib/operator-agents.mjs';

/** A probe that answers from a table, so a host state can be described exactly. */
const probeFrom = (table) => (binary, args) => {
  const key = `${binary} ${args.join(' ')}`;
  return table[key] ?? { ok: false, text: '' };
};

const CODEX_LOGGED_IN = {
  'claude --version': { ok: true, text: '2.1.220' },
  'codex --version': { ok: true, text: 'codex-cli 0.150.1' },
  'codex login status': { ok: true, text: 'Logged in using ChatGPT' },
  'opencode --version': { ok: true, text: '1.18.14' },
};

test('a ChatGPT session makes Codex a usable fallback', () => {
  const report = describeOperatorAgents({ probe: probeFrom(CODEX_LOGGED_IN) });
  const codex = report.agents.find((agent) => agent.id === 'codex');

  assert.equal(codex.installed, true);
  assert.equal(codex.login, LOGIN_CLASSES.chatgpt);
  assert.equal(report.fallbackReady, true);
});

test('an installed but signed-out Codex is not a fallback', () => {
  const report = describeOperatorAgents({
    probe: probeFrom({ ...CODEX_LOGGED_IN, 'codex login status': { ok: false, text: '' } }),
  });

  assert.equal(report.agents.find((agent) => agent.id === 'codex').login, LOGIN_CLASSES.loggedOut);
  assert.equal(report.fallbackReady, false, 'an installed binary nobody signed into cannot take the next task');

  // The remediation must name the step that is missing. Telling an operator who
  // has Codex installed to install Codex is how a diagnostic gets skimmed.
  const rendered = formatOperatorAgents(report);
  assert.match(rendered, /codex login/);
  assert.ok(!/is not installed/.test(rendered), 'must not tell an operator to install what they already have');
});

test('an unrecognised login answer is unknown, never assumed ready', () => {
  const report = describeOperatorAgents({
    probe: probeFrom({ ...CODEX_LOGGED_IN, 'codex login status': { ok: true, text: 'some future phrasing nobody predicted' } }),
  });

  assert.equal(report.agents.find((agent) => agent.id === 'codex').login, LOGIN_CLASSES.unknown);
  assert.equal(report.fallbackReady, false, 'unknown must not be optimistic: this is the claim an operator plans around');
});

test('a missing Codex is reported rather than inferred from the others', () => {
  const report = describeOperatorAgents({
    probe: probeFrom({ 'claude --version': { ok: true, text: '2.1.220' } }),
  });
  const codex = report.agents.find((agent) => agent.id === 'codex');

  assert.equal(codex.installed, false);
  assert.equal(codex.version, null);
  assert.equal(codex.login, null, 'a binary that is not there has no session to classify');
  assert.equal(report.fallbackReady, false);
});

test('Claude Code is never credited with a login it cannot be asked for', () => {
  const report = describeOperatorAgents({ probe: probeFrom(CODEX_LOGGED_IN) });
  const claude = report.agents.find((agent) => agent.id === 'claude-code');

  assert.equal(claude.installed, true);
  assert.equal(claude.login, null, 'reported honestly as unasked rather than inferred from the binary existing');
});

test('login classification refuses to read "logged in" as a working session', () => {
  assert.equal(classifyCodexLogin({ ok: true, text: 'Logged in using ChatGPT' }), LOGIN_CLASSES.chatgpt);
  assert.equal(classifyCodexLogin({ ok: true, text: 'Logged in using an API key' }), LOGIN_CLASSES.apiKey);
  assert.equal(classifyCodexLogin({ ok: true, text: 'Not logged in' }), LOGIN_CLASSES.loggedOut);
  assert.equal(classifyCodexLogin({ ok: false, text: '' }), LOGIN_CLASSES.loggedOut);
  assert.equal(classifyCodexLogin({ ok: true, text: '' }), LOGIN_CLASSES.unknown);
});

test('no credential material reaches the rendered report', () => {
  // What a leak would actually look like: a CLI that got chatty and echoed the
  // session it is using. If any of this survives into the report, the doctor is
  // a leak with a friendly banner.
  const planted = 'sk-proj-PLANTEDSECRET0123456789';
  const refresh = 'rt_PLANTEDREFRESHTOKEN9876';
  const report = describeOperatorAgents({
    probe: probeFrom({
      ...CODEX_LOGGED_IN,
      'codex login status': { ok: true, text: `Logged in using ChatGPT\naccess_token=${planted}\nrefresh_token=${refresh}` },
      'codex --version': { ok: true, text: `codex-cli 0.150.1 ${planted}` },
    }),
  });

  const rendered = `${formatOperatorAgents(report)}\n${JSON.stringify(report)}`;
  assert.ok(!rendered.includes(planted), 'an access token echoed by the CLI must not survive into the report');
  assert.ok(!rendered.includes(refresh), 'a refresh token echoed by the CLI must not survive into the report');
  // Still useful despite the redaction: the session was classified correctly.
  assert.equal(report.agents.find((agent) => agent.id === 'codex').login, LOGIN_CLASSES.chatgpt);
});

test('the doctor consumes no gateway credential', () => {
  // Operator continuity and the paid model lane are separate architectures, and
  // this asserts the seam rather than trusting the comment that describes it:
  // nothing here may reach for the secret reference the gateway resolves.
  const seen = [];
  describeOperatorAgents({
    probe: (binary, args) => {
      seen.push(`${binary} ${args.join(' ')}`);
      return { ok: false, text: '' };
    },
  });

  assert.ok(seen.length > 0);
  for (const invocation of seen) {
    assert.ok(
      /--version$|login status$/.test(invocation),
      `an operator probe may only ask a CLI what it is or whether it is signed in, got: ${invocation}`,
    );
  }
  assert.equal(process.env.ANTHROPIC_API_KEY, undefined, 'this suite must not require the gateway credential to run');
});

test('a CLI that answers on stderr is still heard', () => {
  // Regression, found by running the doctor on the host it was written for.
  // Codex 0.150.1 prints `login status` to stderr and exits 0, so a probe
  // reading stdout alone reported a signed-in machine as `unknown` — the exact
  // false negative that would have sent an operator looking for another
  // fallback they did not need.
  const probed = probeCommand(process.execPath, ['-e', "console.error('Logged in using ChatGPT')"]);

  assert.equal(probed.ok, true);
  assert.equal(classifyCodexLogin(probed), LOGIN_CLASSES.chatgpt);
});

test('Codex is the declared fallback in the agent registry', () => {
  // The runbook, the doctor and the copyback all name Codex as the thing that
  // picks up when Claude stops. If that entry is ever dropped, the phrase
  // "fallback ready" quietly starts meaning nothing.
  const codex = OPERATOR_AGENTS.find((agent) => agent.id === 'codex');
  assert.ok(codex, 'Codex must remain in the operator-agent registry');
  assert.match(codex.role, /fallback/i);
});
