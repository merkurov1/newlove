/** @jest-environment node */

jest.mock('../store', () => ({
  appendEvent: jest.fn(),
  claimNextTask: jest.fn(),
  clearWorkerAttempt: jest.fn(),
  expectedBranch: jest.fn(),
  getActiveAttempt: jest.fn(),
  getAttempt: jest.fn(),
  getSetting: jest.fn(),
  getTaskExecutionMaterial: jest.fn(),
  getTaskRow: jest.fn(),
  getTaskRowUnscoped: jest.fn(),
  isUuid: jest.fn(),
  leaseExpiryIso: jest.fn(),
  listAttempts: jest.fn(),
  nextQueuePosition: jest.fn(),
  patchAttempt: jest.fn(),
  patchTask: jest.fn(),
  reapExpiredAttempts: jest.fn(),
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
import { failAttempt, releaseAttempt } from '../execution';

const attempt = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  taskId: '11111111-1111-4111-8111-111111111111',
  attemptNumber: 1,
  workerId: 'codespace:test',
  status: 'running',
};

const task = {
  id: attempt.taskId,
  status: 'in_progress',
};

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

describe('lease release', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asMock(store.getAttempt).mockResolvedValue(attempt);
    asMock(store.patchAttempt).mockResolvedValue({ ...attempt, status: 'timed_out' });
    asMock(store.getTaskRowUnscoped).mockResolvedValue(task);
    asMock(store.nextQueuePosition).mockResolvedValue(7);
    asMock(store.patchTask).mockResolvedValue({ ...task, status: 'queued' });
    asMock(store.clearWorkerAttempt).mockResolvedValue(undefined);
    asMock(store.appendEvent).mockResolvedValue(undefined);
  });

  it('keeps history, releases the lease and requeues the task', async () => {
    await expect(releaseAttempt(attempt.workerId, attempt.id, 'Worker stopped')).resolves.toBe(
      true
    );

    expect(store.patchAttempt).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        status: 'timed_out',
        error_code: 'WORKER_STOPPED',
      })
    );
    expect(store.clearWorkerAttempt).toHaveBeenCalledWith(attempt.workerId, attempt.id);
    expect(store.patchTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ status: 'failed' })
    );
    expect(store.patchTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ status: 'queued', queue_position: 7 })
    );
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'attempt.released' })
    );
  });

  it('does not release an attempt owned by another worker', async () => {
    await expect(releaseAttempt('codespace:other', attempt.id)).resolves.toBe(false);
    expect(store.patchAttempt).not.toHaveBeenCalled();
  });

  it('does not release a terminal attempt', async () => {
    asMock(store.getAttempt).mockResolvedValue({ ...attempt, status: 'completed' });
    await expect(releaseAttempt(attempt.workerId, attempt.id)).resolves.toBe(false);
    expect(store.patchAttempt).not.toHaveBeenCalled();
  });
});

describe('failed execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asMock(store.getAttempt).mockResolvedValue(attempt);
    asMock(store.patchAttempt).mockResolvedValue({ ...attempt, status: 'failed' });
    asMock(store.getTaskRowUnscoped).mockResolvedValue(task);
    asMock(store.patchTask).mockResolvedValue({ ...task, status: 'failed' });
    asMock(store.clearWorkerAttempt).mockResolvedValue(undefined);
    asMock(store.appendEvent).mockResolvedValue(undefined);
  });

  it('records a terminal failure and frees the worker slot', async () => {
    await expect(
      failAttempt({
        workerId: attempt.workerId,
        attemptId: attempt.id,
        errorCode: 'OPENCODE_FAILED',
        errorMessage: 'OpenCode exited with code 1.',
        exitCode: 1,
      })
    ).resolves.toMatchObject({ status: 'failed' });

    expect(store.patchAttempt).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        status: 'failed',
        error_code: 'OPENCODE_FAILED',
        exit_code: 1,
      }),
      ['claimed', 'running']
    );
    expect(store.clearWorkerAttempt).toHaveBeenCalledWith(attempt.workerId, attempt.id);
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'attempt.failed' })
    );
  });
});
