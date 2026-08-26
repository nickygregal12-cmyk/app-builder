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

import { createLocalExecutionDriver } from './lib/execution-driver-local.mjs';
import { createPodmanExecutionDriver } from './lib/execution-driver-podman.mjs';

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

  // The whole point of the gate.
  const offenders = unearnedRuntimeReadyRoles({ roles, gate });
  for (const offender of offenders) {
    fail(`Role ${offender.roleId} claims runtimeReady without evidence for: ${offender.missing.map((entry) => entry.id).join(', ')}`);
  }

  const promoted = Object.values(roles).filter((role) => role.runtimeReady === true);
  if (promoted.length > 0 && offenders.length === 0) {
    console.log(`Runtime doctor: ${promoted.length} role(s) promoted with full evidence.`);
  }

  // A gate that could promote a role with no evidence at all would be
  // decoration. Prove it refuses.
  const sample = Object.values(roles)[0];
  const decision = evaluateRuntimeReadiness({ role: sample, gate, evidence: {} });
  if (decision.ready) fail('The runtime readiness gate promotes a role with no evidence. It must be deny-by-default.');
  if (decision.missing.length !== requirements.size) fail('The runtime readiness gate does not report every unmet requirement.');

  const registered = new Set(requirements.keys());
  for (const required of ['pinned-image', 'lifecycle-support', 'environment-profile', 'deterministic-coverage', 'convergence-behaviour', 'model-attempt-evidence']) {
    if (!registered.has(required)) fail(`The runtime readiness gate is missing the ${required} requirement.`);
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
console.log('Runtime doctor: attempt lifecycle, neutral driver contract and the runtime-ready promotion gate are intact; no role is promoted.');
