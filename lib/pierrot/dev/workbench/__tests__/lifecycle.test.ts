/** @jest-environment node */

import {
  canStopCodespace,
  decideCodespaceStart,
  deriveLifecycleStatus,
} from '../lifecycleState';
import type { LifecycleStatusInput } from '../lifecycleState';

const base: LifecycleStatusInput = {
  schemaReady: true,
  codespaceState: 'Available',
  codespaceError: null,
  workerOnline: true,
  workerReady: true,
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
    ).toBe('codespace_available');
  });

  it('surfaces blocked states instead of pretending work can run', () => {
    expect(deriveLifecycleStatus({ ...base, schemaReady: false }).status).toBe('blocked');
    expect(deriveLifecycleStatus({ ...base, queuePaused: true, queued: 1 }).status).toBe(
      'blocked'
    );
    expect(
      deriveLifecycleStatus({
        ...base,
        workerOnline: false,
        workerReady: false,
        startedRecently: false,
        lastError: 'Codespace start failed.',
      }).status
    ).toBe('blocked');
  });
});
