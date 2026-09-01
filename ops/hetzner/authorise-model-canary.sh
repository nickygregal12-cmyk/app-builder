#!/usr/bin/env bash
#
# Mint the one-time model enable decision inside a trusted one-shot unit.
#
#   sudo bash ops/hetzner/authorise-model-canary.sh --by "your name" --reason "first canary"
#
# This exists so that both halves of the decision flow run under systemd. The
# decision signing key is an encrypted credential, and a credential can only be
# read by a unit that declares it — so minting has to be a unit too, or the key
# would have to be a plaintext file that any appbuilder shell process could read.
#
# `--by` and `--reason` change every time, which is the only reason this is a
# script rather than a plain `systemctl start`: they are passed as unit
# properties, not as arguments to a shell the credential is visible in. Neither
# is secret, and the decision itself records both.
#
# It mints. It does not run the canary, does not enable the host switch, and
# loads no provider credential: authorising a call and making one are separate
# actions on purpose.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
REPO="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
CREDSTORE="${APP_BUILDER_CREDSTORE:-/etc/credstore.encrypted/app-builder}"
DECISION_CRED="${CREDSTORE}/APP_BUILDER_MODEL_DECISION_SECRET.cred"

BY=""
REASON=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --by) BY="${2:-}"; shift 2 ;;
    --reason) REASON="${2:-}"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: the decision credential is root-owned." >&2; exit 1; }
[[ -n "$BY" && -n "$REASON" ]] || {
  echo 'A decision records who authorised it and why:' >&2
  echo '  sudo bash ops/hetzner/authorise-model-canary.sh --by "your name" --reason "why"' >&2
  exit 1
}
[[ -f "$DECISION_CRED" ]] || {
  echo "No decision credential at ${DECISION_CRED}. Run: sudo bash ops/hetzner/install-model-canary-unit.sh" >&2
  exit 1
}

# A transient unit rather than the installed one, because the two arguments
# differ per invocation. It carries the same credential and the same identity,
# and like the installed unit it loads no provider key.
systemd-run \
  --unit=app-builder-model-authorise \
  --collect \
  --wait \
  --pipe \
  --property=Type=oneshot \
  --property=User="${RUNTIME_USER}" \
  --property=WorkingDirectory="${REPO}" \
  --property=Environment=HOME="/home/${RUNTIME_USER}" \
  --property=Environment=PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  --property=LoadCredentialEncrypted="APP_BUILDER_MODEL_DECISION_SECRET:${DECISION_CRED}" \
  --property=NoNewPrivileges=true \
  --property=ProtectHome=read-only \
  "/home/${RUNTIME_USER}/.local/bin/npm" run runtime:model-canary -- \
  --authorise --by "$BY" --reason "$REASON"
