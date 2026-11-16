#!/usr/bin/env bash
# Start the Pierrot Dev Workbench supervisor as a detached background process.
#
# Safe to call on every Codespace start/attach. A filesystem lock serializes
# concurrent postStart/postAttach invocations, PID files are validated against
# the expected command line, and an orphaned worker is adopted by a supervisor
# instead of leaving it unsupervised or starting a duplicate.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
SUPERVISOR_PID_FILE="$WORK_ROOT/supervisor.pid"
WORKER_PID_FILE="$WORK_ROOT/worker.pid"
LOG_DIR="$WORK_ROOT/logs"
BOOT_LOG="$LOG_DIR/worker-boot.log"
START_LOCK="$WORK_ROOT/start.lock"

mkdir -p "$LOG_DIR" || exit 1

boot() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [dev-worker-start] $*"
  echo "$line"
  echo "$line" >> "$BOOT_LOG" 2>/dev/null || true
}

# Serialize postStart and postAttach. Both hooks can fire at the same time.
# flock is available in Codespaces; the mkdir fallback keeps the script safe on
# minimal images without util-linux.
acquire_start_lock() {
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$START_LOCK"
    flock -w 30 9 || return 1
    return 0
  fi
  local lock_dir="$START_LOCK.d"
  local i
  for i in $(seq 1 300); do
    if mkdir "$lock_dir" 2>/dev/null; then
      trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT
      return 0
    fi
    sleep 0.1
  done
  return 1
}

is_our_supervisor() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -Fq "$ROOT/scripts/pierrot/dev-worker-supervisor.sh"
}

is_our_worker() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -Fq "dev-worker.mjs"
}

# Atomic PID file write is implemented by the supervisor; the start script only
# validates PIDs and never writes one itself.

if ! acquire_start_lock; then
  boot "another start hook is still running; exiting without spawning a second worker"
  exit 0
fi

if [ -f "$SUPERVISOR_PID_FILE" ]; then
  PID="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
  if is_our_supervisor "${PID:-}"; then
    boot "supervisor already running (pid $PID)"
    exit 0
  fi
  boot "removing stale supervisor pid file"
  rm -f "$SUPERVISOR_PID_FILE"
fi

ORPHAN_WORKER_PID=""
if [ -f "$WORKER_PID_FILE" ]; then
  PID="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"
  if is_our_worker "${PID:-}"; then
    ORPHAN_WORKER_PID="$PID"
    boot "worker is running without a supervisor (pid $PID); the supervisor will adopt it"
  else
    boot "removing stale worker pid file"
    rm -f "$WORKER_PID_FILE"
  fi
fi

if [ -z "${PIERROT_DEV_WORKER_TOKEN:-}" ] || [ "${#PIERROT_DEV_WORKER_TOKEN}" -lt 32 ]; then
  boot "WORKER_CONFIG_INVALID: PIERROT_DEV_WORKER_TOKEN is missing or too short; worker not started."
  exit 1
fi

if [ -z "${PIERROT_DEV_API_URL:-}" ] && [ -z "${NEXT_PUBLIC_BASE_URL:-}" ]; then
  boot "WORKER_CONFIG_INVALID: PIERROT_DEV_API_URL is not set; worker not started."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  boot "WORKER_CONFIG_INVALID: node is not available; worker not started."
  exit 1
fi

if ! command -v opencode >/dev/null 2>&1; then
  boot "OPENCODE_CLI_MISSING: the worker will report not-ready instead of claiming tasks."
fi

cd "$ROOT" || exit 1
rm -f "$WORK_ROOT/stopping"

# The supervisor writes its own PID atomically after taking its own lock.
if command -v setsid >/dev/null 2>&1; then
  setsid --fork bash "$ROOT/scripts/pierrot/dev-worker-supervisor.sh" \
    >> "$BOOT_LOG" 2>&1 < /dev/null 9>&- &
else
  nohup bash "$ROOT/scripts/pierrot/dev-worker-supervisor.sh" \
    >> "$BOOT_LOG" 2>&1 < /dev/null 9>&- &
fi

# Confirm it survived the lifecycle command and was not killed with the shell.
for _ in $(seq 1 40); do
  SUPERVISOR_PID="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
  if is_our_supervisor "${SUPERVISOR_PID:-}"; then
    if [ -n "$ORPHAN_WORKER_PID" ]; then
      boot "supervisor started (pid $SUPERVISOR_PID), adopting worker pid $ORPHAN_WORKER_PID"
    else
      boot "supervisor started (pid $SUPERVISOR_PID)"
    fi
    exit 0
  fi
  sleep 0.25
done

rm -f "$SUPERVISOR_PID_FILE"
boot "SUPERVISOR_RESTARTING: supervisor failed to stay alive; see $BOOT_LOG"
exit 1
