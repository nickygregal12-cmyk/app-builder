#!/usr/bin/env node
/**
 * Model-execution doctor.
 *
 * Holds the model lane's invariants in `npm run check`. It asserts structure
 * only — the behaviour is `tooling/model-canary.test.mjs` and the real thing is
 * `npm run runtime:model-canary` — and it deliberately makes no provider call,
 * so `npm run doctor` stays fast and works on a machine with no credential.
 *
 * The invariants it exists for are the two easiest to lose by accident:
 * **one repository switch being mistaken for effective permission**, and **a
 * credential appearing in the repository**.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { capabilitiesForRole } from '@app-builder/control-plane/capabilities';
import {
  MODEL_LANE_DENY_REASONS,
  MODEL_STOP_REASONS,
  evaluateModelLane,
} from '@app-builder/control-plane/model-execution';
import { createExecutionEnvironmentSpec } from '@app-builder/control-plane/execution-environment';
import { createProviderProfile } from '@app-builder/control-plane/provider-routing';

import { readModelKillSwitch } from './lib/model-kill-switch.mjs';

const root = process.cwd();
let failed = false;
const fail = (message) => { console.error(message); failed = true; };
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

for (const relative of [
  'packages/control-plane/src/model-execution.js',
  'tooling/lib/model-kill-switch.mjs',
  'tooling/lib/model-gateway.mjs',
  'tooling/lib/model-provider-anthropic.mjs',
  'tooling/lib/model-canary-worker.mjs',
  'tooling/model-canary.mjs',
  'tooling/model-canary.test.mjs',
  'config/model-execution.json',
  'docs/MODEL_CANARY.md',
]) {
  if (!fs.existsSync(path.join(root, relative))) fail(`Missing model-lane file: ${relative}`);
}

// --- One reviewed switch is not effective permission ------------------------
try {
  const config = readJson('config/model-execution.json');
  if (config.enabled !== true) {
    fail('config/model-execution.json must record the reviewed opt-in for the first deliberate canary.');
  }
  if (!config.hostSwitchPath) fail('config/model-execution.json must declare a hostSwitchPath: one key is a setting, two are a kill switch.');
  const state = readModelKillSwitch({ root, env: {} });
  if (state.enabled) fail('The model kill switch reads as enabled without the independent host switch. One reviewed repository switch must authorise nothing by itself.');

  // The switch and the readiness gate are different decisions and must stay
  // different files. Reusing `runtimeReady` for this would make "the role is
  // proven" and "the factory may spend money" one flag with two meanings.
  const roles = readJson('config/agent-roles.json');
  if (JSON.stringify(roles).includes('modelExecutionEnabled')) {
    fail('Model execution must not be a flag inside config/agent-roles.json; it is a separate operator decision.');
  }
  const gate = readJson('config/runtime-readiness.json');
  if (Object.keys(gate.evidence ?? {}).length > 0) {
    console.log(`Model doctor: runtime-readiness evidence is recorded for ${Object.keys(gate.evidence).join(', ')}.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- No credential is committed ---------------------------------------------
//
// Checked over the files this lane owns rather than the whole tree, and by
// shape rather than by variable name: the failure this catches is somebody
// pasting a working key into a config or a fixture "just to test it".
try {
  const config = readJson('config/model-execution.json');
  const secretRef = config.providerSecret?.secretRef ?? '';
  if (!secretRef) fail('config/model-execution.json must name where the provider credential lives, as a reference.');
  for (const relative of [
    'config/model-execution.json',
    'tooling/lib/model-gateway.mjs',
    'tooling/lib/model-provider-anthropic.mjs',
    'tooling/lib/model-kill-switch.mjs',
    'tooling/lib/model-canary-worker.mjs',
    'tooling/model-canary.mjs',
  ]) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const match of source.matchAll(/\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})\b/g)) {
      if (match[0].includes('test-not-a-real-credential')) continue;
      fail(`${relative} contains something shaped like a live credential: ${match[0].slice(0, 8)}…`);
    }
  }
  // The value must never be a field the config could hold.
  if (config.providerSecret?.value !== undefined || config.provider?.apiKey !== undefined) {
    fail('config/model-execution.json carries a credential field. The durable contract holds a reference and a boolean, never a value.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- The sandbox never gains a provider identity -----------------------------
try {
  const base = {
    attemptId: 'doctor', taskId: 'doctor', projectId: 'doctor', roleId: 'code-reviewer', policyId: 'review',
    networkProfile: 'none',
    workspacePath: '/srv/app-builder-attempts/doctor/workspace',
    scratchPath: '/srv/app-builder-attempts/doctor/scratch',
    brokerSocketPath: '/run/app-builder/broker.sock',
    grantPath: '/srv/app-builder-attempts/doctor/grant',
  };
  const without = createExecutionEnvironmentSpec(base);
  if (without.modelAccess !== null) fail('An attempt spec that was not given a model lane must not have one.');
  if (without.environment.allowed.includes('APP_BUILDER_MODEL_SOCKET')) {
    fail('An attempt with no model lane must not be told about a model socket.');
  }

  const withLane = createExecutionEnvironmentSpec({ ...base, modelSocketPath: '/run/app-builder/model.sock' });
  if (withLane.network.profile !== 'none') fail('The canary lane must run at network profile none.');
  const leaked = withLane.environment.allowed.filter((name) => /ANTHROPIC|OPENAI|PROVIDER|ENDPOINT|API|KEY|SECRET|TOKEN/i.test(name));
  if (leaked.length > 0) fail(`The model lane leaks provider identity into the sandbox environment: ${leaked.join(', ')}`);
  const added = withLane.mounts.filter((mount) => !without.mounts.some((entry) => entry.target === mount.target));
  if (added.length !== 1 || added[0].target !== '/run/app-builder/model.sock') {
    fail(`The model lane must add exactly one mount, the gateway socket; it added ${added.map((mount) => mount.target).join(', ') || 'none'}.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- The lane is deny-by-default and every refusal is named -------------------
try {
  const verdict = evaluateModelLane({ killSwitch: null, decision: null, request: { roleId: 'x', taskId: 'x', projectId: 'x', adapterId: 'x', model: null, maxOutputTokens: 1 } });
  if (verdict.allowed) fail('The model lane permits a call with no kill switch and no decision. It must be deny-by-default.');
  if (!MODEL_LANE_DENY_REASONS.includes(verdict.reason)) fail(`The model lane refused with an unnamed reason: ${verdict.reason}`);
  for (const reason of ['kill-switch-disabled', 'decision-already-spent', 'call-budget-exhausted', 'cost-budget-exhausted', 'provider-secret-missing', 'usage-unreconcilable']) {
    if (!MODEL_LANE_DENY_REASONS.includes(reason)) fail(`The model lane cannot express a ${reason} refusal.`);
  }
  for (const stop of ['stop', 'length', 'refused', 'timed-out']) {
    if (!MODEL_STOP_REASONS.includes(stop)) fail(`A model call cannot record that it stopped with ${stop}.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- The canary role is still the safe one -----------------------------------
try {
  const config = readJson('config/model-execution.json');
  const roles = readJson('config/agent-roles.json').roles;
  const policies = readJson('config/agent-policies.json').policies;
  const registry = readJson('config/agent-capabilities.json');
  const role = roles[config.canary?.roleId];
  if (!role) {
    fail(`config/model-execution.json names canary role ${config.canary?.roleId}, which the registry does not declare.`);
  } else {
    const policy = policies[role.policyId];
    if ((role.mutationScopes ?? []).length > 0) fail(`The canary role ${role.id} owns mutation scopes. The first model attempt must not be able to change anything.`);
    if ((policy?.allow ?? []).includes('network.public')) fail(`The canary role ${role.id} allows public network. The first canary must not also be the first egress test.`);
    if ((policy?.allow ?? []).includes('secret.read_scoped')) fail(`The canary role ${role.id} allows scoped secret reads.`);
    const projection = capabilitiesForRole({ role, policy, registry });
    const mutating = projection.granted.filter((id) => registry.capabilities.find((entry) => entry.id === id)?.mutating);
    if (mutating.length > 0) fail(`The canary role ${role.id} is granted mutating operations: ${mutating.join(', ')}`);
    if (projection.granted.length === 0) fail(`The canary role ${role.id} is granted no operation, so it has no bounded context to review.`);
    if (role.runtimeReady === true) {
      fail(`The canary role ${role.id} already claims runtimeReady. The canary exists to produce that evidence, not to follow it.`);
    }
  }

  // A tiny budget is the point, not an accident of configuration.
  const budget = config.canaryBudget ?? {};
  if (Number(budget.maxCalls) !== 1) fail('The canary budget must authorise exactly one model call.');
  if (Number(budget.maxCostGbp) > 0.25) fail(`The canary budget of £${budget.maxCostGbp} is too large to be a canary.`);
  if (!config.pricingGbpPerMillionTokens?.output) fail('Cost must be reconcilable: config/model-execution.json must declare a price per million tokens.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- No schedule, no loop, no second attempt ---------------------------------
try {
  const scripts = readJson('package.json').scripts ?? {};
  if (!scripts['runtime:model-canary']) fail('The model canary must be runnable as npm run runtime:model-canary.');
  for (const [name, command] of Object.entries(scripts)) {
    if (/cron|schedule|watch|daemon|loop/i.test(name) && /model-canary/.test(String(command))) {
      fail(`Script ${name} would run the model canary on a schedule. It runs once, by hand.`);
    }
  }
  const workflows = path.join(root, '.github/workflows');
  if (fs.existsSync(workflows)) {
    for (const entry of fs.readdirSync(workflows)) {
      const source = fs.readFileSync(path.join(workflows, entry), 'utf8');
      if (source.includes('runtime:model-canary') || source.includes('model-canary.mjs')) {
        fail(`.github/workflows/${entry} runs the model canary. A real provider call is an operator decision, never CI.`);
      }
    }
  }
  const canary = fs.readFileSync(path.join(root, 'tooling/model-canary.mjs'), 'utf8');
  if (/setInterval\([^)]*runModelCanary|while\s*\(true\)/.test(canary)) {
    fail('The model canary must not loop. One attempt, then stop.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

// --- The provider profiles grant nothing ---------------------------------------
//
// Same two invariants as the lane itself, one level up. The way a provider
// router fails in practice is not a bug in the selection code — it is a profile
// that quietly acquired a role or a data class in a config edit nobody read as
// a policy change. So the committed state is asserted here, where it runs in
// `npm run check` on every branch.
try {
  const config = readJson('config/provider-profiles.json');
  if (!Array.isArray(config.profiles) || config.profiles.length === 0) {
    fail('config/provider-profiles.json must declare the providers the router may consider.');
  }
  for (const raw of config.profiles ?? []) {
    const profile = createProviderProfile(raw);
    if (profile.eligibleRoles.length > 0) {
      fail(`Provider ${profile.providerId} ships with an earned role. A role is earned by a recorded canary, not by editing config.`);
    }
    if (profile.ready) fail(`Provider ${profile.providerId} ships ready. Readiness is evidence, not a default.`);
    if (profile.highRiskRolesApproved.length > 0) {
      fail(`Provider ${profile.providerId} ships approved for ${profile.highRiskRolesApproved.join(', ')}. Security, release and architecture sign-off are earned separately or not at all.`);
    }
    for (const dataClass of profile.allowedDataClasses) {
      if (!['public', 'synthetic', 'sanitised'].includes(dataClass)) {
        fail(`Provider ${profile.providerId} is approved for ${dataClass}, which needs a recorded policy review in policyReviewedAt/policySource.`);
      }
    }
    if (profile.secretRef && /^(sk-|sk_|gsk_|ghp_|xox)/i.test(profile.secretRef)) {
      fail(`Provider ${profile.providerId} carries something credential-shaped in secretRef.`);
    }
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (failed) process.exit(1);
const state = readModelKillSwitch({ root, env: {} });
const profileCount = readJson('config/provider-profiles.json').profiles.length;
console.log(`Model doctor: the repository has reviewed the first canary, but effective model execution remains disabled (${state.blockers.length} switch(es) off); the canary role is a read-only, network-none reviewer; no credential is committed; no schedule runs it; ${profileCount} provider profile(s) grant no role and no private data class.`);
