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
  setSetting: jest.fn(async () => undefined),
  tryAcquireLifecycleLock: jest.fn(async () => true),
}));

import * as github from '../github';
import * as store from '../store';
import {
  ensureCodespaceForQueuedWork,
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
  active: 0,
  activeTasks: 0,
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
  asMock(github.resolveCodespace).mockResolvedValue(codespace);
  asMock(github.getCodespace).mockResolvedValue(codespace);
  asMock(github.startCodespace).mockResolvedValue({ ...codespace, state: 'Starting' });
  asMock(github.stopCodespace).mockResolvedValue({ ...codespace, state: 'ShuttingDown' });
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

  it('cancels the stop when new work appears between the two checks', async () => {
    asMock(store.getQueueSnapshot)
      .mockResolvedValueOnce(idleQueue)
      .mockResolvedValueOnce({ ...idleQueue, queued: 1 });
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
  it('restarts an available Codespace whose worker is dead past the startup grace', async () => {
    asMock(store.getQueueSnapshot).mockResolvedValue({ ...idleQueue, queued: 1 });
    asMock(github.resolveCodespace).mockResolvedValue({ ...codespace, state: 'Available' });
    asMock(store.listWorkers).mockResolvedValue([
      {
        id: 'codespace:test',
        online: false,
        lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ]);
    asMock(github.getCodespace).mockResolvedValue({ ...codespace, state: 'Stopped' });

    const result = await ensureCodespaceForQueuedWork({ source: 'test:recovery' });

    expect(github.stopCodespace).toHaveBeenCalledWith('test-codespace');
    expect(github.startCodespace).toHaveBeenCalledWith('test-codespace');
    expect(result.action).toBe('started');
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'codespace.worker_recovery' })
    );
  }, 15_000);
});
