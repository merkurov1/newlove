/** @jest-environment node */

jest.mock('../github', () => {
  class WorkbenchGitHubError extends Error {
    code: string;
    status: number | null;
    endpoint: string | null;
    requiredPermission: string | null;
    retryAt: string | null;
    constructor(
      code: string,
      message: string,
      status: number | null = null,
      options: Record<string, unknown> = {}
    ) {
      super(message);
      this.code = code;
      this.status = status;
      this.endpoint = (options.endpoint as string) || null;
      this.requiredPermission = (options.requiredPermission as string) || null;
      this.retryAt = (options.retryAt as string) || null;
    }
  }
  return {
    WorkbenchGitHubError,
    dispatchRepositoryEvent: jest.fn(),
  };
});

jest.mock('../store', () => ({
  appendEvent: jest.fn(async () => undefined),
  clearTaskActionsDispatch: jest.fn(async () => undefined),
  completeTaskActionsDispatch: jest.fn(async () => ({
    ok: true,
    action: 'accepted',
    code: null,
    task: null,
  })),
  getActiveAttempt: jest.fn(async () => null),
  getTaskDispatchBlockers: jest.fn(async () => ({
    batchPaused: false,
    dependencyBlocked: false,
    activeAttemptForTask: false,
  })),
  getTaskRowUnscoped: jest.fn(),
  getWorker: jest.fn(async () => null),
  isActionsDispatchRecoverySchemaReady: jest.fn(async () => true),
  isActionsRoutingSchemaReady: jest.fn(async () => true),
  isQueuePaused: jest.fn(async () => false),
  listQueuedTasksForDispatch: jest.fn(async () => []),
  patchTask: jest.fn(async () => ({})),
  promoteStandaloneReadyTasks: jest.fn(async () => 0),
  reserveTaskForActionsDispatch: jest.fn(),
}));

import * as github from '../github';
import * as store from '../store';
import {
  ActionsDispatchError,
  dispatchNextQueuedTask,
  dispatchTaskToActions,
  recordActionsClaimMiss,
  retryActionsDispatch,
} from '../actions';

const TASK_ID = '8289098f-993a-4e75-abe4-81e23caee6d0';

const queuedTask = {
  id: TASK_ID,
  title: 'Task',
  objective: 'Do the task',
  repository: 'newlove',
  baseRef: 'main',
  status: 'queued' as const,
  priority: 0,
  queuePosition: 1,
  queuedAt: '2026-11-19T00:00:00.000Z',
  attemptCount: 0,
  acceptanceCriteria: ['done'],
  verificationStatus: null,
  blockedReason: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  assignedExecutor: null,
  actionsDispatchRequestedAt: null,
  actionsDispatchStatus: null,
  actionsDispatchReasonCode: null,
  actionsDispatchReason: null,
  actionsDispatchCorrelationId: null,
  actionsDispatchAttempts: 0,
  actionsDispatchLastAttemptAt: null,
  actionsDispatchNextRetryAt: null,
  actionsDispatchUpdatedAt: null,
  resultCommit: null,
  resultNotes: '',
  pullRequests: [],
  updatedAt: '2026-11-19T00:00:00.000Z',
  createdAt: '2026-11-19T00:00:00.000Z',
};

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(store.getTaskRowUnscoped).mockResolvedValue(queuedTask);
  asMock(store.isActionsRoutingSchemaReady).mockResolvedValue(true);
  asMock(store.isActionsDispatchRecoverySchemaReady).mockResolvedValue(true);
  asMock(store.isQueuePaused).mockResolvedValue(false);
  asMock(store.getActiveAttempt).mockResolvedValue(null);
  asMock(store.getWorker).mockResolvedValue(null);
  asMock(store.getTaskDispatchBlockers).mockResolvedValue({
    batchPaused: false,
    dependencyBlocked: false,
    activeAttemptForTask: false,
  });
  asMock(store.appendEvent).mockResolvedValue(undefined);
  asMock(store.patchTask).mockResolvedValue(queuedTask);
  asMock(store.promoteStandaloneReadyTasks).mockResolvedValue(0);
  asMock(store.reserveTaskForActionsDispatch).mockResolvedValue({
    ...queuedTask,
    assignedExecutor: 'actions',
    actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
    actionsDispatchStatus: 'requested',
    actionsDispatchAttempts: 1,
  });
  asMock(store.completeTaskActionsDispatch).mockResolvedValue({
    ok: true,
    action: 'accepted',
    code: null,
    task: { ...queuedTask, actionsDispatchStatus: 'accepted' },
  });
  asMock(github.dispatchRepositoryEvent).mockResolvedValue(undefined);
});

describe('task approval dispatch', () => {
  it('dispatches exactly the queued task id to the Actions event', async () => {
    const result = await dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' });

    expect(result.dispatched).toBe(true);
    expect(result.taskId).toBe(TASK_ID);
    expect(store.reserveTaskForActionsDispatch).toHaveBeenCalledWith(TASK_ID, {
      correlationId: expect.any(String),
      expectedRequestedAt: null,
      maxAttempts: 5,
    });
    expect(github.dispatchRepositoryEvent).toHaveBeenCalledWith({
      repository: 'newlove',
      eventType: 'pierrot-dev-task',
      clientPayload: expect.objectContaining({
        task_id: TASK_ID,
        source: 'admin:approve',
        correlation_id: expect.any(String),
        dispatch_attempt: 1,
      }),
    });
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task.actions_dispatched', taskId: TASK_ID })
    );
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, outcome: 'accepted' })
    );
  });

  it('is an explicit no-op while the queue is paused', async () => {
    asMock(store.isQueuePaused).mockResolvedValue(true);

    const result = await dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' });

    expect(result.dispatched).toBe(false);
    expect(result.code).toBe('QUEUE_PAUSED');
    expect(store.reserveTaskForActionsDispatch).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('does not dispatch twice when the reservation already exists', async () => {
    asMock(store.reserveTaskForActionsDispatch).mockResolvedValue(null);

    const result = await dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' });

    expect(result.dispatched).toBe(false);
    expect(result.code).toBe('ACTIONS_DISPATCH_ALREADY_REQUESTED');
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('records a dispatch failure on the task and does not emit a success event', async () => {
    asMock(github.dispatchRepositoryEvent).mockRejectedValue(
      new github.WorkbenchGitHubError(
        'GITHUB_PERMISSION_DENIED',
        'GitHub denied the dispatch.',
        403,
        {
          endpoint: 'POST /repos/{owner}/{repo}/dispatches',
          requiredPermission: 'Contents: write',
        }
      )
    );

    await expect(
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' })
    ).rejects.toMatchObject({ code: 'ACTIONS_DISPATCH_FAILED', status: 502, taskId: TASK_ID });

    expect(store.patchTask).toHaveBeenCalledWith(TASK_ID, {
      last_error_code: 'ACTIONS_DISPATCH_FAILED',
      last_error_message: expect.stringContaining('GitHub denied'),
    });
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task.actions_dispatch_failed',
        level: 'error',
        taskId: TASK_ID,
      })
    );
    expect(store.appendEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task.actions_dispatched' })
    );
  });

  it('fails closed with an explicit configuration error when the token is missing', async () => {
    asMock(github.dispatchRepositoryEvent).mockRejectedValue(
      new github.WorkbenchGitHubError('GITHUB_TOKEN_MISSING', 'GITHUB_TOKEN is not configured.')
    );

    await expect(
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' })
    ).rejects.toMatchObject({
      code: 'ACTIONS_DISPATCH_NOT_CONFIGURED',
      status: 503,
    });

    expect(store.patchTask).toHaveBeenCalledWith(TASK_ID, {
      last_error_code: 'ACTIONS_DISPATCH_NOT_CONFIGURED',
      last_error_message: expect.stringContaining('No Codespaces fallback'),
    });
    expect(store.appendEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task.actions_dispatched' })
    );
  });

  it('fails explicitly when the routing migration is missing', async () => {
    asMock(store.isActionsRoutingSchemaReady).mockResolvedValue(false);

    await expect(
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' })
    ).rejects.toMatchObject({
      code: 'ACTIONS_ROUTING_MIGRATION_REQUIRED',
      status: 503,
    });
    expect(store.getTaskRowUnscoped).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('refuses a task explicitly assigned to the manual Codespace reserve', async () => {
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      assignedExecutor: 'codespace',
    });

    await expect(
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:approve' })
    ).rejects.toMatchObject({ code: 'ACTIONS_DISPATCH_CODESPACE_ASSIGNED' });
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });
});

describe('bounded Actions recovery pump', () => {
  it('skips Codespace-assigned and already-requested tasks', async () => {
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([
      { ...queuedTask, id: '11111111-1111-4111-8111-111111111111', assignedExecutor: 'codespace' },
      {
        ...queuedTask,
        id: '22222222-2222-4222-8222-222222222222',
        actionsDispatchRequestedAt: new Date().toISOString(),
        actionsDispatchStatus: 'accepted',
        actionsDispatchAttempts: 1,
      },
      { ...queuedTask, id: TASK_ID },
    ]);
    asMock(store.getTaskRowUnscoped).mockImplementation(async (id: string) =>
      id === TASK_ID ? queuedTask : null
    );
    asMock(store.reserveTaskForActionsDispatch).mockImplementation(async (id: string) =>
      id === TASK_ID
        ? {
            ...queuedTask,
            assignedExecutor: 'actions',
            actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
          }
        : null
    );

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(true);
    expect(result.taskId).toBe(TASK_ID);
    expect(store.reserveTaskForActionsDispatch).toHaveBeenCalledTimes(1);
    expect(store.reserveTaskForActionsDispatch).toHaveBeenCalledWith(
      TASK_ID,
      expect.objectContaining({ expectedRequestedAt: null, maxAttempts: 5 })
    );
  });

  it('promotes approved ready work when the queue looks empty, then dispatches it', async () => {
    asMock(store.listQueuedTasksForDispatch)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([queuedTask]);
    asMock(store.promoteStandaloneReadyTasks).mockResolvedValue(1);

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(store.promoteStandaloneReadyTasks).toHaveBeenCalledTimes(1);
    expect(result.dispatched).toBe(true);
    expect(result.taskId).toBe(TASK_ID);
  });

  it('does not report success when promotion happened but nothing was dispatched', async () => {
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([]);
    asMock(store.promoteStandaloneReadyTasks).mockResolvedValue(2);

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(false);
    expect(result.code).toBe('PROMOTED_NOT_DISPATCHED');
    expect(result.promoted).toBe(2);
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('does nothing while the queue is paused', async () => {
    asMock(store.isQueuePaused).mockResolvedValue(true);
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([queuedTask]);

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.code).toBe('QUEUE_PAUSED');
    expect(store.listQueuedTasksForDispatch).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('does not dispatch while another attempt is active', async () => {
    asMock(store.getActiveAttempt).mockResolvedValue({ id: 'attempt', taskId: TASK_ID });

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.code).toBe('ACTIVE_ATTEMPT');
    expect(store.listQueuedTasksForDispatch).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });
});

describe('dispatch concurrency and retry', () => {
  it('emits at most one repository_dispatch for two concurrent calls with the same task id', async () => {
    let reserved = false;
    asMock(store.reserveTaskForActionsDispatch).mockImplementation(async () => {
      if (reserved) return null;
      reserved = true;
      return {
        ...queuedTask,
        assignedExecutor: 'actions',
        actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      };
    });

    const results = await Promise.all([
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:enqueue' }),
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:overview' }),
    ]);

    expect(results.filter((result) => result.dispatched)).toHaveLength(1);
    expect(store.reserveTaskForActionsDispatch).toHaveBeenCalledTimes(2);
    expect(github.dispatchRepositoryEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps the marker after a failure and only retries after an explicit owner action', async () => {
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      lastErrorCode: 'ACTIONS_DISPATCH_FAILED',
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'failed',
      actionsDispatchAttempts: 2,
      actionsDispatchCorrelationId: 'correlation-old',
    });
    asMock(store.completeTaskActionsDispatch).mockResolvedValue({
      ok: true,
      action: 'reset',
      code: 'OWNER_RETRY',
      task: { ...queuedTask, actionsDispatchStatus: 'retry_scheduled' },
    });
    asMock(github.dispatchRepositoryEvent).mockRejectedValueOnce(
      new github.WorkbenchGitHubError('GITHUB_SERVER_ERROR', 'GitHub is unavailable.', 502)
    );

    await expect(
      dispatchTaskToActions({ taskId: TASK_ID, source: 'admin:enqueue' })
    ).rejects.toMatchObject({ code: 'ACTIONS_DISPATCH_FAILED' });
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'retry', reasonCode: 'DISPATCH_API_TRANSIENT' })
    );

    const retried = await retryActionsDispatch({
      taskId: TASK_ID,
      source: 'admin:retry_dispatch',
    });

    expect(retried.dispatched).toBe(true);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'retry', resetAttempts: true })
    );
    expect(github.dispatchRepositoryEvent).toHaveBeenCalledTimes(2);
  });

  it('does not retry a task without a recorded dispatch failure', async () => {
    const result = await retryActionsDispatch({
      taskId: TASK_ID,
      source: 'admin:retry_dispatch',
    });

    expect(result.dispatched).toBe(false);
    expect(result.code).toBe('ACTIONS_RETRY_NOT_REQUIRED');
    expect(store.clearTaskActionsDispatch).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('does not dispatch from the recovery pump while another attempt is active', async () => {
    asMock(store.getActiveAttempt).mockResolvedValue({ id: 'attempt', taskId: TASK_ID });
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([queuedTask]);

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.code).toBe('ACTIVE_ATTEMPT');
    expect(store.reserveTaskForActionsDispatch).not.toHaveBeenCalled();
    expect(store.patchTask).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });
});

describe('dispatch error surface', () => {
  it('uses coded errors instead of a silent fallback', () => {
    const error = new ActionsDispatchError('ACTIONS_DISPATCH_FAILED', 'failed', 502, TASK_ID);
    expect(error.code).toBe('ACTIONS_DISPATCH_FAILED');
    expect(error.taskId).toBe(TASK_ID);
  });
});

describe('workflow claim diagnosis', () => {
  const freshWorker = {
    id: 'actions:1:1',
    status: 'idle' as const,
    stopRequested: false,
    lastHeartbeatAt: new Date().toISOString(),
  };

  it('schedules a bounded retry when another task owns the global slot', async () => {
    asMock(store.getWorker).mockResolvedValue(freshWorker);
    asMock(store.getActiveAttempt).mockResolvedValue({
      id: 'attempt-other',
      taskId: '99999999-9999-4999-8999-999999999999',
    });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 1,
      actionsDispatchCorrelationId: 'corr-1',
    });
    asMock(store.completeTaskActionsDispatch).mockResolvedValue({
      ok: true,
      action: 'retry_scheduled',
      code: 'ACTIVE_ATTEMPT_OTHER_TASK',
      task: queuedTask,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      correlationId: 'corr-1',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe('ACTIVE_ATTEMPT_OTHER_TASK');
    expect(diagnosis.retryable).toBe(true);
    expect(diagnosis.retryAt).not.toBeNull();
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        outcome: 'retry',
        reasonCode: 'ACTIVE_ATTEMPT_OTHER_TASK',
        expectedRequestedAt: '2026-11-19T01:00:00.000Z',
      })
    );
  });

  it('schedules a retry when the ephemeral worker heartbeat is stale', async () => {
    asMock(store.getWorker).mockResolvedValue({
      ...freshWorker,
      lastHeartbeatAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 1,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe('STALE_WORKER');
    expect(diagnosis.retryable).toBe(true);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'retry', reasonCode: 'STALE_WORKER' })
    );
  });

  it('uses a deterministic dedupe key for repeated delivery of the same claim outcome', async () => {
    asMock(store.getWorker).mockResolvedValue(freshWorker);
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 1,
    });

    await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });
    await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });

    const calls = asMock(store.appendEvent)
      .mock.calls.map((call) => call[0] as { dedupeKey?: string })
      .filter((event) => event.dedupeKey?.startsWith('actions-claim-outcome:'));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].dedupeKey).toBe(calls[1].dedupeKey);
  });

  it('does not retry when the task status changed before the claim', async () => {
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      status: 'ready',
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 1,
    });
    asMock(store.completeTaskActionsDispatch).mockResolvedValue({
      ok: true,
      action: 'ineligible',
      code: 'TASK_NOT_QUEUED',
      task: queuedTask,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe('TASK_NOT_QUEUED');
    expect(diagnosis.retryable).toBe(false);
    expect(diagnosis.terminal).toBe(true);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'terminal', terminal: true })
    );
  });

  it('treats an existing attempt for the same task as a claim race, not a retry', async () => {
    asMock(store.getWorker).mockResolvedValue(freshWorker);
    asMock(store.getActiveAttempt).mockResolvedValue({ id: 'attempt-1', taskId: TASK_ID });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      status: 'in_progress',
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 1,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe('TASK_ALREADY_CLAIMED');
    expect(diagnosis.retryable).toBe(false);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'claimed' })
    );
  });

  it.each([
    ['queue paused', { paused: true }, {}, 'QUEUE_PAUSED'],
    ['dependency blocked', { paused: false }, { dependencyBlocked: true }, 'DEPENDENCY_BLOCKED'],
    ['paused batch', { paused: false }, { batchPaused: true }, 'BATCH_PAUSED'],
  ])('does not auto-retry a terminal %s condition', async (_label, pauseState, blockers, code) => {
    asMock(store.getWorker).mockResolvedValue(freshWorker);
    asMock(store.isQueuePaused).mockResolvedValue(pauseState.paused === true);
    asMock(store.getTaskDispatchBlockers).mockResolvedValue({
      batchPaused: false,
      dependencyBlocked: false,
      activeAttemptForTask: false,
      ...blockers,
    });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 1,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe(code);
    expect(diagnosis.retryable).toBe(false);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'terminal', retryAt: null })
    );
  });

  it('ignores a stale workflow that would release a newer reservation', async () => {
    asMock(store.getWorker).mockResolvedValue(freshWorker);
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      actionsDispatchRequestedAt: '2026-11-19T02:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 2,
      actionsDispatchCorrelationId: 'corr-new',
    });
    asMock(store.completeTaskActionsDispatch).mockResolvedValue({
      ok: false,
      action: 'skipped',
      code: 'STALE_CORRELATION',
      task: queuedTask,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      correlationId: 'corr-old',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe('STALE_DISPATCH');
    expect(diagnosis.retryable).toBe(false);
    expect(diagnosis.retryAt).toBeNull();
    expect(diagnosis.action).toBe('ignored');
  });

  it('marks the dispatch retry-exhausted after the bounded attempt budget', async () => {
    asMock(store.getWorker).mockResolvedValue(freshWorker);
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...queuedTask,
      actionsDispatchRequestedAt: '2026-11-19T01:00:00.000Z',
      actionsDispatchStatus: 'accepted',
      actionsDispatchAttempts: 5,
    });

    const diagnosis = await recordActionsClaimMiss({
      taskId: TASK_ID,
      workerId: 'actions:1:1',
      executionId: 'gha:1:1',
    });

    expect(diagnosis.code).toBe('DISPATCH_RETRY_EXHAUSTED');
    expect(diagnosis.terminal).toBe(true);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'terminal', terminal: true, retryAt: null })
    );
  });
});

describe('stale marker recovery', () => {
  const staleTask = {
    ...queuedTask,
    actionsDispatchRequestedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    actionsDispatchStatus: 'accepted' as const,
    actionsDispatchReasonCode: 'GITHUB_ACCEPTED',
    actionsDispatchAttempts: 2,
    actionsDispatchCorrelationId: 'corr-old',
  };

  it('releases an accepted-but-never-claimed marker and redispatches once', async () => {
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([staleTask]);
    asMock(store.getTaskRowUnscoped).mockResolvedValue(staleTask);
    asMock(store.completeTaskActionsDispatch).mockResolvedValue({
      ok: true,
      action: 'released',
      code: 'DISPATCH_STALE_NO_CLAIM',
      task: staleTask,
    });

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(true);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'retry',
        reasonCode: 'DISPATCH_STALE_NO_CLAIM',
        expectedRequestedAt: staleTask.actionsDispatchRequestedAt,
      })
    );
    expect(store.reserveTaskForActionsDispatch).toHaveBeenCalledTimes(1);
    expect(github.dispatchRepositoryEvent).toHaveBeenCalledTimes(1);
  });

  it('recovers a claimed marker left behind after its lease expired and requeues', async () => {
    const claimedTask = {
      ...queuedTask,
      actionsDispatchRequestedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      actionsDispatchStatus: 'claimed' as const,
      actionsDispatchReasonCode: 'CLAIMED',
      actionsDispatchAttempts: 1,
      actionsDispatchCorrelationId: 'corr-claimed',
    };
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([claimedTask]);
    asMock(store.getTaskRowUnscoped).mockResolvedValue(claimedTask);
    asMock(store.completeTaskActionsDispatch)
      .mockResolvedValueOnce({
        ok: true,
        action: 'released',
        code: 'CLAIMED_ATTEMPT_GONE',
        task: claimedTask,
      })
      .mockResolvedValueOnce({
        ok: true,
        action: 'accepted',
        code: null,
        task: claimedTask,
      });

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(true);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'retry',
        reasonCode: 'CLAIMED_ATTEMPT_GONE',
        expectedRequestedAt: claimedTask.actionsDispatchRequestedAt,
      })
    );
    expect(github.dispatchRepositoryEvent).toHaveBeenCalledTimes(1);
  });

  it('does not release a stale claimed marker while an attempt still owns the task', async () => {
    const claimedTask = {
      ...queuedTask,
      actionsDispatchRequestedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      actionsDispatchStatus: 'claimed' as const,
      actionsDispatchAttempts: 1,
    };
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([claimedTask]);
    asMock(store.getTaskDispatchBlockers).mockResolvedValue({
      batchPaused: false,
      dependencyBlocked: false,
      activeAttemptForTask: true,
    });

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(false);
    expect(store.completeTaskActionsDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'retry' })
    );
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('does not release a marker while the task still has an active attempt', async () => {
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([staleTask]);
    asMock(store.getTaskDispatchBlockers).mockResolvedValue({
      batchPaused: false,
      dependencyBlocked: false,
      activeAttemptForTask: true,
    });

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(false);
    expect(store.completeTaskActionsDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'retry' })
    );
    expect(store.reserveTaskForActionsDispatch).not.toHaveBeenCalled();
  });

  it('stops automatically after the bounded retry budget and requires owner retry', async () => {
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([
      { ...staleTask, actionsDispatchAttempts: 5 },
    ]);

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(false);
    expect(store.completeTaskActionsDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'terminal', reasonCode: 'DISPATCH_RETRY_EXHAUSTED' })
    );
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });

  it('honours a not-yet-due retry instead of dispatching immediately', async () => {
    asMock(store.listQueuedTasksForDispatch).mockResolvedValue([
      {
        ...staleTask,
        actionsDispatchStatus: 'retry_scheduled',
        actionsDispatchNextRetryAt: new Date(Date.now() + 120_000).toISOString(),
      },
    ]);

    const result = await dispatchNextQueuedTask({ source: 'admin:overview' });

    expect(result.dispatched).toBe(false);
    expect(store.completeTaskActionsDispatch).not.toHaveBeenCalled();
    expect(github.dispatchRepositoryEvent).not.toHaveBeenCalled();
  });
});
