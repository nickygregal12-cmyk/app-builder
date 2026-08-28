#!/usr/bin/env node
/**
 * Host-aware entry point for the first real model canary.
 *
 * `tooling/model-canary.mjs` deliberately cannot infer whether the pinned image
 * is present on a host, so its portable preflight reports that check as HOST /
 * unknown. On the actual runtime host we can settle that question without
 * weakening the boundary: ask rootless Podman for the local image digest and
 * require an exact match with config/task-images.json.
 *
 * If Podman is unavailable, the result stays unknown. If Podman is available
 * but the image is absent or has the wrong digest, the result is a hard fail.
 * No environment variable or caller-supplied digest can turn the check green.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  REPOSITORY_ROOT,
  preflight,
  runModelCanary,
} from './model-canary.mjs';

const PORTABLE_CANARY = path.join(REPOSITORY_ROOT, 'tooling/model-canary.mjs');
const DECISION_PATH = '/etc/app-builder/model-enable-decision.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function inspectLocalTaskImage({ reference, tag }) {
  const image = `${reference}:${tag}`;
  const inspected = spawnSync(
    'podman',
    ['image', 'inspect', image, '--format', '{{.Digest}}'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );

  if (inspected.error?.code === 'ENOENT') {
    return { status: 'unknown', detail: 'Podman is not available on this machine.' };
  }

  if (inspected.error) {
    return { status: 'fail', detail: `Podman image inspection failed: ${inspected.error.message}` };
  }

  if (inspected.status !== 0) {
    const detail = String(inspected.stderr || inspected.stdout || `exit ${inspected.status}`).trim();
    return { status: 'fail', detail: `Podman could not inspect ${image}: ${detail}` };
  }

  const digest = String(inspected.stdout ?? '').trim();
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    return { status: 'fail', detail: `Podman returned an invalid digest for ${image}: ${digest || 'empty output'}` };
  }

  return { status: 'pass', digest, detail: `${image} is present at ${digest}` };
}

export function settleHostImagePresence(
  result,
  {
    root = REPOSITORY_ROOT,
    inspector = inspectLocalTaskImage,
  } = {},
) {
  const index = result.checks.findIndex((check) => check.id === 'task-image-present-on-host');
  if (index < 0 || result.checks[index].status === 'pass') return result;

  const images = readJson(path.join(root, 'config/task-images.json'));
  const declared = images.images?.[result.imageId];
  if (!declared?.reference || !declared?.tag || !declared?.digest) return result;

  const observation = inspector({ reference: declared.reference, tag: declared.tag });
  let check;

  if (observation.status === 'pass') {
    const matches = observation.digest === declared.digest;
    check = {
      id: 'task-image-present-on-host',
      status: matches ? 'pass' : 'fail',
      detail: matches
        ? `${declared.reference}:${declared.tag} is present at the pinned digest ${observation.digest}`
        : `${declared.reference}:${declared.tag} is present at ${observation.digest}; config/task-images.json requires ${declared.digest}`,
      remedy: matches ? null : 'sudo bash ops/hetzner/build-task-image.sh',
    };
  } else if (observation.status === 'fail') {
    check = {
      id: 'task-image-present-on-host',
      status: 'fail',
      detail: observation.detail,
      remedy: 'sudo bash ops/hetzner/build-task-image.sh',
    };
  } else {
    // Portable/CI behaviour remains fail-closed: inability to answer the host
    // question is still HOST/unknown, never an optimistic pass.
    return result;
  }

  const checks = [...result.checks];
  checks[index] = check;
  const blocking = checks.filter((entry) => entry.status !== 'pass');
  return { ...result, checks, blocking, ok: blocking.length === 0 };
}

function renderPreflight(result) {
  const lines = ['== App Builder model canary preflight ==', ''];
  for (const check of result.checks) {
    const label = check.status === 'pass' ? 'PASS' : check.status === 'unknown' ? 'HOST' : 'FAIL';
    lines.push(`${label}  ${check.id} — ${check.detail}`);
    if (check.status !== 'pass' && check.remedy) lines.push(`      → ${check.remedy}`);
  }
  lines.push('');
  const runCommand = result.providerId === 'groq'
    ? 'npm run runtime:model-canary -- --provider groq --run'
    : 'npm run runtime:model-canary -- --run';
  lines.push(result.ok
    ? `Every prerequisite is satisfied. \`${runCommand}\` will make one real provider call.`
    : `${result.blocking.length} prerequisite(s) outstanding. Nothing has been run and no credential has been used.`);
  lines.push('HOST entries can only be settled on the Hetzner host. They are not passes.');
  return lines.join('\n');
}

function delegatePortableCli(argv) {
  const delegated = spawnSync(process.execPath, [PORTABLE_CANARY, ...argv], {
    env: process.env,
    stdio: 'inherit',
  });
  if (delegated.error) {
    console.error(delegated.error.message);
    return 1;
  }
  return delegated.status ?? 1;
}

async function cli(argv) {
  if (argv.includes('--authorise') || argv.includes('--authorize') || argv.includes('--review')) {
    return delegatePortableCli(argv);
  }

  const providerIndex = argv.indexOf('--provider');
  const providerId = providerIndex >= 0 ? argv[providerIndex + 1] : null;
  const result = settleHostImagePresence(preflight({ providerId }));
  if (!argv.includes('--run')) {
    console.log(renderPreflight(result));
    return result.ok ? 0 : 1;
  }

  if (!result.ok) {
    console.log(renderPreflight(result));
    console.error('\nRefusing to make a real provider call with outstanding prerequisites.');
    return 1;
  }

  const decisionPath = process.env.APP_BUILDER_MODEL_DECISION_FILE ?? DECISION_PATH;
  const stored = readJson(decisionPath);
  const report = await runModelCanary({ decisionToken: stored.token, providerId });
  const target = path.join(REPOSITORY_ROOT, '.app-builder', `model-attempt-${report.record.recordId}.json`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(report.record, null, 2)}\n`, 'utf8');

  for (const check of report.checks) {
    console.log(`${check.status === 'pass' ? 'PASS' : 'FAIL'}  ${check.id} — ${check.detail}`);
  }
  console.log('');
  console.log(`model:   ${report.record.runtime.model} via ${report.record.runtime.adapterId}`);
  console.log(`usage:   ${report.record.usage.calls} call(s), ${report.record.usage.totalTokens} token(s), £${report.record.usage.costGbp.toFixed(5)}, ${report.record.usage.durationMs}ms`);
  console.log(`record:  ${target}`);
  console.log('');
  console.log(report.ok
    ? 'Every deterministic check passed. This is NOT a promotion: the record carries no verdict until somebody who did not create it reviews the artifact.'
    : `Failed checks: ${report.failed.join(', ')}`);
  console.log(`evidence: ${report.evidence.satisfied ? 'satisfied' : `outstanding — ${report.evidence.missing.join('; ')}`}`);
  return report.ok ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('model-canary-host.mjs')) {
  process.exit(await cli(process.argv.slice(2)));
}
