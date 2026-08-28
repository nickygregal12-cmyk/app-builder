#!/usr/bin/env node
/**
 * Provider-continuity doctor.
 *
 * Answers "if the current worker stops, what can actually take over?" in one
 * place, across both halves of continuity — the operator CLI a human drives and
 * the API providers the factory calls. They are separate architectures for good
 * reasons, and an operator still needs one screen that says whether either of
 * them is ready.
 *
 * Like `operator-agent-doctor.mjs`, this is a report rather than a gate. A host
 * with no provider keys is a host that has not been given any, which is the
 * committed state and not a failure. Structural invariants about the profiles
 * belong in `npm run check`, where `model-execution-doctor.mjs` already holds
 * them; this describes a machine.
 *
 * ## It makes no network call
 *
 * Ordinary mode reads config and checks whether a named environment variable is
 * non-empty. That is all. It does not reach a provider, so it cannot cost money,
 * cannot be rate limited, and works on a laptop with no credentials. Reachability
 * would need `--live`, which is deliberately not implemented here: a live check
 * is a provider call, and provider calls are the operator decision that
 * `config/model-execution.json` exists to gate.
 *
 * ## What it will not print
 *
 * `configured` is a boolean, permanently. There is no verbose mode that prints a
 * key, for the same reason `describeModelKillSwitch` has none — a diagnostic
 * that can print a credential is a leak waiting for someone to paste its output
 * into an issue.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createProviderProfile } from '@app-builder/control-plane/provider-routing';

import { describeOperatorAgents, formatOperatorAgents } from './lib/operator-agents.mjs';
import { readModelKillSwitch } from './lib/model-kill-switch.mjs';

/**
 * Describe one provider profile as an operator needs to see it.
 *
 * `env` is passed in rather than read from the ambient process so a test can
 * prove the configured and unconfigured branches without touching the runner's
 * environment — and so nothing reaches for a variable name the config did not
 * declare.
 */
export function describeProviderProfile(profile, { env = process.env } = {}) {
  return Object.freeze({
    providerId: profile.providerId,
    adapterId: profile.adapterId,
    modelId: profile.modelId,
    // Presence, never the value. There is nowhere on this object to put one.
    secretConfigured: Boolean(profile.secretRef && String(env[profile.secretRef] ?? '').trim()),
    secretRef: profile.secretRef,
    costMode: profile.costMode,
    allowedDataClasses: profile.allowedDataClasses,
    readyRoles: profile.eligibleRoles,
    highRiskRolesApproved: profile.highRiskRolesApproved,
    // Readiness is evidence of a recorded canary. Nothing here can create it,
    // and a configured secret is not it.
    canary: profile.ready ? 'passed' : 'not-run',
  });
}

export function formatProviders(entries, { killSwitchEnabled }) {
  const lines = ['Provider continuity'];
  for (const entry of entries) {
    lines.push(`  ${entry.providerId}`);
    lines.push(`    adapter: ${entry.adapterId ?? 'none — not configured'}`);
    lines.push(`    model: ${entry.modelId ?? 'none — must be pinned before use'}`);
    lines.push(`    secret ${entry.secretRef ?? '(none declared)'}: ${entry.secretConfigured ? 'configured' : 'missing'}`);
    lines.push(`    cost mode: ${entry.costMode}`);
    lines.push(`    permitted data: ${entry.allowedDataClasses.join('/') || 'none'}`);
    lines.push(`    live canary: ${entry.canary}`);
    lines.push(`    ready roles: ${entry.readyRoles.join(', ') || 'none'}`);
    if (entry.highRiskRolesApproved.length) {
      lines.push(`    high-risk approved: ${entry.highRiskRolesApproved.join(', ')}`);
    }
  }
  lines.push('');
  lines.push(`  Model execution: ${killSwitchEnabled ? 'ENABLED' : 'disabled (committed default)'}`);
  if (!killSwitchEnabled) {
    lines.push('    No provider call can happen while either switch is off, however');
    lines.push('    many keys are configured. See config/model-execution.json.');
  }
  return lines.join('\n');
}

function main() {
  const root = process.cwd();
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config/provider-profiles.json'), 'utf8'));
  const entries = config.profiles.map((raw) => describeProviderProfile(createProviderProfile(raw)));
  const killSwitch = readModelKillSwitch({ root });

  console.log(formatOperatorAgents(describeOperatorAgents()));
  console.log('');
  console.log(formatProviders(entries, { killSwitchEnabled: killSwitch.enabled }));
  console.log('');
  console.log('No provider was contacted to produce this report. Readiness is earned by');
  console.log('a recorded canary against a synthetic fixture, never by a key existing.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
