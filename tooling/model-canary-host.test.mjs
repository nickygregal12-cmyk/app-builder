import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { settleHostImagePresence } from './model-canary-host.mjs';

const DIGEST = 'sha256:94f1fe5c57b8596897da45d6db5407ae761bbb8f8cc1f73f87458ab014b299bf';

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-canary-host-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config/task-images.json'), JSON.stringify({
    images: {
      'task-baseline': {
        reference: 'localhost/app-builder-task',
        tag: 'baseline-1',
        digest: DIGEST,
      },
    },
  }));
  return root;
}

function preflightResult() {
  const checks = [
    { id: 'task-image-digest-recorded', status: 'pass', detail: DIGEST },
    {
      id: 'task-image-present-on-host',
      status: 'unknown',
      detail: 'only the host can answer',
      remedy: 'podman image inspect',
    },
    { id: 'hosted-boundary-attested-with-this-image', status: 'pass', detail: DIGEST },
  ];
  return {
    ok: false,
    checks,
    blocking: [checks[1]],
    imageId: 'task-baseline',
  };
}

test('an exact local Podman digest settles the HOST check as pass', () => {
  const root = fixtureRoot();
  try {
    const result = settleHostImagePresence(preflightResult(), {
      root,
      inspector: () => ({ status: 'pass', digest: DIGEST }),
    });
    const check = result.checks.find((entry) => entry.id === 'task-image-present-on-host');
    assert.equal(check.status, 'pass');
    assert.equal(result.ok, true);
    assert.equal(result.blocking.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a different local digest is a hard failure, not host evidence', () => {
  const root = fixtureRoot();
  try {
    const other = `sha256:${'a'.repeat(64)}`;
    const result = settleHostImagePresence(preflightResult(), {
      root,
      inspector: () => ({ status: 'pass', digest: other }),
    });
    const check = result.checks.find((entry) => entry.id === 'task-image-present-on-host');
    assert.equal(check.status, 'fail');
    assert.match(check.detail, new RegExp(DIGEST));
    assert.equal(result.ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a machine that cannot inspect Podman stays HOST/unknown and blocking', () => {
  const root = fixtureRoot();
  try {
    const original = preflightResult();
    const result = settleHostImagePresence(original, {
      root,
      inspector: () => ({ status: 'unknown', detail: 'Podman unavailable' }),
    });
    const check = result.checks.find((entry) => entry.id === 'task-image-present-on-host');
    assert.equal(check.status, 'unknown');
    assert.equal(result.ok, false);
    assert.equal(result.blocking.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an inspect failure on a Podman host fails closed', () => {
  const root = fixtureRoot();
  try {
    const result = settleHostImagePresence(preflightResult(), {
      root,
      inspector: () => ({ status: 'fail', detail: 'image not known' }),
    });
    const check = result.checks.find((entry) => entry.id === 'task-image-present-on-host');
    assert.equal(check.status, 'fail');
    assert.equal(result.ok, false);
    assert.match(check.detail, /image not known/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
