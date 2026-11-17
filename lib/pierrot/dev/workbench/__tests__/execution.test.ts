/** @jest-environment node */

jest.mock('../store', () => ({
  appendEvent: jest.fn(),
  claimNextTask: jest.fn(),
  clearWorkerAttempt: jest.fn(),
  expectedBranch: jest.fn(),
  getActiveAttempt: jest.fn(),
  getAttempt: jest.fn(),
  getBatchIdForTask: jest.fn(async () => null),
  getSetting: jest.fn(async () => ({})),
  getTaskExecutionMaterial: jest.fn(),
  getTaskRow: jest.fn(),
  getTaskRowUnscoped: jest.fn(),
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
import {
  completeAttempt,
  failAttempt,
  progressAttempt,
  releaseAttempt,
  retryTask,
} from '../execution';

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

describe('execution progress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asMock(store.getAttempt).mockResolvedValue(attempt);
    asMock(store.patchAttempt).mockResolvedValue({ ...attempt, status: 'running' });
    asMock(store.leaseExpiryIso).mockReturnValue('2026-01-01T00:30:00.000Z');
    asMock(store.touchWorkerHeartbeat).mockResolvedValue(undefined);
    asMock(store.appendEvent).mockResolvedValue(undefined);
  });

  it('renews the attempt lease and the worker liveness timestamp', async () => {
    await progressAttempt({
      workerId: attempt.workerId,
      attemptId: attempt.id,
      stage: 'opencode_running',
    });

    expect(store.patchAttempt).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        progress_stage: 'opencode_running',
        heartbeat_at: expect.any(String),
        lease_expires_at: expect.any(String),
      }),
      ['claimed', 'running']
    );
    // The worker main loop is blocked during a long OpenCode call; progress is
    // the only signal that keeps its heartbeat fresh.
    expect(store.touchWorkerHeartbeat).toHaveBeenCalledWith(attempt.workerId);
  });
});

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

  it('keeps model usage and Codespaces runtime for a failed attempt', async () => {
    asMock(store.getSetting).mockResolvedValue({ machine: 'basicLinux32gb' });

    await failAttempt({
      workerId: attempt.workerId,
      attemptId: attempt.id,
      errorCode: 'PUSH_FAILED',
      errorMessage: 'git push failed',
      usage: { costUsd: 0.2, inputTokens: 100, outputTokens: 20, steps: 1 },
      runtimeMs: 60 * 60 * 1000,
      modelStarted: true,
      headSha: 'a'.repeat(40),
    });

    const patch = asMock(store.patchAttempt).mock.calls[0][1] as {
      head_sha: string;
      verification: {
        cost: {
          model: { costUsd: number | null };
          codespace: { estimatedUsd: number | null };
          totalUsd: number | null;
        };
        failure: { modelStarted: boolean; runtimeMs: number };
      };
    };
    expect(patch.head_sha).toBe('a'.repeat(40));
    expect(patch.verification.cost.model.costUsd).toBe(0.2);
    expect(patch.verification.cost.codespace.estimatedUsd).toBe(0.18);
    expect(patch.verification.cost.totalUsd).toBe(0.38);
    expect(patch.verification.failure).toMatchObject({
      modelStarted: true,
      runtimeMs: 3_600_000,
    });
  });

  it('does not change cost or completion when a terminal failure is delivered twice', async () => {
    asMock(store.getAttempt).mockResolvedValue({ ...attempt, status: 'failed' });

    await failAttempt({
      workerId: attempt.workerId,
      attemptId: attempt.id,
      errorCode: 'PUSH_FAILED',
      errorMessage: 'git push failed',
    });

    expect(store.patchAttempt).not.toHaveBeenCalled();
    expect(store.clearWorkerAttempt).not.toHaveBeenCalled();
  });

  it('does not duplicate cost when a completed outbox entry is delivered twice', async () => {
    asMock(store.getAttempt).mockResolvedValue({
      ...attempt,
      status: 'completed',
      headSha: null,
      changedFiles: [],
    });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({ ...task, pullRequests: [] });

    await completeAttempt(attempt.workerId, attempt.id, { exitCode: 0 });

    expect(store.patchAttempt).not.toHaveBeenCalled();
    expect(store.patchTask).not.toHaveBeenCalled();
  });
});

describe('retry queueing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    asMock(store.getTaskRow).mockResolvedValue(task);
    asMock(store.getActiveAttempt).mockResolvedValue(null);
    asMock(store.nextQueuePosition).mockResolvedValue(4);
    asMock(store.transitionTask).mockResolvedValue({ ...task, status: 'queued' });
  });

  it('uses the schema-compatible not_run value instead of null', async () => {
    await retryTask('11111111-1111-4111-8111-111111111111', task.id);

    expect(store.transitionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        to: 'queued',
        patch: expect.objectContaining({
          verification_status: 'not_run',
          result_commit: null,
          pull_requests: [],
        }),
      })
    );
  });
});
