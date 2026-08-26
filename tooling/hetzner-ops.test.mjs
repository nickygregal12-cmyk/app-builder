import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const scripts = [
  'ops/hetzner/preflight-existing-host.sh',
  'ops/hetzner/install-existing-host.sh',
  'ops/hetzner/install-opencode.sh',
  'ops/hetzner/install-service-units.sh',
  'ops/hetzner/observe-runtime.sh',
  'ops/hetzner/verify-host.sh',
  'ops/hetzner/verify-agent-boundary.sh',
];

const readOnlyMutationPatterns = [
  /(?:^|[;&|]\s*)(?:sudo\s+)?(?:apt|apt-get|useradd|usermod|passwd|ufw|iptables|nft|rm|mkdir|install)\b/m,
  /(?:^|[;&|]\s*)(?:sudo\s+)?systemctl\s+(?:start|stop|restart|enable|disable|daemon-reload)\b/m,
  /(?:^|[;&|]\s*)(?:sudo\s+)?(?:chown|chmod|chgrp|cp|mv|ln|touch|truncate|tee)\b/m,
];

for (const path of scripts) {
  test(`${path} has valid bash syntax`, () => {
    execFileSync('bash', ['-n', path], { stdio: 'pipe' });
  });
}

test('read-only preflight contains no host mutation commands', () => {
  const source = readFileSync('ops/hetzner/preflight-existing-host.sh', 'utf8');
  for (const pattern of readOnlyMutationPatterns) {
    assert.doesNotMatch(source, pattern, `preflight must remain read-only: ${pattern}`);
  }
});

test('runtime observer is read-only and reports the soak signals that justify co-location', () => {
  const source = readFileSync('ops/hetzner/observe-runtime.sh', 'utf8');
  for (const pattern of readOnlyMutationPatterns) {
    assert.doesNotMatch(source, pattern, `observer must remain read-only: ${pattern}`);
  }
  for (const expected of [
    'NRestarts',
    'MemoryCurrent',
    'MemoryPeak',
    'CPUUsageNSec',
    'TasksCurrent',
    'journalctl --disk-usage',
    '127.0.0.1:4310/health',
    '127.0.0.1:4097/global/health',
    'opencode_unauthenticated_http',
    '4096|4097|4310|5173',
  ]) {
    assert.equal(source.includes(expected), true, `observer must report ${expected}`);
  }
  assert.match(source, /unset OPENCODE_SERVER_PASSWORD OPENCODE_SERVER_USERNAME/);
  assert.doesNotMatch(source, /cat\s+["']?\/etc\/app-builder\/opencode-server\.env/);
});

test('shared-host installer never takes over global SSH, firewall, or Node paths', () => {
  const source = readFileSync('ops/hetzner/install-existing-host.sh', 'utf8');
  for (const forbidden of [
    '/etc/ssh/sshd_config',
    'systemctl restart ssh',
    'systemctl restart sshd',
    'ufw --force reset',
    'iptables -F',
    'nft flush',
    'ln -sfn "$NODE_ROOT/bin/node" /usr/local/bin/node',
    'ln -sfn "$NODE_ROOT/bin/npm" /usr/local/bin/npm',
  ]) {
    assert.equal(source.includes(forbidden), false, `co-location installer must not contain ${forbidden}`);
  }
  assert.match(source, /hostSshModified": false/);
  assert.match(source, /hostFirewallModified": false/);
  assert.match(source, /globalNodeModified": false/);
});

test('rootless subordinate IDs are not assigned from a fixed shared-host range', () => {
  const source = readFileSync('ops/hetzner/install-existing-host.sh', 'utf8');
  assert.match(source, /next_subid_start/);
  assert.match(source, /\/etc\/subuid/);
  assert.match(source, /\/etc\/subgid/);
  assert.equal(source.includes('usermod --add-subuids 100000-165535'), false);
  assert.equal(source.includes('usermod --add-subgids 100000-165535'), false);
});

test('OpenCode service is dormant, isolated, authenticated, and loopback-only', () => {
  const source = readFileSync('ops/hetzner/install-service-units.sh', 'utf8');
  assert.match(source, /APP_BUILDER_OPENCODE_PORT:-4097/);
  assert.match(source, /opencode serve --hostname 127\.0\.0\.1 --port/);
  assert.match(source, /OPENCODE_SERVER_PASSWORD=/);
  assert.match(source, /User=\$\{RUNTIME_USER\}/);
  assert.match(source, /Slice=app-builder-runtime\.slice/);
  assert.equal(/systemctl\s+(?:--\S+\s+)*enable\b/.test(source), false);
  assert.equal(/systemctl\s+(?:--\S+\s+)*start\b/.test(source), false);
});

test('factory service binds loopback and keeps durable state outside the repository', () => {
  const source = readFileSync('ops/hetzner/install-service-units.sh', 'utf8');
  assert.match(source, /STATE_ROOT="\/srv\/app-builder\/state\/service"/);
  assert.match(source, /WORKSPACES_ROOT="\/srv\/app-builder\/workspaces"/);
  assert.match(source, /Environment=APP_BUILDER_SERVICE_HOST=127\.0\.0\.1/);
  assert.match(source, /Environment=APP_BUILDER_SERVICE_PORT=4310/);
  assert.match(source, /Environment=APP_BUILDER_STATE_ROOT=\$\{STATE_ROOT\}/);
  assert.match(source, /Environment=APP_BUILDER_WORKSPACES_ROOT=\$\{WORKSPACES_ROOT\}/);
  assert.equal(source.includes('APP_BUILDER_STATE_ROOT=.app-builder'), false);
  assert.equal(source.includes('APP_BUILDER_WORKSPACES_ROOT=.app-builder'), false);
});

test('shared-host verifier checks loopback exposure and subordinate-ID overlap', () => {
  const source = readFileSync('ops/hetzner/verify-host.sh', 'utf8');
  assert.match(source, /check_subid_non_overlap \/etc\/subuid/);
  assert.match(source, /check_subid_non_overlap \/etc\/subgid/);
  assert.match(source, /opencodePort \/\/ 4097/);
  assert.equal(source.includes('127\\.0\\.0\\.1'), true);
});

test('the agent boundary acceptance is read-only and probes the exact bypasses #55 names', () => {
  const source = readFileSync('ops/hetzner/verify-agent-boundary.sh', 'utf8');
  for (const pattern of readOnlyMutationPatterns) {
    assert.doesNotMatch(source, pattern, `hosted acceptance must remain read-only: ${pattern}`);
  }
  // A probe that never reached a live listener would pass by accident, so the
  // script must establish the Factory is answering before it claims isolation.
  assert.match(source, /curl -fsS --max-time 5 "http:\/\/127\.0\.0\.1:\$\{FACTORY_PORT\}\/health"/);
  assert.match(source, /the isolation result below is therefore meaningful/);
  for (const expected of [
    '--network=none',
    '--security-opt=no-new-privileges',
    '--cap-drop=ALL',
    '127.0.0.1|${FACTORY_PORT}',
    'localhost|${FACTORY_PORT}',
    '::1|${FACTORY_PORT}',
    'host.containers.internal',
    'host.docker.internal',
    '/run/podman/podman.sock',
    '/var/run/docker.sock',
    '/srv/app-builder',
    '/etc/app-builder',
    'a task sandbox reached the Factory control plane',
  ]) {
    assert.equal(source.includes(expected), true, `hosted acceptance must probe ${expected}`);
  }
  // It must not start, stop or enable anything, and must not print the key.
  assert.equal(/systemctl\s+(?:--\S+\s+)*(?:start|stop|enable|disable|restart)\b/.test(source), false);
  assert.equal(source.includes('APP_BUILDER_AGENT_GRANT_SECRET='), false, 'the acceptance must never echo the signing key');
});

test('the agent broker is opt-in, socket-bound and never publishes a port', () => {
  const source = readFileSync('ops/hetzner/install-service-units.sh', 'utf8');
  assert.match(source, /APP_BUILDER_ENABLE_AGENT_BROKER:-0/);
  assert.match(source, /BROKER_SOCKET="\/srv\/app-builder\/runtime\/agent-broker\.sock"/);
  assert.match(source, /chmod 0640 "\$ETC_DIR\/agent-broker\.env"/);
  // The signing key belongs to the factory process alone. It must never be
  // written into the unit file, where `systemctl show` would print it.
  assert.equal(source.includes('Environment=APP_BUILDER_AGENT_GRANT_SECRET='), false);
  assert.match(source, /EnvironmentFile=\$\{ETC_DIR\}\/agent-broker\.env/);
  // A socket is not a port. Nothing here may add a listener.
  assert.equal(/APP_BUILDER_AGENT_BROKER_PORT/.test(source), false);
});
