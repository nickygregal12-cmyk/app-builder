#!/usr/bin/env bash
set -euo pipefail

# Read-only preflight for installing App Builder beside an existing workload.
# This script intentionally makes no changes to users, packages, services,
# firewall rules, files, cgroups, ports, or repositories.

OPENCODE_PORT="${APP_BUILDER_OPENCODE_PORT:-4097}"

printf 'App Builder existing-host preflight\n'
printf '==================================\n\n'

failures=0
warnings=0

ok()   { printf 'OK    %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  printf 'OS: %s\n' "${PRETTY_NAME:-unknown}"
else
  warn '/etc/os-release is unavailable'
fi

printf 'Kernel: %s\n' "$(uname -sr)"
printf 'Architecture: %s\n' "$(uname -m)"
printf 'Hostname: %s\n' "$(hostname)"
printf '\n'

if command -v systemctl >/dev/null 2>&1; then
  ok 'systemd available'
else
  fail 'systemd is required by the co-location installer'
fi

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64)
    ok 'x64 architecture supported'
    ;;
  aarch64|arm64)
    ok 'arm64 architecture supported'
    ;;
  *)
    fail "unsupported architecture: $arch"
    ;;
esac

cpus="$(nproc 2>/dev/null || echo 0)"
mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
mem_mb=$((mem_kb / 1024))
disk_line="$(df -hP /srv 2>/dev/null | awk 'NR==2 {print $2" total, "$4" free"}' || true)"
[[ -n "$disk_line" ]] || disk_line="$(df -hP / 2>/dev/null | awk 'NR==2 {print $2" total, "$4" free"}' || echo 'unknown')"

printf '\nCapacity\n--------\n'
printf 'Logical CPUs: %s\n' "$cpus"
printf 'RAM: %s MiB\n' "$mem_mb"
printf 'Disk: %s\n' "$disk_line"

if (( cpus < 2 )); then
  warn 'fewer than 2 logical CPUs; builds/browser tests may contend heavily with the existing workload'
else
  ok 'at least 2 logical CPUs available'
fi

if (( mem_mb < 4096 )); then
  warn 'less than 4 GiB RAM; do not enable concurrent App Builder workers on this host'
elif (( mem_mb < 8192 )); then
  ok '4-8 GiB RAM: suitable for a conservative single-worker bootstrap'
else
  ok '8+ GiB RAM: suitable for bootstrap with measured concurrency later'
fi

printf '\nCollision checks\n----------------\n'
if id appbuilder >/dev/null 2>&1; then
  if [[ -f /etc/app-builder-host.json ]]; then
    ok 'appbuilder user already exists with App Builder host marker'
  else
    fail 'an appbuilder user already exists but this host is not marked as App Builder-managed'
  fi
else
  ok 'appbuilder user name is available'
fi

if [[ -e /srv/app-builder && ! -f /etc/app-builder-host.json ]]; then
  fail '/srv/app-builder already exists without an App Builder host marker'
else
  ok '/srv/app-builder path is available or already App Builder-managed'
fi

if systemctl list-unit-files --no-legend 2>/dev/null | awk '{print $1}' | grep -qx 'app-builder-runtime.slice'; then
  if [[ -f /etc/app-builder-host.json ]]; then
    ok 'App Builder resource slice already installed'
  else
    fail 'app-builder-runtime.slice exists without an App Builder host marker'
  fi
else
  ok 'App Builder resource slice name is available'
fi

printf '\nNetwork observation (read-only)\n-------------------------------\n'
for port in 4310 5173 "$OPENCODE_PORT"; do
  if ss -H -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then
    warn "port $port is already listening; inspect ownership before installing/running App Builder"
  else
    ok "port $port is currently unused"
  fi
done
printf 'Planned App Builder OpenCode port: %s (override with APP_BUILDER_OPENCODE_PORT)\n' "$OPENCODE_PORT"

printf '\nExisting workload snapshot\n--------------------------\n'
if command -v systemctl >/dev/null 2>&1; then
  running_count="$(systemctl --type=service --state=running --no-legend 2>/dev/null | wc -l | tr -d ' ')"
  printf 'Running system services: %s\n' "$running_count"
fi

if command -v podman >/dev/null 2>&1; then
  printf 'Podman already installed: yes\n'
else
  printf 'Podman already installed: no (installer will add it)\n'
fi

if command -v docker >/dev/null 2>&1; then
  printf 'Docker present: yes (left untouched)\n'
else
  printf 'Docker present: no\n'
fi

if command -v node >/dev/null 2>&1; then
  printf 'Global Node: %s (left untouched)\n' "$(node --version 2>/dev/null || echo unknown)"
else
  printf 'Global Node: not installed (App Builder still installs its own isolated Node)\n'
fi

if [[ -r /etc/subuid ]]; then
  printf 'Existing subordinate UID allocations: %s\n' "$(grep -c '^[^:][^:]*:[0-9]' /etc/subuid 2>/dev/null || echo 0)"
fi
if [[ -r /etc/subgid ]]; then
  printf 'Existing subordinate GID allocations: %s\n' "$(grep -c '^[^:][^:]*:[0-9]' /etc/subgid 2>/dev/null || echo 0)"
fi
printf 'App Builder will allocate a non-overlapping subordinate-ID range after existing ranges if useradd does not allocate one automatically.\n'

printf '\nRecommended initial App Builder limits\n--------------------------------------\n'
if (( cpus <= 2 )); then
  recommended_cpu='75%'
elif (( cpus <= 4 )); then
  recommended_cpu='125%'
else
  recommended_cpu='150%'
fi

if (( mem_mb < 4096 )); then
  recommended_high='15%'
  recommended_max='25%'
elif (( mem_mb < 8192 )); then
  recommended_high='20%'
  recommended_max='30%'
else
  recommended_high='25%'
  recommended_max='35%'
fi

printf 'APP_BUILDER_CPU_QUOTA=%s\n' "$recommended_cpu"
printf 'APP_BUILDER_MEMORY_HIGH=%s\n' "$recommended_high"
printf 'APP_BUILDER_MEMORY_MAX=%s\n' "$recommended_max"
printf 'These are starting limits only; benchmark before raising concurrency.\n'

printf '\nSummary\n-------\n'
printf 'Failures: %d\n' "$failures"
printf 'Warnings: %d\n' "$warnings"

if (( failures > 0 )); then
  printf '\nPreflight FAILED. Do not run install-existing-host.sh until the failures are understood.\n' >&2
  exit 1
fi

printf '\nPreflight passed. Warnings are advisory and should be reviewed before installation.\n'
