/**
 * Resolving a provider credential on the trusted side.
 *
 * There is exactly one place in this repository that turns a `secretRef` into a
 * credential value, and this is it. That matters more than the mechanism: two
 * resolvers drift, and the one nobody remembered is the one that ends up
 * reading an environment variable inside a sandbox.
 *
 * The preferred source is a systemd encrypted credential. The operator stores
 * the key with `systemd-creds encrypt`, the unit declares
 * `LoadCredentialEncrypted=`, and systemd decrypts it into a private tmpfs at
 * `$CREDENTIALS_DIRECTORY` readable only by the unit's own user. Nothing is
 * written to disk in plaintext, nothing appears in `systemctl show`, and — the
 * property this change exists for — nothing is in the environment, so nothing
 * is inherited by a child process that happens to be a task sandbox.
 *
 * `process.env[secretRef]` remains as a *development* fallback. It is kept
 * deliberately and narrowly: the gateway's own tests drive both branches
 * through injected `env`, and a developer running the canary against a personal
 * key on a laptop has no systemd unit to load from. It is reported as a
 * distinct source so an operator can see which one answered, and the hosted
 * path is expected to have no such variable set at all.
 *
 * Two rules hold in both branches:
 *
 * **The value is returned to exactly one caller and stored by none.** There is
 * no cache, no accessor and no diagnostic that can reach it. `describe()` and
 * `providerCredentialConfigured()` answer presence and never content.
 *
 * **A reference is a name, not a path.** `secretRef` is matched against the
 * shape of an environment-variable name before it is ever joined to a
 * directory, so `../../` and an absolute path are refused by the grammar rather
 * than by a containment check that someone could later reorder.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * The only shape a credential reference may take.
 *
 * Deliberately the POSIX environment-variable grammar: it is what
 * `LoadCredentialEncrypted=` uses for a credential id, what the config already
 * declares, and it contains no separator, no dot and no NUL — so a reference
 * cannot describe a path at all, whatever it is later joined to.
 */
const SECRET_REF = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

/** Why a credential did not resolve. Closed, so a refusal always has a name. */
export const CREDENTIAL_REFUSALS = Object.freeze([
  'reference-malformed',
  'not-configured',
  'not-a-regular-file',
  'unreadable',
  'empty',
]);

export const CREDENTIAL_SOURCES = Object.freeze(['systemd-credential', 'environment']);

export class ProviderCredentialError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'ProviderCredentialError';
    this.reason = reason;
  }
}

/**
 * Check the reference before it is used as a filename.
 *
 * Returns the reference so a caller cannot accidentally validate one value and
 * then use another.
 */
export function assertCredentialReference(secretRef) {
  const reference = String(secretRef ?? '').trim();
  if (!SECRET_REF.test(reference)) {
    throw new ProviderCredentialError(
      'reference-malformed',
      `"${reference}" is not a credential reference. A reference is a name such as ANTHROPIC_API_KEY, never a path.`,
    );
  }
  return reference;
}

/**
 * Locate the credential file without reading it.
 *
 * Separated from reading so the presence check and the resolution cannot
 * disagree about which file they mean. The containment assertion is redundant
 * given the grammar above and is kept anyway: it is cheap, and it is the check
 * that still holds if someone ever widens `SECRET_REF`.
 */
function credentialFile(reference, credentialsDirectory) {
  if (!credentialsDirectory) return null;
  const directory = path.resolve(credentialsDirectory);
  const file = path.resolve(directory, reference);
  if (path.dirname(file) !== directory) {
    throw new ProviderCredentialError('reference-malformed', `Credential reference "${reference}" resolves outside ${directory}.`);
  }
  return file;
}

/**
 * Read a credential file, refusing anything that is not a plain regular file.
 *
 * `lstat` rather than `stat`: a symlink is not followed, because the whole
 * value of the credentials directory is that systemd owns what is in it. A
 * symlink there would mean something else chose the target, which is exactly
 * the substitution this refuses. Directories, FIFOs and devices are refused for
 * the same reason — a FIFO would additionally block the gateway forever.
 */
function readCredentialFile(file) {
  let stats;
  try {
    stats = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!stats.isFile()) {
    throw new ProviderCredentialError(
      'not-a-regular-file',
      `${file} is not a regular file. A credential must be the file systemd placed there, not a link or a device.`,
    );
  }
  try {
    // A single trailing newline is stripped because that is what a shell
    // redirect adds and what `systemd-creds` round-trips; nothing else is
    // touched, since trimming a credential is how a valid key becomes invalid.
    return fs.readFileSync(file, 'utf8').replace(/\n$/, '');
  } catch (error) {
    throw new ProviderCredentialError('unreadable', `${file} could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Where a credential would come from, and whether it is there — without reading
 * the value in the environment case and without returning it in either.
 *
 * This is what every diagnostic, status surface and preflight uses. It answers
 * three things — provider, reference, configured — and has nowhere to put a
 * fourth that could be the secret.
 */
export function describeProviderCredentialSource({ secretRef, env = process.env, credentialsDirectory = undefined } = {}) {
  let reference;
  try {
    reference = assertCredentialReference(secretRef);
  } catch (error) {
    return Object.freeze({ configured: false, source: null, reason: error.reason, detail: error.message });
  }

  const directory = credentialsDirectory === undefined ? env.CREDENTIALS_DIRECTORY ?? null : credentialsDirectory;

  if (directory) {
    try {
      const file = credentialFile(reference, directory);
      const value = readCredentialFile(file);
      if (value !== null) {
        return value.trim().length > 0
          ? Object.freeze({ configured: true, source: 'systemd-credential', reason: null, detail: `loaded from the unit's credentials directory as ${reference}` })
          : Object.freeze({ configured: false, source: null, reason: 'empty', detail: `${file} is empty.` });
      }
    } catch (error) {
      return Object.freeze({ configured: false, source: null, reason: error.reason ?? 'unreadable', detail: error.message });
    }
  }

  const fromEnvironment = env?.[reference];
  if (typeof fromEnvironment === 'string' && fromEnvironment.trim().length > 0) {
    return Object.freeze({
      configured: true,
      source: 'environment',
      reason: null,
      detail: `resolved from the process environment as ${reference} (development fallback; the hosted path uses a systemd credential)`,
    });
  }

  return Object.freeze({
    configured: false,
    source: null,
    reason: 'not-configured',
    detail: directory
      ? `No credential named ${reference} in the unit's credentials directory, and no ${reference} in the environment.`
      : `No ${reference} in the environment and no CREDENTIALS_DIRECTORY to load one from.`,
  });
}

/** Presence as a plain boolean, for callers that want only the one bit. */
export function providerCredentialConfigured(options) {
  return describeProviderCredentialSource(options).configured;
}

/**
 * The credential value, for the one trusted caller that makes the request.
 *
 * Returns `''` rather than throwing when nothing is configured: the model lane
 * already has a named refusal for that — `provider-secret-missing` — and it is
 * a better error than a stack trace from here. A *malformed* reference or a
 * substituted file still throws, because those are faults rather than states.
 */
export function resolveProviderCredential({ secretRef, env = process.env, credentialsDirectory = undefined } = {}) {
  const reference = assertCredentialReference(secretRef);
  const directory = credentialsDirectory === undefined ? env.CREDENTIALS_DIRECTORY ?? null : credentialsDirectory;

  if (directory) {
    const value = readCredentialFile(credentialFile(reference, directory));
    if (value !== null && value.trim().length > 0) return value;
  }

  const fromEnvironment = env?.[reference];
  return typeof fromEnvironment === 'string' && fromEnvironment.trim().length > 0 ? fromEnvironment : '';
}
