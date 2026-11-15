#!/usr/bin/env bash
# Stop the Pierrot Dev Workbench worker gracefully. The worker releases its
# lease and requeues the active task before exiting.

set -u

WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
PID_FILE="$WORK_ROOT/worker.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[dev-worker] not running (no pid file)"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "${PID:-}" ] || ! kill -0 "$PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "[dev-worker] not running"
  exit 0
fi

kill -TERM "$PID" 2>/dev/null || true
for _ in $(seq 1 20); do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "[dev-worker] stopped"
    exit 0
  fi
  sleep 1
done

kill -KILL "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "[dev-worker] force stopped"
exit 0
