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
  getQueueSnapshot: jest.fn(),
  getSetting: jest.fn(async () => ({})),
  getTaskExecutionMaterial: jest.fn(),
  getTaskRow: jest.fn(),
  getTaskRowUnscoped: jest.fn(),
  getWorker: jest.fn(),
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
import {
  attemptExecutor,
  claimTaskForWorker,
  completeAttempt,
  describeClaimUnavailable,
  failAttempt,
  progressAttempt,
  releaseAttempt,
  retryTask,
  startAttempt,
} from '../execution';
import { buildAttemptCost } from '../costs';

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
      }),
      ['claimed', 'running']
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
    expect(store.patchTask).not.toHaveBeenCalled();
    expect(store.clearWorkerAttempt).not.toHaveBeenCalled();
    expect(store.appendEvent).not.toHaveBeenCalled();
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

  it('resumes a retry from the partial commit preserved by the worker', async () => {
    const preserved = 'c'.repeat(40);
    await failAttempt({
      workerId: attempt.workerId,
      attemptId: attempt.id,
      errorCode: 'EXECUTION_TIMEOUT',
      errorMessage: 'OpenCode exceeded the limit.',
      timedOut: true,
      headSha: preserved,
    });

    expect(store.patchTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({ status: 'failed', base_commit: preserved })
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

  it('requeues a report-missing failure once with a fresh queue position and timestamp', async () => {
    asMock(store.getTaskRow).mockResolvedValue({
      ...task,
      status: 'failed' as const,
      lastErrorCode: 'OPENCODE_REPORT_MISSING',
      attemptCount: 1,
    });

    await retryTask('11111111-1111-4111-8111-111111111111', task.id);

    expect(store.transitionTask).toHaveBeenCalledTimes(1);
    expect(store.transitionTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        to: 'queued',
        patch: expect.objectContaining({
          queue_position: 4,
          queued_at: expect.any(String),
          last_error_code: null,
          last_error_message: null,
        }),
      })
    );
    expect(store.clearTaskActionsDispatch).toHaveBeenCalledTimes(1);
  });

  it('does not re-enqueue or reset a task that is already queued', async () => {
    const queued = { ...task, status: 'queued' as const, queuePosition: 2 };
    asMock(store.getTaskRow).mockResolvedValue(queued);

    await expect(retryTask('11111111-1111-4111-8111-111111111111', task.id)).resolves.toBe(queued);

    expect(store.nextQueuePosition).not.toHaveBeenCalled();
    expect(store.transitionTask).not.toHaveBeenCalled();
    expect(store.clearTaskActionsDispatch).not.toHaveBeenCalled();
  });

  it('treats a concurrent retry that already queued the task as the same success', async () => {
    const queued = { ...task, status: 'queued' as const, queuePosition: 4 };
    asMock(store.getTaskRow)
      .mockResolvedValueOnce({ ...task, status: 'failed' as const })
      .mockResolvedValueOnce(queued);
    asMock(store.transitionTask).mockResolvedValue(null);

    await expect(retryTask('11111111-1111-4111-8111-111111111111', task.id)).resolves.toBe(queued);

    expect(store.transitionTask).toHaveBeenCalledTimes(1);
    expect(store.clearTaskActionsDispatch).not.toHaveBeenCalled();
  });
});

describe('targeted Actions claim', () => {
  const claim = {
    task: { ...task, id: attempt.taskId, repository: 'newlove', baseRef: 'main', baseCommit: null },
    attempt: { ...attempt, status: 'claimed' as const },
    prompt: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    asMock(store.claimTask).mockResolvedValue(claim as never);
    asMock(store.claimNextTask).mockResolvedValue(claim as never);
    asMock(store.getTaskExecutionMaterial).mockResolvedValue({ id: attempt.taskId } as never);
    asMock(store.appendEvent).mockResolvedValue(undefined);
  });

  it('claims exactly the dispatched task through the targeted RPC', async () => {
    const result = await claimTaskForWorker(attempt.workerId, attempt.taskId);

    expect(store.claimTask).toHaveBeenCalledWith(attempt.workerId, attempt.taskId);
    expect(store.claimNextTask).not.toHaveBeenCalled();
    expect(result?.attempt.id).toBe(attempt.id);
  });

  it('keeps the next-queued claim for a manual dispatch without a task id', async () => {
    await claimTaskForWorker(attempt.workerId);

    expect(store.claimNextTask).toHaveBeenCalledWith(attempt.workerId);
    expect(store.claimTask).not.toHaveBeenCalled();
  });

  it('fails closed when the targeted claim migration is missing', async () => {
    asMock(store.claimTask).mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'TARGETED_CLAIM_RPC_MISSING' })
    );

    await expect(claimTaskForWorker(attempt.workerId, attempt.taskId)).rejects.toMatchObject({
      code: 'TARGETED_CLAIM_UNAVAILABLE',
      status: 503,
    });
    expect(store.getTaskExecutionMaterial).not.toHaveBeenCalled();
  });

  it('does not turn a claim RPC/database failure into a no-task success', async () => {
    asMock(store.claimTask).mockRejectedValue(
      Object.assign(new Error('Supabase unavailable'), { code: 'DEV_CLAIM_RPC_FAILED' })
    );

    await expect(claimTaskForWorker(attempt.workerId, attempt.taskId)).rejects.toMatchObject({
      code: 'DEV_CLAIM_RPC_FAILED',
    });
  });

  it('records the GitHub run id as provenance without changing the attempt lock id', async () => {
    asMock(store.getAttempt).mockResolvedValue({ ...attempt, status: 'claimed' });
    asMock(store.patchAttempt).mockResolvedValue({ ...attempt, status: 'running' });

    await startAttempt(attempt.workerId, attempt.id, 'gha:12345:1');

    expect(store.patchAttempt).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        verification: expect.objectContaining({ executionId: 'gha:12345:1' }),
      }),
      ['claimed']
    );
    expect(store.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'attempt.running',
        payload: { executionId: 'gha:12345:1' },
      })
    );
  });
});

describe('claim race diagnostics', () => {
  const actionsWorkerId = 'actions:123:1';
  const queue = { queued: 1, active: 0, paused: false };

  beforeEach(() => {
    jest.clearAllMocks();
    asMock(store.getQueueSnapshot).mockResolvedValue(queue);
    asMock(store.getWorker).mockResolvedValue({
      id: actionsWorkerId,
      kind: 'actions',
      status: 'idle',
      stopRequested: false,
    });
    asMock(store.getActiveAttempt).mockResolvedValue(null);
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...task,
      status: 'queued',
      queuePosition: 1,
      blockedReason: null,
      assignedExecutor: 'actions',
    });
  });

  it('explains an already-claimed task without touching the winning lease', async () => {
    asMock(store.getActiveAttempt).mockResolvedValue({
      ...attempt,
      workerId: 'actions:122:1',
      status: 'running',
      leaseExpiresAt: '2026-11-19T16:30:00.000Z',
    });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...task,
      status: 'in_progress',
      queuePosition: null,
      blockedReason: null,
      assignedExecutor: 'actions',
    });

    const result = await describeClaimUnavailable(actionsWorkerId, attempt.taskId);

    expect(result).toMatchObject({
      code: 'TASK_ALREADY_CLAIMED',
      idempotent: true,
      taskStatus: 'in_progress',
    });
    expect(result.activeAttempt).toMatchObject({
      workerId: 'actions:122:1',
      attemptNumber: 1,
      status: 'running',
    });
    expect(store.patchAttempt).not.toHaveBeenCalled();
    expect(store.patchTask).not.toHaveBeenCalled();
    expect(store.clearWorkerAttempt).not.toHaveBeenCalled();
    expect(store.appendEvent).not.toHaveBeenCalled();
  });

  it('reports a task that left the queue and a paused queue as idempotent', async () => {
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...task,
      status: 'review',
      queuePosition: null,
      blockedReason: null,
      assignedExecutor: 'actions',
    });

    const notQueued = await describeClaimUnavailable(actionsWorkerId, attempt.taskId);
    expect(notQueued).toMatchObject({
      code: 'TASK_NOT_QUEUED',
      idempotent: true,
      taskStatus: 'review',
    });

    asMock(store.getQueueSnapshot).mockResolvedValue({ queued: 1, active: 0, paused: true });
    asMock(store.getTaskRowUnscoped).mockResolvedValue({
      ...task,
      status: 'queued',
      queuePosition: 1,
      blockedReason: null,
      assignedExecutor: 'actions',
    });
    const paused = await describeClaimUnavailable(actionsWorkerId, attempt.taskId);
    expect(paused).toMatchObject({ code: 'QUEUE_PAUSED', idempotent: true, queuePaused: true });
  });

  it('keeps an unclaimable runner a visible failure rather than a no-op', async () => {
    asMock(store.getWorker).mockResolvedValue(null);

    const result = await describeClaimUnavailable(actionsWorkerId, attempt.taskId);

    expect(result).toMatchObject({ code: 'WORKER_NOT_CLAIMABLE', idempotent: false });
  });
});

describe('attempt executor provenance', () => {
  it('recognises an Actions worker id and never charges Codespaces compute', () => {
    const actionsAttempt = {
      ...attempt,
      workerId: 'actions:12345:2',
    } as never;
    expect(attemptExecutor(actionsAttempt)).toBe('actions');

    const cost = buildAttemptCost({
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.25, steps: 1 },
      machine: 'standardLinux32gb',
      runtimeMs: 60 * 60 * 1000,
      executor: attemptExecutor(actionsAttempt),
    });

    expect(cost.codespace.machine).toBeNull();
    expect(cost.codespace.runtimeMs).toBeNull();
    expect(cost.codespace.estimatedUsd).toBeNull();
    expect(cost.codespace.provenance).toBe('not-applicable:github-actions-hosted-runner');
    expect(cost.totalUsd).toBe(0.25);
  });

  it('uses the stored executor marker for legacy attempts with no worker id', () => {
    expect(
      attemptExecutor({
        ...attempt,
        workerId: null,
        verification: { executor: 'github-actions' },
      } as never)
    ).toBe('actions');
  });
});
