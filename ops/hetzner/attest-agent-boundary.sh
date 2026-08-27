#!/usr/bin/env bash
#
# Persist the hosted agent-boundary proof for fail-closed runtime preflight.
#
#   sudo bash ops/hetzner/attest-agent-boundary.sh
#
# The verifier remains read-only. This wrapper is the only persistence step:
# it removes any previous attestation before revalidation, captures the exact
# task-image digest it expects the verifier to prove, requires the verifier's
# success result to name that exact pinned image, and only then writes
# /etc/app-builder/agent-boundary.json.
#
# If the verifier fails, aborts, proves another image, or the repository changes
# the image digest during the proof, no attestation survives. A stale or
# mismatched proof cannot therefore keep a later model-canary preflight green.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
REPOSITORY="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
IMAGE_ID="${APP_BUILDER_TASK_IMAGE_ID:-task-baseline}"
FACTORY_PORT="${APP_BUILDER_SERVICE_PORT:-4310}"
ATTESTATION="${APP_BUILDER_BOUNDARY_ATTESTATION_FILE:-/etc/app-builder/agent-boundary.json}"
MAX_AGE_DAYS="${APP_BUILDER_BOUNDARY_ATTESTATION_DAYS:-30}"
VERIFIER="${REPOSITORY}/ops/hetzner/verify-agent-boundary.sh"
MANIFEST="${REPOSITORY}/config/task-images.json"

[[ -r "$MANIFEST" ]] || { printf 'FAIL  cannot read %s\n' "$MANIFEST" >&2; exit 1; }
[[ -r "$VERIFIER" ]] || { printf 'FAIL  cannot read %s\n' "$VERIFIER" >&2; exit 1; }
[[ "$MAX_AGE_DAYS" =~ ^[1-9][0-9]*$ ]] || { printf 'FAIL  APP_BUILDER_BOUNDARY_ATTESTATION_DAYS must be a positive integer\n' >&2; exit 1; }

image_reference="$(jq -r --arg id "$IMAGE_ID" '.images[$id].reference // ""' "$MANIFEST")"
image_digest="$(jq -r --arg id "$IMAGE_ID" '.images[$id].digest // ""' "$MANIFEST")"
if [[ -z "$image_reference" || ! "$image_digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  printf 'FAIL  %s is not a digest-pinned task image in %s\n' "$IMAGE_ID" "$MANIFEST" >&2
  exit 1
fi
pinned_image="${image_reference}@${image_digest}"

# Invalidate old evidence before attempting a new proof. If anything below
# fails, the absence of this file is what makes the runtime preflight fail
# closed rather than trusting yesterday's result.
rm -f "$ATTESTATION"

printf '== App Builder agent boundary attestation ==\n'
printf 'expected image: %s\n' "$pinned_image"
printf 'attestation: %s\n\n' "$ATTESTATION"

proof_output="$(mktemp)"
trap 'rm -f "$proof_output"' EXIT

APP_BUILDER_RUNTIME_USER="$RUNTIME_USER" \
APP_BUILDER_REPOSITORY="$REPOSITORY" \
APP_BUILDER_SERVICE_PORT="$FACTORY_PORT" \
APP_BUILDER_TASK_IMAGE_ID="$IMAGE_ID" \
APP_BUILDER_EXPECTED_TASK_IMAGE_DIGEST="$image_digest" \
  bash "$VERIFIER" | tee "$proof_output"

# A zero exit is not sufficient evidence: the verifier must explicitly report
# the same immutable image identity the attester intends to persist. This would
# have refused the historical Alpine-probe false attestation even though that
# generic isolation probe itself passed.
proved_image="$(sed -n 's/^Agent boundary acceptance passed for exact image \(.*\)\.$/\1/p' "$proof_output" | tail -n 1)"
if [[ "$proved_image" != "$pinned_image" ]]; then
  printf 'FAIL  verifier did not attest the expected pinned image.\n' >&2
  printf '      expected: %s\n' "$pinned_image" >&2
  printf '      proved:   %s\n' "${proved_image:-none}" >&2
  printf '      No attestation was written.\n' >&2
  exit 1
fi

# Defend the tiny check/write gap. The verifier was bound to image_digest via
# APP_BUILDER_EXPECTED_TASK_IMAGE_DIGEST; if the checked-in authority moved
# while it ran, refuse to record the earlier proof under the new state.
current_digest="$(jq -r --arg id "$IMAGE_ID" '.images[$id].digest // ""' "$MANIFEST")"
if [[ "$current_digest" != "$image_digest" ]]; then
  printf 'FAIL  %s changed from %s to %s while the hosted proof was running.\n' "$IMAGE_ID" "$image_digest" "$current_digest" >&2
  printf '      No attestation was written; rerun against the new repository state.\n' >&2
  exit 1
fi

# Read repository provenance as the account that owns the checkout. Running Git
# as root would trigger the correct dubious-ownership refusal; do not weaken
# Git's safe.directory protection just to fill this field.
if ! repository_commit="$(runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" git -C "$REPOSITORY" rev-parse HEAD 2>/dev/null)" \
  || [[ ! "$repository_commit" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'FAIL  cannot determine repository commit as runtime owner %s; no attestation was written.\n' "$RUNTIME_USER" >&2
  exit 1
fi
verified_at="$(date -Is)"

install -d -m 0755 "$(dirname "$ATTESTATION")"
cat > "$ATTESTATION" <<JSON
{
  "schemaVersion": 1,
  "result": "passed",
  "imageId": "${IMAGE_ID}",
  "imageReference": "${image_reference}",
  "imageDigest": "${image_digest}",
  "pinnedImage": "${pinned_image}",
  "host": "$(hostname)",
  "verifiedAt": "${verified_at}",
  "maxAgeDays": ${MAX_AGE_DAYS},
  "factoryPort": ${FACTORY_PORT},
  "runtimeUser": "${RUNTIME_USER}",
  "repositoryCommit": "${repository_commit}",
  "verifier": "ops/hetzner/verify-agent-boundary.sh",
  "attester": "ops/hetzner/attest-agent-boundary.sh",
  "note": "Written only after the exact digest-pinned task image passes the hosted boundary verifier and the verifier reports that exact pinned image back to this wrapper. Re-running this command invalidates old evidence before proving the current image."
}
JSON
chmod 0644 "$ATTESTATION"

printf '\nAgent boundary attestation written to %s.\n' "$ATTESTATION"
printf 'image digest: %s\n' "$image_digest"
printf 'repository commit: %s\n' "$repository_commit"
printf 'valid for: %s days\n' "$MAX_AGE_DAYS"
