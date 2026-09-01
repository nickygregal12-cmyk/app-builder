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
ETC_DIR=/etc/app-builder
BROKER_ENV="${ETC_DIR}/agent-broker.env"
CANARY_ENV="${ETC_DIR}/model-canary.env"
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

# --- The two signing secrets ---------------------------------------------------
#
# These are not provider credentials and they do not have the same lifetime, so
# they do not get the same mechanism. Both are refused entry to a sandbox by
# name, and neither is ever exported, echoed or passed in argv.
#
# APP_BUILDER_AGENT_GRANT_SECRET is a long-lived *host* secret and is already
# owned by somebody else: `install-service-units.sh` generates it into
# ${BROKER_ENV} and the factory service loads it there, because the broker
# verifies the grants this canary mints. Both sides must therefore hold the same
# key, and generating a fresh one here — or exporting one, as the docs used to
# say — would produce grants the broker rejects. So this reads the existing file
# and never writes it.
if [[ ! -s "$BROKER_ENV" ]]; then
  cat >&2 <<MSG
No agent broker configuration at ${BROKER_ENV}.

The canary mints capability grants that the broker verifies, so both must hold
the same signing key. Install the broker first, which generates it:

  sudo APP_BUILDER_ENABLE_AGENT_BROKER=1 bash ops/hetzner/install-service-units.sh
MSG
  exit 1
fi
if ! grep -q '^APP_BUILDER_AGENT_GRANT_SECRET=' "$BROKER_ENV"; then
  echo "${BROKER_ENV} exists but declares no APP_BUILDER_AGENT_GRANT_SECRET. Reinstall the broker units." >&2
  exit 1
fi

# APP_BUILDER_MODEL_DECISION_SECRET signs the one-time enable decision. It has a
# genuinely different lifetime: the decision is minted by one operator command
# (`--authorise`) and verified by another (`--run`), so the key must outlive a
# single process — but nothing needs it once the attempt is recorded, and a
# decision may not live longer than 24 hours anyway.
#
# So it is generated here, once, and kept in a root-owned file the runtime user
# may read. Not an encrypted credential, because the operator's own `--authorise`
# step runs outside any unit and would have no CREDENTIALS_DIRECTORY to read
# from; a mechanism only half the flow can use is worse than a simpler one both
# halves can. It is generated rather than asked for, because an operator does not
# need to see, choose or keep this value.
if [[ ! -s "$CANARY_ENV" ]]; then
  umask 077
  printf '# Generated by ops/hetzner/install-model-canary-unit.sh. Not a provider credential.\n' > "$CANARY_ENV"
  printf 'APP_BUILDER_MODEL_DECISION_SECRET=%s\n' "$(head -c 48 /dev/urandom | base64 -w0)" >> "$CANARY_ENV"
  printf 'Generated a model-decision signing secret in %s.\n' "$CANARY_ENV"
else
  printf 'Reusing the existing model-decision signing secret in %s.\n' "$CANARY_ENV"
fi
chown root:"$RUNTIME_USER" "$CANARY_ENV"
chmod 0640 "$CANARY_ENV"

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

# The provider credential, decrypted by systemd into \$CREDENTIALS_DIRECTORY for
# this invocation only. The gateway reads \$CREDENTIALS_DIRECTORY/ANTHROPIC_API_KEY.
# It is deliberately NOT in either EnvironmentFile below: an environment variable
# is inherited by every child, and this process starts task sandboxes.
LoadCredentialEncrypted=ANTHROPIC_API_KEY:${CREDSTORE}/ANTHROPIC_API_KEY.cred

# The two signing secrets, from root-owned files the runtime user may read.
# Neither is a provider credential. The grant key is shared with the broker on
# purpose — a grant this canary mints is verified there, so a different key here
# would be a grant the broker refuses. Both are refused entry to a sandbox by
# name in packages/control-plane/src/execution-environment.js.
EnvironmentFile=${BROKER_ENV}
EnvironmentFile=${CANARY_ENV}

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
