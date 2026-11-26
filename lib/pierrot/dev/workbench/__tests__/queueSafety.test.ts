/** @jest-environment node */

jest.mock('../store', () => ({
  appendEvent: jest.fn(),
  claimNextTask: jest.fn(),
  claimTask: jest.fn(),
  clearTaskActionsDispatch: jest.fn(async () => undefined),
  clearWorkerAttempt: jest.fn(),
  expectedBranch: jest.fn(),
  getActiveAttempt: jest.fn(),
  getAttempt: jest.fn(),
  getBatchIdForTask: jest.fn(async () => null),
  getSetting: jest.fn(async () => ({})),
  getTaskExecutionMaterial: jest.fn(),
  getTaskRow: jest.fn(),
  getTaskRowUnscoped: jest.fn(),
  isExecutionRetrySchemaReady: jest.fn(async () => true),
  isUuid: jest.fn(),
  leaseExpiryIso: jest.fn(),
  listAttempts: jest.fn(),
  maybeCompleteBatch: jest.fn(),
  nextQueuePosition: jest.fn(),
  patchAttempt: jest.fn(),
  patchTask: jest.fn(),
  reapExpiredAttempts: jest.fn(),
  recordTaskCostEstimate: jest.fn(async () => ({
    total: { minUsd: null, expectedUsd: null, maxUsd: null },
    confidence: 'low',
  })),
  setQueueOptOut: jest.fn(),
  touchWorkerHeartbeat: jest.fn(),
  transitionTask: jest.fn(),
}));

jest.mock('../../tasks', () => ({
  attachDevTaskResult: jest.fn(),
  validateDevTaskCompletion: jest.fn(),
}));

jest.mock('../../repositories', () => ({
  resolveDevRepository: jest.fn(() => ({ defaultBranch: 'main' })),
}));

jest.mock('../prompt', () => ({ buildExecutionPrompt: jest.fn() }));
jest.mock('../evidence', () => ({ collectAttemptEvidence: jest.fn() }));
jest.mock('../github', () => ({
  createPullRequestForAttempt: jest.fn(),
  getPullRequestStatus: jest.fn(),
  getVercelDeploymentStatus: jest.fn(),
  mergeVerifiedPullRequest: jest.fn(),
}));

import * as store from '../store';
import { approveTask, dequeueTask, enqueueTask } from '../execution';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

function task(status: string, queuePosition: number | null = null) {
  return {
    id: TASK_ID,
    title: 'Task',
    objective: 'Do the work',
    repository: 'newlove',
    baseRef: 'main',
    status,
    priority: 0,
    queuePosition,
    queuedAt: queuePosition === null ? null : '2026-11-19T00:00:00.000Z',
    attemptCount: 0,
    acceptanceCriteria: ['The task result is visible in the workbench'],
    verificationStatus: null,
    blockedReason: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    resultCommit: null,
    resultNotes: '',
    pullRequests: [],
    updatedAt: '2026-11-19T00:00:00.000Z',
    createdAt: '2026-11-19T00:00:00.000Z',
  };
}

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(store.appendEvent).mockResolvedValue(undefined);
  asMock(store.getBatchIdForTask).mockResolvedValue(null);
  asMock(store.nextQueuePosition).mockResolvedValue(4);
  asMock(store.transitionTask).mockResolvedValue(null);
  asMock(store.patchTask).mockResolvedValue(null);
});

describe('idempotent owner actions', () => {
  it('does not approve or re-enqueue a task that is already queued', async () => {
    const queued = task('queued', 3);
    asMock(store.getTaskRow).mockResolvedValue(queued);

    await expect(approveTask(USER_ID, TASK_ID)).resolves.toBe(queued);

    expect(store.transitionTask).not.toHaveBeenCalled();
    expect(store.setQueueOptOut).not.toHaveBeenCalled();
  });

  it('does not enqueue a task that is already queued', async () => {
    const queued = task('queued', 3);
    asMock(store.getTaskRow).mockResolvedValue(queued);

    await expect(enqueueTask(USER_ID, TASK_ID)).resolves.toBe(queued);

    expect(store.nextQueuePosition).not.toHaveBeenCalled();
    expect(store.recordTaskCostEstimate).not.toHaveBeenCalled();
    expect(store.transitionTask).not.toHaveBeenCalled();
  });

  it('treats a repeated dequeue of the same task as a no-op', async () => {
    const ready = task('ready');
    asMock(store.getTaskRow).mockResolvedValue(ready);

    await expect(dequeueTask(USER_ID, TASK_ID)).resolves.toBe(ready);

    expect(store.transitionTask).not.toHaveBeenCalled();
    expect(store.setQueueOptOut).toHaveBeenCalledWith(TASK_ID, true);
  });

  it('does not overwrite a task when a worker wins the dequeue/claim race', async () => {
    asMock(store.getTaskRow)
      .mockResolvedValueOnce(task('queued', 3))
      .mockResolvedValueOnce(task('in_progress', 3));
    asMock(store.transitionTask).mockResolvedValue(null);

    await expect(dequeueTask(USER_ID, TASK_ID)).rejects.toMatchObject({
      code: 'DEV_TASK_ACTIVE',
      status: 409,
    });

    expect(store.patchTask).not.toHaveBeenCalled();
    expect(store.setQueueOptOut).not.toHaveBeenCalled();
  });

  it('recovers idempotently when concurrent enqueue lost the compare-and-set', async () => {
    const queued = task('queued', 3);
    asMock(store.getTaskRow).mockResolvedValueOnce(task('ready')).mockResolvedValueOnce(queued);
    asMock(store.transitionTask).mockResolvedValue(null);

    await expect(enqueueTask(USER_ID, TASK_ID)).resolves.toBe(queued);
    expect(store.transitionTask).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, to: 'queued' })
    );
  });
});
