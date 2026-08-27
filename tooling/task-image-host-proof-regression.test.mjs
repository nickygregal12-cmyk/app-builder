import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createExecutionEnvironmentSpec } from '@app-builder/control-plane/execution-environment';
import { podmanRunArgs } from './lib/sandbox-podman.mjs';

const IMAGE = `localhost/app-builder-task@sha256:${'a'.repeat(64)}`;

test('rootless Podman maps the host runtime account onto the fixed task uid', () => {
  // These are neutral fixture paths, not real hosted paths. Ordinary task mounts
  // deliberately cannot sit below /srv/app-builder because that tree contains
  // the Factory's durable state; the broker socket is the sole narrow exception.
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'uid-map',
    taskId: 'task',
    projectId: 'project',
    roleId: 'frontend-implementation',
    policyId: 'implementation',
    workspacePath: '/tmp/app-builder-attempts/uid-map/workspace',
    scratchPath: '/tmp/app-builder-attempts/uid-map/scratch',
    brokerSocketPath: '/srv/app-builder/runtime/agent-broker.sock',
  });
  const args = podmanRunArgs(spec, { image: IMAGE });
  assert.ok(args.includes('--userns=keep-id:uid=1000,gid=1000'));
  const userIndex = args.indexOf('--user');
  assert.notEqual(userIndex, -1);
  assert.equal(args[userIndex + 1], '1000:1000');
  assert.ok(!args.includes('--userns=keep-id'), 'a bare keep-id mapping depends on the host account also being uid 1000');
});

test('the minimal task image removes the unused su escalation helper', () => {
  const source = fs.readFileSync('ops/images/app-builder-task/Containerfile', 'utf8');
  assert.match(source, /rm -f \/bin\/su \/usr\/bin\/su/);
});

test('the hosted image proof exercises a bind mount through the real uid mapping', () => {
  const source = fs.readFileSync('ops/hetzner/build-task-image.sh', 'utf8');
  assert.match(source, /--userns=keep-id:uid=1000,gid=1000/);
  assert.match(source, /--user 1000:1000/);
  assert.match(source, /probe_workspace/);
  assert.match(source, /:\/workspace:rw,Z/);
  assert.doesNotMatch(source, /--tmpfs=\/workspace:rw/);
});

test('the hosted boundary verifier proves the exact reviewed task image rather than a generic probe image', () => {
  const source = fs.readFileSync('ops/hetzner/verify-agent-boundary.sh', 'utf8');
  assert.ok(source.includes('EXPECTED_IMAGE_DIGEST="${APP_BUILDER_EXPECTED_TASK_IMAGE_DIGEST:-}"'));
  assert.ok(source.includes('PINNED_IMAGE="${image_reference}@${image_digest}"'));
  assert.ok(source.includes('podman image inspect "$PINNED_IMAGE"'));
  assert.ok(source.includes('--userns=keep-id:uid=1000,gid=1000'));
  assert.ok(source.includes('--user 1000:1000'));
  assert.ok(source.includes('--entrypoint node'));
  assert.ok(source.includes('Agent boundary acceptance passed for exact image %s.'));
  assert.ok(!source.includes('APP_BUILDER_PROBE_IMAGE'));
  assert.ok(!source.includes('docker.io/library/alpine:3.21'));
});

test('the boundary attester persists only a proof that reports the same pinned image and real repository provenance', () => {
  const source = fs.readFileSync('ops/hetzner/attest-agent-boundary.sh', 'utf8');
  assert.ok(source.includes('rm -f "$ATTESTATION"'), 'old evidence must disappear before revalidation');
  assert.ok(source.includes('APP_BUILDER_EXPECTED_TASK_IMAGE_DIGEST="$image_digest"'));
  assert.ok(source.includes('| tee "$proof_output"'));
  assert.ok(source.includes('proved_image='));
  assert.ok(source.includes('if [[ "$proved_image" != "$pinned_image" ]]'));
  assert.ok(source.includes('runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" git -C "$REPOSITORY" rev-parse HEAD'));
  assert.ok(!source.includes('echo unknown'), 'repository provenance must fail closed rather than becoming unknown');
});
