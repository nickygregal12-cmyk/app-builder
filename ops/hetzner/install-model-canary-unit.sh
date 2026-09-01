#!/usr/bin/env bash
#
# Install the dormant model-canary unit: the narrowest trusted host identity
# that may hold a provider credential.
#
#   sudo bash ops/hetzner/install-model-canary-unit.sh
#
# Why a new unit rather than an existing one.
#
# `app-builder-opencode.service` runs the agent runtime, which is the side of
# the boundary a task's model reaches through. Giving it the provider key would
# put the credential on the untrusted side of the exact line this architecture
# draws. `app-builder-factory.service` is long-running and broadly scoped: it
# serves the Factory API, and a credential loaded there would be available to
# everything it does for as long as it runs, rather than for one canary.
#
# So the canary gets its own unit, and it is `Type=oneshot`. There is no gateway
# daemon because the architecture does not need one: the gateway is a library
# the operator-invoked canary process constructs, uses for a single bounded
# attempt, and drops. A long-running credential holder would be a standing
# permission wearing a service's clothes — the same thing the single-use enable
# decision exists to refuse.
#
# The credential arrives via `LoadCredentialEncrypted=`, so systemd decrypts it
# with /var/lib/systemd/credential.secret into a private tmpfs readable only by
# this unit's user, for the lifetime of this invocation. It is never in the
# environment, never in `systemctl show`, and never written to disk in
# plaintext. Deliberately NOT `EnvironmentFile=`: an environment variable is
# inherited by every child process, and this process starts task sandboxes.
#
# This installs the unit. It does not enable model execution, which stays the
# owner's separate decision in /etc/app-builder/model-execution.json.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
REPO="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
CREDSTORE="${APP_BUILDER_CREDSTORE:-/etc/credstore.encrypted/app-builder}"
UNIT=/etc/systemd/system/app-builder-model-canary.service

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: it writes a systemd unit." >&2; exit 1; }
id -u "$RUNTIME_USER" >/dev/null 2>&1 || { echo "Runtime user ${RUNTIME_USER} does not exist." >&2; exit 1; }
[[ -r "${REPO}/package.json" ]] || { echo "No repository at ${REPO}." >&2; exit 1; }

# The credential must already exist. Its presence is checked; its value is not
# read, decrypted or printed here or anywhere else.
ANTHROPIC_CRED="${CREDSTORE}/ANTHROPIC_API_KEY.cred"
if [[ ! -f "$ANTHROPIC_CRED" ]]; then
  cat >&2 <<MSG
No encrypted credential at ${ANTHROPIC_CRED}.

Create it without it ever touching a shell history or a plaintext file:

  sudo systemd-ask-password -n | sudo systemd-creds encrypt --name=ANTHROPIC_API_KEY - ${ANTHROPIC_CRED}
  sudo chmod 0600 ${ANTHROPIC_CRED}
MSG
  exit 1
fi

# Only Anthropic is wired. OPENAI_API_KEY may already be encrypted on this host
# for the independent-review lane, and it stays unloaded until that lane has an
# actual consumer: a credential loaded for a consumer that does not exist is
# reach nobody asked for.
cat > "$UNIT" <<EOF
[Unit]
Description=App Builder model canary (one bounded, authorised provider attempt)
After=network-online.target
Wants=network-online.target
ConditionPathExists=${REPO}/package.json
# The host switch is the owner's key. The unit refuses to start without it, so
# a stray \`systemctl start\` cannot spend money.
ConditionPathExists=/etc/app-builder/model-execution.json

[Service]
Type=oneshot
User=${RUNTIME_USER}
Group=${RUNTIME_USER}
WorkingDirectory=${REPO}
Environment=HOME=/home/${RUNTIME_USER}
Environment=PATH=/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin

# The credential, decrypted by systemd into \$CREDENTIALS_DIRECTORY for this
# invocation only. The gateway reads \$CREDENTIALS_DIRECTORY/ANTHROPIC_API_KEY.
# No EnvironmentFile, and no Environment= line carries a key.
LoadCredentialEncrypted=ANTHROPIC_API_KEY:${CREDSTORE}/ANTHROPIC_API_KEY.cred

ExecStart=/home/${RUNTIME_USER}/.local/bin/npm run runtime:model-canary -- --run

# One attempt. Never restarted: a canary that retried itself would spend a
# budget the operator authorised once, and the enable decision is single-use.
Restart=no
Slice=app-builder-runtime.slice
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
EOF

chmod 0644 "$UNIT"
systemctl daemon-reload

# Deliberately not enabled: this is operator-invoked, one attempt at a time,
# and nothing should ever start it on boot or on a timer.
printf 'Installed %s (oneshot, not enabled).\n' "$UNIT"
printf 'It loads ANTHROPIC_API_KEY as an encrypted systemd credential; the value stays out of the environment and out of every sandbox.\n'
printf 'Model execution remains governed by /etc/app-builder/model-execution.json, which this script does not touch.\n'
printf 'Verify the credential is visible to the unit without printing it:\n'
printf '  sudo systemd-run --pipe --property=LoadCredentialEncrypted=ANTHROPIC_API_KEY:%s \\\n' "$ANTHROPIC_CRED"
printf '    --property=User=%s sh -c '"'"'test -s "$CREDENTIALS_DIRECTORY/ANTHROPIC_API_KEY" && echo present'"'"'\n' "$RUNTIME_USER"
