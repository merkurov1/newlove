#!/usr/bin/env bash
# Start the Pierrot Dev Workbench worker as a controlled background process.
#
# Safe to call on every Codespace start: it exits 0 when the worker is already
# running or when the required configuration is absent. It never blocks
# container creation and never prints secrets.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
PID_FILE="$WORK_ROOT/worker.pid"
LOG_DIR="$WORK_ROOT/logs"
BOOT_LOG="$LOG_DIR/worker-boot.log"

mkdir -p "$LOG_DIR" || exit 0

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${PID:-}" ] && kill -0 "$PID" 2>/dev/null; then
    if ps -p "$PID" -o args= 2>/dev/null | grep -q "dev-worker.mjs"; then
      echo "[dev-worker] already running (pid $PID)"
      exit 0
    fi
  fi
  rm -f "$PID_FILE"
fi

if [ -z "${PIERROT_DEV_WORKER_TOKEN:-}" ] || [ "${#PIERROT_DEV_WORKER_TOKEN}" -lt 32 ]; then
  echo "[dev-worker] PIERROT_DEV_WORKER_TOKEN is missing or too short; worker not started." | tee -a "$BOOT_LOG" >/dev/null
  exit 0
fi

if [ -z "${PIERROT_DEV_API_URL:-}" ] && [ -z "${NEXT_PUBLIC_BASE_URL:-}" ]; then
  echo "[dev-worker] PIERROT_DEV_API_URL is not set; worker not started." | tee -a "$BOOT_LOG" >/dev/null
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[dev-worker] node is not available; worker not started." | tee -a "$BOOT_LOG" >/dev/null
  exit 0
fi

cd "$ROOT" || exit 0
nohup node "$ROOT/scripts/pierrot/dev-worker.mjs" >> "$BOOT_LOG" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
echo "[dev-worker] started (pid $PID)"
exit 0
