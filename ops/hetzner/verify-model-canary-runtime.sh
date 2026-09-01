#!/usr/bin/env bash
#
# Prove the canary unit's hardening can actually run a task sandbox.
#
#   sudo bash ops/hetzner/verify-model-canary-runtime.sh
#
# This exists because a source-string test cannot catch the failure it is named
# after. The canary unit carried `ProtectHome=read-only`, which remounts /home
# *and* /run/user read-only — and rootless Podman writes both: its image store
# lives under the runtime user's home, and it chmods
# $XDG_RUNTIME_DIR/libpod on startup. So the unit failed with
#
#   set sticky bit on: chmod /run/user/<uid>/libpod: read-only file system
#
# before it ever reached a provider call, while the same Podman command worked
# perfectly for the same user outside systemd. Every static assertion about the
# unit file passed throughout.
#
# So this runs the real thing: a transient unit carrying the same hardening the
# installer writes, executing the same Podman operations a real attempt needs.
# It makes no provider call and loads no provider credential — it proves the
# sandbox can start, not that a model can be reached.
#
# It also deliberately does NOT run `podman system migrate`. That was only ever
# needed to clean up after experimental probing; a verifier that has to reset
# the container runtime before every check is measuring its own reset.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
REPO="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
MANIFEST="${REPO}/config/task-images.json"

[[ $EUID -eq 0 ]] || { echo "Run this with sudo: it starts a transient unit as ${RUNTIME_USER}." >&2; exit 1; }
id -u "$RUNTIME_USER" >/dev/null 2>&1 || { echo "Runtime user ${RUNTIME_USER} does not exist." >&2; exit 1; }
[[ -r "$MANIFEST" ]] || { echo "Cannot read ${MANIFEST}." >&2; exit 1; }

RUNTIME_UID="$(id -u "$RUNTIME_USER")"
RUNTIME_HOME="$(getent passwd "$RUNTIME_USER" | cut -d: -f6)"
PODMAN_GRAPH_ROOT="${RUNTIME_HOME}/.local/share/containers"
PODMAN_RUNTIME_ROOT="/run/user/${RUNTIME_UID}"

# The digest the repository pins. The point of the check is that the host runs
# this exact image, so it is read from the manifest rather than typed here.
EXPECTED_DIGEST="$(python3 -c "
import json,sys
images = json.load(open('${MANIFEST}'))['images']
image = images['task-baseline']
print(image['digest'] or '')
")"
REFERENCE="$(python3 -c "
import json
image = json.load(open('${MANIFEST}'))['images']['task-baseline']
print(f\"{image['reference']}:{image['tag']}\")
")"
[[ -n "$EXPECTED_DIGEST" ]] || { echo "task-baseline has no pinned digest; build and record it first." >&2; exit 1; }

echo "Verifying ${REFERENCE} under the canary unit's hardening as ${RUNTIME_USER} (uid ${RUNTIME_UID})."
echo "No provider credential is loaded and no provider call is made."

# Exactly the hardening install-model-canary-unit.sh writes, including the two
# narrow exceptions. If the installer's contract changes, this must change with
# it — which is the point: the proof and the production unit share one shape.
run_hardened() {
  systemd-run \
    --unit="app-builder-canary-runtime-check-$1" \
    --collect --wait --pipe --quiet \
    --property=Type=oneshot \
    --property=User="${RUNTIME_USER}" \
    --property=Group="${RUNTIME_USER}" \
    --property=Environment=HOME="${RUNTIME_HOME}" \
    --property=Environment=XDG_RUNTIME_DIR="${PODMAN_RUNTIME_ROOT}" \
    --property=Environment=PATH="${RUNTIME_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin" \
    --property=Slice=app-builder-runtime.slice \
    --property=UMask=0077 \
    --property=NoNewPrivileges=true \
    --property=PrivateTmp=true \
    --property=ProtectHome=read-only \
    --property=ReadWritePaths="${PODMAN_GRAPH_ROOT}" \
    --property=ReadWritePaths="${PODMAN_RUNTIME_ROOT}" \
    --property=ProtectKernelTunables=true \
    --property=ProtectKernelModules=true \
    --property=ProtectControlGroups=true \
    --property=RestrictSUIDSGID=true \
    --property=LockPersonality=true \
    "${@:2}"
}

failures=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

# 1 + 2. The image is present and is the exact reviewed one. A digest that
# merely resolves is not enough; a host running some other build of the same tag
# is the thing the pin exists to catch.
if digest="$(run_hardened inspect /usr/bin/podman image inspect "$REFERENCE" --format '{{.Digest}}' 2>/dev/null)"; then
  digest="$(printf '%s' "$digest" | tr -d '[:space:]')"
  if [[ "$digest" == "$EXPECTED_DIGEST" ]]; then
    pass "pinned image present and digest matches config/task-images.json"
  else
    fail "host image digest ${digest} is not the pinned ${EXPECTED_DIGEST}"
  fi
else
  fail "podman could not inspect ${REFERENCE} under the canary hardening (this is the ProtectHome failure mode)"
fi

# 3-7. Interrogating Podman metadata is not the same as launching a sandbox,
# and the original failure would have been caught by either — but a real attempt
# needs the second. `--pull=never` keeps this offline; `--network=none` is the
# canary role's actual profile; `--rm` proves cleanup.
if run_hardened container /usr/bin/podman run --rm --pull=never --network=none "$REFERENCE" /bin/true >/dev/null 2>&1; then
  pass "a network-none container started, exited and was removed"
else
  fail "the pinned image could not run a container under the canary hardening"
fi

if [[ $failures -eq 0 ]]; then
  printf '\nThe canary unit hardening can run the task sandbox. No provider call was made.\n'
  exit 0
fi
printf '\n%s check(s) failed. Do not run the model canary until this passes.\n' "$failures" >&2
exit 1
