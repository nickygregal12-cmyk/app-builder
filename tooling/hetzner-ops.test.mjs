import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const scripts = [
  'ops/hetzner/preflight-existing-host.sh',
  'ops/hetzner/install-existing-host.sh',
  'ops/hetzner/install-opencode.sh',
  'ops/hetzner/install-service-units.sh',
  'ops/hetzner/verify-host.sh',
];

for (const path of scripts) {
  test(`${path} has valid bash syntax`, () => {
    execFileSync('bash', ['-n', path], { stdio: 'pipe' });
  });
}

test('read-only preflight contains no host mutation operations', () => {
  const source = readFileSync('ops/hetzner/preflight-existing-host.sh', 'utf8');
  for (const forbidden of [
    'apt-get ',
    'useradd ',
    'usermod ',
    'passwd ',
    'systemctl start',
    'systemctl enable',
    'systemctl restart',
    'ufw ',
    'iptables ',
    'nft ',
    'rm -',
    'mkdir ',
    'install -d',
  ]) {
    assert.equal(source.includes(forbidden), false, `preflight must not contain ${forbidden}`);
  }
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
  assert.match(source, /hostSshModified\": false/);
  assert.match(source, /hostFirewallModified\": false/);
  assert.match(source, /globalNodeModified\": false/);
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
  assert.match(source, /User=appbuilder/);
  assert.match(source, /Slice=app-builder-runtime\.slice/);
  assert.equal(/systemctl\s+(?:--\S+\s+)*enable\b/.test(source), false);
  assert.equal(/systemctl\s+(?:--\S+\s+)*start\b/.test(source), false);
});

test('shared-host verifier checks loopback exposure and subordinate-ID overlap', () => {
  const source = readFileSync('ops/hetzner/verify-host.sh', 'utf8');
  assert.match(source, /check_subid_non_overlap \/etc\/subuid/);
  assert.match(source, /check_subid_non_overlap \/etc\/subgid/);
  assert.match(source, /opencodePort \/\/ 4097/);
  assert.match(source, /127\\\.0\\\.0\\\.1/);
});
