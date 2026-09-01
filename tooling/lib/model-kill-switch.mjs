/**
 * The model-execution kill switch, read from the trusted side.
 *
 * This is the thing an operator reaches for when the answer has to be "stop,
 * now". So it is built to be boring: two files, both must say yes, and every
 * other outcome — missing, unreadable, malformed, wrong shape, disabled — is
 * off with a reason.
 *
 * Two keys rather than one, because the two answers are genuinely different
 * questions:
 *
 * - `config/model-execution.json` is the *repository's* answer, changed by a
 *   reviewed merge. It stops a lane from being enabled by editing a file on a
 *   box nobody reviewed.
 * - `/etc/app-builder/model-execution.json` is the *host's* answer, changed by
 *   the operator in a second. It stops a lane the repository thinks is fine,
 *   without waiting for a merge, and it means a host that never opted in
 *   cannot be started by someone else's commit.
 *
 * Neither can override the other, in either direction. That is what makes this
 * a kill switch rather than a setting.
 *
 * It is deliberately not `runtimeReady`. That flag answers "has this role been
 * proven?"; this switch answers "may the factory spend money on a model right
 * now?". A proven role with the switch off makes no calls, and flipping the
 * switch proves nothing about any role.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describeProviderSecret } from '@app-builder/control-plane/model-execution';

import { describeProviderCredentialSource } from './provider-credential.mjs';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const MODEL_EXECUTION_CONFIG = 'config/model-execution.json';

function readSwitchFile(file) {
  if (!fs.existsSync(file)) return { present: false, enabled: false, detail: `${file} does not exist`, value: null };
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    // A switch nobody can parse is off. Reading a corrupt file optimistically
    // is the one failure mode this must not have.
    return { present: true, enabled: false, detail: `${file} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`, value: null };
  }
  if (value?.enabled !== true) {
    return { present: true, enabled: false, detail: value?.disabledReason ? `${file}: ${value.disabledReason}` : `${file} does not set enabled: true`, value };
  }
  return { present: true, enabled: true, detail: `${file} enables model execution`, value };
}

/**
 * Resolve the effective switch.
 *
 * `env` is passed in rather than read from the ambient process so a test can
 * prove the credential-present and credential-absent branches without touching
 * the runner's environment — and so nothing here reaches for a variable name
 * that was not declared in the config.
 */
export function readModelKillSwitch({ root = REPOSITORY_ROOT, env = process.env, hostSwitchPath = null, providerProfile = null } = {}) {
  const configPath = path.join(root, MODEL_EXECUTION_CONFIG);
  const repository = readSwitchFile(configPath);
  const config = repository.value ?? (() => {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      return null;
    }
  })();

  const hostPath = hostSwitchPath ?? config?.hostSwitchPath ?? null;
  const host = hostPath ? readSwitchFile(hostPath) : { present: false, enabled: false, detail: 'no host switch path is declared', value: null };

  // The credential, as presence and nothing else. This asks
  // `describeProviderCredentialSource` whether one is there and never returns,
  // logs or stores what it found — the same shape
  // `FactoryService.integrationStatus()` already uses for the Factory's other
  // providers. Which source answered is recorded because an operator needs to
  // know whether the hosted systemd credential is actually being used or a
  // stray environment variable is standing in for it; *what* it answered with
  // has nowhere to go.
  const secretRef = providerProfile?.secretRef ?? config?.providerSecret?.secretRef ?? null;
  const credential = secretRef ? describeProviderCredentialSource({ secretRef, env }) : null;
  const providerSecret = secretRef
    ? describeProviderSecret({
        providerId: providerProfile?.providerId ?? config?.providerSecret?.providerId ?? config?.provider?.providerId ?? 'unknown',
        secretRef,
        configured: credential.configured,
      })
    : null;

  const enabled = repository.enabled && host.enabled;
  const blockers = [];
  if (!repository.enabled) blockers.push(repository.detail);
  if (!host.enabled) blockers.push(host.detail);

  return Object.freeze({
    enabled,
    detail: enabled ? 'both the repository and the host switch enable model execution' : blockers.join('; '),
    blockers,
    sources: Object.freeze({
      repository: Object.freeze({ path: configPath, present: repository.present, enabled: repository.enabled, detail: repository.detail }),
      host: Object.freeze({ path: hostPath, present: host.present, enabled: host.enabled, detail: host.detail }),
    }),
    provider: config?.provider ?? null,
    providerSecret,
    // Presence metadata only: which lane answered and, when none did, why not.
    // Never the value, and there is no field here it could occupy.
    credentialSource: credential ? Object.freeze({ source: credential.source, reason: credential.reason, detail: credential.detail }) : null,
    pricingGbpPerMillionTokens: config?.pricingGbpPerMillionTokens ?? null,
    canaryBudget: config?.canaryBudget ?? null,
    canary: config?.canary ?? null,
  });
}

/**
 * The switch as an operator sees it in `npm run doctor`.
 *
 * `configured` is a boolean, on purpose and permanently. There is no verbose
 * mode that prints the key, because a diagnostic that can print a credential is
 * a credential leak waiting for someone to paste its output into an issue.
 */
export function describeModelKillSwitch(state) {
  return {
    enabled: state.enabled,
    detail: state.detail,
    repositorySwitch: { path: state.sources.repository.path, enabled: state.sources.repository.enabled },
    hostSwitch: { path: state.sources.host.path, present: state.sources.host.present, enabled: state.sources.host.enabled },
    provider: state.provider ? { adapterId: state.provider.adapterId, providerId: state.provider.providerId, model: state.provider.model } : null,
    providerSecret: state.providerSecret
      ? {
          providerId: state.providerSecret.providerId,
          secretRef: state.providerSecret.secretRef,
          configured: state.providerSecret.configured,
          // `systemd-credential` or `environment` — the lane, not the key.
          source: state.credentialSource?.source ?? null,
        }
      : null,
  };
}
