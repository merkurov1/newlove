/** @jest-environment node */

import {
  canStopCodespace,
  decideCodespaceStart,
  decideWorkerRecovery,
  deriveLifecycleStatus,
} from '../lifecycleState';
import type { LifecycleStatusInput } from '../lifecycleState';

const base: LifecycleStatusInput = {
  schemaReady: true,
  codespaceState: 'Available',
  codespaceError: null,
  workerOnline: true,
  workerReady: true,
  workerRegistered: true,
  readinessReasons: [],
  opencodeOk: true,
  authOk: true,
  executing: false,
  queued: 0,
  queuePaused: false,
  startedRecently: true,
  idleSeconds: 30,
  graceSeconds: 120,
  shutdownRequested: false,
  pendingStart: false,
  recoveryBlocked: false,
  recoveryReason: null,
  lastError: null,
  lastStartFailed: false,
};

describe('Codespaces startup decisions', () => {
  it('starts stopped Codespaces and treats in-flight states as idempotent', () => {
    expect(decideCodespaceStart('Stopped')).toBe('start');
    expect(decideCodespaceStart('Available')).toBe('noop');
    expect(decideCodespaceStart('Starting')).toBe('noop');
    expect(decideCodespaceStart('Rebuilding')).toBe('noop');
    expect(decideCodespaceStart('ShuttingDown')).toBe('wait');
    expect(decideCodespaceStart('Deleted')).toBe('unsupported');
  });

  it('reports a starting Codespace when a stopped Codespace has queued work', () => {
    const result = deriveLifecycleStatus({
      ...base,
      codespaceState: 'Stopped',
      workerOnline: false,
      workerReady: false,
      queued: 2,
      startedRecently: false,
    });
    expect(result.status).toBe('starting_codespace');
  });

  it('reports offline, not an error, when idle with no work', () => {
    const result = deriveLifecycleStatus({
      ...base,
      codespaceState: 'Stopped',
      workerOnline: false,
      workerReady: false,
      queued: 0,
      startedRecently: false,
    });
    expect(result.status).toBe('offline');
  });
});

describe('controlled worker recovery', () => {
  const recovery = {
    lastAttemptAt: null,
    failures: 0,
    circuitOpenUntil: null,
    lastReason: null,
  };
  const input = {
    codespaceState: 'Available',
    workerOnline: false,
    executing: false,
    queued: 1,
    queuePaused: false,
    hasSignal: true,
    signalAgeSeconds: 900,
    startupGraceSeconds: 300,
    recovery,
    now: Date.parse('2026-01-01T00:00:00.000Z'),
  };

  it('recovers only an Available machine with queued work and no worker', () => {
    expect(decideWorkerRecovery(input).action).toBe('recover');
    expect(decideWorkerRecovery({ ...input, workerOnline: true }).action).toBe('skip');
    expect(decideWorkerRecovery({ ...input, executing: true }).action).toBe('skip');
    expect(decideWorkerRecovery({ ...input, queued: 0 }).action).toBe('skip');
    expect(decideWorkerRecovery({ ...input, codespaceState: 'Stopped' }).action).toBe('skip');
  });

  it('enforces the cooldown and the circuit breaker', () => {
    expect(
      decideWorkerRecovery({
        ...input,
        recovery: { ...recovery, lastAttemptAt: '2025-12-31T23:55:00.000Z' },
      }).code
    ).toBe('WORKER_RECOVERY_COOLDOWN');

    expect(
      decideWorkerRecovery({
        ...input,
        recovery: { ...recovery, failures: 3 },
      }).code
    ).toBe('WORKER_RECOVERY_CIRCUIT_OPEN');
  });

  it('waits for the startup grace and for a proven boot signal', () => {
    expect(
      decideWorkerRecovery({ ...input, signalAgeSeconds: 10 }).code
    ).toBe('WORKER_STARTUP_GRACE');
    expect(
      decideWorkerRecovery({ ...input, hasSignal: false, signalAgeSeconds: null }).code
    ).toBe('WORKER_RECOVERY_NO_SIGNAL');
  });
});

describe('safe shutdown', () => {
  it('refuses to stop with queued work, an active task or an active attempt', () => {
    expect(
      canStopCodespace({ queued: 1, activeTasks: 0, activeAttempts: 0 })
    ).toBe(false);
    expect(
      canStopCodespace({ queued: 0, activeTasks: 1, activeAttempts: 0 })
    ).toBe(false);
    expect(
      canStopCodespace({ queued: 0, activeTasks: 0, activeAttempts: 1 })
    ).toBe(false);
    expect(
      canStopCodespace({ queued: 0, activeTasks: 0, activeAttempts: 0, workerAttemptActive: true })
    ).toBe(false);
  });

  it('allows a stop only when every execution signal is idle', () => {
    expect(canStopCodespace({ queued: 0, activeTasks: 0, activeAttempts: 0 })).toBe(true);
  });
});

describe('readiness and lifecycle status', () => {
  it('does not report Ready before the worker heartbeat and readiness proof', () => {
    expect(
      deriveLifecycleStatus({
        ...base,
        workerOnline: false,
        workerReady: false,
        startedRecently: true,
      }).status
    ).toBe('starting_worker');

    expect(
      deriveLifecycleStatus({
        ...base,
        workerOnline: true,
        workerReady: false,
        opencodeOk: false,
        readinessReasons: ['OpenCode CLI is missing.'],
      }).status
    ).toBe('checking_opencode');

    expect(
      deriveLifecycleStatus({
        ...base,
        workerOnline: true,
        workerReady: false,
        authOk: false,
        readinessReasons: ['No stored deepseek authentication was found.'],
      }).status
    ).toBe('checking_provider');
  });

  it('distinguishes executing, waiting for shutdown and stopping', () => {
    expect(deriveLifecycleStatus({ ...base, executing: true }).status).toBe('executing_task');
    expect(
      deriveLifecycleStatus({ ...base, idleSeconds: 130, graceSeconds: 120 }).status
    ).toBe('waiting_for_shutdown');
    expect(
      deriveLifecycleStatus({
        ...base,
        codespaceState: 'ShuttingDown',
        workerOnline: false,
        workerReady: false,
      }).status
    ).toBe('stopping_codespace');
  });

  it('keeps a pending start visible when new work races an in-flight stop', () => {
    const result = deriveLifecycleStatus({
      ...base,
      codespaceState: 'Stopping',
      workerOnline: false,
      workerReady: false,
      queued: 1,
      pendingStart: true,
    });
    expect(result.status).toBe('stopping_codespace');
    expect(result.detail).toMatch(/new startup/i);
  });

  it('shows Codespace available when the worker has stopped and recovery is pending', () => {
    expect(
      deriveLifecycleStatus({
        ...base,
        workerOnline: false,
        workerReady: false,
        startedRecently: false,
      }).status
    ).toBe('worker_offline');
  });

  it('distinguishes a never-registered worker from an offline worker', () => {
    expect(
      deriveLifecycleStatus({
        ...base,
        workerOnline: false,
        workerReady: false,
        workerRegistered: false,
        startedRecently: false,
      }).status
    ).toBe('worker_missing');
  });

  it('surfaces a blocked recovery instead of pretending a restart is running', () => {
    const result = deriveLifecycleStatus({
      ...base,
      workerOnline: false,
      workerReady: false,
      startedRecently: false,
      recoveryBlocked: true,
      recoveryReason: 'A worker restart was already attempted; waiting for the cooldown.',
    });
    expect(result.status).toBe('blocked');
    expect(result.detail).toMatch(/cooldown/i);
  });

  it('surfaces blocked states instead of pretending work can run', () => {
    expect(deriveLifecycleStatus({ ...base, schemaReady: false }).status).toBe('blocked');
    expect(deriveLifecycleStatus({ ...base, queuePaused: true, queued: 1 }).status).toBe(
      'blocked'
    );
    const offlineWithError = deriveLifecycleStatus({
      ...base,
      workerOnline: false,
      workerReady: false,
      startedRecently: false,
      lastError: 'Codespace start failed.',
    });
    expect(offlineWithError.status).toBe('worker_offline');
    expect(offlineWithError.detail).toMatch(/Codespace start failed/);
  });
});
