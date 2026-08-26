#!/usr/bin/env bash
#
# Build the pinned App Builder task sandbox image.
#
#   sudo bash ops/hetzner/build-task-image.sh
#
# It builds as the isolated runtime user, never as root, and it prints the
# content digest of what it produced together with the exact edit to make in
# config/task-images.json. Recording the digest is a reviewed change on purpose:
# repointing a tag underneath a proven boundary is precisely the thing the
# digest pin exists to prevent.
#
# It changes nothing outside the runtime user's own image store, starts no
# service and enables nothing.
set -euo pipefail

RUNTIME_USER="${APP_BUILDER_RUNTIME_USER:-appbuilder}"
RUNTIME_PATH="/home/${RUNTIME_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin"
REPOSITORY="${APP_BUILDER_REPOSITORY:-/srv/app-builder/repository}"
IMAGE_ID="${APP_BUILDER_TASK_IMAGE_ID:-task-baseline}"

as_runtime() {
  ( cd /tmp && runuser -u "$RUNTIME_USER" -- env HOME="/home/${RUNTIME_USER}" PATH="$RUNTIME_PATH" XDG_RUNTIME_DIR="/run/user/$(id -u "$RUNTIME_USER")" "$@" )
}

printf '== App Builder task image build ==\n'
printf 'host: %s\ndate: %s\n\n' "$(hostname)" "$(date -Is)"

if ! as_runtime podman --version >/dev/null 2>&1; then
  printf 'FAIL  rootless podman is not callable as %s\n' "$RUNTIME_USER" >&2
  exit 1
fi

manifest="${REPOSITORY}/config/task-images.json"
[[ -r "$manifest" ]] || { printf 'FAIL  cannot read %s\n' "$manifest" >&2; exit 1; }

reference="$(jq -r --arg id "$IMAGE_ID" '.images[$id].reference' "$manifest")"
tag="$(jq -r --arg id "$IMAGE_ID" '.images[$id].tag' "$manifest")"
containerfile="${REPOSITORY}/$(jq -r --arg id "$IMAGE_ID" '.images[$id].containerfile' "$manifest")"
recorded="$(jq -r --arg id "$IMAGE_ID" '.images[$id].digest // ""' "$manifest")"
base_digest="$(jq -r --arg id "$IMAGE_ID" '.images[$id].base.digest // ""' "$manifest")"

[[ "$reference" != "null" && -n "$reference" ]] || { printf 'FAIL  no image %s declared in %s\n' "$IMAGE_ID" "$manifest" >&2; exit 1; }
[[ -r "$containerfile" ]] || { printf 'FAIL  cannot read %s\n' "$containerfile" >&2; exit 1; }

# The Containerfile and the manifest must agree about the base. Two places that
# can disagree about what an image is built from is how a pinned image quietly
# stops being the image that was reviewed.
if [[ -n "$base_digest" ]] && ! grep -q "$base_digest" "$containerfile"; then
  printf 'FAIL  %s does not pin the base digest recorded in config/task-images.json (%s)\n' "$containerfile" "$base_digest" >&2
  exit 1
fi
if grep -Eq '^FROM[^@]*$' "$containerfile"; then
  printf 'FAIL  %s has a FROM without a digest. A floating base makes the built digest meaningless.\n' "$containerfile" >&2
  exit 1
fi

printf 'INFO  building %s:%s from %s\n' "$reference" "$tag" "$containerfile"
as_runtime podman build --pull=always --squash-all --file "$containerfile" --tag "${reference}:${tag}" "$(dirname "$containerfile")"

digest="$(as_runtime podman image inspect "${reference}:${tag}" --format '{{.Digest}}' 2>/dev/null || true)"
if [[ -z "$digest" || "$digest" != sha256:* ]]; then
  # A locally built image has no registry digest until it is stored with one.
  # The image ID is content-addressed and is what --squash-all makes stable, so
  # fall back to it rather than recording nothing.
  digest="$(as_runtime podman image inspect "${reference}:${tag}" --format '{{.Id}}')"
  [[ "$digest" == sha256:* ]] || digest="sha256:${digest}"
fi

printf '\nPASS  built %s:%s\n' "$reference" "$tag"
printf 'INFO  content digest: %s\n' "$digest"

# --- The boundary the image itself must satisfy -----------------------------
failures=0
check() { if eval "$2"; then printf 'PASS  %s\n' "$1"; else printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); fi; }

pinned="${reference}@${digest}"
check "the image runs as a non-root user" \
  '[[ "$(as_runtime podman run --rm --network=none "$pinned" id -u)" == "1000" ]]'
check "the image carries no container or podman client" \
  '! as_runtime podman run --rm --network=none "$pinned" sh -c "command -v podman || command -v docker" >/dev/null 2>&1'
check "the image carries no privilege-escalation helper" \
  '! as_runtime podman run --rm --network=none "$pinned" sh -c "command -v sudo || command -v su" >/dev/null 2>&1'
check "the image carries no setuid binary" \
  '[[ -z "$(as_runtime podman run --rm --network=none "$pinned" sh -c "find / -xdev -perm /6000 -type f 2>/dev/null" | head -n 1)" ]]'
check "the image starts with a read-only root filesystem" \
  'as_runtime podman run --rm --network=none --read-only --tmpfs=/tmp:rw,noexec,nosuid,nodev "$pinned" node --version >/dev/null'
check "the workspace is writable when mounted" \
  'as_runtime podman run --rm --network=none --read-only --tmpfs=/tmp:rw --tmpfs=/workspace:rw "$pinned" sh -c "printf x > /workspace/probe" >/dev/null'

printf '\n'
if (( failures > 0 )); then
  printf 'Task image build FAILED %d image-boundary check(s). Do not record this digest.\n' "$failures" >&2
  exit 1
fi

if [[ "$recorded" == "$digest" ]]; then
  printf 'The recorded digest already matches. config/task-images.json needs no change.\n'
  exit 0
fi

printf 'Record this digest in config/task-images.json as a reviewed change:\n\n'
printf '    .images["%s"].digest = "%s"\n\n' "$IMAGE_ID" "$digest"
printf 'Until it is recorded, every attempt naming %s fails closed with this command.\n' "$IMAGE_ID"
