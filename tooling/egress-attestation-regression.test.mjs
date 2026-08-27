import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const installer = fs.readFileSync('ops/hetzner/install-egress-network.sh', 'utf8');
const verifier = fs.readFileSync('ops/hetzner/verify-egress-profile.sh', 'utf8');

function position(source, needle) {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `expected to find ${JSON.stringify(needle)}`);
  return index;
}

test('egress reconfiguration invalidates durable evidence before mutating the profile', () => {
  assert.match(installer, /APP_BUILDER_EGRESS_ATTESTATION_FILE:-\/etc\/app-builder\/egress-profile\.json/);

  const invalidate = position(installer, 'rm -f "$ATTESTATION"');
  const podmanPrerequisite = position(installer, 'as_runtime podman --version');
  const networkCreate = position(installer, 'as_runtime podman network create');
  const rulesWrite = position(installer, 'cat > "$RULES"');
  const unitWrite = position(installer, 'cat > /etc/systemd/system/app-builder-egress-anchor.service');

  assert.ok(invalidate < podmanPrerequisite, 'an install attempt must invalidate old evidence even when prerequisites fail');
  assert.ok(invalidate < networkCreate, 'old evidence must be gone before the bounded network can change');
  assert.ok(invalidate < rulesWrite, 'old evidence must be gone before nftables policy can change');
  assert.ok(invalidate < unitWrite, 'old evidence must be gone before the anchor unit can change');
});

test('egress anchor uses the runtime user UID instead of the system manager UID', () => {
  assert.match(installer, /RUNTIME_UID="\$\(id -u "\$RUNTIME_USER"\)"/);
  assert.match(installer, /RUNTIME_DIR="\/run\/user\/\$\{RUNTIME_UID\}"/);
  assert.match(installer, /XDG_RUNTIME_DIR="\$RUNTIME_DIR"/);
  assert.match(installer, /After=network-online\.target user-runtime-dir@\$\{RUNTIME_UID\}\.service/);
  assert.match(installer, /Requires=user-runtime-dir@\$\{RUNTIME_UID\}\.service/);
  assert.match(installer, /Environment=XDG_RUNTIME_DIR=\$\{RUNTIME_DIR\}/);
  assert.doesNotMatch(
    installer,
    /Environment=XDG_RUNTIME_DIR=\/run\/user\/%U/,
    'system-unit %U resolves to the system manager UID (root), not User=appbuilder',
  );
});

test('every egress verification attempt invalidates old evidence before any early refusal', () => {
  assert.match(verifier, /APP_BUILDER_EGRESS_ATTESTATION_FILE:-\/etc\/app-builder\/egress-profile\.json/);

  const invalidate = position(verifier, 'rm -f "$ATTESTATION"');
  const podmanPrerequisite = position(verifier, 'as_runtime podman --version');
  const networkPrerequisite = position(verifier, 'as_runtime podman network exists');
  const factoryPrerequisite = position(verifier, 'curl -fsS --max-time 5');
  const targetGeneration = position(verifier, 'targets_json=');
  const successWrite = position(verifier, 'cat > "$ATTESTATION"');

  assert.ok(invalidate < podmanPrerequisite, 'missing rootless Podman must leave no earlier attestation');
  assert.ok(invalidate < networkPrerequisite, 'a missing network must leave no earlier attestation');
  assert.ok(invalidate < factoryPrerequisite, 'a dead Factory must leave no earlier attestation');
  assert.ok(invalidate < targetGeneration, 'policy generation failure must leave no earlier attestation');
  assert.ok(invalidate < successWrite, 'only the all-probes-passed path may restore the attestation');
});

test('egress verifier only writes a passed attestation after the accumulated failure gate', () => {
  const failureGate = position(verifier, 'if (( failures > 0 )); then');
  const successWrite = position(verifier, 'cat > "$ATTESTATION"');
  const passedResult = position(verifier, '"result": "passed"');

  assert.ok(failureGate < successWrite);
  assert.ok(successWrite < passedResult);
  assert.doesNotMatch(
    verifier.slice(0, failureGate),
    /cat > "\$ATTESTATION"/,
    'no prerequisite or probe path may write durable evidence before the final failure decision',
  );
});
