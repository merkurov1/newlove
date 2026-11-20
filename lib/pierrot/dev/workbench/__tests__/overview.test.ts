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
  listLatestCostEstimates: jest.fn(async () => new Map()),
  listTaskRows: jest.fn(async () => []),
  listWorkers: jest.fn(async () => []),
  reapExpiredAttempts: jest.fn(async () => 0),
}));

jest.mock('../lifecycle', () => ({
  getLifecycleSnapshot: jest.fn(async () => ({ status: 'ready' })),
}));

jest.mock('../finalization', () => ({
  getFinalizationReport: jest.fn(async () => null),
}));

jest.mock('../reconciliation', () => ({
  auditNonTerminalTasks: jest.fn(() => []),
  reconcileTaskStates: jest.fn(async () => ({
    checked: 0,
    repaired: 0,
    skipped: false,
    errors: 0,
  })),
}));

import * as lifecycle from '../lifecycle';
import * as store from '../store';
import { getWorkbenchOverview, selectReviewTasks } from '../overview';

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(store.isWorkbenchSchemaReady).mockResolvedValue(true);
  asMock(store.isQueuePaused).mockResolvedValue(false);
  asMock(store.listTaskRows).mockResolvedValue([]);
  asMock(store.listAttemptsForTasks).mockResolvedValue(new Map());
  asMock(store.listLatestCostEstimates).mockResolvedValue(new Map());
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

  it('shows ready tasks in the queue so an empty queued list is never misleading', async () => {
    const base = {
      repository: 'newlove',
      baseRef: 'main',
      priority: 0,
      queuePosition: null,
      queuedAt: null,
      attemptCount: 0,
      acceptanceCriteria: [],
      verificationStatus: null,
      blockedReason: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      resultCommit: null,
      resultNotes: '',
      pullRequests: [],
      updatedAt: '2026-11-20T00:00:00.000Z',
      createdAt: '2026-11-20T00:00:00.000Z',
      objective: '',
      title: 'Ready task',
    };
    asMock(store.listTaskRows).mockResolvedValue([
      { ...base, id: 'ready', status: 'ready' as const, title: 'Ready task' },
      {
        ...base,
        id: 'queued',
        status: 'queued' as const,
        title: 'Queued task',
        queuePosition: 1,
        queuedAt: '2026-11-20T00:00:00.000Z',
      },
      { ...base, id: 'draft', status: 'draft' as const, title: 'Draft task' },
    ]);

    const overview = await getWorkbenchOverview('11111111-1111-4111-8111-111111111111', {
      skipReap: true,
    });

    expect(overview.queue.map((task) => task.id)).toEqual(['queued', 'ready']);
    expect(overview.queue.find((task) => task.id === 'ready')?.status).toBe('ready');
  });

  it('keeps verified or merged tasks out of the owner review list', () => {
    const base = {
      repository: 'newlove',
      baseRef: 'main',
      priority: 0,
      queuePosition: null,
      queuedAt: null,
      attemptCount: 1,
      acceptanceCriteria: [],
      verificationStatus: null,
      blockedReason: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      resultCommit: null,
      resultNotes: '',
      pullRequests: [],
      updatedAt: '',
      createdAt: '',
      objective: '',
      title: 'Task',
    };
    const tasks = [
      { ...base, id: 'review', status: 'review' as const },
      {
        ...base,
        id: 'merged',
        status: 'verified' as const,
        pullRequests: ['https://github.com/merkurov1/newlove/pull/29'],
      },
      { ...base, id: 'accepted', status: 'verified' as const },
    ];

    expect(selectReviewTasks(tasks).map((task) => task.id)).toEqual(['review']);
  });
});
