/** @jest-environment node */

jest.mock('../github', () => {
  class WorkbenchGitHubError extends Error {
    code: string;
    status: number | null;
    constructor(code: string, message: string, status: number | null = null) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    WorkbenchGitHubError,
    getCodespace: jest.fn(),
    resolveCodespace: jest.fn(),
    startCodespace: jest.fn(),
    stopCodespace: jest.fn(),
  };
});

jest.mock('../setup', () => ({
  getConfiguredCodespaceName: () => 'test-codespace',
}));

jest.mock('../store', () => ({
  appendEvent: jest.fn(async () => undefined),
  getActiveAttempt: jest.fn(async () => null),
  getQueueSnapshot: jest.fn(),
  getSetting: jest.fn(async (_key: string, fallback: unknown) => fallback),
  isWorkbenchSchemaReady: jest.fn(async () => true),
  listRecentAttempts: jest.fn(async () => []),
  listWorkers: jest.fn(async () => []),
  promoteStandaloneReadyTasks: jest.fn(async () => 0),
  setSetting: jest.fn(async () => undefined),
  tryAcquireLifecycleLock: jest.fn(async () => true),
}));

jest.mock('../finalization', () => ({
  advanceFinalization: jest.fn(async () => null),
}));

jest.mock('../notifications', () => ({
  notifyDevOwner: jest.fn(async () => true),
}));

import * as finalization from '../finalization';
import * as github from '../github';
import * as notifications from '../notifications';
import * as store from '../store';
import {
  ensureCodespaceForQueuedWork,
  keepCodespaceAwakeForActiveWork,
  recordWorkerReady,
  requestIdleShutdown,
} from '../lifecycle';

const codespace = {
  name: 'test-codespace',
  state: 'Stopped',
  repository: 'merkurov1/newlove',
  machine: 'basicLinux32gb',
  webUrl: null,
};

const idleQueue = {
  queued: 0,
  ready: 0,
  active: 0,
  activeTasks: 0,
  review: 0,
  activeBatches: 0,
  paused: false,
  depthByPriority: [],
};

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

function settingsMap(initial: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(initial));
  asMock(store.getSetting).mockImplementation(async (key: string, fallback: unknown) =>
    map.has(key) ? map.get(key) : fallback
  );
  asMock(store.setSetting).mockImplementation(async (key: string, value: unknown) => {
    map.set(key, value);
  });
  return map;
}

beforeEach(() => {
  jest.clearAllMocks();
  settingsMap();
  asMock(store.getActiveAttempt).mockResolvedValue(null);
  asMock(store.getQueueSnapshot).mockResolvedValue(idleQueue);
  asMock(store.listWorkers).mockResolvedValue([
    {
      id: 'codespace:test',
      online: true,
      lastHeartbeatAt: new Date().toISOString(),
    },
  ]);
  asMock(store.tryAcquireLifecycleLock).mockResolvedValue(true);
  asMock(finalization.advanceFinalization).mockResolvedValue(null);
  asMock(github.resolveCodespace).mockResolvedValue(codespace);
  asMock(github.getCodespace).mockResolvedValue(codespace);
  asMock(github.startCodespace).mockResolvedValue({ ...codespace, state: 'Starting' });
  asMock(github.stopCodespace).mockResolvedValue({ ...codespace, state: 'ShuttingDown' });
});

describe('worker ready telemetry', () => {
  it('clears a stale auth error even when the ready timestamp is already recorded', async () => {
    const now = Date.now();
    settingsMap({
      'lifecycle:last_start': {
        at: new Date(now - 60_000).toISOString(),
        requestedAt: new Date(now - 60_000).toISOString(),
        codespaceName: 'test-codespace',
      },
      'lifecycle:last_ready': {
        at: new Date(now - 30_000).toISOString(),
        workerId: 'codespace:test',
      },
      'lifecycle:last_error': {
        at: new Date(now - 20_000).toISOString(),
        code: 'OPENCODE_AUTH_MISSING',
        message: 'No stored deepseek authentication was found.',
      },
    });

    await recordWorkerReady('codespace:test');

    expect(store.setSetting).toHaveBeenCalledWith('lifecycle:last_error', {
      at: null,
      code: null,
      message: null,
    });
  });
});

describe('worker recovery telemetry', () => {
  it('records recovery completion after a ready heartbeat', async () => {
    settingsMap({
      'lifecycle:recovery': {
        lastAttemptAt: new Date(Date.now() - 60_000).toISOString(),
        failures: 2,
        circuitOpenUntil: null,
        lastReason: 'No live worker.',
      },
    });

    await recordWorkerReady('codespace:test');

    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'worker.recovery.completed' })
    );
    expect(notifications.notifyDevOwner).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('worker restored') })
    );
  });
});

describe('automatic startup', () => {
  it('starts a stopped Codespace when a queued task exists', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    const result = await ensureCodespaceForQueuedWork({ source: 'test:enqueue' });
    expect(result.action).toBe('started');
    expect(github.startCodespace).toHaveBeenCalledWith('test-codespace');
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codespace.start_requested' })
    );
  });

  it('records a pending start instead of waiting when a stop is in flight', async () => {
    settingsMap({
      'lifecycle:shutdown_intent': {
        at: new Date().toISOString(),
        workerId: 'codespace:test',
        codespaceName: 'test-codespace',
        graceSeconds: 120,
      },
    });
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'ShuttingDown' });

    const result = await ensureCodespaceForQueuedWork({ source: 'test:race' });

    expect(result.action).toBe('start-pending');
    expect(github.startCodespace).not.toHaveBeenCalled();
    expect(store.setSetting).toHaveBeenCalledWith(
      'lifecycle:pending_start',
      expect.objectContaining({ reason: expect.stringMatching(/shutdown/i) })
    );
  });

  it('does not start anything when the queue is paused', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({
      ...idleQueue,
      queued: 1,
      paused: true,
    });
    const result = await ensureCodespaceForQueuedWork({ source: 'test:paused' });
    expect(result.action).toBe('noop');
    expect(github.startCodespace).not.toHaveBeenCalled();
  });
});

describe('safe shutdown', () => {
  it('never stops while an attempt is active', async () => {
    asMock(store.getActiveAttempt).mockResolvedValue({
      id: 'attempt-1',
      status: 'running',
    });
    const result = await requestIdleShutdown({
      workerId: 'codespace:test',
      idleForMs: 200_000,
      graceSeconds: 120,
    });
    expect(result.action).toBe('stay');
    expect(github.stopCodespace).not.toHaveBeenCalled();
  });

  it('stops only after the second queue check confirms no work', async () => {
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });

    const result = await requestIdleShutdown({
      workerId: 'codespace:test',
      idleForMs: 200_000,
      graceSeconds: 120,
    });

    expect(result.action).toBe('stopping');
    expect(github.stopCodespace).toHaveBeenCalledWith('test-codespace');
    expect(store.setSetting).toHaveBeenCalledWith(
      'lifecycle:last_stop',
      expect.objectContaining({ reason: 'idle', idleSeconds: 200 })
    );
  });

  it('promotes a standalone ready task instead of stopping', async () => {
    asMock(store.getQueueSnapshot)
      .mockResolvedValueOnce({ ...idleQueue, ready: 1 })
      .mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(store.promoteStandaloneReadyTasks).mockResolvedValue(1);

    const result = await requestIdleShutdown({
      workerId: 'codespace:test',
      idleForMs: 200_000,
      graceSeconds: 120,
    });

    expect(store.promoteStandaloneReadyTasks).toHaveBeenCalled();
    expect(result.action).toBe('stay');
    expect(github.stopCodespace).not.toHaveBeenCalled();
  });

  it('keeps the Codespace alive while queue finalization is active', async () => {
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(finalization.advanceFinalization).mockResolvedValue({
      stage: 'integrating',
      id: 'finalization-1',
    });

    const result = await requestIdleShutdown({
      workerId: 'codespace:test',
      idleForMs: 200_000,
      graceSeconds: 120,
    });

    expect(result.action).toBe('finalizing');
    expect(github.stopCodespace).not.toHaveBeenCalled();
  });

  it('cancels the stop when new work appears between the two checks', async () => {
    asMock(store.getQueueSnapshot)
      .mockResolvedValueOnce(idleQueue) // pre-finalization promotion check
      .mockResolvedValueOnce(idleQueue) // first stop check
      .mockResolvedValueOnce({ ...idleQueue, queued: 1 }); // durable recheck
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });

    const result = await requestIdleShutdown({
      workerId: 'codespace:test',
      idleForMs: 200_000,
      graceSeconds: 120,
    });

    expect(result.action).toBe('stay');
    expect(github.stopCodespace).not.toHaveBeenCalled();
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codespace.stop_cancelled' })
    );
  });
});

describe('startup recovery', () => {
  it('does not stop an Available Codespace with an offline worker on a normal reconcile', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);

    const result = await ensureCodespaceForQueuedWork({ source: 'admin:overview' });

    expect(result.action).toBe('already-available');
    expect(github.stopCodespace).not.toHaveBeenCalled();
    expect(github.startCodespace).not.toHaveBeenCalled();
  });

  it('never runs the recovery loop from repeated normal reconciles', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);

    await ensureCodespaceForQueuedWork({ source: 'admin:overview' });
    await ensureCodespaceForQueuedWork({ source: 'admin:overview' });
    await ensureCodespaceForQueuedWork({ source: 'admin:overview' });

    expect(github.stopCodespace).not.toHaveBeenCalled();
    expect(github.startCodespace).not.toHaveBeenCalled();
  });

  it('never restarts an Available Codespace while an attempt lease is active', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(store.getActiveAttempt).mockResolvedValue({
      id: 'attempt-active',
      status: 'running',
    });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);

    const result = await ensureCodespaceForQueuedWork({
      source: 'admin:overview',
      allowWorkerRecovery: true,
    });

    expect(result.action).toBe('noop');
    expect(result.reason).toMatch(/active/i);
    expect(github.stopCodespace).not.toHaveBeenCalled();
    expect(github.startCodespace).not.toHaveBeenCalled();
  });

  it('uses the newest heartbeat instead of an old start timestamp', async () => {
    settingsMap({
      'lifecycle:last_start': {
        at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        requestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        codespaceName: 'test-codespace',
        machine: null,
        source: 'admin:overview',
        state: 'Available',
        observedState: 'Available',
        lastHttpStatus: 200,
        confirmedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    });
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        // A 60s-old heartbeat is a normal polling gap; the hour-old start
        // timestamp must not override it.
        lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);

    const result = await ensureCodespaceForQueuedWork({
      source: 'admin:overview',
      allowWorkerRecovery: true,
    });

    expect(result.action).toBe('already-available');
    expect(github.stopCodespace).not.toHaveBeenCalled();
  });

  it('rechecks worker liveness after the restart lock before stopping', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers)
      .mockResolvedValueOnce([
        {
          id: 'codespace:test',
          online: false,
          lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'codespace:test',
          online: false,
          lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ])
      .mockResolvedValue([
        {
          id: 'codespace:test',
          online: true,
          lastHeartbeatAt: new Date().toISOString(),
        },
      ]);

    const result = await ensureCodespaceForQueuedWork({
      source: 'admin:overview',
      allowWorkerRecovery: true,
    });

    expect(result.action).toBe('already-available');
    expect(result.reason).toMatch(/came online/i);
    expect(github.stopCodespace).not.toHaveBeenCalled();
  });

  it('does not restart an Available Codespace whose worker is online but not ready', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: true,
        ready: false,
        capabilities: {
          ready: false,
          readiness: { ready: false, authOk: false, reasons: ['OPENCODE_AUTH_MISSING'] },
        },
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    const result = await ensureCodespaceForQueuedWork({
      source: 'admin:manual',
      allowWorkerRecovery: true,
    });

    expect(result.action).toBe('already-available');
    expect(github.stopCodespace).not.toHaveBeenCalled();
  });

  it('recovers an Available Codespace only when explicitly allowed, then honors cooldown', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(github.getCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);

    const first = await ensureCodespaceForQueuedWork({
      source: 'admin:manual',
      allowWorkerRecovery: true,
    });
    expect(first.action).toBe('start-pending');
    expect(github.stopCodespace).toHaveBeenCalledWith('test-codespace');
    expect(github.startCodespace).not.toHaveBeenCalled();
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codespace.worker_recovery' })
    );

    const second = await ensureCodespaceForQueuedWork({
      source: 'admin:manual',
      allowWorkerRecovery: true,
    });
    expect(second.action).toBe('start-pending');
    expect(second.reason).toMatch(/waiting|register|available/i);
    expect(github.stopCodespace).toHaveBeenCalledTimes(1);
  }, 15_000);
});

describe('pending start verification', () => {
  it('does not treat an accepted start request as a confirmed transition', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Shutdown' });
    asMock(github.getCodespace).mockResolvedValue({ ...codespace, state: 'Shutdown' });
    asMock(github.startCodespace).mockResolvedValue({ ...codespace, state: 'Shutdown' });

    const result = await ensureCodespaceForQueuedWork({ source: 'admin:overview' });

    expect(result.action).toBe('start-pending');
    expect(result.reason).toMatch(/still Shutdown|confirmation/i);
    expect(store.setSetting).toHaveBeenCalledWith(
      'lifecycle:pending_start',
      expect.objectContaining({
        phase: 'requested',
        lastObservedState: 'Shutdown',
        lastHttpStatus: 200,
        attempts: 1,
      })
    );
    expect(store.setSetting).not.toHaveBeenCalledWith(
      'lifecycle:pending_start',
      expect.objectContaining({ at: null })
    );
  });

  it('does not issue a new start on every overview while a retry is scheduled', async () => {
    settingsMap({
      'lifecycle:pending_start': {
        at: new Date().toISOString(),
        requestedAt: new Date(Date.now() - 60_000).toISOString(),
        codespaceName: 'test-codespace',
        source: 'admin:overview',
        reason: 'GitHub accepted the start request.',
        phase: 'requested',
        attempts: 2,
        maxAttempts: 6,
        nextAttemptAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        lastObservedState: 'Shutdown',
        lastHttpStatus: 200,
        lastError: null,
      },
    });
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Shutdown' });

    const result = await ensureCodespaceForQueuedWork({ source: 'admin:overview' });

    expect(result.action).toBe('start-pending');
    expect(result.reason).toMatch(/scheduled/i);
    expect(github.startCodespace).not.toHaveBeenCalled();
  });

  it('fails pending state when the Codespace is Available but no worker booted', async () => {
    settingsMap({
      'lifecycle:pending_start': {
        at: new Date(Date.now() - 20 * 60_000).toISOString(),
        requestedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
        codespaceName: 'test-codespace',
        source: 'admin:overview',
        reason: 'GitHub accepted the start request.',
        phase: 'available',
        attempts: 1,
        maxAttempts: 6,
        nextAttemptAt: new Date().toISOString(),
        lastObservedState: 'Available',
        lastHttpStatus: 200,
        lastError: null,
      },
    });
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);

    const result = await ensureCodespaceForQueuedWork({
      source: 'admin:overview',
      allowWorkerRecovery: true,
    });

    expect(result.action).toBe('blocked');
    expect(result.reason).toMatch(/lifecycle hook|postStart|Rebuild/i);
    expect(github.stopCodespace).not.toHaveBeenCalled();
    expect(github.startCodespace).not.toHaveBeenCalled();
    expect(store.setSetting).toHaveBeenCalledWith(
      'lifecycle:pending_start',
      expect.objectContaining({ phase: 'failed' })
    );
  });

  it('finalizes pending state only after a worker is online', async () => {
    settingsMap({
      'lifecycle:pending_start': {
        at: new Date().toISOString(),
        requestedAt: new Date(Date.now() - 30_000).toISOString(),
        codespaceName: 'test-codespace',
        source: 'admin:overview',
        reason: 'GitHub accepted the start request.',
        phase: 'available',
        attempts: 1,
        maxAttempts: 6,
        nextAttemptAt: new Date().toISOString(),
        lastObservedState: 'Available',
        lastHttpStatus: 200,
        lastError: null,
      },
    });
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: true,
        lastHeartbeatAt: new Date().toISOString(),
      },
    ]);

    const result = await ensureCodespaceForQueuedWork({ source: 'admin:overview' });

    expect(result.action).toBe('already-available');
    expect(store.setSetting).toHaveBeenCalledWith('lifecycle:pending_start', { at: null });
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codespace.start_confirmed' })
    );
  });

  it('refreshes the Codespace idle timer only while an attempt is active', async () => {
    asMock(store.getActiveAttempt).mockResolvedValue({ id: 'attempt-1', status: 'running' });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(github.startCodespace).mockResolvedValue({ ...codespace, state: 'Available' });

    const result = await keepCodespaceAwakeForActiveWork({
      source: 'worker:progress',
      workerId: 'codespace:test',
    });

    expect(result.refreshed).toBe(true);
    expect(github.startCodespace).toHaveBeenCalledWith('test-codespace');
    expect(store.setSetting).toHaveBeenCalledWith(
      'lifecycle:last_keepalive',
      expect.objectContaining({ name: 'test-codespace', source: 'worker:progress' })
    );
  });
});
