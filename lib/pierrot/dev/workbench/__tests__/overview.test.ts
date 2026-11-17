/** @jest-environment node */

jest.mock('../store', () => ({
  WORKBENCH_MIGRATION_FILE: '2026-11-22_pierrot_dev_workbench.sql',
  getActiveAttempt: jest.fn(async () => null),
  getTaskRowUnscoped: jest.fn(async () => null),
  isQueuePaused: jest.fn(async () => false),
  isWorkbenchSchemaReady: jest.fn(async () => true),
  listAttemptsForTasks: jest.fn(async () => new Map()),
  listBatches: jest.fn(async () => []),
  listEvents: jest.fn(async () => []),
  listTaskRows: jest.fn(async () => []),
  listWorkers: jest.fn(async () => []),
  reapExpiredAttempts: jest.fn(async () => 0),
}));

jest.mock('../lifecycle', () => ({
  getLifecycleSnapshot: jest.fn(async () => ({ status: 'ready' })),
}));

import * as lifecycle from '../lifecycle';
import * as store from '../store';
import { getWorkbenchOverview } from '../overview';

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(store.isWorkbenchSchemaReady).mockResolvedValue(true);
  asMock(store.isQueuePaused).mockResolvedValue(false);
  asMock(store.listTaskRows).mockResolvedValue([]);
  asMock(store.listAttemptsForTasks).mockResolvedValue(new Map());
  asMock(store.listBatches).mockResolvedValue([]);
  asMock(store.listWorkers).mockResolvedValue([]);
  asMock(store.getActiveAttempt).mockResolvedValue(null);
  asMock(store.listEvents).mockResolvedValue([]);
  asMock(store.reapExpiredAttempts).mockResolvedValue(0);
  asMock(lifecycle.getLifecycleSnapshot).mockResolvedValue({ status: 'ready' });
});

describe('workbench overview recovery ordering', () => {
  it('reads the lifecycle snapshot only after the bounded reap finishes', async () => {
    let finishReap: (() => void) | undefined;
    let markReapStarted: (() => void) | undefined;
    const reapStarted = new Promise<void>((resolve) => {
      markReapStarted = resolve;
    });

    asMock(store.reapExpiredAttempts).mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishReap = () => resolve(1);
          markReapStarted?.();
        })
    );

    const overview = getWorkbenchOverview('11111111-1111-4111-8111-111111111111');
    await reapStarted;

    // The lifecycle read would otherwise capture the pre-reap active attempt.
    expect(store.reapExpiredAttempts).toHaveBeenCalledTimes(1);
    expect(lifecycle.getLifecycleSnapshot).not.toHaveBeenCalled();

    finishReap?.();
    await overview;

    expect(lifecycle.getLifecycleSnapshot).toHaveBeenCalledTimes(1);
    expect(asMock(store.reapExpiredAttempts).mock.invocationCallOrder[0]).toBeLessThan(
      asMock(lifecycle.getLifecycleSnapshot).mock.invocationCallOrder[0]
    );
  });

  it('does not run a duplicate reap when the route already did it', async () => {
    await getWorkbenchOverview('11111111-1111-4111-8111-111111111111', {
      skipReap: true,
    });

    expect(store.reapExpiredAttempts).not.toHaveBeenCalled();
    expect(lifecycle.getLifecycleSnapshot).toHaveBeenCalledTimes(1);
  });
});
