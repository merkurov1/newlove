/** @jest-environment node */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
  after: (callback: () => Promise<void>) => void callback(),
}));

jest.mock('@/lib/pierrot/dev/workbench/workerAuth', () => {
  class WorkerAuthError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 401, code = 'WORKER_UNAUTHORIZED') {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    WorkerAuthError,
    requireWorker: jest.fn(),
    readJsonBody: jest.fn(),
  };
});

jest.mock('@/lib/pierrot/dev/workbench/execution', () => {
  class WorkbenchExecutionError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 409) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    WorkbenchExecutionError,
    claimTaskForWorker: jest.fn(),
    completeAttempt: jest.fn(),
    describeClaimUnavailable: jest.fn(),
    failAttempt: jest.fn(),
    progressAttempt: jest.fn(),
    releaseAttempt: jest.fn(),
    startAttempt: jest.fn(),
  };
});

jest.mock('@/lib/pierrot/dev/workbench/store', () => {
  class WorkbenchUnavailableError extends Error {
    code = 'DEV_WORKBENCH_MIGRATION_REQUIRED';
  }
  return {
    WorkbenchUnavailableError,
    appendEvent: jest.fn(),
    getActiveAttemptsForWorker: jest.fn(),
    getAttempt: jest.fn(),
    getQueueSnapshot: jest.fn(),
    getWorker: jest.fn(),
    heartbeatWorker: jest.fn(),
    isWorkerId: (value: unknown) => typeof value === 'string' && value.length >= 4,
    isUuid: (value: unknown) =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    pingWorkbenchStore: jest.fn(),
    registerWorker: jest.fn(),
  };
});

jest.mock('@/lib/pierrot/dev/workbench/lifecycle', () => ({
  idleGraceSeconds: () => 120,
  keepCodespaceAwakeForActiveWork: jest.fn(),
  recordBootStatus: jest.fn(),
  recordWorkerIdle: jest.fn(),
  recordWorkerReady: jest.fn(),
  requestIdleShutdown: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/github', () => {
  class WorkbenchGitHubError extends Error {
    code: string;
    status: number | null;
    constructor(code: string, message: string, status: number | null = null) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return { WorkbenchGitHubError };
});

jest.mock('@/lib/pierrot/dev/workbench/actions', () => ({
  dispatchNextQueuedTask: jest.fn(async () => ({ dispatched: false })),
  recordActionsClaimMiss: jest.fn(async () => ({
    code: 'CLAIM_CONFLICT',
    reason: 'Claim lost a race.',
    retryable: true,
    terminal: false,
    action: 'retry_scheduled',
    retryAt: '2026-11-19T01:01:00.000Z',
    correlationId: 'corr-1',
  })),
  recordActionsClaimSuccess: jest.fn(async () => undefined),
}));

jest.mock('@/lib/pierrot/dev/workbench/finalization', () => ({
  advanceFinalization: jest.fn(async () => null),
}));

import { POST } from '../route';
import {
  dispatchNextQueuedTask,
  recordActionsClaimMiss,
  recordActionsClaimSuccess,
} from '@/lib/pierrot/dev/workbench/actions';
import {
  claimTaskForWorker,
  completeAttempt,
  describeClaimUnavailable,
  releaseAttempt,
} from '@/lib/pierrot/dev/workbench/execution';
import { advanceFinalization } from '@/lib/pierrot/dev/workbench/finalization';
import { getWorker } from '@/lib/pierrot/dev/workbench/store';
import { readJsonBody } from '@/lib/pierrot/dev/workbench/workerAuth';

const TASK_ID = '8289098f-993a-4e75-abe4-81e23caee6d0';
const claim = claimTaskForWorker as jest.Mock;
const complete = completeAttempt as jest.Mock;
const describeUnavailable = describeClaimUnavailable as jest.Mock;
const release = releaseAttempt as jest.Mock;
const worker = getWorker as jest.Mock;
const body = readJsonBody as jest.Mock;
const dispatchPump = dispatchNextQueuedTask as jest.Mock;
const finalize = advanceFinalization as jest.Mock;

function request(): Request {
  return new Request('http://localhost/api/internal/pierrot/dev/worker', { method: 'POST' });
}

beforeEach(() => {
  jest.clearAllMocks();
  body.mockResolvedValue({ action: 'claim', workerId: 'actions:123:1', taskId: TASK_ID });
  claim.mockResolvedValue(null);
  describeUnavailable.mockResolvedValue({
    code: 'CLAIM_UNAVAILABLE',
    idempotent: true,
    reason: 'No queued task was claimable.',
    taskId: TASK_ID,
    taskStatus: 'queued',
    queuePaused: false,
    queue: null,
    activeAttempt: null,
  });
});

describe('worker claim routing', () => {
  it('rejects a targeted claim from a Codespace worker', async () => {
    worker.mockResolvedValue({ id: 'codespace:test', kind: 'codespace' });

    const response = await POST(request());
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe('TARGETED_CLAIM_REQUIRES_ACTIONS_WORKER');
    expect(claim).not.toHaveBeenCalled();
  });

  it('allows the Actions runner to claim exactly its dispatched task', async () => {
    worker.mockResolvedValue({ id: 'actions:123:1', kind: 'actions' });

    await POST(request());

    expect(claim).toHaveBeenCalledWith('actions:123:1', TASK_ID);
  });

  it('keeps next-queued claims available to the manual Codespace worker', async () => {
    body.mockResolvedValue({ action: 'claim', workerId: 'codespace:test' });
    worker.mockResolvedValue({ id: 'codespace:test', kind: 'codespace' });

    await POST(request());

    expect(claim).toHaveBeenCalledWith('codespace:test', undefined);
  });

  it('returns an idempotent no-op with diagnostics when another runner owns the task', async () => {
    worker.mockResolvedValue({ id: 'actions:123:1', kind: 'actions' });
    describeUnavailable.mockResolvedValue({
      code: 'TASK_ALREADY_CLAIMED',
      idempotent: true,
      reason: 'Task is owned by worker actions:122:1 attempt 1.',
      taskId: TASK_ID,
      taskStatus: 'in_progress',
      queuePaused: false,
      queue: { queued: 0, active: 1, paused: false },
      activeAttempt: {
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        taskId: TASK_ID,
        attemptNumber: 1,
        status: 'running',
        workerId: 'actions:122:1',
        leaseExpiresAt: '2026-11-19T16:30:00.000Z',
      },
    });

    const response = await POST(request());
    const payload = (await response.json()) as {
      ok?: boolean;
      claim?: unknown;
      claimFailure?: { code?: string; idempotent?: boolean; activeAttempt?: { workerId?: string } };
    };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.claim).toBeNull();
    expect(payload.claimFailure?.code).toBe('TASK_ALREADY_CLAIMED');
    expect(payload.claimFailure?.idempotent).toBe(true);
    expect(payload.claimFailure?.activeAttempt?.workerId).toBe('actions:122:1');
    // A losing runner never releases or mutates the winning lease.
    expect(release).not.toHaveBeenCalled();
  });

  it('treats concurrent duplicate dispatches as one winner and one successful no-op', async () => {
    worker.mockResolvedValue({ id: 'actions:123:1', kind: 'actions' });
    const winningClaim = {
      task: { id: TASK_ID },
      attempt: { id: 'aaaaaaaa-1111-4111-8111-111111111111' },
    };
    claim.mockResolvedValueOnce(winningClaim).mockResolvedValueOnce(null);
    describeUnavailable.mockResolvedValue({
      code: 'TASK_ALREADY_CLAIMED',
      idempotent: true,
      reason: 'Task is already owned by another runner.',
      taskId: TASK_ID,
      taskStatus: 'in_progress',
      queuePaused: false,
      queue: null,
      activeAttempt: { workerId: 'actions:123:1', attemptNumber: 1 },
    });

    const responses = await Promise.all([POST(request()), POST(request())]);
    const payloads = await Promise.all(
      responses.map(
        (response) =>
          response.json() as Promise<{
            claim?: unknown;
            claimFailure?: { code?: string; idempotent?: boolean };
          }>
      )
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(payloads.filter((payload) => payload.claim).length).toBe(1);
    const loser = payloads.find((payload) => !payload.claim);
    expect(loser?.claimFailure).toMatchObject({
      code: 'TASK_ALREADY_CLAIMED',
      idempotent: true,
    });
    expect(release).not.toHaveBeenCalled();
  });

  it('reports a task that is no longer queued and a paused queue as idempotent no-ops', async () => {
    worker.mockResolvedValue({ id: 'actions:123:1', kind: 'actions' });
    describeUnavailable
      .mockResolvedValueOnce({
        code: 'TASK_NOT_QUEUED',
        idempotent: true,
        reason: "Task is 'review', not queued.",
        taskId: TASK_ID,
        taskStatus: 'review',
        queuePaused: false,
        queue: null,
        activeAttempt: null,
      })
      .mockResolvedValueOnce({
        code: 'QUEUE_PAUSED',
        idempotent: true,
        reason: 'The queue is paused.',
        taskId: TASK_ID,
        taskStatus: 'queued',
        queuePaused: true,
        queue: { queued: 1, active: 0, paused: true },
        activeAttempt: null,
      });

    const first = (await (await POST(request())).json()) as {
      claimFailure?: { code?: string; idempotent?: boolean; taskStatus?: string };
    };
    const second = (await (await POST(request())).json()) as {
      claimFailure?: { code?: string; idempotent?: boolean; queuePaused?: boolean };
    };

    expect(first.claimFailure).toMatchObject({
      code: 'TASK_NOT_QUEUED',
      idempotent: true,
      taskStatus: 'review',
    });
    expect(second.claimFailure).toMatchObject({
      code: 'QUEUE_PAUSED',
      idempotent: true,
      queuePaused: true,
    });
    expect(release).not.toHaveBeenCalled();
  });

  it('persists the claimed outcome for a targeted Actions claim', async () => {
    worker.mockResolvedValue({ id: 'actions:123:1', kind: 'actions' });
    claim.mockResolvedValue({
      task: { id: TASK_ID },
      attempt: { id: 'attempt-1' },
      prompt: 'prompt',
    });
    body.mockResolvedValue({
      action: 'claim',
      workerId: 'actions:123:1',
      taskId: TASK_ID,
      correlationId: 'corr-1',
      executionId: 'gha:1:1',
    });

    await POST(request());

    expect(recordActionsClaimSuccess).toHaveBeenCalledWith({
      taskId: TASK_ID,
      workerId: 'actions:123:1',
      correlationId: 'corr-1',
      executionId: 'gha:1:1',
    });
    expect(recordActionsClaimMiss).not.toHaveBeenCalled();
  });

  it('classifies a targeted claim miss and returns the diagnosis', async () => {
    worker.mockResolvedValue({ id: 'actions:123:1', kind: 'actions' });
    body.mockResolvedValue({
      action: 'claim',
      workerId: 'actions:123:1',
      taskId: TASK_ID,
      correlationId: 'corr-1',
      executionId: 'gha:1:1',
    });

    const response = await POST(request());
    const payload = (await response.json()) as { diagnosis?: { code?: string } };

    expect(recordActionsClaimMiss).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK_ID, correlationId: 'corr-1' })
    );
    expect(payload.diagnosis?.code).toBe('CLAIM_CONFLICT');
    expect(recordActionsClaimSuccess).not.toHaveBeenCalled();
  });

  it('advances the next dispatch and finalization after completion without Admin', async () => {
    complete.mockResolvedValue({ attempt: { id: 'attempt-1' }, task: { id: TASK_ID } });
    body.mockResolvedValue({
      action: 'complete',
      workerId: 'actions:123:1',
      attemptId: 'attempt-1',
      result: { summary: 'done' },
    });

    const response = await POST(request());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(dispatchPump).toHaveBeenCalledWith({ source: 'worker:complete' });
    expect(finalize).toHaveBeenCalledWith({ trigger: 'worker:complete' });
  });
});
