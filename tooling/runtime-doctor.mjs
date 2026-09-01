#!/usr/bin/env node
/**
 * Runtime execution doctor.
 *
 * Holds the Phase 4.5 runtime contract in `npm run check`. It asserts
 * structure and invariants only — the behavioural proof is
 * `tooling/runtime-lifecycle.test.mjs` and `npm run runtime:canary`, and this
 * doctor deliberately does not run an attempt, so `npm run doctor` stays fast
 * and usable on a host with no sandbox runtime installed.
 *
 * The invariant it exists for is the one easiest to lose by accident: landing
 * the execution lifecycle must not promote a single specialist role.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { EXECUTION_DRIVER_METHODS, assertExecutionDriver } from '@app-builder/control-plane/execution-adapter';
import { ATTEMPT_EXIT_REASONS, ATTEMPT_STATES } from '@app-builder/control-plane/attempts';
import { evaluateRuntimeReadiness, indexRuntimeReadinessGate, unearnedRuntimeReadyRoles } from '@app-builder/control-plane/runtime-readiness';
import { resolveTaskImage } from '@app-builder/control-plane/attempts';

import { createLocalExecutionDriver } from './lib/execution-driver-local.mjs';
import { createPodmanExecutionDriver } from './lib/execution-driver-podman.mjs';
import { createRuntimeReadinessEvidenceResolver } from './lib/runtime-readiness-evidence.mjs';

const root = process.cwd();
let failed = false;
const fail = (message) => { console.error(message); failed = true; };
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

for (const relative of [
  'packages/control-plane/src/attempts.js',
  'packages/control-plane/src/execution-adapter.js',
  'packages/control-plane/src/execution-environment.js',
  'packages/control-plane/src/runtime-readiness.js',
  'tooling/lib/execution-driver-local.mjs',
  'tooling/lib/execution-driver-podman.mjs',
  'tooling/lib/sandbox-podman.mjs',
  'tooling/lib/canary-worker.mjs',
  'tooling/runtime-canary.mjs',
  'tooling/runtime-lifecycle.test.mjs',
  'config/runtime-readiness.json',
  'config/task-images.json',
  'packages/control-plane/src/egress-policy.js',
  'ops/images/app-builder-task/Containerfile',
  'tooling/task-image-egress.test.mjs',
]) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Missing runtime file: ${relative}`);
}

// Every registered driver implements the whole neutral contract. A driver that
// implements most of it cannot bound an attempt, which is the failure this
// abstraction exists to prevent.
for (const driver of [createLocalExecutionDriver({ isolation: null }), createPodmanExecutionDriver()]) {
  try {
    assertExecutionDriver(driver);
  } catch (error) {
    fail(`Execution driver ${driver?.id ?? 'unnamed'} does not satisfy the adapter contract: ${error.message}`);
  }
}

// The control plane must not acquire a runtime.
//
// Naming a runtime is fine and sometimes necessary — `FORBIDDEN_MOUNT_SOURCES`
// names the Docker and Podman control sockets precisely because it refuses
// them. Being *able to invoke* one is the thing that would make the lifecycle
// provider-specific, so the check is on capability, not vocabulary: a
// control-plane module that can spawn a process or reach the filesystem has
// stopped being a neutral contract and started being a runtime.
const RUNTIME_CAPABILITIES = ['node:child_process', 'node:fs', 'node:net', 'node:http', 'node:https'];
for (const entry of fs.readdirSync(path.join(root, 'packages/control-plane/src'))) {
  const source = fs.readFileSync(path.join(root, 'packages/control-plane/src', entry), 'utf8');
  for (const match of source.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    const specifier = match[1];
    if (specifier.includes('/tooling/') || specifier.startsWith('../../')) {
      fail(`Control-plane module ${entry} imports ${specifier}. A runtime translation must not be a dependency of the lifecycle.`);
    }
    if (entry !== 'index.js' && RUNTIME_CAPABILITIES.includes(specifier)) {
      fail(`Control-plane module ${entry} imports ${specifier}. The lifecycle decides; the driver acts.`);
    }
  }
}

if (ATTEMPT_STATES.includes('disposed') === false) fail('The attempt lifecycle must model disposal separately from exit, or an orphan reads as a finished attempt.');
for (const reason of ['timed-out', 'cancelled', 'lost']) {
  if (!ATTEMPT_EXIT_REASONS.includes(reason)) fail(`The attempt lifecycle must be able to record a ${reason} outcome.`);
}
if (EXECUTION_DRIVER_METHODS.length < 7) fail('The execution driver contract must cover create, start, inspect, collect, signal, remove and list.');

try {
  const gate = readJson('config/runtime-readiness.json');
  const requirements = indexRuntimeReadinessGate(gate);
  const roles = readJson('config/agent-roles.json').roles;

  const resolve = createRuntimeReadinessEvidenceResolver({ repositoryRoot: root });

  // The whole point of the gate.
  const offenders = unearnedRuntimeReadyRoles({ roles, gate, resolve });
  for (const offender of offenders) {
    fail(`Role ${offender.roleId} claims runtimeReady without evidence for: ${offender.missing.map((entry) => `${entry.id} (${entry.reason})`).join(', ')}`);
  }

  const promoted = Object.values(roles).filter((role) => role.runtimeReady === true);
  if (promoted.length > 0 && offenders.length === 0) {
    console.log(`Runtime doctor: ${promoted.length} role(s) promoted with full evidence.`);
  }

  // Evidence that is recorded is evidence that must still resolve. A reference
  // to a renamed test or an expired host proof is how this gate would rot into
  // decoration without anyone editing it, so every recorded entry is checked
  // even for roles nobody has promoted.
  for (const roleId of Object.keys(gate.evidence ?? {})) {
    if (!roles[roleId]) {
      fail(`config/runtime-readiness.json records evidence for unknown role ${roleId}.`);
      continue;
    }
    const audit = evaluateRuntimeReadiness({ role: roles[roleId], gate, resolve });
    for (const entry of audit.missing) {
      // `absent` is the honest state of a requirement nobody has met yet.
      // A reference that was written and no longer resolves is a fault.
      if (entry.reason === 'absent') continue;
      fail(`Role ${roleId} cites ${entry.id} as "${entry.reference}" but it does not resolve: ${entry.detail}`);
    }
    const unmet = audit.missing.filter((entry) => entry.reason === 'absent').map((entry) => entry.id);
    console.log(
      unmet.length === 0
        ? `Runtime doctor: ${roleId} has resolvable evidence for every requirement.`
        : `Runtime doctor: ${roleId} has ${audit.satisfied.length}/${requirements.size} requirement(s) evidenced; still unmet: ${unmet.join(', ')}.`,
    );
  }

  // A gate that could promote a role with no evidence at all would be
  // decoration. Prove it refuses.
  const sample = Object.values(roles)[0];
  const decision = evaluateRuntimeReadiness({ role: sample, gate, evidence: {}, resolve });
  if (decision.ready) fail('The runtime readiness gate promotes a role with no evidence. It must be deny-by-default.');
  if (decision.missing.length !== requirements.size) fail('The runtime readiness gate does not report every unmet requirement.');

  // The refusal that matters most, asserted rather than trusted: prose is not
  // evidence, however confident it sounds.
  const prose = Object.fromEntries([...requirements.keys()].map((id) => [id, 'verified during review']));
  if (evaluateRuntimeReadiness({ role: sample, gate, evidence: prose, resolve }).ready) {
    fail('The runtime readiness gate accepts unresolvable prose as evidence.');
  }

  const registered = new Set(requirements.keys());
  for (const required of ['pinned-image', 'lifecycle-support', 'environment-profile', 'deterministic-coverage', 'convergence-behaviour', 'model-attempt-evidence']) {
    if (!registered.has(required)) fail(`The runtime readiness gate is missing the ${required} requirement.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- The pinned task image ---------------------------------------------------
try {
  const images = readJson('config/task-images.json');
  const declared = Object.entries(images.images ?? {});
  if (declared.length === 0) fail('config/task-images.json declares no task image, so no attempt can name one.');
  for (const [id, image] of declared) {
    if (String(image.reference ?? '').includes(':')) fail(`Task image ${id} carries a tag in its reference. The digest is the identity.`);
    if (image.digest !== null && !/^sha256:[0-9a-f]{64}$/.test(String(image.digest))) {
      fail(`Task image ${id} has a digest that is not a sha256 content digest: ${image.digest}`);
    }
    const containerfile = path.join(root, String(image.containerfile ?? ''));
    if (!image.containerfile || !fs.existsSync(containerfile)) {
      fail(`Task image ${id} names a Containerfile that does not exist: ${image.containerfile}`);
      continue;
    }
    const source = fs.readFileSync(containerfile, 'utf8');
    for (const line of source.split('\n').filter((entry) => entry.startsWith('FROM'))) {
      if (!line.includes('@sha256:')) fail(`${image.containerfile} has a FROM without a digest: a floating base makes the built digest meaningless.`);
    }
    if (image.base?.digest && !source.includes(image.base.digest)) {
      fail(`${image.containerfile} does not pin the base digest config/task-images.json records for ${id}.`);
    }
    if (!source.includes('USER 1000:1000')) fail(`${image.containerfile} must run as the unprivileged uid the execution spec assigns.`);

    // Resolve it the way an attempt would. An image whose digest has not been
    // recorded is a known-pending state, not a doctor failure — but it must
    // fail closed with the build command rather than resolve to something
    // plausible, and that is what this checks.
    try {
      const resolved = resolveTaskImage(images, id);
      console.log(`Runtime doctor: task image ${id} is pinned at ${resolved.pinned}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (image.digest === null && /no recorded digest/.test(message)) {
        console.log(`Runtime doctor: task image ${id} is not built on this host yet; attempts naming it fail closed with \`${image.buildCommand}\`.`);
      } else {
        fail(`Task image ${id} does not resolve: ${message}`);
      }
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- The egress profile ------------------------------------------------------
try {
  for (const script of ['ops/hetzner/build-task-image.sh', 'ops/hetzner/install-egress-network.sh', 'ops/hetzner/verify-egress-profile.sh']) {
    if (!fs.existsSync(path.join(root, script))) fail(`Missing ops script: ${script}`);
  }
  const verifier = fs.readFileSync(path.join(root, 'ops/hetzner/verify-egress-profile.sh'), 'utf8');
  const driver = fs.readFileSync(path.join(root, 'tooling/lib/execution-driver-podman.mjs'), 'utf8');
  // The hosted proof and the code that requires it must name the same file, or
  // the profile can be "verified" into a place nothing reads.
  if (!verifier.includes('/etc/app-builder/egress-profile.json') || !driver.includes('/etc/app-builder/egress-profile.json')) {
    fail('The egress verifier and the execution driver must name the same attestation path.');
  }
  // The verifier must derive its forbidden destinations from the policy rather
  // than restate them, or the hosted proof drifts from what CI checks.
  if (!verifier.includes('forbiddenEgressProbeTargets')) {
    fail('The egress verifier must generate its probe list from packages/control-plane/src/egress-policy.js, not from a hand-written list.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

try {
  const scripts = readJson('package.json').scripts ?? {};
  if (!String(scripts.doctor ?? '').includes('runtime-doctor.mjs')) fail('Root doctor must include the runtime execution check.');
  if (!scripts['runtime:canary']) fail('The deterministic runtime canary must be runnable as npm run runtime:canary.');
  if (!String(scripts.test ?? '').includes('tooling')) fail('Runtime lifecycle tests must run in npm test.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (failed) process.exit(1);
console.log('Runtime doctor: attempt lifecycle, neutral driver contract, pinned task image, fail-closed egress profile and the runtime-ready promotion gate are intact; no role is promoted.');
