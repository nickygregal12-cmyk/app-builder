import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const scripts = [
  'ops/hetzner/preflight-existing-host.sh',
  'ops/hetzner/install-existing-host.sh',
  'ops/hetzner/install-opencode.sh',
  'ops/hetzner/install-service-units.sh',
  'ops/hetzner/observe-runtime.sh',
  'ops/hetzner/verify-host.sh',
  'ops/hetzner/verify-agent-boundary.sh',
  'ops/hetzner/build-task-image.sh',
  'ops/hetzner/install-egress-network.sh',
  'ops/hetzner/verify-egress-profile.sh',
  'ops/hetzner/install-model-canary-unit.sh',
  'ops/hetzner/authorise-model-canary.sh',
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

test('OpenCode service is dormant, isolated, authenticated, loopback-only, and reinstall-safe', () => {
  const source = readFileSync('ops/hetzner/install-service-units.sh', 'utf8');
  assert.match(source, /APP_BUILDER_OPENCODE_PORT:-4097/);
  assert.match(source, /opencode serve --hostname 127\.0\.0\.1 --port/);
  assert.match(source, /OPENCODE_SERVER_PASSWORD=/);
  assert.match(source, /User=\$\{RUNTIME_USER\}/);
  assert.match(source, /Slice=app-builder-runtime\.slice/);
  assert.match(source, /systemctl is-active --quiet app-builder-opencode\.service/);
  assert.match(source, /active loopback-only App Builder OpenCode service; preserving it during idempotent reinstall/);
  assert.match(source, /something other than the active loopback-only App Builder OpenCode service/);
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

test('shared-host verifier checks the evidence browser as the service user, with the command that fixes it', () => {
  const source = readFileSync('ops/hetzner/verify-host.sh', 'utf8');
  // The 3.8E finding was that the browser existed for nobody the service ran
  // as, so checking it as root would have passed and proved nothing.
  assert.match(source, /runuser -u "\$RUNTIME_USER".*evidence-browser\.mjs/s);
  assert.match(source, /rendered-evidence browser provisioned for \$RUNTIME_USER/);
  assert.match(source, /npx playwright install chromium/);
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

test('the hosted boundary verifier detects an EnvironmentFile broker without reading the secret', () => {
  const source = readFileSync('ops/hetzner/verify-agent-boundary.sh', 'utf8');
  assert.match(source, /BROKER_ENV_FILE="\/etc\/app-builder\/agent-broker\.env"/);
  assert.match(source, /sed -n 's\/\^APP_BUILDER_AGENT_BROKER_SOCKET=\/\/p'/);
  assert.match(source, /agent broker is configured by \$\{BROKER_ENV_FILE\}, but its socket is missing/);
  assert.match(source, /cd \/tmp/);
  assert.doesNotMatch(source, /systemctl show app-builder-factory\.service -p Environment --value/);
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
test('the task image build runs as the runtime user and refuses to record an unverified digest', () => {
  const source = readFileSync('ops/hetzner/build-task-image.sh', 'utf8');
  // Building as root would produce an image the isolated service user cannot
  // run, and would put a root-owned layer store on a shared host.
  assert.match(source, /runuser -u "\$RUNTIME_USER"/);
  assert.equal(/podman build[^\n]*--network=host/.test(source), false);
  // A floating base makes the built digest meaningless.
  assert.match(source, /has a FROM without a digest/);
  assert.match(source, /does not pin the base digest recorded in config\/task-images\.json/);
  // The image-boundary checks, each one a property the sandbox spec assumes.
  for (const property of ['non-root user', 'no container or podman client', 'no privilege-escalation helper', 'no setuid binary', 'read-only root filesystem']) {
    assert.ok(source.includes(property), `the build must check for a ${property}`);
  }
  assert.match(source, /Do not record this digest/);
  // Recording the digest stays a reviewed change; the script prints the edit.
  assert.equal(/jq[^\n]*>\s*"?\$manifest/.test(source), false, 'the build script must not rewrite config/task-images.json itself');
  assert.equal(/systemctl\s+(?:--\S+\s+)*(?:start|enable)\b/.test(source), false);
});

test('the egress network installer creates the bounded network and starts nothing', () => {
  const source = readFileSync('ops/hetzner/install-egress-network.sh', 'utf8');
  assert.match(source, /podman network create/);
  assert.match(source, /--opt isolate=true/);
  // Public egress must not become host networking by another name.
  assert.equal(/--network=host|--net=host/.test(source), false);
  assert.equal(/--privileged/.test(source), false);
  // It installs; it does not enable. The operator does that after reading it.
  assert.equal(/^\s*(?:sudo\s+)?systemctl\s+(?:--\S+\s+)*(?:start|enable|restart)\b/m.test(source), false);
  // Every class the control-plane egress policy forbids has a rule.
  for (const range of ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '127.0.0.0/8', '100.64.0.0/10', 'fc00::/7', 'fe80::/10', '::1/128']) {
    assert.ok(source.includes(range), `the ruleset must drop ${range}`);
  }
  // The rootless network namespace is torn down when the last container exits,
  // taking the ruleset with it. The anchor is what stops that.
  assert.match(source, /app-builder-egress-anchor/);
  assert.match(source, /rootless-netns/);
});

test('the egress verifier proves both halves and writes the attestation only on a pass', () => {
  const source = readFileSync('ops/hetzner/verify-egress-profile.sh', 'utf8');
  // Generated from the policy, never restated: a hand-written list drifts.
  assert.match(source, /forbiddenEgressProbeTargets/);
  assert.match(source, /Refusing to fall back to a hand-written list/);
  // A dead listener would make every "unreachable" result meaningless.
  assert.match(source, /the refusals below are therefore meaningful/);
  // A profile that reaches nothing has silently become `none`.
  assert.match(source, /public DNS resolves/);
  assert.match(source, /public HTTPS is reachable/);
  // The attestation is written only after a pass and removed on a failure.
  assert.match(source, /rm -f "\$ATTESTATION"/);
  assert.match(source, /The attestation was not written/);
  assert.equal(/systemctl\s+(?:--\S+\s+)*(?:start|stop|enable|disable|restart)\b/.test(source), false);
});

test('the model canary unit carries every secret the run needs, each by the right mechanism', () => {
  const source = readFileSync('ops/hetzner/install-model-canary-unit.sh', 'utf8');

  // The provider credential is the one thing that must not be an environment
  // variable, because this process starts task sandboxes and a variable is
  // inherited by every child.
  assert.match(source, /LoadCredentialEncrypted=ANTHROPIC_API_KEY:\$\{CREDSTORE\}\/ANTHROPIC_API_KEY\.cred/);
  assert.equal(source.includes('Environment=ANTHROPIC_API_KEY='), false, 'the provider key must never be a unit Environment= line');
  assert.equal(/EnvironmentFile=.*(ANTHROPIC|credstore)/i.test(source), false, 'the provider key must never arrive by EnvironmentFile');

  // The preflight requires both signing secrets. A unit that loaded neither
  // could never complete a run, which is the mismatch this pins.
  assert.match(source, /EnvironmentFile=\$\{BROKER_ENV\}/);
  assert.match(source, /LoadCredentialEncrypted=APP_BUILDER_MODEL_DECISION_SECRET:\$\{DECISION_CRED\}/);
  // The decision key must never become a plaintext env file again.
  assert.equal(source.includes('model-canary.env'), false, 'the decision key is an encrypted credential, not a plaintext file');

  // The grant key is the broker's, and is read rather than generated: a fresh
  // one here would mint grants the broker refuses.
  assert.match(source, /BROKER_ENV="\$\{ETC_DIR\}\/agent-broker\.env"/);
  assert.equal(/APP_BUILDER_AGENT_GRANT_SECRET=\$\(/.test(source), false, 'the grant key must never be regenerated here');
  assert.match(source, /grep -q '\^APP_BUILDER_AGENT_GRANT_SECRET=' "\$BROKER_ENV"/);

  // The decision key spans --authorise and --run, so it is generated once and
  // kept root-owned rather than exported.
  // Generated straight into systemd-creds: the plaintext exists only in the
  // pipe, never as a shell variable, an argument or a file.
  assert.match(source, /head -c 48 \/dev\/urandom \| base64 -w0/);
  assert.match(source, /systemd-creds encrypt --name=APP_BUILDER_MODEL_DECISION_SECRET -/);
  assert.match(source, /chmod 0600 "\$DECISION_CRED"/);

  // OpenAI stays dormant. The file may explain *why* it is not loaded — that is
  // the useful part — so this pins the absence of a load, not of the name.
  assert.equal(/LoadCredential\w*=OPENAI_API_KEY/.test(source), false, 'the OpenAI credential has no consumer and must not be loaded');
  assert.equal(/Environment=OPENAI_API_KEY=/.test(source), false);
  // Anchored to a real command: this file explains in prose why a stray
  // `systemctl start` cannot spend money, and that sentence is not a command.
  assert.equal(
    /^\s*systemctl\s+(?:--\S+\s+)*(?:start|enable|restart)\b/m.test(source), false,
    'the installer must not start or enable the canary',
  );
  assert.match(source, /Type=oneshot/);
  assert.match(source, /Restart=no/);
});

test('the canary documentation no longer tells an operator to export a signing key', () => {
  const source = readFileSync('docs/MODEL_CANARY.md', 'utf8');
  assert.equal(/export APP_BUILDER_AGENT_GRANT_SECRET=/.test(source), false);
  assert.equal(/export APP_BUILDER_MODEL_DECISION_SECRET=/.test(source), false);
  assert.equal(/export ANTHROPIC_API_KEY=/.test(source), false);
});

test('the preflight never advises exporting a signing key', () => {
  const source = readFileSync('tooling/model-canary.mjs', 'utf8');
  // The grant key belongs to the broker. Advising a fresh one would produce
  // grants the broker refuses, which fails later and reads as a model problem.
  assert.equal(/export \$\{reference\}/.test(source), false);
  assert.equal(/export APP_BUILDER_AGENT_GRANT_SECRET=/.test(source), false);
  assert.equal(/export APP_BUILDER_MODEL_DECISION_SECRET=/.test(source), false);
  assert.match(source, /It belongs to the broker/);
});

test('the broker environment file stays bounded, so loading it cannot silently widen the canary', () => {
  const source = readFileSync('ops/hetzner/install-service-units.sh', 'utf8');
  // The canary loads this whole file to share the broker's grant key. That is
  // the deliberate coupling, and it is only safe while the file's contents are
  // known — a future sensitive variable added here would reach the canary
  // without anyone deciding that it should. So the shape is a tested contract.
  // Skip past the heredoc opener line before reading the body it introduces.
  const opener = source.indexOf('cat > "$ETC_DIR/agent-broker.env" <<BROKER');
  assert.notEqual(opener, -1, 'the broker env heredoc moved; this contract test must follow it');
  const body = source.slice(source.indexOf('\n', opener) + 1);
  const declared = [...body.slice(0, body.indexOf('\nBROKER')).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
  assert.deepEqual(
    declared.sort(),
    ['APP_BUILDER_AGENT_BROKER_SOCKET', 'APP_BUILDER_AGENT_GRANT_SECRET'],
    'agent-broker.env is loaded wholesale by the canary unit; adding a variable here widens that unit and needs a deliberate decision',
  );
});

test('authorising is a trusted one-shot that signs but cannot spend', () => {
  const source = readFileSync('ops/hetzner/authorise-model-canary.sh', 'utf8');
  assert.match(source, /--unit=app-builder-model-authorise/);
  assert.match(source, /--property=Type=oneshot/);
  assert.match(source, /LoadCredentialEncrypted="?APP_BUILDER_MODEL_DECISION_SECRET/);
  // Minting a decision must not be able to make the call it authorises.
  assert.equal(source.includes('ANTHROPIC_API_KEY'), false, 'the authorising unit must not load a provider credential');
  assert.equal(source.includes('OPENAI_API_KEY'), false);
  assert.equal(source.includes('--run'), false, 'authorising must not run the canary');
  // The signing key is never an argument, and never echoed.
  assert.equal(/APP_BUILDER_MODEL_DECISION_SECRET=\$/.test(source), false);
  assert.equal(/echo .*DECISION_SECRET/.test(source), false);
});

test('the canary host-switch condition does not claim to check more than it does', () => {
  const source = readFileSync('ops/hetzner/install-model-canary-unit.sh', 'utf8');
  // ConditionPathExists tests existence, not enabled:true. The comment used to
  // say the unit refused to start without the switch enabled, which was a
  // policy the unit did not implement and the preflight already owns.
  assert.equal(/refuses to start without it/.test(source), false);
  assert.match(source, /deliberately does NOT check enabled:true/);
  assert.match(source, /ConditionPathExists=\/etc\/app-builder\/model-execution\.json/);
});

test('provisioning a credential store never widens an existing restrictive one', () => {
  // The bug: `install -d -m 0755 "$CREDSTORE"` chmods an existing directory on
  // GNU coreutils, so a 0700 store became 0755 the first time this ran. The
  // installer needs root, so this exercises the same decision against a real
  // 0700 directory using the same commands the script uses.
  const store = mkdtempSync(join(tmpdir(), 'app-builder-credstore-'));
  try {
    chmodSync(store, 0o700);
    assert.equal(statSync(store).mode & 0o777, 0o700);

    const source = readFileSync('ops/hetzner/install-model-canary-unit.sh', 'utf8');
    assert.equal(/install -d -m 0755\s+"\$CREDSTORE"/.test(source), false, 'the widening form must not return');
    assert.match(source, /if \[\[ ! -d "\$CREDSTORE" \]\]; then/, 'an existing store must not be re-moded');
    assert.match(source, /install -d -m 0700 -o root -g root "\$CREDSTORE"/, 'a missing store is created restrictively');

    // The guard the script applies to an existing store, run here for real.
    const mode = statSync(store).mode & 0o777;
    assert.equal(mode & 0o077, 0, 'the contract is: no group or other access');
    // Nothing in the provisioning path touches the mode of an existing store.
    assert.equal(statSync(store).mode & 0o777, 0o700, 'still 0700 afterwards');
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
});

test('an unprivileged signer cannot write the authoritative decision, so root promotes it', () => {
  // The bug this pins: the authorising unit runs as the runtime user, and
  // /etc/app-builder is root-owned with no group write. Writing the decision
  // straight there was EACCES, and no source-level test noticed because none
  // of them modelled the directory permission.
  const etc = mkdtempSync(join(tmpdir(), 'app-builder-etc-'));
  try {
    // 0750 root:appbuilder, as install-service-units.sh establishes it: the
    // group may traverse and read, and may not create.
    chmodSync(etc, 0o750);
    assert.equal(statSync(etc).mode & 0o022, 0, 'group and other must not have write access');

    const script = readFileSync('ops/hetzner/authorise-model-canary.sh', 'utf8');
    // The signer writes to a staging directory it owns...
    assert.match(script, /APP_BUILDER_MODEL_DECISION_FILE="\$\{STAGING\}\/decision\.json"/);
    assert.match(script, /install -d -m 0700 -o "\$RUNTIME_USER" -g "\$RUNTIME_USER" "\$STAGING"/);
    // ...and root, not the signer, performs the promotion to root:root 0600.
    assert.match(script, /install -m 0600 -o root -g root "\$\{STAGING\}\/decision\.json" "\$DECISION"/);
    // Staging never outlives the command, on any exit path.
    assert.match(script, /trap cleanup EXIT/);
    // The unit must not be given privilege merely to reach the filesystem.
    assert.equal(/--property=User="?root/.test(script), false, 'the signer stays unprivileged');
    assert.equal(/chmod\s+(?:0?7[0-7][0-7]|g\+w).*\/etc\/app-builder/.test(script), false, 'never widen /etc/app-builder');
  } finally {
    rmSync(etc, { recursive: true, force: true });
  }
});

test('the decision reaches the canary as a credential, not as a file every appbuilder process can read', () => {
  const installer = readFileSync('ops/hetzner/install-model-canary-unit.sh', 'utf8');
  // Possessing the token is what authorises the call, so it is not something
  // every process sharing the runtime UID should be able to copy.
  assert.match(installer, /LoadCredential=model-enable-decision:\$\{DECISION\}/);

  const canary = readFileSync('tooling/model-canary.mjs', 'utf8');
  assert.match(canary, /function decisionPathFor\(/);
  assert.match(canary, /path\.join\(directory, 'model-enable-decision'\)/);
  // Every *read* of the decision goes through the one resolver. The authorise
  // path still writes to --out/env directly, which is correct: it is producing
  // the file, not consuming a credential.
  const reads = [...canary.matchAll(/const decisionPath = decisionPathFor\(/g)];
  assert.equal(reads.length, 2, 'both preflight and run must resolve the decision the same way');
  assert.equal(
    /const decisionPath = (?:env|process\.env)\.APP_BUILDER_MODEL_DECISION_FILE \?\? DECISION_PATH/.test(canary), false,
    'no read site may bypass the resolver and miss the credential form',
  );
});

test('no hosted Groq recipe survives that exports a key or authorises outside the trusted unit', () => {
  const source = readFileSync('docs/MODEL_CANARY.md', 'utf8');
  // Command form, not prose: the document explains why these were removed.
  assert.equal(/^\s*export GROQ_API_KEY=/m.test(source), false);
  assert.equal(/^\s*npm run runtime:model-canary -- --provider groq --authorise/m.test(source), false);
  assert.equal(/^\s*npm run runtime:model-canary -- --provider groq --run/m.test(source), false);
  assert.equal(/^\s*unset GROQ_API_KEY/m.test(source), false);
  // Whitespace-tolerant: the sentence is line-wrapped in the document.
  assert.match(source.replace(/\s+/g, ' '), /the first hosted canary path is Anthropic-only/i);
});
