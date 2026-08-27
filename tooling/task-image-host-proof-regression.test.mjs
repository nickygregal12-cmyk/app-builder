import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createExecutionEnvironmentSpec } from '@app-builder/control-plane/execution-environment';
import { podmanRunArgs } from './lib/sandbox-podman.mjs';

const IMAGE = `localhost/app-builder-task@sha256:${'a'.repeat(64)}`;

test('rootless Podman maps the host runtime account onto the fixed task uid', () => {
  const spec = createExecutionEnvironmentSpec({
    attemptId: 'uid-map',
    taskId: 'task',
    projectId: 'project',
    roleId: 'frontend-implementation',
    policyId: 'implementation',
    workspacePath: '/srv/app-builder/workspaces/uid-map',
    scratchPath: '/srv/app-builder/workspaces/uid-map-scratch',
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
