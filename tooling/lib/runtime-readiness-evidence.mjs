/**
 * Resolving runtime-readiness evidence against the disk.
 *
 * `packages/control-plane/src/runtime-readiness.js` owns the rule that a role
 * is promoted only on evidence that resolves. It deliberately owns no
 * filesystem, so this module is the other half: it turns a parsed reference
 * into "yes, that exists and says what it claims" or into a refusal naming why
 * not.
 *
 * The resolvers are deliberately literal. `test:` checks that the named test
 * really appears in the named file rather than that a file of roughly that name
 * exists, because a requirement pointing at a test that was renamed away is
 * exactly the stale evidence this gate is for. `attestation:` is stricter
 * still: a proof that failed, expired, or attests a different image is not
 * evidence, and neither is one that is simply absent on this host — which is
 * the correct answer in CI, where no hosted proof has been run.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

function ok(detail) {
  return { resolved: true, detail };
}

function no(detail) {
  return { resolved: false, detail };
}

/** Walk a JSON pointer (RFC 6901, the subset this repository writes). */
function pointer(document, jsonPointer) {
  if (!jsonPointer || jsonPointer === '/') return document;
  let cursor = document;
  for (const rawSegment of jsonPointer.replace(/^\//, '').split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = Array.isArray(cursor) ? cursor[Number(segment)] : cursor[segment];
  }
  return cursor;
}

/**
 * Build a resolver bound to one repository root.
 *
 * `now` and `readHostFile` are injected so the freshness rule and the host
 * lookup are both testable without a clock or a real `/etc`.
 */
export function createRuntimeReadinessEvidenceResolver({
  repositoryRoot,
  now = new Date(),
  readHostFile = (absolute) => (existsSync(absolute) ? readFileSync(absolute, 'utf8') : null),
} = {}) {
  // Normalised, because a root built from `new URL('..')` carries a trailing
  // separator and the containment check below compares strings.
  const root = path.resolve(repositoryRoot ?? process.cwd());

  const insideRepository = (target) => {
    const absolute = path.resolve(root, target);
    if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
    return absolute;
  };

  const readRepositoryFile = (target) => {
    const absolute = insideRepository(target);
    if (!absolute) return { error: `${target} resolves outside the repository.` };
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return { error: `${target} does not exist.` };
    return { absolute, contents: readFileSync(absolute, 'utf8') };
  };

  return function resolveEvidence(reference) {
    const { scheme, target, fragment } = reference;

    if (scheme === 'schema' || scheme === 'record') {
      const file = readRepositoryFile(target);
      if (file.error) return no(file.error);
      return ok(`${target} exists`);
    }

    if (scheme === 'config') {
      const file = readRepositoryFile(target);
      if (file.error) return no(file.error);
      let document;
      try {
        document = JSON.parse(file.contents);
      } catch (error) {
        return no(`${target} is not readable JSON: ${error.message}`);
      }
      if (!fragment) return ok(`${target} exists`);
      const value = pointer(document, fragment);
      if (value === undefined || value === null || value === '') {
        return no(`${target} has nothing at ${fragment}.`);
      }
      return ok(`${target}${fragment} = ${typeof value === 'object' ? JSON.stringify(value).slice(0, 60) : String(value).slice(0, 60)}`);
    }

    if (scheme === 'test') {
      const file = readRepositoryFile(target);
      if (file.error) return no(file.error);
      if (!fragment) return no(`${target} is cited as evidence without naming which test proves the requirement.`);
      if (!file.contents.includes(fragment)) {
        return no(`${target} no longer contains a test named "${fragment}".`);
      }
      return ok(`${target} proves "${fragment}"`);
    }

    if (scheme === 'attestation') {
      // Host proofs live outside the repository by design: the repository must
      // not be able to write its own hosted evidence.
      const contents = readHostFile(target);
      if (contents === null) {
        // Absent is not the same as wrong, and the difference decides whether a
        // gate may go red. A checkout — in CI, or on a developer's machine —
        // legitimately has no hosted proof, and a repository that could fail
        // that check could also pass it, which is the property this whole file
        // exists to deny. So it is reported as unproven-here rather than as a
        // broken reference. A proof that *is* present and says the wrong thing
        // is still a hard failure below.
        return { resolved: false, hostState: 'absent', detail: `No attestation at ${target} on this host. A hosted proof cannot be assumed from a repository checkout.` };
      }
      let document;
      try {
        document = JSON.parse(contents);
      } catch (error) {
        return no(`${target} is not readable JSON: ${error.message}`);
      }
      if (document.result !== 'passed') {
        return no(`${target} records result "${document.result ?? 'none'}", not a pass.`);
      }
      const verifiedAt = Date.parse(document.verifiedAt ?? '');
      if (Number.isNaN(verifiedAt)) return no(`${target} does not record when it was verified.`);
      const maxAgeDays = Number(document.maxAgeDays);
      if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) return no(`${target} does not declare how long it stays valid.`);
      const ageDays = ((now instanceof Date ? now : new Date(now)).getTime() - verifiedAt) / 86_400_000;
      if (ageDays > maxAgeDays) {
        return no(`${target} expired: verified ${ageDays.toFixed(1)} days ago against a ${maxAgeDays}-day window.`);
      }

      // An attestation that proves a different image than the one the runtime
      // would actually run is worse than none, because it reads as a pass.
      if (fragment) {
        const expected = pointer(JSON.parse(readRepositoryFile('config/task-images.json').contents ?? '{}'), fragment);
        if (expected && document.imageDigest && expected !== document.imageDigest) {
          return no(`${target} attests ${document.imageDigest}, but the runtime would run ${expected}.`);
        }
      }
      return ok(`${target} passed ${ageDays.toFixed(1)} days ago for ${document.imageDigest ?? 'the declared image'}`);
    }

    return no(`No resolver for scheme "${scheme}".`);
  };
}
