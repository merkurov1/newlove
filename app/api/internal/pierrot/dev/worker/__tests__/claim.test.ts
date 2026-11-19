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
}));

import { POST } from '../route';
import { claimTaskForWorker } from '@/lib/pierrot/dev/workbench/execution';
import { getWorker } from '@/lib/pierrot/dev/workbench/store';
import { readJsonBody } from '@/lib/pierrot/dev/workbench/workerAuth';

const TASK_ID = '8289098f-993a-4e75-abe4-81e23caee6d0';
const claim = claimTaskForWorker as jest.Mock;
const worker = getWorker as jest.Mock;
const body = readJsonBody as jest.Mock;

function request(): Request {
  return new Request('http://localhost/api/internal/pierrot/dev/worker', { method: 'POST' });
}

beforeEach(() => {
  jest.clearAllMocks();
  body.mockResolvedValue({ action: 'claim', workerId: 'actions:123:1', taskId: TASK_ID });
  claim.mockResolvedValue(null);
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
});
