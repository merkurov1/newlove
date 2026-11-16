#!/usr/bin/env bash
# Stop the Pierrot Dev Workbench supervisor and worker gracefully. Safe to
# repeat: missing PID files, stale PIDs and already-dead processes are not
# errors. A PID is only signalled when its command line matches the expected
# script, so a recycled PID cannot kill an unrelated process.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
SUPERVISOR_PID_FILE="$WORK_ROOT/supervisor.pid"
WORKER_PID_FILE="$WORK_ROOT/worker.pid"
STOP_FILE="$WORK_ROOT/stopping"

mkdir -p "$WORK_ROOT" 2>/dev/null || true
: > "$STOP_FILE"

is_supervisor() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -Fq "$ROOT/scripts/pierrot/dev-worker-supervisor.sh"
}

is_worker() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -Fq "dev-worker.mjs"
}

stop_pid() {
  local pid="$1"
  local kind="$2"
  [ -n "${pid:-}" ] || return 0
  if [ "$kind" = "supervisor" ]; then
    is_supervisor "$pid" || return 0
  else
    is_worker "$pid" || return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do
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
  stop_pid "$WORKER_PID" worker
fi
if [ -n "${SUPERVISOR_PID:-}" ]; then
  stop_pid "$SUPERVISOR_PID" supervisor
fi

rm -f "$SUPERVISOR_PID_FILE" "$WORKER_PID_FILE"
echo "[dev-worker] stopped"
exit 0
