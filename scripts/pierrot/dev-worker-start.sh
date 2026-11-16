#!/usr/bin/env bash
# Start the Pierrot Dev Workbench supervisor as a detached background process.
#
# Safe to call on every Codespace start/attach: it exits 0 when the supervisor
# is already running. Configuration failures are reported in the boot log and
# returned as a non-zero exit so the Codespace lifecycle does not silently hide
# a broken worker.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
SUPERVISOR_PID_FILE="$WORK_ROOT/supervisor.pid"
WORKER_PID_FILE="$WORK_ROOT/worker.pid"
LOG_DIR="$WORK_ROOT/logs"
BOOT_LOG="$LOG_DIR/worker-boot.log"

mkdir -p "$LOG_DIR" || exit 1

boot() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [dev-worker] $*"
  echo "$line"
  echo "$line" >> "$BOOT_LOG" 2>/dev/null || true
}

is_our_supervisor() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -q "dev-worker-supervisor.sh"
}

if [ -f "$SUPERVISOR_PID_FILE" ]; then
  PID="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
  if is_our_supervisor "${PID:-}"; then
    boot "supervisor already running (pid $PID)"
    exit 0
  fi
  rm -f "$SUPERVISOR_PID_FILE"
fi

if [ -f "$WORKER_PID_FILE" ]; then
  PID="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null && \
     ps -p "$PID" -o args= 2>/dev/null | grep -q "dev-worker.mjs"; then
    boot "worker already running without a supervisor (pid $PID); leaving it untouched"
    exit 0
  fi
  rm -f "$WORKER_PID_FILE"
fi

if [ -z "${PIERROT_DEV_WORKER_TOKEN:-}" ] || [ "${#PIERROT_DEV_WORKER_TOKEN}" -lt 32 ]; then
  boot "PIERROT_DEV_WORKER_TOKEN is missing or too short; worker not started."
  exit 1
fi

if [ -z "${PIERROT_DEV_API_URL:-}" ] && [ -z "${NEXT_PUBLIC_BASE_URL:-}" ]; then
  boot "PIERROT_DEV_API_URL is not set; worker not started."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  boot "node is not available; worker not started."
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  boot "openCode CLI is not on PATH. The worker will report not-ready instead of claiming tasks."
fi

cd "$ROOT" || exit 1
rm -f "$WORK_ROOT/stopping"

rm -f "$SUPERVISOR_PID_FILE"
if command -v setsid >/dev/null 2>&1; then
  setsid --fork bash "$ROOT/scripts/pierrot/dev-worker-supervisor.sh" >> "$BOOT_LOG" 2>&1 < /dev/null &
else
  nohup bash "$ROOT/scripts/pierrot/dev-worker-supervisor.sh" >> "$BOOT_LOG" 2>&1 < /dev/null &
fi

# The supervisor records its own PID. Confirm it survived the lifecycle command
# and was not killed together with the short-lived parent shell.
for _ in $(seq 1 20); do
  SUPERVISOR_PID="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
  if is_our_supervisor "${SUPERVISOR_PID:-}"; then
    boot "supervisor started (pid $SUPERVISOR_PID)"
    exit 0
  fi
  sleep 0.25
done

rm -f "$SUPERVISOR_PID_FILE"
boot "supervisor failed to stay alive; see $BOOT_LOG"
exit 1
