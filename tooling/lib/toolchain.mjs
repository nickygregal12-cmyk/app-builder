/**
 * The declared build toolchain, and what it means to be standing somewhere else.
 *
 * `buildable` asserts that an exact source tree, with an exact lockfile, under
 * an exact toolchain, produces an exact output. The repository declared the
 * first two and left the third to whatever the host happened to have: root
 * `engines` said `node >=22.13`, and every workflow said `node-version: 22`,
 * which is a moving target that resolves to a different patch — and a different
 * bundled npm — on different days. npm's resolution behaviour is the half that
 * actually decides the dependency graph, and it was the half nobody named.
 *
 * The comparison here is deliberately not lenient. There is no "close enough"
 * patch range, because two builds inside a range are two different builds and
 * only one of them produced the output somebody reviewed.
 *
 * What it is not is a gate on ordinary work. A host without the declared pair
 * can still intake, generate, verify, preview, edit and export; the one thing
 * it cannot do is state a reproducible build identity. `describeToolchain`
 * returns that position as a fact, and only `assertBuildableToolchain` — called
 * where the claim is actually made — refuses.
 */

import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const REGISTRY_URL = new URL('../../config/toolchain.json', import.meta.url);

export function readToolchainRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_URL, 'utf8'));
}

/** The pair a reproducible build is claimed against. */
export function declaredToolchain() {
  const { declared } = readToolchainRegistry();
  const node = String(declared?.node ?? '').trim();
  const npm = String(declared?.npm ?? '').trim();
  if (!node || !npm) throw new Error('config/toolchain.json must declare an exact node and npm pair.');
  return Object.freeze({ node, npm });
}

function normalizeVersion(value) {
  return String(value ?? '').trim().replace(/^v/, '');
}

/**
 * The npm actually in use, asked of npm rather than inferred from the Node
 * release notes. A host can replace the bundled npm without replacing Node, and
 * a build that recorded the version Node shipped with would be recording
 * something that did not run.
 */
export function runningToolchain({ npmVersion } = {}) {
  const npm = npmVersion === undefined
    ? spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { encoding: 'utf8', stdio: 'pipe' })
    : { status: 0, stdout: npmVersion };
  return Object.freeze({
    node: normalizeVersion(process.versions.node),
    npm: npm.status === 0 ? normalizeVersion(npm.stdout) : null,
  });
}

export function toolchainMatches(actual, declared = declaredToolchain()) {
  return normalizeVersion(actual?.node) === declared.node && normalizeVersion(actual?.npm) === declared.npm;
}

/**
 * Where a toolchain stands against the declaration, in terms a report can print
 * and a caller can branch on without re-deriving the comparison.
 */
export function describeToolchain(actual = runningToolchain(), declared = declaredToolchain()) {
  const node = normalizeVersion(actual?.node);
  const npm = actual?.npm === null || actual?.npm === undefined ? null : normalizeVersion(actual.npm);
  const mismatched = [
    ...(node === declared.node ? [] : [`node ${node || 'unknown'} (declared ${declared.node})`]),
    ...(npm === declared.npm ? [] : [`npm ${npm ?? 'unknown'} (declared ${declared.npm})`]),
  ];
  return {
    declared,
    actual: { node, npm },
    supported: mismatched.length === 0,
    mismatched,
    summary: mismatched.length === 0
      ? `Running the declared toolchain: node ${declared.node}, npm ${declared.npm}.`
      : `This host runs ${mismatched.join(' and ')}. It can generate, verify, preview and export; it cannot record a reproducible build identity, so nothing built here can claim buildable.`,
  };
}

/**
 * The refusal, at the one point the claim is made. Everything else records and
 * reports; this is what stops an artifact asserting reproducibility it does not
 * have.
 */
export function assertBuildableToolchain(actual = runningToolchain(), declared = declaredToolchain()) {
  const position = describeToolchain(actual, declared);
  if (!position.supported) {
    throw new Error(`A reproducible build identity requires the declared toolchain. ${position.summary}`);
  }
  return position;
}
