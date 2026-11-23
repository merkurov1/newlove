/** @jest-environment node */

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/serverAuth', () => ({
  requireAdminFromRequest: jest.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111' })),
}));

jest.mock('@/lib/rateLimit', () => ({
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('@/lib/pierrot/rateLimit', () => ({
  checkPierrotRateLimit: jest.fn(async () => null),
}));

jest.mock('@/lib/pierrot/dev/workbench/execution', () => ({
  WorkbenchExecutionError: class WorkbenchExecutionError extends Error {},
  approveTask: jest.fn(),
  enqueueTask: jest.fn(),
  acceptTask: jest.fn(),
  archiveTask: jest.fn(),
  cancelTask: jest.fn(),
  dequeueTask: jest.fn(),
  mergeTask: jest.fn(),
  rejectTask: jest.fn(),
  retryTask: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/store', () => ({
  WorkbenchUnavailableError: class WorkbenchUnavailableError extends Error {},
  appendEvent: jest.fn(async () => undefined),
  createBatch: jest.fn(),
  getBatchIdForTask: jest.fn(async () => null),
  getTaskRow: jest.fn(),
  isUuid: jest.fn(() => true),
  patchTask: jest.fn(),
  reapExpiredAttempts: jest.fn(async () => 0),
  reorderBatchItem: jest.fn(),
  reorderQueue: jest.fn(),
  setBatchItemDependency: jest.fn(),
  requestWorkerStop: jest.fn(),
  setSetting: jest.fn(),
  startBatch: jest.fn(),
  transitionTask: jest.fn(),
  updateBatchStatus: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/github', () => ({
  createCodespace: jest.fn(),
  listUserCodespaces: jest.fn(async () => []),
  WorkbenchGitHubError: class WorkbenchGitHubError extends Error {},
}));

jest.mock('@/lib/pierrot/dev/workbench/lifecycle', () => ({
  startCodespaceNow: jest.fn(),
  stopCodespaceNow: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/actions', () => ({
  ActionsDispatchError: class ActionsDispatchError extends Error {},
  dispatchNextQueuedTask: jest.fn(),
  dispatchTaskToActions: jest.fn(async () => ({
    dispatched: true,
    taskId: 'task-1',
    repository: 'newlove',
    code: null,
    reason: null,
    requestedAt: '2026-11-23T10:00:00.000Z',
  })),
  retryActionsDispatch: jest.fn(),
}));

jest.mock('@/lib/pierrot/dev/workbench/finalization', () => ({
  advanceFinalization: jest.fn(async () => null),
  retryFinalization: jest.fn(async () => null),
}));

jest.mock('@/lib/pierrot/dev/workbench/setup', () => ({
  CODESPACE_NAME_ENV: 'PIERROT_DEV_CODESPACE_NAME',
}));

jest.mock('@/lib/pierrot/dev/workbench/overview', () => ({
  getWorkbenchOverview: jest.fn(async () => ({ schemaReady: true, queue: [] })),
}));

jest.mock('@/lib/pierrot/dev/workbench/state', () => ({
  DevTransitionError: class DevTransitionError extends Error {},
}));

import { POST } from '../actions/route';
import { approveTask, enqueueTask } from '@/lib/pierrot/dev/workbench/execution';
import { dispatchTaskToActions } from '@/lib/pierrot/dev/workbench/actions';
import { getBatchIdForTask } from '@/lib/pierrot/dev/workbench/store';

const approve = approveTask as jest.Mock;
const enqueue = enqueueTask as jest.Mock;
const dispatch = dispatchTaskToActions as jest.Mock;
const batchForTask = getBatchIdForTask as jest.Mock;

function request(action: string, taskId = 'task-1') {
  return new Request('http://localhost/api/admin/pierrot/dev/workbench/actions', {
    method: 'POST',
    body: JSON.stringify({ action, taskId }),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  approve.mockResolvedValue({ id: 'task-1', status: 'ready' });
  enqueue.mockResolvedValue({ id: 'task-1', status: 'queued', assignedExecutor: 'actions' });
  batchForTask.mockResolvedValue(null);
});

describe('POST workbench action queue', () => {
  it('queues a standalone task in one canonical action and dispatches it', async () => {
    const response = await POST(request('queue'));
    const body = (await response.json()) as { ok?: boolean; overview?: unknown };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.overview).toBeTruthy();
    expect(approve).toHaveBeenCalledWith(expect.any(String), 'task-1');
    expect(enqueue).toHaveBeenCalledWith(expect.any(String), 'task-1');
    expect(dispatch).toHaveBeenCalledWith({ taskId: 'task-1', source: 'admin:queue' });
  });

  it('keeps a batch task ready so the batch owns its order', async () => {
    batchForTask.mockResolvedValueOnce('batch-1');

    const response = await POST(request('queue'));

    expect(response.status).toBe(200);
    expect(enqueue).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not queue a missing task', async () => {
    approve.mockResolvedValueOnce(null);

    const response = await POST(request('queue'));

    expect(response.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
