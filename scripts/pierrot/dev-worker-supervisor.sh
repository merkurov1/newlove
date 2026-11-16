#!/usr/bin/env bash
# Supervise the Pierrot Dev worker.
#
# Transient crashes are retried forever with capped exponential backoff so a
# temporary OpenCode/network failure cannot leave an Available Codespace without
# a worker. Permanent configuration failures (worker exit code 2) are not
# retried. A supervisor-level flock prevents duplicate supervisors, and an
# existing worker PID is adopted instead of starting a second process.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK_ROOT="${PIERROT_DEV_WORK_ROOT:-$HOME/.pierrot-dev-work}"
PID_FILE="$WORK_ROOT/worker.pid"
SUPERVISOR_PID_FILE="$WORK_ROOT/supervisor.pid"
STATE_FILE="$WORK_ROOT/supervisor-state.json"
LOG_DIR="$WORK_ROOT/logs"
CHILD_LOG="$LOG_DIR/worker-child.log"
BOOT_LOG="$LOG_DIR/worker-boot.log"
STOP_FILE="$WORK_ROOT/stopping"
SUPERVISOR_LOCK="$WORK_ROOT/supervisor.lock"
MAX_RESTARTS="${PIERROT_DEV_SUPERVISOR_MAX_RESTARTS:-0}"
INITIAL_BACKOFF="${PIERROT_DEV_SUPERVISOR_INITIAL_BACKOFF_SECONDS:-15}"
case "$INITIAL_BACKOFF" in
  ''|*[!0-9]*) INITIAL_BACKOFF=15 ;;
esac
if [ "$INITIAL_BACKOFF" -lt 1 ]; then INITIAL_BACKOFF=1; fi
if [ "$INITIAL_BACKOFF" -gt 120 ]; then INITIAL_BACKOFF=120; fi

mkdir -p "$LOG_DIR" || exit 0

# Only one supervisor may exist. The start script also checks the PID file, but
# the lock closes the race between two lifecycle hooks.
if command -v flock >/dev/null 2>&1; then
  exec 8>"$SUPERVISOR_LOCK"
  flock -n 8 || exit 0
fi

write_pid_atomic() {
  local file="$1"
  local pid="$2"
  local tmp="${file}.$$"
  printf '%s\n' "$pid" > "$tmp" && mv -f "$tmp" "$file"
}

write_pid_atomic "$SUPERVISOR_PID_FILE" $$
trap 'rm -f "$SUPERVISOR_PID_FILE"' EXIT

CHILD_PID=""
STOPPING=0
ADOPTED=0

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) [supervisor] $*"
  echo "$line"
  echo "$line" >> "$BOOT_LOG" 2>/dev/null || true
}

is_worker_pid() {
  local pid="$1"
  [ -n "${pid:-}" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -Fq "dev-worker.mjs"
}

stop_child() {
  STOPPING=1
  : > "$STOP_FILE"
  if [ -n "${CHILD_PID:-}" ] && kill -0 "$CHILD_PID" 2>/dev/null; then
    log "stopping worker pid $CHILD_PID"
    kill -TERM "$CHILD_PID" 2>/dev/null || true
    for _ in $(seq 1 30); do
      kill -0 "$CHILD_PID" 2>/dev/null || return 0
      sleep 1
    done
    log "worker did not stop within 30s; killing pid $CHILD_PID"
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

# Adopt an already-running worker left by a previous supervisor or a failed
# start. It is never duplicated and is still supervised from this point on.
if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if is_worker_pid "${EXISTING_PID:-}"; then
    ADOPTED=1
    CHILD_PID="$EXISTING_PID"
    log "adopting existing worker pid $CHILD_PID"
  else
    rm -f "$PID_FILE"
  fi
fi

restarts=0
backoff=$INITIAL_BACKOFF
last_exit=0

while [ "$STOPPING" -eq 0 ]; do
  if [ -f "$STOP_FILE" ]; then
    log "stop requested before start"
    exit 0
  fi

  if [ "$ADOPTED" -eq 0 ]; then
    started_at=$(date +%s)
    log "starting worker (restart $restarts)"
    node "$ROOT/scripts/pierrot/dev-worker.mjs" >> "$CHILD_LOG" 2>&1 8>&- &
    CHILD_PID=$!
    write_pid_atomic "$PID_FILE" "$CHILD_PID"
  else
    started_at=0
    ADOPTED=0
    log "waiting for adopted worker pid $CHILD_PID"
  fi

  if [ "$started_at" -eq 0 ]; then
    while kill -0 "$CHILD_PID" 2>/dev/null; do
      sleep 1
    done
    code=1
  else
    wait "$CHILD_PID"
    code=$?
  fi

  rm -f "$PID_FILE"
  CHILD_PID=""
  last_exit=$code

  if [ "$STOPPING" -eq 1 ] || [ -f "$STOP_FILE" ]; then
    log "worker stopped cleanly on request"
    exit 0
  fi

  if [ "$code" -eq 0 ]; then
    log "worker exited cleanly"
    exit 0
  fi

  if [ "$code" -eq 2 ]; then
    log "WORKER_CONFIG_INVALID: worker configuration is invalid; supervisor will not restart"
    printf '{"phase":"failed","code":"WORKER_CONFIG_INVALID","exitCode":2,"at":"%s"}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATE_FILE" 2>/dev/null || true
    exit 2
  fi

  runtime=$(( $(date +%s) - started_at ))
  if [ "$started_at" -eq 0 ]; then
    runtime=0
  fi

  # A long healthy run proves the configuration is valid and resets the budget.
  if [ "$runtime" -ge 600 ]; then
    restarts=0
    backoff=$INITIAL_BACKOFF
  fi

  restarts=$((restarts + 1))
  if [ "$MAX_RESTARTS" -gt 0 ] && [ "$restarts" -gt "$MAX_RESTARTS" ]; then
    log "SUPERVISOR_RESTART_LIMIT: reached the explicit test/ops limit ($MAX_RESTARTS); last exit $code"
    printf '{"phase":"failed","code":"SUPERVISOR_RESTART_LIMIT","exitCode":%s,"restarts":%s,"at":"%s"}\n' \
      "$code" "$restarts" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATE_FILE" 2>/dev/null || true
    exit 1
  fi

  log "worker exited with $code after ${runtime}s; SUPERVISOR_RESTARTING in ${backoff}s (restart $restarts)"
  printf '{"phase":"restarting","code":"SUPERVISOR_RESTARTING","exitCode":%s,"restarts":%s,"backoffSeconds":%s,"at":"%s"}\n' \
    "$code" "$restarts" "$backoff" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATE_FILE" 2>/dev/null || true
  sleep "$backoff"
  if [ "$STOPPING" -eq 1 ]; then
    exit 0
  fi
  # Fast crash loops escalate quickly, but the cap stays at two minutes.
  backoff=$((backoff * 2))
  if [ "$backoff" -gt 120 ]; then
    backoff=120
  fi
done
