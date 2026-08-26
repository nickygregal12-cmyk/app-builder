#!/usr/bin/env bash
set -uo pipefail

RUNTIME_ROOT="${APP_BUILDER_ROOT:-/srv/app-builder}"
FACTORY_UNIT="${APP_BUILDER_FACTORY_UNIT:-app-builder-factory.service}"
OPENCODE_UNIT="${APP_BUILDER_OPENCODE_UNIT:-app-builder-opencode.service}"
RUNTIME_SLICE="${APP_BUILDER_RUNTIME_SLICE:-app-builder-runtime.slice}"
FACTORY_URL="${APP_BUILDER_FACTORY_HEALTH_URL:-http://127.0.0.1:4310/health}"
OPENCODE_URL="${APP_BUILDER_OPENCODE_HEALTH_URL:-http://127.0.0.1:4097/global/health}"
OPENCODE_ENV="${APP_BUILDER_OPENCODE_ENV:-/etc/app-builder/opencode-server.env}"

section() {
  printf '\n=== %s ===\n' "$1"
}

warning() {
  printf 'WARN  %s\n' "$1"
}

info() {
  printf 'INFO  %s\n' "$1"
}

unit_value() {
  local unit="$1"
  local property="$2"
  systemctl show "$unit" --property="$property" --value 2>/dev/null || true
}

show_unit() {
  local unit="$1"
  if ! systemctl cat "$unit" >/dev/null 2>&1; then
    info "$unit is not installed"
    return
  fi

  systemctl show "$unit" --no-pager \
    -p ActiveState \
    -p SubState \
    -p Result \
    -p MainPID \
    -p NRestarts \
    -p MemoryCurrent \
    -p MemoryPeak \
    -p CPUUsageNSec \
    -p TasksCurrent \
    -p ExecMainStatus 2>/dev/null || true

  local restarts
  restarts="$(unit_value "$unit" NRestarts)"
  if [[ "$restarts" =~ ^[0-9]+$ ]] && (( restarts > 0 )); then
    warning "$unit has restarted $restarts time(s) since its current activation window"
  fi
}

health_code() {
  local url="$1"
  shift
  curl --max-time 5 --silent --show-error --output /dev/null --write-out '%{http_code}' "$@" "$url" 2>/dev/null || printf '000'
}

section "Observation"
printf 'timestamp=%s\n' "$(date --iso-8601=seconds)"
printf 'hostname=%s\n' "$(hostname)"
printf 'kernel=%s\n' "$(uname -srmo)"
printf 'uptime=%s\n' "$(uptime -p 2>/dev/null || true)"
printf 'load=%s\n' "$(awk '{print $1, $2, $3}' /proc/loadavg 2>/dev/null || true)"
printf 'cpus=%s\n' "$(nproc 2>/dev/null || true)"

section "Host memory"
free -h 2>/dev/null || true
if command -v swapon >/dev/null 2>&1; then
  swapon --show 2>/dev/null || true
fi

section "Filesystem capacity"
df -h / "$RUNTIME_ROOT" 2>/dev/null || df -h / 2>/dev/null || true
if [[ -d "$RUNTIME_ROOT" ]]; then
  used_percent="$(df -P "$RUNTIME_ROOT" 2>/dev/null | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
  if [[ "$used_percent" =~ ^[0-9]+$ ]] && (( used_percent >= 85 )); then
    warning "$RUNTIME_ROOT filesystem is ${used_percent}% full"
  fi
fi

section "App Builder storage"
for path in \
  "$RUNTIME_ROOT/repository" \
  "$RUNTIME_ROOT/runtime" \
  "$RUNTIME_ROOT/workspaces" \
  "$RUNTIME_ROOT/state" \
  "$RUNTIME_ROOT/checkpoints" \
  "$RUNTIME_ROOT/logs" \
  "$RUNTIME_ROOT/artifacts" \
  /home/appbuilder/.npm \
  /home/appbuilder/.cache; do
  if [[ -e "$path" ]]; then
    du -sh "$path" 2>/dev/null || true
  fi
done

section "Runtime slice"
if systemctl cat "$RUNTIME_SLICE" >/dev/null 2>&1; then
  systemctl show "$RUNTIME_SLICE" --no-pager \
    -p ActiveState \
    -p CPUUsageNSec \
    -p MemoryCurrent \
    -p MemoryPeak \
    -p MemoryHigh \
    -p MemoryMax \
    -p TasksCurrent \
    -p TasksMax 2>/dev/null || true
else
  info "$RUNTIME_SLICE is not installed"
fi

section "Factory service"
show_unit "$FACTORY_UNIT"

section "OpenCode service"
show_unit "$OPENCODE_UNIT"

section "Health"
factory_code="$(health_code "$FACTORY_URL")"
printf 'factory_http=%s\n' "$factory_code"
if [[ "$factory_code" != "200" ]]; then
  warning "Factory health did not return HTTP 200"
fi

if [[ -r "$OPENCODE_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$OPENCODE_ENV"
  set +a
  if [[ -n "${OPENCODE_SERVER_USERNAME:-}" && -n "${OPENCODE_SERVER_PASSWORD:-}" ]]; then
    opencode_code="$(health_code "$OPENCODE_URL" -u "${OPENCODE_SERVER_USERNAME}:${OPENCODE_SERVER_PASSWORD}")"
    printf 'opencode_authenticated_http=%s\n' "$opencode_code"
    if [[ "$opencode_code" != "200" ]]; then
      warning "Authenticated OpenCode health did not return HTTP 200"
    fi
    unset OPENCODE_SERVER_PASSWORD OPENCODE_SERVER_USERNAME
  else
    warning "$OPENCODE_ENV is readable but does not contain both OpenCode Basic Auth values"
  fi
else
  info "OpenCode authenticated health skipped; $OPENCODE_ENV is not readable by this user"
fi

opencode_unauthenticated_code="$(health_code "$OPENCODE_URL")"
printf 'opencode_unauthenticated_http=%s\n' "$opencode_unauthenticated_code"
if [[ "$opencode_unauthenticated_code" != "401" && "$opencode_unauthenticated_code" != "000" ]]; then
  warning "OpenCode unauthenticated health returned $opencode_unauthenticated_code instead of 401"
fi

section "Relevant listeners"
listeners="$(ss -H -ltnp 2>/dev/null | grep -E ':(4096|4097|4310|5173)\b' || true)"
if [[ -n "$listeners" ]]; then
  printf '%s\n' "$listeners"
else
  info "No listeners found on 4096/4097/4310/5173"
fi
if printf '%s\n' "$listeners" | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\[::\]|\*):(4097|4310|5173)\b'; then
  warning "An App Builder port is bound publicly; expected loopback-only"
fi

section "Journal footprint"
journalctl --disk-usage 2>/dev/null || true
for unit in "$FACTORY_UNIT" "$OPENCODE_UNIT"; do
  if systemctl cat "$unit" >/dev/null 2>&1; then
    bytes="$(journalctl -u "$unit" --since '24 hours ago' --no-pager 2>/dev/null | wc -c | awk '{print $1}')"
    printf '%s_rendered_log_bytes_24h=%s\n' "$unit" "$bytes"
  fi
done

section "Host failures"
failed_units="$(systemctl --failed --no-legend 2>/dev/null | awk 'NF {count++} END {print count+0}')"
printf 'failed_system_units=%s\n' "$failed_units"
if [[ "$failed_units" =~ ^[0-9]+$ ]] && (( failed_units > 0 )); then
  warning "$failed_units system unit(s) are failed; inspect before increasing App Builder load"
fi

section "Interpretation"
cat <<'EOF'
This command is observation-only. It does not restart, enable, disable, install,
remove, chmod, chown, or otherwise mutate the host.

Useful soak signals:
- NRestarts should remain 0 during ordinary idle/light use.
- Factory and authenticated OpenCode health should remain HTTP 200.
- OpenCode unauthenticated health should remain HTTP 401.
- App Builder listeners should remain on loopback only.
- Watch app-builder-runtime.slice MemoryCurrent/MemoryPeak and CPUUsageNSec across runs.
- Investigate sustained disk use >=85%, unexpected journal/cache/workspace growth,
  host failed units, or Predictor performance degradation before adding workers.

A separate VM is an evidence-driven fallback, not the default. Consider one only
when the bounded shared-host runtime repeatedly causes resource contention or a
machine-level security/operations boundary becomes necessary.
EOF
