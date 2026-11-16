#!/usr/bin/env bash
# Stop the Pierrot Dev Workbench supervisor and worker gracefully. Safe to
# repeat: missing PID files and already-dead processes are not errors.

set -u

WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
SUPERVISOR_PID_FILE="$WORK_ROOT/supervisor.pid"
WORKER_PID_FILE="$WORK_ROOT/worker.pid"
STOP_FILE="$WORK_ROOT/stopping"

mkdir -p "$WORK_ROOT" 2>/dev/null || true
: > "$STOP_FILE"

stop_pid() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 25); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 1
  done
  kill -KILL "$pid" 2>/dev/null || true
}

SUPERVISOR_PID="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
WORKER_PID="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"

if [ -z "${SUPERVISOR_PID:-}" ] && [ -z "${WORKER_PID:-}" ]; then
  rm -f "$SUPERVISOR_PID_FILE" "$WORKER_PID_FILE"
  echo "[dev-worker] not running"
  exit 0
fi

# Stop the worker first so the supervisor does not immediately restart it.
if [ -n "${WORKER_PID:-}" ]; then
  stop_pid "$WORKER_PID"
fi
if [ -n "${SUPERVISOR_PID:-}" ]; then
  stop_pid "$SUPERVISOR_PID"
fi

rm -f "$SUPERVISOR_PID_FILE" "$WORKER_PID_FILE"
echo "[dev-worker] stopped"
exit 0
