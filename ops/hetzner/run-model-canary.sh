#!/usr/bin/env bash
#
# Claim the one-time decision, then run the canary once.
#
#   sudo bash ops/hetzner/run-model-canary.sh
#
# Why this exists rather than a bare `systemctl start`.
#
# "Single use" was previously enforced by a `Set` inside the gateway process.
# The canary unit is `Type=oneshot`, so every start got an empty set while the
# signed decision sat at a stable path — which made one authorisation good for
# as many provider calls as somebody was willing to restart the unit, for as
# long as its TTL lasted. That is a standing permission, not a decision.
#
# The obvious fix — let the unit load the decision and have a privileged
# `ExecStartPre` delete the source — does not work, and this was measured rather
# than assumed. systemd sets credentials up per `ExecStart*` invocation, not
# once at activation: removing the source in `ExecStartPre` makes the main
# `ExecStart` fail with 243/CREDENTIALS. There is no snapshot to outlive the
# source.
#
# So the claim happens here, in root's hands, before the unit starts:
#
#   rename(authoritative -> run-scoped claim)     <- atomic, durable, one winner
#   systemctl start app-builder-model-canary      <- loads the claimed copy
#   rm claim                                      <- on every exit path
#
# `rename(2)` is the whole mechanism. It is atomic, so two concurrent claims
# cannot both succeed; and once it has happened the authoritative name no longer
# exists, so a second run has nothing to claim — whatever happens next. The
# decision is therefore spent *before* any provider call, which is the
# fail-secure direction: a crash between claim and request wastes an
# authorisation, whereas the reverse would hand out a second call after a
# successful one.
#
# The unit's LoadCredential points at the run-scoped claim, not at the
# authoritative path. A direct `systemctl start app-builder-model-canary.service`
# without a claim therefore fails 243/CREDENTIALS rather than quietly reusing a
# decision.
#
# This does not enable anything. Both halves of the kill switch are still
# checked by the preflight inside the attempt, and the host half is the owner's.
set -euo pipefail

ETC_DIR=/etc/app-builder
DECISION="${APP_BUILDER_MODEL_DECISION_FILE:-${ETC_DIR}/model-enable-decision.json}"
CLAIM_DIR=/run/app-builder-model-canary
CLAIM="${CLAIM_DIR}/claimed.json"
UNIT=app-builder-model-canary.service

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: the decision is root-owned." >&2; exit 1; }
[[ -f "$DECISION" ]] || {
  echo "No authorised decision at ${DECISION}." >&2
  echo "Mint one first: sudo bash ops/hetzner/authorise-model-canary.sh --by \"you\" --reason \"why\"" >&2
  exit 1
}

# The claim directory is root-only. The runtime user reaches the decision solely
# through the credential systemd hands the unit, never through this path.
install -d -m 0700 -o root -g root "$CLAIM_DIR"

# Remove the claim on every exit. The authoritative decision is already gone by
# then: this only stops a spent decision lingering where the next run could see
# it.
cleanup() { rm -f "$CLAIM"; }
trap cleanup EXIT

# The claim itself. `mv -n` refuses to clobber, so a leftover claim from an
# interrupted run is reported rather than silently overwritten.
mv -n "$DECISION" "$CLAIM"
[[ -f "$CLAIM" && ! -e "$DECISION" ]] || {
  echo "Refusing to run: ${CLAIM} already existed, so a previous run may not have finished." >&2
  echo "Inspect it, remove it deliberately, and mint a fresh decision." >&2
  exit 1
}

printf 'Claimed the decision. It is now spent: %s no longer exists.\n' "$DECISION"
printf 'A second run needs a newly authorised decision, whatever happens next.\n'

# One attempt. The unit is oneshot and Restart=no, so this returns when it is
# done. Its exit status is the canary's.
systemctl start "$UNIT"
