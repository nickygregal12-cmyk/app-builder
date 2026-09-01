#!/usr/bin/env bash
#
# Mint the one-time model enable decision inside a trusted one-shot unit.
#
#   sudo bash ops/hetzner/authorise-model-canary.sh --by "your name" --reason "why"
#
# Two boundaries meet here, and the whole design is about keeping them apart.
#
# The *signing* boundary is systemd's: APP_BUILDER_MODEL_DECISION_SECRET is an
# encrypted credential, so only a unit that declares it can read it. Minting
# therefore has to happen inside a unit — and it runs unprivileged, as the
# runtime user, because signing a decision needs the key and nothing else.
#
# The *persistence* boundary is root's: /etc/app-builder is root-owned and gives
# the runtime user no write access, deliberately. An unprivileged signer cannot
# write the authoritative decision there, and must not be given the ability to —
# a decision an ordinary appbuilder process could replace is not an authority.
#
# So the signer writes to a private staging directory this script creates and
# owns the lifetime of, and root promotes the result. Even inside that window a
# substituted file is inert: the decision is HMAC-signed with a credential no
# appbuilder process can read, so anything not minted by the unit fails
# verification. At rest the decision is root:root 0600 — the runtime user cannot
# create it, replace it, or read it, and reaches it only as a credential that
# app-builder-model-canary.service declares.
#
# It mints. It does not run the canary, does not touch the host switch, and
# loads no provider credential: authorising a call and making one are separate
# actions, and only one of them can spend money.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
REPO="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
CREDSTORE="${APP_BUILDER_CREDSTORE:-/etc/credstore.encrypted/app-builder}"
DECISION_CRED="${CREDSTORE}/APP_BUILDER_MODEL_DECISION_SECRET.cred"
DECISION="${APP_BUILDER_MODEL_DECISION_FILE:-/etc/app-builder/model-enable-decision.json}"
STAGING=/run/app-builder-model-authorise

BY=""
REASON=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --by) BY="${2:-}"; shift 2 ;;
    --reason) REASON="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: the decision credential and its destination are root-owned." >&2; exit 1; }
[[ -n "$BY" && -n "$REASON" ]] || {
  echo 'A decision records who authorised it and why:' >&2
  echo '  sudo bash ops/hetzner/authorise-model-canary.sh --by "your name" --reason "why"' >&2
  exit 1
}
[[ -f "$DECISION_CRED" ]] || {
  echo "No decision credential at ${DECISION_CRED}. Run: sudo bash ops/hetzner/install-model-canary-unit.sh" >&2
  exit 1
}

# Staging is recreated every time and removed on every exit, success or not, so
# a signed decision never lingers anywhere the runtime user can read it.
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT
rm -rf "$STAGING"
install -d -m 0700 -o "$RUNTIME_USER" -g "$RUNTIME_USER" "$STAGING"

# A transient unit rather than an installed one, because --by and --reason
# differ per invocation. Neither is secret and the decision records both. The
# hardening is deliberately tighter than the canary's: this process signs, so it
# needs no container runtime, no writable /tmp shared with anything, and no
# ability to change kernel or cgroup state. The canary cannot be restricted this
# far because it starts task sandboxes; this one has no such excuse.
systemd-run \
  --unit=app-builder-model-authorise \
  --collect \
  --wait \
  --quiet \
  --property=Type=oneshot \
  --property=User="${RUNTIME_USER}" \
  --property=Group="${RUNTIME_USER}" \
  --property=WorkingDirectory="${REPO}" \
  --property=Environment=HOME="/home/${RUNTIME_USER}" \
  --property=Environment=PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  --property=Environment=APP_BUILDER_MODEL_DECISION_FILE="${STAGING}/decision.json" \
  --property=LoadCredentialEncrypted="APP_BUILDER_MODEL_DECISION_SECRET:${DECISION_CRED}" \
  --property=Slice=app-builder-runtime.slice \
  --property=UMask=0077 \
  --property=NoNewPrivileges=true \
  --property=PrivateTmp=true \
  --property=ProtectHome=read-only \
  --property=ProtectKernelTunables=true \
  --property=ProtectKernelModules=true \
  --property=ProtectControlGroups=true \
  --property=RestrictSUIDSGID=true \
  --property=LockPersonality=true \
  "/home/${RUNTIME_USER}/.local/bin/npm" run runtime:model-canary -- \
  --authorise --by "$BY" --reason "$REASON"

[[ -s "${STAGING}/decision.json" ]] || { echo "The authorising unit produced no decision." >&2; exit 1; }

# The promotion, and the only step that runs as root. The decision becomes
# root:root 0600: unwritable by the runtime user, and unreadable by it except
# through the credential the canary unit declares.
install -m 0600 -o root -g root "${STAGING}/decision.json" "$DECISION"

printf 'Authorised. The decision is at %s (root:root 0600) and is single-use.\n' "$DECISION"
printf 'app-builder-model-canary.service reads it as a systemd credential; no appbuilder process can replace it.\n'
printf 'Nothing has been run and no provider call has been made.\n'
