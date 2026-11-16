#!/usr/bin/env bash
# Supervise the Pierrot Dev worker with bounded restarts.
#
# Codespaces lifecycle commands are short-lived; a bare `nohup node ... &` can
# disappear or die without recovery. This supervisor is launched in a detached
# session by dev-worker-start.sh, records the worker PID and restarts only on
# abnormal exit with exponential backoff. It never loops forever.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
PID_FILE="$WORK_ROOT/worker.pid"
LOG_DIR="$WORK_ROOT/logs"
CHILD_LOG="$LOG_DIR/worker-child.log"
STOP_FILE="$WORK_ROOT/stopping"

mkdir -p "$LOG_DIR" || exit 0
echo $$ > "$WORK_ROOT/supervisor.pid"
trap 'rm -f "$WORK_ROOT/supervisor.pid"' EXIT

CHILD_PID=""
STOPPING=0

log() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [supervisor] $*"
}

stop_child() {
  STOPPING=1
  : > "$STOP_FILE"
  if [ -n "${CHILD_PID:-}" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    kill -TERM "$CHILD_PID" 2>/dev/null || true
    for _ in $(seq 1 25); do
      kill -0 "$CHILD_PID" 2>/dev/null || return 0
      sleep 1
    done
    kill -KILL "$CHILD_PID" 2>/dev/null || true
  fi
}

on_signal() {
  stop_child
  rm -f "$PID_FILE"
  log "supervisor stopped"
  exit 0
}

trap on_signal TERM INT

rm -f "$STOP_FILE"
restarts=0
backoff=15

while [ "$STOPPING" -eq 0 ]; do
  if [ -f "$STOP_FILE" ]; then
    log "stop requested before start"
    exit 0
  fi

  started_at=$(date +%s)
  log "starting worker (restart $restarts)"
  node "$ROOT/scripts/pierrot/dev-worker.mjs" >> "$CHILD_LOG" 2>&1 &
  CHILD_PID=$!
  echo "$CHILD_PID" > "$PID_FILE"
  wait "$CHILD_PID"
  code=$?
  rm -f "$PID_FILE"
  CHILD_PID=""

  if [ "$STOPPING" -eq 1 ] || [ -f "$STOP_FILE" ]; then
    log "worker stopped cleanly on request"
    exit 0
  fi

  # Exit 0 means the worker handled a deliberate stop. Exit 2 means the
  # configuration is invalid and restarting cannot help.
  if [ "$code" -eq 0 ]; then
    log "worker exited cleanly"
    exit 0
  fi
  if [ "$code" -eq 2 ]; then
    log "worker configuration is invalid; supervisor will not restart"
    exit 2
  fi

  runtime=$(( $(date +%s) - started_at ))
  if [ "$runtime" -ge 600 ]; then
    # A long healthy run resets the restart budget.
    restarts=0
    backoff=15
  fi

  restarts=$((restarts + 1))
  if [ "$restarts" -gt 8 ]; then
    log "worker crashed $restarts times; giving up (last exit $code)"
    exit 1
  fi

  log "worker exited with $code after ${runtime}s; restarting in ${backoff}s"
  sleep "$backoff"
  backoff=$((backoff * 2))
  if [ "$backoff" -gt 120 ]; then
    backoff=120
  fi
done
