/**
 * Child-process supervision for the Pierrot Dev worker.
 *
 * The worker must never wait forever for an executor that ignores signals or
 * leaves descendants holding the stdout/stderr pipes open. This module keeps
 * output bounded, enforces a hard timeout, escalates signals and always
 * settles with a result the worker can persist.
 */

import { spawn } from 'node:child_process';

const DEFAULT_MAX_CAPTURE_BYTES = 2_000_000;
const DEFAULT_KILL_GRACE_MS = 10_000;
const DEFAULT_CLOSE_GRACE_MS = 5_000;
const MIN_CAPTURE_BYTES = 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Keeps only the most recent output. The tail matters most: it contains the
 * final executor report and the error that stopped the run.
 */
export function createBoundedCapture(limit = DEFAULT_MAX_CAPTURE_BYTES) {
  const max = Math.max(MIN_CAPTURE_BYTES, Number(limit) || DEFAULT_MAX_CAPTURE_BYTES);
  let text = '';
  let truncated = false;

  return {
    append(chunk) {
      const value = typeof chunk === 'string' ? chunk : chunk.toString();
      if (!value) return;
      const next = text + value;
      if (next.length > max) {
        truncated = true;
        text = next.slice(-max);
      } else {
        text = next;
      }
    },
    get text() {
      return text;
    },
    get truncated() {
      return truncated;
    },
  };
}

function signalGroup(pid, signal) {
  if (!pid) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

function isGroupAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

/** Terminate a process group, escalating to SIGKILL after the grace period. */
export async function terminateProcessGroup(pid, graceMs = DEFAULT_CLOSE_GRACE_MS) {
  if (!pid) return;
  signalGroup(pid, 'SIGTERM');
  const deadline = Date.now() + Math.max(0, graceMs);
  while (Date.now() < deadline) {
    if (!isGroupAlive(pid)) return;
    await sleep(100);
  }
  signalGroup(pid, 'SIGKILL');
}

/**
 * Run a command with bounded output, heartbeat callbacks and guaranteed
 * settlement.
 *
 * Options:
 *   timeoutMs       hard execution limit (default 120s)
 *   killGraceMs     SIGTERM -> SIGKILL delay after a timeout/cancel
 *   closeGraceMs    how long to wait for stdio to close after the child exits
 *   maxCaptureBytes per-stream retained tail
 *   heartbeatMs     heartbeat interval
 *   onHeartbeat     async ({ stdout, stderr, child }) => boolean (true cancels)
 *   onSpawn         callback with the spawned child (for external shutdown)
 */
export function runProcess(command, args = [], options = {}) {
  const {
    cwd,
    env,
    timeoutMs = 120_000,
    killGraceMs = DEFAULT_KILL_GRACE_MS,
    closeGraceMs = DEFAULT_CLOSE_GRACE_MS,
    maxCaptureBytes = DEFAULT_MAX_CAPTURE_BYTES,
    heartbeatMs = 0,
    onHeartbeat,
    onSpawn,
    detached = true,
  } = options;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdout = createBoundedCapture(maxCaptureBytes);
    const stderr = createBoundedCapture(maxCaptureBytes);

    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached,
      });
    } catch (error) {
      resolve({
        code: -1,
        signal: null,
        stdout: '',
        stderr: String(error?.message || error),
        timedOut: false,
        cancelled: false,
        truncated: false,
        durationMs: Date.now() - startedAt,
        pid: null,
      });
      return;
    }

    if (onSpawn) {
      try {
        onSpawn(child);
      } catch {
        // Supervision must not fail because a callback failed.
      }
    }

    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let exitInfo = null;
    let timeoutTimer = null;
    let killTimer = null;
    let closeTimer = null;
    let hardTimer = null;
    let heartbeatTimer = null;

    const clearTimers = () => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      clearTimeout(closeTimer);
      clearTimeout(hardTimer);
      clearTimeout(heartbeatTimer);
    };

    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimers();
      // Descendants inherit the group. Kill whatever is left so an interrupted
      // CLI cannot leave an OpenCode server or test runner behind.
      signalGroup(child.pid, 'SIGKILL');
      resolve({
        code: typeof code === 'number' ? code : -1,
        signal: signal || null,
        stdout: stdout.text,
        stderr: stderr.text,
        timedOut,
        cancelled,
        truncated: stdout.truncated || stderr.truncated,
        durationMs: Date.now() - startedAt,
        pid: child.pid ?? null,
      });
    };

    const terminate = () => {
      signalGroup(child.pid, 'SIGTERM');
      if (killTimer) return;
      killTimer = setTimeout(() => signalGroup(child.pid, 'SIGKILL'), killGraceMs);
      // Last resort: settle even if the child and all descendants ignore every
      // signal. The caller still gets a terminal result.
      hardTimer = setTimeout(() => finish(-1, 'SIGKILL'), killGraceMs + closeGraceMs);
    };

    child.stdout?.on('data', (chunk) => stdout.append(chunk));
    child.stderr?.on('data', (chunk) => stderr.append(chunk));
    child.stdout?.on('error', () => {});
    child.stderr?.on('error', () => {});

    child.on('error', (error) => {
      stderr.append(`\n${error?.message || error}`);
      finish(-1, null);
    });

    child.on('exit', (code, signal) => {
      exitInfo = { code, signal };
      // `close` waits for every inherited pipe. A detached grandchild can keep
      // those open forever, so settle after a short grace and kill the group.
      if (!closeTimer) {
        closeTimer = setTimeout(() => finish(code, signal), closeGraceMs);
      }
    });

    child.on('close', (code, signal) => {
      finish(
        typeof code === 'number' ? code : exitInfo?.code,
        signal || exitInfo?.signal
      );
    });

    timeoutTimer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminate();
    }, Math.max(1, timeoutMs));

    const scheduleHeartbeat = () => {
      if (!heartbeatMs || !onHeartbeat || settled) return;
      heartbeatTimer = setTimeout(async () => {
        if (settled || timedOut || cancelled) return;
        try {
          const shouldCancel = await onHeartbeat({
            stdout: stdout.text,
            stderr: stderr.text,
            child,
          });
          if (shouldCancel && !settled) {
            cancelled = true;
            terminate();
            return;
          }
        } catch {
          // Heartbeat failures are tolerated; the lease is long.
        }
        if (!settled) scheduleHeartbeat();
      }, heartbeatMs);
    };
    scheduleHeartbeat();
  });
}
