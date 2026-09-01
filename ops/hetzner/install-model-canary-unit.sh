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
RUNTIME_UID="$(id -u "${APP_BUILDER_RUNTIME_USER:-appbuilder}" 2>/dev/null || echo "")"
RUNTIME_HOME="$(getent passwd "${APP_BUILDER_RUNTIME_USER:-appbuilder}" 2>/dev/null | cut -d: -f6)"
REPO="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
CREDSTORE="${APP_BUILDER_CREDSTORE:-/etc/credstore.encrypted/app-builder}"
ETC_DIR=/etc/app-builder
BROKER_ENV="${ETC_DIR}/agent-broker.env"
DECISION_CRED="${CREDSTORE}/APP_BUILDER_MODEL_DECISION_SECRET.cred"
DECISION="${ETC_DIR}/model-enable-decision.json"
# Beside the authority, on the same filesystem: rename(2) is only atomic
# within one, and a claim in /run would not survive a reboot.
CLAIM="${ETC_DIR}/model-enable-decision.claimed.json"
UNIT=/etc/systemd/system/app-builder-model-canary.service

# Rootless Podman writes exactly two trees, and ProtectHome=read-only covers
# both: the image/layer store under the runtime user's home, and its per-user
# runtime directory. Derived from the account rather than hardcoded so a host
# with a different runtime user or uid stays correct.
PODMAN_GRAPH_ROOT="${RUNTIME_HOME}/.local/share/containers"
PODMAN_RUNTIME_ROOT="/run/user/${RUNTIME_UID}"

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: it writes a systemd unit." >&2; exit 1; }
id -u "$RUNTIME_USER" >/dev/null 2>&1 || { echo "Runtime user ${RUNTIME_USER} does not exist." >&2; exit 1; }
[[ -n "$RUNTIME_UID" && -n "$RUNTIME_HOME" ]] || { echo "Could not derive uid/home for ${RUNTIME_USER}; refusing to write a unit with guessed Podman paths." >&2; exit 1; }
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
# genuinely different lifetime from the grant key: the decision is minted by one
# trusted process and verified by another, so the key must outlive a single
# process — but nothing needs it once the attempt is recorded, and a decision may
# not live longer than 24 hours anyway.
#
# It is an encrypted credential like the provider key, not a plaintext env file.
# Putting both sides of the flow behind one-shot units is what makes that
# possible: `authorise` and `run` each load it, and no ordinary appbuilder shell
# process can read it at all.
#
# Generated here and never displayed. The plaintext exists only in the pipe
# between /dev/urandom and systemd-creds; it is never a shell variable, never an
# argument, and never written to disk unencrypted.
# The credential store is created restrictively if absent and never widened if
# present. `install -d -m` would have chmod'd an existing directory, which is how
# a 0700 store silently becomes 0755 the first time somebody runs an installer.
if [[ ! -d "$CREDSTORE" ]]; then
  install -d -m 0700 -o root -g root "$CREDSTORE"
  printf 'Created %s (0700 root:root).\n' "$CREDSTORE"
else
  # One explicit contract, checked rather than assumed: root-owned, and no
  # access for group or other. Anything else fails closed — a store this script
  # cannot vouch for is not one it will add a signing key to.
  store_owner=$(stat -c '%U' "$CREDSTORE")
  store_mode=$(stat -c '%a' "$CREDSTORE")
  if [[ "$store_owner" != root || $(( 8#$store_mode & 8#077 )) -ne 0 ]]; then
    printf 'Refusing to use %s: it is %s-owned with mode %s.\n' "$CREDSTORE" "$store_owner" "$store_mode" >&2
    printf 'A credential store must be root-owned with no group or other access. Fix it deliberately:\n' >&2
    printf '  sudo chown root:root %s && sudo chmod 0700 %s\n' "$CREDSTORE" "$CREDSTORE" >&2
    exit 1
  fi
fi

if [[ ! -f "$DECISION_CRED" ]]; then
  head -c 48 /dev/urandom | base64 -w0 \
    | systemd-creds encrypt --name=APP_BUILDER_MODEL_DECISION_SECRET - "$DECISION_CRED"
  chmod 0600 "$DECISION_CRED"
  printf 'Generated and encrypted a model-decision signing secret at %s.\n' "$DECISION_CRED"
else
  printf 'Reusing the existing encrypted model-decision signing secret at %s.\n' "$DECISION_CRED"
fi

# Only Anthropic is wired. OPENAI_API_KEY may already be encrypted on this host
# for the independent-review lane, and it stays unloaded until that lane has an
# actual consumer: a credential loaded for a consumer that does not exist is
# reach nobody asked for.
cat > "$UNIT" <<EOF
[Unit]
Description=App Builder model canary (one bounded, authorised provider attempt)
After=network-online.target user-runtime-dir@${RUNTIME_UID}.service
Wants=network-online.target
# Rootless Podman needs /run/user/${RUNTIME_UID} to exist. Depending on it
# explicitly rather than inheriting it from whatever last logged in — the egress
# anchor already takes this dependency for the same reason.
Requires=user-runtime-dir@${RUNTIME_UID}.service
ConditionPathExists=${REPO}/package.json
# Presence only. This deliberately does NOT check enabled:true — the preflight
# re-reads both switches immediately before the call and is the single authority
# on whether a call may happen. A second, coarser copy of that policy here could
# disagree with it, and the failure mode of two policies is worse than the
# failure mode of one. A stray \`systemctl start\` is stopped by the preflight.
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
# It is deliberately NOT in the EnvironmentFile below: an environment variable
# is inherited by every child, and this process starts task sandboxes.
LoadCredentialEncrypted=ANTHROPIC_API_KEY:${CREDSTORE}/ANTHROPIC_API_KEY.cred

# The decision key, also encrypted. The transient authorise unit loads the same
# credential to sign; this unit loads it to verify.
LoadCredentialEncrypted=APP_BUILDER_MODEL_DECISION_SECRET:${DECISION_CRED}

# The signed decision, as a credential rather than a readable file, and read
# from the *claimed* path rather than the authoritative one. That is what makes
# single use survive a restart: ops/hetzner/run-model-canary.sh renames the
# authoritative decision into this claim before starting the unit, so the
# authorisation is spent before any provider call and a second start has nothing
# to load. Starting this unit directly, without a claim, fails 243/CREDENTIALS
# rather than reusing a decision.
LoadCredential=model-enable-decision:${CLAIM}

# The grant key is the one secret that must be shared rather than owned: the
# broker inside app-builder-factory.service verifies the grants this canary
# mints, so a separate value here would mint grants the broker refuses. It is
# read from the broker's own file, whose contents are bounded to exactly the
# socket path and this key — see tooling/hetzner-ops.test.mjs. Adding an
# unrelated variable there would widen this unit, so that file's shape is a
# tested contract rather than a convention.
EnvironmentFile=${BROKER_ENV}

ExecStart=/home/${RUNTIME_USER}/.local/bin/npm run runtime:model-canary -- --run

# One attempt. Never restarted: a canary that retried itself would spend a
# budget the operator authorised once, and the enable decision is single-use.
Restart=no
Slice=app-builder-runtime.slice
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
# Kept. It is the reason the sandbox host process cannot wander through home
# directories, and the earlier failure was not a reason to drop it.
ProtectHome=read-only

# The two exceptions ProtectHome makes necessary, and nothing wider.
#
# ProtectHome=read-only remounts /home *and* /run/user read-only, and rootless
# Podman must write both: its image store lives under the runtime user's home,
# and it chmods ${PODMAN_RUNTIME_ROOT}/libpod on startup. Without these the unit
# fails before any provider call with
# "set sticky bit on: chmod .../libpod: read-only file system", which is exactly
# what the hosted preflight hit.
#
# This restores the write access this user already has outside the unit. It does
# not widen /home, /run or /run/user, and it grants the *host canary process*
# nothing the child task container can see: the task's mounts are the driver's
# to decide and remain workspace, scratch and the broker socket.
ReadWritePaths=${PODMAN_GRAPH_ROOT}
ReadWritePaths=${PODMAN_RUNTIME_ROOT}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
EOF

chmod 0644 "$UNIT"

# The authorising half of the flow is app-builder-model-authorise.service, a
# transient unit created by ops/hetzner/authorise-model-canary.sh. It is not
# installed statically because `--by` and `--reason` differ every time, and a
# static unit would have to read them from somewhere — which for a unit that
# holds a signing credential means another file to get wrong. It loads the same
# decision credential and, deliberately, no provider credential: minting a
# decision must not be able to spend one.

systemctl daemon-reload

# Deliberately not enabled: this is operator-invoked, one attempt at a time,
# and nothing should ever start it on boot or on a timer.
printf 'Installed %s (oneshot, not enabled).\n' "$UNIT"
printf 'It loads ANTHROPIC_API_KEY as an encrypted systemd credential; the value stays out of the environment and out of every sandbox.\n'
printf 'Model execution remains governed by /etc/app-builder/model-execution.json, which this script does not touch.\n'
printf 'Verify the credential is visible to the unit without printing it:\n'
printf '  sudo systemd-run --pipe --property=LoadCredentialEncrypted=ANTHROPIC_API_KEY:%s \\\n' "$ANTHROPIC_CRED"
printf '    --property=User=%s sh -c '"'"'test -s "$CREDENTIALS_DIRECTORY/ANTHROPIC_API_KEY" && echo present'"'"'\n' "$RUNTIME_USER"
