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
#   rename(authoritative -> claim)                <- atomic, durable, one winner
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
# That atomicity is conditional, and an earlier version of this script quietly
# lost it. The claim was `mv` from /etc to /run — different filesystems, ext4
# and tmpfs — where rename(2) fails EXDEV and `mv` falls back to copy-then-
# unlink while still reporting success. Interrupting that left the decision in
# both places: not spent, therefore replayable. So the claim now lives beside
# the authority on the same filesystem, and claim-model-decision.py refuses a
# cross-device claim rather than working around it.
#
# The unit's LoadCredential points at the claim, not at the authoritative path. A direct `systemctl start app-builder-model-canary.service`
# without a claim therefore fails 243/CREDENTIALS rather than quietly reusing a
# decision.
#
# This does not enable anything. Both halves of the kill switch are still
# checked by the preflight inside the attempt, and the host half is the owner's.
set -euo pipefail

ETC_DIR=/etc/app-builder
DECISION="${APP_BUILDER_MODEL_DECISION_FILE:-${ETC_DIR}/model-enable-decision.json}"
# The claim sits beside the authoritative decision, in the same root-owned
# directory on the same filesystem. That is not incidental: rename(2) is only
# atomic within a filesystem, and /run is tmpfs while /etc is not. A claim in
# /run also disappears on reboot, which would turn "spent" back into "available".
CLAIM="${APP_BUILDER_MODEL_CLAIM_FILE:-${ETC_DIR}/model-enable-decision.claimed.json}"
CLAIMER="$(dirname "$(readlink -f "$0")")/claim-model-decision.py"
UNIT=app-builder-model-canary.service

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: the decision is root-owned." >&2; exit 1; }
[[ -f "$DECISION" ]] || {
  echo "No authorised decision at ${DECISION}." >&2
  echo "Mint one first: sudo bash ops/hetzner/authorise-model-canary.sh --by \"you\" --reason \"why\"" >&2
  exit 1
}

# Remove the claim on every exit. The authoritative decision is already gone by
# then: this only stops a spent decision lingering where the next run could see
# it.
cleanup() { rm -f "$CLAIM"; }
trap cleanup EXIT

# The claim itself: one atomic rename, or nothing. Deliberately not `mv`, which
# falls back to copy-then-unlink across a filesystem boundary and reports
# success — leaving the decision present in both places and therefore unspent.
python3 "${CLAIMER}" --source "$DECISION" --destination "$CLAIM"

printf 'Claimed the decision. It is now spent: %s no longer exists.\n' "$DECISION"
printf 'A second run needs a newly authorised decision, whatever happens next.\n'

# One attempt. The unit is oneshot and Restart=no, so this returns when it is
# done. Its exit status is the canary's.
systemctl start "$UNIT"
